import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentController, InMemoryDocumentAdapter, InMemoryDocumentRecoveryStore } from '../../src/SynCloudOS/Documents';
import { documentAdoptionAuthority } from '../../src/SynCloudOS/Documents/documentAdoptionAuthority';
import { createDocumentTestDependencies } from '../fixtures/documentTestDependencies';
import { noteType } from '../fixtures/noteDocumentType';
import { AutosaveScheduler } from '../../src/SynCloudOS/Documents/AutosaveScheduler';
import { DocumentActivityObservations } from '../../src/SynCloudOS/Documents/DocumentActivityObservations';

const cleanups: (() => Promise<void>)[] = [];
const deferred = <T = void>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks(); });
function fixture(options: Parameters<typeof createDocumentTestDependencies>[0] = {}) {
  const dependencies = createDocumentTestDependencies(options), controller = new DocumentController(dependencies);
  const adapter = new InMemoryDocumentAdapter(dependencies.environment);
  controller.registerType(noteType); controller.registerAdapter(adapter);
  cleanups.push(async () => { for (const doc of controller.openDocuments) await doc.markClosed(documentAdoptionAuthority); await dependencies.cleanup(); });
  return { controller, adapter, dependencies };
}
const location = { kind: 'memory', namespace: 'generated-observation', key: 'note' } as const;
const resourceLifecycle = (dispose: () => Promise<void>) => ({
  prepareModel: async () => ({ release() {} }),
  stageChange: () => ({ commit() {}, rollback() {}, release() {} }), dispose,
});

