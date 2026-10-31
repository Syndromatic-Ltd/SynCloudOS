// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createMountedPlaybackPresentation, type MountedPlaybackSource } from "../../src/SynCloudOS/AppSDK/mountedPlaybackPresentation";
import { createMountedVideoClient } from "../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { MEFXMonotonicClock } from "../../src/FX/MediaFX/MEFXClock";
import { MEFXTimebase } from "../../src/FX/MediaFX/MEFXTimebase";
import { AVPresentationCoordinator } from "../../src/SynCloudOS/VideoFX/AVPresentationCoordinator";
import { AudioMediaClockBridge } from "../../src/SynCloudOS/AudioFX/AudioMediaClockBridge";
import { AUFXClockObservation } from "../../src/FX/AudioFX/AUFXClockObservation";
import type { VideoCaptureService } from "../../src/SynCloudOS/VideoFX/VideoCaptureService";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });
function fixture(native?: Navigator) {
  const owner = new AbortController(), handlers = new Map<string, MediaSessionActionHandler | null>();
  const session = { metadata: null as MediaMetadata | null, playbackState: "none", setActionHandler: vi.fn((key: string, value: MediaSessionActionHandler | null) => { handlers.set(key, value); }), setPositionState: vi.fn() };
  const navigator = native ?? { mediaSession: session } as unknown as Navigator;
  const clock = new MEFXMonotonicClock("test:video-presentation", 0, () => 0);
  const timebase = new MEFXTimebase(clock, { rateNumerator: 0n });
  const listeners = new Set<() => void>(); let active = true;
  const dispatch = vi.fn(async () => ({ status: "executed" }));
  const presentation = createMountedPlaybackPresentation({
    signal: owner.signal, navigator, metadataFactory: value => ({ ...value, artwork: [] }) as MediaMetadata,
    assertLive: () => owner.signal.throwIfAborted(), isForeground: () => active,
    subscribeOwner: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribePlayback: () => () => {}, commands: { dispatch: dispatch as never, createPayload: () => ({}) },
  });
  const video = createMountedVideoClient({} as VideoCaptureService, owner.signal, () => [], () => true,
    undefined, undefined, undefined, undefined, {}, undefined, (source, request, signal) => presentation.present(source, request, signal));
  const create = () => video.createPresentationCoordinator({ mode: "media", timebase, present() {} });
  const request = { metadata: { title: "AnimationFX showcase" }, commands: { play: "example.playMedia", pause: "example.pauseMedia" } } as const;
  cleanup.push(() => { owner.abort(); timebase.dispose(); clock.dispose(); });
  return { owner, handlers, session, navigator, timebase, video, create, request, presentation, dispatch, listeners,
    foreground(value: boolean) { active = value; for (const listener of [...listeners]) listener(); } };
}

it("projects the exact issued coordinator without a finite track position or second player", async () => {
  const f = fixture(), coordinator = f.create();
  const lease = f.video.present(coordinator, f.request);
  expect(lease.getSnapshot()).toMatchObject({ state: "active", actions: ["play", "pause"] });
  expect(f.session.metadata?.title).toBe("AnimationFX showcase");
  expect(f.session.playbackState).toBe("paused");
  expect(f.session.setPositionState).toHaveBeenLastCalledWith();
  await coordinator.play(); expect(f.session.playbackState).toBe("playing");
  await coordinator.pause(); expect(f.session.playbackState).toBe("paused");
  coordinator.dispose(); expect(lease.getSnapshot().state).toBe("released");
  expect(f.session.metadata).toBeNull(); expect(f.session.playbackState).toBe("none");
});

it("rejects foreign, fabricated and retired coordinators before presentation", () => {
  const f = fixture(), other = fixture(); const own = f.create(), foreign = other.create();
  expect(() => f.video.present(foreign, f.request)).toThrow(expect.objectContaining({ name: "SecurityError" }));
  expect(() => f.video.present({} as never, f.request)).toThrow(expect.objectContaining({ name: "SecurityError" }));
  own.dispose(); expect(() => f.video.present(own, f.request)).toThrow(expect.objectContaining({ name: "SecurityError" }));
  f.owner.abort(); expect(() => f.video.present(foreign, f.request)).toThrow(expect.objectContaining({ name: "AbortError" }));
  expect(f.session.metadata).toBeNull();
});

it("rejects native seek/stop declarations for a looping video source", () => {
  const f = fixture(), coordinator = f.create();
  for (const action of ["stop", "seekto", "seekforward", "seekbackward"])
    expect(() => f.video.present(coordinator, { metadata: f.request.metadata, commands: { [action]: "example.no" } } as never)).toThrow(TypeError);
  expect(f.session.metadata).toBeNull(); expect(f.dispatch).not.toHaveBeenCalled();
});

it("uses validated commands and cancels/fences stale callbacks on replacement", async () => {
  const f = fixture(), one = f.create(), two = f.create();
  const old = f.video.present(one, f.request), stale = f.handlers.get("play")!;
  f.dispatch.mockResolvedValueOnce({ status: "disabled" });
  stale({ action: "play" }); await Promise.resolve();
  expect(old.getSnapshot().lastAction).toBe("refused");
  const next = f.video.present(two, { ...f.request, metadata: { title: "New attempt" } });
  expect(old.getSnapshot().state).toBe("released");
  stale({ action: "play" }); expect(f.dispatch).toHaveBeenCalledTimes(1);
  one.dispose(); expect(f.session.metadata?.title).toBe("New attempt");
  f.handlers.get("pause")!({ action: "pause" }); await Promise.resolve();
  expect(f.dispatch).toHaveBeenLastCalledWith("example.pauseMedia", undefined, { source: "system", signal: expect.any(AbortSignal) });
  expect(next.getSnapshot().lastAction).toBe("completed");
});

