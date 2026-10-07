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

import { MEFXTime } from "../../FX/MediaFX/MEFXTime";
import type { AUFXAudioTimelineCommand, AUFXAudioTimelineReceipt, AUFXAudioTimelineTransport } from "../../FX/AudioFX/AUFXAudioTimelineTransport";
import { MEFXTimebase } from "../../FX/MediaFX/MEFXTimebase";
import type { VFXFrame } from "../../FX/VideoFX/VFXFrame";
import type { VFXPresentationContext, VFXPresentationTickResult } from "../../FX/VideoFX/VFXPresentation";
import type { AudioMediaClockBridge } from "../AudioFX/AudioMediaClockBridge";

export type AVPresentationEnqueueResult = "queued" | "queue-full";
export type AVPresentationAction = "idle" | "wait" | "present" | "drop" | "end-of-stream";

export interface AVPresentationTickResult {
  readonly action: AVPresentationAction;
  readonly reason?: VFXPresentationTickResult["reason"];
  readonly skewSeconds?: number;
}

export interface AVPresentationCommonOptions {
  readonly timebase: MEFXTimebase;
  readonly toleranceSeconds?: number;
  readonly maximumQueuedFrames?: number;
  readonly present: (frame: VFXFrame, context: VFXPresentationContext) => void | Promise<void>;
}

export type AVPresentationCoordinatorOptions = AVPresentationCommonOptions & (
  | { readonly mode?: "audio"; readonly audioBridge: AudioMediaClockBridge; readonly audioTransport?: AUFXAudioTimelineTransport }
  | { readonly mode: "media"; readonly audioBridge?: never; readonly audioTransport?: never }
);

export interface AVPresentationDiagnostics {
  readonly generation: number;
  readonly queuedFrames: number;
  readonly inFlightFrames: number;
  readonly audioTransportPending: boolean;
  readonly droppedFrames: number;
  readonly maximumAbsoluteSkewSeconds: number;
}

export class AVPresentationCoordinator {
  readonly #timebase: MEFXTimebase;
  readonly #audioBridge: AudioMediaClockBridge | null;
  readonly #audioTransport?: AUFXAudioTimelineTransport;
  #transportPending = false;
  #transportFailure: unknown = null;
  #aligningTransport = false;
  readonly #toleranceSeconds: number;
  readonly #maximumQueuedFrames: number;
  readonly #present: AVPresentationCoordinatorOptions["present"];
  readonly #queue: VFXFrame[] = [];
  readonly #unsubscribe: () => void;
  #audioCorrelationGeneration: number | null = null;
  #inFlight: AbortController | null = null;
  #generation = 0;
  #droppedFrames = 0;
  #maximumAbsoluteSkewSeconds = 0;
  #ended = false;
  #disposed = false;
  #loop: Readonly<{ start: MEFXTime; end: MEFXTime }> | null = null;
  #playRateNumerator = 1n;
  #playRateDenominator = 1n;

  constructor(options: AVPresentationCoordinatorOptions) {
    if (!options || typeof options !== "object") throw new TypeError("A/V presentation coordinator options are required.");
    const tolerance = options.toleranceSeconds ?? 0.02;
    const maximumQueuedFrames = options.maximumQueuedFrames ?? 6;
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("A/V presentation tolerance must be nonnegative and finite.");
    if (!Number.isSafeInteger(maximumQueuedFrames) || maximumQueuedFrames < 1) throw new RangeError("A/V presentation queue bound must be a positive safe integer.");
    if (typeof options.present !== "function") throw new TypeError("A/V presentation callback is required.");
    if (options.mode !== "media" && !options.audioBridge)
      throw new TypeError("A/V presentation requires an audio clock bridge.");
    if (options.audioTransport && options.timebase.source instanceof MEFXTimebase)
      throw new DOMException("Owned audio transport requires a timebase directly sourced by a clock; inherited playback rates are unavailable.", "NotSupportedError");
    this.#timebase = options.timebase;
    this.#audioBridge = options.mode === "media" ? null : options.audioBridge;
    this.#audioTransport = options.audioTransport;
    this.#audioTransport?.signal.throwIfAborted();
    this.#toleranceSeconds = tolerance;
    this.#maximumQueuedFrames = maximumQueuedFrames;
    this.#present = options.present;
    const rate = this.#timebase.snapshot();
    if (rate.rateNumerator !== 0n) {
      this.#playRateNumerator = rate.rateNumerator;
      this.#playRateDenominator = rate.rateDenominator;
    }
    this.#unsubscribe = this.#timebase.subscribeDiscontinuities(() => this.#invalidate());
    this.#audioTransport?.signal.addEventListener("abort", this.#transportRevoked, { once: true });
  }

