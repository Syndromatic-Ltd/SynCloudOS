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
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { SynCloudOSRouteInfo, SynWareRouteGraph, SynWareRouteLoadContext } from "./appRouteTypes";
import { createRouteModuleLoader, type RouteModuleLoader } from "./RouteModuleLoader";
import { createRouteServiceScope } from "./RouteServiceScope";
import { isAuthenticSynWareServiceToken } from "../AppSDK/runtimeContracts";

export class RuntimeRouteGuardError extends Error {
  readonly code = "route-guard-blocked";
  constructor(readonly reason: string) { super(reason); this.name = "RuntimeRouteGuardError"; }
}

export class RuntimeRouteRedirect extends Error {
  readonly code = "route-redirect";
  constructor(readonly href: string) { super("Route redirected to " + href); this.name = "RuntimeRouteRedirect"; }
}

class RuntimeRouteQueryError extends TypeError {
  readonly code = "route-invalid-query";
  constructor(message: string) { super(message); this.name = "RuntimeRouteQueryError"; }
}

class RuntimeRouteNotFoundError extends Error {
  readonly code = "route-not-found";
  constructor(message = "Route was not found in the application graph.") { super(message); this.name = "RuntimeRouteNotFoundError"; }
}

/** Executable route preparation inside the canonical route.open operation.
 * This owner has no operation scheduler, history writer or application lifecycle. */
