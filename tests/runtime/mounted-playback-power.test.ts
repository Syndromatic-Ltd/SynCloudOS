// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare, unlockRuntime, mountTestSynWareRuntime } from "./helpers";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { standardWindow } from "../fixtures/windowTestDependencies";
import type { RuntimeAudioAdapter, RuntimeAudioPlaybackCallbacks } from "../../src/SynCloudOS/AudioFX/audioTypes";

const cleanups: (() => void | Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); vi.restoreAllMocks(); document.body.innerHTML = ""; });
async function fixture() {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  const session = { metadata: null as MediaMetadata | null, playbackState: "none", setActionHandler: (a: string, fn: MediaSessionActionHandler | null) => { handlers.set(a, fn); }, setPositionState: vi.fn() };
  const sentinel = new EventTarget() as EventTarget & { released: boolean; release: ReturnType<typeof vi.fn> }; sentinel.released = false; sentinel.release = vi.fn(async () => { sentinel.released = true; sentinel.dispatchEvent(new Event("release")); });
  const wakeRequest = vi.fn(() => Promise.resolve(sentinel));
  const nav = { mediaSession: session, wakeLock: { request: wakeRequest } } as unknown as Navigator;
  Object.defineProperty(window, "MediaMetadata", { configurable: true, value: class { constructor(data: object) { Object.assign(this, data); } } });
  cleanups.push(() => { Reflect.deleteProperty(window, "MediaMetadata"); });
  vi.spyOn(document, "hasFocus").mockReturnValue(true); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let callbacks!: RuntimeAudioPlaybackCallbacks, time = 0;
  const playback = { play: vi.fn(async () => {}), pause: vi.fn(), stop: vi.fn(), setLoop: vi.fn(), setVolume: vi.fn(), setRate: vi.fn(), setCurrentTime: vi.fn((value: number) => { time = value; }), duration: () => 60, currentTime: () => time, dispose: vi.fn() };
  const adapter = { claimActivation: () => Object.freeze({}), loadResource: async (source: string) => ({ id: source, source, byteLength: 4, mimeType: "audio/wav" }), createPlayback: (_: unknown, cb: RuntimeAudioPlaybackCallbacks) => { callbacks = cb; return playback; }, releaseResource: vi.fn(), dispose: vi.fn(), diagnostics: () => ({ resourceCount: 0, objectURLCount: 0, playbackCount: 0, listenerCount: 0, activationCount: 0 }) } as unknown as RuntimeAudioAdapter;
  const env = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ environment: { ...env, browser: { ...env.browser, getNavigator: () => nav }, audio: { acquire: () => ({ adapter, release() {} }) } } }); cleanups.push(() => runtime.dispose());
  unlockRuntime(runtime); await runtime.identity.session.refresh();
  const app = registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.playback-power", displayName: "Playback power", version: "1.0.0" });
  const responderId = `application:${app.bundleIdentifier}`; runtime.responders.register({ id: responderId, kind: "application", parentId: "runtime", scopeId: responderId });
  runtime.store.mutate(draft => { draft.lifecycle[app.bundleIdentifier] = "active"; draft.application.activeAppId = app.bundleIdentifier; });
  const windowController = runtime.windows.create(standardWindow("window:power", { applicationId: app.bundleIdentifier, applicationSessionId: app.bundleIdentifier, content: { rendererId: "application", parameters: { appId: app.bundleIdentifier } }, restorationKey: "power" }));
  await runtime.windows.open(windowController.id);
  const mounted = createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp(app.bundleIdentifier)!, responderId, windowControllerId: windowController.id }); cleanups.push(() => mounted.dispose());
  const button = document.createElement("button"); button.dataset.syncloudosRuntimeOwner = runtime.runtimeId; document.body.append(button); button.focus();
  const context = createSynWareContextValue(mounted.runtime);
  const handle = await mounted.runtime.audio.load({ source: "/generated.wav", ownerId: "owned-controller" });
  let enabled = true;
  const execute = vi.fn(async () => { await mounted.runtime.audio.play(handle.id, mounted.runtime.audio.activation(handle.id)); });
  mounted.runtime.commands.register({ id: "com.example.playback-power.play", responderId, title: { key: "play", fallback: "Play" }, payload: { parse: () => ({ ok: true, value: undefined }) }, defaultKeyBindings: [], scope: "application", undo: { kind: "none" }, validate: () => ({ enabled }), execute });
  const request = { metadata: { title: "Generated sample" }, commands: { play: "com.example.playback-power.play" } } as const;
  return { runtime, mounted, context, handle, session, handlers, sentinel, wakeRequest, playback, execute, request, button, windowController, callbacks: () => callbacks, enabled(value: boolean) { enabled = value; } };
}
async function flush() { for (let i = 0; i < 24; i++) await Promise.resolve(); }
describe("mounted playback and power authority", () => {
  it("leaves unused media and wake capabilities untouched for narrow share/picker host windows", async () => {
    const media=vi.fn(()=>{throw new Error("Unused Media Session was inspected");}),wake=vi.fn(()=>{throw new Error("Unused wake lock was inspected");});
    const nav=Object.defineProperties({},{mediaSession:{get:media},wakeLock:{get:wake}});
    const environment=createTestRuntimeEnvironment();Object.assign(environment.browser,{getNavigator:()=>nav,getWindow:()=>({isSecureContext:true})});
    const runtime=createTestRuntime({environment});cleanups.push(()=>runtime.dispose());
    registerTestSynWare(runtime,{schemaVersion:1,bundleIdentifier:"com.example.unused-native-ports",version:"1.0.0",displayName:"Generated"});
    const mounted=mountTestSynWareRuntime(runtime,"com.example.unused-native-ports");cleanups.push(()=>mounted.dispose());
    const context=createSynWareContextValue(mounted.runtime);expect(context.screenWakeLock.request).toEqual(expect.any(Function));expect(context.audio.present).toEqual(expect.any(Function));
    expect(media).not.toHaveBeenCalled();expect(wake).not.toHaveBeenCalled();
  });
  it("enforces handle ownership and dispatches native transport through actual mounted validation and audio tokens", async () => {
    const f = await fixture(); expect(() => f.context.audio.present("foreign", f.request)).toThrow(/owned/);
    const lease = f.context.audio.present(f.handle.id, f.request); expect(lease.getSnapshot().state).toBe("active");
    f.enabled(false); f.handlers.get("play")!({ action: "play" }); await flush(); expect(f.execute).not.toHaveBeenCalled(); expect(lease.getSnapshot().lastAction).toBe("refused");
    f.enabled(true); f.handlers.get("play")!({ action: "play" }); await flush(); expect(f.execute).toHaveBeenCalledOnce(); expect(f.playback.play).toHaveBeenCalledOnce(); expect(f.session.playbackState).toBe("playing");
    f.context.audio.pause(f.handle.id); expect(f.session.playbackState).toBe("paused");
    await f.context.audio.play(f.handle.id, f.context.audio.activation(f.handle.id)); f.callbacks().onEnded(3); // pause increments the epoch between the two plays
    expect(f.handle.state).toBe("stopped"); expect(f.session.playbackState).toBe("none");
    f.context.audio.release(f.handle.id); expect(lease.getSnapshot().state).toBe("released");
  });
  it("does not acquire wake globally; tracks native pending operations and releases on window retirement", async () => {
    const f = await fixture(); expect(f.wakeRequest).not.toHaveBeenCalled();
    const lease = f.context.screenWakeLock.request("Read generated document"); expect(f.runtime.nativeActivity.pendingOperationCount).toBe(1); await flush(); expect(lease.getSnapshot().state).toBe("held"); expect(f.runtime.nativeActivity.pendingOperationCount).toBe(0);
    f.runtime.store.mutate(draft => { draft.lifecycle["com.example.playback-power"] = "closed"; }); await flush();
    expect(lease.getSnapshot().state).toBe("released"); expect(f.sentinel.release).toHaveBeenCalledOnce();
  });
  it("releases on foreign-runtime DOM focus and requires a new explicit request after focus returns", async () => {
    const f = await fixture(); const lease = f.context.screenWakeLock.request("Reader"); await flush();
    const foreign = document.createElement("button"); foreign.dataset.syncloudosRuntimeOwner = "runtime:other"; document.body.append(foreign); foreign.focus(); await flush();
    expect(lease.getSnapshot().state).toBe("released"); f.button.focus(); await flush(); expect(f.wakeRequest).toHaveBeenCalledOnce();
  });
  it("cancels intervening async command validation when foreground ownership changes", async () => {
    const f = await fixture(); let finish!: (value: { enabled: boolean }) => void; const gate = new Promise<{ enabled: boolean }>(resolve => { finish = resolve; }); const execute = vi.fn();
    f.mounted.runtime.commands.register({ id: "com.example.playback-power.delayed", responderId: f.context.responderId, title: { key: "delay", fallback: "Delayed play" }, payload: { parse: () => ({ ok: true, value: undefined }) }, defaultKeyBindings: [], scope: "application", undo: { kind: "none" }, validate: () => gate, execute });
    const lease = f.context.audio.present(f.handle.id, { metadata: { title: "Generated" }, commands: { play: "com.example.playback-power.delayed" } });
    f.handlers.get("play")!({ action: "play" }); await flush();
    const foreign = document.createElement("button"); foreign.dataset.syncloudosRuntimeOwner = "runtime:other"; document.body.append(foreign); foreign.focus(); finish({ enabled: true }); await flush();
    expect(execute).not.toHaveBeenCalled(); expect(lease.getSnapshot()).toMatchObject({ state: "deferred", lastAction: "cancelled" });
  });
  it("account changes retire presentation, pending native requests and all retained prior-account clients", async () => {
    const f = await fixture(); const presentation = f.context.audio.present(f.handle.id, f.request); const wake = f.context.screenWakeLock.request("Reader"); await flush();
    await f.runtime.identity.session.end({ reason: "Generated account ended" }); await flush();
    expect(presentation.getSnapshot().state).toBe("released"); expect(wake.getSnapshot()).toMatchObject({ state: "released", reason: "account-changed" });
    expect(() => f.context.screenWakeLock.request("Retained stale controller")).toThrow(); expect(f.sentinel.release).toHaveBeenCalledOnce();
  });
  it("runtime disposal releases wake even after the native-activity ledger has ended", async () => {
    const f = await fixture(); const wake = f.context.screenWakeLock.request("Reader"); await flush(); await f.runtime.dispose(); await flush(); expect(f.sentinel.release).toHaveBeenCalledOnce(); expect(wake.getSnapshot().state).toBe("released");
  });
  it("closing the scoped window releases its native wake lease and media presentation", async () => {
    const f = await fixture(); const presentation = f.context.audio.present(f.handle.id, f.request), wake = f.context.screenWakeLock.request("Reader"); await flush();
    const result = await f.runtime.windows.requestClose(f.windowController.id, { reason: "command" }); await flush();
    expect(result.outcome).toBe("closed"); expect(wake.getSnapshot().state).toBe("released"); expect(presentation.getSnapshot().state).toBe("released"); expect(f.session.metadata).toBeNull();
  });
});
