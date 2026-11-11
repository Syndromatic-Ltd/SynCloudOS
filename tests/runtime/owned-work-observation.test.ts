import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationCoordinator } from '../../src/SynCloudOS/Operations/OperationCoordinator';
import { observeOwnedWork } from '../../src/SynCloudOS/Operations/OwnedWorkObservations';
import { createTestBundle, createTestRuntime } from './helpers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose('generated work observation'); });
function coordinator() {
  let id = 0;
  return createOperationCoordinator({ runtimeId: 'generated-work-runtime' as never, now: Date.now,
    randomUUID: () => String(++id), setTimeout, clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) });
}

describe('actual owner work observation', () => {
  it.each(['validate', 'will', 'effects', 'did'] as const)('retains a cancelled %s callback until its actual promise settles', async stage => {
    const owner = coordinator(), source = observeOwnedWork(owner)!;
    const entered = deferred<void>(), gate = deferred<void>();
    const hold = () => { entered.resolve(); return gate.promise; };
    const handle = owner.run({ kind: 'generated-only', input: { secret: 'must not be projected' },
      validate: stage === 'validate' ? async () => { await hold(); return { ok: true }; } : undefined,
      will: stage === 'will' ? [hold] : undefined,
      commit: () => 42,
      effects: stage === 'effects' ? [{ run: hold, onError: 'stop' }] : undefined,
      did: stage === 'did' ? [{ run: hold, onError: 'stop' }] : undefined });
    await entered.promise;
    handle.cancel('generated cancellation');
    const receipt = await handle.result;
    expect(receipt).toMatchObject(stage === 'effects' || stage === 'did'
      ? { status: 'completed', committed: true, postCommit: 'cancelled' }
      : { status: 'cancelled', committed: false });
    expect(owner.inspectPending()).toEqual([]);
    expect(source.getSnapshot()).toMatchObject({ pending: 1, ended: false });
    expect(Object.keys(source.getSnapshot()).sort()).toEqual(['ended', 'pending', 'revision']);
    expect(Object.isFrozen(source.getSnapshot())).toBe(true);
    gate.resolve(); await vi.waitFor(() => expect(source.getSnapshot().pending).toBe(0));
    owner.dispose();
  });

  it('keeps commit ownership and its existing post-commit cancellation result', async () => {
    const owner = coordinator(), source = observeOwnedWork(owner)!, gate = deferred<void>(), entered = deferred<void>();
    const handle = owner.run({ kind: 'generated-commit', input: undefined, commit: async () => { entered.resolve(); await gate.promise; return 7; } });
    await entered.promise; handle.cancel();
    expect(owner.inspectPending()).toHaveLength(1); expect(source.getSnapshot().pending).toBe(1);
    gate.resolve(); await expect(handle.result).resolves.toMatchObject({ status: 'completed', committed: true, value: 7, postCommit: 'cancelled' });
    expect(source.getSnapshot().pending).toBe(0); owner.dispose();
  });

  it('retains timed-out underlying work and releases a late rejection without changing the result', async () => {
    const owner = coordinator(), source = observeOwnedWork(owner)!, gate = deferred<void>();
    const handle = owner.run({ kind: 'generated-timeout', input: undefined, timeoutMs: 5, will: [() => gate.promise], commit() {} });
    await expect(handle.result).resolves.toMatchObject({ status: 'failed', error: { code: 'operation-timeout' } });
    expect(source.getSnapshot().pending).toBe(1);
    gate.reject(new Error('generated late failure'));
    await vi.waitFor(() => expect(source.getSnapshot().pending).toBe(0)); owner.dispose();
  });

  it('holds superseded work independently of the replacement and releases each stage exactly once', async () => {
    const owner = coordinator(), source = observeOwnedWork(owner)!, first = deferred<void>(), second = deferred<void>(), entered = deferred<void>();
    const one = owner.run({ kind: 'first', input: undefined, supersedeKey: 'generated', will: [() => { entered.resolve(); return first.promise; }], commit() {} });
    await entered.promise;
    const two = owner.run({ kind: 'second', input: undefined, supersedeKey: 'generated', will: [() => second.promise], commit() {} });
    await one.result; await vi.waitFor(() => expect(source.getSnapshot().pending).toBe(2));
    first.resolve(); await vi.waitFor(() => expect(source.getSnapshot().pending).toBe(1));
    second.resolve(); await two.result; expect(source.getSnapshot().pending).toBe(0); owner.dispose();
  });

  it('observes preparation-lane work after its cancelled receipt and owner retirement', async () => {
    const owner = coordinator(), source = observeOwnedWork(owner)!, gate = deferred<void>(), abort = new AbortController();
    const lane = owner.quiesce('generated').createPreparationLane('generated', abort.signal);
    const pending = lane.run({ id: 'generated', execute: () => gate.promise });
    abort.abort(new Error('generated cancellation')); await expect(pending).rejects.toThrow('generated cancellation');
    expect(source.getSnapshot().pending).toBe(1);
    const samples: number[] = [], release = source.subscribe(() => samples.push(source.getSnapshot().pending));
    owner.dispose(); expect(source.getSnapshot()).toMatchObject({ pending: 1, ended: true });
    gate.resolve(); await vi.waitFor(() => expect(source.getSnapshot().pending).toBe(0));
    expect(source.getSnapshot().ended).toBe(true); expect(samples.at(-1)).toBe(0); release();
  });

  it('does not invoke work when an observation synchronously cancels it, and isolates faulty observers', async () => {
    const owner = coordinator(), source = observeOwnedWork(owner)!, callback = vi.fn();
    let cancel = () => {};
    const release = source.subscribe(() => { if (source.getSnapshot().pending) cancel(); });
    const releaseFaulty = source.subscribe(() => { throw new Error('generated observer'); });
    const handle = owner.run({ kind: 'generated-reentrant', input: undefined, will: [callback], commit: callback });
    cancel = () => handle.cancel('generated reentrant revocation');
    await expect(handle.result).resolves.toMatchObject({ status: 'cancelled', committed: false });
    expect(callback).not.toHaveBeenCalled(); expect(source.getSnapshot().pending).toBe(0);
    release(); releaseFaulty(); owner.dispose();
  });

  it('releases synchronous failures and does not fabricate observations for foreign facades', async () => {
    const owner = coordinator(), source = observeOwnedWork(owner)!;
    await expect(owner.run({ kind: 'generated-throw', input: undefined, commit() { throw new Error('generated'); } }).result).resolves.toMatchObject({ status: 'failed' });
    expect(source.getSnapshot().pending).toBe(0);
    expect(observeOwnedWork({ ...owner })).toBeNull(); expect(observeOwnedWork({})).toBeNull(); owner.dispose();
  });

  it('tracks the actual application hook beyond its cancelled operation and account generation', async () => {
    const gate = deferred<void>(), entered = deferred<void>(), appId = 'com.example.generated-underlying-hook';
    const runtime = createTestRuntime({ authenticationPolicy: 'disabled', initialBundles: [createTestBundle({ bundleIdentifier: appId }, {
      lifecycleHooks: { launch: { will: () => { entered.resolve(); return gate.promise; } } } as never,
    })] }); runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.booted = true; });
    const source = observeOwnedWork(runtime.lifecycle)!;
    const handle = runtime.lifecycle.launch(appId); await entered.promise;
    handle.cancel('generated cancellation'); await expect(handle.result).resolves.toMatchObject({ status: 'cancelled', committed: false });
    try {
      expect(runtime.updateReadiness.inspect().counts).toMatchObject({ operations: 0, operationWork: 0, lifecycleWork: 1 });
      expect(source.getSnapshot().pending).toBe(1);
      const before = runtime.updateReadiness.getSnapshot().client.generation;
      runtime.store.mutate(draft => { draft.loginServices.synId = 'generated-another-account'; });
      expect(runtime.updateReadiness.getSnapshot().client.generation).toBeGreaterThan(before);
      expect(runtime.updateReadiness.getSnapshot().counts.lifecycleWork).toBe(1);
      expect(runtime.updateReadiness.getSnapshot().client.blockers).toContain('owner-busy');
      expect(runtime.updateReadiness.getSnapshot().activationAuthorized).toBe(false);
      expect(runtime.store.getSnapshot().lifecycle[appId]).toBe('registered');
      expect(runtime.windows.list()).toEqual([]);
      expect(runtime.updateReadiness.getSnapshot().coverage.flatMap(row => row.gaps)).toContain('application-lifecycle-owners');
    } finally { gate.resolve(); }
    await vi.waitFor(() => expect(runtime.updateReadiness.getSnapshot().counts.lifecycleWork).toBe(0));
    expect(runtime.updateReadiness.getSnapshot().client.readiness).toBe('unknown');
  });
});
