/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXTimeInterval } from "./DFXTimeInterval";
import { checkedInteger, clientError, maximumNanoseconds, nanoseconds } from "./internal/time";

/** DispatchTime. Monotonic nanoseconds, exact through the pinned safe-integer sentinel. */
export class DFXTime {
  static readonly distantFuture = new DFXTime(maximumNanoseconds);
  constructor(readonly uptimeNanoseconds: number) {
    checkedInteger(uptimeNanoseconds, "uptimeNanoseconds");
    if (uptimeNanoseconds < 0) clientError("uptimeNanoseconds must not be negative");
    Object.freeze(this);
  }
  static now(): DFXTime {
    return new DFXTime(Math.min(maximumNanoseconds - 1, Math.floor(performance.now() * 1e6)));
  }
  advanced(by: DFXTimeInterval): DFXTime {
    const delta = nanoseconds(by);
    if (this.uptimeNanoseconds === maximumNanoseconds || delta === Infinity) return DFXTime.distantFuture;
    const value = this.uptimeNanoseconds + delta;
    return value >= maximumNanoseconds ? DFXTime.distantFuture : new DFXTime(Math.max(0, value));
  }
  distance(to: DFXTime): DFXTimeInterval {
    return DFXTimeInterval.nanoseconds(to.uptimeNanoseconds - this.uptimeNanoseconds);
  }
}
Object.freeze(DFXTime);
