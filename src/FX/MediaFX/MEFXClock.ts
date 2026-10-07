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

import { MEFXTime } from "./MEFXTime";

export interface MEFXClockReading {
  readonly position: MEFXTime;
  readonly domain: string;
  readonly generation: number;
  readonly uncertaintySeconds: number;
}

export interface MEFXClock {
  now(): MEFXClockReading;
  subscribeDiscontinuities(listener: (reading: MEFXClockReading) => void): () => void;
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

/** Host-private clock implementation used by the runtime media service. The
 * public MediaFX entry exports only the read-only MEFXClock contract. */
export class MEFXMonotonicClock implements MEFXClock {
  readonly #listeners = new Set<(reading: MEFXClockReading) => void>();
  readonly #nowSeconds: () => number;
  #generation = 0;
  #disposed = false;

  constructor(
    readonly domain: string,
    readonly uncertaintySeconds: number,
    nowSeconds: () => number,
  ) {
    if (!domain.trim()) throw new TypeError("Media clock domain must be non-empty.");
    if (!Number.isFinite(uncertaintySeconds) || uncertaintySeconds < 0) {
      throw new RangeError("Media clock uncertainty must be a nonnegative finite number.");
    }
    this.#nowSeconds = nowSeconds;
  }

  now(): MEFXClockReading {
    if (this.#disposed) throw abortError("The media clock is disposed.");
    const seconds = this.#nowSeconds();
    if (!Number.isFinite(seconds)) throw new RangeError("The host monotonic media clock returned a nonfinite value.");
    return Object.freeze({
      position: MEFXTime.fromSeconds(seconds, 1_000_000, "nearest-even"),
      domain: this.domain,
      generation: this.#generation,
      uncertaintySeconds: this.uncertaintySeconds,
    });
  }

  subscribeDiscontinuities(listener: (reading: MEFXClockReading) => void): () => void {
    if (this.#disposed) throw abortError("The media clock is disposed.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  invalidate(): void {
    if (this.#disposed) return;
    this.#generation += 1;
    const reading = this.now();
    for (const listener of [...this.#listeners]) listener(reading);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
  }
}
