/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { ScheduledJob } from "./rootScheduler";
import { clientError } from "./time";

import { assertOwner, lifetimeOf, onLifetimeEnd } from "./lifetime";
import { reportDispatchError } from "./work";

interface GroupState {
  readonly sites: Error[];
  count: number;
  readonly jobs: Set<ScheduledJob>;
  readonly notifications: (() => void)[];
}
const states = new WeakMap<object, GroupState>();
export function initialiseGroup(group: object): void {
  const state: GroupState = { count: 0, sites: [], jobs: new Set(), notifications: [] }; states.set(group, state);
  onLifetimeEnd(lifetimeOf(group), () => {
    state.notifications.length = 0;
    if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV && state.sites.length) {
      const error = new Error(`BUG IN CLIENT OF LIBDISPATCH: group still entered ${state.sites.length} time(s) at session end`);
      error.stack += state.sites.map(site => "\nEntered at: " + site.stack).join(""); reportDispatchError(error);
    }
    state.sites.length = 0;
  });
}
export function groupState(group: object): GroupState {
  const state = states.get(group);
  if (!state) clientError("invalid dispatch group");
  return state;
}
export function enterGroup(group: object, automatic = false): void {
  assertOwner(group);
  const state = groupState(group);
  if (state.count === Number.MAX_SAFE_INTEGER) clientError("Too many nested calls to dispatch_group_enter()");
  state.count++;
  if (!automatic && (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) state.sites.push(new Error("dispatch_group_enter()"));
}
export function leaveGroup(group: object, automatic = false): void {
  if (!automatic) assertOwner(group);
  const state = groupState(group);
  if (state.count === 0) clientError("Unbalanced call to dispatch_group_leave()");
  if (!automatic) state.sites.pop();
  if (--state.count === 0 && !lifetimeOf(group).ended) for (const notify of state.notifications.splice(0)) notify();
}
