import { afterEach, describe, expect, it, vi } from 'vitest';
import { NSEUpdateReadinessController } from '../../src/NSE/Controllers/NSEUpdateReadinessController';
import { NSEObjectController } from '../../src/NSE/Controllers/NSEObjectController';
import { NSEViewController } from '../../src/NSE/Application/NSEViewController';
import { nseUnowned } from '../../src/NSE/Controllers/ownership';
import { createInMemoryNSETextOwner, attributedContent, paragraph, textRun } from '../../src/NSE/Text';
import { TextEditingSession } from '../../src/NSE/TextEditing/TextEditingSession';
import { ApplicationDocument, InMemoryDocumentAdapter, InMemoryDocumentRecoveryStore } from '../../src/SynCloudOS/Documents';
import { createUndoManager } from '../../src/SynCloudOS/Undo';
import { createMountedShareClient } from '../../src/SynCloudOS/AppSDK/mountedShareClient';
import { createBrowserFileSystemAccessPanelPort } from '../../src/SynCloudOS/PlatformAdapters/BrowserFileSystemAccessPanelPort';
import { documentUpdateReadiness, textSessionUpdateReadiness, editingControllerUpdateReadiness, NativeOperationActivity, isUpdateReadinessSnapshot, updateReadinessDomains, type UpdateReadinessAuthority, type UpdateReadinessBlocker, type UpdateReadinessInventory } from '../../src/SynCloudOS/Updates';
import { noteType } from '../fixtures/noteDocumentType';
import { createTestRuntimeEnvironment } from './helpers';

