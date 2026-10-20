/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AppRouteSession, AppRouteSessionSnapshot } from "../../Routing/appSdkRoutePort";
import { normalizeBundleIdentifier } from "../../Identity/bundleIdentifier.mjs";
import { isSynWareRouteGraph } from "../../Routing/appSdkRoutePort";
import type {
  SynCloudOSRouteInfo,
  SynWareRouteDefinition,
  SynWareRouteGraph,
} from "../../Routing/appSdkRoutePort";
import type { SynCloudOSRouteTransitionHandle, SynCloudOSRouteTransitionResult } from "../../Routing/appSdkRoutePort";
import type { AppNavigationClient } from "../appClientTypes";
import type { SynWareRouter, SynWareRouterPreloadOptions, SynWareRouterSnapshot } from "./useRouter";

export interface MountedSynWareRouterOptions<
  TRoutes extends readonly SynWareRouteDefinition[],
> {
  readonly graph: SynWareRouteGraph<TRoutes>;
  readonly mountedGraph: SynWareRouteGraph;
  readonly appId: string;
  readonly sessionId: string;
  readonly signal: AbortSignal;
  readonly session: AppRouteSession;
  getAuthoritySnapshot(): Readonly<{ operationId: string | null; authorizationGeneration: number }>;
  openRoute(href: string, options: Readonly<{ historyMode: "push" | "replace"; correlationId?: string; context?: Readonly<{ routeRetry: true }> }>): ReturnType<AppNavigationClient["openRoute"]>;
  preloadRoute(href: string, options: SynWareRouterPreloadOptions): Promise<unknown>;
}

function securityError(message: string): DOMException {
  return new DOMException(message, "SecurityError");
}

function shallowParamValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return false;
}

function snapshotProjection(snapshot: AppRouteSessionSnapshot): SynWareRouterSnapshot {
  return Object.freeze({
    revision: snapshot.revision,
    status: snapshot.status,
    route: snapshot.route,
  });
}

export function createMountedSynWareRouter<
  const TRoutes extends readonly SynWareRouteDefinition[],
