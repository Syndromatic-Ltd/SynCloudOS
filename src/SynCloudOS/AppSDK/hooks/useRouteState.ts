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
import { QueryValidationError } from "../../Routing/appSdkRoutePort";
import type { SynWareRouteDefinition, SynWareRouteGraph, SynWareRouteNames, SynWareRouteQueryForName, SynCloudOSRouteTransitionHandle } from "../../Routing/appSdkRoutePort";
import { useRouter, type SynWareRouter } from "./useRouter";
import { useRoutePresentation } from "../RouteOutlet";

export interface SynWareRouteStateClient<TQuery> {
  getQuery(): Readonly<TQuery>;
  pushQuery(query: Partial<TQuery>): SynCloudOSRouteTransitionHandle;
  replaceQuery(query: Partial<TQuery>): SynCloudOSRouteTransitionHandle;
  createUrl(query?: Partial<TQuery>): string;
  subscribe(listener: () => void): () => void;
}

function branchFor(routes: readonly SynWareRouteDefinition[], name: string): readonly SynWareRouteDefinition[] | null {
  for (const route of routes) {
    if (route.name === name) return [route];
    const child = branchFor(route.children ?? [], name);
    if (child) return [route, ...child];
  }
  return null;
}

/** Query projection and mutation use the mounted router's committed snapshot
 * and operation, with no independent URL listener or state store. */
export function createMountedSynWareRouteState<
  const TRoutes extends readonly SynWareRouteDefinition[],
  const TName extends SynWareRouteNames<TRoutes>,
>(graph: SynWareRouteGraph<TRoutes>, name: TName, router: SynWareRouter<TRoutes>, absoluteUrl: (href: string) => string): SynWareRouteStateClient<SynWareRouteQueryForName<TRoutes, TName>> {
  type Query = SynWareRouteQueryForName<TRoutes, TName>;
  const branch = branchFor(graph.routes, name);
  if (!branch) throw new TypeError(`Unknown route query owner ${name}.`);
  const schema = Object.assign({}, ...branch.map(route => route.query ?? {}));
  const defaults = Object.freeze(Object.fromEntries(Object.entries(schema).map(([key, codec]) => [key, (codec as { defaultValue: unknown }).defaultValue])));
  let source: object | null = null;
  let query = defaults as Readonly<Query>;
  const target = (value: Partial<Query> = {}) => {
    const route = router.getSnapshot().route;
    if (!route?.branch.includes(name)) throw new DOMException("Query changes require an active route owner.", "InvalidStateError");
    for (const key of Object.keys(value)) if (!(key in schema)) throw new TypeError(`Unknown query key ${key}.`);
    const next = { ...route.query };
    for (const key of Object.keys(schema)) delete next[key];
    Object.assign(next, value);
    return { name: route.name, params: route.params, query: next, hash: route.hash };
  };
  return Object.freeze({
    getQuery() {
      const route = router.getSnapshot().route;
      if (route === source) return query;
      if (!route?.branch.includes(name)) { source = route; query = defaults as Readonly<Query>; return query; }
      if (route.queryStatus === "invalid") throw new QueryValidationError(route.queryIssues ?? []);
      query = Object.freeze(Object.fromEntries(Object.keys(schema).map(key => [key, route.query[key] ?? defaults[key]]))) as Readonly<Query>;
      source = route;
      return query;
    },
    pushQuery(value: Partial<Query>) { return router.transitionTo(target(value) as never); },
    replaceQuery(value: Partial<Query>) { return router.replaceWith(target(value) as never); },
    createUrl(value?: Partial<Query>) { return absoluteUrl(router.urlFor(target(value) as never)); },
    subscribe: router.subscribe,
  });
}

export function useRouteState<const TRoutes extends readonly SynWareRouteDefinition[], const TName extends SynWareRouteNames<TRoutes>>(
  graph: SynWareRouteGraph<TRoutes>, name: TName,
): SynWareRouteStateClient<SynWareRouteQueryForName<TRoutes, TName>> {
  const router = useRouter(graph);
  const presentation = useRoutePresentation();
  return useMemo(() => createMountedSynWareRouteState(graph, name, router, href => {
    if (!presentation.absoluteUrl) throw new DOMException("Absolute route URLs require a mounted host.", "InvalidStateError");
    return presentation.absoluteUrl(href);
  }), [graph, name, router, presentation.absoluteUrl]);
}
