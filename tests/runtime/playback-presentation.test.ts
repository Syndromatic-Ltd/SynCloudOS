// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createMountedPlaybackPresentation } from "../../src/SynCloudOS/AppSDK/mountedPlaybackPresentation";
import type { RuntimeAudioHandle } from "../../src/SynCloudOS/AudioFX/audioTypes";

function fixture(nav?: Navigator) {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const session = { metadata: null as MediaMetadata | null, playbackState: "none", setActionHandler: vi.fn((action: string, fn: MediaSessionActionHandler | null) => { handlers.set(action, fn); }), setPositionState: vi.fn() };
  const navigator = nav ?? { mediaSession: session } as unknown as Navigator;
  const owner = new AbortController();
  let foreground = true;
  const ownerListeners = new Set<() => void>(), playbackListeners = new Set<(id: string) => void>();
  const dispatch = vi.fn(() => Promise.resolve({ status: "executed" }));
  const service = createMountedPlaybackPresentation({ signal: owner.signal, navigator,
    metadataFactory: data => ({ ...data, artwork: [] }) as MediaMetadata, assertLive: () => owner.signal.throwIfAborted(),
    isForeground: () => foreground,
    subscribeOwner: fn => { ownerListeners.add(fn); return () => { ownerListeners.delete(fn); }; },
    subscribePlayback: fn => { playbackListeners.add(fn); return () => { playbackListeners.delete(fn); }; },
    commands: { dispatch: dispatch as never, createPayload: (...fields) => Object.freeze(Object.fromEntries(Array.from({ length: fields.length / 2 }, (_, i) => [fields[i * 2] as string, fields[i * 2 + 1]]))) },
  });
  const handle = { id: "sound:one", state: "ready", currentTime: 20, duration: 100, rate: 1 } as unknown as RuntimeAudioHandle;
  const request = { metadata: { title: "Generated sample", artist: "Fixture" }, commands: { play: "fixture.play", pause: "fixture.pause", stop: "fixture.stop", seekto: "fixture.seek", seekforward: "fixture.seek", seekbackward: "fixture.seek" } } as const;
  const refresh = () => { for (const fn of [...ownerListeners]) fn(); };
  return { owner, session, navigator, handlers, service, dispatch, handle, request, ownerListeners, playbackListeners, refresh,
    foreground(value: boolean) { foreground = value; refresh(); },
    playback(patch: Partial<RuntimeAudioHandle>) { Object.assign(handle, patch); for (const fn of [...playbackListeners]) fn(handle.id); },
  };
}

