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

import { useMemo, useSyncExternalStore } from "react";
import { useRoutePresentation } from "../RouteOutlet";
import type { SynWareRouteDefinition, SynWareRouteGraph, SynWareRouteNames } from "../../Routing/appSdkRoutePort";
import { isSynWareRouteGraph } from "../../Routing/appSdkRoutePort";

/** Public data-state projection; the session snapshot remains host-private. */
type SynWareRouteDataSnapshot =
  | Readonly<{ state: "loading"; routeName: string; revision: number }>
  | Readonly<{ state: "ready"; routeName: string; revision: number; data: unknown }>
  | Readonly<{ state: "error"; routeName: string; revision: number; code: string; error: unknown }>;

export function useRouteData<const TRoutes extends readonly SynWareRouteDefinition[]>(
  graph: SynWareRouteGraph<TRoutes>,
  name: SynWareRouteNames<TRoutes>,
): SynWareRouteDataSnapshot | null {
  const presentation = useRoutePresentation();
  if (!isSynWareRouteGraph(graph) || presentation.graph.routes !== graph.routes) {
    throw new DOMException("The supplied route graph is not owned by this mounted SynWare.", "SecurityError");
  }
  const snapshot = useSyncExternalStore(
    presentation.session.subscribe,
    presentation.session.getSnapshot,
    presentation.session.getSnapshot,
  );
  return useMemo(() => {
    const node = snapshot.nodes[name];
    if (node) return node;
    // The committed branch is pending during ordered cleanup, before its
    // loader starts. Project that state without caching already released data.
    if (snapshot.status === "loading" && snapshot.route?.branch.includes(name)) {
      return Object.freeze({ state: "loading" as const, routeName: name, revision: snapshot.revision });
    }
    return null;
  }, [name, snapshot]);
}
