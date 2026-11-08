/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQueue } from "./DFXQueue";
import { initialiseObject, objectChanged, objectState, queueChain } from "./internal/queueState";
import { clientError } from "./internal/time";

/** DispatchObject. Suspension is counted independently of activation. */
export abstract class DFXObject {
  protected constructor() { initialiseObject(this); }
  activate(): void { const state = objectState(this); state.active = true; objectChanged(this); }
  suspend(): void { const state = objectState(this); if (!state.global && !state.main) state.suspensionCount++; }
  resume(): void {
    const state = objectState(this);
    if (state.global || state.main) return;
    if (state.suspensionCount === 0) clientError("over-resume of a dispatch object");
    state.suspensionCount--;
    objectChanged(this);
  }
  setTarget(queue: DFXQueue): void {
    const state = objectState(this);
    if (state.global || state.main) clientError("cannot change the target of a global or main queue");
    if (state.initiallyInactive && state.active) clientError("cannot change target after activation");
    const targets: readonly DFXObject[] = queueChain(queue);
    if (targets.includes(this)) clientError("target queue cycle");
    state.target = queue;
    // Active submissions retain their old target snapshots, as libdispatch
    // does. Inactive configuration affects already associated work too.
    objectChanged(this, !state.active);
  }
}
