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

import { describe, it, expect, vi } from "vitest";
import { BrowserAudioCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter";
import { AUFXAudioFormat } from "../../../src/FX/AudioFX/AUFXAudioFormat";
function fixture() {
  const trackListeners = new Map<string, Set<() => void>>();
  const track = { readyState: "live", muted: false, enabled: true, stop: vi.fn(), getSettings: () => ({ deviceId: "mic-a", sampleRate: 48000, channelCount: 1 }), addEventListener: (type: string, fn: () => void) => { if (!trackListeners.has(type)) trackListeners.set(type, new Set()); trackListeners.get(type)!.add(fn); }, removeEventListener: (type: string, fn: () => void) => trackListeners.get(type)?.delete(fn) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const listeners = new Map<string, Set<(event: any) => void>>();
  const emit = (type: string, event = {}) => listeners.get(type)?.forEach(fn => fn(event));
  const native = { state: "inactive", mimeType: "audio/webm", start: vi.fn(() => { native.state = "recording"; }), pause: vi.fn(() => { native.state = "paused"; }), resume: vi.fn(() => { native.state = "recording"; }), stop: vi.fn(() => { native.state = "inactive"; emit("dataavailable", { data: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }) }); emit("stop"); }), addEventListener: (type: string, fn: (event: any) => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn); }, removeEventListener: (type: string, fn: (event: any) => void) => listeners.get(type)?.delete(fn) };
  let time = 0;
  const platform = { getUserMedia: vi.fn(async () => stream), enumerateDevices: vi.fn(async () => [{ deviceId: "mic-a", groupId: "g", kind: "audioinput", label: "Microphone" }]), createRecorder: () => native as unknown as MediaRecorder, isTypeSupported: () => true, now: () => time, subscribeDeviceChange: () => () => {}, decodeRecording: async () => ({ sampleRate: 48000, channelCount: 1, frameCount: 48000, duration: 1 }) };
  return { platform, track, stream, native, emit, listeners, trackListeners, setTime: (value: number) => { time = value; } };
}
describe("owned browser audio capture", () => {
  it("requests permission only explicitly and finalizes bounded recording with real decoded frame metadata", async () => {
    const f = fixture(), session = new BrowserAudioCaptureAdapter(f.platform).createSession();
    expect(f.platform.getUserMedia).not.toHaveBeenCalled(); await session.enumerateDevices(); expect(f.platform.getUserMedia).not.toHaveBeenCalled();
    await session.requestRecordAuthorization(); const recorder = session.createRecorder(); recorder.record();
    f.setTime(0.5); recorder.pause(); f.setTime(2); recorder.resume(); f.setTime(2.5);
    const result = await recorder.stop(); expect(result.byteLength).toBe(3); expect(result.elapsedRecordingTime).toBe(1); expect(result.frameCount).toBe(48000);
    expect(recorder.state).toBe("finished"); session.dispose(); expect(f.track.stop).toHaveBeenCalledTimes(1);
  });
  it("releases a stream that arrives after owner abort", async () => {
    const f = fixture(); let resolve!: (stream: MediaStream) => void;
    f.platform.getUserMedia.mockImplementation(() => new Promise(done => { resolve = done; }));
    const owner = new AbortController(), session = new BrowserAudioCaptureAdapter(f.platform).createSession(owner.signal);
    const pending = session.requestRecordAuthorization(); owner.abort(); resolve(f.stream);
    await expect(pending).rejects.toThrow(); expect(f.track.stop).toHaveBeenCalledTimes(1); expect(session.state).toBe("disposed");
  });
  it("aborts oversized chunk input and distinguishes desired and actual routes", async () => {
    const f = fixture(), session = new BrowserAudioCaptureAdapter(f.platform).createSession(); await session.requestRecordAuthorization();
    expect(session.route.actualInput).toBe("mic-a");
    const recorder = session.createRecorder({ maximumBytes: 2 }); recorder.record();
    const final = recorder.stop(); await expect(final).rejects.toThrow("byte");
    expect(session.route.actualInput).toBeNull();
    await expect(session.setPreferredOutput("speaker-a")).rejects.toThrow("unavailable");
    session.dispose(); expect([...f.listeners.values()].every(set => !set.size)).toBe(true);
  });
});

it("creates input only after explicit authorization and sweeps mute, end, and disposal", async () => {
  const f = fixture(), session = new BrowserAudioCaptureAdapter(f.platform).createSession(), format = new AUFXAudioFormat(48000, 1);
  expect(() => session.createInputNode(format)).toThrow(/authorization/i);
  await session.requestRecordAuthorization(); const input = session.createInputNode(format), changed = vi.fn(), unsubscribe = input.subscribe(changed);
  expect(input.state).toBe("active"); expect(input.sourceFormat).toEqual({ sampleRate: 48000, channelCount: 1 }); expect(() => session.createRecorder()).toThrow(/one input consumer/i);
  f.track.muted = true; f.trackListeners.get("mute")?.forEach(listener => listener()); expect(input.state).toBe("muted");
  f.track.muted = false; f.trackListeners.get("unmute")?.forEach(listener => listener()); expect(input.state).toBe("active");
  f.track.readyState = "ended"; f.trackListeners.get("ended")?.forEach(listener => listener()); expect(input.state).toBe("interrupted"); expect(session.state).toBe("interrupted"); expect(f.track.stop).toHaveBeenCalledOnce();
  expect(() => input.dispose()).not.toThrow(); unsubscribe(); expect(input.state).toBe("disposed"); expect(() => session.dispose()).not.toThrow();
});

