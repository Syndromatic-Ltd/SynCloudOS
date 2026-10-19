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

/** Returns to the primary when the login window closes or when a secondary
 * application stops presenting (it quits, or its last window closes). It never
 * opens a primary that quit: that takes the host's Reopen control. */
export function createApplicationHostHome(runtime: SynCloudOSRuntime, primaryId: string, signInRequired: boolean): ApplicationHostHome {
  let disposed = false;
  const primaryRoute = () => {
    const app = runtime.apps.getApp(primaryId);
    if (!app) throw new TypeError(`Application ${primaryId} is not registered in this host.`);
    return app.route;
  };
  const open = () => runtime.routes.openRoute(primaryRoute(), { source: "workspace" });
  const returnHome = () => {
    if (disposed) return;
    const snapshot = runtime.store.getSnapshot();
    const primaryState = runtime.lifecycle.getState(primaryId);
    if (!snapshot.booted || snapshot.statechart.currentState !== "active.webspring" || snapshot.application.activeAppId !== null) return;
    if (signInRequired && !snapshot.loginServices.isAuthorised) return;
    if (primaryState !== "suspended" && primaryState !== "registered") return;
    void open().result.catch(() => undefined);
  };
  // Runs after the transition's own subscribers (route continuation included)
  // have had their turn, so the host only fills a page nothing else claimed.
  const scheduleReturnHome = () => { queueMicrotask(returnHome); };
  const unsubscribeTransitions = runtime.events.subscribe("statechart.transition.complete", (event) => {
    const record = event.payload as SynCloudOSStateTransitionRecord;
    if (record.to !== "active.webspring") return;
    // An explicit suspension (log out, a requested sign-in, a caller's
    // lifecycle.suspend) puts the primary aside on purpose.
    if (record.from !== "locked.loginWindow" && (record.source === "lifecycle.suspend" || record.source === signInRequestSource)) return;
    scheduleReturnHome();
  });
  let observedWindows: { readonly appId: string; readonly count: number } | null = null;
  const unsubscribeWindows = runtime.windows.subscribe(() => {
    const activeAppId = runtime.store.getSnapshot().application.activeAppId;
    if (!activeAppId || activeAppId === primaryId) {
      observedWindows = null;
      return;
    }
    const count = runtime.windows.list({ applicationId: activeAppId }).length;
    const previous = observedWindows?.appId === activeAppId ? observedWindows.count : 0;
    observedWindows = { appId: activeAppId, count };
    if (previous > 0 && count === 0 && runtime.lifecycle.getState(primaryId) === "suspended") {
      queueMicrotask(() => {
        if (!disposed && runtime.store.getSnapshot().application.activeAppId === activeAppId) void open().result.catch(() => undefined);
      });
    }
  });
  return Object.freeze({
    primaryId,
    open,
    async requestSignIn() {
      if (runtime.statechart.getCurrentState() === "locked.loginWindow") return;
      if (runtime.statechart.getCurrentState() !== "active.webspring") {
        await runtime.statechart.gotoState("active.webspring", { source: signInRequestSource, closeWindows: false, syncRoute: false });
        if (runtime.statechart.getCurrentState() !== "active.webspring") return;
      }
      runtime.statechart.gotoState("locked.loginWindow", { source: signInRequestSource, closeWindows: false, syncRoute: false });
    },
    dispose() {
      disposed = true;
      unsubscribeTransitions();
      unsubscribeWindows();
    },
  });
}
