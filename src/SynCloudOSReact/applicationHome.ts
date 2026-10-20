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
import type { SynCloudOSOpenRouteHandle } from "../SynCloudOS/RouteManager/routeTypes";
import type { SynCloudOSRuntime } from "../SynCloudOS/Runtime/runtimeInstanceTypes";
import type { SynCloudOSStateTransitionRecord } from "../SynCloudOS/Statechart/statechartTypes";

/** The primary application is an application-only host's home: what the page
 * shows whenever nothing else is being presented. */
export interface ApplicationHostHome {
  readonly primaryId: string;
  /** Opens the primary through its route: activates a suspended session or
   * launches a new one after the primary quit. */
  open(): SynCloudOSOpenRouteHandle;
  /** Puts the primary aside and presents the login window over the page. */
  requestSignIn(): Promise<void>;
  dispose(): void;
}

const signInRequestSource = "authentication-request";

interface SignInReturnTarget {
  readonly appId: string;
  readonly href: string;
}

/** Returns to the sign-in origin when the login window closes, or to the primary
 * when a secondary application stops presenting. It never reopens an application
 * that quit: that takes the host's Reopen control. */
export function createApplicationHostHome(runtime: SynCloudOSRuntime, primaryId: string, signInRequired: boolean): ApplicationHostHome {
  let disposed = false;
  let signInReturnTarget: SignInReturnTarget | null = null;
  const primaryRoute = () => {
    const app = runtime.apps.getApp(primaryId);
    if (!app) throw new TypeError(`Application ${primaryId} is not registered in this host.`);
    return app.route;
  };
  const open = () => runtime.routes.openRoute(primaryRoute(), { source: "workspace" });
  const returnHome = (returnTarget: SignInReturnTarget | null) => {
    if (disposed) return;
    const snapshot = runtime.store.getSnapshot();
    const targetState = runtime.lifecycle.getState(returnTarget?.appId ?? primaryId);
    if (!snapshot.booted || snapshot.statechart.currentState !== "active.webspring" || snapshot.application.activeAppId !== null) return;
    if (signInRequired && !snapshot.loginServices.isAuthorised) return;
    if (targetState !== "suspended" && targetState !== "registered") return;
    // The sign-in request leaves the browser entry untouched. Resume its exact
    // internal route without replacing a root alias, query or fragment.
    void (returnTarget
      ? runtime.routes.openRoute(returnTarget.href, { source: "workspace", syncRoute: false })
      : open()).result;
  };
  // Runs after the transition's own subscribers (route continuation included)
  // have had their turn, so the host only fills a page nothing else claimed.
  const scheduleReturnHome = (returnTarget: SignInReturnTarget | null) => { queueMicrotask(() => returnHome(returnTarget)); };
  const unsubscribeTransitions = runtime.events.subscribe("statechart.transition.complete", (event) => {
    const record = event.payload as SynCloudOSStateTransitionRecord;
    if (record.to !== "active.webspring") return;
    // An explicit suspension (log out, a requested sign-in, a caller's
    // lifecycle.suspend) puts the primary aside on purpose.
    if (record.from !== "locked.loginWindow" && (record.source === "lifecycle.suspend" || record.source === signInRequestSource)) return;
    const returnTarget = record.from === "locked.loginWindow" ? signInReturnTarget : null;
    if (record.from === "locked.loginWindow") signInReturnTarget = null;
    scheduleReturnHome(returnTarget);
  });
  let observedWindows: { readonly appId: string; readonly count: number } | null = null;
  const unsubscribeWindows = runtime.windows.subscribe(() => {
    const activeAppId = runtime.store.getSnapshot().application.activeAppId;
    if (!activeAppId || normalizeBundleIdentifier(activeAppId) === normalizeBundleIdentifier(primaryId)) {
      observedWindows = null;
      return;
    }
    const count = runtime.windows.list({ applicationId: activeAppId }).length;
    const previous = observedWindows && normalizeBundleIdentifier(observedWindows.appId) === normalizeBundleIdentifier(activeAppId) ? observedWindows.count : 0;
    observedWindows = { appId: activeAppId, count };
    if (previous > 0 && count === 0 && runtime.lifecycle.getState(primaryId) === "suspended") {
      queueMicrotask(() => {
        if (!disposed && normalizeBundleIdentifier(runtime.store.getSnapshot().application.activeAppId) === normalizeBundleIdentifier(activeAppId)) void open().result.catch(() => undefined);
      });
    }
  });
  return Object.freeze({
    primaryId,
    open,
    async requestSignIn() {
      if (runtime.statechart.getCurrentState() === "locked.loginWindow") return;
      const snapshot = runtime.store.getSnapshot();
      const route = runtime.routes.routeGraph.current();
      signInReturnTarget = snapshot.application.activeAppId
        ? {
          appId: snapshot.application.activeAppId,
          href: route && normalizeBundleIdentifier(route.appId) === normalizeBundleIdentifier(snapshot.application.activeAppId)
            ? `${route.pathname}${route.search}${route.hash}`
            : snapshot.application.routePath,
        }
        : null;
      if (runtime.statechart.getCurrentState() !== "active.webspring") {
        await runtime.statechart.gotoState("active.webspring", { source: signInRequestSource, closeWindows: false, syncRoute: false });
        if (runtime.statechart.getCurrentState() !== "active.webspring") {
          signInReturnTarget = null;
          return;
        }
      }
      runtime.statechart.gotoState("locked.loginWindow", { source: signInRequestSource, closeWindows: false, syncRoute: false });
    },
    dispose() {
      disposed = true;
      signInReturnTarget = null;
      unsubscribeTransitions();
      unsubscribeWindows();
    },
  });
}
