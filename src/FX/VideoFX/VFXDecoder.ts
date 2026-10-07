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

import { VFXEncodedChunk } from "./VFXEncodedChunk";
import { normalizeVFXDecoderConfig, type VFXDecoderConfig, type VFXDecoderConfigInput } from "./VFXCodecCapabilities";
import { VFXFrame } from "./VFXFrame";

export type VFXDecoderState = "unconfigured" | "configured" | "draining" | "failed" | "disposed";

export interface VFXDecoderBackendCallbacks {
  output(frame: VFXFrame): void;
  error(error: unknown): void;
}

export interface VFXDecoderBackend {
  readonly decodeQueueSize: number;
  configure(config: VFXDecoderConfig, callbacks: VFXDecoderBackendCallbacks): void;
  decode(chunk: VFXEncodedChunk): void;
  flush(): Promise<void>;
  reset(): void;
  dispose(): void;
}

export interface VFXDecoderOptions {
  readonly backend: VFXDecoderBackend;
  readonly output: (frame: VFXFrame) => void | Promise<void>;
  readonly error?: (error: unknown) => void;
  readonly maximumPendingOutputs?: number;
  readonly maximumDecodeQueueSize?: number;
}

interface PendingOutput {
  readonly id: number;
  readonly generation: number;
  readonly frame: VFXFrame;
  readonly promise: Promise<void>;
}

function positiveLimit(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > 65_536)
    throw new RangeError(`${name} must be a positive bounded safe integer.`);
  return Number(value);
}

