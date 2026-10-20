import type { SynWareContextValue } from "./appContextTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { SynWareNamedRouteTarget, SynWareRouteDefinition, SynWareRouteGraph, SynWareRouteNames, SynWareRouteQueryForName } from "../Routing/appRouteTypes";
import { createMountedSynWareRouter } from "./hooks/mountedSynWareRouter";
import type { SynWareRouterSnapshot } from "./hooks/useRouter";
import { createMountedSynWareRouteState, type SynWareRouteStateClient } from "./hooks/useRouteState";
import { createSynWareFontAccess, runtimeFontCatalogue, type SynWareFontAccess, type SynWareFontCatalogue } from "./fontAccess";
import type { NSEMenuRuntimePort } from "../../NSE/Menus";
import { createSynWareMenuRuntime } from "./SynWareNSEMenuPort";

export interface SCOSRoutes {
  state<const TRoutes extends readonly SynWareRouteDefinition[], const TName extends SynWareRouteNames<TRoutes>>(graph: SynWareRouteGraph<TRoutes>, name: TName): SynWareRouteStateClient<SynWareRouteQueryForName<TRoutes, TName>>;
  isActive<const TRoutes extends readonly SynWareRouteDefinition[], const TName extends SynWareRouteNames<TRoutes>>(graph: SynWareRouteGraph<TRoutes>, target: SynWareNamedRouteTarget<TRoutes, TName>, options?: Readonly<{ exact?: boolean }>): boolean;
  subscribe(listener: () => void): () => void;
}
interface ControllerServices {
  readonly routes: SCOSRoutes;
  readonly fonts: SynWareFontAccess;
  readonly menus: Readonly<{ runtime: NSEMenuRuntimePort }>;
}
const services = new WeakMap<AbortSignal, ControllerServices>();

/** Internal composition: retains only scoped public clients on the returned projections. */
export function installControllerServices(context: SynWareContextValue, runtime: SynCloudOSRuntime, catalogue?: SynWareFontCatalogue): void {
  const fonts = runtimeFontCatalogue(runtime, catalogue);
  let route = runtime.routes.routeGraph.current();
  let snapshot: SynWareRouterSnapshot = Object.freeze({ revision: 0, status: route ? "ready" : "idle", route });
  const session = {
    getSnapshot(): SynWareRouterSnapshot {
      const next = runtime.routes.routeGraph.current();
      if (next !== route) { route = next; snapshot = Object.freeze({ revision: snapshot.revision + 1, status: route ? "ready" : "idle", route }); }
      return snapshot;
    },
    subscribe(listener: () => void) {
      if (context.signal.aborted) return () => {};
      const remove = runtime.store.subscribe(listener);
      context.signal.addEventListener("abort", remove, { once: true });
      return () => { context.signal.removeEventListener("abort", remove); remove(); };
    },
  };
  const routerFor = <const TRoutes extends readonly SynWareRouteDefinition[]>(graph: SynWareRouteGraph<TRoutes>) => {
    const mountedGraph = runtime.bundles.getLoadedBundle(context.appId)?.definition.routes;
    if (!mountedGraph) throw new DOMException("The application has no route graph.", "InvalidStateError");
    return createMountedSynWareRouter({ graph, mountedGraph, appId: context.appId, sessionId: context.sessionId, signal: context.signal, session,
      getAuthoritySnapshot: () => ({ operationId: runtime.routes.getCurrentOperationId(), authorizationGeneration: runtime.routes.routeGraph.getAuthorizationGeneration() }),
      openRoute: context.navigation.openRoute,
      preloadRoute: (href, options) => runtime.routes.routeGraph.preload(context.appId, href, options.signal ? AbortSignal.any([context.signal, options.signal]) : context.signal, options),
    });
  };
  const routes = Object.freeze<SCOSRoutes>({
    state(graph, name) { return createMountedSynWareRouteState(graph, name, routerFor(graph), href => new URL(href, runtime.environment.browser.getLocation().origin).href); },
    isActive(graph, target, options) { return routerFor(graph).isActive(target, options); },
    subscribe: session.subscribe,
  });
  const menu = createSynWareMenuRuntime(context);
  services.set(context.signal, Object.freeze({ routes, fonts: createSynWareFontAccess(fonts, context.textLayout, context.signal), menus: Object.freeze({ runtime: menu }) }));
}

export function controllerServicesFor(context: SynWareContextValue): ControllerServices {
  const value = services.get(context.signal);
  if (!value) throw new DOMException("Controller services require a running application.", "InvalidStateError");
  return value;
}
