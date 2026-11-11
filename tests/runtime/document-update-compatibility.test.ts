import { describe, expect, it } from 'vitest';
import { createPersistenceDocumentStore, type SynCloudOSDocumentStoreLock } from '../../src/SynCloudOS/DocumentStore/PersistenceDocumentStore';
import { SynCloudOSDocumentStoreUnsupportedSchemaError } from '../../src/SynCloudOS/DocumentStore/documentStoreErrors';
import { createPersistence } from '../../src/SynCloudOS/Persistence/Persistence';
import { DocumentSchemaError, DocumentTypeRegistry, InMemoryDocumentRecoveryStore, canonicalDocumentContentHash, type DocumentType } from '../../src/SynCloudOS/Documents';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear() };
}
const kind = { kind: 'generated.compatibility-note', displayName: 'Generated note', version: 1 };
const draft = (id: string) => ({ id, kind: kind.kind, title: 'Generated only', body: { schemaVersion: 1, text: 'Preserve generated work' }, publishState: 'draft' as const });
const future = { schemaVersion: 99, savedAt: '2026-11-03T00:00:00.000Z', futureData: ['generated-do-not-overwrite'] };
function fixture(locked = false) {
  const storage = memoryStorage();
  const persistence = createPersistence({ runtimeId: 'generated-compatibility' as never, storage, namespace: 'generated-compatibility' });
  const lock: SynCloudOSDocumentStoreLock = { request: async (_name, _options, callback) => callback() };
  const store = createPersistenceDocumentStore({ persistence, kinds: [kind], ...(locked ? { conditionalWriteLock: lock } : {}) });
  return { storage, persistence, store };
}

