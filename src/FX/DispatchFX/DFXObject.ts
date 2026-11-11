/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { initialiseLifetime, assertOwner } from "./internal/lifetime";
import type { DFXQueue } from "./DFXQueue";
import { initialiseObject, objectChanged, objectState, queueChain } from "./internal/queueState";
import { clientError } from "./internal/time";

/** DispatchObject. Suspension is counted independently of activation. */
export abstract class DFXObject {
  protected constructor() { initialiseObject(this); initialiseLifetime(this, new.target); }
  activate(): void { assertOwner(this); const state = objectState(this); state.active = true; objectChanged(this); }
  suspend(): void { assertOwner(this); const state = objectState(this); if (!state.global && !state.main) state.suspensionCount++; }
  resume(): void { assertOwner(this);
    const state = objectState(this);
    if (state.global || state.main) return;
    if (state.suspensionCount === 0) clientError("over-resume of a dispatch object");
    state.suspensionCount--;
    objectChanged(this);
  }
  setTarget(queue: DFXQueue | null): void {
    assertOwner(this); if (queue) assertOwner(queue);
    const state = objectState(this);
    if (state.global || state.main) return;
    if (state.initiallyInactive && state.active) clientError("cannot change target after activation");
    const targets: readonly DFXObject[] = queue === null ? [] : queueChain(queue);
    for (const target of targets) assertOwner(target);
    if (targets.includes(this)) clientError("target queue cycle");
    state.target = queue;
    // Active submissions retain their old target snapshots, as libdispatch
    // does. Inactive configuration affects already associated work too.
    objectChanged(this, !state.active);
  }
}
