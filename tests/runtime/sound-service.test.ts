/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRuntimeAudioService, AudioActivationRequiredError, type RuntimeAudioAdapter,
  type RuntimeAudioAdapterFactory, type RuntimeAudioAdapterLease, type RuntimeAudioPlayback,
  type RuntimeAudioPlaybackCallbacks, type RuntimeAudioResource } from "../../src/SynCloudOS/AudioFX";
import { BrowserSoundAdapterFactory, type BrowserSoundElement, type BrowserSoundPlatform } from "../../src/SynCloudOS/PlatformAdapters/BrowserSoundAdapter";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare, mountTestSynWareRuntime } from "./helpers";
import { createSettingsService } from "../../src/SynCloudOS/Settings/settingsService";
import { standardWindow } from "../fixtures/windowTestDependencies";
import { createRuntimeCacheRegistry } from "../../src/SynCloudOS/Cache/RuntimeCacheRegistry";
import { createBrowserRuntimeEnvironment } from "../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class RecordingPlayback implements RuntimeAudioPlayback {
  readonly playResults: Array<ReturnType<typeof deferred<void>>> = [];
  readonly play = vi.fn((_activation?: unknown, _epoch?: number) => {
    const next = this.playResults.shift();
    return next?.promise ?? Promise.resolve();
  });
  readonly pause = vi.fn();
  readonly stop = vi.fn();
  readonly setLoop = vi.fn();
  readonly setVolume = vi.fn();
  readonly setRate = vi.fn();
  readonly setCurrentTime = vi.fn((time: number) => { this.timeValue = time; });
  readonly dispose = vi.fn();
  durationValue = 3.5;
  timeValue = 0;
  duration = () => this.durationValue;
  currentTime = () => this.timeValue;
}

class RecordingAdapter implements RuntimeAudioAdapter {
  readonly resources = new Map<string, RuntimeAudioResource>();
  readonly callbacks: RuntimeAudioPlaybackCallbacks[] = [];
  readonly playbacks: RecordingPlayback[] = [];
  readonly loads: string[] = [];
  readonly loadSignals = new Map<string, AbortSignal>();
  readonly releases: RuntimeAudioResource[] = [];
  readonly pendingLoads = new Map<string, ReturnType<typeof deferred<RuntimeAudioResource>>>();
  autoLoad = true;
  disposed = false;

  claimActivation() { return Object.freeze({}) as never; }

  loadResource(source: string, signal: AbortSignal) {
    this.loads.push(source);
    this.loadSignals.set(source, signal);
    if (!this.autoLoad) {
      const pending = deferred<RuntimeAudioResource>();
      this.pendingLoads.set(source, pending);
      return pending.promise;
    }
    const resource = Object.freeze({ id: `resource:${source}`, source, byteLength: 4, mimeType: "audio/wav" });
    this.resources.set(resource.id, resource);
    return Promise.resolve(resource);
  }
  releaseResource(resource: RuntimeAudioResource) { this.releases.push(resource); this.resources.delete(resource.id); }
  createPlayback(_resource: RuntimeAudioResource, callbacks: RuntimeAudioPlaybackCallbacks) {
    const playback = new RecordingPlayback();
    this.callbacks.push(callbacks); this.playbacks.push(playback);
    return playback;
  }
  diagnostics() {
    return { resourceCount: this.resources.size, objectURLCount: this.resources.size,
      playbackCount: this.playbacks.filter((value) => !value.dispose.mock.calls.length).length,
      listenerCount: this.playbacks.filter((value) => !value.dispose.mock.calls.length).length * 2, activationCount: 0 };
  }
  dispose() { this.disposed = true; }
}

class RecordingFactory implements RuntimeAudioAdapterFactory {
  readonly adapters: RecordingAdapter[] = [];
  readonly releases: Array<ReturnType<typeof vi.fn>> = [];
  acquire(): RuntimeAudioAdapterLease {
    const adapter = new RecordingAdapter(); const release = vi.fn();
    this.adapters.push(adapter); this.releases.push(release);
    return { adapter, release };
  }
}

function runtimeWithSound(factory = new RecordingFactory()) {
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ environment: { ...environment, audio: factory } });
  return { runtime, factory, adapter: factory.adapters[0]! };
}

function soundCaches() {
  return createRuntimeCacheRegistry({ runtimeId: "runtime:sound" as never, now: () => Date.now() });
}

it("projects mixer and lifecycle policy even for an app with graph-only audio", () => {
  const { runtime } = runtimeWithSound();
  const changed = vi.fn();
  const unsubscribe = runtime.audio.subscribeMixer(changed);
  runtime.audio.setAppVolume("graph-only", 0.25);
  expect(runtime.audio.getOwnerPolicy("graph-only")).toEqual({ volume: 0.25, muted: false, paused: false });
  runtime.audio.suspendOwner("graph-only");
  expect(runtime.audio.getOwnerPolicy("graph-only").paused).toBe(true);
  expect(runtime.audio.getOwnerPolicy("other").paused).toBe(false);
  runtime.audio.resumeOwner("graph-only");
  runtime.audio.setReducedSensory(true);
  expect(runtime.audio.getOwnerPolicy("graph-only").paused).toBe(true);
  runtime.audio.setReducedSensory(false);
  runtime.audio.setEnabled(false);
  expect(runtime.audio.getOwnerPolicy("graph-only")).toEqual({ volume: 0.25, muted: true, paused: true });
  expect(changed.mock.calls.length).toBeGreaterThanOrEqual(6);
  unsubscribe();
  runtime.dispose();
});

