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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type {
  SynCloudOSOpenRouteOptions,
  SynCloudOSOpenRouteResult,
} from "../RouteManager/routeTypes";
import type { RuntimeOperationHandle } from "../Runtime/runtimeInstanceTypes";
import type { BrowserRoutePlatform } from "../PlatformAdapters/BrowserRoutePlatform";
import {
  createManagedRouteEntry,
  mergeManagedRouteHistoryState,
  readManagedRouteEntry,
  type ManagedRouteEntry,
} from "./BrowserRouteHistory";

const lastActiveAppRouteKey = "syncloudos:last-active-app-route";
let browserRouteCoordinatorSessionSequence = 0;

export type CoordinatedRouteResolution =
  | { kind: "webspring"; pathname: string }
  | {
      kind: "app";
      pathname: string;
      app: { bundleIdentifier: string; policy?: Readonly<{ public?: boolean; requiresLogin?: boolean }> };
    }
  | { kind: "external" | "notFound"; pathname: string };

interface BrowserRouteRuntimeSnapshot {
  booted: boolean;
  statechart: { currentState: string };
  loginServices: { isAuthorised: boolean };
  lifecycle: Readonly<Record<string, string>>;
  application: {
    activeAppId: string | null;
    routePath: string;
    multiSwitch: { status: "idle" | "switching" };
  };
}
interface BrowserNavigateDestination {
  url: string;
  getState?(): unknown;
}

interface BrowserNavigateEvent extends Event {
  readonly signal?: AbortSignal;
  canIntercept: boolean;
  destination: BrowserNavigateDestination;
  downloadRequest: string | null;
  hashChange?: boolean;
  navigationType: "push" | "replace" | "reload" | "traverse";
  intercept(options: {
    handler: () => void | Promise<void>;
    focusReset: "after-transition" | "manual";
    scroll: "after-transition" | "manual";
  }): void;
}

type BrowserNavigationType = BrowserNavigateEvent["navigationType"];

interface BrowserNavigationTarget {
  addEventListener(
    type: "navigate",
    listener: (event: BrowserNavigateEvent) => void,
  ): void;
  removeEventListener(
    type: "navigate",
    listener: (event: BrowserNavigateEvent) => void,
  ): void;
}

export interface BrowserRouteCoordinatorDependencies {
  readonly platform: BrowserRoutePlatform;
  getRuntimeSnapshot(): BrowserRouteRuntimeSnapshot;
  subscribeRuntime(listener: () => void): () => void;
  subscribeRouteOpen(listener: (payload: {
    readonly browserHref: string;
    readonly syncRoute: boolean;
    readonly historyMode?: "push" | "replace";
  }) => void): () => void;
  resolveRoute(pathname: string): CoordinatedRouteResolution;
  openRoute(
    pathname: string,
    options: SynCloudOSOpenRouteOptions,
  ): RuntimeOperationHandle<SynCloudOSOpenRouteResult> | void;
  /** Return only the canonical wrapped successor linked to this predecessor. */
  getRedirectSuccessor?(
    predecessorOperationId: string,
    successorOperationId: string,
  ): RuntimeOperationHandle<SynCloudOSOpenRouteResult> | null;
  waitForPresentationSettlement(settlementId: string): Promise<unknown>;
  cancelPresentationSettlement?(settlementId: string, reason: string): void;
  run<T>(operation: () => T, label: string): unknown;
}

function routeRequiresLogin(resolution: CoordinatedRouteResolution) {
  if (resolution.kind === "webspring") return false;
  if (resolution.kind !== "app") return true;
  if (resolution.app.policy?.requiresLogin !== undefined) return resolution.app.policy.requiresLogin;
  if (resolution.app.policy?.public === true) return false;
  return true;
}

function isRuntimeReadyForRoute(
  snapshot: BrowserRouteRuntimeSnapshot,
  resolution: CoordinatedRouteResolution,
) {
  if (!snapshot.booted) return false;
  if (!routeRequiresLogin(resolution)) return true;
  return snapshot.loginServices.isAuthorised && snapshot.statechart.currentState !== "locked.loginWindow";
}

