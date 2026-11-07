import { describe, expect, it, vi } from 'vitest';
import { NativeOperationActivity } from '../../src/SynCloudOS/Updates';
import { createMountedFilePanelClient } from '../../src/SynCloudOS/AppSDK/mountedFilePanelClient';
import type { FilePanelFileHandle, FilePanelWritable, FileSystemAccessPanelPort, SavePanelRequest, FilePanelSaveTarget } from '../../src/SynCloudOS/FilePanels';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(next => { resolve = next; }); return { promise, resolve }; }
const request: SavePanelRequest = { id: 'generated-native-work', accepts: [], suggestedName: 'generated.txt', destination: 'persistent-handle-required', conflictPolicy: 'fail-if-exists' };
const payload = { fileName: 'generated.txt', mediaType: 'text/plain', data: new TextEncoder().encode('generated harmless bytes') };
function fixture() {
  const runtimeOwner = new AbortController(), mountOwner = new AbortController(), activity = new NativeOperationActivity(runtimeOwner.signal);
  const writable: FilePanelWritable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  const handle: FilePanelFileHandle = { name: 'generated.txt', queryPermission: vi.fn(async () => 'granted' as const), requestPermission: vi.fn(async () => 'granted' as const),
    getFile: vi.fn(async () => new File(['generated'], 'generated.txt')), createWritable: vi.fn(async () => writable) };
  const port: FileSystemAccessPanelPort = { isSecureContext: () => true, isAvailable: () => true, hasTransientUserActivation: () => true,
    openFiles: async () => [handle], openDirectory: async () => null, saveFile: async () => ({ handle, exists: false }) };
  const client = createMountedFilePanelClient({ native: port, nativeActivity: activity, signal: mountOwner.signal,
    assertLive: () => mountOwner.signal.throwIfAborted(), activation: () => true, access: () => ({ declared: true, allowed: true }) });
  async function target(): Promise<Extract<FilePanelSaveTarget, { kind: 'file-handle' }>> {
    const selected = await client.save(request); expect(selected.kind).toBe('accepted');
    if (selected.kind !== 'accepted' || selected.values[0]?.kind !== 'file-handle') throw new Error('Generated fixture target unavailable');
    return selected.values[0];
  }
  return { runtimeOwner, mountOwner, activity, writable, handle, client, target };
}

describe('native file work observation through the mounted service', () => {
  it('observes actual file writes until cancellation cleanup really settles', async () => {
    const f = fixture(), target = await f.target(), entered = deferred<void>(), write = deferred<void>(), abortEntered = deferred<void>(), cleanup = deferred<void>(), caller = new AbortController();
    vi.mocked(f.writable.write).mockImplementation(() => { entered.resolve(); return write.promise; });
    vi.mocked(f.writable.abort).mockImplementation(() => { abortEntered.resolve(); return cleanup.promise; });
    const pending = target.sink.write(payload, caller.signal); await entered.promise;
    let failure: unknown;
    try {
      expect(f.activity.pendingOperationCount).toBe(1); caller.abort(); expect(f.activity.pendingOperationCount).toBe(1);
      write.resolve(); await abortEntered.promise; expect(f.activity.pendingOperationCount).toBe(1);
    } catch (error) { failure = error; } finally { caller.abort(); write.resolve(); cleanup.resolve(); }
    await expect(pending).rejects.toMatchObject({ code: 'operation-aborted' });
    expect(f.activity.pendingOperationCount).toBe(0); if (failure) throw failure;
  });

  it('observes a close already in progress without falsely changing the committed completion to cancellation', async () => {
    const f = fixture(), target = await f.target(), entered = deferred<void>(), close = deferred<void>(), caller = new AbortController();
    vi.mocked(f.writable.close).mockImplementation(() => { entered.resolve(); return close.promise; });
    const pending = target.sink.write(payload, caller.signal); await entered.promise;
    try { expect(f.activity.pendingOperationCount).toBe(1); caller.abort(); expect(f.activity.pendingOperationCount).toBe(1); }
    finally { close.resolve(); }
    await expect(pending).resolves.toMatchObject({ kind: 'exported' }); expect(f.activity.pendingOperationCount).toBe(0);
  });

  it('observes permission requests only when explicitly invoked and does not request them during status inspection', async () => {
    const f = fixture(); f.client.getStatus(); expect(f.handle.queryPermission).not.toHaveBeenCalled(); expect(f.handle.requestPermission).not.toHaveBeenCalled();
    const target = await f.target(), permission = deferred<'granted'>(), entered = deferred<void>();
    vi.mocked(f.handle.requestPermission).mockImplementation(() => { entered.resolve(); return permission.promise; });
    const pending = target.reference.requestPermission(); await entered.promise;
    try { expect(f.activity.pendingOperationCount).toBe(1); } finally { permission.resolve('granted'); }
    await expect(pending).resolves.toBe('granted'); expect(f.activity.pendingOperationCount).toBe(0);
  });

  it('retains a native read until it settles and prevents its data returning to a released reference', async () => {
    const f = fixture(), target = await f.target(), entered = deferred<void>(), file = deferred<File>();
    vi.mocked(f.handle.getFile).mockImplementation(() => { entered.resolve(); return file.promise; });
    const pending = target.reference.read(); await entered.promise;
    try { expect(f.activity.pendingOperationCount).toBe(1); target.reference.release('runtime-disposed'); expect(f.activity.pendingOperationCount).toBe(1); }
    finally { file.resolve(new File(['generated'], 'generated.txt')); }
    await expect(pending).rejects.toMatchObject({ code: 'reference-released' }); expect(f.activity.pendingOperationCount).toBe(0);
  });

  it('retains rollback of a late writable after wrapper retirement', async () => {
    const f = fixture(), target = await f.target(), entered = deferred<void>(), writable = deferred<FilePanelWritable>(), abortEntered = deferred<void>(), cleanup = deferred<void>();
    vi.mocked(f.handle.createWritable).mockImplementation(() => { entered.resolve(); return writable.promise; });
    vi.mocked(f.writable.abort).mockImplementation(() => { abortEntered.resolve(); return cleanup.promise; });
    const pending = target.reference.createWritable(); await entered.promise;
    target.reference.release('runtime-disposed'); writable.resolve(f.writable); await abortEntered.promise;
    try { expect(f.activity.pendingOperationCount).toBe(1); } finally { cleanup.resolve(); }
    await expect(pending).rejects.toMatchObject({ code: 'reference-released' }); expect(f.activity.pendingOperationCount).toBe(0);
  });

  it('does not invoke native work after observation synchronously revokes its mounted owner', async () => {
    const f = fixture(), target = await f.target(); vi.mocked(f.handle.queryPermission).mockClear();
    const release = f.activity.subscribe(() => { if (f.activity.pendingOperationCount) f.mountOwner.abort(); });
    await expect(target.reference.createWritable()).rejects.toBeDefined();
    expect(f.handle.queryPermission).not.toHaveBeenCalled(); expect(f.handle.createWritable).not.toHaveBeenCalled();
    expect(f.activity.pendingOperationCount).toBe(0); release();
  });

  it('does not prevent mandatory rollback when the runtime instrumentation has ended', async () => {
    const f = fixture(), target = await f.target(), entered = deferred<void>(), write = deferred<void>();
    vi.mocked(f.writable.write).mockImplementation(() => { entered.resolve(); return write.promise; });
    const pending = target.sink.write(payload); await entered.promise;
    f.mountOwner.abort(); f.runtimeOwner.abort(); write.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'operation-aborted' });
    expect(f.writable.abort).toHaveBeenCalledTimes(1); expect(f.activity.pendingOperationCount).toBe(0); expect(f.activity.read().known).toBe(false);
  });
});