describe('document-owner readiness activity', () => {
  it('observes pre-publication admission until a noncooperative read settles after cancellation', async () => {
    const { controller, adapter } = fixture(), gate = deferred<null>(), caller = new AbortController();
    vi.spyOn(adapter, 'read').mockImplementationOnce(() => gate.promise);
    cleanups.push(async () => { gate.resolve(null); await outcome; });
    const opening = controller.newDocument({ typeId: noteType.id, location, signal: caller.signal });
    const outcome = opening.catch(error => error);
    await vi.waitFor(() => expect(adapter.read).toHaveBeenCalled());
    expect(controller.openDocuments).toEqual([]);
    expect(controller.activity.getSnapshot().admissions).toBeGreaterThan(0);
    const generation = controller.activity.getSnapshot().revision;
    caller.abort(); await Promise.resolve();
    expect(controller.activity.getSnapshot().admissions).toBeGreaterThan(0);
    gate.resolve(null); expect(await outcome).toMatchObject({ code: 'document-aborted' });
    await vi.waitFor(() => expect(controller.activity.getSnapshot().admissions).toBe(0));
    expect(controller.activity.getSnapshot().revision).toBeGreaterThan(generation);
    expect(controller.openDocuments).toEqual([]);
  });
  it('observes scheduled recovery and real write/remove cleanup after structural close', async () => {
    const recovery = new InMemoryDocumentRecoveryStore(), { controller } = fixture({ recovery });
    const document = await controller.newDocument({ typeId: noteType.id });
    expect(controller.activity.getSnapshot().recovery).toBeGreaterThan(0);
    const gate = deferred(), write = recovery.write.bind(recovery); let recoveryId = '';
    vi.spyOn(recovery, 'write').mockImplementationOnce(async (record, version) => { recoveryId = record.recoveryId; await gate.promise; return write(record, version); });
    cleanups.push(async () => { gate.resolve(); });
    const flushing = document.flushRecovery().catch(() => undefined);
    await vi.waitFor(() => expect(recovery.write).toHaveBeenCalled());
    const closing = document.markClosed(documentAdoptionAuthority);
    await closing;
    expect(controller.activity.getSnapshot().recovery).toBeGreaterThan(0);
    gate.resolve(); await flushing;
    await vi.waitFor(() => expect(controller.activity.getSnapshot()).toMatchObject({ admissions: 0, recovery: 0, cleanup: 0 }));
    expect(await recovery.read(recoveryId)).toBeNull();
  });
  it.each(['success', 'failure'] as const)('keeps overlapping admission stages independent on %s', async mode => {
    const { controller, adapter } = fixture(), a = deferred<null>(), b = deferred<null>();
    vi.spyOn(adapter, 'read').mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    const first = controller.newDocument({ typeId: noteType.id, location }).catch(e => e);
    const second = controller.newDocument({ typeId: noteType.id, location: { ...location, key: 'second' } }).catch(e => e);
    cleanups.push(async () => { a.resolve(null); b.resolve(null); await Promise.all([first, second]); });
    await vi.waitFor(() => expect(adapter.read).toHaveBeenCalledTimes(2));
    const before = controller.activity.getSnapshot(); expect(Object.isFrozen(before)).toBe(true);
    if (mode === 'failure') a.reject(new Error('generated failure')); else a.resolve(null);
    await first; expect(controller.activity.getSnapshot().admissions).toBeGreaterThan(0);
    expect(before.admissions).toBeGreaterThan(controller.activity.getSnapshot().admissions);
    b.resolve(null); await second;
    await vi.waitFor(() => expect(controller.activity.getSnapshot().admissions).toBe(0));
    expect(controller.openDocuments).toHaveLength(mode === 'success' ? 2 : 1);
  });
  it('retains a cancelled resource admission through late factory and asynchronous disposal', async () => {
    const dependencies = createDocumentTestDependencies(), factory = deferred<any>(), disposing = deferred();
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: () => factory.promise });
    controller.registerType(noteType); cleanups.push(dependencies.cleanup);
    const caller = new AbortController(), opening = controller.newDocument({ typeId: noteType.id, signal: caller.signal }).catch(e => e);
    cleanups.push(async () => { factory.resolve({ dispose: () => disposing.promise }); disposing.resolve(); await opening; });
    await vi.waitFor(() => expect(controller.activity.getSnapshot().admissions).toBeGreaterThan(1));
    caller.abort(); await opening;
    expect(controller.openDocuments).toEqual([]); expect(controller.activity.getSnapshot().admissions).toBeGreaterThan(0);
    const dispose = vi.fn(() => disposing.promise); factory.resolve({ dispose });
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(controller.activity.getSnapshot().cleanup).toBeGreaterThan(0);
    disposing.resolve(); await vi.waitFor(() => expect(controller.activity.getSnapshot()).toMatchObject({ admissions: 0, recovery: 0, cleanup: 0 }));
  });
  it('keeps cleanup observable after a published clean projection leaves membership', async () => {
    const dependencies = createDocumentTestDependencies(), gate = deferred(), dispose = vi.fn(() => gate.promise);
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: async () => resourceLifecycle(dispose) });
    controller.registerType(noteType); cleanups.push(dependencies.cleanup); cleanups.push(async () => gate.resolve());
    const doc = await controller.newProjectionDocument({ typeId: noteType.id, initialModel: { title: 'Generated', body: '' } });
    const closing = controller.closeDocument(doc.id, 'user');
    await vi.waitFor(() => expect(controller.openDocuments).toEqual([]));
    expect(controller.activity.getSnapshot().cleanup).toBeGreaterThan(0);
    gate.resolve(); await closing; await vi.waitFor(() => expect(controller.activity.getSnapshot().cleanup).toBe(0));
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('observes delayed recovery removal during save and preserves the new dirty generation', async () => {
    const recovery = new InMemoryDocumentRecoveryStore(), { controller } = fixture({ recovery });
    const doc = await controller.newDocument({ typeId: noteType.id, location }); await doc.flushRecovery();
    const gate = deferred(), remove = recovery.remove.bind(recovery);
    vi.spyOn(recovery, 'remove').mockImplementationOnce(async (...args) => { await gate.promise; return remove(...args); });
    cleanups.push(async () => gate.resolve());
    const saving = controller.saveDocument(doc.id); await vi.waitFor(() => expect(recovery.remove).toHaveBeenCalled());
    expect(controller.activity.getSnapshot().recovery).toBeGreaterThan(0);
    doc.update(model => ({ ...model, body: 'new generation' }), { actionName: 'Generated edit' });
    const flushing = doc.flushRecovery(); gate.resolve(); await Promise.all([saving, flushing]);
    await vi.waitFor(() => expect(controller.activity.getSnapshot().recovery).toBe(0));
    expect(doc.model.body).toBe('new generation'); expect(doc.hasUnsavedChanges).toBe(true); expect(doc.recoveryRecord?.serializedContent).toMatchObject({ body: 'new generation' });
  });
  it('isolates throwing/detached observers and exports no document identity or mutation methods', async () => {
    const { controller } = fixture(), changed = vi.fn();
    const releaseBad = controller.activity.subscribe(() => { throw new Error('observer'); }), release = controller.activity.subscribe(changed);
    const before = controller.activity.getSnapshot();
    await controller.newDocument({ typeId: noteType.id });
    expect(changed).toHaveBeenCalled(); expect(before).toEqual({ revision: 0, admissions: 0, recovery: 0, cleanup: 0, editingParticipants: 0, editingSettlements: 0, editingCallbacks: 0 });
    expect(Object.keys(controller.activity).sort()).toEqual(['getSnapshot', 'subscribe']);
    expect(Object.keys(controller.activity.getSnapshot()).sort()).toEqual(['admissions', 'cleanup', 'editingCallbacks', 'editingParticipants', 'editingSettlements', 'recovery', 'revision']);
    release(); releaseBad(); const calls = changed.mock.calls.length;
    const doc = controller.openDocuments[0]!; await doc.markClosed(documentAdoptionAuthority); expect(changed).toHaveBeenCalledTimes(calls);
  });
  it('keeps stale application admissions charged without publishing into a replacement epoch', async () => {
    const { controller, adapter } = fixture(), gate = deferred<null>(), app = 'com.example.generated';
    vi.spyOn(adapter, 'read').mockImplementationOnce(() => gate.promise);
    const opening = controller.newDocument({ typeId: noteType.id, location, applicationId: app }).catch(e => e);
    cleanups.push(async () => { gate.resolve(null); await opening; });
    await vi.waitFor(() => expect(adapter.read).toHaveBeenCalled());
    controller.advanceApplicationSessionEpoch(app);
    expect(controller.activity.getSnapshot().admissions).toBeGreaterThan(0);
    gate.resolve(null); expect(await opening).toMatchObject({ code: 'document-unavailable' });
    await vi.waitFor(() => expect(controller.activity.getSnapshot().admissions).toBe(0));
    expect(controller.openDocuments).toEqual([]);
    const next = await controller.newDocument({ typeId: noteType.id, applicationId: app }); expect(next.applicationId).toBe(app);
  });
  it('observes final-owner cleanup until actual resource release', async () => {
    const dependencies = createDocumentTestDependencies(), gate = deferred();
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: async () => resourceLifecycle(() => gate.promise) });
    controller.registerType(noteType); cleanups.push(dependencies.cleanup); cleanups.push(async () => gate.resolve());
    const doc = await controller.newProjectionDocument({ typeId: noteType.id, initialModel: { title: 'Generated', body: '' }, applicationId: 'com.example.owner' });
    const lease = controller.acquireDocumentReferenceLease(doc.id, doc.applicationId!, 'owner');
    const releasing = controller.releaseDocumentReferenceLease(lease, { closeIfFinalOwner: true });
    await vi.waitFor(() => expect(controller.openDocuments).toEqual([]));
    expect(controller.activity.getSnapshot().cleanup).toBeGreaterThan(0);
    gate.resolve(); await releasing; await controller.settleClosedDocuments([doc.id]);
    await vi.waitFor(() => expect(controller.activity.getSnapshot().cleanup).toBe(0));
  });
  it('joins reentrant structural close without recursive observations or duplicate resource disposal', async () => {
    const { controller } = fixture(), doc = await controller.newDocument({ typeId: noteType.id });
    let closing: Promise<void> | undefined;
    const release = controller.activity.subscribe(() => { if (doc.state !== 'closed') closing = doc.markClosed(documentAdoptionAuthority); });
    await doc.markClosed(documentAdoptionAuthority); await closing; release();
    await vi.waitFor(() => expect(controller.activity.getSnapshot()).toMatchObject({ admissions: 0, recovery: 0, cleanup: 0 }));
  });
});

