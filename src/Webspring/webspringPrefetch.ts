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

import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";

const restoredRouteKey = "syncloudos:last-active-app-route";
const hoverPrefetchDelayMs = 180;
const idlePrefetchTimeoutMs = 2200;
const maxIdlePrefetchCount = 2;

type PrefetchReason = "hover" | "idle";

interface NavigatorConnectionHints {
  saveData?: boolean;
}

interface PrefetchState {
  readonly hoverTimers: Map<string, number>;
  readonly queuedPrefetches: Array<{ appId: string; reason: PrefetchReason }>;
  readonly prefetchedAppIds: Set<string>;
  activePrefetch: Promise<unknown> | null;
  idlePrefetchScheduled: boolean;
}

const states = new WeakMap<SynCloudOSRuntime, PrefetchState>();

function clearState(state: PrefetchState) {
  if (typeof window !== "undefined") state.hoverTimers.forEach((timer) => window.clearTimeout(timer));
  state.hoverTimers.clear();
  state.queuedPrefetches.splice(0, state.queuedPrefetches.length);
  state.prefetchedAppIds.clear();
  state.activePrefetch = null;
  state.idlePrefetchScheduled = false;
}

function stateFor(runtime: SynCloudOSRuntime) {
  let state = states.get(runtime);
  if (!state) {
    const created: PrefetchState = { hoverTimers: new Map(), queuedPrefetches: [], prefetchedAppIds: new Set(), activePrefetch: null, idlePrefetchScheduled: false };
    state = created;
    states.set(runtime, created);
    // The prefetch state is owned by its runtime: pending hover timers and
    // queued work end with it, and the module no longer retains it.
    runtime.signal.addEventListener("abort", () => {
      clearState(created);
      states.delete(runtime);
    }, { once: true });
  }
  return state;
}

function hasSaveDataEnabled() {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as Navigator & { connection?: NavigatorConnectionHints }).connection?.saveData);
}

function shouldSkipSpeculativePrefetch(runtime: SynCloudOSRuntime) {
  if (typeof window === "undefined") return false;
  // Speculation follows the runtime's aggregate policy, independent of artwork.
  if (runtime.performancePolicy?.snapshot().speculativeWork === false) return true;
  return hasSaveDataEnabled() || runtime.presentationTraits.getSnapshot().horizontalSizeClass === "compact";
}

function canPrefetchApp(runtime: SynCloudOSRuntime, state: PrefetchState, appId: string) {
  const app = runtime.apps.getApp(appId);
  if (!app || app.isDisabled || app.type === "external" || app.lifecycle.preload !== true) return false;
  return !runtime.bundles.getLoadedBundle(appId) && !state.prefetchedAppIds.has(normalizeBundleIdentifier(appId));
}

function enqueuePrefetch(runtime: SynCloudOSRuntime, state: PrefetchState, appId: string, reason: PrefetchReason) {
  if (!canPrefetchApp(runtime, state, appId)) return;
  if (state.queuedPrefetches.some((item) => normalizeBundleIdentifier(item.appId) === normalizeBundleIdentifier(appId)) || state.activePrefetch) {
    if (!state.queuedPrefetches.some((item) => normalizeBundleIdentifier(item.appId) === normalizeBundleIdentifier(appId))) state.queuedPrefetches.push({ appId, reason });
    return;
  }
  state.queuedPrefetches.push({ appId, reason });
  drainPrefetchQueue(runtime, state);
}

function drainPrefetchQueue(runtime: SynCloudOSRuntime, state: PrefetchState) {
  if (state.activePrefetch || runtime.signal.aborted) return;
  const next = state.queuedPrefetches.shift();
  if (!next) return;
  if (!canPrefetchApp(runtime, state, next.appId)) {
    drainPrefetchQueue(runtime, state);
    return;
  }

  state.prefetchedAppIds.add(normalizeBundleIdentifier(next.appId));
  state.activePrefetch = runtime.bundles.loadBundle(next.appId);
  const finish = () => {
    state.activePrefetch = null;
    drainPrefetchQueue(runtime, state);
  };
  void state.activePrefetch.then(finish, finish);
}

function getRestoredRouteAppId(runtime: SynCloudOSRuntime) {
  if (typeof window === "undefined") return null;
  const restoredRoute = window.sessionStorage.getItem(restoredRouteKey);
  if (!restoredRoute) return null;
  const route = runtime.routes.resolveRoute(restoredRoute) as { kind: string; app?: { bundleIdentifier: string } };
  return route.kind === "app" && route.app ? route.app.bundleIdentifier : null;
}

function requestIdle(callback: () => void) {
  if (typeof window === "undefined") {
    callback();
    return 0;
  }
  if (window.requestIdleCallback) {
    return window.requestIdleCallback(callback, { timeout: idlePrefetchTimeoutMs });
  }
  return window.setTimeout(callback, idlePrefetchTimeoutMs);
}

export function scheduleWebspringAppPrefetch(runtime: SynCloudOSRuntime, appId: string) {
  if (typeof window === "undefined" || shouldSkipSpeculativePrefetch(runtime)) return;
  const state = stateFor(runtime);
  cancelWebspringAppPrefetch(runtime, appId);
  const timer = window.setTimeout(() => {
    state.hoverTimers.delete(normalizeBundleIdentifier(appId));
    enqueuePrefetch(runtime, state, appId, "hover");
  }, hoverPrefetchDelayMs);
  state.hoverTimers.set(normalizeBundleIdentifier(appId), timer);
}

export function cancelWebspringAppPrefetch(runtime: SynCloudOSRuntime, appId: string) {
  const state = stateFor(runtime);
  const timer = state.hoverTimers.get(normalizeBundleIdentifier(appId));
  if (timer === undefined || typeof window === "undefined") return;
  window.clearTimeout(timer);
  state.hoverTimers.delete(normalizeBundleIdentifier(appId));
}

export function scheduleWebspringIdlePrefetch(runtime: SynCloudOSRuntime) {
  const state = stateFor(runtime);
  if (state.idlePrefetchScheduled || shouldSkipSpeculativePrefetch(runtime)) return;
  state.idlePrefetchScheduled = true;
  requestIdle(() => {
    const candidates = [
      getRestoredRouteAppId(runtime),
      ...runtime.apps.getDisplayApps().map((app) => app.bundleIdentifier)
    ].filter((appId): appId is string => Boolean(appId));
    const uniqueCandidates = Array.from(new Set(candidates.map(normalizeBundleIdentifier)));
    uniqueCandidates
      .filter((appId) => canPrefetchApp(runtime, state, appId))
      .slice(0, maxIdlePrefetchCount)
      .forEach((appId) => enqueuePrefetch(runtime, state, appId, "idle"));
  });
}
