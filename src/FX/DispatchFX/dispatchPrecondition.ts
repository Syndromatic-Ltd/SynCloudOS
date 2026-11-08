/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXPredicate } from "./DFXPredicate";
import { isExecuting } from "./internal/executionStack";
import { predicateValue } from "./internal/predicate";
import { clientError } from "./internal/time";
/** dispatchPrecondition(condition:). Fail with libdispatch's client-error prefix. */
export function dispatchPrecondition(condition: DFXPredicate): void {
  const value = predicateValue(condition);
  if (!value) clientError("invalid dispatch predicate");
  const matches = isExecuting(value.queue, value.kind === "onQueueAsBarrier");
  if (value.kind === "notOnQueue" ? matches : !matches) clientError(`dispatchPrecondition ${value.kind} failed for queue "${value.queue.label}"`);
}
