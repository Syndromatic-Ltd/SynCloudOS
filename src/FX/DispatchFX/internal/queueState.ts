/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXObject } from "../DFXObject";
import type { DFXQueue } from "../DFXQueue";
import { DFXQoS } from "../DFXQoS";
import { DFXQoSClass } from "../DFXQoSClass";
import { DFXWorkItemFlags } from "../DFXWorkItemFlags";
import { clientError } from "./time";

interface ObjectState {
  active: boolean;
  initiallyInactive: boolean;
  suspensionCount: number;
  target: DFXQueue | null;
  global: boolean;
  main: boolean;
  concurrent: boolean;
  /** Internal Tier 0 guard; the worker pool will own this state in Task 10. */
  workerInFlight: boolean;
  label: string;
  qos: DFXQoS;
  specifics: WeakMap<object, unknown>;
}
const states = new WeakMap<DFXObject, ObjectState>();
let changed: (object: DFXObject, retarget: boolean) => void = () => {};
export function initialiseObject(object: DFXObject): void {
  states.set(object, {
    active: true, initiallyInactive: false, suspensionCount: 0, target: null,
    global: false, main: false, concurrent: false, workerInFlight: false, label: "", qos: DFXQoS.unspecified, specifics: new WeakMap(),
  });
}
export function objectState(object: DFXObject): ObjectState {
  const state = states.get(object);
  if (!state) clientError("invalid dispatch object");
  return state;
}
export function observeObjectChanges(handler: typeof changed): void { changed = handler; }
export function objectChanged(object: DFXObject, retarget = false): void { changed(object, retarget); }
export function queueChain(queue: DFXQueue): DFXQueue[] {
  const result: DFXQueue[] = [];
  for (let next: DFXQueue | null = queue; next; next = objectState(next).target) {
    if (result.includes(next)) clientError("target queue cycle");
    result.push(next);
  }
  return result;
}
const ranks: Record<DFXQoSClass, number> = { unspecified: 0, background: 1, utility: 2, default: 3, userInitiated: 4, userInteractive: 5 };
export function compareQoS(left: DFXQoS, right: DFXQoS): number {
  return ranks[left.qosClass] - ranks[right.qosClass] || left.relativePriority - right.relativePriority;
}
function higher(left: DFXQoS, right: DFXQoS): DFXQoS { return compareQoS(left, right) >= 0 ? left : right; }
/** Apple's block.h: async inherits an assigned queue class; enforce may raise it. */
export function resolveQoS(chain: readonly DFXQueue[], assigned: DFXQoS, captured: DFXQoS, flags: readonly DFXWorkItemFlags[]): DFXQoS {
  const item = assigned.qosClass !== DFXQoSClass.unspecified ? assigned
    : flags.includes(DFXWorkItemFlags.noQoS) || flags.includes(DFXWorkItemFlags.detached) ? DFXQoS.unspecified : captured;
  const own = objectState(chain[0]).qos;
  let resolved = flags.includes(DFXWorkItemFlags.enforceQoS) ? higher(own, item)
    : own.qosClass !== DFXQoSClass.unspecified ? own : item;
  for (const target of chain.slice(1)) resolved = higher(resolved, objectState(target).qos);
  return resolved.qosClass === DFXQoSClass.unspecified ? DFXQoS.default : resolved;
}