it("revokes pending transport dispatch on hide and requires current callbacks on return", async () => {
  const f = fixture(), coordinator = f.create(); let finish!: (value: { status: string }) => void;
  f.dispatch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const lease = f.video.present(coordinator, f.request), old = f.handlers.get("play")!;
  old({ action: "play" }); const signal = (f.dispatch.mock.calls[0] as unknown as [unknown, unknown, { signal: AbortSignal }])[2].signal;
  f.foreground(false); expect(signal.aborted).toBe(true); expect(f.session.metadata).toBeNull();
  finish({ status: "executed" }); await Promise.resolve(); expect(lease.getSnapshot()).toMatchObject({ state: "deferred", lastAction: "cancelled" });
  f.foreground(true); old({ action: "play" }); expect(f.dispatch).toHaveBeenCalledTimes(1);
  expect(f.session.metadata?.title).toBe("AnimationFX showcase");
});

it("shares page arbitration across video owners and clears all on mount/account retirement", () => {
  const a = fixture(), b = fixture(a.navigator); b.foreground(false);
  const one = a.video.present(a.create(), a.request), two = b.video.present(b.create(), b.request);
  expect(one.getSnapshot().state).toBe("active"); expect(two.getSnapshot().state).toBe("deferred");
  b.foreground(true); expect(one.getSnapshot().state).toBe("deferred"); expect(two.getSnapshot().state).toBe("deferred");
  a.foreground(false); expect(two.getSnapshot().state).toBe("active");
  b.owner.abort(); expect(two.getSnapshot().state).toBe("released"); expect(a.session.metadata).toBeNull();
  a.owner.abort(); expect(a.listeners.size + b.listeners.size).toBe(0);
});

it("reports unavailable native presentation and observes caller cancellation", () => {
  const f = fixture({} as Navigator), caller = new AbortController();
  const lease = f.video.present(f.create(), f.request, caller.signal);
  expect(lease.getSnapshot().state).toBe("unsupported"); caller.abort(); expect(lease.getSnapshot().state).toBe("released");
});

it("cleans up when source subscription throws or synchronously retires the owner", () => {
  const f = fixture(); const source: MountedPlaybackSource = { state: "paused", duration: null, currentTime: 0, rate: 1, subscribe: () => { throw new Error("source ended"); } };
  expect(() => f.presentation.present(source, f.request)).toThrow("source ended"); expect(f.session.metadata).toBeNull();
  const remove = vi.fn(); source.subscribe = () => { f.owner.abort(); return remove; };
  const lease = f.presentation.present(source, f.request);
  expect(lease.getSnapshot().state).toBe("released"); expect(remove).toHaveBeenCalledOnce(); expect(f.listeners.size).toBe(0);
});

it("projects no completed playback while the existing audio transport awaits acknowledgement", async () => {
  const clock = new MEFXMonotonicClock("test:ack", 0, () => 0), timebase = new MEFXTimebase(clock, { rateNumerator: 0n });
  const owner = new AbortController(); let acknowledge!: (value: any) => void;
  const anchor = new AUFXClockObservation({ samplePosition: 0, sampleRate: 8, domain: "output", hostAnchorSeconds: null, uncertaintySeconds: 0, discontinuityGeneration: 0 });
  const bridge = new AudioMediaClockBridge({ sampleRate: 8, mediaClock: timebase, observeAudioClock: () => anchor });
  const transport = { signal: owner.signal, apply: () => new Promise<any>(resolve => { acknowledge = resolve; }), dispose: () => owner.abort() };
  const coordinator = new AVPresentationCoordinator({ timebase, audioBridge: bridge, audioTransport: transport, present() {} });
  cleanup.push(() => { coordinator.dispose(); bridge.dispose(); timebase.dispose(); clock.dispose(); });
  const seen: string[] = []; const remove = coordinator.subscribePlayback(() => seen.push(coordinator.playbackState));
  const pending = coordinator.play(); expect(coordinator.playbackState).toBe("stopped"); expect(seen).toEqual(["stopped"]);
  acknowledge({ version: 1, backend: "audio-worklet", positionSeconds: 0, audioAnchor: anchor }); await pending;
  expect(coordinator.playbackState).toBe("playing"); expect(seen.at(-1)).toBe("playing");
  remove(); coordinator.dispose(); expect(seen.at(-1)).toBe("playing");
});

it("allows reentrant observer disposal without retaining observers or native handlers", async () => {
  const f = fixture(), coordinator = f.create() as AVPresentationCoordinator;
  const lease = f.video.present(coordinator, f.request);
  const observer = vi.fn(() => { coordinator.dispose(); }); coordinator.subscribePlayback(observer);
  await coordinator.play(); expect(coordinator.playbackState).toBe("released"); expect(lease.getSnapshot().state).toBe("released");
  expect(f.session.metadata).toBeNull(); const count = observer.mock.calls.length; coordinator.dispose(); expect(observer).toHaveBeenCalledTimes(count);
});

it("retires observational presentation when the underlying timebase ends before its coordinator", () => {
  const f = fixture(), coordinator = f.create(), lease = f.video.present(coordinator, f.request), old = f.handlers.get("play")!;
  f.timebase.dispose();
  expect(() => f.foreground(false)).not.toThrow();
  expect(lease.getSnapshot().state).toBe("released"); expect(f.session.metadata).toBeNull();
  old({ action: "play" }); expect(f.dispatch).not.toHaveBeenCalled();
  expect(() => f.video.present(coordinator, f.request)).toThrow(expect.objectContaining({ name: "SecurityError" }));
});
