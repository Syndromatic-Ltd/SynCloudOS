/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQueue } from "../DFXQueue";
import { executionLabelChain, isExecuting } from "./executionStack";
import { objectState } from "./queueState";
import { clientError } from "./time";

export function labelChain(chain: readonly DFXQueue[]): string { return chain.map(queue => objectState(queue).label).join(" -> "); }
/** Only a requested queue or held exclusive target can deadlock this caller. */
export function assertSyncAvailable(chain: readonly DFXQueue[]): void {
  if (isExecuting(chain[0]) || chain.some(queue => isExecuting(queue, true))) {
    clientError(`dispatch_sync called on queue already owned by current thread: ${executionLabelChain()} -> sync ${labelChain(chain)}`);
  }
  if (chain.some(queue => objectState(queue).workerInFlight)) {
    clientError(`dispatch_sync cannot wait for worker item in flight: ${labelChain(chain)}`);
  }
}
