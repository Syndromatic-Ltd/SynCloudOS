/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQueue } from "./DFXQueue";
import { initialisePredicate, type PredicateKind } from "./internal/predicate";
import { objectState } from "./internal/queueState";
/** DispatchPredicate. The queue payload remains private. */
export class DFXPredicate {
  private constructor(kind: PredicateKind, queue: DFXQueue) { objectState(queue); initialisePredicate(this, kind, queue); Object.freeze(this); }
  static onQueue(queue: DFXQueue): DFXPredicate { return new DFXPredicate("onQueue", queue); }
  static onQueueAsBarrier(queue: DFXQueue): DFXPredicate { return new DFXPredicate("onQueueAsBarrier", queue); }
  static notOnQueue(queue: DFXQueue): DFXPredicate { return new DFXPredicate("notOnQueue", queue); }
}
