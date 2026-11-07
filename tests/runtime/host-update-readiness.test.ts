import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare, mountTestSynWareRuntime, createTestBundle } from './helpers';
import { createSynWareContextValue } from '../../src/SynCloudOS/AppSDK/createSynWareContextValue';
import { InMemoryDocumentAdapter } from '../../src/SynCloudOS/Documents';
import { initialHostUpdateReadinessSnapshot, captureHostUpdateReadinessOptions } from '../../src/SynCloudOS/Updates';
import { createSynCloudOSHostContribution, prepareSynCloudOSHostContributions, composeSynCloudOSHostContributions } from '../../src/SynCloudOS/HostContributions/hostContribution';
import { createBrowserFileSystemAccessPanelPort } from '../../src/SynCloudOS/PlatformAdapters/BrowserFileSystemAccessPanelPort';
import type { UpdateReadinessObservation, NativeOperationActivity } from '../../src/SynCloudOS/Updates';
import { noteType } from '../fixtures/noteDocumentType';
import { NSEObjectController } from '../../src/NSE/Controllers/NSEObjectController';
import { NSEUpdateReadinessController } from '../../src/NSE/Controllers/NSEUpdateReadinessController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { editingControllerUpdateReadiness, updateReadinessDomains } from '../../src/SynCloudOS/Updates';
import { HostUpdateReadinessService } from '../../src/SynCloudOS/Updates/HostUpdateReadinessService';