describe("runtime-owned sound service", () => {
  it("does not expose mixer authority or levels through the mounted app", () => {
    const { runtime } = runtimeWithSound();
    const app = registerTestSynWare(runtime, { schemaVersion: 1, id: "example", version: "1.0.0", title: "Example" });
    const mounted = mountTestSynWareRuntime(runtime, app.id);
    expect(mounted.runtime.audio).not.toHaveProperty("getMixerSnapshot");
    expect(mounted.runtime.audio).not.toHaveProperty("setMasterVolume");
    expect(mounted.runtime.audio).not.toHaveProperty("setAppVolume");
    runtime.audio.setAppVolume("other", 0.2);
    expect(mounted.runtime.settings.get()).not.toHaveProperty("appVolumes");
    expect(mounted.runtime.settings.get()).not.toHaveProperty("masterVolume");
    mounted.dispose(); runtime.dispose();
  });

  it("restores clamped mixer preferences and retains them through mute", () => {
    let saved: any = { masterVolume: -1, appVolumes: { notes: 2 } };
    const persistence = { getPreference: () => saved, setPreference: (_key: string, value: unknown) => { saved = value; } };
    const make = () => createSettingsService({ runtimeId: "mixer-test" as never, persistence });
    const first = make();
    expect(first.get()).toMatchObject({ masterVolume: 0, appVolumes: { notes: 1 } });
    first.set("masterVolume", 0.37); first.set("appVolumes", { notes: 0.63 }); first.set("soundEnabled", false);
    first.dispose();
    expect(make().get()).toMatchObject({ masterVolume: 0.37, appVolumes: { notes: 0.63 }, soundEnabled: false });
  });
  it("scales live output without rewriting requested volume and aggregates retained sessions", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const first = await runtime.audio.load({ source: "/one.wav", appId: "notes", ownerId: "one", volume: 0.8 });
    const second = await runtime.audio.load({ source: "/two.wav", appId: "notes", ownerId: "two" });
    const changed = vi.fn();
    runtime.audio.subscribeMixer(changed);
    await runtime.audio.play(first.id, runtime.audio.activation(first.id));
    runtime.audio.pause(first.id);
    runtime.audio.setMasterVolume(0.5);
    runtime.audio.setAppVolume("notes", 0.25);
    expect(adapter.playbacks[0].setVolume).toHaveBeenLastCalledWith(0.1);
    expect(first.volume).toBe(0.8);
    expect(runtime.settings.get().masterVolume).toBe(0.5);
    expect(runtime.settings.get().appVolumes.notes).toBe(0.25);
    expect(runtime.audio.getMixerSnapshot().applications).toEqual([{ appId: "notes", volume: 0.25, sessionCount: 2 }]);
    runtime.settings.set("soundEnabled", false);
    runtime.settings.set("soundEnabled", true);
    expect(first.volume).toBe(0.8);
    runtime.audio.release(first.id);
    expect(runtime.audio.getMixerSnapshot().applications[0].sessionCount).toBe(1);
    runtime.audio.closeOwner("notes");
    expect(runtime.audio.getMixerSnapshot().applications).toEqual([]);
    expect(second.state).toBe("released");
    expect(changed).toHaveBeenCalled();
    runtime.dispose();
  });

  it("normalises persisted mixer levels on writes", () => {
    const { runtime } = runtimeWithSound();
    runtime.settings.set("masterVolume", 5);
    runtime.settings.set("appVolumes", { notes: -2, music: 4, invalid: NaN });
    expect(runtime.settings.get().masterVolume).toBe(1);
    expect(runtime.settings.get().appVolumes).toEqual({ notes: 0, music: 1, invalid: 1 });
    runtime.dispose();
  });
  it("loads once per cached source but creates independent playback handles", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const first = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "notes", ownerId: "one" });
    const second = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "notes", ownerId: "two", loop: true, volume: 0.4 });
    expect(adapter.loads).toEqual(["/sounds/chime.wav"]);
    expect(adapter.playbacks).toHaveLength(2);
    expect(first).not.toBe(second);
    expect(adapter.playbacks[1]?.setLoop).toHaveBeenCalledWith(true);
    expect(adapter.playbacks[1]?.setVolume).toHaveBeenCalledWith(0.4);
  });

  it("requires a current single-use activation and invokes play synchronously", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "notes", ownerId: "one" });
    await expect(runtime.audio.play(handle.id, {} as never)).rejects.toBeInstanceOf(AudioActivationRequiredError);
    const token = runtime.audio.activation(handle.id);
    const result = runtime.audio.play(handle.id, token);
    expect(adapter.playbacks[0]?.play).toHaveBeenCalledTimes(1);
    await result;
    await expect(runtime.audio.play(handle.id, token)).rejects.toBeInstanceOf(AudioActivationRequiredError);
  });

  it("maps browser activation denial and fences late play/ended after release", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "notes", ownerId: "one" });
    const denied = deferred<void>();
    adapter.playbacks[0]!.playResults.push(denied);
    const play = runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    denied.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    await expect(play).rejects.toBeInstanceOf(AudioActivationRequiredError);
    const late = deferred<void>();
    adapter.playbacks[0]!.playResults.push(late);
    const second = runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    runtime.audio.release(handle.id);
    late.resolve(); adapter.callbacks[0]?.onEnded(1);
    await second;
    expect(handle.state).toBe("released");
    expect(adapter.playbacks[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("supports pause, resume, stop, loop, volume and ended state", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "music", ownerId: "player" });
    await runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    expect(runtime.audio.pause(handle.id)).toBe(true);
    expect(handle.state).toBe("paused");
    await runtime.audio.resume(handle.id, runtime.audio.activation(handle.id));
    runtime.audio.setLoop(handle.id, true); runtime.audio.setVolume(handle.id, 0.25);
    runtime.audio.setRate(handle.id, 1.5); runtime.audio.setCurrentTime(handle.id, 2);
    expect(handle.rate).toBe(1.5); expect(handle.currentTime).toBe(2);
    adapter.callbacks[0]?.onEnded(3);
    expect(handle.state).toBe("playing");
    runtime.audio.setLoop(handle.id, false); adapter.callbacks[0]?.onEnded(3);
    expect(handle.state).toBe("stopped");
    expect(runtime.audio.stop(handle.id)).toBe(true);
    expect(adapter.playbacks[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it("denies audible playback when reduced-sensory settings are active", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "notes", ownerId: "quiet" });
    runtime.settings.set("motion", "reduced");
    const token = runtime.audio.activation(handle.id);
    await expect(runtime.audio.play(handle.id, token)).rejects.toMatchObject({
      name: "AudioUnavailableError",
      message: expect.stringMatching(/reduced-sensory|reduced sensory|reduced-motion/i),
    });
    expect(adapter.playbacks[0]?.play).not.toHaveBeenCalled();
    expect(handle.state).not.toBe("playing");
  });

  it("pauses/resumes for application lifecycle and releases on close or uninstall", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "player", ownerId: "root" });
    await runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    runtime.store.mutate((draft) => { draft.lifecycle.player = "suspended"; });
    expect(adapter.playbacks[0]?.pause).toHaveBeenCalledTimes(1);
    runtime.store.mutate((draft) => { draft.lifecycle.player = "active"; });
    await Promise.resolve();
    expect(adapter.playbacks[0]?.play).toHaveBeenCalledTimes(2);
    runtime.store.mutate((draft) => { draft.lifecycle.player = "closed"; });
    expect(handle.state).toBe("released");
    await expect(runtime.audio.load({ source: "/sounds/chime.wav", appId: "player", ownerId: "late" })).rejects.toMatchObject({ name: "AbortError" });
    const uninstalling = await runtime.audio.load({ source: "/sounds/chime.wav", appId: "uninstalling", ownerId: "root" });
    runtime.store.mutate((draft) => { draft.lifecycle.uninstalling = "active"; });
    runtime.store.mutate((draft) => { delete draft.lifecycle.uninstalling; });
    expect(uninstalling.state).toBe("released");
  });

  it("releases only sound owners attached to the removed canonical window", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const firstWindow = runtime.windows.create(standardWindow("sound-one", {
      applicationId: "sound-app", applicationSessionId: "sound-session",
      content: { rendererId: "application", parameters: { appId: "sound-app" } },
    }));
    const secondWindow = runtime.windows.create(standardWindow("sound-two", {
      applicationId: "sound-app", applicationSessionId: "sound-session",
      content: { rendererId: "application", parameters: { appId: "sound-app" } },
    }));
    await runtime.windows.open(firstWindow.id); await runtime.windows.open(secondWindow.id);
    const first = await runtime.audio.load({ source: "/sounds/one.wav", appId: "sound-app", ownerId: "view-one", windowControllerId: firstWindow.id });
    const second = await runtime.audio.load({ source: "/sounds/two.wav", appId: "sound-app", ownerId: "view-two", windowControllerId: secondWindow.id });
    await runtime.windows.requestClose(firstWindow.id, { reason: "command" });
    expect(first.state).toBe("released"); expect(second.state).toBe("ready");
    expect(adapter.playbacks[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.playbacks[1]?.dispose).not.toHaveBeenCalled();
  });

  it("keeps same-app same-owner sounds independent across windows", async () => {
    const { runtime } = runtimeWithSound();
    const first = await runtime.audio.load({ source: "/sounds/one.wav", appId: "sound-app", ownerId: "shared", windowControllerId: "window:one" });
    const second = await runtime.audio.load({ source: "/sounds/two.wav", appId: "sound-app", ownerId: "shared", windowControllerId: "window:two" });
    expect(runtime.audio.diagnostics().handleCount).toBe(2);
    runtime.audio.closeWindowController("window:one", "window one closed");
    expect(first.state).toBe("released");
    expect(second.state).toBe("ready");
    runtime.audio.release(second.id);
  });

  it("binds live sound settings without reviving stopped handles", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const playing = await runtime.audio.load({ source: "/sounds/a.wav", appId: "player", ownerId: "playing" });
    const stopped = await runtime.audio.load({ source: "/sounds/b.wav", appId: "player", ownerId: "stopped" });
    await runtime.audio.play(playing.id, runtime.audio.activation(playing.id));
    runtime.audio.stop(stopped.id);
    runtime.settings.set("soundEnabled", false);
    expect(adapter.playbacks[0]?.pause).toHaveBeenCalledTimes(1);
    expect(() => runtime.audio.activation(playing.id)).toThrow(AudioActivationRequiredError);
    runtime.settings.set("soundEnabled", true);
    await Promise.resolve();
    expect(adapter.playbacks[0]?.play).toHaveBeenCalledTimes(2);
    expect(adapter.playbacks[1]?.play).not.toHaveBeenCalled();
  });

  it.each([
    ["settings then lifecycle", (runtime: ReturnType<typeof createTestRuntime>) => {
      runtime.settings.set("soundEnabled", false);
      runtime.store.mutate((draft) => { draft.lifecycle.player = "suspended"; });
      runtime.settings.set("soundEnabled", true);
      runtime.store.mutate((draft) => { draft.lifecycle.player = "active"; });
    }],
    ["lifecycle then settings", (runtime: ReturnType<typeof createTestRuntime>) => {
      runtime.store.mutate((draft) => { draft.lifecycle.player = "suspended"; });
      runtime.settings.set("soundEnabled", false);
      runtime.store.mutate((draft) => { draft.lifecycle.player = "active"; });
      runtime.settings.set("soundEnabled", true);
    }],
  ])("resumes playing intent once all blockers lift: %s", async (_label, transition) => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/blockers.wav", appId: "player", ownerId: "root" });
    await runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    transition(runtime);
    await Promise.resolve();
    expect(handle.state).toBe("playing");
    expect(adapter.playbacks[0]?.play).toHaveBeenCalledTimes(2);
  });

  it("ignores ended and error events from an earlier play epoch", async () => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/epochs.wav", appId: "player", ownerId: "root" });
    await runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    runtime.audio.pause(handle.id);
    await runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    (adapter.callbacks[0]!.onEnded as unknown as (epoch: number) => void)(1);
    (adapter.callbacks[0]!.onError as unknown as (epoch: number, error: Error) => void)(1, new Error("late"));
    expect(handle.state).toBe("playing");
  });

  it.each([
    ["ended", "fulfils"], ["ended", "rejects"], ["error", "fulfils"], ["error", "rejects"],
  ] as const)("keeps a terminal %s state when the play promise later %s", async (terminal, settlement) => {
    const { runtime, adapter } = runtimeWithSound();
    const handle = await runtime.audio.load({ source: "/sounds/terminal.wav", appId: "player", ownerId: "root" });
    const pending = deferred<void>();
    adapter.playbacks[0]!.playResults.push(pending);
    const play = runtime.audio.play(handle.id, runtime.audio.activation(handle.id));
    if (terminal === "ended") adapter.callbacks[0]!.onEnded(1);
    else adapter.callbacks[0]!.onError(1, new Error("terminal"));
    expect(handle.state).toBe(terminal === "ended" ? "stopped" : "error");
    if (settlement === "fulfils") { pending.resolve(); await play; }
    else { pending.reject(new Error("late play settlement")); await expect(play).rejects.toThrow("late play settlement"); }
    expect(handle.state).toBe(terminal === "ended" ? "stopped" : "error");
    adapter.callbacks[0]!.onError(1, new Error("late same-session error"));
    expect(handle.state).toBe(terminal === "ended" ? "stopped" : "error");
  });

  it("uses an adapter-owned single outstanding activation that expires before an await or timer", async () => {
    const controller = new AbortController(); const cache = soundCaches();
    const elementPlay = vi.fn(async () => undefined);
    const platform = {
      loadBytes: async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/wav" }),
      createObjectURL: () => "blob:activation", revokeObjectURL: vi.fn(), randomUUID: () => "activation",
      isUserActive: () => true, expireActivation: (callback: () => void) => queueMicrotask(callback),
      createAudioElement: () => ({
        src: "", preload: "", loop: false, volume: 1, playbackRate: 1, currentTime: 0, duration: 1,
        play: elementPlay, pause: vi.fn(), clearSource: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
      }),
    } as BrowserSoundPlatform & { isUserActive(): boolean; expireActivation(callback: () => void): void };
    const lease = new BrowserSoundAdapterFactory(platform).acquire("runtime:activation", controller.signal);
    const service = createRuntimeAudioService({ runtimeId: "runtime:activation" as never, signal: controller.signal,
      adapterLease: lease, randomUUID: () => "id", soundEnabled: true, caches: cache });
    const handle = await service.load({ source: "/sound.wav", appId: "player", ownerId: "root" });
    const superseded = service.activation(handle.id); const immediate = service.activation(handle.id);
    const supersededResult = service.play(handle.id, superseded); const immediateResult = service.play(handle.id, immediate);
    await expect(supersededResult).rejects.toBeInstanceOf(AudioActivationRequiredError);
    await immediateResult;
    const awaited = service.activation(handle.id); await Promise.resolve();
    await expect(service.play(handle.id, awaited)).rejects.toBeInstanceOf(AudioActivationRequiredError);
    const timer = service.activation(handle.id); await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(service.play(handle.id, timer)).rejects.toBeInstanceOf(AudioActivationRequiredError);
    expect(elementPlay).toHaveBeenCalledTimes(1);
    expect(service.diagnostics().activationCount).toBeLessThanOrEqual(1);
    service.dispose();
  });

  it("fences replaced generations and late resource loads", async () => {
    const controller = new AbortController(); const adapter = new RecordingAdapter(); adapter.autoLoad = false;
    const service = createRuntimeAudioService({ runtimeId: "runtime:sound" as never, signal: controller.signal,
      adapterLease: { adapter, release: vi.fn() }, randomUUID: () => "id", soundEnabled: true, caches: soundCaches() });
    const first = service.load({ source: "/sounds/slow.wav", appId: "player", ownerId: "root", generation: 1 });
    const replacement = service.load({ source: "/sounds/slow.wav", appId: "player", ownerId: "root", generation: 2 });
    const resource = Object.freeze({ id: "slow", source: "/sounds/slow.wav", byteLength: 4, mimeType: "audio/wav" });
    adapter.pendingLoads.get("/sounds/slow.wav")!.resolve(resource);
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(replacement).resolves.toMatchObject({ generation: 2 });
  });

  it("evicts the final aborted reservation before a non-cooperative load settles and reacquires cleanly", async () => {
    const runtimeController = new AbortController();
    const adapter = new RecordingAdapter();
    adapter.autoLoad = false;
    const service = createRuntimeAudioService({ runtimeId: "runtime:sound:last-abort" as never, signal: runtimeController.signal,
      adapterLease: { adapter, release: vi.fn() }, randomUUID: () => "id", soundEnabled: true, caches: soundCaches() });
    const caller = new AbortController();
    const pending = service.load({ source: "/sounds/non-cooperative.wav", appId: "player", ownerId: "first" }, caller.signal);
    await vi.waitFor(() => expect(adapter.pendingLoads.has("/sounds/non-cooperative.wav")).toBe(true));
    const firstGate = adapter.pendingLoads.get("/sounds/non-cooperative.wav")!;
    const firstLoadSignal = adapter.loadSignals.get("/sounds/non-cooperative.wav")!;
    const removeAbort = vi.spyOn(caller.signal, "removeEventListener");

    caller.abort(new DOMException("Caller abandoned the load.", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(firstLoadSignal.aborted).toBe(true);
    expect(service.diagnostics()).toMatchObject({ pendingLoadCount: 0, cacheEntryCount: 0 });
    const late = Object.freeze({ id: "late-resource", source: "/sounds/non-cooperative.wav", byteLength: 4, mimeType: "audio/wav" });
    firstGate.resolve(late);
    await vi.waitFor(() => expect(adapter.releases).toContain(late));
    expect(service.diagnostics()).toMatchObject({ pendingLoadCount: 0, cacheEntryCount: 0 });

    const reacquired = service.load({ source: "/sounds/non-cooperative.wav", appId: "player", ownerId: "second" });
    await vi.waitFor(() => expect(adapter.loads).toEqual(["/sounds/non-cooperative.wav", "/sounds/non-cooperative.wav"]));
    const secondGate = adapter.pendingLoads.get("/sounds/non-cooperative.wav")!;
    secondGate.resolve(Object.freeze({ id: "fresh-resource", source: "/sounds/non-cooperative.wav", byteLength: 4, mimeType: "audio/wav" }));
    const handle = await reacquired;
    expect(handle.state).toBe("ready");
    service.release(handle.id);
    service.dispose();
  });

  it("settles a non-cooperative load during runtime disposal and leaves a sibling runtime isolated", async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const firstAdapter = new RecordingAdapter();
    const secondAdapter = new RecordingAdapter();
    firstAdapter.autoLoad = false;
    secondAdapter.autoLoad = false;
    const first = createRuntimeAudioService({ runtimeId: "runtime:sound:dispose:first" as never, signal: firstController.signal,
      adapterLease: { adapter: firstAdapter, release: vi.fn() }, randomUUID: () => "first", soundEnabled: true, caches: soundCaches() });
    const second = createRuntimeAudioService({ runtimeId: "runtime:sound:dispose:second" as never, signal: secondController.signal,
      adapterLease: { adapter: secondAdapter, release: vi.fn() }, randomUUID: () => "second", soundEnabled: true, caches: soundCaches() });
    const firstPending = first.load({ source: "/sounds/shared.wav", appId: "player", ownerId: "first" });
    const secondPending = second.load({ source: "/sounds/shared.wav", appId: "player", ownerId: "second" });
    await vi.waitFor(() => expect(firstAdapter.pendingLoads.has("/sounds/shared.wav") && secondAdapter.pendingLoads.has("/sounds/shared.wav")).toBe(true));
    const firstGate = firstAdapter.pendingLoads.get("/sounds/shared.wav")!;
    const secondGate = secondAdapter.pendingLoads.get("/sounds/shared.wav")!;
    const firstSignal = firstAdapter.loadSignals.get("/sounds/shared.wav")!;
    const secondSignal = secondAdapter.loadSignals.get("/sounds/shared.wav")!;

    firstController.abort(new DOMException("First runtime disposed.", "AbortError"));

    const firstOutcome = await Promise.race([
      firstPending.then(() => "settled", () => "settled"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 20)),
    ]);
    firstGate.resolve(Object.freeze({ id: "first-late", source: "/sounds/shared.wav", byteLength: 4, mimeType: "audio/wav" }));
    await firstPending.catch(() => undefined);
    expect(firstOutcome).toBe("settled");
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);
    expect(second.diagnostics()).toMatchObject({ pendingLoadCount: 1, cacheEntryCount: 1 });

    secondGate.resolve(Object.freeze({ id: "second-live", source: "/sounds/shared.wav", byteLength: 4, mimeType: "audio/wav" }));
    const secondHandle = await secondPending;
    expect(secondHandle.state).toBe("ready");
    second.release(secondHandle.id);
    second.dispose();
  });

  it("evicts idle decoded cache resources with exact releases", async () => {
    const controller = new AbortController(); const adapter = new RecordingAdapter();
    const service = createRuntimeAudioService({ runtimeId: "runtime:sound" as never, signal: controller.signal,
      adapterLease: { adapter, release: vi.fn() }, randomUUID: () => Math.random().toString(), soundEnabled: true,
      caches: soundCaches(), maxCachedResources: 1 });
    const one = await service.load({ source: "/sounds/one.wav", appId: "a", ownerId: "one" }); service.release(one.id);
    const two = await service.load({ source: "/sounds/two.wav", appId: "a", ownerId: "two" }); service.release(two.id);
    expect(adapter.releases.map((value) => value.source)).toContain("/sounds/one.wav");
    expect(service.diagnostics().cacheEntryCount).toBe(1);
  });

  it("isolates two runtimes sharing one environment factory", async () => {
    const factory = new RecordingFactory();
    const one = createTestRuntime({ id: "runtime:same", environment: { ...createTestRuntimeEnvironment(), audio: factory } });
    const two = createTestRuntime({ id: "runtime:same", environment: { ...createTestRuntimeEnvironment(), audio: factory } });
    const first = await one.audio.load({ source: "/sounds/chime.wav", appId: "a", ownerId: "one" });
    const second = await two.audio.load({ source: "/sounds/chime.wav", appId: "a", ownerId: "two" });
    await one.dispose("one closed");
    expect(first.state).toBe("released");
    expect(second.state).toBe("ready");
    expect(factory.releases[0]).toHaveBeenCalledTimes(1);
    expect(factory.releases[1]).not.toHaveBeenCalled();
    await two.audio.play(second.id, two.audio.activation(second.id));
  });

  it("disposes runtime resources, listener diagnostics and adapter leases exactly once", async () => {
    const { runtime, factory, adapter } = runtimeWithSound();
    await runtime.audio.load({ source: "/sounds/chime.wav", appId: "a", ownerId: "one" });
    expect(runtime.audio.diagnostics()).toMatchObject({ handleCount: 1, cacheEntryCount: 1, playbackCount: 1, listenerCount: 2 });
    await runtime.dispose("closed");
    expect(adapter.releases).toHaveLength(1);
    expect(adapter.disposed).toBe(true);
    expect(factory.releases[0]).toHaveBeenCalledTimes(1);
    expect(runtime.audio.diagnostics()).toEqual({ handleCount: 0, playingCount: 0, pendingLoadCount: 0,
      cacheEntryCount: 0, activationCount: 0, resourceCount: 0, objectURLCount: 0, playbackCount: 0, listenerCount: 0 });
  });
});

