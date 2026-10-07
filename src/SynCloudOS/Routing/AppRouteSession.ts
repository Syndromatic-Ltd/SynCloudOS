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

import type {
  SynCloudOSRouteInfo,
  SynWareRouteDefinition,
  SynWareRouteGraph,
  SynWareRouteLoadContext,
} from "./appRouteTypes";
import { QueryValidationError } from "./routeQuery";

export type AppRouteNodeSnapshot =
  | Readonly<{ state: "loading"; routeName: string; revision: number }>
  | Readonly<{ state: "ready"; routeName: string; revision: number; data: unknown }>
  | Readonly<{ state: "error"; routeName: string; revision: number; code: string; error: unknown }>;

export interface AppRouteSessionSnapshot {
  readonly revision: number;
  readonly status: "idle" | "loading" | "ready" | "error" | "disposed";
  readonly route: SynCloudOSRouteInfo | null;
  readonly nodes: Readonly<Record<string, AppRouteNodeSnapshot>>;
}

export interface AppRouteSession {
  commit(
    route: SynCloudOSRouteInfo,
    request: Readonly<{ operationId: string; signal?: AbortSignal }>,
  ): Promise<AppRouteLoadResult>;
  retry(routeName?: string): Promise<AppRouteLoadResult | null>;
  getDefinition(routeName: string): SynWareRouteDefinition | null;
  getSnapshot(): AppRouteSessionSnapshot;
  subscribe(listener: () => void): () => void;
  /** Host-private finite cleanup already owned by this session, or null if idle. */
  getCleanupReceipt(): Promise<void> | null;
  dispose(): void;
  /** Revoke synchronously, then join bounded cleanup without changing React cleanup's return type. */
  disposeAsync(): Promise<void>;
}

export type AppRouteLoadResult =
  | Readonly<{ status: "ready"; committed: true; revision: number; route: SynCloudOSRouteInfo }>
  | Readonly<{ status: "stale"; committed: true; revision: number; route: SynCloudOSRouteInfo }>
  | Readonly<{ status: "error"; committed: true; revision: number; route: SynCloudOSRouteInfo; code: string; error: unknown }>;

interface CachedRouteData {
  readonly key: string;
  readonly data: unknown;
  readonly definition: SynWareRouteDefinition;
  readonly context: SynWareRouteLoadContext;
}

class RouteDataTimeoutError extends Error {
  readonly code = "route-data-timeout";
  constructor(timeoutMs: number) {
    super(`Route data did not settle within ${timeoutMs}ms.`);
    this.name = "RouteDataTimeoutError";
  }
}

class RouteLoadCancelledError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AbortError";
  }
}

