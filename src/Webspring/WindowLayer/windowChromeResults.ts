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

import type { CommandDispatchResult, WindowCloseResult } from "../../SynCloudOS/SynCloudOS";
import type { AppWindowCloseResult } from "../../SynCloudOS/AppSDK";

/**
 * Truthful projection of a chrome close dispatch into the app-facing close
 * result. Only an executed close whose window result reports closed resolves
 * closed; every other dispatch status or window outcome maps to cancelled,
 * refused, or an explicit rejection — never a defaulted closed.
 */
export function projectChromeCloseResult(
  dispatch: CommandDispatchResult<WindowCloseResult | null>,
  windowId: string,
): AppWindowCloseResult {
  // Each check names a single status literal: the disabled/denied member
  // carries a status union, so it falls to the field-free final else where
  // only that member remains.
  const status = dispatch.status;
  if (status === "executed") {
    const value = dispatch.value;
    // An executed close with no window result means the window was already
    // gone: the end state (not open) holds, so closed is truthful here.
    if (value === null) return Object.freeze({ outcome: "closed" as const, windowId });
    if (value.outcome === "cancelled") return Object.freeze({ outcome: "cancelled" as const, windowId });
    if (value.outcome === "refused") {
      const reason = value.reason;
      return Object.freeze({
        outcome: "refused" as const,
        windowId,
        reason: reason === "not-closable" || reason === "blocked" || reason === "delegate-refused" ? reason : "blocked",
      });
    }
    return Object.freeze({ outcome: "closed" as const, windowId });
  }
  if (status === "cancelled") {
    return Object.freeze({ outcome: "cancelled" as const, windowId });
  }
  if (status === "unhandled") {
    return Object.freeze({ outcome: "refused" as const, windowId, reason: "blocked" });
  }
  if (status === "failed") {
    throw new Error(`Window close dispatch failed: ${dispatch.error.message}`);
  }
  if (status === "unknown") {
    throw new Error(`Window close dispatch outcome unknown: ${dispatch.reason}`);
  }
  if (status === "invalid-payload") {
    throw new Error(`Window close dispatch rejected its payload: ${dispatch.issues.join("; ")}`);
  }
  return Object.freeze({ outcome: "refused" as const, windowId, reason: "blocked" });
}

/** A close dispatch that throws after the window is already gone (mount
 * abort, responder teardown) is a successful close, not a failed one. */
export function projectChromeCloseError(
  error: unknown,
  windowId: string,
  windowState: string | null,
): AppWindowCloseResult {
  if (windowState === null || windowState === "closed") {
    return Object.freeze({ outcome: "closed" as const, windowId });
  }
  throw error;
}
