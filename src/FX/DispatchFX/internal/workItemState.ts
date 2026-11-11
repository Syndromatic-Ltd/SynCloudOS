/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { DFXQoS } from "../DFXQoS";
import { DFXWorkItemFlags } from "../DFXWorkItemFlags";
import { currentExecution } from "./executionStack";
import type { ScheduledJob } from "./rootScheduler";
import { clientError } from "./time";
import { prepareWork } from "./work";

import { assertOwner, lifetimeOf, onLifetimeEnd, type DispatchLifetime } from "./lifetime";

interface WorkItemState {
  readonly qos: DFXQoS;
  readonly flags: DFXWorkItemFlags[];
  readonly creationQoS: DFXQoS | undefined;
  readonly work: () => unknown;
  readonly jobs: Set<ScheduledJob>;
  readonly notifications: (() => void)[];
  cancelled: boolean;
  complete: boolean;
  releaseNotifications?: () => void;
}
const states = new WeakMap<object, WorkItemState>();
export function initialiseWorkItem(item: object, options: { qos?: DFXQoS; flags?: DFXWorkItemFlags[] }, work: () => unknown): void {
  if (typeof work !== "function") clientError("work must be a function");
  const qos = options.qos ?? DFXQoS.unspecified;
  if (!(qos instanceof DFXQoS)) clientError("invalid work item QoS");
  const flags = options.flags ?? [];
  if (!Array.isArray(flags) || flags.some(flag => !Object.values(DFXWorkItemFlags).includes(flag))) clientError("invalid work item flags");
  states.set(item, {
    qos, flags: [...flags], creationQoS: flags.includes(DFXWorkItemFlags.assignCurrentContext) ? currentExecution()?.qos ?? DFXQoS.unspecified : undefined,
    work, jobs: new Set(), notifications: [], cancelled: false, complete: false,
  });
}
export function workItemState(item: object): WorkItemState {
  const state = states.get(item);
  if (!state) clientError("invalid dispatch work item");
  return state;
}
/** Keep only a weak state reference in the session's cleanup registry. */
function notificationCleanup(reference: WeakRef<WorkItemState>): () => void {
  return () => {
    const state = reference.deref();
    if (state) { state.notifications.length = 0; state.releaseNotifications = undefined; }
  };
}
export function notifyWorkItem(item: object, notify: () => void): void {
  const state = workItemState(item);
  if (state.complete) { notify(); return; }
  state.notifications.push(notify);
  state.releaseNotifications ??= onLifetimeEnd(lifetimeOf(item), notificationCleanup(new WeakRef(state)));
}
/** Cancellation skips the body, while an attempted execution still completes. */
export function performWorkItem(item: object, run?: () => void, teardown?: DispatchLifetime): void {
  if (!teardown || lifetimeOf(item) !== teardown) assertOwner(item);
  const state = workItemState(item);
  try { if (!state.cancelled) (run ?? prepareWork(state.work, "work item"))(); }
  finally {
    if (!state.complete) {
      state.complete = true; state.releaseNotifications?.(); state.releaseNotifications = undefined;
      for (const notify of state.notifications.splice(0)) notify();
    }
  }
}