export interface AppRouteSessionOptions {
  readonly graph: SynWareRouteGraph;
  getBundleGeneration(): number;
  getAuthorizationGeneration(): number;
  getSessionId(): string;
  /** Host authority events revoke pending work even when a loader never settles. */
  subscribeAuthorityChanges?(listener: () => void): () => void;
  /** Cleanup cannot replace an already reported load/cancellation error. */
  onCleanupError?(error: unknown): void;
  createLoaderServices(context: Readonly<{
    signal: AbortSignal;
    route: SynCloudOSRouteInfo;
    operationId: string;
    routeRevision: number;
  }>): SynWareRouteLoadContext["services"];
  resolveRouteDefinition?(
    definition: SynWareRouteDefinition,
    signal: AbortSignal,
  ): SynWareRouteDefinition | Promise<SynWareRouteDefinition>;
  readonly routeDataTimeoutMs: number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

function parameterNames(path: string | undefined): readonly string[] {
  if (!path) return Object.freeze([]);
  return Object.freeze(path.split("/").flatMap((segment) => {
    if (segment.startsWith(":") || segment.startsWith("*")) return [segment.slice(1)];
    return [];
  }));
}

function branchDefinitions(graph: SynWareRouteGraph, route: SynCloudOSRouteInfo): SynWareRouteDefinition[] {
  return route.branch.map((name) => {
    const definition = graph.getRoute(name);
    if (!definition) throw new Error(`Route definition ${name} is unavailable.`);
    return definition;
  });
}

function cacheKey(
  definition: SynWareRouteDefinition,
  inheritedParameterNames: readonly string[],
  refreshQueryNames: readonly string[],
  route: SynCloudOSRouteInfo,
): string {
  const names = [...inheritedParameterNames, ...parameterNames(definition.path)];
  const params = Object.fromEntries(names.map((name) => [name, route.params[name]]));
  const query = Object.fromEntries(refreshQueryNames.map((name) => [name, route.query[name]]));
  return JSON.stringify([definition.name, params, query]);
}

function isDisposable(value: unknown): value is { dispose(): void | Promise<void> } {
  return Boolean(value && typeof value === "object" && typeof (value as { dispose?: unknown }).dispose === "function");
}

export function createAppRouteSession(options: AppRouteSessionOptions): AppRouteSession {
  const listeners = new Set<() => void>();
  const cache = new Map<string, CachedRouteData>();
  const resolvedDefinitions = new Map<string, SynWareRouteDefinition>();
  const disposedValues = new WeakMap<object, Promise<void>>();
  const deactivationHooks = new WeakMap<CachedRouteData, Promise<void>>();
  const deactivatedEntries = new WeakMap<CachedRouteData, Promise<void>>();
  const pendingCleanup = new Set<Promise<void>>();
  let disposed = false;
  let revision = 0;
  let activeController: AbortController | null = null;
  let activeCommit: Promise<AppRouteLoadResult> | null = null;
  let revokedCleanup: Promise<void> | null = null;
  let cleanupReceiptSources: readonly Promise<unknown>[] = Object.freeze([]);
  let cleanupReceipt: Promise<void> | null = null;
  let removeAuthorityObserver = () => {};
  let snapshot: AppRouteSessionSnapshot = Object.freeze({
    revision: 0,
    status: "idle",
    route: null,
    nodes: Object.freeze({}),
  });

  const publish = (
    status: AppRouteSessionSnapshot["status"],
    route: SynCloudOSRouteInfo | null,
    nodes: Readonly<Record<string, AppRouteNodeSnapshot>>,
    nextRevision = revision,
  ) => {
    snapshot = Object.freeze({
      revision: nextRevision,
      status,
      route,
      nodes: Object.freeze({ ...nodes }),
    });
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Observers cannot interrupt ownership cleanup. */ }
    }
  };

  const disposeValue = (value: unknown) => {
    if (!isDisposable(value)) return Promise.resolve();
    const object = value as object;
    const previous = disposedValues.get(object);
    if (previous) return previous;
    // Publish ownership before invoking application code, including reentrant dispose().
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const done = new Promise<void>((accept, deny) => { resolve = accept; reject = deny; });
    disposedValues.set(object, done);
    try { Promise.resolve(value.dispose()).then(resolve, reject); } catch (error) { reject(error); }
    return done;
  };
  const reportCleanupError = (error: unknown) => {
    try { options.onCleanupError?.(error); } catch { /* Diagnostic observers cannot retain resources. */ }
  };

  const fenceMatches = (captured: {
    revision: number;
    sessionId: string;
    bundleGeneration: number;
    authorizationGeneration: number;
  }) => (
    !disposed
    && revision === captured.revision
    && options.getSessionId() === captured.sessionId
    && options.getBundleGeneration() === captured.bundleGeneration
    && options.getAuthorizationGeneration() === captured.authorizationGeneration
  );

  const waitFor = async <T,>(
    raw: Promise<T>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<T> => {
    // Observe rejections even if the caller was revoked before attaching its race.
    void raw.catch(() => undefined);
    if (signal?.aborted) throw signal.reason ?? new RouteLoadCancelledError("route-load-cancelled");
    let timeoutHandle: unknown = null;
    let removeAbort: () => void = () => {};
    const cancellation = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(signal?.reason ?? new RouteLoadCancelledError("route-load-cancelled"));
      signal?.addEventListener("abort", onAbort, { once: true });
      removeAbort = () => signal?.removeEventListener("abort", onAbort);
    });
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = options.setTimeout(
        () => reject(new RouteDataTimeoutError(timeoutMs)),
        Math.max(0, timeoutMs),
      );
    });
    try {
      return await Promise.race([raw, cancellation, timeout]);
    } finally {
      removeAbort();
      if (timeoutHandle !== null) options.clearTimeout(timeoutHandle);
    }
  };

  const ownCleanup = (receipt: Promise<void>) => {
    pendingCleanup.add(receipt);
    void receipt.then(() => pendingCleanup.delete(receipt), () => pendingCleanup.delete(receipt));
    return receipt;
  };
  const cleanupValue = (value: unknown): Promise<void> => {
    if (!isDisposable(value) || [...cache.values()].some(entry => entry.data === value)) return Promise.resolve();
    return ownCleanup(waitFor(disposeValue(value), undefined, options.routeDataTimeoutMs));
  };
  const runDeactivationHook = (
    entry: CachedRouteData,
    context: SynWareRouteLoadContext,
    signal?: AbortSignal,
    onFailure?: (error: unknown) => void,
  ): Promise<void> => {
    const previous = deactivationHooks.get(entry);
    if (previous) return previous;
    const done = Promise.resolve().then(async () => {
      if (!entry.definition.deactivate) return;
      try {
        await waitFor(Promise.resolve(entry.definition.deactivate(context)), signal, options.routeDataTimeoutMs);
      } catch (error) {
        onFailure?.(error);
        throw error;
      }
    });
    deactivationHooks.set(entry, done);
    return done;
  };
  const deactivate = (
    entry: CachedRouteData,
    context: SynWareRouteLoadContext,
    signal?: AbortSignal,
    onFailure?: (error: unknown) => void,
  ): Promise<void> => {
    const previous = deactivatedEntries.get(entry);
    if (previous) return previous;
    // Queue application invocation only after the once-only receipt is installed.
    const done = Promise.resolve().then(async () => {
      try {
        await runDeactivationHook(entry, context, signal, onFailure);
      } catch (error) {
        // Revoke failing hook authority before waiting for a possibly async disposer.
        await cleanupValue(entry.data).catch(reportCleanupError);
        throw error;
      }
      await cleanupValue(entry.data);
    });
    deactivatedEntries.set(entry, done);
    return ownCleanup(done);
  };
  const releaseCached = () => {
    const entries = [...cache.values()].reverse();
    cache.clear(); resolvedDefinitions.clear();
    if (!entries.length) return;
    // Emergency revocation uses only already-minted, now-aborted contexts. It never creates authority.
    // Keep the receipt on this session so its owning commit can join real cleanup.
    const previous = revokedCleanup;
    const done = (async () => {
      if (previous) await previous;
      for (const entry of entries) await deactivate(entry, entry.context).catch(reportCleanupError);
    })();
    revokedCleanup = done;
    void done.then(() => { if (revokedCleanup === done) revokedCleanup = null; });
  };
  const joinRevokedCleanup = async () => {
    while (revokedCleanup) await revokedCleanup;
  };
  const authority = () => JSON.stringify([options.getSessionId(), options.getBundleGeneration(), options.getAuthorizationGeneration()]);
  let knownAuthority = authority();
  const checkAuthority = () => {
    const next = authority();
    if (next === knownAuthority || disposed) return;
    knownAuthority = next;
    activeController?.abort(new RouteLoadCancelledError("route-authority-changed"));
    releaseCached();
    publish("idle", null, {});
  };

  const performCommit = async (
    route: SynCloudOSRouteInfo,
    request: Readonly<{ operationId: string; signal?: AbortSignal }>,
    previous: Promise<AppRouteLoadResult> | null,
  ): Promise<AppRouteLoadResult> => {
    if (disposed || request.signal?.aborted) {
      return Object.freeze({
        status: "stale" as const,
        committed: true as const,
        revision,
        route,
      });
    }
    checkAuthority();
    activeController?.abort(new RouteLoadCancelledError("route-load-superseded"));
    const controller = new AbortController();
    activeController = controller;
    const signal = request.signal
      ? AbortSignal.any([controller.signal, request.signal])
      : controller.signal;
    const currentRevision = ++revision;
    const captured = Object.freeze({
      revision: currentRevision,
      sessionId: options.getSessionId(),
      bundleGeneration: options.getBundleGeneration(),
      authorizationGeneration: options.getAuthorizationGeneration(),
    });
    // Supersession aborts first, then joins the previous operation's bounded
    // cleanup before this operation may acquire services or enter route nodes.
    if (previous) await previous.catch(() => undefined);
    if (revokedCleanup) await joinRevokedCleanup();
    if (!fenceMatches(captured) || signal.aborted) {
      checkAuthority();
      return Object.freeze({ status: "stale", committed: true, revision: currentRevision, route });
    }
    const definitions = branchDefinitions(options.graph, route);
    const nodes: Record<string, AppRouteNodeSnapshot> = {};
    let parentData: unknown = undefined;
    let inheritedNames: string[] = [];
    let inheritedRefreshQueryNames: string[] = [];
    const authorityKey = JSON.stringify([captured.sessionId, captured.bundleGeneration, captured.authorizationGeneration]);
    // Seed only unchanged, authorized ancestors before publishing a pending
    // revision. Emptying the tree here remounts persistent players and forms
    // whenever module resolution yields, even when their data is cached.
    let seedNames: string[] = [];
    let seedQuery: string[] = [];
    for (const definition of definitions) {
      seedQuery = [...seedQuery, ...Object.entries(definition.query ?? {}).filter(([, codec]) => codec.refresh === "route").map(([name]) => name)];
      const key = authorityKey + cacheKey(definition, seedNames, seedQuery, route);
      seedNames = [...seedNames, ...parameterNames(definition.path)];
      const cached = cache.get(definition.name);
      if (cached?.key !== key) break;
      nodes[definition.name] = Object.freeze({ state: "ready", routeName: definition.name, revision: currentRevision, data: cached.data });
    }
    const targetDefinitions = new Map(definitions.map(definition => [definition.name, definition] as const));
    const targetNames = new Set(targetDefinitions.keys());
    const mayRetainReplacementPresentation = (name: string) => {
      const definition = targetDefinitions.get(name);
      return !options.resolveRouteDefinition
        && Boolean(definition?.loadingComponent)
        && !(definition?.children?.length);
    };
    const exiting = [...cache.entries()].filter(([name]) => !nodes[name]).reverse();
    const replacements = new Map<string, CachedRouteData>();
    for (const [name, entry] of exiting) {
      if (targetNames.has(name)) {
        replacements.set(name, entry);
        if (mayRetainReplacementPresentation(name)) {
          nodes[name] = Object.freeze({ state: "ready", routeName: name, revision: currentRevision, data: entry.data });
        }
      } else {
        cache.delete(name);
        resolvedDefinitions.delete(name);
      }
    }
    publish("loading", route, nodes, currentRevision);


    let exitError: unknown;
    let exitScopeFailed = false;
    let exitFailed = false;
    let exitWasStale = false;
    for (const [name, entry] of exiting) {
      const replacement = replacements.get(name) === entry;
      let staleAtHookFailure: boolean | undefined;
      try {
        if (!fenceMatches(captured) || signal.aborted) {
          if (replacement) {
            await ownCleanup(runDeactivationHook(entry, entry.context));
          } else {
            await deactivate(entry, entry.context);
          }
          continue;
        }
        let exitServices: SynWareRouteLoadContext["services"];
        try {
          exitServices = options.createLoaderServices({ signal, route: entry.context.route, operationId: request.operationId, routeRevision: currentRevision });
        } catch (error) {
          exitScopeFailed = true;
          await deactivate(entry, entry.context).catch(reportCleanupError);
          throw error;
        }
        const exitContext = Object.freeze({ ...entry.context, signal, services: exitServices });
        const onFailure = (error: unknown) => {
          staleAtHookFailure = signal.aborted || !fenceMatches(captured);
          controller.abort(error);
        };
        if (replacement) {
          await ownCleanup(runDeactivationHook(entry, exitContext, signal, onFailure));
        } else {
          await deactivate(entry, exitContext, signal, onFailure);
        }
      } catch (error) {
        if (replacement) {
          if (cache.get(name) === entry) cache.delete(name);
          resolvedDefinitions.delete(name);
          await cleanupValue(entry.data).catch(reportCleanupError);
        }
        if (!exitFailed) {
          exitError = error;
          exitWasStale = staleAtHookFailure ?? (signal.aborted || !fenceMatches(captured));
          exitFailed = true;
        }
        controller.abort(error);
      }
    }
    if (exitFailed) {
      const stale = exitWasStale || !fenceMatches(captured);
      if (stale) {
        checkAuthority();
        return Object.freeze({ status: "stale", committed: true, revision: currentRevision, route });
      }
      const code = exitError instanceof RouteDataTimeoutError ? exitError.code : exitScopeFailed ? "route-load-failed" : "route-deactivate-failed";
      const routeName = route.branch[0] ?? route.name;
      nodes[routeName] = Object.freeze({ state: "error", routeName, revision: currentRevision, code, error: exitError });
      publish("error", route, nodes, currentRevision);
      return Object.freeze({ status: "error", committed: true, revision: currentRevision, route, code, error: exitError });
    }

    if (!fenceMatches(captured) || signal.aborted) {
      checkAuthority();
      return Object.freeze({ status: "stale", committed: true, revision: currentRevision, route });
    }
    if (route.queryStatus === "invalid") {
      const error = new QueryValidationError(route.queryIssues ?? Object.freeze([]));
      const routeName = route.branch[0] ?? route.name;
      nodes[routeName] = Object.freeze({
        state: "error" as const,
        routeName,
        revision: currentRevision,
        code: "route-invalid-query",
        error,
      });
      publish("error", route, nodes, currentRevision);
      return Object.freeze({
        status: "error" as const,
        committed: true as const,
        revision: currentRevision,
        route,
        code: "route-invalid-query",
        error,
      });
    }


    let services: SynWareRouteLoadContext["services"];
    try {
      services = options.createLoaderServices({ signal, route, operationId: request.operationId, routeRevision: currentRevision });
    } catch (error) {
      controller.abort(error);
      const routeName = route.branch[0] ?? route.name;
      nodes[routeName] = Object.freeze({ state: "error", routeName, revision: currentRevision, code: "route-load-failed", error });
      publish("error", route, nodes, currentRevision);
      return Object.freeze({ status: "error", committed: true, revision: currentRevision, route, code: "route-load-failed", error });
    }

    for (const staticDefinition of definitions) {
      if (!fenceMatches(captured) || signal.aborted) {
        checkAuthority();
        return Object.freeze({ status: "stale" as const, committed: true as const, revision: currentRevision, route });
      }
      let definition = staticDefinition;
      if (options.resolveRouteDefinition) {
        nodes[staticDefinition.name] ??= Object.freeze({
          state: "loading" as const,
          routeName: staticDefinition.name,
          revision: currentRevision,
        });
        publish("loading", route, nodes, currentRevision);
        try {
          definition = await waitFor(
            Promise.resolve(options.resolveRouteDefinition(staticDefinition, signal)),
            signal,
            options.routeDataTimeoutMs,
          );
          if (!fenceMatches(captured) || signal.aborted) {
            checkAuthority();
            return Object.freeze({ status: "stale", committed: true, revision: currentRevision, route });
          }
        } catch (error) {
          const replacement = replacements.get(staticDefinition.name);
          if (replacement && cache.get(staticDefinition.name) === replacement) {
            cache.delete(staticDefinition.name);
            resolvedDefinitions.delete(staticDefinition.name);
            await cleanupValue(replacement.data).catch(reportCleanupError);
          }
          if (error instanceof RouteLoadCancelledError || signal.aborted || !fenceMatches(captured)) {
            checkAuthority();
            return Object.freeze({ status: "stale" as const, committed: true as const, revision: currentRevision, route });
          }
          const code = error instanceof RouteDataTimeoutError ? error.code : "route-module-load-failed";
          controller.abort(error);
          nodes[staticDefinition.name] = Object.freeze({
            state: "error" as const,
            routeName: staticDefinition.name,
            revision: currentRevision,
            code,
            error,
          });
          publish("error", route, nodes, currentRevision);
          return Object.freeze({
            status: "error" as const,
            committed: true as const,
            revision: currentRevision,
            route,
            code,
            error,
          });
        }
      }
      resolvedDefinitions.set(staticDefinition.name, definition);
      const ownRefreshQueryNames = Object.entries(definition.query ?? {})
        .filter(([, codec]) => codec.refresh === "route")
        .map(([name]) => name);
      const refreshQueryNames = [...inheritedRefreshQueryNames, ...ownRefreshQueryNames];
      const key = authorityKey + cacheKey(definition, inheritedNames, refreshQueryNames, route);
      inheritedNames = [...inheritedNames, ...parameterNames(definition.path)];
      inheritedRefreshQueryNames = refreshQueryNames;
      const cached = cache.get(definition.name);
      if (cached?.key === key) {
        parentData = cached.data;
        nodes[definition.name] = Object.freeze({
          state: "ready" as const,
          routeName: definition.name,
          revision: currentRevision,
          data: cached.data,
        });
        continue;
      }
      const retainPreviousPresentation = Boolean(
        cached
        && cached.key !== key
        && mayRetainReplacementPresentation(definition.name),
      );
      if (!retainPreviousPresentation) {
        nodes[definition.name] = Object.freeze({
          state: "loading" as const,
          routeName: definition.name,
          revision: currentRevision,
        });
      }
      publish("loading", route, nodes, currentRevision);
      const context: SynWareRouteLoadContext = Object.freeze({
        signal,
        params: route.params,
        query: route.query,
        parentData,
        route,
        services,
      });
      if (!definition.load && !definition.afterLoad && !definition.activate) {
        if (cached) {
          if (cache.get(definition.name) === cached) cache.delete(definition.name);
          await cleanupValue(cached.data);
        }
        cache.set(definition.name, Object.freeze({ key, data: undefined, definition, context }));
        parentData = undefined;
        nodes[definition.name] = Object.freeze({
          state: "ready" as const,
          routeName: definition.name,
          revision: currentRevision,
          data: undefined,
        });
        publish("loading", route, nodes, currentRevision);
        continue;
      }
      let data: unknown;
      let acquired = false;
      let entry: CachedRouteData | undefined;
      let abandoned = false;
      let failureCode = "route-load-failed";
      try {
        const rawPromise = Promise.resolve(definition.load ? definition.load(context) : undefined);
        rawPromise.then((lateValue) => {
          if (abandoned || !fenceMatches(captured) || signal.aborted) void cleanupValue(lateValue).catch(reportCleanupError);
        }, () => undefined);
        data = await waitFor(rawPromise, signal, options.routeDataTimeoutMs);
        acquired = true;
        if (!fenceMatches(captured) || signal.aborted) {
          throw new RouteLoadCancelledError("route-load-stale");
        }
        if (definition.afterLoad) {
          await waitFor(
            Promise.resolve(definition.afterLoad(context, data)),
            signal,
            options.routeDataTimeoutMs,
          );
          if (!fenceMatches(captured) || signal.aborted) {
            throw new RouteLoadCancelledError("route-load-stale");
          }
        }
        entry = Object.freeze({ key, data, definition, context });
        if (definition.activate) {
          failureCode = "route-activate-failed";
          await waitFor(Promise.resolve(definition.activate(context)), signal, options.routeDataTimeoutMs);
          if (!fenceMatches(captured) || signal.aborted) throw new RouteLoadCancelledError("route-activation-stale");
        }
        if (cached && cached.data !== data) {
          if (cache.get(definition.name) === cached) cache.delete(definition.name);
          await cleanupValue(cached.data);
        }
        if (!fenceMatches(captured) || signal.aborted) throw new RouteLoadCancelledError("route-load-stale");
        cache.set(definition.name, entry);
        parentData = data;
        nodes[definition.name] = Object.freeze({
          state: "ready" as const,
          routeName: definition.name,
          revision: currentRevision,
          data,
        });
        publish("loading", route, nodes, currentRevision);
      } catch (error) {
        const stale = error instanceof RouteLoadCancelledError || signal.aborted || !fenceMatches(captured);
        abandoned = true;
        controller.abort(error);
        if (entry) await deactivate(entry, context).catch(reportCleanupError);
        else if (acquired) await cleanupValue(data).catch(reportCleanupError);
        if (cached && cache.get(definition.name) === cached) {
          cache.delete(definition.name);
          resolvedDefinitions.delete(definition.name);
          await cleanupValue(cached.data).catch(reportCleanupError);
        }
        checkAuthority();
        if (stale || !fenceMatches(captured)) {
          return Object.freeze({ status: "stale" as const, committed: true as const, revision: currentRevision, route });
        }
        const code = error instanceof RouteDataTimeoutError ? error.code : failureCode;
        nodes[definition.name] = Object.freeze({
          state: "error" as const,
          routeName: definition.name,
          revision: currentRevision,
          code,
          error,
        });
        publish("error", route, nodes, currentRevision);
        return Object.freeze({
          status: "error" as const,
          committed: true as const,
          revision: currentRevision,
          route,
          code,
          error,
        });
      }
    }

    if (!fenceMatches(captured) || signal.aborted) {
      checkAuthority();
      return Object.freeze({ status: "stale" as const, committed: true as const, revision: currentRevision, route });
    }
    publish("ready", route, nodes, currentRevision);
    return Object.freeze({
      status: "ready" as const,
      committed: true as const,
      revision: currentRevision,
      route,
    });
  };

  const commit: AppRouteSession["commit"] = (route, request) => {
    if (disposed || request.signal?.aborted) return performCommit(route, request, null);
    const previous = activeCommit;
    let resolve!: (result: AppRouteLoadResult) => void;
    let reject!: (error: unknown) => void;
    const done = new Promise<AppRouteLoadResult>((accept, deny) => { resolve = accept; reject = deny; });
    // Install the receipt before calling application hooks, which can reenter.
    activeCommit = done;
    const execute = async () => {
      try { return await performCommit(route, request, previous); }
      finally {
        if (revokedCleanup) await joinRevokedCleanup();
        if (activeCommit === done) activeCommit = null;
      }
    };
    void execute().then(resolve, reject);
    return done;
  };

  const getCleanupReceipt = (): Promise<void> | null => {
    const receipts: Promise<unknown>[] = [...pendingCleanup];
    if (revokedCleanup && !receipts.includes(revokedCleanup)) receipts.push(revokedCleanup);
    // An aborted commit may still be unwinding an acquired value that has not
    // reached cleanupValue yet. Join that existing owner, not its foreign loader.
    if (activeCommit && (disposed || activeController?.signal.aborted) && !receipts.includes(activeCommit)) receipts.push(activeCommit);
    if (!receipts.length) {
      cleanupReceiptSources = Object.freeze([]);
      cleanupReceipt = null;
      return null;
    }
    if (
      cleanupReceipt
      && receipts.length === cleanupReceiptSources.length
      && receipts.every((receipt, index) => receipt === cleanupReceiptSources[index])
    ) return cleanupReceipt;
    const sources = Object.freeze([...receipts]);
    const aggregate = Promise.allSettled(sources).then(() => undefined);
    cleanupReceiptSources = sources;
    cleanupReceipt = aggregate;
    void aggregate.then(() => {
      if (cleanupReceipt !== aggregate) return;
      cleanupReceiptSources = Object.freeze([]);
      cleanupReceipt = null;
    });
    return aggregate;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    activeController?.abort(new RouteLoadCancelledError("route-session-disposed"));
    activeController = null;
    removeAuthorityObserver();
    releaseCached();
    listeners.clear();
    publish("disposed", snapshot.route, snapshot.nodes, revision);
  };

  removeAuthorityObserver = options.subscribeAuthorityChanges?.(checkAuthority) ?? (() => {});
  checkAuthority();

  return Object.freeze({
    commit,
    retry(routeName?: string) {
      const current = snapshot.route;
      if (!current || disposed) return Promise.resolve(null);
      if (routeName && !current.branch.includes(routeName)) return Promise.resolve(null);
      return commit(current, { operationId: `route.retry:${revision + 1}` });
    },
    getDefinition(routeName: string) {
      return resolvedDefinitions.get(routeName) ?? options.graph.getRoute(routeName);
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener: () => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCleanupReceipt,
    dispose,
    async disposeAsync() {
      dispose();
      const receipt = getCleanupReceipt();
      if (receipt) await receipt;
    },
  });
}