describe('recovery scheduler owner observations', () => {
  it('honours cancellation during start observation and rejects stale timer callbacks', async () => {
    const activity = new DocumentActivityObservations(), timers = new Map<number, () => void>(), callbacks: (() => void)[] = []; let id = 0, cancel = true;
    const calls = vi.fn(async () => {}), scheduler = new AutosaveScheduler(250, calls, () => {}, { setTimeout: cb => { callbacks.push(cb); timers.set(++id, cb); return id; }, clearTimeout: handle => { timers.delete(handle as number); } }, () => activity.begin('recovery'));
    const release = activity.source.subscribe(() => { if (cancel && activity.source.getSnapshot().recovery) { cancel = false; scheduler.cancel(); } });
    scheduler.schedule(); expect(timers.size).toBe(0); expect(activity.source.getSnapshot().recovery).toBe(0); release();
    scheduler.schedule(); const stale = callbacks.at(-1)!; scheduler.schedule(); const current = callbacks.at(-1)!;
    stale(); expect(timers.size).toBe(1); expect(activity.source.getSnapshot().recovery).toBe(1); expect(calls).not.toHaveBeenCalled();
    current(); await scheduler.flush(); await vi.waitFor(() => expect(activity.source.getSnapshot().recovery).toBe(0)); expect(calls).toHaveBeenCalledOnce();
  });
  it.each(['cancel', 'flush', 'timer'] as const)('observes replacement timers and %s without losing queued or running work', async mode => {
    const activity = new DocumentActivityObservations(), gate = deferred(), calls = vi.fn(() => gate.promise), timers = new Map<number, () => void>(); let id = 0;
    const scheduler = new AutosaveScheduler(250, calls, () => {}, { setTimeout: cb => { timers.set(++id, cb); return id; }, clearTimeout: handle => { timers.delete(handle as number); } }, () => activity.begin('recovery'));
    scheduler.schedule(); scheduler.schedule(); expect(timers.size).toBe(1); expect(activity.source.getSnapshot().recovery).toBe(1);
    if (mode === 'cancel') { scheduler.cancel(); expect(timers.size).toBe(0); expect(activity.source.getSnapshot().recovery).toBe(0); expect(calls).not.toHaveBeenCalled(); return; }
    let pending: Promise<void>;
    if (mode === 'flush') pending = scheduler.flush(); else { timers.values().next().value!(); timers.clear(); pending = Promise.resolve(); }
    await vi.waitFor(() => expect(calls).toHaveBeenCalledOnce()); scheduler.schedule(); scheduler.cancel();
    expect(activity.source.getSnapshot().recovery).toBeGreaterThan(0);
    gate.resolve(); await pending; await scheduler.cancelAndWait();
    await vi.waitFor(() => expect(activity.source.getSnapshot().recovery).toBe(0));
  });
  it('retains queued work after abort and releases failed work independently', async () => {
    const activity = new DocumentActivityObservations(), gate = deferred(), failed = deferred();
    const calls = vi.fn().mockImplementationOnce(() => gate.promise).mockImplementationOnce(() => failed.promise), onError = vi.fn(); let timer!: () => void;
    const scheduler = new AutosaveScheduler(250, calls, onError, { setTimeout: cb => { timer = cb; return 1; }, clearTimeout() {} }, () => activity.begin('recovery'));
    scheduler.schedule(); const first = scheduler.flush(); await vi.waitFor(() => expect(calls).toHaveBeenCalledOnce());
    scheduler.schedule(); timer(); expect(activity.source.getSnapshot().recovery).toBe(2);
    gate.resolve(); await first; await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
    scheduler.cancel(); expect(activity.source.getSnapshot().recovery).toBe(1);
    failed.reject(new Error('generated recovery error')); await scheduler.cancelAndWait();
    expect(onError).toHaveBeenCalledOnce(); expect(activity.source.getSnapshot().recovery).toBe(0);
  });
});