const runtimes: ReturnType<typeof createTestRuntime>[] = [], releases: (() => void)[] = [];
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const ready: UpdateReadinessObservation = { status: 'ready-at-observation', activationAuthorized: false, participantCount: 2, reasons: [] };
afterEach(async () => {
  vi.restoreAllMocks(); for (const release of releases.splice(0).reverse()) release();
  for (const runtime of runtimes.splice(0).reverse()) {
    for (const document of runtime.documents.openDocuments) if (document.hasUnsavedChanges && document.location) await document.save({ reason: 'explicit' });
    await runtime.dispose('generated readiness test');
  }
});
function fixture(options: Parameters<typeof createTestRuntime>[0] = {}) {
  const environment = options.environment ?? createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ authenticationPolicy: 'disabled', ...options, environment, applicationDocuments: { initialTypes: [noteType], initialAdapters: [new InMemoryDocumentAdapter(environment)], ...options.applicationDocuments } });
  runtime.store.mutate(draft => { draft.booted = true; }); runtimes.push(runtime); return runtime;
}
describe('host readiness owner integration', () => {
  it('folds current readiness into the single public notification of an outer batch', () => {
    const runtime = fixture(); runtime.store.mutate(draft => { draft.booted = false; });
    const observed: unknown[] = [];
    const serviceObserved: boolean[] = [];
    releases.push(runtime.updateReadiness.subscribe(() => serviceObserved.push(runtime.store.getSnapshot().updateReadiness === runtime.updateReadiness.getSnapshot())));
    const release = runtime.store.subscribe(() => {
      observed.push(runtime.store.getSnapshot().updateReadiness);
      expect(runtime.store.getSnapshot().updateReadiness).toBe(runtime.updateReadiness.getSnapshot());
    }); releases.push(release);
    runtime.store.batch(() => { runtime.store.mutate(draft => { draft.booted = true; }); runtime.store.batch(() => runtime.store.mutate(draft => { draft.webspring.isBooted = true; })); });
    expect(observed).toHaveLength(1); expect(serviceObserved).toEqual([true]); expect(runtime.updateReadiness.getSnapshot().client.blockers).not.toContain('owner-busy');
    observed.length = 0;
    const historical = runtime.store.cloneSnapshot(); historical.updateReadiness = { ...historical.updateReadiness, client: { ...historical.updateReadiness.client, readiness: 'ready', blockers: [] } };
    runtime.store.replaceSnapshot(historical); expect(observed).toHaveLength(1);
    expect(serviceObserved).toEqual([true, true]);
    expect(runtime.store.getSnapshot().updateReadiness.client.readiness).toBe('unknown');
  });
  it('defers an alternate store and never writes a second projection through its public subscriber', () => {
    const runtime = fixture(), actual = runtime.store;
    const store = { runtimeId: actual.runtimeId, getSnapshot: actual.getSnapshot, cloneSnapshot: actual.cloneSnapshot, createCheckpoint: actual.createCheckpoint, subscribe: actual.subscribe, listenerCount: actual.listenerCount, mutate: vi.fn(actual.mutate), batch: actual.batch, replaceSnapshot: actual.replaceSnapshot, dispose() {} };
    const facade = Object.create(runtime); Object.defineProperty(facade, 'store', { value: store });
    const before = actual.listenerCount(), observer = new HostUpdateReadinessService(facade);
    expect(observer.getSnapshot().coverage.find(row => row.domain === 'tasks')?.gaps).toContain('runtime-store-publication');
    actual.mutate(draft => { draft.booted = false; }); observer.inspect(); observer.dispose();
    expect(store.mutate).not.toHaveBeenCalled(); expect(actual.listenerCount()).toBe(before);
  });
  it('does not take over or clear another live readiness publisher', () => {
    const runtime = fixture(), observer = new HostUpdateReadinessService(runtime);
    expect(observer.getSnapshot().coverage.find(row => row.domain === 'tasks')?.gaps).toContain('runtime-store-publication');
    observer.dispose(); expect(runtime.updateReadiness.getSnapshot().ended).toBe(false);
    const changed = vi.fn(); const release = runtime.store.subscribe(changed); releases.push(release);
    runtime.store.batch(() => runtime.store.mutate(draft => { draft.booted = false; }));
    expect(changed).toHaveBeenCalledOnce(); expect(runtime.store.getSnapshot().updateReadiness).toBe(runtime.updateReadiness.getSnapshot());
  });
  it('captures readonly host options without getters or update-control capabilities', async () => {
    const getter = vi.fn(); expect(() => captureHostUpdateReadinessOptions(Object.defineProperty({}, 'hostBuild', { enumerable: true, get: getter }))).toThrow(); expect(getter).not.toHaveBeenCalled();
    expect(() => captureHostUpdateReadinessOptions({ activateNow() {} } as any)).toThrow();
    const options = { hostBuild: 'build-A', inspectParticipants: async () => ready };
    const runtime = fixture({ updateReadiness: options }); options.hostBuild = 'changed-build'; options.inspectParticipants = async () => { throw new Error('replacement must not run'); };
    await runtime.updateReadiness.inspectParticipants(); expect(runtime.updateReadiness.getSnapshot().client.hostBuild).toBe('build-A'); expect(runtime.updateReadiness.getSnapshot().inspection.state).toBe('observed');
    const configured = { hostBuild: 'captured-host', compatibilityRestricted: true };
    const contribution = createSynCloudOSHostContribution('generated.readiness', 'generated host', () => ({ runtimeConfig: { updateReadiness: configured } }));
    const prepared = await prepareSynCloudOSHostContributions([contribution], createTestRuntimeEnvironment()); configured.hostBuild = 'later-mutation';
    const composed = composeSynCloudOSHostContributions(prepared); expect(composed.runtimeConfig.updateReadiness?.hostBuild).toBe('captured-host'); expect(Object.isFrozen(composed.runtimeConfig.updateReadiness)).toBe(true);
  });
  it('observes an empty host conservatively and keeps every missing owner domain explicit', () => {
    const runtime = fixture(); const snapshot = runtime.updateReadiness.inspect();
    expect(snapshot.decision).toBe('defer'); expect(snapshot.activationAuthorized).toBe(false); expect(snapshot.client.readiness).toBe('unknown');
    expect(snapshot.coverage).toHaveLength(4); expect(snapshot.coverage.find(row => row.domain === 'documents')).toMatchObject({ status: 'observed', gaps: [] }); expect(snapshot.coverage.filter(row => row.domain !== 'documents').every(row => row.status === 'partial' && row.gaps.length)).toBe(true);
    expect(snapshot.coverage.flatMap(row => row.gaps)).toEqual(expect.arrayContaining(['editing-owner-census', 'managed-task-owners', 'native-write-permission', 'service-network-media']));
    expect(runtime.store.getSnapshot().updateReadiness).toEqual(snapshot); expect(Object.isFrozen(snapshot)).toBe(true); expect(Object.isFrozen(snapshot.counts)).toBe(true);
    expect(snapshot.inspection).toMatchObject({ available: false, state: 'not-inspected' });
  });
  it('observes real hidden documents and repeated edits without saving, settlement, titles or models', async () => {
    const runtime = fixture();
    const document = await runtime.documents.newDocument({ documentId: 'GENERATED-PRIVATE-ID', typeId: noteType.id, location: { kind: 'memory', namespace: 'generated', key: 'hidden' } });
    const save = vi.spyOn(document, 'save'), settle = vi.spyOn(document, 'settleEditing');
    expect(runtime.updateReadiness.getSnapshot().counts).toMatchObject({ documents: 1, windows: 0 });
    document.update(model => ({ ...model, body: 'GENERATED PRIVATE BODY' }), { actionName: 'Type' });
    const first = runtime.updateReadiness.inspect(); expect(first.counts.dirtyDocuments).toBe(1); expect(first.client.blockers).toContain('dirty');
    document.update(model => ({ ...model, body: 'SECOND PRIVATE BODY' }), { actionName: 'Type' });
    expect(runtime.updateReadiness.getSnapshot().client.generation).toBeGreaterThan(first.client.generation);
    expect(JSON.stringify(runtime.updateReadiness.inspect())).not.toMatch(/PRIVATE|hidden|generated\"/);
    expect(save).not.toHaveBeenCalled(); expect(settle).not.toHaveBeenCalled();
    save.mockRestore(); settle.mockRestore(); await document.save({ reason: 'explicit' });
    await runtime.documents.closeDocument(document.id, 'user');
    expect(runtime.updateReadiness.getSnapshot().counts.documents).toBe(0); expect(runtime.updateReadiness.getSnapshot().client.readiness).toBe('unknown');
  });
  it('shows a real saving document until its adapter write settles', async () => {
    const environment = createTestRuntimeEnvironment(), adapter = new InMemoryDocumentAdapter(environment), gate = deferred<void>();
    const runtime = fixture({ environment, applicationDocuments: { initialAdapters: [adapter] } });
    const document = await runtime.documents.newDocument({ typeId: noteType.id, location: { kind: 'memory', namespace: 'generated', key: 'saving' } });
    document.update(model => ({ ...model, body: 'Generated' }), { actionName: 'Type' });
    const write = adapter.write.bind(adapter); const spy = vi.spyOn(adapter, 'write').mockImplementation(async request => { await gate.promise; return write(request); });
    const saving = document.save({ reason: 'explicit' }); await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().counts.savingDocuments).toBe(1));
    gate.resolve(); await saving; spy.mockRestore(); expect(runtime.updateReadiness.getSnapshot().counts.savingDocuments).toBe(0);
  });
  it('observes active/queued jobs and holds admitted cancellation until actual lease release', async () => {
    const runtime = fixture(); runtime.jobs.setCapacity({ concurrency: 1 });
    const active = runtime.jobs.tryAdmit({ owner: 'generated', kind: 'fixture' })!; const caller = new AbortController();
    const queued = runtime.jobs.admit({ owner: 'generated-second', kind: 'fixture', signal: caller.signal });
    expect(runtime.updateReadiness.getSnapshot().counts).toMatchObject({ activeJobs: 1, queuedJobs: 1 });
    caller.abort(); await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(runtime.updateReadiness.getSnapshot().counts).toMatchObject({ activeJobs: 1, queuedJobs: 0 });
    active.release(); expect(runtime.updateReadiness.getSnapshot().counts.activeJobs).toBe(0); expect(runtime.updateReadiness.getSnapshot().client.readiness).toBe('unknown');
  });
  it('keeps a cancelled operation busy while its actual commit is still running', async () => {
    const runtime = fixture(), entered = deferred<void>(), gate = deferred<void>();
    const handle = runtime.operations.run({ kind: 'fixture-held-commit', input: undefined, commit: async () => { entered.resolve(); await gate.promise; } });
    expect(runtime.updateReadiness.getSnapshot().counts.operations).toBe(1); await entered.promise; handle.cancel('generated cancellation');
    expect(runtime.updateReadiness.getSnapshot().counts.operations).toBe(1); gate.resolve(); await handle.result; expect(runtime.updateReadiness.getSnapshot().counts.operations).toBe(0);
  });
  it('invalidates participant evidence for real runtime-owned window creation and closure', async () => {
    const runtime = fixture({ updateReadiness: { inspectParticipants: async () => ready } }), appId = 'com.example.readiness-window';
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: appId, route: '/generated-window', presentation: 'windowedView' }));
    await runtime.updateReadiness.inspectParticipants(); const first = runtime.updateReadiness.getSnapshot().client.generation;
    const window = await runtime.windows.openApplicationWindow(appId); expect(window).toBeTruthy();
    expect(runtime.updateReadiness.getSnapshot().counts.windows).toBe(1); expect(runtime.updateReadiness.getSnapshot().client.generation).toBeGreaterThan(first); expect(runtime.updateReadiness.getSnapshot().inspection.state).toBe('stale');
    const openedGeneration = runtime.updateReadiness.getSnapshot().client.generation;
    expect((await runtime.windows.requestClose(window!.id, { reason: 'command' })).outcome).toBe('closed');
    expect(runtime.updateReadiness.getSnapshot().counts.windows).toBe(0); expect(runtime.updateReadiness.getSnapshot().client.generation).toBeGreaterThan(openedGeneration);
  });
  it('does not equate an abort-raced callback leaving the operation ledger with idle coverage', async () => {
    const runtime = fixture(), entered = deferred<void>(), gate = deferred<void>();
    const handle = runtime.operations.run({ kind: 'fixture-held-will', input: undefined, will: [async () => { entered.resolve(); await gate.promise; }], commit() {} });
    await entered.promise; handle.cancel('generated cancellation'); await handle.result;
    expect(runtime.updateReadiness.inspect().counts).toMatchObject({ operations: 0, operationWork: 1 }); expect(runtime.updateReadiness.getSnapshot().coverage.flatMap(row => row.gaps)).not.toContain('underlying-operation-work'); expect(runtime.updateReadiness.getSnapshot().client.blockers).toContain('owner-busy'); gate.resolve(); await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().counts.operationWork).toBe(0)); expect(runtime.updateReadiness.getSnapshot().client.readiness).toBe('unknown');
  });
  it('wires the actual mounted share boundary to the runtime-owned underlying promise', async () => {
    const environment = createTestRuntimeEnvironment(), gate = deferred<void>();
    Object.assign(environment.browser, { getNavigator: () => ({ share: () => gate.promise, userActivation: { isActive: true } }), getWindow: () => ({ isSecureContext: true }) });
    const runtime = fixture({ environment }); registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: 'com.example.readiness-share', version: '1.0.0', displayName: 'Generated', routes: [{ path: '/generated-share', primary: true }], permissions: ['web.share'] });
    const mounted = mountTestSynWareRuntime(runtime, 'com.example.readiness-share'); releases.push(() => mounted.dispose('test'));
    const client = createSynWareContextValue(mounted.runtime).share, caller = new AbortController();
    const pending = client.perform({ title: 'Generated only' }, caller.signal);
    expect(runtime.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1); caller.abort(); expect(await pending).toEqual({ kind: 'aborted' });
    expect(runtime.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1); gate.resolve(); await Promise.resolve(); await Promise.resolve(); expect(runtime.updateReadiness.getSnapshot().counts.nativeOperations).toBe(0);
  });
  it('creates runtime-specific picker instrumentation for a shared environment and retains late native work', async () => {
    const environment = createTestRuntimeEnvironment(), gate = deferred<any>();
    const native = { isSecureContext: true, navigator: { userActivation: { isActive: true } }, showSaveFilePicker: () => gate.promise };
    Object.assign(environment.browser, { getNavigator: () => native.navigator, getWindow: () => native });
    Object.assign(environment, { createFileSystemAccessPanelPort: (activity: NativeOperationActivity) => createBrowserFileSystemAccessPanelPort(native as unknown as Window, activity) });
    const a = fixture({ environment }), b = fixture({ environment }), appId = 'com.example.readiness-picker';
    for (const runtime of [a, b]) registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: appId, version: '1.0.0', displayName: 'Generated', routes: [{ path: '/generated-picker', primary: true }], permissions: ['file.write', 'file.open'] });
    const mounted = mountTestSynWareRuntime(a, appId); releases.push(() => mounted.dispose('test'));
    const caller = new AbortController(); const pending = createSynWareContextValue(mounted.runtime).filePanels.save({ id: 'generated', accepts: [], suggestedName: 'generated.txt', destination: 'persistent-handle-required', conflictPolicy: 'fail-if-exists' }, caller.signal);
    await vi.waitFor(() => expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1)); expect(b.updateReadiness.getSnapshot().counts.nativeOperations).toBe(0);
    caller.abort(); await pending; expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1);
    gate.resolve({ kind: 'file', name: 'generated.txt' }); await Promise.resolve(); await Promise.resolve(); expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(0);
    expect(a.updateReadiness.getSnapshot().coverage.flatMap(row => row.gaps)).not.toContain('native-picker-instrumentation');
  });
  it('keeps participant readiness historical and preserves local incomplete coverage', async () => {
    const runtime = fixture({ updateReadiness: { hostBuild: 'build-A', inspectParticipants: async () => ready, observationLifetimeMs: 20 } });
    await runtime.updateReadiness.inspectParticipants(); const snapshot = runtime.updateReadiness.getSnapshot();
    expect(snapshot.inspection).toMatchObject({ state: 'observed', result: ready }); expect(snapshot.decision).toBe('defer'); expect(snapshot.client.readiness).toBe('unknown');
    await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().inspection).toMatchObject({ state: 'stale', reason: 'expired' }));
  });
  it('invalidates a completed observation on native work or canonical account replacement without erasing that work', async () => {
    const runtime = fixture({ updateReadiness: { inspectParticipants: async () => ready } });
    await runtime.updateReadiness.inspectParticipants(); const first = runtime.updateReadiness.getSnapshot().client.generation;
    runtime.store.mutate(draft => { draft.loginServices.sessionId = 'GENERATED-PRIVATE-SESSION'; draft.loginServices.synId = 'GENERATED-PRIVATE-ACCOUNT'; });
    expect(runtime.updateReadiness.getSnapshot().client.generation).toBeGreaterThan(first); expect(runtime.updateReadiness.getSnapshot().inspection.state).toBe('stale');
    expect(JSON.stringify(runtime.updateReadiness.getSnapshot())).not.toContain('PRIVATE');
    const gate = deferred<void>(), pending = runtime.nativeActivity.track(() => gate.promise); expect(runtime.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1);
    runtime.store.mutate(draft => { draft.loginServices.sessionId = 'new-generated-session'; }); expect(runtime.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1); gate.resolve(); await pending;
  });
  it('rejects late evidence after an intervening edit or superseding inspection', async () => {
    const a = deferred<UpdateReadinessObservation>(), b = deferred<UpdateReadinessObservation>(); let calls = 0;
    const runtime = fixture({ updateReadiness: { inspectParticipants: () => ++calls === 1 ? a.promise : b.promise } });
    const first = runtime.updateReadiness.inspectParticipants(); const second = runtime.updateReadiness.inspectParticipants();
    b.resolve({ status: 'defer', activationAuthorized: false, participantCount: 2, reasons: ['membership-changed'] }); await second;
    a.resolve(ready); await first; expect(runtime.updateReadiness.getSnapshot().inspection.result?.status).toBe('defer');
    const gate = deferred<UpdateReadinessObservation>(); const other = fixture({ updateReadiness: { inspectParticipants: () => gate.promise } }); const pending = other.updateReadiness.inspectParticipants();
    const native = deferred<void>(), underlying = other.nativeActivity.track(() => native.promise); gate.resolve(ready); await pending;
    expect(other.updateReadiness.getSnapshot().inspection).toMatchObject({ state: 'stale', reason: 'work-changed' }); native.resolve(); await underlying;
  });
  it('bounds an unresponsive inspector and releases its signal', async () => {
    let signal: AbortSignal | undefined;
    const runtime = fixture({ updateReadiness: { inspectionTimeoutMs: 20, inspectParticipants: context => { signal = context.signal; return new Promise(() => {}); } } });
    await runtime.updateReadiness.inspectParticipants(); expect(signal?.aborted).toBe(true); expect(runtime.updateReadiness.getSnapshot().inspection.state).toBe('failed');
  });
  it('rejects malformed or private participant facts without projecting their contents', async () => {
    const runtime = fixture({ updateReadiness: { inspectParticipants: async () => ({ ...ready, documentTitle: 'PRIVATE CANARY' }) as any } });
    await runtime.updateReadiness.inspectParticipants(); expect(runtime.updateReadiness.getSnapshot().inspection.state).toBe('failed'); expect(JSON.stringify(runtime.updateReadiness.getSnapshot())).not.toContain('CANARY');
  });
  it('never restores readiness authority from a historical RuntimeStore checkpoint', () => {
    const runtime = fixture(); const checkpoint = runtime.store.cloneSnapshot(); checkpoint.updateReadiness = { ...initialHostUpdateReadinessSnapshot(), decision: 'defer', client: { ...initialHostUpdateReadinessSnapshot().client, readiness: 'ready', blockers: [] } };
    runtime.store.replaceSnapshot(checkpoint); expect(runtime.store.getSnapshot().updateReadiness.client.readiness).toBe('unknown');
  });
  it('ends pending inspection and subscriptions with runtime disposal, ignoring late completion', async () => {
    const gate = deferred<UpdateReadinessObservation>(), runtime = fixture({ updateReadiness: { inspectParticipants: () => gate.promise } });
    const pending = runtime.updateReadiness.inspectParticipants(); await runtime.dispose('generated disposal'); const final = runtime.updateReadiness.getSnapshot();
    expect(final.ended).toBe(true); expect(final.client.blockers).toEqual(['owner-ended']); gate.resolve(ready); await pending; expect(runtime.updateReadiness.getSnapshot()).toBe(final);
  });
  it('observes explicit editing-controller disposal without a separately supplied owner signal', () => {
    const editing = new NSEObjectController({ id: 'generated-editing', owner: nseUnowned, content: { value: 1 }, fields: { value: { read: value => value.value, write: (model, value: number) => ({ ...model, value }) } } });
    const readiness = new NSEUpdateReadinessController({ id: 'generated-observer', owner: nseUnowned, clientInstance: 'generated-instance', hostBuild: 'build-A', inventory: { read: () => ({ covered: updateReadinessDomains, authorities: [editingControllerUpdateReadiness(editing)] }), subscribe: () => () => {} } });
    const first = readiness.getSnapshot(); editing.dispose(); expect(readiness.getSnapshot().clientInstance).toBe(first.clientInstance); expect(readiness.getSnapshot().readiness).toBe('unknown'); expect(readiness.getSnapshot().generation).toBeGreaterThan(first.generation); readiness.dispose();
  });
});

