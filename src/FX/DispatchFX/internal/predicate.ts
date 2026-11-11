/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXPredicate } from "../DFXPredicate";
import type { DFXQueue } from "../DFXQueue";
export type PredicateKind = "onQueue" | "onQueueAsBarrier" | "notOnQueue";
const predicates = new WeakMap<DFXPredicate, { kind: PredicateKind; queue: DFXQueue }>();
export function initialisePredicate(predicate: DFXPredicate, kind: PredicateKind, queue: DFXQueue): void { predicates.set(predicate, { kind, queue }); }
export function predicateValue(predicate: DFXPredicate) { return predicates.get(predicate); }
