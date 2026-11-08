/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { attributeDispatchClass } from "./internal/lifetime";
import { assertOwner } from "./internal/lifetime";
import { DFXObject } from "./DFXObject";
import type { DFXTime } from "./DFXTime";
import type { DFXWallTime } from "./DFXWallTime";
import type { DFXTimeoutResult } from "./DFXTimeoutResult";
import { mainThreadWait } from "./internal/blockingRules";
import { checkedInteger, clientError } from "./internal/time";

/** DispatchSemaphore. Tier 0 has no concurrently blocked waiters to wake. */
export class DFXSemaphore extends DFXObject {
  #value: number;
  constructor(value: number) {
    super(); checkedInteger(value, "semaphore value");
    if (value < 0) clientError("semaphore value must not be negative");
    this.#value = value;
  }
  wait(): void;
  wait(timeout: DFXTime | DFXWallTime): DFXTimeoutResult;
  wait(timeout?: DFXTime | DFXWallTime): void | DFXTimeoutResult {
    assertOwner(this);
    const result = mainThreadWait(() => { if (this.#value === 0) return false; this.#value--; return true; }, timeout);
    if (timeout !== undefined) return result;
  }
  signal(): number {
    assertOwner(this);
    if (this.#value === Number.MAX_SAFE_INTEGER) clientError("Unbalanced call to dispatch_semaphore_signal()");
    this.#value++; return 0;
  }
}

attributeDispatchClass(DFXSemaphore);
