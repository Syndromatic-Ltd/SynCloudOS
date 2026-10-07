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

import { MEFXTime, type MEFXRounding } from "../MediaFX/MEFXTime";
import { AUFXAudioTime } from "./AUFXAudioTime";

const MAX_MEDIA_TIMESCALE = 2_147_483_647;

export interface AUFXRationalSampleRate {
  readonly numerator: number;
  readonly denominator: number;
}

export interface AUFXMediaTimeOptions {
  readonly exactSampleRate?: AUFXRationalSampleRate;
}

export interface AUFXFromMediaTimeOptions extends AUFXMediaTimeOptions {
  readonly rounding?: MEFXRounding | "exact";
}

function sampleRateRatio(sampleRate: number, exact?: AUFXRationalSampleRate): AUFXRationalSampleRate {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError("Audio sample rate must be positive and finite.");
  if (exact) {
    if (!Number.isSafeInteger(exact.numerator) || exact.numerator < 1 || exact.numerator > MAX_MEDIA_TIMESCALE ||
        !Number.isSafeInteger(exact.denominator) || exact.denominator < 1) {
      throw new RangeError("Exact audio sample rate must use bounded positive integers.");
    }
    if (exact.numerator / exact.denominator !== sampleRate) throw new RangeError("Exact rational sample rate does not match the AudioFX sample rate.");
    return exact;
  }
  if (!Number.isSafeInteger(sampleRate) || sampleRate > MAX_MEDIA_TIMESCALE) {
    throw new RangeError("Fractional AudioFX sample rates require an explicit exact rational sample rate.");
  }
  return Object.freeze({ numerator: sampleRate, denominator: 1 });
}

function divide(numerator: bigint, denominator: bigint, rounding: MEFXRounding | "exact"): bigint {
  if (denominator <= 0n) throw new RangeError("Audio/media conversion denominator must be positive.");
  const quotient = numerator / denominator, remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  if (rounding === "exact") throw new RangeError("Media time does not map to an exact integral audio sample frame.");
  if (rounding === "toward-zero") return quotient;
  if (rounding === "floor") return numerator < 0n ? quotient - 1n : quotient;
  if (rounding === "ceil") return numerator > 0n ? quotient + 1n : quotient;
  if (rounding !== "nearest-even") throw new TypeError("Unsupported AudioFX media-time rounding mode.");
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = remainder < 0n ? -remainder : remainder;
  const doubled = magnitude * 2n;
  if (doubled < denominator) return quotient;
  if (doubled > denominator) return quotient + sign;
  return quotient % 2n === 0n ? quotient : quotient + sign;
}

/** Convert an integer AudioFX sample position into an exact MediaFX rational time. */
export function toMediaTime(audioTime: AUFXAudioTime, options: AUFXMediaTimeOptions = {}): MEFXTime {
  if (!(audioTime instanceof AUFXAudioTime)) throw new TypeError("AudioFX media conversion requires AUFXAudioTime.");
  const rate = sampleRateRatio(audioTime.sampleRate, options.exactSampleRate);
  return MEFXTime.finite(BigInt(audioTime.sampleTime) * BigInt(rate.denominator), rate.numerator);
}

/** Convert finite epoch-zero MediaFX time to AudioFX sample frames without hidden rounding. */
export function fromMediaTime(mediaTime: MEFXTime, sampleRate: number, options: AUFXFromMediaTimeOptions = {}): AUFXAudioTime {
  if (!(mediaTime instanceof MEFXTime) || mediaTime.value.kind !== "finite") throw new TypeError("AudioFX conversion requires finite MEFXTime.");
  if (mediaTime.value.epoch !== 0n) throw new RangeError("AudioFX sample time cannot represent a nonzero MediaFX epoch.");
  const rate = sampleRateRatio(sampleRate, options.exactSampleRate);
  const numerator = mediaTime.value.value * BigInt(rate.numerator);
  const denominator = BigInt(mediaTime.value.timescale) * BigInt(rate.denominator);
  const frames = divide(numerator, denominator, options.rounding ?? "exact");
  if (frames < 0n || frames > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Media time exceeds the AudioFX sample-frame range.");
  return new AUFXAudioTime(Number(frames), sampleRate);
}
