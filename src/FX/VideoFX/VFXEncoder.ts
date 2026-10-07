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
import { VFXFrame } from "./VFXFrame";

export type VFXEncoderState = "unconfigured" | "configuring" | "configured" | "draining" | "failed" | "disposed";
export type VFXEncoderLatencyMode = "quality" | "realtime";
export type VFXEncoderAlphaMode = "discard" | "keep";
export type VFXEncoderHardwareAcceleration = "no-preference" | "prefer-hardware" | "prefer-software";

export interface VFXEncoderConfigInput {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly bitrate: number;
  readonly framerate: number;
  readonly hardwareAcceleration?: VFXEncoderHardwareAcceleration;
  readonly latencyMode?: VFXEncoderLatencyMode;
  readonly alpha?: VFXEncoderAlphaMode;
  readonly scalabilityMode?: string | null;
}

export interface VFXEncoderConfig {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly bitrate: number;
  readonly framerate: number;
  readonly hardwareAcceleration: VFXEncoderHardwareAcceleration;
  readonly latencyMode: VFXEncoderLatencyMode;
  readonly alpha: VFXEncoderAlphaMode;
  readonly scalabilityMode: string | null;
}

export interface VFXEncoderDecoderConfig {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly description?: Uint8Array;
}

export interface VFXEncoderOutputMetadata {
  readonly decoderConfig?: VFXEncoderDecoderConfig;
  readonly colourSpace?: string;
}

export interface VFXEncoderFrameOptions {
  readonly keyFrame?: boolean;
}

export interface VFXEncoderBackendCallbacks {
  output(chunk: VFXEncodedChunk, metadata: VFXEncoderOutputMetadata): void;
  error(error: unknown): void;
}

export interface VFXEncoderBackend {
  readonly encodeQueueSize: number;
  configure(config: VFXEncoderConfig, callbacks: VFXEncoderBackendCallbacks): void;
  encode(frame: VFXFrame, options: VFXEncoderFrameOptions): void;
  flush(): Promise<void>;
  reset(): void;
  dispose(): void;
}

export interface VFXEncoderCapabilityProbe {
  queryEncoder(config: VFXEncoderConfig): Promise<Readonly<{
    supported: boolean;
    config?: Partial<VFXEncoderConfig>;
    reason?: string;
  }>>;
}

export type VFXEncoderCapability =
  | Readonly<{ supported: true; config: VFXEncoderConfig }>
  | Readonly<{ supported: false; config: VFXEncoderConfig; reason: string }>;

export interface VFXEncoderOptions {
  readonly backend: VFXEncoderBackend;
  readonly output: (chunk: VFXEncodedChunk, metadata: VFXEncoderOutputMetadata) => void | Promise<void>;
  readonly error?: (error: unknown) => void;
  readonly maximumPendingOutputs?: number;
  readonly maximumEncodeQueueSize?: number;
}

const HARDWARE = new Set<VFXEncoderHardwareAcceleration>(["no-preference", "prefer-hardware", "prefer-software"]);
const LATENCY = new Set<VFXEncoderLatencyMode>(["quality", "realtime"]);
const ALPHA = new Set<VFXEncoderAlphaMode>(["discard", "keep"]);

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum)
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return Number(value);
}