it("observes native file byte acquisition after getFile settles", async () => {
  const f = fixture(), target = await f.target(), entered = deferred<void>(), bytes = deferred<ArrayBuffer>();
  const file = new File(["generated"], "generated.txt");
  Object.defineProperty(file, "arrayBuffer", { value: () => { entered.resolve(); return bytes.promise; } });
  vi.mocked(f.handle.getFile).mockResolvedValue(file);
  const pending = target.reference.read(); await entered.promise;
  try { expect(f.activity.pendingOperationCount).toBe(1); target.reference.release("runtime-disposed"); expect(f.activity.pendingOperationCount).toBe(1); }
  finally { bytes.resolve(new Uint8Array([1]).buffer); }
  await expect(pending).rejects.toMatchObject({ code: "reference-released" });
  expect(f.activity.pendingOperationCount).toBe(0);
});

it("observes browser-input file byte acquisition until native settlement", async () => {
  const runtime = new AbortController(), owner = new AbortController(), activity = new NativeOperationActivity(runtime.signal);
  const entered = deferred<void>(), bytes = deferred<ArrayBuffer>(), file = new File(["generated"], "generated.txt");
  Object.defineProperty(file, "arrayBuffer", { value: () => { entered.resolve(); return bytes.promise; } });
  const client = createMountedFilePanelClient({ nativeActivity: activity, signal: owner.signal, assertLive: () => owner.signal.throwIfAborted(),
    activation: () => true, access: () => ({ declared: true, allowed: true }),
    picker: { pickFiles: async () => ({ kind: "accepted", files: [file], cleanup() {} }) } });
  const selected = await client.open({ id: "input-read", accepts: [], selection: "single-file", access: "read", requires: [] });
  if (selected.kind !== "accepted" || selected.values[0]!.kind === "directory-handle") throw new Error("Expected file");
  const reference = selected.values[0]!, pending = reference.read(); await entered.promise;
  try { expect(activity.pendingOperationCount).toBe(1); reference.release("runtime-disposed"); expect(activity.pendingOperationCount).toBe(1); }
  finally { bytes.resolve(new Uint8Array([1]).buffer); }
  await expect(pending).rejects.toMatchObject({ code: "reference-released" });
  expect(activity.pendingOperationCount).toBe(0);
});

it("does not start input-file byte work after an activity listener releases its reference", async () => {
  const runtime = new AbortController(), owner = new AbortController(), activity = new NativeOperationActivity(runtime.signal);
  const file = new File(["generated"], "generated.txt"), read = vi.spyOn(file, "arrayBuffer");
  const client = createMountedFilePanelClient({ nativeActivity: activity, signal: owner.signal, assertLive: () => owner.signal.throwIfAborted(),
    activation: () => true, access: () => ({ declared: true, allowed: true }),
    picker: { pickFiles: async () => ({ kind: "accepted", files: [file], cleanup() {} }) } });
  const selected = await client.open({ id: "input-admission", accepts: [], selection: "single-file", access: "read", requires: [] });
  if (selected.kind !== "accepted" || selected.values[0]!.kind === "directory-handle") throw new Error("Expected file");
  const reference = selected.values[0]!, unsubscribe = activity.subscribe(() => { if (activity.pendingOperationCount) reference.release("runtime-disposed"); });
  try {
    await expect(reference.read()).rejects.toMatchObject({ code: "reference-released" });
    expect(read).not.toHaveBeenCalled();
    expect(activity.pendingOperationCount).toBe(0);
  } finally { unsubscribe(); }
});
