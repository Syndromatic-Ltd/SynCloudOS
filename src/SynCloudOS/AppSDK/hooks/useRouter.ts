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

import { useMemo } from "react";
import type {
  SynWareNamedRouteTarget,
  SynWareRouteDefinition,
  SynWareRouteGraph,
  SynWareRouteNames,
  SynWareRouteRecognition,
  SynCloudOSRouteInfo,
} from "../../Routing/appSdkRoutePort";
import { useRoutePresentation } from "../RouteOutlet";
import { useSCOS } from "../scos/useSCOS"
import type { SynCloudOSRouteTransitionHandle } from "../../Routing/appSdkRoutePort";
import { createMountedSynWareRouter } from "./mountedSynWareRouter";

export interface SynWareRouterSnapshot {
  readonly revision: number;
  readonly status: "idle" | "loading" | "ready" | "error" | "disposed";
  readonly route: SynCloudOSRouteInfo | null;
}

export interface SynWareRouterPreloadOptions {
  readonly data?: boolean;
  readonly signal?: AbortSignal;
}

export interface SynWareRouter<
  TRoutes extends readonly SynWareRouteDefinition[] = readonly SynWareRouteDefinition[],
> {
  transitionTo<TName extends SynWareRouteNames<TRoutes>>(target: SynWareNamedRouteTarget<TRoutes, TName>): SynCloudOSRouteTransitionHandle;
  replaceWith<TName extends SynWareRouteNames<TRoutes>>(target: SynWareNamedRouteTarget<TRoutes, TName>): SynCloudOSRouteTransitionHandle;
  urlFor<TName extends SynWareRouteNames<TRoutes>>(target: SynWareNamedRouteTarget<TRoutes, TName>): string;
  recognize(href: string): SynWareRouteRecognition;
  isActive<TName extends SynWareRouteNames<TRoutes>>(
    target: SynWareNamedRouteTarget<TRoutes, TName>,
    options?: Readonly<{ exact?: boolean }>,
  ): boolean;
  preload<TName extends SynWareRouteNames<TRoutes>>(
    target: SynWareNamedRouteTarget<TRoutes, TName>,
    options?: SynWareRouterPreloadOptions,
  ): Promise<unknown>;
  getSnapshot(): SynWareRouterSnapshot;
  subscribe(listener: () => void): () => void;
}

export function useRouter<
  const TRoutes extends readonly SynWareRouteDefinition[],
>(graph?: SynWareRouteGraph<TRoutes>): SynWareRouter<TRoutes> {
  const app = useSCOS();
  const presentation = useRoutePresentation();
  const selectedGraph = (graph ?? presentation.graph) as SynWareRouteGraph<TRoutes>;
  return useMemo(() => createMountedSynWareRouter({
    graph: selectedGraph,
    mountedGraph: presentation.graph,
    appId: app.app.id,
    sessionId: app.sessionId,
    signal: app.signal,
    session: presentation.session,
    getAuthoritySnapshot: () => {
      if (!presentation.authority) throw new DOMException("Mounted routing authority is unavailable.", "InvalidStateError");
      return presentation.authority();
    },
    openRoute(href, options) {
      return app.navigation.openRoute(href, options);
    },
    preloadRoute: (href, options) => presentation.preload ? presentation.preload(href, options) : Promise.reject(new DOMException("Route preloading requires a mounted host.", "InvalidStateError")),
  }), [app.app.id, app.sessionId, app.navigation, app.signal, presentation, selectedGraph]);
}
