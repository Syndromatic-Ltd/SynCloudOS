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

import { afterEach, describe, expect, it, vi } from "vitest";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
import { AUFXAudioPCMBuffer } from "../../../src/FX/AudioFX/AUFXAudioPCMBuffer";
import type { AUFXAudioRealtimeSource } from "../../../src/FX/AudioFX/AUFXAudioGraphOutput";
import { getAUFXRealtimeNode } from "../../../src/FX/AudioFX/AUFXAudioRenderPlan";
import {
  BrowserAudioCaptureAdapter,
  connectBrowserAUFXInput,
  type BrowserAudioCapturePlatform,
} from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter";
import { BrowserAudioGraphOutput } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioGraphOutput";

const originalAudioWorkletNode = globalThis.AudioWorkletNode;

afterEach(() => {
  Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, writable: true, value: originalAudioWorkletNode });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function streamFixture(deviceId: string) {
  const listeners = new Map<string, Set<() => void>>();
  const track = {
    readyState: "live",
    muted: false,
    enabled: true,
    stop: vi.fn(),
    getSettings: () => ({ deviceId, sampleRate: 48_000, channelCount: 1 }),
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) { listeners.get(type)?.delete(listener); },
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return {
    track,
    stream,
    emit(type: string) { listeners.get(type)?.forEach(listener => listener()); },
  };
}

function captureFixture() {
  let devices: readonly { deviceId: string; kind: string; label: string; groupId: string }[] = [
    { deviceId: "mic-a", kind: "audioinput", label: "USB microphone", groupId: "input" },
    { deviceId: "speaker-a", kind: "audiooutput", label: "USB output", groupId: "output" },
  ];
  const streams: MediaStream[] = [];
  let deviceChange: (() => void) | null = null;
  const getUserMedia = vi.fn(async () => {
    const stream = streams.shift();
    if (!stream) throw new Error("No queued audio stream.");
    return stream;
  });
  const platform: BrowserAudioCapturePlatform = {
    getUserMedia,
    enumerateDevices: vi.fn(async () => devices),
    createRecorder: vi.fn(),
    isTypeSupported: vi.fn(() => true),
    now: () => 0,
    subscribeDeviceChange(listener) {
      deviceChange = listener;
      return () => { if (deviceChange === listener) deviceChange = null; };
    },
  };
  return {
    platform,
    getUserMedia,
    queue(stream: MediaStream) { streams.push(stream); },
    setDevices(next: typeof devices) { devices = next; },
    emitDeviceChange() { deviceChange?.(); },
  };
}