function isRuntimeAtRoute(
  snapshot: BrowserRouteRuntimeSnapshot,
  resolution: CoordinatedRouteResolution,
) {
  if (resolution.kind === "webspring") {
    return (
      snapshot.application.routePath === "/" &&
      snapshot.application.activeAppId === null
    );
  }
  if (resolution.kind === "app") {
    return (
      snapshot.application.routePath === resolution.pathname &&
      normalizeBundleIdentifier(snapshot.application.activeAppId) === normalizeBundleIdentifier(resolution.app.bundleIdentifier)
    );
  }
  return false;
}

function isHashOnlyNavigation(
  event: BrowserNavigateEvent,
  currentUrl: URL,
  destinationUrl: URL,
) {
  return (
    event.hashChange === true ||
    (currentUrl.pathname === destinationUrl.pathname &&
      currentUrl.search === destinationUrl.search &&
      currentUrl.hash !== destinationUrl.hash)
  );
}

function isQueryOnlyNavigation(currentUrl: URL, destinationUrl: URL) {
  return (
    currentUrl.pathname === destinationUrl.pathname
    && currentUrl.hash === destinationUrl.hash
    && currentUrl.search !== destinationUrl.search
  );
}

function getBrowserHref(location: { pathname: string; search: string; hash: string }) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function createBrowserRouteCoordinator(
  dependencies: BrowserRouteCoordinatorDependencies,
) {
  const runtimeSession = `browser-route:${++browserRouteCoordinatorSessionSequence}`;
  let nextEntrySequence = 0;
  let routeRevision = 0;
  let navigationTarget: BrowserNavigationTarget | null = null;
  let unsubscribeRuntime: (() => void) | null = null;
  let unsubscribeRouteOpen: (() => void) | null = null;
  let unsubscribePopState: (() => void) | null = null;
  let initialHref: string | null = null;
  let initialHrefDeferredForAuthorization = false;
  let lastCommittedBrowserHref: string | null = null;
  let lastCommittedEntry: ManagedRouteEntry | null = null;
  let compensationTargetEntryKey: string | null = null;
  let routeIntent = 0;
  const cancelRouteSettlers = new Set<() => void>();
  let activeRouteHandle: RuntimeOperationHandle<SynCloudOSOpenRouteResult> | null = null;
  let activeIntentController: AbortController | null = null;
  let activePresentationSettlementId: string | null = null;
  let routeEpoch = 0;
  let started = false;

  const makeManagedEntry = (position: number, revision = routeRevision) =>
    createManagedRouteEntry({
      runtimeSession,
      entryKey: `${runtimeSession}:entry:${++nextEntrySequence}`,
      position,
      routeRevision: revision,
    });

  const stampCurrentEntry = (href: string, entry: ManagedRouteEntry) => {
    if (!dependencies.platform.getHistoryState) return;
    dependencies.platform.syncRoute(href, {
      replace: true,
      dispatchPopState: false,
      state: mergeManagedRouteHistoryState(dependencies.platform.getHistoryState(), entry),
    });
  };

  const restoreCommittedBrowserEntry = (
    navigationType: BrowserNavigationType,
    targetEntry: ManagedRouteEntry | null,
  ) => {
    if (
      navigationType === "traverse"
      && targetEntry
      && lastCommittedEntry
      && targetEntry.runtimeSession === runtimeSession
      && lastCommittedEntry.runtimeSession === runtimeSession
      && targetEntry.entryKey !== lastCommittedEntry.entryKey
      && dependencies.platform.go
    ) {
      const delta = lastCommittedEntry.position - targetEntry.position;
      if (delta !== 0) {
        compensationTargetEntryKey = lastCommittedEntry.entryKey;
        dependencies.platform.go(delta);
        return;
      }
    }
    dependencies.platform.syncRoute(
      lastCommittedBrowserHref ?? dependencies.getRuntimeSnapshot().application.routePath,
      { replace: true, dispatchPopState: false },
    );
  };

  const persistActiveRoute = () => {
    const snapshot = dependencies.getRuntimeSnapshot();
    if (!snapshot.booted || !snapshot.loginServices.isAuthorised) return;
    const resolution = dependencies.resolveRoute(
      snapshot.application.routePath,
    );
    if (
      resolution.kind === "app" &&
      normalizeBundleIdentifier(resolution.app.bundleIdentifier) === normalizeBundleIdentifier(snapshot.application.activeAppId)
    ) {
      dependencies.platform.setSessionItem(lastActiveAppRouteKey, resolution.pathname);
    } else if (snapshot.application.routePath === "/") {
      dependencies.platform.removeSessionItem(lastActiveAppRouteKey);
    }
  };

  const waitForRuntimeRouteToSettle = (
    resolution: CoordinatedRouteResolution,
  ) => {
    const isSettled = () => {
      const snapshot = dependencies.getRuntimeSnapshot();
      if (
        snapshot.statechart.currentState === "active.error" ||
        snapshot.statechart.currentState === "active.application.failed"
      ) {
        return true;
      }
      if (!isRuntimeAtRoute(snapshot, resolution)) return false;
      if (snapshot.application.multiSwitch.status === "switching") return false;
      return resolution.kind === "webspring"
        ? snapshot.statechart.currentState === "active.webspring"
        : snapshot.statechart.currentState === "active.application.active";
    };

    if (isSettled()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let unsubscribe = () => {};
      const finish = () => {
        unsubscribe();
        cancelRouteSettlers.delete(finish);
        resolve();
      };
      unsubscribe = dependencies.subscribeRuntime(() => {
        if (isSettled()) finish();
      });
      cancelRouteSettlers.add(finish);
      if (isSettled()) finish();
    });
  };

  const waitForRuntimeToBecomeReady = (resolution: CoordinatedRouteResolution) => {
    if (isRuntimeReadyForRoute(dependencies.getRuntimeSnapshot(), resolution))
      return Promise.resolve();
    return new Promise<void>((resolve) => {
      let unsubscribe = () => {};
      const finish = () => {
        unsubscribe();
        cancelRouteSettlers.delete(finish);
        resolve();
      };
      unsubscribe = dependencies.subscribeRuntime(() => {
        if (isRuntimeReadyForRoute(dependencies.getRuntimeSnapshot(), resolution)) finish();
      });
      cancelRouteSettlers.add(finish);
      if (isRuntimeReadyForRoute(dependencies.getRuntimeSnapshot(), resolution)) finish();
    });
  };

  const handleRuntimeChange = () => {
    persistActiveRoute();
    const snapshot = dependencies.getRuntimeSnapshot();
    // A direct SDK/lifecycle close reconciles runtime presentation atomically,
    // without a route.open operation. Retire the closed app's browser entry
    // here too. Hosts whose "/" resolves to an application own their quit
    // surface instead; sending them home would relaunch the closed primary.
    const browserPath = dependencies.platform.getLocation().pathname;
    const browserRoute = dependencies.resolveRoute(browserPath);
    if (snapshot.application.activeAppId === null && snapshot.application.routePath === "/"
      && snapshot.statechart.currentState === "active.webspring"
      && browserRoute.kind === "app" && snapshot.lifecycle[normalizeBundleIdentifier(browserRoute.app.bundleIdentifier)] === "closed"
      && dependencies.resolveRoute("/").kind === "webspring") {
      initialHref = null;
      initialHrefDeferredForAuthorization = false;
      handleRuntimeRouteOpen({ browserHref: "/", syncRoute: true, historyMode: "replace" });
      return;
    }
    if (!initialHref || !snapshot.booted) return;
    let initialUrl: URL;
    try {
      initialUrl = new URL(initialHref, dependencies.platform.getLocation().origin);
    } catch {
      initialHref = null;
      return;
    }
    const initialResolution = dependencies.resolveRoute(initialUrl.pathname);
    if (
      initialResolution.kind !== "app" &&
      initialResolution.kind !== "webspring"
    ) {
      initialHref = null;
      initialHrefDeferredForAuthorization = false;
      return;
    }
    if (isRuntimeAtRoute(snapshot, initialResolution)) {
      initialHref = null;
      initialHrefDeferredForAuthorization = false;
      return;
    }
    const ready = isRuntimeReadyForRoute(snapshot, initialResolution);
    if (!ready) {
      if (routeRequiresLogin(initialResolution) && !snapshot.loginServices.isAuthorised) {
        initialHrefDeferredForAuthorization = true;
      }
      return;
    }
    if (
      initialResolution.kind === "app"
      && !initialHrefDeferredForAuthorization
      && snapshot.statechart.currentState === "active.webspring"
      && snapshot.application.activeAppId === null
    ) {
      // An authorised cold boot owns the initial route attempt. If it returns
      // to Webspring without activating an app, the canonical attempt already
      // terminated (for example, an entering guard blocked it). Replaying the
      // browser entry would run the guard twice and manufacture a second route
      // operation. Locked boots are tracked above and still resume once auth
      // becomes available.
      initialHref = null;
      return;
    }
    if (ready) {
      const href = initialHref;
      initialHref = null;
      initialHrefDeferredForAuthorization = false;
      void enqueueRuntimeRoute(href, "push").catch(() => undefined);
    }
  };

  function enqueueRuntimeRoute(
    href: string,
    navigationType: BrowserNavigationType,
    targetEntry: ManagedRouteEntry | null = null,
    browserSignal?: AbortSignal,
  ) {
    if (browserSignal?.aborted) return Promise.resolve();
    const epoch = routeEpoch;
    const intent = ++routeIntent;
    activeIntentController?.abort("browser-route-superseded");
    activeRouteHandle?.cancel("browser-route-superseded");
    activeRouteHandle = null;
    const intentController = new AbortController();
    activeIntentController = intentController;
    if (activePresentationSettlementId) {
      dependencies.cancelPresentationSettlement?.(activePresentationSettlementId, "browser-route-superseded");
      activePresentationSettlementId = null;
    }
    cancelRouteSettlers.forEach((cancel) => cancel());
    cancelRouteSettlers.clear();
    const isCurrentIntent = () => started && epoch === routeEpoch && intent === routeIntent && !intentController.signal.aborted;
    const abortBrowserIntent = () => {
      if (!isCurrentIntent()) return;
      intentController.abort("browser-navigation-aborted");
      activeRouteHandle?.cancel("browser-navigation-aborted");
      activeRouteHandle = null;
      if (activePresentationSettlementId) {
        dependencies.cancelPresentationSettlement?.(activePresentationSettlementId, "browser-navigation-aborted");
        activePresentationSettlementId = null;
      }
      cancelRouteSettlers.forEach(cancel => cancel());
      cancelRouteSettlers.clear();
    };
    browserSignal?.addEventListener("abort", abortBrowserIntent, { once: true });
    if (browserSignal?.aborted) abortBrowserIntent();
    // The owner controls deadlines. This observer only releases its own wait
    // when the browser intent stops, even if an adapter ignores cancellation.
    const awaitOwned = <T,>(promise: Promise<T>): Promise<{ value: T } | null> => new Promise((resolve, reject) => {
      let settled = false;
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
        intentController.signal.removeEventListener("abort", abort);
        complete();
      };
      const abort = () => finish(() => resolve(null));
      intentController.signal.addEventListener("abort", abort, { once: true });
      void promise.then(value => finish(() => resolve({ value })), error => finish(() => reject(error)));
      if (intentController.signal.aborted) abort();
    });
    const acceptBrowserEntry = (browserHref: string, redirected: boolean) => {
      if (targetEntry?.runtimeSession === runtimeSession) {
        routeRevision = Math.max(routeRevision, targetEntry.routeRevision);
        const entry = redirected
          ? createManagedRouteEntry({ ...targetEntry, routeRevision: ++routeRevision })
          : targetEntry;
        if (redirected) stampCurrentEntry(browserHref, entry);
        lastCommittedEntry = entry;
      } else if (
        dependencies.platform.getHistoryState
        && (navigationType === "push" || navigationType === "replace")
      ) {
        const entry = makeManagedEntry(
          navigationType === "replace"
            ? (lastCommittedEntry?.position ?? 0)
            : (lastCommittedEntry?.position ?? -1) + 1,
          ++routeRevision,
        );
        stampCurrentEntry(browserHref, entry);
        lastCommittedEntry = entry;
      } else if (redirected) {
        // A foreign traversal has no trusted position from which to invent a delta.
        dependencies.platform.syncRoute(browserHref, { replace: true, dispatchPopState: false });
        lastCommittedEntry = null;
      }
    };
    const transaction = (async () => {
      if (!isCurrentIntent()) return;
      let url: URL | null = null;
      try { url = new URL(href, dependencies.platform.getLocation().origin); }
      catch { /* Canonical openRoute owns malformed input and its typed failure. */ }
      let browserHref = url ? `${url.pathname}${url.search}${url.hash}` : href;
      let resolution = url ? dependencies.resolveRoute(url.pathname) : null;
      if (resolution && resolution.kind !== "app" && resolution.kind !== "webspring") return;
      if (resolution) await waitForRuntimeToBecomeReady(resolution);
      if (!isCurrentIntent()) return;
      const snapshot = dependencies.getRuntimeSnapshot();
      if (!resolution || !isRuntimeAtRoute(snapshot, resolution) || browserHref !== lastCommittedBrowserHref) {
        let routeHandle: unknown;
        try {
          routeHandle = dependencies.run(() => dependencies.openRoute(browserHref, {
            source: "route",
            syncRoute: false,
            signal: intentController.signal,
            context: { browserHref, browserNavigationType: navigationType },
          }), `browser navigation ${browserHref}`);
        } catch {
          if (isCurrentIntent()) restoreCommittedBrowserEntry(navigationType, targetEntry);
          return;
        }
        if (routeHandle && typeof routeHandle === "object" && "result" in routeHandle) {
          let ownedHandle = routeHandle as RuntimeOperationHandle<SynCloudOSOpenRouteResult>;
          const seen = new Set([ownedHandle.operationId]);
          let redirected = false;
          for (;;) {
            activeRouteHandle = ownedHandle;
            let observed: { value: Awaited<typeof ownedHandle.result> } | null;
            try { observed = await awaitOwned(ownedHandle.result); }
            catch {
              if (activeRouteHandle === ownedHandle) activeRouteHandle = null;
              if (isCurrentIntent()) restoreCommittedBrowserEntry(navigationType, targetEntry);
              return;
            }
            if (!observed || !isCurrentIntent()) return;
            const result = observed.value;
            const cause = result.status === "failed" && result.error.code === "route-redirect"
              ? result.error.cause : null;
            if (cause && typeof cause === "object"
              && "code" in cause && cause.code === "route-redirect"
              && "successorId" in cause && typeof cause.successorId === "string"
              && "href" in cause && typeof cause.href === "string") {
              // The canonical owner already started this operation. Never reopen
              // it or compensate the predecessor while the successor has authority.
              const successor = dependencies.getRedirectSuccessor?.(ownedHandle.operationId, cause.successorId);
              if (!isCurrentIntent()) return;
              if (!successor || successor.operationId !== cause.successorId
                || successor.correlationId !== ownedHandle.correlationId) {
                if (activeRouteHandle === ownedHandle) activeRouteHandle = null;
                throw new Error("Canonical route redirect successor is unavailable: " + cause.successorId);
              }
              if (seen.has(successor.operationId) || seen.size > 8) {
                successor.cancel("browser-route-redirect-cycle");
                if (activeRouteHandle === ownedHandle) activeRouteHandle = null;
                restoreCommittedBrowserEntry(navigationType, targetEntry);
                return;
              }
              let redirectUrl: URL;
              try { redirectUrl = new URL(cause.href, dependencies.platform.getLocation().origin); }
              catch { successor.cancel("browser-route-invalid-redirect"); return; }
              if (redirectUrl.origin !== dependencies.platform.getLocation().origin) {
                successor.cancel("browser-route-invalid-redirect"); return;
              }
              seen.add(successor.operationId);
              ownedHandle = successor;
              browserHref = `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
              resolution = dependencies.resolveRoute(redirectUrl.pathname);
              redirected = true;
              continue;
            }
            if (activeRouteHandle === ownedHandle) activeRouteHandle = null;
            if (result.status !== "completed" || !result.committed) {
              restoreCommittedBrowserEntry(navigationType, targetEntry);
              return;
            }
            lastCommittedBrowserHref = browserHref;
            acceptBrowserEntry(browserHref, redirected);
            if (result.value.presentationSettlementId) {
              const settlementId = result.value.presentationSettlementId;
              activePresentationSettlementId = settlementId;
              try { await awaitOwned(dependencies.waitForPresentationSettlement(settlementId)); }
              finally {
                if (activePresentationSettlementId === settlementId) activePresentationSettlementId = null;
              }
            }
            // The canonical result already joins committed data/render work.
            // Waiting for the predecessor's pathname here would never terminate.
            return;
          }
        }
      }
      if (!resolution || !isCurrentIntent()) return;
      // Legacy hosts returning void still use their semantic runtime observation.
      await waitForRuntimeRouteToSettle(resolution);
      if (!isCurrentIntent()) return;
      acceptBrowserEntry(browserHref, false);
    })();
    return transaction.finally(() => browserSignal?.removeEventListener("abort", abortBrowserIntent));
  }

  const handleNavigate = (event: BrowserNavigateEvent) => {
    if (
      dependencies.platform.isRouteSyncInProgress() ||
      !event.canIntercept ||
      event.navigationType === "reload" ||
      event.downloadRequest
    ) {
      return;
    }

    let currentUrl: URL;
    let destinationUrl: URL;
    try {
      currentUrl = new URL(dependencies.platform.getLocation().href);
      destinationUrl = new URL(event.destination.url, currentUrl);
    } catch {
      initialHref = null;
      event.intercept({
        handler: () => enqueueRuntimeRoute(event.destination.url, event.navigationType, null, event.signal),
        focusReset: "after-transition",
        scroll: "after-transition",
      });
      return;
    }
    if (destinationUrl.origin !== currentUrl.origin) return;
    if (isHashOnlyNavigation(event, currentUrl, destinationUrl)) return;
    const resolution = dependencies.resolveRoute(destinationUrl.pathname);
    if (resolution.kind !== "app" && resolution.kind !== "webspring") return;
    initialHref = null;
    initialHrefDeferredForAuthorization = false;
    const browserHref = `${destinationUrl.pathname}${destinationUrl.search}${destinationUrl.hash}`;
    const preservePresentationState = isQueryOnlyNavigation(currentUrl, destinationUrl);

    event.intercept({
      handler: () => enqueueRuntimeRoute(
        browserHref,
        event.navigationType,
        readManagedRouteEntry(event.destination.getState?.()),
        event.signal,
      ),
      focusReset: preservePresentationState ? "manual" : "after-transition",
      scroll: preservePresentationState ? "manual" : "after-transition",
    });
  };

  const handlePopState = (event: PopStateEvent) => {
    if (dependencies.platform.isRouteSyncInProgress()) return;
    const targetEntry = readManagedRouteEntry(event.state ?? dependencies.platform.getHistoryState?.());
    if (compensationTargetEntryKey && targetEntry?.entryKey === compensationTargetEntryKey) {
      compensationTargetEntryKey = null;
      return;
    }
    initialHref = null;
    initialHrefDeferredForAuthorization = false;
    void enqueueRuntimeRoute(getBrowserHref(dependencies.platform.getLocation()), "traverse", targetEntry).catch(() => undefined);
  };

  const handleRuntimeRouteOpen = (payload: {
    readonly browserHref: string;
    readonly syncRoute: boolean;
    readonly historyMode?: "push" | "replace";
  }) => {
    const previousCommittedBrowserHref = lastCommittedBrowserHref;
    if (!payload.syncRoute) {
      lastCommittedBrowserHref = payload.browserHref;
      return;
    }
    const currentHref = getBrowserHref(dependencies.platform.getLocation());
    const historyMode = payload.historyMode ?? "push";
    if (!dependencies.platform.getHistoryState) {
      if (currentHref !== payload.browserHref) {
        dependencies.platform.syncRoute(payload.browserHref, {
          replace: historyMode === "replace",
          dispatchPopState: true,
        });
      }
      lastCommittedBrowserHref = payload.browserHref;
      return;
    }
    routeRevision += 1;
    const selectedState = dependencies.platform.getHistoryState();
    const selectedEntry = readManagedRouteEntry(selectedState);
    const destinationAlreadySelected = currentHref === payload.browserHref;
    const committedHrefChanged = previousCommittedBrowserHref !== payload.browserHref;
    const explicitSameHrefPush = (
      payload.historyMode === "push"
      && destinationAlreadySelected
      && !committedHrefChanged
    );
    const reuseSelectedEntry = (
      selectedEntry?.runtimeSession === runtimeSession
      && (
        historyMode === "replace"
        || (destinationAlreadySelected && !committedHrefChanged && !explicitSameHrefPush)
      )
    );
    const entry = reuseSelectedEntry
      ? createManagedRouteEntry({
          runtimeSession,
          entryKey: selectedEntry!.entryKey,
          position: selectedEntry!.position,
          routeRevision,
        })
      : makeManagedEntry(
          selectedEntry?.runtimeSession === runtimeSession
            ? selectedEntry.position + 1
            : (lastCommittedEntry?.position ?? -1) + 1,
          routeRevision,
        );
    dependencies.platform.syncRoute(payload.browserHref, {
      replace: destinationAlreadySelected && !explicitSameHrefPush ? true : historyMode === "replace",
      dispatchPopState: destinationAlreadySelected && !explicitSameHrefPush ? false : true,
      state: mergeManagedRouteHistoryState(selectedState, entry),
    });
    lastCommittedBrowserHref = payload.browserHref;
    lastCommittedEntry = entry;
  };

  return {
    start() {
      if (started) return;
      routeEpoch += 1;
      started = true;
      const location = dependencies.platform.getLocation();
      const browserHref = getBrowserHref(location);
      lastCommittedBrowserHref = browserHref;
      const existingEntry = readManagedRouteEntry(dependencies.platform.getHistoryState?.());
      if (existingEntry?.runtimeSession === runtimeSession) {
        lastCommittedEntry = existingEntry;
        routeRevision = existingEntry.routeRevision;
      } else if (dependencies.platform.getHistoryState) {
        lastCommittedEntry = makeManagedEntry(0, 0);
        stampCurrentEntry(browserHref, lastCommittedEntry);
      }
      const initialResolution = dependencies.resolveRoute(
        location.pathname,
      );
      initialHref =
        initialResolution.kind === "app" ||
        initialResolution.kind === "webspring"
          ? browserHref
          : null;
      initialHrefDeferredForAuthorization = false;
      navigationTarget = dependencies.platform.getNavigationTarget() as BrowserNavigationTarget | null;
      if (navigationTarget)
        navigationTarget.addEventListener("navigate", handleNavigate);
      else unsubscribePopState = dependencies.platform.addPopStateListener(handlePopState);
      unsubscribeRuntime = dependencies.subscribeRuntime(handleRuntimeChange);
      unsubscribeRouteOpen = dependencies.subscribeRouteOpen(handleRuntimeRouteOpen);
      persistActiveRoute();
    },

    stop() {
      if (!started) return;
      started = false;
      routeEpoch += 1;
      activeIntentController?.abort("browser-route-coordinator-stopped");
      activeIntentController = null;
      activeRouteHandle?.cancel("browser-route-coordinator-stopped");
      activeRouteHandle = null;
      if (activePresentationSettlementId) {
        dependencies.cancelPresentationSettlement?.(activePresentationSettlementId, "browser-route-coordinator-stopped");
      }
      activePresentationSettlementId = null;
      if (navigationTarget)
        navigationTarget.removeEventListener("navigate", handleNavigate);
      else unsubscribePopState?.();
      unsubscribePopState = null;
      navigationTarget = null;
      unsubscribeRuntime?.();
      unsubscribeRuntime = null;
      unsubscribeRouteOpen?.();
      unsubscribeRouteOpen = null;
      cancelRouteSettlers.forEach((cancel) => cancel());
      cancelRouteSettlers.clear();
      routeIntent += 1;
      compensationTargetEntryKey = null;
      initialHref = null;
      initialHrefDeferredForAuthorization = false;
    },
  };
}