function finite(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} must be finite between ${minimum} and ${maximum}.`);
  return value;
}

function positiveLimit(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  return integer(value, name, 1, 65_536);
}

function asError(value: unknown): unknown {
  return value instanceof Error || value instanceof DOMException ? value : new Error(String(value));
}

function promiseLike(value: unknown): value is PromiseLike<void> {
  return !!value && (typeof value === "object" || typeof value === "function") && typeof (value as PromiseLike<void>).then === "function";
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Video encoder generation ended.", "AbortError");
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

export function normalizeVFXEncoderConfig(input: VFXEncoderConfigInput): VFXEncoderConfig {
  if (!input || typeof input !== "object") throw new TypeError("Video encoder configuration is required.");
  if (typeof input.codec !== "string" || input.codec.trim().length === 0 || input.codec.length > 256)
    throw new TypeError("Video encoder codec must be a nonempty bounded string.");
  const hardwareAcceleration = input.hardwareAcceleration ?? "no-preference";
  const latencyMode = input.latencyMode ?? "quality";
  const alpha = input.alpha ?? "discard";
  if (!HARDWARE.has(hardwareAcceleration)) throw new TypeError("Video encoder hardware acceleration preference is invalid.");
  if (!LATENCY.has(latencyMode)) throw new TypeError("Video encoder latency mode is invalid.");
  if (!ALPHA.has(alpha)) throw new TypeError("Video encoder alpha mode is invalid.");
  if (input.scalabilityMode != null && (typeof input.scalabilityMode !== "string" || input.scalabilityMode.length < 1 || input.scalabilityMode.length > 64))
    throw new TypeError("Video encoder scalability mode must be a bounded nonempty string.");
  return Object.freeze({
    codec: input.codec.trim(),
    codedWidth: integer(input.codedWidth, "Video encoder width", 1, 16_384),
    codedHeight: integer(input.codedHeight, "Video encoder height", 1, 16_384),
    bitrate: integer(input.bitrate, "Video encoder bitrate", 1, 2_147_483_647),
    framerate: finite(input.framerate, "Video encoder framerate", 0.001, 1000),
    hardwareAcceleration,
    latencyMode,
    alpha,
    scalabilityMode: input.scalabilityMode ?? null,
  });
}

export class VFXEncoderCapabilities {
  static async queryEncoder(input: VFXEncoderConfigInput, probe: VFXEncoderCapabilityProbe): Promise<VFXEncoderCapability> {
    if (!probe || typeof probe.queryEncoder !== "function") throw new TypeError("Video encoder capability query requires a probe.");
    const config = normalizeVFXEncoderConfig(input);
    const result = await probe.queryEncoder(config);
    if (!result || typeof result !== "object" || typeof result.supported !== "boolean")
      throw new TypeError("Video encoder capability probe returned an invalid result.");
    const merged = { ...config, ...(result.config ?? {}) };
    const normalized = normalizeVFXEncoderConfig({
      ...merged,
      scalabilityMode: merged.scalabilityMode ?? undefined,
    });
    if (result.supported) return Object.freeze({ supported: true as const, config: normalized });
    return Object.freeze({
      supported: false as const,
      config: normalized,
      reason: typeof result.reason === "string" && result.reason.trim() ? result.reason.trim() : "unsupported-configuration",
    });
  }
}

interface PendingOutput {
  readonly id: number;
  readonly generation: number;
  readonly promise: Promise<void>;
}

export class VFXEncoder {
  readonly #backend: VFXEncoderBackend;
  readonly #output: VFXEncoderOptions["output"];
  readonly #error: (error: unknown) => void;
  readonly #maximumPendingOutputs: number;
  readonly #maximumEncodeQueueSize: number;
  #state: VFXEncoderState = "unconfigured";
  #generation = 0;
  #generationController = new AbortController();
  #pendingOutputs = new Map<number, PendingOutput>();
  #nextOutputId = 1;
  #config: VFXEncoderConfig | null = null;

  constructor(options: VFXEncoderOptions) {
    if (!options || typeof options !== "object" || !options.backend || typeof options.output !== "function")
      throw new TypeError("Video encoder requires a backend and output callback.");
    this.#backend = options.backend;
    this.#output = options.output;
    this.#error = options.error ?? (() => undefined);
    this.#maximumPendingOutputs = positiveLimit(options.maximumPendingOutputs, 8, "Video encoder pending-output limit");
    this.#maximumEncodeQueueSize = positiveLimit(options.maximumEncodeQueueSize, 32, "Video encoder queue limit");
  }

  get state(): VFXEncoderState { return this.#state; }
  get generation(): number { return this.#generation; }
  get pendingOutputCount(): number { return this.#pendingOutputs.size; }
  get config(): VFXEncoderConfig | null { return this.#config; }

  async configure(input: VFXEncoderConfigInput): Promise<void> {
    this.#assertNotDisposed();
    if (this.#state !== "unconfigured" && this.#state !== "configured")
      throw new DOMException("Video encoder cannot configure in its current state.", "InvalidStateError");
    const config = normalizeVFXEncoderConfig(input);
    if (this.#state === "configured") await this.#drainForReconfiguration();
    const prior = this.#generationController;
    prior.abort(new DOMException("Video encoder configuration changed.", "AbortError"));
    this.#generation += 1;
    this.#generationController = new AbortController();
    try {
      if (this.#config) this.#backend.reset();
      const generation = this.#generation;
      this.#backend.configure(config, {
        output: (chunk, metadata) => this.#receiveOutput(chunk, metadata, generation),
        error: error => this.#receiveError(error, generation),
      });
      this.#config = config;
      this.#state = "configured";
    } catch (error) {
      this.#fail(error);
      throw error;
    }
  }

  encode(frame: VFXFrame, options: VFXEncoderFrameOptions = {}): void {
    this.#assertConfigured();
    if (!(frame instanceof VFXFrame) || frame.closed) throw new TypeError("Video encoder input must be a live VFXFrame.");
    if (options.keyFrame !== undefined && typeof options.keyFrame !== "boolean") throw new TypeError("Video keyFrame option must be boolean.");
    const config = this.#config!;
    if (frame.format.codedWidth !== config.codedWidth || frame.format.codedHeight !== config.codedHeight)
      throw new DOMException("Video frame dimensions do not match the configured encoder.", "DataError");
    const queueSize = Number(this.#backend.encodeQueueSize);
    if (!Number.isFinite(queueSize) || queueSize < 0) throw new TypeError("Video encoder backend reported an invalid queue size.");
    if (queueSize >= this.#maximumEncodeQueueSize) throw new DOMException("Video encoder input queue limit exceeded.", "QuotaExceededError");
    const owned = frame.clone();
    try {
      this.#backend.encode(owned, Object.freeze({ keyFrame: options.keyFrame === true }));
    } catch (error) {
      this.#fail(error);
      throw error;
    } finally {
      owned.close();
    }
  }

  async flush(): Promise<void> {
    this.#assertConfigured();
    const generation = this.#generation;
    const signal = this.#generationController.signal;
    this.#state = "draining";
    try {
      await abortable(Promise.resolve(this.#backend.flush()), signal);
      await this.#awaitPending(generation, signal);
      if (this.#generation === generation && this.#state === "draining") this.#state = "configured";
    } catch (error) {
      if (signal.aborted || this.#generation !== generation) throw abortReason(signal);
      this.#fail(error);
      throw error;
    }
  }

  reset(): void {
    this.#assertNotDisposed();
    this.#generation += 1;
    this.#generationController.abort(new DOMException("Video encoder was reset.", "AbortError"));
    this.#pendingOutputs.clear();
    try { this.#backend.reset(); } catch { /* reset cannot restore an old generation */ }
    this.#generationController = new AbortController();
    this.#config = null;
    this.#state = "unconfigured";
  }

  dispose(): void {
    if (this.#state === "disposed") return;
    this.#generation += 1;
    this.#generationController.abort(new DOMException("Video encoder was disposed.", "AbortError"));
    this.#pendingOutputs.clear();
    this.#config = null;
    try { this.#backend.dispose(); } finally { this.#state = "disposed"; }
  }

  async #drainForReconfiguration(): Promise<void> {
    const generation = this.#generation;
    const signal = this.#generationController.signal;
    this.#state = "configuring";
    try {
      await abortable(Promise.resolve(this.#backend.flush()), signal);
      await this.#awaitPending(generation, signal);
    } catch (error) {
      if (signal.aborted || this.#generation !== generation) throw abortReason(signal);
      this.#fail(error);
      throw error;
    }
  }

  async #awaitPending(generation: number, signal: AbortSignal): Promise<void> {
    const acknowledgements = [...this.#pendingOutputs.values()].filter(entry => entry.generation === generation).map(entry => entry.promise);
    if (acknowledgements.length > 0) await abortable(Promise.all(acknowledgements).then(() => undefined), signal);
  }

  #receiveOutput(chunk: VFXEncodedChunk, metadata: VFXEncoderOutputMetadata, generation: number): void {
    if (!(chunk instanceof VFXEncodedChunk)) { this.#receiveError(new TypeError("Video encoder backend emitted an invalid chunk."), generation); return; }
    if (generation !== this.#generation || (this.#state !== "configured" && this.#state !== "draining" && this.#state !== "configuring")) return;
    if (this.#pendingOutputs.size >= this.#maximumPendingOutputs) {
      this.#fail(new DOMException("Video encoder pending-output limit exceeded.", "QuotaExceededError"));
      return;
    }
    let acknowledgement: void | Promise<void>;
    try { acknowledgement = this.#output(chunk, Object.freeze({ ...metadata })); }
    catch (error) { this.#fail(error); return; }
    if (!promiseLike(acknowledgement)) return;
    const id = this.#nextOutputId++;
    const promise = Promise.resolve(acknowledgement).then(
      () => { this.#pendingOutputs.delete(id); },
      error => {
        if (!this.#pendingOutputs.delete(id)) return;
        this.#fail(error);
        throw error;
      },
    );
    this.#pendingOutputs.set(id, { id, generation, promise });
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
    this.#pendingOutputs.clear();
    try { this.#error(normalized); } catch { /* observers cannot destabilize cleanup */ }
  }

  #assertConfigured(): void {
    this.#assertNotDisposed();
    if (this.#state !== "configured") throw new DOMException("Video encoder is not configured for input.", "InvalidStateError");
  }

  #assertNotDisposed(): void {
    if (this.#state === "disposed") throw new DOMException("Video encoder is disposed.", "InvalidStateError");
  }
}