describe('document admission/recovery host facts', () => {
  it('publishes pending admission before a document exists, invalidates evidence and retains real work across account change', async () => {
    const runtime = fixture({ updateReadiness: { hostBuild: 'generated', inspectParticipants: async () => ready } });
    const adapter = new InMemoryDocumentAdapter(runtime.environment); runtime.documents.registerAdapter({ ...adapter, id: 'generated-held', supports: loc => loc.kind === 'generated-held', read: () => gate.promise } as any);
    const gate = deferred<null>(), caller = new AbortController();
    await runtime.updateReadiness.inspectParticipants();
    const opening = runtime.documents.newDocument({ typeId: noteType.id, location: { kind: 'generated-held', key: 'private-never-projected' } as any, signal: caller.signal }).catch(e => e);
    try {
      await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().counts.documentAdmissions).toBeGreaterThan(0));
      expect(runtime.updateReadiness.getSnapshot().counts.documents).toBe(0);
      expect(runtime.updateReadiness.getSnapshot().inspection.state).toBe('stale');
      expect(runtime.store.getSnapshot().updateReadiness).toBe(runtime.updateReadiness.getSnapshot());
      runtime.store.mutate(draft => { draft.loginServices.sessionId = 'generated-replacement'; }); caller.abort();
      expect(runtime.updateReadiness.getSnapshot().counts.documentAdmissions).toBeGreaterThan(0);
      expect(JSON.stringify(runtime.updateReadiness.getSnapshot())).not.toContain('private-never-projected');
    } finally { gate.resolve(null); await opening; }
    await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().counts.documentAdmissions).toBe(0));
    const snapshot = runtime.updateReadiness.getSnapshot(); expect(snapshot.activationAuthorized).toBe(false); expect(snapshot.decision).toBe('defer'); expect(snapshot.client.readiness).toBe('unknown');
    expect(snapshot.coverage.flatMap(row => row.gaps)).not.toContain('document-admission'); expect(snapshot.coverage.flatMap(row => row.gaps)).not.toContain('recovery-cleanup');
    expect(snapshot.coverage.flatMap(row => row.gaps)).not.toContain('underlying-operation-work');
    expect(snapshot.counts.operationWork).toBe(0); expect(snapshot.coverage.flatMap(row => row.gaps)).toContain('application-lifecycle-owners');
  });
  it('projects recovery work and stops publication on observer disposal while actual work finishes', async () => {
    const runtime = fixture(), observer = new HostUpdateReadinessService(runtime), doc = await runtime.documents.newDocument({ typeId: noteType.id });
    expect(runtime.updateReadiness.getSnapshot().counts.documentRecovery).toBeGreaterThan(0);
    expect(runtime.updateReadiness.getSnapshot().client.blockers).toContain('recovery-write');
    const changed = vi.fn(); observer.subscribe(changed); observer.dispose(); const calls = changed.mock.calls.length;
    await doc.markClosed(); await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().counts.documentRecovery).toBe(0));
    expect(changed).toHaveBeenCalledTimes(calls); expect(observer.getSnapshot().ended).toBe(true); expect(observer.getSnapshot().activationAuthorized).toBe(false);
  });
});


