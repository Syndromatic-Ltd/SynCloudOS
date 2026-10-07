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

import { AUFXAudioTime } from "../../FX/AudioFX/AUFXAudioTime";
import type { AUFXClockObservation } from "../../FX/AudioFX/AUFXClockObservation";
import { fromMediaTime, toMediaTime, type AUFXRationalSampleRate } from "../../FX/AudioFX/AUFXMediaTime";
import type { MEFXClock, MEFXClockReading } from "../../FX/MediaFX/MEFXClock";
import { MEFXTime } from "../../FX/MediaFX/MEFXTime";
import { MEFXTimebase, type MEFXTimebaseSnapshot } from "../../FX/MediaFX/MEFXTimebase";

export interface AudioMediaClockCorrelation {
  readonly generation: number;
  readonly audioAnchor: AUFXClockObservation;
  readonly mediaAnchor: MEFXClockReading;
  readonly uncertaintySeconds: number;
  readonly rateNumerator: bigint;
  readonly rateDenominator: bigint;
}

export interface AudioMediaClockBridgeOptions {
  readonly sampleRate: number;
  readonly exactSampleRate?: AUFXRationalSampleRate;
  readonly mediaClock: MEFXClock;
  readonly observeAudioClock: () => AUFXClockObservation | null;
}

function invalidState(message: string) { return new DOMException(message, "InvalidStateError"); }

function scaleDuration(time: MEFXTime, numerator: bigint, denominator: bigint): MEFXTime {
  if (time.value.kind !== "finite" || denominator === 0n) throw new RangeError("Audio/media rate mapping must be finite and invertible.");
  let value = time.value.value * numerator, scale = BigInt(time.value.timescale) * denominator;
  if (scale < 0n) { value = -value; scale = -scale; }
  let a = value < 0n ? -value : value, b = scale;
  while (b) [a, b] = [b, a % b];
  value /= a; scale /= a;
  if (scale > 2_147_483_647n) throw new RangeError("Exact audio/media rate mapping exceeds the MediaFX timescale limit.");
  return MEFXTime.finite(value, Number(scale), 0n, time.value.rounded);
}

function mappings(clock: MEFXClock): readonly MEFXTimebaseSnapshot[] {
  const result: MEFXTimebaseSnapshot[] = [];
  for (let source = clock; source instanceof MEFXTimebase; source = source.source) result.push(source.snapshot());
  return result;
}

function compatibleAnchor(position: MEFXTime, sampleStep: MEFXTime): { position: MEFXTime; uncertaintySeconds: number } {
  if (position.value.kind !== "finite" || sampleStep.value.kind !== "finite") throw new RangeError("Audio/media anchors must be finite.");
  const sampleScale = BigInt(sampleStep.value.timescale), anchorScale = BigInt(position.value.timescale);
  let a = sampleScale, b = anchorScale;
  while (b) [a, b] = [b, a % b];
  if (sampleScale / a * anchorScale <= 2_147_483_647n) return { position, uncertaintySeconds: 0 };
  // Clock correlation already carries measurement uncertainty. Quantize only
  // its anchor (never frame PTS) to a scale divisible by an output sample step,
  // so subsequent exact forward/inverse conversions stay representable.
  const scale = Number(sampleScale) * Math.max(1, Math.floor(1_000_000_000 / Number(sampleScale)));
  const converted = position.convertScale(scale, "nearest-even");
  return { position: converted, uncertaintySeconds: converted.compare(position) === 0 ? 0 : 0.5 / scale };
}

/**
 * Correlates the existing AudioFX output clock with a MediaFX clock without
 * taking scheduling authority from either owner. Every correlation is
 * generation-bound; suspension, seek/reset or media-clock invalidation makes
 * old queued mappings unusable until an explicit re-anchor.
 */
export class AudioMediaClockBridge {
  readonly #options: AudioMediaClockBridgeOptions;
  readonly #unsubscribe: () => void;
  #generation = 0;
  #correlation: AudioMediaClockCorrelation | null = null;
  #disposed = false;
  #mappings: readonly MEFXTimebaseSnapshot[] = [];