it("continues capture teardown when one native track or listener cleanup throws", async () => {
  const f = fixture(), other = { ...f.track, stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  f.track.stop.mockImplementation(() => { throw new Error("track stop"); }); f.track.removeEventListener = vi.fn(() => { throw new Error("listener cleanup"); });
  const stream = { getTracks: () => [f.track, other], getAudioTracks: () => [f.track] } as unknown as MediaStream; f.platform.getUserMedia.mockResolvedValue(stream);
  const owner = new AbortController(), session = new BrowserAudioCaptureAdapter(f.platform).createSession(owner.signal); await session.requestRecordAuthorization(); session.createInputNode(new AUFXAudioFormat(48000, 1));
  expect(() => owner.abort()).not.toThrow(); expect(f.track.stop).toHaveBeenCalledOnce(); expect(other.stop).toHaveBeenCalledOnce(); expect(session.state).toBe("disposed");
});

it("rolls back a stream whose metadata read fails and permits a clean retry", async () => {
  const first = fixture(), second = fixture(); first.track.getSettings = vi.fn(() => { throw new Error("metadata"); }); let attempt = 0;
  const platform = { ...first.platform, getUserMedia: vi.fn(async () => ++attempt === 1 ? first.stream : second.stream) }, session = new BrowserAudioCaptureAdapter(platform).createSession();
  await expect(session.requestRecordAuthorization()).rejects.toThrow("metadata"); expect(first.track.stop).toHaveBeenCalledOnce(); expect(session.state).toBe("idle");
  await expect(session.requestRecordAuthorization()).resolves.toBeUndefined(); const input = session.createInputNode(new AUFXAudioFormat(48000, 1)); expect(input.sourceFormat).toEqual({ sampleRate: 48000, channelCount: 1 }); input.dispose(); expect(second.track.stop).toHaveBeenCalledOnce(); session.dispose();
});

it("handles denial and chunk-count exhaustion without retaining tracks", async () => {
  const denied = fixture(); denied.platform.getUserMedia.mockRejectedValue(new DOMException("No microphone permission", "NotAllowedError"));
  const deniedSession = new BrowserAudioCaptureAdapter(denied.platform).createSession(); await expect(deniedSession.requestRecordAuthorization()).rejects.toThrow(); expect(deniedSession.state).toBe("denied"); deniedSession.dispose();
  const f = fixture(), session = new BrowserAudioCaptureAdapter(f.platform).createSession(); await session.requestRecordAuthorization();
  const recorder = session.createRecorder({ maximumChunks: 2 }); recorder.record();
  f.emit("dataavailable", { data: new Blob([]) }); f.emit("dataavailable", { data: new Blob([]) }); f.emit("dataavailable", { data: new Blob([]) });
  await expect(recorder.result).rejects.toThrow("chunk"); expect(f.track.stop).toHaveBeenCalledTimes(1); session.dispose();
});
it("reports input/output route changes and rejects input changes during recording", async () => {
  const f = fixture(), setOutputDevice = vi.fn(async (id: string) => id);
  const session = new BrowserAudioCaptureAdapter({ ...f.platform, setOutputDevice }).createSession();
  await session.setPreferredInput("mic-b"); expect(f.platform.getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: "mic-b" } } });
  expect(session.route).toMatchObject({ desiredInput: "mic-b", actualInput: "mic-a" });
  await session.setPreferredOutput("speaker-a"); expect(session.route.actualOutput).toBe("speaker-a");
  const recorder = session.createRecorder(); recorder.record(); await expect(session.setPreferredInput("mic-c")).rejects.toThrow("active");
  session.dispose(); await expect(recorder.result).rejects.toThrow();
});

it("finalizes capture on track loss and discards revoked final decode results", async () => {
  const f = fixture(), session = new BrowserAudioCaptureAdapter(f.platform).createSession(); await session.requestRecordAuthorization();
  const recorder = session.createRecorder(); recorder.record(); f.trackListeners.get("ended")?.forEach(listener => listener());
  await expect(recorder.result).resolves.toMatchObject({ byteLength: 3, frameCount: 48000, sampleRate: 48000, channelCount: 1 }); expect(session.state).toBe("interrupted"); expect(f.track.stop).toHaveBeenCalledTimes(1); session.dispose();
  const other = fixture(); let finish!: (value: { sampleRate: number; channelCount: number; frameCount: number; duration: number }) => void;
  other.platform.decodeRecording = () => new Promise(resolve => { finish = resolve; });
  const owner = new AbortController(), scoped = new BrowserAudioCaptureAdapter(other.platform).createSession(owner.signal); await scoped.requestRecordAuthorization();
  const take = scoped.createRecorder(); take.record(); const result = take.stop(); owner.abort();
  finish({ sampleRate: 48000, channelCount: 1, frameCount: 48000, duration: 1 });
  await expect(result).rejects.toThrow(); expect(take.state).toBe("cancelled");
});