it('observes canonical persistence admissions without declaring all persistence covered', async () => {
  const held = deferred<void>();
  const runtime = fixture({ documentStoreLock: { request: async (_name, _options, callback) => { await held.promise; return callback(); } } });
  const initialGeneration = runtime.updateReadiness.getSnapshot().client.generation;
  runtime.documentStore.registerKind({ kind: 'readiness.generated', displayName: 'Generated', version: 1 });
  expect(runtime.updateReadiness.getSnapshot().counts.persistenceMutations).toBe(1);
  expect(runtime.updateReadiness.getSnapshot().client.generation).toBeGreaterThan(initialGeneration);
  expect(runtime.updateReadiness.getSnapshot().client.blockers).toContain('owner-busy');
  expect(runtime.updateReadiness.getSnapshot().coverage.flatMap(row => row.gaps)).toContain('persistence-work');
  expect(runtime.updateReadiness.getSnapshot().activationAuthorized).toBe(false);
  held.resolve();
  await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().counts.persistenceMutations).toBe(0));
  expect(runtime.updateReadiness.getSnapshot().decision).toBe('defer');
});


it('observes editing work beyond logical cancellation while inspection never settles participants', async () => {
 const runtime=fixture(),document=await runtime.documents.newDocument({typeId:noteType.id}),held=deferred<{status:'settled'}>(),caller=new AbortController();
 const settle=vi.fn(()=>held.promise),registration=document.registerEditingParticipant({id:'generated-editing-owner',settle});
 try {
  const observed=runtime.updateReadiness.inspect();
  expect(observed.counts.documentEditingParticipants).toBe(1);expect(observed.counts.documentEditingWork).toBe(0);expect(settle).not.toHaveBeenCalled();
  expect(observed.coverage.flatMap(row=>row.gaps)).toContain('editing-owner-census');expect(observed.activationAuthorized).toBe(false);
  const pending=document.settleEditing('save',caller.signal);
  await vi.waitFor(()=>expect(runtime.updateReadiness.getSnapshot().counts.documentEditingWork).toBe(2));
  expect(runtime.updateReadiness.getSnapshot().client.blockers).toContain('owner-busy');caller.abort();expect((await pending).status).toBe('revoked');registration.dispose();
  await vi.waitFor(()=>expect(runtime.updateReadiness.getSnapshot().counts.documentEditingWork).toBe(1));
  runtime.store.mutate(draft=>{draft.loginServices.sessionId='generated-replacement';});
  expect(runtime.updateReadiness.getSnapshot().counts.documentEditingWork).toBe(1);expect(runtime.updateReadiness.getSnapshot().decision).toBe('defer');
 } finally {held.resolve({status:'settled'});registration.dispose();}
 await vi.waitFor(()=>expect(runtime.updateReadiness.getSnapshot().counts.documentEditingWork).toBe(0));
});