describe('actual document update compatibility', () => {
  it('refuses a future schema written after an unlocked reader started without changing either copy', async () => {
    const { store, persistence, storage } = fixture(); await store.saveDraft(draft('original'));
    persistence.setPreference('documentStore:v1', future);
    const raw = storage.getItem(storage.key(0)!);
    await expect(store.saveDraft(draft('must-not-appear'))).rejects.toBeInstanceOf(SynCloudOSDocumentStoreUnsupportedSchemaError);
    expect(storage.getItem(storage.key(0)!)).toBe(raw);
    expect((await store.listDrafts()).map(value => value.id)).toEqual(['original']);
  });

  it('refuses a future schema arriving during an unlocked mutation before publication', async () => {
    const { store, persistence, storage } = fixture(); await store.saveDraft(draft('original'));
    let installed = false;
    const saving = store.saveDraft(draft('must-not-appear'));
    queueMicrotask(() => { persistence.setPreference('documentStore:v1', future); installed = true; });
    await expect(saving).rejects.toBeInstanceOf(SynCloudOSDocumentStoreUnsupportedSchemaError);
    expect(installed).toBe(true);
    expect(JSON.parse(storage.getItem(storage.key(0)!)!)).toEqual(future);
    expect((await store.listDrafts()).map(value => value.id)).toEqual(['original']);
  });

  it('refuses future schema replacement through live kind registration', async () => {
    const { store, persistence, storage } = fixture(); await store.saveDraft(draft('original'));
    persistence.setPreference('documentStore:v1', future);
    const raw = storage.getItem(storage.key(0)!);
    expect(() => store.registerKind({ kind: 'generated.new', displayName: 'Generated new', version: 1 })).toThrow(SynCloudOSDocumentStoreUnsupportedSchemaError);
    expect(storage.getItem(storage.key(0)!)).toBe(raw); expect(store.getKind('generated.new')).toBeNull();
  });

  it('retains the existing locked future schema refusal', async () => {
    const { store, persistence, storage } = fixture(true); await store.saveDraft(draft('original'));
    persistence.setPreference('documentStore:v1', future);
    const raw = storage.getItem(storage.key(0)!);
    await expect(store.saveDraft(draft('must-not-appear'))).rejects.toBeInstanceOf(SynCloudOSDocumentStoreUnsupportedSchemaError);
    expect(storage.getItem(storage.key(0)!)).toBe(raw);
  });

  it('migrates stored type content in memory and refuses an older reader after an explicit newer write', async () => {
    const { store, persistence, storage } = fixture(); const original = await store.saveDraft(draft('typed'));
    const rawBefore = storage.getItem(storage.key(0)!);
    const old = new DocumentTypeRegistry(), current = new DocumentTypeRegistry(); old.register(type(1)); current.register(type(2));
    const model = current.decodeVersioned<{ text: string }, Payload>(typeId, original.body, 1);
    expect(model).toEqual({ text: 'Preserve generated work' }); expect(storage.getItem(storage.key(0)!)).toBe(rawBefore);
    const serialized = type(2).write(model, { typeId, schemaVersion: 2 });
    await store.saveDraft({ ...draft('typed'), body: serialized });
    const cold = createPersistenceDocumentStore({ persistence, kinds: [kind] });
    const restored = (await cold.getDraft('typed'))!; const rawAfter = storage.getItem(storage.key(0)!);
    expect(current.decodeVersioned(typeId, restored.body, 2)).toEqual(model);
    expect(() => old.decodeVersioned(typeId, restored.body, 2)).toThrow(DocumentSchemaError);
    expect(storage.getItem(storage.key(0)!)).toBe(rawAfter); expect(rawAfter).not.toBe(rawBefore);
    // Store envelope and content type versions are independent.
    expect(JSON.parse(rawAfter!).schemaVersion).toBe(2);
  });

  it('keeps recovery envelope, content type and CAS versions independent during migration review', async () => {
    const recovery = new InMemoryDocumentRecoveryStore(), registry = new DocumentTypeRegistry(); registry.register(type(2));
    const serialized = { schemaVersion: 1, text: 'Generated recovery' };
    const record = await recovery.write({ schemaVersion: 1, recoveryId: 'generated-recovery', documentId: 'generated', typeId,
      typeSchemaVersion: 1, location: null, baseVersion: null, dirtyRevision: 4, serializedContent: serialized,
      contentHash: canonicalDocumentContentHash(serialized), capturedAt: '2026-11-03T00:00:00.000Z' }, null);
    const before = JSON.stringify(await recovery.read(record.recoveryId));
    expect(registry.decodeVersioned(typeId, record.serializedContent, record.typeSchemaVersion)).toEqual({ text: 'Generated recovery' });
    expect(JSON.stringify(await recovery.read(record.recoveryId))).toBe(before);
    const { recoveryVersion, ...input } = record;
    const next = await recovery.write({ ...input, dirtyRevision: 5 }, recoveryVersion);
    expect(next).toMatchObject({ schemaVersion: 1, typeSchemaVersion: 1, recoveryVersion: 2 });
    await expect(recovery.remove(record.recoveryId, recoveryVersion)).rejects.toMatchObject({ code: 'document-recovery-version-conflict' });
    expect((await recovery.read(record.recoveryId))?.serializedContent).toEqual(serialized);
  });
});

type Payload = { schemaVersion: number; text?: string; body?: string };
const typeId = 'com.example.generated-compatibility';
function type(version: 1 | 2): DocumentType<{ text: string }, Payload> {
  return { id: typeId, displayName: 'Generated compatibility', schemaVersion: version, extensions: ['generatedcompat'],
    mimeTypes: ['application/vnd.example.generated-compatibility+json'], capabilities: {}, autosave: 'disabled',
    create: () => ({ text: '' }), read: value => ({ text: (version === 1 ? value.text : value.body)! }),
    write: value => version === 1 ? { schemaVersion: 1, text: value.text } : { schemaVersion: 2, body: value.text },
    validate: (value): value is Payload => !!value && typeof value === 'object' && (value as Payload).schemaVersion === version && typeof (version === 1 ? (value as Payload).text : (value as Payload).body) === 'string',
    ...(version === 2 ? { migrations: { 1: (value: Payload) => ({ schemaVersion: 2, body: value.text }) } } : {}) };
}