describe("scoped playback presentation", () => {
  it("does nothing until explicitly presented, projects existing playback facts and clears on release", () => {
    const f = fixture(); expect(f.session.setActionHandler).not.toHaveBeenCalled();
    const lease = f.service.present(f.handle, f.request);
    expect(lease.getSnapshot().state).toBe("active"); expect(f.session.metadata?.title).toBe("Generated sample");
    f.playback({ state: "playing", rate: 1.5 }); expect(f.session.playbackState).toBe("playing");
    expect(f.session.setPositionState).toHaveBeenLastCalledWith({ duration: 100, position: 20, playbackRate: 1.5 });
    f.playback({ state: "paused" }); expect(f.session.playbackState).toBe("paused");
    f.playback({ duration: null }); expect(f.session.setPositionState).toHaveBeenLastCalledWith();
    f.playback({ state: "released" }); expect(lease.getSnapshot().state).toBe("released"); expect(f.session.metadata).toBeNull(); expect(f.session.playbackState).toBe("none");
    f.owner.abort(); expect(f.ownerListeners.size + f.playbackListeners.size).toBe(0);
  });
  it("dispatches through command validation and reports refusal without direct playback authority", async () => {
    const f = fixture(); const lease = f.service.present(f.handle, f.request);
    f.dispatch.mockResolvedValueOnce({ status: "disabled" });
    f.handlers.get("play")!({ action: "play" });
    expect(f.dispatch).toHaveBeenCalledWith("fixture.play", undefined, { source: "system", signal: expect.any(AbortSignal) });
    await Promise.resolve(); expect(lease.getSnapshot().lastAction).toBe("refused");
    f.handlers.get("seekto")!({ action: "seekto", seekTime: 30 });
    expect(f.dispatch).toHaveBeenLastCalledWith("fixture.seek", { time: 30 }, { source: "system", signal: expect.any(AbortSignal) });
    await Promise.resolve(); expect(lease.getSnapshot().lastAction).toBe("completed"); f.owner.abort();
  });
  it.each([NaN, Infinity, -1, 101])("rejects invalid native seeks (%s) without dispatch", time => {
    const f = fixture(); const lease = f.service.present(f.handle, f.request);
    f.handlers.get("seekto")!({ action: "seekto", seekTime: time });
    expect(f.dispatch).not.toHaveBeenCalled(); expect(lease.getSnapshot().lastAction).toBe("failed"); f.owner.abort();
  });
  it("reports failed/activation-denied commands honestly and ignores late results after retirement", async () => {
    const f = fixture(); const lease = f.service.present(f.handle, f.request);
    f.dispatch.mockRejectedValueOnce(new DOMException("No gesture", "NotAllowedError")); f.handlers.get("play")!({ action: "play" });
    await Promise.resolve(); expect(lease.getSnapshot()).toMatchObject({ lastAction: "failed", errorName: "NotAllowedError" });
    let finish!: (value: { status: string }) => void; f.dispatch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    f.handlers.get("pause")!({ action: "pause" }); lease.dispose(); finish({ status: "executed" }); await Promise.resolve();
    expect(lease.getSnapshot().state).toBe("released"); f.owner.abort();
  });
  it("replaces only the mounted owner's presentation, fences old native callbacks across focus changes", () => {
    const f = fixture(); const one = f.service.present(f.handle, f.request); const old = f.handlers.get("play")!;
    const two = f.service.present(f.handle, { ...f.request, metadata: { title: "Second" } });
    expect(one.getSnapshot().state).toBe("released"); old({ action: "play" }); expect(f.dispatch).not.toHaveBeenCalled();
    const beforeFocus = f.handlers.get("play")!; f.foreground(false); expect(two.getSnapshot().state).toBe("deferred"); expect(f.session.metadata).toBeNull();
    f.foreground(true); beforeFocus({ action: "play" }); expect(f.dispatch).not.toHaveBeenCalled();
    one.dispose(); expect(f.session.metadata?.title).toBe("Second"); f.owner.abort();
  });
  it("arbitrates multiple runtimes sharing a page, deferring ambiguous evidence and preserving replacement cleanup", () => {
    const a = fixture(); const b = fixture(a.navigator);
    const one = a.service.present(a.handle, a.request);
    b.foreground(false); const two = b.service.present(b.handle, { ...b.request, metadata: { title: "Other" } });
    expect(one.getSnapshot().state).toBe("active"); expect(two.getSnapshot().state).toBe("deferred");
    b.foreground(true); expect(one.getSnapshot().state).toBe("deferred"); expect(two.getSnapshot().state).toBe("deferred"); expect(a.session.metadata).toBeNull();
    a.foreground(false); expect(two.getSnapshot().state).toBe("active"); expect(a.session.metadata?.title).toBe("Other");
    a.owner.abort(); expect(a.session.metadata?.title).toBe("Other"); b.owner.abort(); expect(a.session.metadata).toBeNull();
  });
  it("handles an unavailable API and individual unsupported actions", () => {
    const missing = fixture({} as Navigator); const unsupported = missing.service.present(missing.handle, missing.request);
    expect(unsupported.getSnapshot().state).toBe("unsupported"); missing.owner.abort();
    const f = fixture(); f.session.setActionHandler.mockImplementation((action, fn) => { if (action === "seekto") throw new DOMException("unsupported", "NotSupportedError"); f.handlers.set(action, fn); });
    const lease = f.service.present(f.handle, f.request); expect(lease.getSnapshot().actions).not.toContain("seekto"); expect(lease.getSnapshot().state).toBe("active"); f.owner.abort();
  });
  it("bounds explicit metadata, rejects accessors and never infers or fetches artwork", () => {
    const f = fixture(); const getter = vi.fn(() => "sensitive");
    expect(() => f.service.present(f.handle, { ...f.request, metadata: Object.defineProperty({}, "title", { get: getter }) as never })).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled(); expect(() => f.service.present(f.handle, { ...f.request, metadata: { title: "x".repeat(513) } })).toThrow(TypeError);
    const lease = f.service.present(f.handle, f.request); lease.updateMetadata({ title: "Explicit new title" }); expect(f.session.metadata?.title).toBe("Explicit new title");
    lease.dispose(); expect(() => lease.updateMetadata({ title: "Late" })).toThrow(); f.owner.abort();
  });
  it("caller cancellation releases presentation and subscriptions stop at owner disposal", () => {
    const f = fixture(); const caller = new AbortController(); const lease = f.service.present(f.handle, f.request, caller.signal); const observer = vi.fn(); lease.subscribe(observer);
    caller.abort(); expect(lease.getSnapshot().state).toBe("released"); const calls = observer.mock.calls.length;
    f.refresh(); expect(observer).toHaveBeenCalledTimes(calls); f.owner.abort(); expect(f.ownerListeners.size).toBe(0);
  });
  it("does not register a lease when app record reflection retires its owner", () => {
    const f=fixture(); const request=new Proxy(f.request,{ownKeys(target){f.owner.abort();return Reflect.ownKeys(target);}});
    expect(()=>f.service.present(f.handle,request)).toThrow(); expect(f.session.setActionHandler).not.toHaveBeenCalled(); expect(f.ownerListeners.size+f.playbackListeners.size).toBe(0);
  });
  it("serializes replacement installed by a cancellation observer before old native teardown", () => {
    const f=fixture(); f.dispatch.mockReturnValueOnce(new Promise(()=>{}));
    const first=f.service.present(f.handle,f.request);let replacement: ReturnType<typeof f.service.present> | null=null;
    f.handlers.get("play")!({action:"play"});
    first.subscribe(()=>{if(first.getSnapshot().lastAction==="cancelled"&&!replacement)replacement=f.service.present(f.handle,{...f.request,metadata:{title:"Replacement"}});});
    first.dispose();expect(replacement!.getSnapshot().state).toBe("active");expect(f.session.metadata?.title).toBe("Replacement");expect(f.handlers.get("play")).toEqual(expect.any(Function));
    first.dispose();expect(f.session.metadata?.title).toBe("Replacement");f.owner.abort();expect(f.session.metadata).toBeNull();
  });
});
