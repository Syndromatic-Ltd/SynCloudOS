import { describe, expect, it } from 'vitest';
import { createPersistenceDocumentStore, observeDocumentStorePersistence, type SynCloudOSDocumentStoreLock } from '../../src/SynCloudOS/DocumentStore/PersistenceDocumentStore';
import { createPersistence } from '../../src/SynCloudOS/Persistence/Persistence';
import type { SynCloudOSDocumentStoreAdapter } from '../../src/SynCloudOS/DocumentStore/documentStoreTypes';

function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
const kind = { kind: 'observation.note', displayName: 'Generated note', version: 1 };
function fixture(lock?: SynCloudOSDocumentStoreLock) {
  return createPersistenceDocumentStore({ persistence: createPersistence({ runtimeId: 'runtime:observation' as never, storage: null }), kinds: [kind], conditionalWriteLock: lock });
}
const draft = (id: string) => ({ id, kind: kind.kind, title: 'Generated fixture', body: { text: 'generated' }, publishState: 'draft' as const });

describe('canonical persistence work observations', () => {
  it('reports queued work synchronously and holds cancelled work until actual settlement', async () => {
    const held = gate();
    const store = fixture({ request: async (_name, _options, callback) => { await held.promise; return callback(); } });
    const source = observeDocumentStorePersistence(store)!;
    const abort = new AbortController();
    const a = store.saveDraft(draft('first'));
    const b = store.saveDraft(draft('second'), undefined, { signal: abort.signal });
    const rejected = expect(b).rejects.toBeDefined();
    expect(source.getSnapshot().pending).toBe(2);
    abort.abort(); await Promise.resolve();
    expect(source.getSnapshot().pending).toBe(2);
    held.resolve(); await a; await rejected;
    expect(source.getSnapshot()).toMatchObject({ pending: 0, ended: false });
  });
  it('retains outstanding work after disposal and notifies until it actually ends', async () => {
    const held = gate();
    const store = fixture({ request: async (_name, _options, callback) => { await held.promise; return callback(); } });
    const source = observeDocumentStorePersistence(store)!;
    const snapshots: unknown[] = []; source.subscribe(() => snapshots.push(source.getSnapshot()));
    const write = store.saveDraft(draft('disposed')); store.dispose();
    expect(source.getSnapshot()).toMatchObject({ pending: 1, ended: true });
    held.resolve(); await write;
    expect(source.getSnapshot()).toMatchObject({ pending: 0, ended: true });
    expect(snapshots.length).toBe(3);
    expect(Object.keys(source.getSnapshot()).sort()).toEqual(['ended', 'pending', 'revision']);
    expect(Object.isFrozen(source.getSnapshot())).toBe(true);
  });
  it('settles failures and keeps observer exceptions out of mutation results', async () => {
    const store = fixture({ request: async () => { throw new Error('Generated lock rejection'); } });
    const source = observeDocumentStorePersistence(store)!;
    source.subscribe(() => { throw new Error('Generated observer rejection'); });
    await expect(store.saveDraft(draft('failure'))).rejects.toThrow('Generated lock rejection');
    expect(source.getSnapshot().pending).toBe(0);
  });
  it('establishes queue ordering before a reentrant observer starts another mutation', async () => {
    const store = fixture(); const source = observeDocumentStorePersistence(store)!;
    let nested: Promise<unknown> | undefined; let started = false;
    source.subscribe(() => { if (!started && source.getSnapshot().pending) { started = true; nested = store.saveDraft(draft('nested')); } });
    const first = store.saveDraft(draft('first'));
    expect(source.getSnapshot().pending).toBe(2);
    await first; await nested;
    expect(source.getSnapshot().pending).toBe(0);
    expect((await store.listDrafts()).map(d => d.id).sort()).toEqual(['first', 'nested']);
  });
  it('does not claim coverage for an unknown/custom adapter', () => {
    expect(observeDocumentStorePersistence({} as SynCloudOSDocumentStoreAdapter)).toBeNull();
  });
});
