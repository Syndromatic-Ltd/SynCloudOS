/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXTimeInterval } from "./DFXTimeInterval";
import { checkedInteger, maximumNanoseconds, nanoseconds, safeDistance } from "./internal/time";

const modulus = 1n << 64n;
const futureRawValue = modulus - 1n;
// libdispatch reserves the high two bits for the clock tag (wall time is 11).
const maximumClockValue = (1n << 62n) - 1n;

/** DispatchWallTime. Apple's unsigned negative-epoch raw encoding uses bigint on the web.
 * Date samples have millisecond resolution; subsequent nanosecond arithmetic is exact.
 * The timespec initializer is intentionally omitted.
 */
export class DFXWallTime {
  static readonly distantFuture = new DFXWallTime(null);
  readonly rawValue: bigint;
  readonly #epochNanoseconds: bigint | null;
  private constructor(epochNanoseconds: bigint | null) {
    this.#epochNanoseconds = epochNanoseconds;
    this.rawValue = epochNanoseconds === null ? futureRawValue : modulus - epochNanoseconds;
    Object.freeze(this);
  }
  static now(): DFXWallTime {
    // Convert before multiplying: epoch nanoseconds exceed Number.MAX_SAFE_INTEGER.
    const value = BigInt(checkedInteger(Date.now(), "wall-clock milliseconds")) * 1_000_000n;
    if (value >= maximumClockValue) return DFXWallTime.distantFuture;
    return new DFXWallTime(value < 2n ? 2n : value);
  }
  advanced(by: DFXTimeInterval): DFXWallTime {
    const delta = nanoseconds(by);
    if (this.#epochNanoseconds === null || delta === Infinity) return DFXWallTime.distantFuture;
    const value = this.#epochNanoseconds + BigInt(delta);
    if (value >= maximumClockValue) return DFXWallTime.distantFuture;
    return new DFXWallTime(value < 2n ? 2n : value);
  }
  distance(to: DFXWallTime): DFXTimeInterval {
    if (this.#epochNanoseconds === to.#epochNanoseconds) return DFXTimeInterval.nanoseconds(0);
    if (to.#epochNanoseconds === null) return DFXTimeInterval.never;
    if (this.#epochNanoseconds === null) return DFXTimeInterval.nanoseconds(-maximumNanoseconds);
    return DFXTimeInterval.nanoseconds(safeDistance(to.#epochNanoseconds - this.#epochNanoseconds));
  }
}
Object.freeze(DFXWallTime);
