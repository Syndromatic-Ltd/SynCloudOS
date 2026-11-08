/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { ScheduledJob } from "./rootScheduler";
import { clientError } from "./time";

interface GroupState {
  count: number;
  readonly jobs: Set<ScheduledJob>;
  readonly notifications: (() => void)[];
}
const states = new WeakMap<object, GroupState>();
export function initialiseGroup(group: object): void { states.set(group, { count: 0, jobs: new Set(), notifications: [] }); }
export function groupState(group: object): GroupState {
  const state = states.get(group);
  if (!state) clientError("invalid dispatch group");
  return state;
}
export function enterGroup(group: object): void {
  const state = groupState(group);
  if (state.count === Number.MAX_SAFE_INTEGER) clientError("Too many nested calls to dispatch_group_enter()");
  state.count++;
}
export function leaveGroup(group: object): void {
  const state = groupState(group);
  if (state.count === 0) clientError("Unbalanced call to dispatch_group_leave()");
  if (--state.count === 0) for (const notify of state.notifications.splice(0)) notify();
}
