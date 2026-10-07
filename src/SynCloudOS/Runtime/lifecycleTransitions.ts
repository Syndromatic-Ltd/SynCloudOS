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

import type { SynCloudOSRuntimeStore } from "./runtimeInstanceTypes";

export type LifecycleTransitionHandler = (appId: string, state: string | undefined, previous: string | undefined) => void;

/**
 * Invokes `handler` for every application whose lifecycle state changed
 * between successive store publications.
 *
 * The store shares untouched branches structurally, so a publication that did
 * not touch `lifecycle` leaves the same map object in place; those
 * publications return immediately instead of scanning every registered
 * application. The observed map is committed before any handler runs: a
 * handler that publishes re-entrantly (for example through a policy
 * re-authorisation) is observed against the already-consumed state and never
 * replays the outer transition. Owners that were present before the
 * publication are visited first, in their previous order, then new owners.
 */
export function subscribeLifecycleTransitions(
  store: Pick<SynCloudOSRuntimeStore, "getSnapshot" | "subscribe">,
  handler: LifecycleTransitionHandler,
): () => void {
  let observed: Readonly<Record<string, string | undefined>> = store.getSnapshot().lifecycle;
  return store.subscribe(() => {
    const next: Readonly<Record<string, string | undefined>> = store.getSnapshot().lifecycle;
    if (next === observed) return;
    const previous = observed;
    observed = next;
    for (const appId of Object.keys(previous)) {
      const state = next[appId];
      if (state !== previous[appId]) handler(appId, state, previous[appId]);
    }
    for (const appId of Object.keys(next)) {
      if (!Object.prototype.hasOwnProperty.call(previous, appId) && next[appId] !== undefined) handler(appId, next[appId], undefined);
    }
  });
}
