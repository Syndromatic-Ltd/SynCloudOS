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

import { normalizeRoutePath } from "../SynCloudOS";
import type {
  RuntimeBrowserPort,
  RuntimeBrowserRouteSyncOptions,
  RuntimeBrowserRouteSyncResult,
  RuntimeBrowserRouteSynchronizationPort,
} from "../Runtime/runtimeInstanceTypes";

export type SynCloudOSBrowserRouteSyncOptions = RuntimeBrowserRouteSyncOptions;
export type SynCloudOSBrowserRouteSyncResult = RuntimeBrowserRouteSyncResult;
export type SynCloudOSBrowserRouteSynchronizer = RuntimeBrowserRouteSynchronizationPort;

/**
 * Route history is a capability of a runtime environment, not a process-wide
 * browser singleton. Keeping the sync depth beside the injected environment
 * prevents one runtime from suppressing another runtime's traversal.
 */
export function createSynCloudOSBrowserRouteSynchronizer(
  browser: Pick<RuntimeBrowserPort, "getWindow" | "getLocation">,
): SynCloudOSBrowserRouteSynchronizer {
  let syncDepth = 0;
  return {
    isSyncInProgress() {
      return syncDepth > 0;
    },
    syncRoute(href, options = {}) {
      const host = browser.getWindow();
      const location = browser.getLocation();
      if (!host) {
        return { requestedHref: href, browserHref: href, pathname: href, changed: false, replaced: false, dispatchedPopState: false };
      }
      const normalized = normalizeRoutePath(href, { baseOrigin: location.origin });
      if (normalized.matchMode !== "path" || !normalized.routeableInternally) {
        return {
          requestedHref: href,
          browserHref: href,
          pathname: normalized.pathname,
          changed: false,
          replaced: false,
          dispatchedPopState: false,
        };
      }
      const browserHref = normalized.href;
      const currentHref = `${location.pathname}${location.search}${location.hash}`;
      const replace = options.replace ?? false;
      const dispatchPopState = options.dispatchPopState ?? true;
      const historyState = options.state === undefined ? host.history.state : options.state;
      if (currentHref === browserHref) {
        if (options.state !== undefined) {
          syncDepth += 1;
          try {
            if (replace) host.history.replaceState(options.state, "", browserHref);
            else host.history.pushState(options.state, "", browserHref);
            if (dispatchPopState) {
              const EventConstructor = (host as Window & { PopStateEvent?: typeof PopStateEvent }).PopStateEvent;
              host.dispatchEvent(EventConstructor
                ? new EventConstructor("popstate", { state: options.state ?? null })
                : ({ type: "popstate", state: options.state ?? null } as unknown as Event));
            }
          } finally {
            syncDepth -= 1;
          }
          return {
            requestedHref: href,
            browserHref,
            pathname: normalized.pathname,
            changed: !replace,
            replaced: replace,
            dispatchedPopState: dispatchPopState,
          };
        }
        return { requestedHref: href, browserHref, pathname: normalized.pathname, changed: false, replaced: false, dispatchedPopState: false };
      }
      syncDepth += 1;
      try {
        if (replace) host.history.replaceState(historyState, "", browserHref);
        else host.history.pushState(historyState, "", browserHref);
        if (dispatchPopState) {
          const EventConstructor = (host as Window & { PopStateEvent?: typeof PopStateEvent }).PopStateEvent;
          host.dispatchEvent(EventConstructor
            ? new EventConstructor("popstate", { state: historyState ?? null })
            : ({ type: "popstate", state: historyState ?? null } as unknown as Event));
        }
      } finally {
        syncDepth -= 1;
      }
      return { requestedHref: href, browserHref, pathname: normalized.pathname, changed: true, replaced: replace, dispatchedPopState: dispatchPopState };
    },
  };
}
