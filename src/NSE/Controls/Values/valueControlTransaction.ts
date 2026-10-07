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

import { defineSyncUndoAction } from "../../../SynCloudOS/nseRuntimeContracts";
import type { NSEUndoManagerPort } from "./valueControlTypes";

export class NSEValueControlUnknownStateError extends Error {
  readonly code = "nse-value-control-outcome-unknown";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NSEValueControlUnknownStateError";
  }
}

export class NSEValueControlCompensationError extends AggregateError {
  readonly code = "nse-value-control-compensation-failed";

  constructor(primary: unknown, compensation: readonly unknown[]) {
    super([primary, ...compensation], "A controlled value update and its rollback both failed.");
    this.name = "NSEValueControlCompensationError";
  }
}

/**
 * The controlled callback is the publication boundary.  A thrown callback
 * has not acknowledged publication, even if a misbehaving host changed state
 * before it threw, so it must never receive an unproven inverse update.
 */
export function commitUndoableValue<T>(options: {
  readonly manager: NSEUndoManagerPort;
  readonly name: string;
  readonly previous: T;
  readonly next: T;
  publish(value: T): void;
}): void {
  const reservation = options.manager.reserve();
  let published = false;
  try {
    options.publish(options.next);
    published = true;
    reservation.commit(defineSyncUndoAction({
      name: options.name,
      asyncPolicy: "forbid",
      undo: () => { options.publish(options.previous); },
      redo: () => { options.publish(options.next); },
    }));
  } catch (error) {
    const compensationFailures: unknown[] = [];
    try { reservation.cancel(); }
    catch (cancelError) { compensationFailures.push(cancelError); }
    if (published) {
      try { options.publish(options.previous); }
      catch (rollbackError) { compensationFailures.push(rollbackError); }
    }
    if (compensationFailures.length > 0) {
      throw new NSEValueControlCompensationError(error, compensationFailures);
    }
    if (!published) {
      throw new NSEValueControlUnknownStateError(
        "The controlled value setter failed before acknowledging publication; its model state is unknown.",
        { cause: error },
      );
    }
    throw error;
  }
}