it('retains underlying operation callbacks after a cancellation receipt', async () => {
  const runtime = fixture(), gate = deferred<void>(), entered = deferred<void>();
  const handle = runtime.operations.run({ kind: 'generated-underlying-work', input: undefined,
    will: [() => { entered.resolve(); return gate.promise; }], commit() { throw new Error('cancelled work must not commit'); } });
  await entered.promise; handle.cancel('generated cancellation');
  await expect(handle.result).resolves.toMatchObject({ status: 'cancelled', committed: false });
  expect(runtime.operations.inspectPending()).toEqual([]);
  try {
    expect(runtime.updateReadiness.inspect().counts).toMatchObject({ operations: 0, operationWork: 1 });
    expect(runtime.updateReadiness.getSnapshot().client.blockers).toContain('owner-busy');
    expect(runtime.updateReadiness.getSnapshot().activationAuthorized).toBe(false);
  } finally { gate.resolve(); }
});

it('retains unknown operation coverage for a foreign coordinator facade', () => {
  const runtime = fixture(), facade = Object.create(runtime);
  Object.defineProperty(facade, 'operations', { value: { ...runtime.operations } });
  const observer = new HostUpdateReadinessService(facade);
  try {
    expect(observer.getSnapshot().coverage.flatMap(row => row.gaps)).toContain('underlying-operation-work');
    expect(observer.getSnapshot().client.readiness).toBe('unknown');
    expect(observer.getSnapshot().activationAuthorized).toBe(false);
  } finally { observer.dispose(); }
});