describe("AudioFX route recovery", () => {
  it("never turns recovery into a first-time microphone permission request", async () => {
    const f = captureFixture();
    const session = new BrowserAudioCaptureAdapter(f.platform).createSession();

    await expect(session.recoverRoute({ input: "if-authorized" })).resolves.toMatchObject({
      reason: null,
      input: "authorization-required",
      output: "not-requested",
    });
    expect(f.getUserMedia).not.toHaveBeenCalled();
    session.dispose();
  });

  it("revokes an ended input and reopens it only under explicit recovery policy", async () => {
    const first = streamFixture("mic-a"), second = streamFixture("mic-a"), f = captureFixture();
    f.queue(first.stream); f.queue(second.stream);
    const capability = Object.freeze({});
    const session = new BrowserAudioCaptureAdapter(f.platform).createSession(undefined, capability);
    await session.requestRecordAuthorization();
    const input = session.createInputNode(new AUFXAudioFormat(48_000, 1));
    const mediaSource = { connect: vi.fn(), disconnect: vi.fn() };
    const context = { createMediaStreamSource: vi.fn(() => mediaSource) } as unknown as AudioContext;
    const binding = connectBrowserAUFXInput(
      getAUFXRealtimeNode(input)!.input!.token,
      capability,
      context,
      {} as AudioNode,
      0,
      new AbortController().signal,
    );

    first.track.readyState = "ended";
    first.emit("ended");

    expect(session.state).toBe("interrupted");
    expect(session.interruptionReason).toBe("input-ended");
    expect(input.state).toBe("interrupted");
    expect(first.track.stop).toHaveBeenCalledOnce();
    expect(mediaSource.disconnect).toHaveBeenCalledOnce();
    expect(f.getUserMedia).toHaveBeenCalledOnce();

    await expect(session.recoverRoute({ input: "if-authorized" })).resolves.toMatchObject({
      reason: "input-ended",
      input: "recovered",
      output: "not-requested",
      route: { actualInput: "mic-a" },
    });
    expect(session.interruptionReason).toBeNull();
    expect(f.getUserMedia).toHaveBeenCalledTimes(2);

    const replacement = session.createInputNode(new AUFXAudioFormat(48_000, 1));
    replacement.dispose(); input.dispose(); binding.dispose(); session.dispose();
  });

  it("generation-fences output selection so a stale completion cannot replace a newer route", async () => {
    const f = captureFixture();
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const setOutputDevice = vi.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveSecond = resolve; }));
    const session = new BrowserAudioCaptureAdapter({ ...f.platform, setOutputDevice }).createSession();

    const first = session.setPreferredOutput("speaker-a");
    const second = session.setPreferredOutput("speaker-b");
    resolveSecond("speaker-b");
    await second;
    resolveFirst("speaker-a");

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(session.route).toMatchObject({ desiredOutput: "speaker-b", actualOutput: "speaker-b" });
    session.dispose();
  });

  it("retains desired versus actual output after sink rejection and retries only when asked", async () => {
    const f = captureFixture();
    const setOutputDevice = vi.fn()
      .mockResolvedValueOnce("speaker-a")
      .mockRejectedValueOnce(new DOMException("Sink rejected", "NotAllowedError"))
      .mockResolvedValueOnce("speaker-c");
    const session = new BrowserAudioCaptureAdapter({ ...f.platform, setOutputDevice }).createSession();

    await session.setPreferredOutput("speaker-a");
    await expect(session.setPreferredOutput("speaker-c")).rejects.toThrow("Sink rejected");
    expect(session.route).toMatchObject({ desiredOutput: "speaker-c", actualOutput: "speaker-a" });
    expect(session.interruptionReason).toBe("output-selection-failed");

    await expect(session.recoverRoute({ output: "retry-desired" })).resolves.toMatchObject({
      reason: "output-selection-failed",
      input: "not-requested",
      output: "recovered",
      route: { desiredOutput: "speaker-c", actualOutput: "speaker-c" },
    });
    expect(session.interruptionReason).toBeNull();
    session.dispose();
  });

  it("observes input removal and reinsertion without automatically reopening the microphone", async () => {
    const first = streamFixture("mic-a"), second = streamFixture("mic-a"), f = captureFixture();
    f.queue(first.stream); f.queue(second.stream);
    const session = new BrowserAudioCaptureAdapter(f.platform).createSession();
    await session.requestRecordAuthorization();

    f.setDevices([{ deviceId: "speaker-a", kind: "audiooutput", label: "USB output", groupId: "output" }]);
    f.emitDeviceChange();
    await vi.waitFor(() => expect(session.interruptionReason).toBe("input-device-removed"));
    expect(session.route.actualInput).toBeNull();
    expect(f.getUserMedia).toHaveBeenCalledOnce();

    f.setDevices([
      { deviceId: "mic-a", kind: "audioinput", label: "USB microphone", groupId: "input" },
      { deviceId: "speaker-a", kind: "audiooutput", label: "USB output", groupId: "output" },
    ]);
    f.emitDeviceChange();
    await vi.waitFor(() => expect(f.platform.enumerateDevices).toHaveBeenCalledTimes(2));
    expect(f.getUserMedia).toHaveBeenCalledOnce();

    await session.recoverRoute({ input: "if-authorized" });
    expect(f.getUserMedia).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("stops policy recovery after a previously authorized retry is denied", async () => {
    const first = streamFixture("mic-a"), f = captureFixture();
    f.queue(first.stream);
    const session = new BrowserAudioCaptureAdapter(f.platform).createSession();
    await session.requestRecordAuthorization();
    first.track.readyState = "ended"; first.emit("ended");
    f.getUserMedia.mockRejectedValueOnce(new DOMException("Microphone permission revoked", "NotAllowedError"));

    await expect(session.recoverRoute({ input: "if-authorized" })).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(session.state).toBe("denied");
    expect(session.interruptionReason).toBe("permission-denied");
    const attempts = f.getUserMedia.mock.calls.length;
    await expect(session.recoverRoute({ input: "if-authorized" })).resolves.toMatchObject({
      reason: "permission-denied",
      input: "authorization-required",
    });
    expect(f.getUserMedia).toHaveBeenCalledTimes(attempts);
    session.dispose();
  });

  it("finalizes an in-progress recording exactly once when its input is lost", async () => {
    const input = streamFixture("mic-a"), f = captureFixture();
    f.queue(input.stream);
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const emit = (type: string, event: Event) => listeners.get(type)?.forEach(listener => listener(event));
    const native = {
      state: "inactive",
      mimeType: "audio/webm",
      start: vi.fn(() => { native.state = "recording"; }),
      pause: vi.fn(() => { native.state = "paused"; }),
      resume: vi.fn(() => { native.state = "recording"; }),
      stop: vi.fn(() => {
        if (native.state === "inactive") return;
        native.state = "inactive";
        emit("dataavailable", { data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }) } as BlobEvent);
        emit("stop", new Event("stop"));
      }),
      addEventListener(type: string, listener: (event: Event) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: (event: Event) => void) { listeners.get(type)?.delete(listener); },
    };
    const decodeRecording = vi.fn(async () => ({ duration: 0.05, frameCount: 2400, sampleRate: 48_000, channelCount: 1 }));
    f.platform.createRecorder = vi.fn(() => native as unknown as MediaRecorder);
    f.platform.decodeRecording = decodeRecording;
    const session = new BrowserAudioCaptureAdapter(f.platform).createSession();
    await session.requestRecordAuthorization();
    const recorder = session.createRecorder();
    recorder.record();

    input.track.readyState = "ended";
    input.emit("ended");
    const result = await recorder.result;

    expect(result).toMatchObject({ byteLength: 4, frameCount: 2400, sampleRate: 48_000, channelCount: 1 });
    expect(native.stop).toHaveBeenCalledOnce();
    expect(decodeRecording).toHaveBeenCalledOnce();
    expect(input.track.stop).toHaveBeenCalledOnce();
    expect(session.state).toBe("interrupted");
    session.dispose();
  });

  it("aborts a pending output selection with its owner and ignores the late native result", async () => {
    const f = captureFixture();
    let resolve!: (value: string) => void;
    const setOutputDevice = vi.fn(() => new Promise<string>(done => { resolve = done; }));
    const owner = new AbortController();
    const session = new BrowserAudioCaptureAdapter({ ...f.platform, setOutputDevice }).createSession(owner.signal);

    const pending = session.setPreferredOutput("speaker-a");
    owner.abort();
    resolve("speaker-a");

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(session.state).toBe("disposed");
    expect(session.route.actualOutput).toBeNull();
  });

  it("suspends and resumes fallback output without tearing down the graph or bypassing gain", async () => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "AudioWorkletNode", { configurable: true, writable: true, value: undefined });
    const format = new AUFXAudioFormat(8000, 1);
    const renderFallback = vi.fn((frames: number) => {
      const pcm = new AUFXAudioPCMBuffer(format, frames); pcm.frameLength = frames; return pcm;
    });
    const source: AUFXAudioRealtimeSource = {
      snapshot: () => ({ version: 1, sampleRate: 8000, channelCount: 1, outputId: 1, tapIds: [], nodes: [{ id: 1, kind: "mixer", inputs: [], muted: false, volume: { initial: 1, events: [] } }] }) as never,
      subscribe: () => () => {},
      receive: vi.fn(),
      renderFallback,
    };
    const stateListeners = new Set<() => void>();
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    const nativeSources: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
    const context = {
      state: "running",
      currentTime: 0,
      destination: {},
      createGain: vi.fn(() => gain),
      createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(160) })),
      createBufferSource: vi.fn(() => {
        const value = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null };
        nativeSources.push(value); return value;
      }),
      addEventListener: vi.fn((_type: string, listener: () => void) => stateListeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) => stateListeners.delete(listener)),
    } as unknown as AudioContext;
    const stopped = vi.fn();
    const output = new BrowserAudioGraphOutput(async () => context, new AbortController().signal, vi.fn());
    output.setMasterVolume(0.5);
    output.setOwnerPolicy({ volume: 0.4, muted: false, paused: false });
    await output.start(format, source, stopped, new AbortController().signal);
    const beforeSuspend = renderFallback.mock.calls.length;
    expect(gain.gain.value).toBeCloseTo(0.2);

    Object.assign(context, { state: "suspended" });
    for (const listener of stateListeners) listener();
    await vi.advanceTimersByTimeAsync(50);
    expect(renderFallback).toHaveBeenCalledTimes(beforeSuspend);
    expect(stopped).not.toHaveBeenCalled();

    Object.assign(context, { state: "running", currentTime: 1 });
    for (const listener of stateListeners) listener();
    await vi.advanceTimersByTimeAsync(11);
    expect(renderFallback.mock.calls.length).toBeGreaterThan(beforeSuspend);
    expect(gain.gain.value).toBeCloseTo(0.2);
    expect(stopped).not.toHaveBeenCalled();
    output.dispose();
    expect(nativeSources.every(item => item.disconnect.mock.calls.length === 1)).toBe(true);
  });
});
