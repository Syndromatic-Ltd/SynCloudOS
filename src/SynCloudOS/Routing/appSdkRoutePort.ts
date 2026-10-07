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

/** Internal Routing-to-AppSDK seam. The package entrypoint does not export this module. */
export { bindSynWareRouteGraph, createAppRouteGraph, isSynWareRouteGraph } from "./AppRouteGraph";
export { createAppRouteSession } from "./AppRouteSession";
export type { AppRouteNodeSnapshot, AppRouteSession, AppRouteSessionSnapshot } from "./AppRouteSession";
export { createMountedRouteParticipant } from "./MountedRouteSettlement";
export { createRouteServiceScope } from "./RouteServiceScope";
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
} from "./appRouteTypes";
export type { SynCloudOSRouteTransitionHandle, SynCloudOSRouteTransitionResult } from "./RouteTransition";
export { QueryValidationError, routeQuery } from "./routeQuery";