>(options: MountedSynWareRouterOptions<TRoutes>): SynWareRouter<TRoutes> {
  if (!isSynWareRouteGraph(options.graph) || options.graph.routes !== options.mountedGraph.routes || normalizeBundleIdentifier(options.mountedGraph.appId) !== normalizeBundleIdentifier(options.appId)) {
    throw securityError("The requested router does not belong to this mounted route graph.");
  }
  let lastSnapshot = snapshotProjection(options.session.getSnapshot());
  let lastSource = options.session.getSnapshot();
  const graph = options.mountedGraph as SynWareRouteGraph<TRoutes>;
  let latestOperationId: string | null = null;

  const assertMutable = () => {
    if (options.signal.aborted) throw new DOMException("Mounted route authority has been revoked.", "InvalidStateError");
  };

  const navigate = (href: string, historyMode: "push" | "replace", correlationId?: string): SynCloudOSRouteTransitionHandle => {
    assertMutable();
    const route = graph.recognize(href);
    if (route.kind !== "match") throw new TypeError("The mounted route graph could not recognize its generated target.");
    const raw = options.openRoute(href, Object.freeze({ historyMode, ...(correlationId ? { correlationId } : {}) }));

    const wrap = (handle: ReturnType<AppNavigationClient["openRoute"]>): SynCloudOSRouteTransitionHandle => {
      latestOperationId = handle.operationId;
      const authorizationGeneration = options.getAuthoritySnapshot().authorizationGeneration;
      const result = handle.result.then((value): SynCloudOSRouteTransitionResult => {
        const base = { operationId: handle.operationId, correlationId: handle.correlationId, authorizationGeneration };
        switch (value.outcome) {
          case "settled":
            return Object.freeze({ ...base, outcome: "settled", committed: true, route, postCommit: "completed", routeRevision: options.session.getSnapshot().revision, sessionId: options.sessionId });
          case "route-error":
            return Object.freeze({ ...base, outcome: "route-error", committed: true, route, postCommit: "failed", code: value.code, reason: value.reason });
          case "presentation-timeout":
            return Object.freeze({ ...base, outcome: "presentation-timeout", committed: true, route, postCommit: "failed", pendingRoles: value.pendingRoles, reason: value.reason });
          case "blocked":
            return Object.freeze({ ...base, outcome: "blocked", committed: false, route, reason: value.reason });
          case "denied":
            return Object.freeze({ ...base, outcome: "denied", committed: false, route, code: value.code, reason: value.reason });
          case "invalid-query":
            return Object.freeze({ ...base, outcome: "invalid-query", committed: false, route, code: "route-invalid-query", reason: value.reason });
          case "redirected":
            return Object.freeze({ ...base, outcome: "redirected", committed: false, route, successorId: value.successorId });
          case "cancelled":
            return value.committed
              ? Object.freeze({ ...base, outcome: "cancelled", committed: true, route, postCommit: "cancelled", reason: value.reason })
              : Object.freeze({ ...base, outcome: "cancelled", committed: false, reason: value.reason });
          case "superseded":
            return Object.freeze({ ...base, outcome: "superseded", committed: false, reason: value.reason });
          case "not-found":
            return Object.freeze({ ...base, outcome: "not-found", committed: false, code: "route-not-found", reason: value.reason });
          case "failed":
            return Object.freeze({ ...base, outcome: "failed", committed: false, code: value.code, reason: value.reason });
        }
      });
      const assertRetry = () => {
        assertMutable();
        if (latestOperationId !== handle.operationId || options.getAuthoritySnapshot().operationId !== handle.operationId) throw new DOMException("Route retry was superseded.", "InvalidStateError");
      };
      return Object.freeze({
        operationId: handle.operationId,
        correlationId: handle.correlationId,
        signal: handle.signal,
        result,
        cancel: handle.cancel,
        retry() { assertRetry(); return wrap(handle.retry()); },
        replace(target: Parameters<SynCloudOSRouteTransitionHandle["replace"]>[0]) {
          assertRetry();
          return navigate(graph.urlFor(target as never), "replace", handle.correlationId);
        },
      });
    };
    return wrap(raw);
  };

  const router: SynWareRouter<TRoutes> = {
    transitionTo(target) {
      assertMutable();
      return navigate(graph.urlFor(target), "push");
    },
    replaceWith(target) {
      assertMutable();
      return navigate(graph.urlFor(target), "replace");
    },
    urlFor(target) {
      return graph.urlFor(target);
    },
    recognize(href) {
      return graph.recognize(href);
    },
    isActive(target, activeOptions = {}) {
      const current = options.signal.aborted ? lastSnapshot.route : options.session.getSnapshot().route;
      if (!current || current.graphId !== options.graph.id || normalizeBundleIdentifier(current.appId) !== normalizeBundleIdentifier(options.appId)) return false;
      const targetRecognition = graph.recognize(graph.urlFor(target));
      if (targetRecognition.kind !== "match") return false;
      if (activeOptions.exact ? current.name !== targetRecognition.name : !current.branch.includes(targetRecognition.name)) return false;
      for (const [key, value] of Object.entries(targetRecognition.params)) {
        if (!shallowParamValueEqual(current.params[key], value)) return false;
      }
      const requestedQuery = (target as Readonly<{ query?: Readonly<Record<string, unknown>> }>).query;
      if (requestedQuery) {
        for (const key of Object.keys(requestedQuery)) {
          if (!shallowParamValueEqual(current.query[key], targetRecognition.query[key])) return false;
        }
      }
      return true;
    },
    preload(target, preloadOptions = {}) {
      try {
        assertMutable();
      } catch (error) {
        return Promise.reject(error);
      }
      return options.preloadRoute(graph.urlFor(target), preloadOptions);
    },
    getSnapshot() {
      if (!options.signal.aborted) {
        const source = options.session.getSnapshot();
        if (source !== lastSource) { lastSource = source; lastSnapshot = snapshotProjection(source); }
      }
      return lastSnapshot;
    },
    subscribe(listener) {
      if (options.signal.aborted) return () => undefined;
      let active = true;
      const unsubscribeSession = options.session.subscribe(() => {
        if (!active || options.signal.aborted) return;
        lastSource = options.session.getSnapshot();
        lastSnapshot = snapshotProjection(lastSource);
        listener();
      });
      const onAbort = () => {
        if (!active) return;
        active = false;
        unsubscribeSession();
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      return () => {
        if (!active) return;
        active = false;
        options.signal.removeEventListener("abort", onAbort);
        unsubscribeSession();
      };
    },
  };
  return Object.freeze(router);
}