describe("private browser sound adapter", () => {
  it("bounds adapter-owned activation claims and refuses inactive users", () => {
    let userActive = true; const expiry: Array<() => void> = [];
    const platform = {
      loadBytes: vi.fn(), createObjectURL: vi.fn(), revokeObjectURL: vi.fn(), createAudioElement: vi.fn(), randomUUID: () => "id",
      isUserActive: () => userActive, expireActivation: (callback: () => void) => expiry.push(callback),
    } as unknown as BrowserSoundPlatform;
    const controller = new AbortController(); const adapter = new BrowserSoundAdapterFactory(platform).acquire("runtime", controller.signal).adapter;
    const claims = Array.from({ length: 200 }, (_, index) => adapter.claimActivation(`owner:${index}`)).filter(Boolean);
    expect(claims).toHaveLength(128); expect(adapter.diagnostics().activationCount).toBe(128);
    const replacement = adapter.claimActivation("owner:0");
    expect(replacement).toBeNull(); expect(adapter.diagnostics().activationCount).toBe(128);
    userActive = false;
    expect(adapter.claimActivation("owner:0")).toBeNull();
    expect(adapter.claimActivation("owner:inactive")).toBeNull(); expect(expiry).toHaveLength(128);
    expect(adapter.diagnostics().activationCount).toBe(127);
    adapter.dispose(); expect(adapter.diagnostics().activationCount).toBe(0);
  });

  it("owns one object URL per resource and independent element listeners", async () => {
    const elements: Array<BrowserSoundElement & { emit(type: "ended" | "error"): void }> = [];
    const revoked: string[] = [];
    const platform: BrowserSoundPlatform = {
      loadBytes: async () => Object.freeze({ bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" }),
      createObjectURL: () => "blob:sound", revokeObjectURL: (url) => revoked.push(url), randomUUID: () => "one",
      isUserActive: () => true, expireActivation: () => undefined,
      createAudioElement() {
        const listeners = new Map<string, Set<() => void>>();
        const element = {
          src: "", preload: "", loop: false, volume: 1, playbackRate: 1, currentTime: 0, duration: 4,
          play: vi.fn(async () => undefined), pause: vi.fn(), clearSource: vi.fn(),
          addEventListener(type: "ended" | "error", listener: () => void) { const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set); },
          removeEventListener(type: "ended" | "error", listener: () => void) { listeners.get(type)?.delete(listener); },
          emit(type: "ended" | "error") { for (const listener of listeners.get(type) ?? []) listener(); },
        };
        elements.push(element); return element;
      },
    };
    const factory = new BrowserSoundAdapterFactory(platform); const signal = new AbortController();
    const lease = factory.acquire("runtime:a", signal.signal); const adapter = lease.adapter;
    const resource = await adapter.loadResource("/sound.wav", signal.signal);
    const ended = vi.fn(); const first = adapter.createPlayback(resource, { onEnded: ended, onError: vi.fn() });
    const second = adapter.createPlayback(resource, { onEnded: vi.fn(), onError: vi.fn() });
    await first.play(adapter.claimActivation("owner:first")!, 1);
    await second.play(adapter.claimActivation("owner:second")!, 1);
    expect(elements).toHaveLength(2); expect(adapter.diagnostics()).toEqual({ resourceCount: 1, objectURLCount: 1, playbackCount: 2, listenerCount: 4, activationCount: 0 });
    elements[0]!.emit("ended"); expect(ended).toHaveBeenCalledWith(1);
    first.dispose(); expect(adapter.diagnostics().listenerCount).toBe(2);
    adapter.releaseResource(resource); expect(second.dispose).toBeTypeOf("function");
    expect(revoked).toEqual(["blob:sound"]); expect(adapter.diagnostics()).toEqual({ resourceCount: 0, objectURLCount: 0, playbackCount: 0, listenerCount: 0, activationCount: 0 });
  });

  it("reports the exact captured epoch from late native session callbacks", async () => {
    const history: Record<"ended" | "error", Array<() => void>> = { ended: [], error: [] };
    const platform: BrowserSoundPlatform = {
      loadBytes: async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/wav" }),
      createObjectURL: () => "blob:epochs", revokeObjectURL: vi.fn(), randomUUID: () => "one",
      isUserActive: () => true, expireActivation: () => undefined,
      createAudioElement: () => ({
        src: "", preload: "", loop: false, volume: 1, playbackRate: 1, currentTime: 0, duration: 1,
        play: async () => undefined, pause: vi.fn(), clearSource: vi.fn(),
        addEventListener(type, listener) { history[type].push(listener); }, removeEventListener: vi.fn(),
      }),
    };
    const controller = new AbortController(); const adapter = new BrowserSoundAdapterFactory(platform).acquire("runtime", controller.signal).adapter;
    const resource = await adapter.loadResource("/epochs.wav", controller.signal);
    const onEnded = vi.fn(); const onError = vi.fn(); const playback = adapter.createPlayback(resource, { onEnded, onError });
    await playback.play(adapter.claimActivation("owner")!, 1); playback.pause();
    await playback.play(adapter.claimActivation("owner")!, 3);
    history.ended[0]!(); history.error[0]!();
    expect(onEnded).toHaveBeenCalledWith(1); expect(onError).not.toHaveBeenCalled();
    history.ended[1]!(); expect(onEnded).toHaveBeenLastCalledWith(3);
    adapter.releaseResource(resource);
  });

  it("rejects hostile or oversized byte results before object-URL allocation", async () => {
    const createObjectURL = vi.fn(() => "blob:never"); const getter = vi.fn(() => "poison");
    const bytes = { bytes: new Uint8Array([1]), mimeType: "audio/wav" } as Record<string, unknown>;
    Object.defineProperty(bytes, "poison", { enumerable: true, get: getter });
    const loadBytes = vi.fn().mockResolvedValueOnce(bytes)
      .mockResolvedValueOnce({ bytes: new Uint8Array(16 * 1024 * 1024 + 1), mimeType: "audio/wav" });
    const platform = {
      loadBytes, createObjectURL, revokeObjectURL: vi.fn(), randomUUID: () => "one",
      createAudioElement: vi.fn(),
    } as unknown as BrowserSoundPlatform;
    const controller = new AbortController(); const adapter = new BrowserSoundAdapterFactory(platform).acquire("runtime", controller.signal).adapter;
    await expect(adapter.loadResource("/hostile.wav", controller.signal)).rejects.toThrow(/invalid shape/i);
    expect(getter).not.toHaveBeenCalled(); expect(createObjectURL).not.toHaveBeenCalled();
    await expect(adapter.loadResource("/large.wav", controller.signal)).rejects.toThrow(/limit/i);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("rolls back session listeners when play setup throws", async () => {
    const remove = vi.fn(); const pause = vi.fn(); const clearSource = vi.fn();
    const platform: BrowserSoundPlatform = {
      loadBytes: async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/wav" }),
      createObjectURL: () => "blob:setup", revokeObjectURL: vi.fn(), randomUUID: () => "one",
      isUserActive: () => true, expireActivation: () => undefined,
      createAudioElement: () => ({
        src: "", preload: "", loop: false, volume: 1, playbackRate: 1, currentTime: 0, duration: 1,
        play: async () => undefined, pause, clearSource,
        addEventListener(type) { if (type === "error") throw new Error("listener failed"); },
        removeEventListener: remove,
      }),
    };
    const controller = new AbortController(); const adapter = new BrowserSoundAdapterFactory(platform).acquire("runtime", controller.signal).adapter;
    const resource = await adapter.loadResource("/setup.wav", controller.signal);
    const playback = adapter.createPlayback(resource, { onEnded: vi.fn(), onError: vi.fn() });
    expect(() => playback.play(adapter.claimActivation("owner")!, 1)).toThrow("listener failed");
    expect(remove).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled(); expect(clearSource).not.toHaveBeenCalled();
    expect(adapter.diagnostics()).toMatchObject({ playbackCount: 1, listenerCount: 0 });
    adapter.releaseResource(resource);
    expect(adapter.diagnostics()).toEqual({ resourceCount: 0, objectURLCount: 0, playbackCount: 0, listenerCount: 0, activationCount: 0 });
  });

  it.each([
    ["absent", null, null],
    ["lying", "1", null],
    ["compressed", "1", "gzip"],
  ])("streams and cancels an oversized %s response before buffering", async (_label, contentLength, encoding) => {
    const chunk = new Uint8Array(8 * 1024 * 1024);
    const read = vi.fn()
      .mockResolvedValueOnce({ done: false, value: chunk })
      .mockResolvedValueOnce({ done: false, value: chunk })
      .mockResolvedValueOnce({ done: false, value: chunk });
    const cancel = vi.fn(async () => undefined); const arrayBuffer = vi.fn(async () => { throw new Error("full buffer used"); });
    const fetch = vi.fn(async () => ({
      ok: true, status: 200,
      headers: { get(name: string) { if (name === "content-length") return contentLength; if (name === "content-encoding") return encoding; if (name === "content-type") return "audio/wav"; return null; } },
      body: { getReader: () => ({ read, cancel, releaseLock: vi.fn() }) }, arrayBuffer,
    }));
    const originalFetch = window.fetch;
    Object.defineProperty(window, "fetch", { configurable: true, value: fetch });
    let lease: ReturnType<NonNullable<ReturnType<typeof createBrowserRuntimeEnvironment>["sound"]>["acquire"]> | null = null;
    try {
      const environment = createBrowserRuntimeEnvironment(); const controller = new AbortController();
      lease = environment.audio!.acquire("runtime:stream", controller.signal);
      const adapter = lease.adapter;
      await expect(adapter.loadResource("/oversized.wav", controller.signal)).rejects.toThrow(/too large/i);
      expect(arrayBuffer).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      lease?.release();
      Object.defineProperty(window, "fetch", { configurable: true, value: originalFetch });
    }
  });

  it("bounds allocations and work for an endless stream of one-byte chunks", async () => {
    const byte = new Uint8Array([1]); let reads = 0; let allocations = 0;
    const NativeUint8Array = Uint8Array;
    const CountingUint8Array = new Proxy(NativeUint8Array, {
      construct(target, args, newTarget) { allocations += 1; return Reflect.construct(target, args, newTarget); },
    });
    const cancel = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => ({
      ok: true, status: 200,
      headers: { get(name: string) { return name === "content-type" ? "audio/wav" : null; } },
      body: { getReader: () => ({
        read: async () => {
          reads += 1;
          if (reads > 5_000) throw new Error("test read guard exceeded");
          return { done: false, value: byte };
        },
        cancel, releaseLock: vi.fn(),
      }) },
    }));
    const originalFetch = window.fetch;
    Object.defineProperty(window, "fetch", { configurable: true, value: fetch });
    Object.defineProperty(globalThis, "Uint8Array", { configurable: true, value: CountingUint8Array });
    let lease: ReturnType<NonNullable<ReturnType<typeof createBrowserRuntimeEnvironment>["sound"]>["acquire"]> | null = null;
    try {
      const environment = createBrowserRuntimeEnvironment(); const controller = new AbortController();
      lease = environment.audio!.acquire("runtime:tiny-chunks", controller.signal);
      await expect(lease.adapter.loadResource("/tiny.wav", controller.signal)).rejects.toThrow(/chunk count/i);
      expect(reads).toBeLessThanOrEqual(4_097);
      expect(allocations).toBeLessThanOrEqual(32);
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      lease?.release();
      Object.defineProperty(globalThis, "Uint8Array", { configurable: true, value: NativeUint8Array });
      Object.defineProperty(window, "fetch", { configurable: true, value: originalFetch });
    }
  });

  it("cancels an endless zero-progress response after bounded reads", async () => {
    const empty = new Uint8Array(0); let reads = 0;
    const cancel = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => ({
      ok: true, status: 200,
      headers: { get(name: string) { return name === "content-type" ? "audio/wav" : null; } },
      body: { getReader: () => ({
        read: async () => {
          reads += 1;
          if (reads > 64) throw new Error("test read guard exceeded");
          return { done: false, value: empty };
        },
        cancel, releaseLock: vi.fn(),
      }) },
    }));
    const originalFetch = window.fetch;
    Object.defineProperty(window, "fetch", { configurable: true, value: fetch });
    let lease: ReturnType<NonNullable<ReturnType<typeof createBrowserRuntimeEnvironment>["sound"]>["acquire"]> | null = null;
    try {
      const environment = createBrowserRuntimeEnvironment(); const controller = new AbortController();
      lease = environment.audio!.acquire("runtime:zero-progress", controller.signal);
      await expect(lease.adapter.loadResource("/empty.wav", controller.signal)).rejects.toThrow(/progress/i);
      expect(reads).toBeLessThanOrEqual(17);
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      lease?.release();
      Object.defineProperty(window, "fetch", { configurable: true, value: originalFetch });
    }
  });
});


