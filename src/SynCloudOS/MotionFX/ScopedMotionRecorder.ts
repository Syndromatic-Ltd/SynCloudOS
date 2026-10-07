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

import type {
  MFXDeviceMotion,
  MFXMotionSubscription,
} from "../../FX/MotionFX/MFXDeviceMotion";
/** Active-page history only. No background or pre-session samples are implied. */
export class ScopedMotionRecorder implements MFXMotionSubscription {
  #history: MFXDeviceMotion[] = [];
  #released = false;
  #release: (() => void) | null = null;
  constructor(
    readonly maximumSamples = 120,
    readonly maximumAge = 10,
  ) {
    if (
      !Number.isInteger(maximumSamples) ||
      maximumSamples < 1 ||
      maximumSamples > 10000 ||
      !Number.isFinite(maximumAge) ||
      maximumAge <= 0 ||
      maximumAge > 3600
    )
      throw new RangeError("Invalid bounded motion history.");
  }
  get samples(): readonly MFXDeviceMotion[] {
    return Object.freeze(this.#history.slice());
  }
  /** @internal */ attach(subscription: MFXMotionSubscription): void {
    if (this.#released) subscription.dispose();
    else this.#release = () => subscription.dispose();
  }
  /** @internal */ record(sample: MFXDeviceMotion): void {
    if (this.#released) return;
    this.#history.push(sample);
    this.#history = this.#history
      .filter((item) => sample.timestamp - item.timestamp <= this.maximumAge)
      .slice(-this.maximumSamples);
  }
  clear(): void {
    this.#history = [];
  }
  dispose(): void {
    if (this.#released) return;
    this.#released = true;
    this.#release?.();
    this.#release = null;
    this.clear();
  }
}
