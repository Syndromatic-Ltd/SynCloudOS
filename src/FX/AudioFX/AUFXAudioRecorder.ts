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

export interface AUFXAudioRecording {
  readonly data: Blob;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly elapsedRecordingTime: number;
  readonly duration: number | null;
  readonly frameCount: number | null;
  readonly sampleRate: number | null;
  readonly channelCount: number | null;
}
export interface AUFXAudioRecorderOptions {
  readonly mimeType?: string;
  readonly maximumBytes?: number;
  readonly maximumChunks?: number;
  readonly maximumDuration?: number;
}
export type AUFXAudioRecorderState = "ready" | "recording" | "paused" | "stopping" | "finished" | "error" | "cancelled";
export type AUFXAudioRecorderEvent = { readonly type: "data"; readonly data: Blob } | { readonly type: "stop" } | { readonly type: "error"; readonly error: Error };
export interface AUFXAudioRecorderPort {
  readonly mimeType: string;
  now(): number;
  subscribe(handler: (event: AUFXAudioRecorderEvent) => void): () => void;
  start(timesliceMs: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  dispose(): void;
  decode?(data: Blob, signal: AbortSignal): Promise<Readonly<{ duration: number; frameCount: number; sampleRate: number; channelCount: number }>>;
}
function bounded(value: number | undefined, fallback: number, maximum: number, name: string) { const result = value ?? fallback; if (!Number.isFinite(result) || result <= 0 || result > maximum) throw new RangeError(`Invalid recording ${name}.`); return result; }
/** Bounded encoded recording lifecycle. Browser capture authority stays behind its owned port. */
export class AUFXAudioRecorder {
  readonly #port: AUFXAudioRecorderPort;
  readonly #limitBytes: number;
  readonly #limitChunks: number;
  readonly #limitDuration: number;
  readonly #decodeAbort = new AbortController();
  readonly #result: Promise<AUFXAudioRecording>;
  #resolve!: (result: AUFXAudioRecording) => void;
  #reject!: (error: Error) => void;
  #unsubscribe: () => void;
  #removeAbort: (() => void) | null = null;
  #chunks: Blob[] = [];
  #bytes = 0;
  #chunkCount = 0;
  #elapsed = 0;
  #startedAt = 0;
  #state: AUFXAudioRecorderState = "ready";
  #settled = false;
  #finalizing = false;
  #durationTimer: ReturnType<typeof setTimeout> | null = null;
  #finishTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(port: AUFXAudioRecorderPort, options: AUFXAudioRecorderOptions = {}) {
    this.#port = port;
    this.#limitBytes = bounded(options.maximumBytes, 16777216, 67108864, "byte limit");
    this.#limitChunks = bounded(options.maximumChunks, 4096, 16384, "chunk limit");
    this.#limitDuration = bounded(options.maximumDuration, 300, 3600, "duration limit");
    if (!Number.isInteger(this.#limitBytes) || !Number.isInteger(this.#limitChunks)) throw new RangeError("Recording byte and chunk limits must be integers.");
    this.#result = new Promise((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
    void this.#result.catch(() => {});
    this.#unsubscribe = port.subscribe(event => {
      if (this.#settled) return;
      if (event.type === "error") this.fail(event.error);
      else if (event.type === "stop") void this.finalize();
      else {
        if (++this.#chunkCount > this.#limitChunks) { this.fail(new RangeError("Recording chunk limit exceeded.")); return; }
        if (event.data.size === 0) return;
        if (this.#bytes + event.data.size > this.#limitBytes) { this.fail(new RangeError("Recording byte limit exceeded.")); return; }
        if (this.#chunks.length >= this.#limitChunks) { this.fail(new RangeError("Recording chunk limit exceeded.")); return; }
        this.#chunks.push(event.data); this.#bytes += event.data.size;
      }
    });
  }
  get state() { return this.#state; }
  get result() { return this.#result; }
  get elapsedRecordingTime() { return this.#elapsed + (this.#state === "recording" ? Math.max(0, this.#port.now() - this.#startedAt) : 0); }
  private durationTimer() { if (this.#durationTimer !== null) clearTimeout(this.#durationTimer); this.#durationTimer = setTimeout(() => { void this.stop(); }, Math.max(0, this.#limitDuration - this.#elapsed) * 1000); }
  record(signal?: AbortSignal) {
    if (this.#state !== "ready") throw new Error("Recorder is not ready."); if (signal?.aborted) { this.cancel(signal.reason); signal.throwIfAborted(); }
    if (signal) { const abort = () => this.cancel(signal.reason); signal.addEventListener("abort", abort, { once: true }); this.#removeAbort = () => signal.removeEventListener("abort", abort); }
    this.#state = "recording"; this.#startedAt = this.#port.now();
    try { this.#port.start(250); this.durationTimer(); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  pause() {
    if (this.#state !== "recording") throw new Error("Recorder is not recording.");
    this.#elapsed = this.elapsedRecordingTime; this.#state = "paused";
    if (this.#durationTimer !== null) clearTimeout(this.#durationTimer); this.#durationTimer = null;
    try { this.#port.pause(); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  resume() { if (this.#state !== "paused") throw new Error("Recorder is not paused."); this.#startedAt = this.#port.now(); this.#state = "recording"; try { this.#port.resume(); this.durationTimer(); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); } }
  stop(): Promise<AUFXAudioRecording> {
    if (this.#settled || this.#state === "stopping") return this.#result;
    if (this.#state === "ready") { this.fail(new Error("Recording has not started.")); return this.#result; }
    this.#elapsed = this.elapsedRecordingTime; this.#state = "stopping";
    if (this.#durationTimer !== null) clearTimeout(this.#durationTimer); this.#durationTimer = null;
    this.#finishTimer = setTimeout(() => this.fail(new Error("Recording finalization timed out.")), 10000);
    try { this.#port.stop(); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    return this.#result;
  }
  private async finalize() {
    if (this.#settled || this.#finalizing) return; this.#finalizing = true;
    if (this.#finishTimer === null) this.#finishTimer = setTimeout(() => this.fail(new Error("Recording finalization timed out.")), 10000);
    this.#elapsed = this.elapsedRecordingTime; this.#state = "stopping";
    try {
      if (!this.#bytes) throw new Error("Recording contains no audio data.");
      const data = new Blob(this.#chunks, { type: this.#port.mimeType }); this.#chunks = [];
      const metadata = await this.#port.decode?.(data, this.#decodeAbort.signal);
      if (this.#settled) return;
      if (metadata && (!Number.isSafeInteger(metadata.frameCount) || metadata.frameCount < 0 || !Number.isFinite(metadata.duration) || metadata.duration < 0 || !Number.isFinite(metadata.sampleRate) || metadata.sampleRate <= 0 || !Number.isInteger(metadata.channelCount) || metadata.channelCount < 1)) throw new Error("Invalid decoded recording metadata.");
      this.#settled = true; this.#state = "finished"; this.cleanup();
      this.#resolve(Object.freeze({ data, mimeType: this.#port.mimeType, byteLength: data.size, elapsedRecordingTime: this.#elapsed, duration: metadata?.duration ?? null, frameCount: metadata?.frameCount ?? null, sampleRate: metadata?.sampleRate ?? null, channelCount: metadata?.channelCount ?? null }));
    } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
  }
  private fail(error: Error, cancelled = false) { if (this.#settled) return; this.#elapsed = this.elapsedRecordingTime; this.#settled = true; this.#state = cancelled ? "cancelled" : "error"; this.#decodeAbort.abort(error); this.cleanup(); this.#reject(error); }
  private cleanup() { if (this.#durationTimer !== null) clearTimeout(this.#durationTimer); if (this.#finishTimer !== null) clearTimeout(this.#finishTimer); this.#durationTimer = null; this.#finishTimer = null; this.#unsubscribe(); this.#removeAbort?.(); this.#removeAbort = null; this.#chunks = []; this.#port.dispose(); }
  cancel(reason?: unknown) { this.fail(reason instanceof Error ? reason : new DOMException("Audio recording cancelled.", "AbortError"), true); }
  dispose() { this.cancel(); }
}
