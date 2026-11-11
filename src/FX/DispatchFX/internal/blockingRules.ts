/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXTime } from "../DFXTime";
import { DFXWallTime } from "../DFXWallTime";
import { DFXTimeoutResult } from "../DFXTimeoutResult";
import { clientError, nanoseconds } from "./time";

/** Tier 0 never blocks the event loop or pretends to service another realm. */
export function mainThreadWait(satisfy: () => boolean, timeout?: DFXTime | DFXWallTime): DFXTimeoutResult {
  if (timeout !== undefined && !(timeout instanceof DFXTime) && !(timeout instanceof DFXWallTime)) clientError("invalid wait timeout");
  if (satisfy()) return DFXTimeoutResult.success;
  if (timeout instanceof DFXTime ? timeout.uptimeNanoseconds <= DFXTime.now().uptimeNanoseconds
    : timeout instanceof DFXWallTime && nanoseconds(DFXWallTime.now().distance(timeout)) <= 0) return DFXTimeoutResult.timedOut;
  return clientError("blocking wait on the main thread cannot be satisfied in the browser; use notify(queue:)");
}