export function createRuntimeRouteGraphOwner(runtime: SynCloudOSRuntime, preparationTimeoutMs = 5000) {
  const modules = new Map<string, { graph: SynWareRouteGraph; loader: RouteModuleLoader }>();
  let current: { graph: SynWareRouteGraph; route: SynCloudOSRouteInfo } | null = null;
  const getAuthorizationGeneration = () => runtime.identity.session.getRevision();

  const graphFor = (appId: string) => runtime.bundles.getLoadedBundle(appId)?.definition.routes ?? null;
  const loaderFor = (appId: string, graph: SynWareRouteGraph) => {
    const existing = modules.get(normalizeBundleIdentifier(appId));
    if (existing?.graph === graph) return existing.loader;
    const bundle = runtime.bundles.getBundle(appId);
    const loader = createRouteModuleLoader({
      getBundleGeneration: () => runtime.bundles.getBundle(appId) === bundle ? 0 : 1,
      isOwnerLive: () => !runtime.signal.aborted,
    });
    modules.set(normalizeBundleIdentifier(appId), { graph, loader });
    return loader;
  };
  // An unregistered application's graph and route-module loader are
  // released: late loads are fenced by invalidation, and the map no longer
  // keeps definitions or module promises reachable. Browser module residency
  // is outside framework control; the active route authority (`current`) is
  // left to the route manager.
  const releaseApplication = (appId: string) => {
    const entry = modules.get(normalizeBundleIdentifier(appId));
    if (!entry) return;
    modules.delete(normalizeBundleIdentifier(appId));
    entry.loader.invalidate();
  };
  const removeUnregisterRelease = runtime.events.subscribe("bundle.unregister", (event) => {
    const appId = (event.payload as { readonly appId?: unknown } | null)?.appId;
    if (typeof appId === "string") releaseApplication(appId);
  });

  const awaitWithSignal = <T>(value: T | Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Route work was revoked.", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(value).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });

  return {
    getAuthorizationGeneration,
    current: () => current?.route ?? null,
    async prepare(appId: string | null, href: string, signal: AbortSignal, programmatic: boolean, retry = false) {
      const graph = appId ? graphFor(appId) : null;
      const recognized = graph?.recognize(href);
      if (recognized?.kind === "match" && recognized.queryStatus === "invalid" && programmatic) {
        throw new RuntimeRouteQueryError("Invalid route query: " + recognized.queryIssues?.map(issue => issue.message).join("; "));
      }
      const destination = graph && recognized?.kind === "match" ? { graph, route: recognized } : null;
      if (graph && !destination) throw new RuntimeRouteNotFoundError();
      const from = current;
      let common = 0;
      if (!retry && from && destination?.graph === from.graph) {
        while (common < from.route.branch.length && common < destination.route.branch.length && from.route.branch[common] === destination.route.branch[common]) {
          const definition = destination.graph.getRoute(destination.route.branch[common])!;
          const params = (definition.path ?? "").split("/").filter(part => part.startsWith(":") || part.startsWith("*")).map(part => part.slice(1));
          if (params.some(name => JSON.stringify(from.route.params[name]) !== JSON.stringify(destination.route.params[name]))) break;
          if (Object.keys(definition.query ?? {}).some(name => JSON.stringify(from.route.query[name]) !== JSON.stringify(destination.route.query[name]))) break;
          common++;
        }
      }
      const scope = new AbortController();
      const guardSignal = AbortSignal.any([signal, scope.signal]);
      const authorizationGeneration = getAuthorizationGeneration();
      const bundles = new Map([appId, from?.route.appId].filter((id): id is string => Boolean(id)).map(id => [normalizeBundleIdentifier(id), runtime.bundles.getBundle(id)]));
      const assertCurrent = () => {
        signal.throwIfAborted();
        if (getAuthorizationGeneration() !== authorizationGeneration) throw new DOMException("Route authorization changed during preparation.", "SecurityError");
        for (const [id, bundle] of bundles) if (runtime.bundles.getBundle(id) !== bundle) throw new DOMException("Route bundle was replaced during preparation.", "AbortError");
      };
      const recheckAuthority = () => {
        try { assertCurrent(); } catch (error) { scope.abort(error); }
      };
      const removeIdentity = runtime.identity.session.subscribe(recheckAuthority);
      const removeUpdate = runtime.events.subscribe("bundle.update", recheckAuthority);
      const removeUnregister = runtime.events.subscribe("bundle.unregister", recheckAuthority);
      const deadline = runtime.environment.setTimeout(() => scope.abort(new DOMException("Route preparation timed out.", "TimeoutError")), Math.max(0, preparationTimeoutMs));
      // Detach from foreign guards that ignore cancellation; the canonical
      // operation remains the only transaction and result owner.
      const awaitGuard = <T>(value: T | Promise<T>): Promise<T> => new Promise((resolve, reject) => {
        const abort = () => reject(guardSignal.reason);
        if (guardSignal.aborted) { abort(); return; }
        guardSignal.addEventListener("abort", abort, { once: true });
        Promise.resolve(value).then(resolve, reject).finally(() => guardSignal.removeEventListener("abort", abort));
      });
      try {
        recheckAuthority();
        const steps = [
          ...(from ? from.route.branch.slice(common).reverse().map(name => ({ ...from, name, phase: "beforeLeave" as const })) : []),
          ...(destination ? destination.route.branch.slice(common).map(name => ({ ...destination, name, phase: "beforeEnter" as const })) : []),
        ];
        for (const step of steps) {
          guardSignal.throwIfAborted();
          const definition = step.graph.getRoute(step.name)!;
          const resolved = await loaderFor(step.route.appId!, step.graph).resolveDefinition(definition, { signal: guardSignal });
          guardSignal.throwIfAborted();
          if (step.phase === "beforeEnter" && resolved.redirect) throw new RuntimeRouteRedirect(step.graph.urlFor(resolved.redirect as never));
          const services = createRouteServiceScope(runtime, step.route.appId!, guardSignal, "route-preparation");
          const context: SynWareRouteLoadContext = Object.freeze({ signal: guardSignal, route: step.route,
            params: step.route.params, query: step.route.query, parentData: undefined, services });
          const decision = await awaitGuard(resolved[step.phase]?.(context));
          guardSignal.throwIfAborted();
          assertCurrent();
          if (decision?.outcome === "block") throw new RuntimeRouteGuardError(decision.reason ?? "route-guard-blocked");
          if (decision?.outcome === "redirect") throw new RuntimeRouteRedirect(step.graph.urlFor(decision.target as never));
        }
        assertCurrent();
        return Object.freeze({ destination, assertCurrent });
      } finally {
        runtime.environment.clearTimeout(deadline);
        removeIdentity(); removeUpdate(); removeUnregister();
        scope.abort("route-preparation-complete");
      }
    },
    commit(destination: { graph: SynWareRouteGraph; route: SynCloudOSRouteInfo } | null) { current = destination; },
    resolveDefinition(appId: string, definition: Parameters<RouteModuleLoader["resolveDefinition"]>[0], signal: AbortSignal) {
      const graph = graphFor(appId);
      if (!graph || graph.getRoute(definition.name) !== definition) throw new DOMException("Route module graph was replaced.", "AbortError");
      return loaderFor(appId, graph).resolveDefinition(definition, { signal });
    },
    invalidateModules(appId: string) { modules.get(normalizeBundleIdentifier(appId))?.loader.invalidate(); },
    diagnostics() { return Object.freeze({ retainedApplications: modules.size }); },
    async preload(appId: string, href: string, signal: AbortSignal, options: Readonly<{ data?: boolean }> = {}) {
      const graph = graphFor(appId);
      const route = graph?.recognize(href);
      if (!graph || route?.kind !== "match") throw new RuntimeRouteNotFoundError();
      const moduleLoader = loaderFor(appId, graph);
      const definitions = [];
      for (const name of route.branch) {
        const declared = graph.getRoute(name)!;
        await moduleLoader.preload(declared, { signal });
        definitions.push(await moduleLoader.resolveDefinition(declared, { signal }));
      }
      if (!options.data) return Object.freeze({ status: "ready" as const, dataPrefetched: false as const });

      // Validate the full branch before issuing a single data request so a
      // partially declared child cannot cause parent prefetch side effects.
      for (const definition of definitions) {
        if (!definition.load) continue;
        const declaration = definition.preload?.data;
        if (!declaration) {
          throw new DOMException(`Route ${definition.name} did not opt into read-only data prefetch.`, "SecurityError");
        }
        if (declaration.services.some((token) => !isAuthenticSynWareServiceToken(token))) {
          throw new DOMException(`Route ${definition.name} declared an unauthentic read-service token.`, "SecurityError");
        }
      }

      const lease = new AbortController();
      const prefetchSignal = AbortSignal.any([signal, lease.signal, runtime.signal]);
      const authorizationGeneration = getAuthorizationGeneration();
      const bundle = runtime.bundles.getBundle(appId);
      const assertCurrent = () => {
        prefetchSignal.throwIfAborted();
        if (getAuthorizationGeneration() !== authorizationGeneration) {
          throw new DOMException("Route prefetch authorization changed.", "SecurityError");
        }
        if (runtime.bundles.getBundle(appId) !== bundle || graphFor(appId) !== graph) {
          throw new DOMException("Route prefetch bundle was replaced.", "AbortError");
        }
      };
      const recheckAuthority = () => {
        try { assertCurrent(); } catch (error) { lease.abort(error); }
      };
      const removeIdentity = runtime.identity.session.subscribe(recheckAuthority);
      const removeUpdate = runtime.events.subscribe("bundle.update", recheckAuthority);
      const removeUnregister = runtime.events.subscribe("bundle.unregister", recheckAuthority);
      const deadline = runtime.environment.setTimeout(
        () => lease.abort(new DOMException("Route data prefetch timed out.", "TimeoutError")),
        Math.max(0, preparationTimeoutMs),
      );
      try {
        assertCurrent();
        let parentData: unknown = undefined;
        for (const definition of definitions) {
          if (!definition.load) continue;
          const allowedTokens = definition.preload!.data!.services;
          const services = createRouteServiceScope(runtime, appId, prefetchSignal, "route-preparation", { allowedTokens });
          const context: SynWareRouteLoadContext = Object.freeze({
            signal: prefetchSignal,
            params: route.params,
            query: route.query,
            parentData,
            route,
            services,
          });
          parentData = await awaitWithSignal(definition.load(context), prefetchSignal);
          assertCurrent();
        }
        return Object.freeze({ status: "ready" as const, dataPrefetched: true as const });
      } finally {
        runtime.environment.clearTimeout(deadline);
        removeIdentity(); removeUpdate(); removeUnregister();
        lease.abort(new DOMException("Route data prefetch authority has been revoked.", "AbortError"));
      }
    },
    dispose() {
      removeUnregisterRelease();
      for (const entry of modules.values()) entry.loader.invalidate();
      modules.clear();
      current = null;
    },
  };
}