const releases: (() => void)[] = [];
afterEach(() => { for (const release of releases.splice(0).reverse()) release(); });
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function inventory(sources: UpdateReadinessAuthority[] = []) {
  const listeners = new Set<() => void>();
  let covered = [...updateReadinessDomains];
  return { read: () => ({ authorities: sources, covered }), subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, set(next: UpdateReadinessAuthority[], domains = [...updateReadinessDomains]) { sources = next; covered = domains; for (const listener of [...listeners]) listener(); }, get subscriptions() { return listeners.size; } };
}
function source(domain: UpdateReadinessAuthority['domain'] = 'tasks') {
  const listeners = new Set<() => void>(); const owner = new AbortController(); let blockers: readonly UpdateReadinessBlocker[] = []; let known = true; let revision = 0;
  return { domain, signal: owner.signal, read: () => ({ known, blockers, revision }), subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, set(next: readonly UpdateReadinessBlocker[], available = true) { blockers = next; known = available; revision++; for (const listener of [...listeners]) listener(); }, end: () => owner.abort(), get subscriptions() { return listeners.size; } };
}
function controller(inv?: UpdateReadinessInventory, owner = new AbortController()) {
  const c = new NSEUpdateReadinessController({ id: 'update-observation', clientInstance: 'generated-instance-1', hostBuild: 'build-A', inventory: inv, ownerSignal: owner.signal });
  releases.push(() => c.dispose()); return c;
}
async function documentFixture() {
  const environment = createTestRuntimeEnvironment(); const adapter = new InMemoryDocumentAdapter(environment);
  const location = { kind: 'memory', namespace: 'readiness-tests', key: 'generated' } as const;
  const initial = await adapter.write({ location, typeId: noteType.id, schemaVersion: 1, content: { title: 'Generated fixture', body: 'Base' }, expectedVersion: null, idempotencyKey: 'seed' });
  const undoManager = createUndoManager({ runtimeId: 'readiness-tests', owner: { kind: 'document', id: 'generated' }, maxEntries: 10, randomUUID: environment.randomUUID });
  const recovery = new InMemoryDocumentRecoveryStore();
  const document = ApplicationDocument.open({ id: 'generated', type: noteType, record: initial, adapter, recovery, persistenceNamespace: 'readiness-tests', environment, undoManager });
  return { document, adapter, initial, location, recovery };
}
describe('owned readonly update facts', () => {
  it('defaults to unknown and requires all explicitly covered domains', () => {
    expect(controller().inspect()).toMatchObject({ readiness: 'unknown', blockers: ['provider-unavailable'] });
    const inv = inventory(); const c = controller(inv);
    expect(c.inspect().readiness).toBe('ready');
    inv.set([], ['documents', 'editing', 'native']); expect(c.inspect().readiness).toBe('unknown');
    inv.set([]); expect(c.inspect().readiness).toBe('ready');
    expect(Object.isFrozen(c.getSnapshot())).toBe(true); expect(Object.isFrozen(c.getSnapshot().blockers)).toBe(true);
    expect(isUpdateReadinessSnapshot(c.getSnapshot())).toBe(true);
  });
  it('observes real document edits, saving and a failed conditional save without action side effects', async () => {
    const { document, adapter, initial, location } = await documentFixture();
    const c = controller(inventory([documentUpdateReadiness(document)]));
    const save = vi.spyOn(document, 'save');
    expect(c.inspect().readiness).toBe('ready'); expect(save).not.toHaveBeenCalled();
    document.update(model => ({ ...model, body: 'First edit' }), { actionName: 'Type' });
    const first = c.inspect(); expect(first.blockers).toContain('dirty');
    document.update(model => ({ ...model, body: 'Second edit' }), { actionName: 'Type' });
    expect(c.inspect().generation).toBeGreaterThan(first.generation);
    const originalWrite = adapter.write.bind(adapter); const gate = deferred<void>();
    const write = vi.spyOn(adapter, 'write').mockImplementation(async request => { await gate.promise; return originalWrite(request); });
    const saving = document.save({ reason: 'explicit' });
    await vi.waitFor(() => expect(document.state).toBe('saving'));
    expect(c.inspect().blockers).toContain('saving');
    gate.resolve(); await saving; write.mockRestore();
    expect(c.inspect().readiness).toBe('ready');
    await adapter.write({ location, typeId: noteType.id, schemaVersion: 1, content: { title: 'Generated remote', body: 'Remote' }, expectedVersion: document.currentVersion ?? initial.version, idempotencyKey: 'remote' });
    document.update(model => ({ ...model, body: 'Local retained' }), { actionName: 'Type' });
    await expect(document.save({ reason: 'explicit' })).rejects.toThrow();
    expect(c.inspect().blockers).toEqual(expect.arrayContaining(['dirty', 'conflict']));
    expect(document.model.body).toBe('Local retained'); expect(save).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(c.inspect())).not.toMatch(/Generated|Local retained|generated\"|readiness-tests/);
  });
  it('reads real composition and transactions without settling, committing or discarding them', () => {
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun('Base')])]) }); releases.push(() => owner.dispose());
    const session = new TextEditingSession({ id: 'generated-session', textOwner: owner, owner: nseUnowned }); releases.push(() => session.dispose());
    const editing = new NSEObjectController({ id: 'generated-edit', owner: nseUnowned, content: { value: 1 }, fields: { value: { read: model => model.value, write: (model, value: number) => ({ ...model, value }), validate: (value: number) => value >= 0 ? [] : [{ code: 'generated.invalid', message: 'Generated refusal' }] } } }); releases.push(() => editing.dispose());
    const c = controller(inventory([textSessionUpdateReadiness(session), editingControllerUpdateReadiness(editing)]));
    session.setMarkedText('Generated composition'); editing.beginEditing({ id: 'transaction', actionName: 'Edit' });
    editing.setField('value', -1); expect(editing.commitEditing()).toMatchObject({ status: 'invalid' });
    const commit = vi.spyOn(editing, 'commitEditing'), discard = vi.spyOn(editing, 'discardEditing'), unmark = vi.spyOn(session, 'unmarkText');
    expect(c.inspect().blockers).toEqual(['composition', 'transaction']);
    expect(commit).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled(); expect(unmark).not.toHaveBeenCalled();
    c.dispose(); expect(editing.isEditing).toBe(true); expect(session.getSnapshot().marked).not.toBeNull();
    expect(commit).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled();
  });
  it.each(['synchronizing', 'recovery-write', 'owner-busy'] as const)('defers for an existing task authority reporting %s', blocker => {
    const task = source(); const c = controller(inventory([task])); const before = c.inspect().generation;
    task.set([blocker]); expect(c.inspect()).toMatchObject({ readiness: 'blocked', blockers: [blocker] });
    expect(c.getSnapshot().generation).toBeGreaterThan(before); task.set([]); expect(c.inspect().readiness).toBe('ready');
  });
  it('defers on throwing, revoked and unobservable authorities; cleans replaced memberships', () => {
    const a = source(); const b = source(); const inv = inventory([a]); const owner = new AbortController(); const c = controller(inv, owner);
    expect(a.subscriptions).toBe(1); inv.set([b]); expect(a.subscriptions).toBe(0); expect(b.subscriptions).toBe(1);
    b.end(); expect(c.inspect().readiness).toBe('unknown');
    inv.set([{ ...a, read() { throw new Error('provider failed'); } }]); expect(c.inspect().readiness).toBe('unknown');
    owner.abort(); expect(c.inspect()).toMatchObject({ readiness: 'unknown', blockers: ['owner-ended'] }); expect(c.signal.aborted).toBe(true); expect(inv.subscriptions).toBe(0); expect(a.subscriptions).toBe(0);
    const last = c.getSnapshot(); a.set(['dirty']); expect(c.getSnapshot()).toBe(last);
    expect(controller({ read: () => ({ authorities: [], covered: updateReadinessDomains }), subscribe() { throw new Error('unobservable'); } }).inspect().readiness).toBe('unknown');
    expect(controller({ read: () => ({ authorities: [], covered: updateReadinessDomains }), subscribe: (() => ({})) as any }).inspect().readiness).toBe('unknown');
  });
  it('invalidates evidence for an inventory replacement even when all booleans stay clean', () => {
    const a = source(), b = source(); const inv = inventory([a]); const c = controller(inv); const first = c.inspect();
    inv.set([b]); expect(c.inspect().generation).toBeGreaterThan(first.generation);
    b.set([]); expect(c.inspect().generation).toBeGreaterThan(first.generation + 1);
  });
  it('retains actual share activity after caller cancellation and releases on native settlement', async () => {
    const host = new AbortController(), caller = new AbortController(), gate = deferred<void>();
    const activity = new NativeOperationActivity(host.signal); const c = controller(inventory([activity]));
    const environment = createTestRuntimeEnvironment();
    Object.assign(environment.browser, { getNavigator: () => ({ share: () => gate.promise, userActivation: { isActive: true } }), getWindow: () => ({ isSecureContext: true }) });
    const client = createMountedShareClient({ browser: environment.browser, signal: host.signal, assertLive() {}, access: () => ({ declared: true, allowed: true }), nativeActivity: activity });
    const pending = client.perform({ title: 'Generated only' }, caller.signal);
    expect(c.inspect().blockers).toContain('native-operation'); caller.abort(); expect(await pending).toEqual({ kind: 'aborted' });
    expect(c.inspect().blockers).toContain('native-operation'); gate.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(c.inspect().readiness).toBe('ready'); host.abort(); expect(c.inspect().readiness).toBe('unknown');
  });
  it.each(['open', 'directory', 'save'] as const)('retains the actual %s picker lease after caller cancellation', async operation => {
    const host = new AbortController(), caller = new AbortController(), gate = deferred<any>(); const activity = new NativeOperationActivity(host.signal); const c = controller(inventory([activity]));
    const native = { showOpenFilePicker: () => gate.promise, showDirectoryPicker: () => gate.promise, showSaveFilePicker: () => gate.promise };
    const port = createBrowserFileSystemAccessPanelPort(native as unknown as Window, activity)!;
    const pending = operation === 'open' ? port.openFiles({ accepts: [], multiple: false }, caller.signal) : operation === 'directory' ? port.openDirectory(caller.signal) : port.saveFile({ accepts: [], suggestedName: 'generated.txt' }, caller.signal);
    expect(c.inspect().blockers).toContain('native-operation'); caller.abort(new DOMException('caller ended', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(c.inspect().blockers).toContain('native-operation');
    gate.resolve(operation === 'open' ? [] : { kind: 'file', name: 'generated.txt' }); await Promise.resolve(); await Promise.resolve(); expect(c.inspect().readiness).toBe('ready'); host.abort();
  });
  it('balances synchronous failures, rejected native promises and simultaneous operations', async () => {
    const activity = new NativeOperationActivity(new AbortController().signal); const c = controller(inventory([activity]));
    expect(() => activity.track(() => { throw new Error('sync'); })).toThrow('sync'); expect(c.inspect().readiness).toBe('ready');
    const a = deferred<void>(), b = deferred<void>(); const first = activity.track(() => a.promise), second = activity.track(() => b.promise);
    a.resolve(); await first; expect(c.inspect().readiness).toBe('blocked'); b.reject(new Error('native refused')); await expect(second).rejects.toThrow(); expect(c.inspect().readiness).toBe('ready');
  });
  it('retains the real document after refused and cancelled saves; observation never requests settlement', async () => {
    const { document } = await documentFixture(); document.update(model => ({ ...model, body: 'Retain this edit' }), { actionName: 'Type' });
    const settle = vi.fn(() => ({ status: 'refused' as const, reason: 'Generated refusal' }));
    const registration = document.registerEditingParticipant({ id: 'generated-field', settle });
    const c = controller(inventory([documentUpdateReadiness(document)]));
    c.inspect(); expect(settle).not.toHaveBeenCalled();
    await expect(document.save({ reason: 'explicit' })).rejects.toThrow();
    expect(c.inspect().readiness).toBe('blocked'); expect(document.model.body).toBe('Retain this edit');
    registration.dispose(); const caller = new AbortController(); caller.abort();
    await expect(document.save({ reason: 'explicit', signal: caller.signal })).rejects.toThrow();
    expect(c.inspect().blockers).toContain('dirty'); expect(document.model.body).toBe('Retain this edit'); expect(settle).toHaveBeenCalledOnce();
  });
  it('cannot replace owner-ended facts with a ready result when disposal happens during inspection', () => {
    const owner = new AbortController(), facts = source(); const c = controller(inventory([facts]), owner);
    facts.read = () => { owner.abort(); return { known: true, blockers: [], revision: 1 }; };
    expect(c.inspect()).toMatchObject({ readiness: 'unknown', blockers: ['owner-ended'] });
  });
  it('does not invoke native UI when an observation subscriber ends its owner before invocation', () => {
    const owner = new AbortController(), activity = new NativeOperationActivity(owner.signal), invoke = vi.fn();
    activity.subscribe(() => owner.abort()); expect(() => activity.track(invoke)).toThrow(); expect(invoke).not.toHaveBeenCalled();
  });
  it('rechecks the share caller after a longer-lived native activity observer ends that caller', async () => {
    const host = new AbortController(), caller = new AbortController(); const activity = new NativeOperationActivity(host.signal);
    const invoke = vi.fn(async () => {}); activity.subscribe(() => caller.abort());
    const environment = createTestRuntimeEnvironment(); Object.assign(environment.browser, { getNavigator: () => ({ share: invoke, userActivation: { isActive: true } }), getWindow: () => ({ isSecureContext: true }) });
    const client = createMountedShareClient({ browser: environment.browser, signal: caller.signal, assertLive() {}, access: () => ({ declared: true, allowed: true }), nativeActivity: activity });
    expect(await client.perform({ title: 'Generated only' })).toEqual({ kind: 'aborted' });
    expect(invoke).not.toHaveBeenCalled(); expect(activity.read().known).toBe(true); expect(activity.read().blockers).toEqual([]); host.abort();
  });
  it.each(['open', 'directory', 'save'] as const)('rechecks the %s caller after a longer-lived native activity observer ends that caller', async operation => {
    const host = new AbortController(), caller = new AbortController(); const activity = new NativeOperationActivity(host.signal);
    const invoke = vi.fn(async () => operation === 'open' ? [] : { kind: 'file', name: 'generated.txt' }); activity.subscribe(() => caller.abort());
    const native = { showOpenFilePicker: invoke, showDirectoryPicker: invoke, showSaveFilePicker: invoke };
    const port = createBrowserFileSystemAccessPanelPort(native as unknown as Window, activity)!;
    const pending = operation === 'open' ? port.openFiles({ accepts: [], multiple: false }, caller.signal) : operation === 'directory' ? port.openDirectory(caller.signal) : port.saveFile({ accepts: [], suggestedName: 'generated.txt' }, caller.signal);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(invoke).not.toHaveBeenCalled(); expect(activity.read().blockers).toEqual([]); host.abort();
  });
  it('isolates a throwing presentation observer from its existing authority', () => {
    const facts = source(); const c = controller(inventory([facts])); c.subscribe(() => { throw new Error('Generated observer error'); });
    expect(() => facts.set(['dirty'])).not.toThrow(); expect(c.inspect().blockers).toEqual(['dirty']);
  });
  it('belongs to an actual 6C view-controller owner and ends with that owner', () => {
    const view = new NSEViewController({ owner: nseUnowned }); const inv = inventory();
    const c = new NSEUpdateReadinessController({ id: 'view-owned', owner: view, clientInstance: 'generated-view-instance', hostBuild: 'build-A', inventory: inv });
    expect(c.inspect().readiness).toBe('ready'); view.dispose();
    expect(c.isDisposed).toBe(true); expect(c.inspect().blockers).toEqual(['owner-ended']); expect(inv.subscriptions).toBe(0);
  });
  it('projects an actual in-flight recovery write through its service-owned task facts', async () => {
    const { document, recovery } = await documentFixture(); const task = source();
    const gate = deferred<void>(); const write = recovery.write.bind(recovery);
    const operation = vi.spyOn(recovery, 'write').mockImplementation(async (...args) => {
      task.set(['recovery-write']); try { await gate.promise; return await write(...args); } finally { task.set([]); }
    });
    const c = controller(inventory([documentUpdateReadiness(document), task]));
    document.update(model => ({ ...model, body: 'Generated recoverable draft' }), { actionName: 'Type' });
    const flushing = document.flushRecovery(); await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
    expect(c.inspect().blockers).toEqual(['dirty', 'recovery-write']);
    gate.resolve(); await flushing; expect(c.inspect().blockers).toEqual(['dirty']); expect(document.hasRecoverableAutosave).toBe(true);
    // A recovery record never converts dirty content into a clean document.
    expect(c.inspect().readiness).toBe('blocked'); expect(operation).toHaveBeenCalledOnce();
  });
});