  get diagnostics(): AVPresentationDiagnostics {
    return Object.freeze({
      generation: this.#generation,
      queuedFrames: this.#queue.length,
      inFlightFrames: this.#inFlight ? 1 : 0,
      audioTransportPending: this.#transportPending,
      droppedFrames: this.#droppedFrames,
      maximumAbsoluteSkewSeconds: this.#maximumAbsoluteSkewSeconds,
    });
  }

  reanchorAudio(): number {
    this.#assertActive();
    if (!this.#audioBridge) throw new DOMException("Media-only presentation has no audio anchor.", "NotSupportedError");
    if (this.#transportPending) throw new DOMException("Wait for the audio transport acknowledgement before reanchoring.", "InvalidStateError");
    this.#invalidatePlayback();
    const correlation = this.#audioBridge.reanchor();
    this.#audioCorrelationGeneration = correlation.generation;
    return correlation.generation;
  }

  enqueue(frame: VFXFrame): AVPresentationEnqueueResult {
    this.#assertActive();
    if (this.#queue.length >= this.#maximumQueuedFrames) return "queue-full";
    this.#queue.push(frame.clone());
    this.#ended = false;
    return "queued";
  }

  pause(): Promise<void> {
    this.#assertActive();
    return this.#transition({ kind: "pause" }, () => { this.#timebase.pause(); this.#invalidatePlayback(); });
  }

  play(): Promise<void> {
    this.#assertActive();
    return this.#transition({ kind: "play", rate: Number(this.#playRateNumerator) / Number(this.#playRateDenominator) }, () => {
      this.#timebase.setRate(this.#playRateNumerator, this.#playRateDenominator); this.#invalidatePlayback();
    });
  }

  setRate(numerator: bigint, denominator: bigint = 1n): Promise<void> {
    this.#assertActive();
    if (typeof numerator !== "bigint" || typeof denominator !== "bigint" || denominator === 0n) throw new RangeError("Playback rate requires rational bigint components with a nonzero denominator.");
    if (numerator === 0n) {
      return this.pause();
    }
    return this.#transition({ kind: "rate", rate: Number(numerator) / Number(denominator) }, () => {
      this.#timebase.setRate(numerator, denominator);
      const snapshot = this.#timebase.snapshot();
      this.#playRateNumerator = snapshot.rateNumerator; this.#playRateDenominator = snapshot.rateDenominator;
      this.#invalidatePlayback();
    });
  }

  setLoop(loop: Readonly<{ start: MEFXTime; end: MEFXTime }> | null): void {
    this.#assertActive();
    if (loop === null) {
      this.#loop = null;
      return;
    }
    if (loop.start.value.kind !== "finite" || loop.end.value.kind !== "finite" || loop.start.value.epoch !== loop.end.value.epoch || loop.start.compare(loop.end) !== -1)
      throw new RangeError("A/V presentation loop requires finite ordered endpoints in one epoch.");
    this.#loop = Object.freeze({ start: loop.start, end: loop.end });
  }

  seek(position: MEFXTime): Promise<void> {
    this.#assertActive();
    let target = position;
    const loop = this.#loop;
    if (loop) {
      const comparison = position.compare(loop.end);
      if (comparison === 0 || comparison === 1) target = loop.start;
    }
    if (!(target instanceof MEFXTime) || target.value.kind !== "finite") throw new TypeError("Seek requires a finite MediaFX position.");
    if (this.#audioTransport && target.value.epoch !== 0n) throw new DOMException("Audio content positions use epoch zero.", "NotSupportedError");
    return this.#transition({ kind: "seek", positionSeconds: target.toSeconds() }, () => this.#timebase.seek(target));
  }

  async tick(): Promise<AVPresentationTickResult> {
    this.#assertActive();
    if (this.#transportFailure) throw this.#transportFailure;
    if (this.#transportPending) return Object.freeze({ action: "wait", reason: "audio-transport-pending" });
    // Keep the slot occupied through cancellation until the callback settles:
    // its borrowed frame may still be in use by an asynchronous renderer.
    if (this.#inFlight) return Object.freeze({ action: "wait", reason: "renderer-busy" });
    const frame = this.#queue[0];
    const emptyResult = Object.freeze({ action: this.#ended ? "end-of-stream" as const : "idle" as const });
    if (this.#timebase.snapshot().rateNumerator === 0n)
      return frame ? Object.freeze({ action: "wait", reason: "paused" }) : emptyResult;
    if (!frame && !this.#loop) return emptyResult;
    const correlationGeneration = this.#audioCorrelationGeneration;
    if (this.#audioBridge && correlationGeneration === null)
      return frame ? Object.freeze({ action: "wait", reason: "audio-unanchored" }) : emptyResult;

    let mediaNowSeconds: number;
    try {
      const mediaNow = this.#audioBridge
        ? this.#audioBridge.currentMediaTime(correlationGeneration!)
        : this.#timebase.now().position;
      const loop = this.#loop;
      const loopComparison = loop ? mediaNow.compare(loop.end) : -1;
      if (loop && (loopComparison === 0 || loopComparison === 1)) {
        void this.seek(loop.start);
        return Object.freeze({ action: "wait", reason: "loop-boundary" });
      }
      mediaNowSeconds = mediaNow.toSeconds();
    } catch (error) {
      if (error instanceof DOMException && (error.name === "InvalidStateError" || error.name === "NotSupportedError")) {
        if (this.#audioBridge) {
          this.#audioCorrelationGeneration = null;
          return Object.freeze({ action: "wait", reason: "audio-discontinuity" });
        }
        throw error;
      }
      throw error;
    }
    if (!frame) return emptyResult;
    const skewSeconds = frame.timing.presentationTime.toSeconds() - mediaNowSeconds;
    this.#maximumAbsoluteSkewSeconds = Math.max(this.#maximumAbsoluteSkewSeconds, Math.abs(skewSeconds));
    const correlation = this.#audioBridge?.correlation;
    const uncertaintySeconds = correlation?.generation === correlationGeneration ? correlation.uncertaintySeconds : 0;
    const effectiveToleranceSeconds = this.#toleranceSeconds + uncertaintySeconds;
    if (skewSeconds > effectiveToleranceSeconds) return Object.freeze({ action: "wait", reason: "frame-early", skewSeconds });

    this.#queue.shift();
    if (skewSeconds < -effectiveToleranceSeconds) {
      this.#droppedFrames += 1;
      frame.close();
      return Object.freeze({ action: "drop", skewSeconds });
    }
    const controller = new AbortController();
    const generation = this.#generation;
    this.#inFlight = controller;
    const invalidated = (): AVPresentationTickResult => {
      this.#droppedFrames += 1;
      return Object.freeze({ action: "drop", reason: "presentation-invalidated", skewSeconds });
    };
    try {
      await this.#present(frame, Object.freeze({ generation, signal: controller.signal }));
      if (controller.signal.aborted || this.#generation !== generation || this.#disposed) return invalidated();
      // The renderer may have yielded across an output-device discontinuity.
      // Do not acknowledge obsolete work as a successful presentation.
      try {
        if (this.#audioBridge) this.#audioBridge.currentMediaTime(correlationGeneration!);
      } catch (error) {
        if (error instanceof DOMException && (error.name === "InvalidStateError" || error.name === "NotSupportedError" || error.name === "AbortError")) {
          this.#invalidatePlayback();
          return invalidated();
        }
        throw error;
      }
      if (controller.signal.aborted || this.#generation !== generation || this.#disposed) return invalidated();
      return Object.freeze({ action: "present", skewSeconds });
    } catch (error) {
      if (controller.signal.aborted) return invalidated();
      throw error;
    } finally {
      frame.close();
      this.#inFlight = null;
    }
  }

  end(): void {
    this.#assertActive();
    this.#ended = true;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribe();
    this.#audioCorrelationGeneration = null;
    for (const frame of this.#queue.splice(0)) frame.close();
    this.#inFlight?.abort();
    this.#audioTransport?.signal.removeEventListener("abort", this.#transportRevoked);
    this.#audioTransport?.dispose();
  }

  #invalidate(): void {
    if (this.#disposed) return;
    if (this.#aligningTransport) { this.#invalidatePlayback(); return; }
    this.#generation += 1;
    this.#audioCorrelationGeneration = null;
    this.#ended = false;
    for (const frame of this.#queue.splice(0)) frame.close();
    this.#inFlight?.abort();
  }

  #invalidatePlayback(): void {
    this.#generation += 1;
    this.#audioCorrelationGeneration = null;
    this.#audioBridge?.invalidate();
    this.#inFlight?.abort();
  }

  readonly #transportRevoked = () => this.dispose();

  #transition(command: AUFXAudioTimelineCommand, change: () => void): Promise<void> {
    if (this.#transportPending) throw new DOMException("Await the pending audio transport transition.", "InvalidStateError");
    // Unsupported/foreign transport operations fail before the media mapping changes.
    const receipt = this.#audioTransport?.apply(command);
    this.#transportFailure = null;
    change();
    if (!receipt) return Promise.resolve();
    if (!(receipt instanceof Promise)) { this.#alignTransport(receipt); return Promise.resolve(); }
    this.#transportPending = true;
    const mapping = this.#timebase.snapshot();
    const settled = receipt.then(applied => {
      this.#assertActive();
      const current = this.#timebase.snapshot();
      if (mapping.sourceAnchor !== current.sourceAnchor || mapping.mediaAnchor !== current.mediaAnchor ||
          mapping.rateNumerator !== current.rateNumerator || mapping.rateDenominator !== current.rateDenominator || mapping.generation !== current.generation) {
        this.dispose();
        throw new DOMException("Media mapping changed while audio transport was pending.", "AbortError");
      }
      if (!applied.audioAnchor) throw new DOMException("Live transport omitted its applied output anchor.", "InvalidStateError");
      this.#alignTransport(applied);
    }).catch(error => { this.#transportFailure = error; throw error; }).finally(() => { this.#transportPending = false; });
    void settled.catch(() => {});
    return settled;
  }

  #alignTransport(applied: AUFXAudioTimelineReceipt): void {
    const position = MEFXTime.fromSeconds(applied.positionSeconds, 1_000_000_000, "nearest-even");
    this.#aligningTransport = true;
    try { this.#timebase.seek(position); } finally { this.#aligningTransport = false; }
    if (applied.audioAnchor) {
      const correlation = this.#audioBridge!.reanchor({ audioAnchor: applied.audioAnchor, position });
      this.#audioCorrelationGeneration = correlation.generation;
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new DOMException("A/V presentation coordinator is disposed.", "AbortError");
  }
}
