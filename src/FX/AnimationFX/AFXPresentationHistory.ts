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

export interface AFXPresentationHistoryOptions {
  readonly window: number;
  readonly maximumSamples?: number;
}

export interface AFXPresentationHistorySample<T> {
  readonly time: number;
  readonly value: T;
}

const finitePositive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${label} must be finite and positive.`);
  return value;
};

/**
 * @internal Replicator sampling storage for browser layer projections.
 * A layer records its recent presentation so a parent replicator can render
 * each copy at its own instanceDelay. This is not a consumer-facing CA API.
 */
export class AFXPresentationHistory<T> {
  readonly #window: number;
  readonly #maximumSamples: number;
  #samples: AFXPresentationHistorySample<T>[] = [];

  constructor(options: AFXPresentationHistoryOptions) {
    if (!options) throw new TypeError("Presentation history options are required.");
    this.#window = finitePositive(options.window, "Presentation history window");
    const maximumSamples = options.maximumSamples ?? 512;
    if (!Number.isSafeInteger(maximumSamples) || maximumSamples < 1 || maximumSamples > 8192)
      throw new RangeError("Presentation history maximumSamples must be from 1 to 8192.");
    this.#maximumSamples = maximumSamples;
  }

  clear() {
    this.#samples = [];
  }

  record(time: number, value: T) {
    if (!Number.isFinite(time))
      throw new RangeError("Presentation history time must be finite.");
    const previous = this.#samples.at(-1);
    if (previous && time < previous.time)
      throw new RangeError("Presentation history time must be monotonic.");

    const sample = Object.freeze({ time, value });
    if (previous?.time === time) this.#samples[this.#samples.length - 1] = sample;
    else this.#samples.push(sample);

    const minimumTime = time - this.#window;
    let first = 0;
    while (first < this.#samples.length - 1 && this.#samples[first]!.time < minimumTime)
      first += 1;
    if (first) this.#samples.splice(0, first);
    if (this.#samples.length > this.#maximumSamples)
      this.#samples.splice(0, this.#samples.length - this.#maximumSamples);
  }

  /** Latest sample at or before time, clamped to the oldest retained sample. */
  at(time: number): T | null {
    if (!Number.isFinite(time))
      throw new RangeError("Presentation history lookup time must be finite.");
    if (!this.#samples.length) return null;
    let low = 0;
    let high = this.#samples.length - 1;
    if (time <= this.#samples[0]!.time) return this.#samples[0]!.value;
    if (time >= this.#samples[high]!.time) return this.#samples[high]!.value;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const sample = this.#samples[middle]!;
      if (sample.time === time) return sample.value;
      if (sample.time < time) low = middle + 1;
      else high = middle - 1;
    }
    return this.#samples[Math.max(0, high)]!.value;
  }
}
