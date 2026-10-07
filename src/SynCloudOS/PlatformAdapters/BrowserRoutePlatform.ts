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

import type { BrowserNavigationTarget, SynCloudOSRuntimeEnvironment } from "../Runtime/runtimeInstanceTypes";
import type { SynCloudOSBrowserRouteSyncOptions } from "./BrowserRouteSync";

export interface BrowserRouteLocationSnapshot {
  readonly href: string;
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

export interface BrowserRoutePlatform {
  getLocation(): BrowserRouteLocationSnapshot;
  getNavigationTarget(): BrowserNavigationTarget | null;
  addPopStateListener(listener: (event: PopStateEvent) => void): () => void;
  getSessionItem(key: string): string | null;
  setSessionItem(key: string, value: string): void;
  removeSessionItem(key: string): void;
  getHistoryState?(): unknown;
  go?(delta: number): void;
  isRouteSyncInProgress(): boolean;
  syncRoute(href: string, options?: SynCloudOSBrowserRouteSyncOptions): unknown;
}

export interface BrowserRoutePlatformOptions {
  readonly deploymentBasePath?: string;
}

type BrowserNavigateEventLike = Event & {
  readonly signal?: AbortSignal;
  readonly canIntercept?: boolean;
  readonly destination?: {
    readonly url?: string;
    readonly getState?: () => unknown;
  };
  readonly downloadRequest?: string | null;
  readonly hashChange?: boolean;
  readonly navigationType?: "push" | "replace" | "reload" | "traverse";
  readonly intercept?: (options: unknown) => void;
};

function normalizeDeploymentBasePath(input: string | undefined) {
  if (input === undefined || input === "/") return "/";
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\") || input.includes("?") || input.includes("#")) {
    throw new TypeError("deploymentBasePath must be a root-relative pathname without query or fragment state.");
  }
  const base = input.replace(/\/+$/u, "");
  if (!base || base.includes("//")) throw new TypeError("deploymentBasePath must contain canonical path segments.");
  for (const segment of base.split("/").slice(1)) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); }
    catch { throw new TypeError("deploymentBasePath contains malformed percent encoding."); }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new TypeError("deploymentBasePath contains an unsafe path segment.");
    }
  }
  return base;
}

function projectPathname(pathname: string, deploymentBasePath: string) {
  if (deploymentBasePath === "/") return { pathname, insideBase: true };
  if (pathname === deploymentBasePath || pathname === `${deploymentBasePath}/`) {
    return { pathname: "/", insideBase: true };
  }
  if (pathname.startsWith(`${deploymentBasePath}/`)) {
    return { pathname: pathname.slice(deploymentBasePath.length), insideBase: true };
  }
  return { pathname, insideBase: false };
}

function projectBrowserHref(href: string, origin: string, deploymentBasePath: string) {
  let url: URL;
  try { url = new URL(href, origin); }
  catch { return { href, insideBase: false }; }
  if (url.origin !== origin) return { href: url.href, insideBase: false };
  const projected = projectPathname(url.pathname, deploymentBasePath);
  if (!projected.insideBase) return { href: url.href, insideBase: false };
  return {
    href: `${origin}${projected.pathname}${url.search}${url.hash}`,
    insideBase: true,
  };
}

function restoreDeploymentBase(href: string, origin: string, deploymentBasePath: string) {
  if (deploymentBasePath === "/") return href;
  let url: URL;
  try { url = new URL(href, origin); }
  catch { return href; }
  if (url.origin !== origin) return href;
  const pathname = url.pathname === "/"
    ? `${deploymentBasePath}/`
    : `${deploymentBasePath}${url.pathname}`;
  return `${pathname}${url.search}${url.hash}`;
}

function createProjectedNavigationTarget(
  target: BrowserNavigationTarget,
  getOrigin: () => string,
  deploymentBasePath: string,
): BrowserNavigationTarget {
  const listeners = new Map<(event: Event) => void, (event: Event) => void>();
  return {
    addEventListener(type, listener) {
      const wrapped = (event: Event) => {
        const source = event as BrowserNavigateEventLike;
        const destinationUrl = source.destination?.url;
        if (typeof destinationUrl !== "string") {
          listener(event);
          return;
        }
        const projected = projectBrowserHref(destinationUrl, getOrigin(), deploymentBasePath);
        const projectedEvent = {
          type: event.type,
          signal: source.signal,
          canIntercept: source.canIntercept === true && projected.insideBase,
          destination: {
            ...source.destination,
            url: projected.href,
            ...(source.destination?.getState
              ? { getState: source.destination.getState.bind(source.destination) }
              : {}),
          },
          downloadRequest: source.downloadRequest ?? null,
          hashChange: source.hashChange,
          navigationType: source.navigationType,
          intercept: source.intercept ? source.intercept.bind(source) : undefined,
        } as unknown as Event;
        listener(projectedEvent);
      };
      listeners.set(listener, wrapped);
      target.addEventListener(type, wrapped);
    },
    removeEventListener(type, listener) {
      const wrapped = listeners.get(listener);
      if (!wrapped) return;
      listeners.delete(listener);
      target.removeEventListener(type, wrapped);
    },
  };
}

export function createBrowserRoutePlatform(
  environment: SynCloudOSRuntimeEnvironment,
  options: BrowserRoutePlatformOptions = {},
): BrowserRoutePlatform {
  const deploymentBasePath = normalizeDeploymentBasePath(options.deploymentBasePath);
  let projectedNavigation: BrowserNavigationTarget | null | undefined;
  return {
    getLocation() {
      const location = environment.browser.getLocation();
      const projected = projectPathname(location.pathname, deploymentBasePath);
      if (!projected.insideBase) return location;
      return {
        ...location,
        href: `${location.origin}${projected.pathname}${location.search}${location.hash}`,
        pathname: projected.pathname,
      };
    },
    getNavigationTarget() {
      if (deploymentBasePath === "/") return environment.navigation;
      if (projectedNavigation !== undefined) return projectedNavigation;
      const target = environment.navigation;
      projectedNavigation = target
        ? createProjectedNavigationTarget(target, () => environment.browser.getLocation().origin, deploymentBasePath)
        : null;
      return projectedNavigation;
    },
    addPopStateListener(listener) {
      return environment.addWindowListener("popstate", listener);
    },
    getSessionItem(key) {
      return environment.sessionStorage?.getItem(key) ?? null;
    },
    setSessionItem(key, value) {
      environment.sessionStorage?.setItem(key, value);
    },
    removeSessionItem(key) {
      environment.sessionStorage?.removeItem(key);
    },
    getHistoryState() {
      return environment.browser.getWindow()?.history.state ?? null;
    },
    go(delta) {
      environment.browser.getWindow()?.history.go(delta);
    },
    isRouteSyncInProgress: () => environment.routeSynchronization.isSyncInProgress(),
    syncRoute: (href, syncOptions) => environment.routeSynchronization.syncRoute(
      restoreDeploymentBase(href, environment.browser.getLocation().origin, deploymentBasePath),
      syncOptions,
    ),
  };
}
