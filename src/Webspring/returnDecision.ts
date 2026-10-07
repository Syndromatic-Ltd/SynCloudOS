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

import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";

export type ReturnDecisionOutcome = "closed" | "refused";

/** Host-owned return-to-Webspring decision flows, shared by the SystemUI
 * dialog and covered by unit tests (the dialog itself is a thin view over
 * these functions).
 *
 * Quit closes owned windows in place first, so the close/review flow runs
 * while the app is still up and a refusal leaves everything untouched behind
 * the dialog. Only then does the shell route run — animating the live main
 * view out instead of flashing the empty-stage fallback — and the lifecycle
 * close finishes documents and unmounting invisibly behind the shell. A
 * refused document close resolves "refused" and the caller stays in the app
 * with its windows intact. */
export async function confirmReturnDecisionQuit(
  runtime: SynCloudOSRuntime,
  appId: string,
): Promise<ReturnDecisionOutcome> {
  // One coherent close transaction: the application-close lease is held for
  // the WHOLE flow, which blocks new document/window admission from the
  // moment Quit is accepted. Releasing it before the lifecycle close would
  // let a re-open race wedge the app between shell and app.
  const authority = runtime.windows.beginApplicationClose(appId);
  let preparation: Awaited<ReturnType<typeof runtime.windows.prepareCloseApplication>> = null;
  let committed = false;
  try {
    preparation = await runtime.windows.prepareCloseApplication(appId, { reason: "application-quit" }, authority);
    if (preparation && preparation.status !== "ready") return "refused";
    const route = await runtime.routes.openRoute("/", { source: "system-ui:return-decision" }).result;
    if (route.status !== "completed" || !route.committed) {
      throw new Error("The return to Webspring did not complete. The app and its windows are unchanged.");
    }
    // The shell return plays the departing app's exit on live data. Closing
    // first would pull mounts, documents and lifecycle state out from under
    // the exiting tree mid-fade, blanking it to the stage fallback (the Quit
    // flash). Wait for the return to settle, then close invisibly.
    await waitForReturnSettlement(runtime);
    const closeResult = await runtime.lifecycle.close(appId, {
      reason: "return-decision-quit",
      ...(preparation?.status === "ready" ? { closeTransaction: { authority, preparation: preparation.token } } : {}),
    }).result;
    if (closeResult.committed) {
      committed = true;
      return "closed";
    }
    // Rare race: a document dirtied between the window close and the
    // lifecycle close. Return to the app refused rather than stranding the
    // user on the shell with the app still open.
    const appRoute = runtime.apps.getApp(appId)?.route ?? "/";
    const back = await runtime.routes.openRoute(appRoute, { source: "system-ui:return-decision" }).result;
    if (back.status !== "completed" || !back.committed) {
      throw new Error(`Return decision could not route back to "${appRoute}" after a refused quit.`);
    }
    return "refused";
  } finally {
    if (!committed && preparation?.status === "ready") {
      await runtime.windows.rollbackCloseApplication(preparation.token, authority);
    }
    runtime.windows.endApplicationClose(authority);
  }
}

async function waitForReturnSettlement(runtime: SynCloudOSRuntime): Promise<void> {
  const snapshotId = () => runtime.store.getSnapshot().webspring.returnTransitionId;
  // The transition id may land just after the route resolves; allow a beat
  // for it to appear before concluding there is no transition to wait for.
  const appearDeadline = runtime.environment.now() + 250;
  let transitionId = snapshotId();
  while (!transitionId && runtime.environment.now() < appearDeadline) {
    await new Promise<void>((resolve) => { runtime.environment.setTimeout(() => resolve(), 25); });
    transitionId = snapshotId();
  }
  if (!transitionId) return;
  const deadline = runtime.environment.now() + 2500;
  for (;;) {
    await new Promise<void>((resolve) => { runtime.environment.setTimeout(() => resolve(), 50); });
    if (snapshotId() !== transitionId) return;
    if (runtime.environment.now() >= deadline) throw new Error("The return to Webspring transition did not settle before its deadline.");
  }
}

/** Keep Windows returns to the shell while preserving the application's
 * detached windows and their live mounts — the same lifetime semantics the
 * route layer already uses when app-to-app switching keeps windows. The
 * route result is inspected: an uncompleted/uncommitted navigation throws
 * so the dialog can surface a recoverable error instead of dismissing into
 * a broken state. */
export async function confirmReturnDecisionKeepWindows(runtime: SynCloudOSRuntime): Promise<void> {
  const route = await runtime.routes.openRoute("/", { source: "system-ui:return-decision" }).result;
  if (route.status !== "completed" || !route.committed) {
    throw new Error("The return to Webspring did not complete. The app and its windows are unchanged.");
  }
}
