/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { checkedInteger, initialiseInterval } from "./internal/time";

/** DispatchTimeInterval. Finite unit payloads must fit safe integer nanoseconds. */
export class DFXTimeInterval {
  static readonly never = new DFXTimeInterval(Infinity);
  private constructor(value: number) {
    initialiseInterval(this, value);
    Object.freeze(this);
  }
  static seconds(value: number): DFXTimeInterval {
    return new DFXTimeInterval(checkedInteger(checkedInteger(value, "seconds") * 1e9, "nanoseconds"));
  }
  static milliseconds(value: number): DFXTimeInterval {
    return new DFXTimeInterval(checkedInteger(checkedInteger(value, "milliseconds") * 1e6, "nanoseconds"));
  }
  static microseconds(value: number): DFXTimeInterval {
    return new DFXTimeInterval(checkedInteger(checkedInteger(value, "microseconds") * 1e3, "nanoseconds"));
  }
  static nanoseconds(value: number): DFXTimeInterval {
    return new DFXTimeInterval(checkedInteger(value, "nanoseconds"));
  }
}
Object.freeze(DFXTimeInterval);
