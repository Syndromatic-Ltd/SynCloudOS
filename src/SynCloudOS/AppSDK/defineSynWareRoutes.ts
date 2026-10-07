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

import { createAppRouteGraph } from "../Routing/appSdkRoutePort";
import type { SynWareRouteDefinition, SynWareRouteGraph, SynWareRouteGraphDefinition } from "../Routing/appSdkRoutePort";

export function defineSynWareRoutes<
  const TRoutes extends readonly SynWareRouteDefinition[],
>(definition: SynWareRouteGraphDefinition<TRoutes>): SynWareRouteGraph<TRoutes> {
  return createAppRouteGraph(definition);
}

export type {
  SynCloudOSRouteInfo,
  SynWareNamedRouteTarget,
  SynWareRouteAfterLoad,
  SynWareRouteComponentProps,
  SynWareRouteDefinition,
  SynWareRouteErrorProps,
  SynWareRouteGraph,
  SynWareRouteGraphDefinition,
  SynWareRouteGuard,
  SynWareRouteGuardResult,
  SynWareRouteLazyModule,
  SynWareRouteLoadContext,
  SynWareRouteLoader,
  SynWareRouteLoadingProps,
  SynWareRouteNames,
  SynWareRouteQueryCodec,
  SynWareRouteQueryForName,
  SynWareRouteQueryIssue,
  SynWareRouteQueryRefresh,
  SynWareRouteQuerySchema,
  SynWareRouteRecognition,
} from "../Routing/appSdkRoutePort";
