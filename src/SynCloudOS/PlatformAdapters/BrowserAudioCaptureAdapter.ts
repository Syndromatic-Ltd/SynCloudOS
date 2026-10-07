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

import { AUFXAudioRecorder, type AUFXAudioRecorderEvent, type AUFXAudioRecorderOptions } from "../../FX/AudioFX/AUFXAudioRecorder";
import {
  AUFXAudioSession,
  type AUFXAudioDevice,
  type AUFXAudioInterruptionReason,
  type AUFXAudioRoute,
  type AUFXAudioRouteRecoveryOptions,
  type AUFXAudioRouteRecoveryResult,
  type AUFXAudioRouteRecoveryStatus,
  type AUFXAudioSessionPort,
  type AUFXAudioSessionState,
} from "../../FX/AudioFX/AUFXAudioSession";
import { AUFXAudioInputNode, type AUFXAudioInputNodeState } from "../../FX/AudioFX/AUFXAudioInputNode";
import type { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
export interface BrowserAudioCapturePlatform {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices(): Promise<readonly { deviceId: string; kind: string; label: string; groupId: string }[]>;
  createRecorder(stream: MediaStream, options: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(mimeType: string): boolean;
  now(): number;
  subscribeDeviceChange(listener: () => void): () => void;
  setOutputDevice?(deviceId: string, signal?: AbortSignal): Promise<string>;
  decodeRecording?(data: Blob, signal: AbortSignal): Promise<{ duration: number; frameCount: number; sampleRate: number; channelCount: number }>;
}
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
function deviceID(value: string) { if (typeof value !== "string" || value.length > 1024 || /[\u0000-\u001f]/.test(value)) throw new TypeError("Invalid audio device ID."); return value; }
function abortError() { return new DOMException("Audio session operation cancelled.", "AbortError"); }
type BrowserInputRecord = { readonly token: object; readonly capability: object; readonly stream: MediaStream; readonly track: MediaStreamTrack; readonly listeners: Set<() => void>; state: AUFXAudioInputNodeState; disposed: boolean; connected: boolean; };
const browserInputs = new WeakMap<object, BrowserInputRecord>();
export interface BrowserAUFXInputConnection { setPaused(paused: boolean): void; dispose(): void; }
export function connectBrowserAUFXInput(token: object, capability: object, context: AudioContext, destination: AudioNode, inputIndex: number, signal: AbortSignal): BrowserAUFXInputConnection {
  signal.throwIfAborted(); const record = browserInputs.get(token);
  if (!record || record.disposed || record.connected || record.capability !== capability || record.state === "interrupted") throw new DOMException("Audio input does not belong to this mounted graph.", "SecurityError");
  const source = context.createMediaStreamSource(record.stream), resumeEnabled = record.track.enabled !== false; let disposed = false, paused = false;
  const changed = () => { if (record.disposed || record.state === "interrupted") dispose(); };
  const setPaused = (value: boolean) => { if (disposed || paused === value) return; paused = value; try { record.track.enabled = value ? false : resumeEnabled; } catch { /* Native track state remains authoritative. */ } };
  const dispose = () => { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); record.listeners.delete(changed); record.connected = false; if (paused && !record.disposed && record.state !== "interrupted") { try { record.track.enabled = resumeEnabled; } catch { /* Continue source teardown. */ } } try { source.disconnect(); } catch {} };
  record.connected = true; record.listeners.add(changed);
  signal.addEventListener("abort", dispose, { once: true });
  try { source.connect(destination, 0, inputIndex); }
  catch (error) { dispose(); throw error; }
  return Object.freeze({ setPaused, dispose });
}
class BrowserAudioSession implements AUFXAudioSessionPort {
  readonly #platform: BrowserAudioCapturePlatform | null;
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Set<AbortController>();
  readonly #pendingOutputs = new Set<AbortController>();
  #removeOwnerAbort: (() => void) | null = null;
  #removeDeviceChange: (() => void) | null = null;
  #trackListeners: (() => void)[] = [];
  #stream: MediaStream | null = null;
  #sourceFormat = Object.freeze({ sampleRate: null, channelCount: null }) as Readonly<{ sampleRate: number | null; channelCount: number | null }>;
  #recorder: AUFXAudioRecorder | null = null;
  #input: BrowserInputRecord | null = null;
  #state: AUFXAudioSessionState;
  #route: AUFXAudioRoute = Object.freeze({ desiredInput: null, actualInput: null, desiredOutput: null, actualOutput: null });
  #interruptionReason: AUFXAudioInterruptionReason | null = null;
  #hasAuthorizedInput = false;
  #generation = 0;
  #outputGeneration = 0;
  #deviceObservationGeneration = 0;
  constructor(platform: BrowserAudioCapturePlatform | null, ownerSignal?: AbortSignal, readonly capability: object = Object.freeze({})) {
    this.#platform = platform; this.#state = platform ? "idle" : "unavailable";
    if (ownerSignal?.aborted) { this.#state = "disposed"; return; }
    if (ownerSignal) { const abort = () => this.dispose(); ownerSignal.addEventListener("abort", abort, { once: true }); this.#removeOwnerAbort = () => ownerSignal.removeEventListener("abort", abort); }
    this.#removeDeviceChange = platform?.subscribeDeviceChange(() => {
      if (this.#state === "disposed") return;
      const observationGeneration = ++this.#deviceObservationGeneration;
      const observedInput = this.#route.actualInput, observedOutput = this.#route.actualOutput;
      void this.enumerateDevices().then(devices => {
        if (this.#state === "disposed" || observationGeneration !== this.#deviceObservationGeneration) return;
        const missingOutput = observedOutput && this.#route.actualOutput === observedOutput && !devices.some(device => device.kind === "output" && device.id === observedOutput);
        if (missingOutput) {
          this.#route = Object.freeze({ ...this.#route, actualOutput: null });
          this.#interruptionReason = "output-device-removed";
        }
        const missingInput = observedInput && this.#route.actualInput === observedInput && !devices.some(device => device.kind === "input" && device.id === observedInput);
        if (missingInput) this.interrupt("input-device-removed");
        else this.notify();
      }).catch(() => this.notify());
    }) ?? null;
  }
  get state() { if (this.#state === "disposed" || this.#state === "interrupted") return this.#state; if (this.#recorder?.state === "recording") return "recording"; if (this.#recorder?.state === "paused") return "paused"; return this.#state; }
  get route() { return this.#route; }
  get interruptionReason() { return this.#interruptionReason; }
  get capabilities() { return Object.freeze({ capture: !!this.#platform && this.#state !== "disposed", inputSelection: !!this.#platform && this.#state !== "disposed", outputSelection: !!this.#platform?.setOutputDevice && this.#state !== "disposed", mimeTypes: Object.freeze(this.#platform ? MIME_TYPES.filter(type => this.#platform!.isTypeSupported(type)) : []) }); }
  private assertActive() { if (this.#state === "disposed") throw new Error("Audio session is disposed."); if (!this.#platform) throw new Error("Audio capture is unavailable."); }
  private notify() { for (const listener of this.#listeners) { try { listener(); } catch { /* Observer failures cannot retain microphone authority. */ } } }
  subscribe(listener: () => void) { this.assertActive(); this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  private releaseInput() {
    const stream = this.#stream; this.#stream = null;
    for (const remove of this.#trackListeners) { try { remove(); } catch { /* Continue releasing every track listener. */ } } this.#trackListeners = [];
    for (const track of stream?.getTracks() ?? []) { try { track.stop(); } catch { /* Continue releasing every captured track. */ } }
    this.#sourceFormat = Object.freeze({ sampleRate: null, channelCount: null });
    this.#route = Object.freeze({ ...this.#route, actualInput: null });
  }
  private setInputState(state: AUFXAudioInputNodeState) { const input = this.#input; if (!input || input.disposed || input.state === state) return; input.state = state; for (const listener of [...input.listeners]) { try { listener(); } catch {} } }
  private interrupt(reason: Extract<AUFXAudioInterruptionReason, "input-ended" | "input-device-removed">) {
    if (this.#state === "disposed") return;
    this.#state = "interrupted"; this.#interruptionReason = reason;
    this.setInputState("interrupted"); this.#input = null;
    const recorder = this.#recorder;
    if (recorder && !["finished", "error", "cancelled"].includes(recorder.state)) { try { void recorder.stop().catch(() => {}); } catch { /* Input release must still continue. */ } }
    this.releaseInput(); this.notify();
  }
  async requestRecordAuthorization(signal?: AbortSignal) {
    this.assertActive(); signal?.throwIfAborted();
    if (this.#input || this.#recorder && !["finished", "error", "cancelled"].includes(this.#recorder.state)) throw new Error("Audio input cannot change while an input consumer is active.");
    const previousState = this.#state, previousReason = this.#interruptionReason;
    const generation = ++this.#generation;
    for (const pending of this.#pending) pending.abort();
    const controller = new AbortController(); this.#pending.add(controller);
    const abort = () => controller.abort(signal?.reason); signal?.addEventListener("abort", abort, { once: true });
    this.#state = "requesting"; this.notify();
    let incoming: MediaStream | null = null;
    try {
      incoming = await new Promise<MediaStream>((resolve, reject) => {
        let settled = false;
        const onAbort = () => { if (settled) return; settled = true; reject(abortError()); };
        controller.signal.addEventListener("abort", onAbort, { once: true });
        const constraints = this.#route.desiredInput ? { audio: { deviceId: { exact: this.#route.desiredInput } } } : { audio: true };
        this.#platform!.getUserMedia(constraints).then(stream => {
          controller.signal.removeEventListener("abort", onAbort);
          if (settled || controller.signal.aborted || this.#state === "disposed" || generation !== this.#generation) { for (const track of stream.getTracks()) { try { track.stop(); } catch { /* Continue releasing every late track. */ } } if (!settled) reject(abortError()); return; }
          settled = true; resolve(stream);
        }, error => { controller.signal.removeEventListener("abort", onAbort); if (!settled) { settled = true; reject(error); } });
      });
      if (controller.signal.aborted || this.state === "disposed" || generation !== this.#generation) { for (const track of incoming.getTracks()) { try { track.stop(); } catch { /* Continue releasing every revoked track. */ } } throw abortError(); }
      const track = incoming.getAudioTracks()[0];
      if (!track || track.readyState === "ended") throw new Error("No audio input track was granted.");
      const settings = track.getSettings();
      this.releaseInput(); this.#stream = incoming; this.#sourceFormat = Object.freeze({ sampleRate: Number.isFinite(settings.sampleRate) ? settings.sampleRate! : null, channelCount: Number.isInteger(settings.channelCount) ? settings.channelCount! : null });
      this.#route = Object.freeze({ ...this.#route, actualInput: settings.deviceId ?? this.#route.desiredInput ?? "default" });
      for (const input of incoming.getAudioTracks()) { const ended = () => this.interrupt("input-ended"), mute = () => { this.setInputState("muted"); this.notify(); }, unmute = () => { if (this.#input && this.#state === "authorized") this.setInputState("active"); this.notify(); }; input.addEventListener("ended", ended); input.addEventListener("mute", mute); input.addEventListener("unmute", unmute); this.#trackListeners.push(() => { input.removeEventListener("ended", ended); input.removeEventListener("mute", mute); input.removeEventListener("unmute", unmute); }); }
      this.#hasAuthorizedInput = true; this.#state = "authorized";
      if (this.#interruptionReason === "input-ended" || this.#interruptionReason === "input-device-removed" || this.#interruptionReason === "input-acquisition-failed" || this.#interruptionReason === "permission-denied") this.#interruptionReason = null;
      this.notify();
    } catch (error) {
      if (incoming && this.#stream === incoming && this.#state === "requesting") this.releaseInput();
      else if (incoming && this.#stream !== incoming) for (const track of incoming.getTracks()) { try { track.stop(); } catch { /* Continue releasing a failed acquisition. */ } }
      if (this.state !== "disposed" && generation === this.#generation) {
        if (this.#stream) this.#state = "authorized";
        else if (error instanceof DOMException && error.name === "NotAllowedError") { this.#hasAuthorizedInput = false; this.#state = "denied"; this.#interruptionReason = "permission-denied"; }
        else if (controller.signal.aborted || error instanceof DOMException && error.name === "AbortError") { this.#state = previousState === "interrupted" ? "interrupted" : "idle"; this.#interruptionReason = previousReason; }
        else { this.#state = previousState === "interrupted" ? "interrupted" : "idle"; this.#interruptionReason = "input-acquisition-failed"; }
      }
      this.notify(); throw error;
    } finally { signal?.removeEventListener("abort", abort); this.#pending.delete(controller); }
  }
  async enumerateDevices(signal?: AbortSignal): Promise<readonly AUFXAudioDevice[]> {
    this.assertActive(); signal?.throwIfAborted(); const devices = await this.#platform!.enumerateDevices(); signal?.throwIfAborted(); this.assertActive();
    return Object.freeze(devices.filter(device => device.kind === "audioinput" || device.kind === "audiooutput").map(device => Object.freeze({ id: device.deviceId, kind: device.kind === "audioinput" ? "input" as const : "output" as const, label: device.label, groupId: device.groupId })));
  }
  async setPreferredInput(id: string, signal?: AbortSignal) {
    this.assertActive(); deviceID(id);
    if (this.#input || this.#recorder && !["finished", "error", "cancelled"].includes(this.#recorder.state)) throw new Error("Audio input cannot change while an input consumer is active.");
    this.#route = Object.freeze({ ...this.#route, desiredInput: id }); this.notify(); await this.requestRecordAuthorization(signal);
  }
  async setPreferredOutput(id: string, signal?: AbortSignal) {
    this.assertActive(); deviceID(id); signal?.throwIfAborted();
    this.#route = Object.freeze({ ...this.#route, desiredOutput: id }); this.notify();
    if (!this.#platform!.setOutputDevice) throw new Error("Audio output routing is unavailable.");
    const generation = ++this.#outputGeneration;
    for (const pending of this.#pendingOutputs) pending.abort();
    const controller = new AbortController(); this.#pendingOutputs.add(controller);
    const abort = () => controller.abort(signal?.reason); signal?.addEventListener("abort", abort, { once: true });
    try {
      const actual = await this.#platform!.setOutputDevice(id, controller.signal); controller.signal.throwIfAborted();
      if (this.#state === "disposed" || generation !== this.#outputGeneration) throw abortError();
      this.#route = Object.freeze({ ...this.#route, actualOutput: actual });
      if (this.#interruptionReason === "output-selection-failed" || this.#interruptionReason === "output-device-removed") this.#interruptionReason = null;
      this.notify();
    } catch (error) {
      if (this.#state !== "disposed" && generation === this.#outputGeneration && !controller.signal.aborted) { this.#interruptionReason = "output-selection-failed"; this.notify(); }
      throw error;
    } finally { signal?.removeEventListener("abort", abort); this.#pendingOutputs.delete(controller); }
  }
  async recoverRoute(options: AUFXAudioRouteRecoveryOptions = {}, signal?: AbortSignal): Promise<AUFXAudioRouteRecoveryResult> {
    this.assertActive(); signal?.throwIfAborted();
    const reason = this.#interruptionReason;
    let input: AUFXAudioRouteRecoveryStatus = "not-requested", output: AUFXAudioRouteRecoveryStatus = "not-requested";
    if ((options.input ?? "none") === "if-authorized") {
      if (this.#route.actualInput) input = "recovered";
      else if (!this.#hasAuthorizedInput) input = "authorization-required";
      else { await this.requestRecordAuthorization(signal); input = "recovered"; }
    }
    if ((options.output ?? "none") === "retry-desired") {
      const desired = this.#route.desiredOutput;
      if (!desired) output = "not-requested";
      else if (!this.#platform!.setOutputDevice) output = "unavailable";
      else if (this.#route.actualOutput === desired) output = "recovered";
      else { await this.setPreferredOutput(desired, signal); output = "recovered"; }
    }
    return Object.freeze({ reason, input, output, route: this.#route });
  }
  createRecorder(options: AUFXAudioRecorderOptions = {}) {
    this.assertActive(); if (!this.#stream || this.#state !== "authorized") throw new Error("Explicit audio input authorization is required.");
    if (this.#input) throw new Error("Only one input consumer may own this session.");
    if (this.#recorder && !["finished", "error", "cancelled"].includes(this.#recorder.state)) throw new Error("Only one recorder may own this input.");
    const mimeType = options.mimeType ?? this.capabilities.mimeTypes[0];
    if (!mimeType || !this.#platform!.isTypeSupported(mimeType)) throw new Error("Requested recording format is unavailable.");
    const native = this.#platform!.createRecorder(this.#stream, { mimeType });
    let unsubscribe: (() => void) | null = null;
    const recorder = new AUFXAudioRecorder({
      mimeType: native.mimeType || mimeType,
      now: () => this.#platform!.now(),
      subscribe: handler => {
        const data = (event: Event) => handler({ type: "data", data: (event as BlobEvent).data });
        const stop = () => { this.releaseInput(); if (this.#state !== "disposed" && this.#state !== "interrupted") this.#state = "idle"; handler({ type: "stop" }); this.notify(); };
        const error = (event: Event) => handler({ type: "error", error: (event as Event & { error?: Error }).error ?? new Error("Browser recording failed.") });
        native.addEventListener("dataavailable", data); native.addEventListener("stop", stop); native.addEventListener("error", error);
        unsubscribe = () => { native.removeEventListener("dataavailable", data); native.removeEventListener("stop", stop); native.removeEventListener("error", error); };
        return unsubscribe;
      },
      start: timeslice => { native.start(timeslice); this.notify(); },
      pause: () => { native.pause(); this.notify(); },
      resume: () => { native.resume(); this.notify(); },
      stop: () => { if (native.state !== "inactive") native.stop(); },
      decode: this.#platform!.decodeRecording ? (data, signal) => this.#platform!.decodeRecording!(data, signal) : undefined,
      dispose: () => {
        unsubscribe?.(); unsubscribe = null;
        if (native.state !== "inactive") { try { native.stop(); } catch { /* Input teardown still follows a native stop failure. */ } }
        this.releaseInput(); if (this.#state !== "disposed" && this.#state !== "interrupted") this.#state = "idle"; this.#recorder = null; this.notify();
      },
    }, options);
    this.#recorder = recorder; return recorder;
  }
  createInputNode(format: AUFXAudioFormat) {
    this.assertActive();
    if (!this.#stream || this.#state !== "authorized") throw new Error("Explicit audio input authorization is required.");
    if (this.#input || this.#recorder && !["finished", "error", "cancelled"].includes(this.#recorder.state)) throw new Error("Only one input consumer may own this session.");
    const track = this.#stream.getAudioTracks()[0]; if (!track || track.readyState === "ended") throw new Error("No live authorized audio track is available.");
    const token = Object.freeze({}), input: BrowserInputRecord = { token, capability: this.capability, stream: this.#stream, track, listeners: new Set(), state: track.muted || track.enabled === false ? "muted" : "active", disposed: false, connected: false };
    this.#input = input; browserInputs.set(token, input);
    return new AUFXAudioInputNode(format, {
      get state() { return input.disposed ? "disposed" : track.readyState === "ended" ? "interrupted" : track.muted || track.enabled === false ? "muted" : input.state; },
      sourceFormat: this.#sourceFormat,
      token, capability: this.capability,
      subscribe(listener) { if (input.disposed) throw new Error("Audio input node is disposed."); input.listeners.add(listener); return () => input.listeners.delete(listener); },
      dispose: () => { if (input.disposed) return; input.disposed = true; input.state = "disposed"; browserInputs.delete(token); for (const listener of [...input.listeners]) { try { listener(); } catch {} } input.listeners.clear(); if (this.#input === input) { this.#input = null; this.releaseInput(); if (this.#state !== "disposed" && this.#state !== "interrupted") this.#state = "idle"; this.notify(); } },
    });
  }
  dispose() {
    if (this.#state === "disposed") return; this.#state = "disposed"; this.#generation++; this.#outputGeneration++; this.#deviceObservationGeneration++;
    for (const controller of this.#pending) { try { controller.abort(); } catch { /* Continue aborting every pending acquisition. */ } } this.#pending.clear();
    for (const controller of this.#pendingOutputs) { try { controller.abort(); } catch { /* Continue aborting every pending route selection. */ } } this.#pendingOutputs.clear();
    try { this.#recorder?.cancel(); } catch { /* Capture release continues below. */ } this.#recorder = null; const input = this.#input; this.#input = null; if (input && !input.disposed) { input.disposed = true; input.state = "disposed"; browserInputs.delete(input.token); for (const listener of [...input.listeners]) { try { listener(); } catch {} } input.listeners.clear(); } this.releaseInput(); try { this.#removeOwnerAbort?.(); } catch { /* Continue host listener teardown. */ } this.#removeOwnerAbort = null; try { this.#removeDeviceChange?.(); } catch { /* Continue host listener teardown. */ } this.#removeDeviceChange = null; this.notify(); this.#listeners.clear();
  }
}
export class BrowserAudioCaptureAdapter {
  readonly #platform: BrowserAudioCapturePlatform | null;
  constructor(platform: BrowserAudioCapturePlatform | null) { this.#platform = platform; }
  createSession(ownerSignal?: AbortSignal, capability: object = Object.freeze({})) { return new AUFXAudioSession(new BrowserAudioSession(this.#platform, ownerSignal, capability)); }
}
/** Host-only browser binding. It performs no capture or permission request during construction. */
export function createBrowserAudioCapturePlatform(browserNavigator: Navigator, browserWindow: Window, setOutputDevice?: BrowserAudioCapturePlatform["setOutputDevice"]): BrowserAudioCapturePlatform | null {
  const mediaDevices = browserNavigator.mediaDevices;
  const native = browserWindow as unknown as { MediaRecorder?: typeof MediaRecorder; OfflineAudioContext?: typeof OfflineAudioContext };
  const Recorder = native.MediaRecorder;
  if (!mediaDevices?.getUserMedia || !Recorder) return null;
  return {
    getUserMedia: constraints => mediaDevices.getUserMedia(constraints),
    enumerateDevices: () => mediaDevices.enumerateDevices(),
    createRecorder: (stream, options) => new Recorder(stream, options),
    isTypeSupported: mimeType => Recorder.isTypeSupported(mimeType),
    now: () => browserWindow.performance.now() / 1000,
    subscribeDeviceChange: listener => { mediaDevices.addEventListener("devicechange", listener); return () => mediaDevices.removeEventListener("devicechange", listener); },
    setOutputDevice,
    decodeRecording: native.OfflineAudioContext ? async (data, signal) => {
      signal.throwIfAborted(); const bytes = await data.arrayBuffer(); signal.throwIfAborted();
      const context = new native.OfflineAudioContext!(1, 1, 48000);
      const buffer = await context.decodeAudioData(bytes); signal.throwIfAborted();
      if (buffer.length * buffer.numberOfChannels > 16777216) throw new RangeError("Decoded recording exceeds the sample budget.");
      return { duration: buffer.duration, frameCount: buffer.length, sampleRate: buffer.sampleRate, channelCount: buffer.numberOfChannels };
    } : undefined,
  };
}