it('retains real mounted file-write work across mount retirement without charging a sibling runtime', async () => {
  const environment = createTestRuntimeEnvironment(), gate = deferred<void>(), entered = deferred<void>();
  const writable = { write: () => { entered.resolve(); return gate.promise; }, close: async () => {}, abort: async () => {} };
  const handle = { name: 'generated.txt', queryPermission: async () => 'granted' as const, requestPermission: async () => 'granted' as const, getFile: async () => new File(['generated'], 'generated.txt'), createWritable: async () => writable };
  const port = { isSecureContext: () => true, isAvailable: () => true, hasTransientUserActivation: () => true, openFiles: async () => [], openDirectory: async () => null, saveFile: async () => ({ handle, exists: false }) };
  Object.assign(environment, { createFileSystemAccessPanelPort: () => port });
  Object.assign(environment.browser, { getNavigator: () => ({ userActivation: { isActive: true } }) });
  const a = fixture({ environment }), b = fixture({ environment }), appId = 'com.example.generated-observed-file';
  registerTestSynWare(a, { schemaVersion: 1, bundleIdentifier: appId, version: '1.0.0', displayName: 'Generated file observer', routes: [{ path: '/generated-observed-file', primary: true }], permissions: ['file.write'] });
  const mounted = mountTestSynWareRuntime(a, appId); releases.push(() => mounted.dispose('generated-test-end'));
  const selected = await createSynWareContextValue(mounted.runtime).filePanels.save({ id: 'generated-write', accepts: [], suggestedName: 'generated.txt', destination: 'persistent-handle-required', conflictPolicy: 'fail-if-exists' });
  expect(selected.kind).toBe('accepted'); if (selected.kind !== 'accepted') throw new Error('Generated target missing');
  const pending = selected.values[0]!.sink.write({ fileName: 'generated.txt', mediaType: 'text/plain', data: new TextEncoder().encode('generated harmless bytes') });
  await entered.promise;
  try {
    expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1); expect(b.updateReadiness.getSnapshot().counts.nativeOperations).toBe(0);
    mounted.dispose('generated-window-retired'); expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1);
    expect(a.updateReadiness.getSnapshot().client.blockers).toContain('native-operation');
    expect(a.updateReadiness.getSnapshot().coverage.flatMap(row => row.gaps)).toContain('native-write-permission');
    expect(a.updateReadiness.getSnapshot().activationAuthorized).toBe(false);
  } finally { gate.resolve(); }
  await expect(pending).rejects.toMatchObject({ code: 'operation-aborted' });
  expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(0);
});
