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

import type { MEFXClock, MEFXClockReading } from "./MEFXClock";
import { MEFXTime } from "./MEFXTime";

export interface MEFXTimebaseSnapshot {
  readonly sourceAnchor: MEFXClockReading;
  readonly mediaAnchor: MEFXTime;
  readonly rateNumerator: bigint;
  readonly rateDenominator: bigint;
  readonly generation: number;
}

export interface MEFXTimebaseScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface MEFXTimebaseOptions {
  readonly mediaAnchor?: MEFXTime;
  readonly rateNumerator?: bigint;
  readonly rateDenominator?: bigint;
  readonly scheduler?: MEFXTimebaseScheduler;
}

const maximumTimescale = 2_147_483_647n;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function rate(numerator: bigint, denominator: bigint): readonly [bigint, bigint] {
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint") throw new TypeError("Media timebase rate must use bigint numerator and denominator.");
  if (denominator === 0n) throw new RangeError("Media timebase rate denominator cannot be zero.");
  if (denominator < 0n) return rate(-numerator, -denominator);
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function finite(time: MEFXTime, name: string): Extract<MEFXTime["value"], { kind: "finite" }> {
  if (!(time instanceof MEFXTime) || time.value.kind !== "finite") throw new TypeError(`${name} must be a finite MEFXTime.`);
  return time.value;
}

function scaleDuration(duration: MEFXTime, numerator: bigint, denominator: bigint): MEFXTime {
  const value = finite(duration, "Media timebase duration");
  if (value.epoch !== 0n) throw new RangeError("Media timebase duration epoch must be zero.");
  if (numerator === 0n || value.value === 0n) return MEFXTime.finite(0n, 1, 0n, value.rounded);
  const rawNumerator = value.value * numerator;
  const rawDenominator = BigInt(value.timescale) * denominator;
  const divisor = gcd(rawNumerator, rawDenominator);
  const reducedNumerator = rawNumerator / divisor;
  const reducedDenominator = rawDenominator / divisor;
  if (reducedDenominator <= maximumTimescale) {
    return MEFXTime.finite(reducedNumerator, Number(reducedDenominator), 0n, value.rounded);
  }
  const scale = 1_000_000_000n;
  const scaledNumerator = reducedNumerator * scale;
  const quotient = scaledNumerator / reducedDenominator;
  const remainder = scaledNumerator % reducedDenominator;
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  const sign = scaledNumerator < 0n ? -1n : 1n;
  const doubled = absoluteRemainder * 2n;
  const rounded = doubled < reducedDenominator
    ? quotient
    : doubled > reducedDenominator
      ? quotient + sign
      : quotient % 2n === 0n ? quotient : quotient + sign;
  return MEFXTime.finite(rounded, Number(scale), 0n, true);
}

function checkedReading(reading: MEFXClockReading): MEFXClockReading {
  finite(reading.position, "Media clock reading");
  if (!reading.domain.trim()) throw new TypeError("Media clock reading domain must be non-empty.");
  if (!Number.isSafeInteger(reading.generation) || reading.generation < 0) throw new RangeError("Media clock generation must be a nonnegative safe integer.");
  if (!Number.isFinite(reading.uncertaintySeconds) || reading.uncertaintySeconds < 0) throw new RangeError("Media clock uncertainty must be nonnegative and finite.");
  return reading;
}

export class MEFXTimebase implements MEFXClock {
  static readonly maximumHierarchyDepth = 16;

  readonly #listeners = new Set<(reading: MEFXClockReading) => void>();
  readonly #scheduled = new Set<unknown>();
  readonly #unsubscribeSource: () => void;
  readonly #depth: number;
  #sourceAnchor: MEFXClockReading;
  #mediaAnchor: MEFXTime;
  #rateNumerator: bigint;
  #rateDenominator: bigint;
  #generation = 0;
  #disposed = false;
  #lastMediaPosition: MEFXTime;

  constructor(readonly source: MEFXClock, readonly options: MEFXTimebaseOptions = {}) {
    if (!source || typeof source.now !== "function" || typeof source.subscribeDiscontinuities !== "function") {
      throw new TypeError("Media timebase source must implement MEFXClock.");
    }
    this.#depth = source instanceof MEFXTimebase ? source.#depth + 1 : 1;
    if (this.#depth > MEFXTimebase.maximumHierarchyDepth) throw new RangeError("Media timebase hierarchy depth exceeded.");
    this.#sourceAnchor = checkedReading(source.now());
    this.#mediaAnchor = options.mediaAnchor ?? MEFXTime.finite(0n, 1);
    finite(this.#mediaAnchor, "Media timebase anchor");
    [this.#rateNumerator, this.#rateDenominator] = rate(options.rateNumerator ?? 1n, options.rateDenominator ?? 1n);
    this.#lastMediaPosition = this.#mediaAnchor;
    this.#unsubscribeSource = source.subscribeDiscontinuities((reading) => this.#sourceDiscontinuity(checkedReading(reading)));
  }

  snapshot(): MEFXTimebaseSnapshot {
    this.#assertLive();
    return Object.freeze({
      sourceAnchor: this.#sourceAnchor,
      mediaAnchor: this.#mediaAnchor,
      rateNumerator: this.#rateNumerator,
      rateDenominator: this.#rateDenominator,
      generation: this.#generation,
    });
  }

  now(): MEFXClockReading {
    this.#assertLive();
    const sourceReading = checkedReading(this.source.now());
    if (sourceReading.generation !== this.#sourceAnchor.generation) {
      this.#sourceDiscontinuity(sourceReading);
    }
    const position = this.#map(sourceReading);
    this.#lastMediaPosition = position;
    return this.#reading(position, sourceReading.uncertaintySeconds);
  }

  subscribeDiscontinuities(listener: (reading: MEFXClockReading) => void): () => void {
    this.#assertLive();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setRate(numerator: bigint, denominator: bigint = 1n): void {
    this.#assertLive();
    const sourceReading = checkedReading(this.source.now());
    const current = sourceReading.generation === this.#sourceAnchor.generation
      ? this.#map(sourceReading)
      : this.#lastMediaPosition;
    const nextRate = rate(numerator, denominator);
    this.#sourceAnchor = sourceReading;
    this.#mediaAnchor = current;
    this.#lastMediaPosition = current;
    this.#rateNumerator = nextRate[0];
    this.#rateDenominator = nextRate[1];
    this.#cancelScheduled();
  }

  pause(): void {
    this.setRate(0n, 1n);
  }

  seek(position: MEFXTime): void {
    this.#assertLive();
    finite(position, "Media timebase seek position");
    this.#sourceAnchor = checkedReading(this.source.now());
    this.#mediaAnchor = position;
    this.#lastMediaPosition = position;
    this.#generation += 1;
    this.#cancelScheduled();
    this.#emit(this.#reading(position, this.#sourceAnchor.uncertaintySeconds));
  }

  scheduleAt(position: MEFXTime, callback: () => void, signal?: AbortSignal): () => void {
    this.#assertLive();
    finite(position, "Scheduled MediaFX position");
    signal?.throwIfAborted();
    const scheduler = this.options.scheduler;
    if (!scheduler) throw new DOMException("This media timebase has no scheduler.", "NotSupportedError");
    if (this.#rateNumerator === 0n) throw new DOMException("A paused media timebase cannot schedule a future media position.", "InvalidStateError");
    const current = this.now();
    const deltaSeconds = position.subtract(current.position).toSeconds();
    const rateNumber = Number(this.#rateNumerator) / Number(this.#rateDenominator);
    const delaySeconds = deltaSeconds / rateNumber;
    if (!Number.isFinite(delaySeconds)) throw new RangeError("Media timebase schedule delay exceeds the host timer range.");
    const capturedGeneration = this.#generation;
    let active = true;
    let handle: unknown;
    const cancel = () => {
      if (!active) return;
      active = false;
      this.#scheduled.delete(handle);
      signal?.removeEventListener("abort", cancel);
      scheduler.clearTimeout(handle);
    };
    handle = scheduler.setTimeout(() => {
      if (!active) return;
      active = false;
      this.#scheduled.delete(handle);
      signal?.removeEventListener("abort", cancel);
      if (!this.#disposed && capturedGeneration === this.#generation) callback();
    }, Math.max(0, delaySeconds * 1_000));
    this.#scheduled.add(handle);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    return cancel;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelScheduled();
    this.#unsubscribeSource();
    this.#listeners.clear();
  }

  #map(sourceReading: MEFXClockReading): MEFXTime {
    const elapsed = sourceReading.position.subtract(this.#sourceAnchor.position);
    return this.#mediaAnchor.addDuration(scaleDuration(elapsed, this.#rateNumerator, this.#rateDenominator));
  }

  #sourceDiscontinuity(reading: MEFXClockReading): void {
    if (this.#disposed) return;
    if (reading.generation === this.#sourceAnchor.generation) return;
    this.#sourceAnchor = reading;
    this.#mediaAnchor = this.#lastMediaPosition;
    this.#generation += 1;
    this.#cancelScheduled();
    this.#emit(this.#reading(this.#mediaAnchor, reading.uncertaintySeconds));
  }

  #reading(position: MEFXTime, uncertaintySeconds: number): MEFXClockReading {
    return Object.freeze({
      position,
      domain: `timebase:${this.#sourceAnchor.domain}`,
      generation: this.#generation,
      uncertaintySeconds,
    });
  }

  #emit(reading: MEFXClockReading): void {
    for (const listener of [...this.#listeners]) listener(reading);
  }

  #cancelScheduled(): void {
    const scheduler = this.options.scheduler;
    if (scheduler) for (const handle of [...this.#scheduled]) scheduler.clearTimeout(handle);
    this.#scheduled.clear();
  }

  #assertLive(): void {
    if (this.#disposed) throw new DOMException("The media timebase is disposed.", "AbortError");
  }
}
