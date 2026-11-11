import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserClipboardAdapter, type BrowserClipboardPort } from '../../src/SynCloudOS/PlatformAdapters/BrowserClipboardAdapter';
import { NativeOperationActivity } from '../../src/SynCloudOS/Updates';
import { authoriseTestRuntime, createTestRuntime, createTestRuntimeEnvironment } from './helpers';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(next => { resolve = next; }); return { promise, resolve }; }
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose('generated clipboard observation'); });
function runtimeFixture(options: Parameters<typeof createTestRuntime>[0]) {
  const runtime = authoriseTestRuntime(createTestRuntime(options));
  runtime.store.mutate(draft => { draft.loginServices.accessClass = 'team'; });
  runtimes.push(runtime); return runtime;
}
function adapter(clipboard: BrowserClipboardPort | null, options: { secure?: boolean; active?: boolean; activity?: NativeOperationActivity } = {}) {
  const owner = new AbortController(), activity = options.activity ?? new NativeOperationActivity(owner.signal);
  return { owner, activity, adapter: new BrowserClipboardAdapter({ clipboard, isSecureContext: () => options.secure ?? true,
    isUserActive: () => options.active ?? true, createItem: null, nativeActivity: activity }) };
}

describe('scoped clipboard work observation', () => {
  it('observes a real adapter promise until its cancelled text read actually settles', async () => {
    const gate = deferred<string>(), entered = deferred<void>(), caller = new AbortController();
    const f = adapter({ readText: () => { entered.resolve(); return gate.promise; } });
    const pending = f.adapter.read(['text/plain'], caller.signal); await entered.promise;
    try { expect(f.activity.pendingOperationCount).toBe(1); caller.abort(); expect(f.activity.pendingOperationCount).toBe(1); }
    finally { gate.resolve('generated-only text'); }
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(f.activity.pendingOperationCount).toBe(0);
  });

  it('observes text writes and never publishes their text into readiness facts', async () => {
    const gate = deferred<void>(), entered = deferred<void>();
    const f = adapter({ writeText: () => { entered.resolve(); return gate.promise; } });
    const pending = f.adapter.write([{ type: 'text/plain', value: 'generated-secret-not-a-diagnostic' }]); await entered.promise;
    try { expect(f.activity.pendingOperationCount).toBe(1); expect(JSON.stringify(f.activity.read())).not.toContain('generated-secret'); }
    finally { gate.resolve(); }
    await pending; expect(f.activity.pendingOperationCount).toBe(0);
  });

  it('keeps the complete typed read in flight while a native item is still supplying its Blob', async () => {
    const gate = deferred<Blob>(), entered = deferred<void>();
    const item = { types: ['text/plain'], getType: () => { entered.resolve(); return gate.promise; } } as unknown as ClipboardItem;
    const f = adapter({ read: async () => [item] }); const pending = f.adapter.read(['text/plain']); await entered.promise;
    try { expect(f.activity.pendingOperationCount).toBe(1); } finally { gate.resolve(new Blob(['generated blob'], { type: 'text/plain' })); }
    await expect(pending).resolves.toEqual([{ type: 'text/plain', value: 'generated blob' }]); expect(f.activity.pendingOperationCount).toBe(0);
  });

  it('does not invoke a native port when an observation revokes the caller', async () => {
    const writeText = vi.fn(async () => {}), caller = new AbortController(), f = adapter({ writeText });
    const release = f.activity.subscribe(() => { if (f.activity.pendingOperationCount) caller.abort(); });
    await expect(f.adapter.write([{ type: 'text/plain', value: 'generated' }], caller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(writeText).not.toHaveBeenCalled(); expect(f.activity.pendingOperationCount).toBe(0); release();
  });

  it('preserves unsupported, insecure, inactive and already-aborted admission without native calls', async () => {
    const writeText = vi.fn(async () => {}), readText = vi.fn(async () => 'generated');
    for (const options of [{ secure: false }, { active: false }]) {
      const f = adapter({ writeText, readText }, options);
      await expect(f.adapter.write([{ type: 'text/plain', value: 'generated' }])).rejects.toMatchObject({ name: 'PasteboardUnavailableError' });
      expect(f.activity.pendingOperationCount).toBe(0);
    }
    const f = adapter(null); await expect(f.adapter.read(['text/plain'])).rejects.toMatchObject({ name: 'PasteboardUnavailableError' });
    const caller = new AbortController(); caller.abort(); const live = adapter({ writeText, readText });
    await expect(live.adapter.read(['text/plain'], caller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(writeText).not.toHaveBeenCalled(); expect(readText).not.toHaveBeenCalled();
  });

  it('retains the underlying promise after runtime retirement and ends with unknown native coverage', async () => {
    const gate = deferred<string>(), entered = deferred<void>(), f = adapter({ readText: () => { entered.resolve(); return gate.promise; } });
    const pending = f.adapter.read(['text/plain']); await entered.promise; f.owner.abort();
    try { expect(f.activity.pendingOperationCount).toBe(1); expect(f.activity.read().known).toBe(false); }
    finally { gate.resolve('generated-only'); }
    await pending; expect(f.activity.pendingOperationCount).toBe(0); expect(f.activity.read().known).toBe(false);
  });

  it('creates a separate observed adapter for each runtime using one shared environment', async () => {
    const environment = createTestRuntimeEnvironment(), gate = deferred<void>(), entered = deferred<void>(), legacy = vi.fn(async () => {});
    const instances: BrowserClipboardAdapter[] = [];
    Object.assign(environment, { clipboard: { read: async () => [], write: legacy }, createClipboardAdapter: (activity: NativeOperationActivity) => {
      const value = adapter({ writeText: () => { entered.resolve(); return gate.promise; } }, { activity }).adapter; instances.push(value); return value;
    } });
    const a = runtimeFixture({ environment }), b = runtimeFixture({ environment });
    const pending = a.pasteboards.named('system').write([{ type: 'text/plain', value: 'generated runtime one' }]); await Promise.race([entered.promise, pending.then(() => { throw new Error('Generated port was not entered'); })]);
    try {
      expect(instances).toHaveLength(2); expect(instances[0]).not.toBe(instances[1]);
      expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1); expect(b.updateReadiness.getSnapshot().counts.nativeOperations).toBe(0);
      expect(a.updateReadiness.getSnapshot().activationAuthorized).toBe(false); expect(a.updateReadiness.getSnapshot().coverage.flatMap(row => row.gaps)).toContain('clipboard-download');
    } finally { gate.resolve(); }
    await pending; expect(a.updateReadiness.getSnapshot().counts.nativeOperations).toBe(0); expect(legacy).not.toHaveBeenCalled();
  });

  it('preserves an explicit host adapter override instead of silently replacing its authority', async () => {
    const factory = vi.fn(), write = vi.fn(async () => {}), environment = createTestRuntimeEnvironment();
    Object.assign(environment, { createClipboardAdapter: factory });
    const runtime = runtimeFixture({ environment, adapters: { clipboard: { read: async () => [], write } } });
    await runtime.pasteboards.named('system').write([{ type: 'text/plain', value: 'generated override' }]);
    expect(factory).not.toHaveBeenCalled(); expect(write).toHaveBeenCalledTimes(1);
  });
});