  constructor(options: AudioMediaClockBridgeOptions) {
    if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) throw new RangeError("Audio/media bridge sample rate must be positive and finite.");
    this.#options = options;
    this.#unsubscribe = options.mediaClock.subscribeDiscontinuities(() => this.invalidate());
  }

  get correlation(): AudioMediaClockCorrelation | null { return this.#correlation; }

  reanchor(applied?: Readonly<{ audioAnchor: AUFXClockObservation; position: MEFXTime }>): AudioMediaClockCorrelation {
    this.#assertActive();
    const audioAnchor = applied?.audioAnchor ?? this.#options.observeAudioClock();
    if (!audioAnchor) throw new DOMException("Audio output clock is unavailable for correlation.", "NotSupportedError");
    if (audioAnchor.sampleRate !== this.#options.sampleRate) throw new RangeError("Audio output observation sample rate does not match the bridge.");
    const reading = this.#options.mediaClock.now();
    let mediaAnchor = applied ? Object.freeze({ ...reading, position: applied.position }) : reading;
    if (mediaAnchor.position.value.kind !== "finite") throw new RangeError("Audio/media correlation requires a finite MediaFX clock reading.");
    this.#mappings = mappings(this.#options.mediaClock);
    const rateNumerator = this.#mappings.reduce((rate, mapping) => rate * mapping.rateNumerator, 1n);
    const rateDenominator = this.#mappings.reduce((rate, mapping) => rate * mapping.rateDenominator, 1n);
    const rate = Math.abs(Number(rateNumerator) / Number(rateDenominator));
    if (!Number.isFinite(rate)) throw new RangeError("Audio/media rate exceeds the observable clock range.");
    const sampleStep = scaleDuration(toMediaTime(new AUFXAudioTime(1, this.#options.sampleRate), { exactSampleRate: this.#options.exactSampleRate }), rateNumerator, rateDenominator);
    const compatible = compatibleAnchor(mediaAnchor.position, sampleStep);
    mediaAnchor = Object.freeze({ ...mediaAnchor, position: compatible.position });
    const correlation = Object.freeze({
      generation: ++this.#generation,
      audioAnchor,
      mediaAnchor,
      rateNumerator, rateDenominator,
      uncertaintySeconds: audioAnchor.uncertaintySeconds * rate + mediaAnchor.uncertaintySeconds + compatible.uncertaintySeconds,
    });
    this.#correlation = correlation;
    return correlation;
  }

  toMediaTime(audioTime: AUFXAudioTime, correlationGeneration: number): MEFXTime {
    if (!(audioTime instanceof AUFXAudioTime) || audioTime.sampleRate !== this.#options.sampleRate) throw new RangeError("Audio time sample rate does not match the bridge.");
    const correlation = this.#current(correlationGeneration);
    const exactSampleRate = this.#options.exactSampleRate;
    const anchor = toMediaTime(new AUFXAudioTime(correlation.audioAnchor.samplePosition, this.#options.sampleRate), { exactSampleRate });
    const target = toMediaTime(audioTime, { exactSampleRate });
    return correlation.mediaAnchor.position.addDuration(scaleDuration(target.subtract(anchor), correlation.rateNumerator, correlation.rateDenominator));
  }

  fromMediaTime(mediaTime: MEFXTime, correlationGeneration: number): AUFXAudioTime {
    const correlation = this.#current(correlationGeneration);
    if (correlation.rateNumerator === 0n) throw invalidState("A paused audio/media mapping cannot schedule an output sample.");
    const delta = mediaTime.subtract(correlation.mediaAnchor.position);
    const exactSampleRate = this.#options.exactSampleRate;
    const anchor = toMediaTime(new AUFXAudioTime(correlation.audioAnchor.samplePosition, this.#options.sampleRate), { exactSampleRate });
    return fromMediaTime(anchor.addDuration(scaleDuration(delta, correlation.rateDenominator, correlation.rateNumerator)), this.#options.sampleRate, { exactSampleRate });
  }

  currentMediaTime(correlationGeneration: number): MEFXTime {
    const correlation = this.#current(correlationGeneration);
    const audioNow = this.#options.observeAudioClock();
    if (!audioNow || audioNow.sampleRate !== this.#options.sampleRate ||
        audioNow.discontinuityGeneration !== correlation.audioAnchor.discontinuityGeneration) {
      this.invalidate();
      throw invalidState("Audio/media clock correlation crossed a discontinuity; re-anchor before scheduling.");
    }
    const exactSampleRate = this.#options.exactSampleRate;
    const anchor = toMediaTime(new AUFXAudioTime(correlation.audioAnchor.samplePosition, this.#options.sampleRate), { exactSampleRate });
    const current = toMediaTime(new AUFXAudioTime(audioNow.samplePosition, this.#options.sampleRate), { exactSampleRate });
    return correlation.mediaAnchor.position.addDuration(scaleDuration(current.subtract(anchor), correlation.rateNumerator, correlation.rateDenominator));
  }

  invalidate(): void {
    if (this.#disposed) return;
    this.#generation++;
    this.#correlation = null;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#correlation = null;
    this.#unsubscribe();
  }

  #assertActive() {
    if (this.#disposed) throw new DOMException("Audio/media clock bridge is disposed.", "AbortError");
  }

  #current(expectedGeneration: number): AudioMediaClockCorrelation {
    this.#assertActive();
    const correlation = this.#correlation;
    if (!correlation || correlation.generation !== expectedGeneration) throw invalidState("Audio/media clock correlation is stale; re-anchor before scheduling.");
    const audioNow = this.#options.observeAudioClock();
    const mediaNow = this.#options.mediaClock.now();
    const currentMappings = mappings(this.#options.mediaClock);
    const mappingChanged = currentMappings.length !== this.#mappings.length || currentMappings.some((mapping, index) => {
      const anchored = this.#mappings[index]!;
      return mapping.sourceAnchor !== anchored.sourceAnchor || mapping.mediaAnchor !== anchored.mediaAnchor ||
        mapping.rateNumerator !== anchored.rateNumerator || mapping.rateDenominator !== anchored.rateDenominator;
    });
    if (!audioNow || audioNow.sampleRate !== this.#options.sampleRate ||
        audioNow.discontinuityGeneration !== correlation.audioAnchor.discontinuityGeneration ||
        mediaNow.generation !== correlation.mediaAnchor.generation || mappingChanged) {
      this.invalidate();
      throw invalidState("Audio/media clock correlation crossed a discontinuity; re-anchor before scheduling.");
    }
    return correlation;
  }
}