function asError(value: unknown): unknown {
  return value instanceof Error || value instanceof DOMException ? value : new Error(String(value));
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Video decoder generation ended.", "AbortError");
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

function promiseLike(value: unknown): value is PromiseLike<void> {
  return !!value && (typeof value === "object" || typeof value === "function") && typeof (value as PromiseLike<void>).then === "function";
}

export class VFXDecoder {
  readonly #backend: VFXDecoderBackend;
  readonly #output: (frame: VFXFrame) => void | Promise<void>;
  readonly #error: (error: unknown) => void;
  readonly #maximumPendingOutputs: number;
  readonly #maximumDecodeQueueSize: number;
  #state: VFXDecoderState = "unconfigured";
  #generation = 0;
  #generationController = new AbortController();
  #needsKeyFrame = true;
  #pendingOutputs = new Map<number, PendingOutput>();
  #nextOutputId = 1;

  constructor(options: VFXDecoderOptions) {
    if (!options || typeof options !== "object" || !options.backend || typeof options.output !== "function")
      throw new TypeError("Video decoder requires a backend and output callback.");
    this.#backend = options.backend;
    this.#output = options.output;
    this.#error = options.error ?? (() => undefined);
    this.#maximumPendingOutputs = positiveLimit(options.maximumPendingOutputs, 8, "Video decoder pending-output limit");
    this.#maximumDecodeQueueSize = positiveLimit(options.maximumDecodeQueueSize, 32, "Video decoder queue limit");
  }

  get state(): VFXDecoderState { return this.#state; }
  get generation(): number { return this.#generation; }
  get pendingOutputCount(): number { return this.#pendingOutputs.size; }

  configure(input: VFXDecoderConfigInput): void {
    this.#assertNotDisposed();
    if (this.#state !== "unconfigured") throw new DOMException("Video decoder must be unconfigured before configure.", "InvalidStateError");
    const config = normalizeVFXDecoderConfig(input);
    const generation = this.#generation;
    try {
      this.#backend.configure(config, {
        output: (frame) => this.#receiveOutput(frame, generation),
        error: (error) => this.#receiveError(error, generation),
      });
    } catch (error) {
      this.#fail(error);
      throw error;
    }
    this.#needsKeyFrame = true;
    this.#state = "configured";
  }

  decode(chunk: VFXEncodedChunk): void {
    this.#assertConfiguredForInput();
    if (!(chunk instanceof VFXEncodedChunk)) throw new TypeError("Video decoder input must be a VFXEncodedChunk.");
    if (this.#needsKeyFrame && chunk.type !== "key") throw new DOMException("Video decoder requires a keyframe after configuration or reset.", "DataError");
    const queueSize = Number(this.#backend.decodeQueueSize);
    if (!Number.isFinite(queueSize) || queueSize < 0) throw new TypeError("Video decoder backend reported an invalid queue size.");
    if (queueSize >= this.#maximumDecodeQueueSize) throw new DOMException("Video decoder input queue limit exceeded.", "QuotaExceededError");
    try {
      this.#backend.decode(chunk);
      this.#needsKeyFrame = false;
    } catch (error) {
      this.#fail(error);
      throw error;
    }
  }

  async flush(): Promise<void> {
    this.#assertNotDisposed();
    if (this.#state !== "configured") throw new DOMException("Video decoder must be configured before flush.", "InvalidStateError");
    const generation = this.#generation;
    const signal = this.#generationController.signal;
    this.#state = "draining";
    try {
      await abortable(Promise.resolve(this.#backend.flush()), signal);
      const acknowledgements = [...this.#pendingOutputs.values()]
        .filter((entry) => entry.generation === generation)
        .map((entry) => entry.promise);
      if (acknowledgements.length > 0) await abortable(Promise.all(acknowledgements).then(() => undefined), signal);
      if (this.#generation === generation && this.#state === "draining") {
        // WebCodecs re-arms its "key chunk required" flag after flush().
        // Mirror that state here so callers receive the framework-level
        // contract instead of an opaque native decode() failure.
        this.#needsKeyFrame = true;
        this.#state = "configured";
      }
    } catch (error) {
      if (signal.aborted || this.#generation !== generation) throw abortReason(signal);
      this.#fail(error);
      throw error;
    }
  }

  reset(): void {
    this.#assertNotDisposed();
    const prior = this.#generationController;
    this.#generation += 1;
    prior.abort(new DOMException("Video decoder was reset.", "AbortError"));
    this.#closePendingOutputs();
    try { this.#backend.reset(); } catch { /* backend reset cannot resurrect prior generation */ }
    this.#generationController = new AbortController();
    this.#needsKeyFrame = true;
    this.#state = "unconfigured";
  }

  dispose(): void {
    if (this.#state === "disposed") return;
    this.#generation += 1;
    this.#generationController.abort(new DOMException("Video decoder was disposed.", "AbortError"));
    this.#closePendingOutputs();
    try { this.#backend.dispose(); } finally { this.#state = "disposed"; }
  }

  #receiveOutput(frame: VFXFrame, generation: number): void {
    if (!(frame instanceof VFXFrame)) {
      this.#receiveError(new TypeError("Video decoder backend emitted an invalid frame."), generation);
      return;
    }
    if (generation !== this.#generation || (this.#state !== "configured" && this.#state !== "draining")) {
      frame.close();
      return;
    }
    if (this.#pendingOutputs.size >= this.#maximumPendingOutputs) {
      frame.close();
      this.#fail(new DOMException("Video decoder pending-output limit exceeded.", "QuotaExceededError"));
      return;
    }
    let acknowledgement: void | Promise<void>;
    try {
      acknowledgement = this.#output(frame);
    } catch (error) {
      frame.close();
      this.#fail(error);
      return;
    }
    if (!promiseLike(acknowledgement)) return;
    const id = this.#nextOutputId++;
    const promise = Promise.resolve(acknowledgement).then(
      () => {
        this.#pendingOutputs.delete(id);
      },
      (error) => {
        const entry = this.#pendingOutputs.get(id);
        if (!entry) return;
        this.#pendingOutputs.delete(id);
        entry.frame.close();
        this.#fail(error);
        throw error;
      },
    );
    this.#pendingOutputs.set(id, { id, generation, frame, promise });
    void promise.catch(() => undefined);
  }

  #receiveError(error: unknown, generation: number): void {
    if (generation !== this.#generation || this.#state === "disposed") return;
    this.#fail(error);
  }

  #fail(error: unknown): void {
    if (this.#state === "disposed" || this.#state === "failed") return;
    const normalized = asError(error);
    this.#state = "failed";
    this.#generationController.abort(normalized);
    this.#closePendingOutputs();
    try { this.#error(normalized); } catch { /* error observers cannot destabilize lifecycle cleanup */ }
  }

  #closePendingOutputs(): void {
    const pending = [...this.#pendingOutputs.values()];
    this.#pendingOutputs.clear();
    for (const entry of pending) entry.frame.close();
  }

  #assertConfiguredForInput(): void {
    this.#assertNotDisposed();
    if (this.#state !== "configured") throw new DOMException("Video decoder is not configured for decode input.", "InvalidStateError");
  }

  #assertNotDisposed(): void {
    if (this.#state === "disposed") throw new DOMException("Video decoder is disposed.", "InvalidStateError");
  }
}
