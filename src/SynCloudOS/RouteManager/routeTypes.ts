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

import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { OperationHandle, OperationPhase } from "../Operations/operationTypes";

export type SynCloudOSRouteInputKind =
  | "invalidInput"
  | "empty"
  | "path"
  | "relative"
  | "sameOriginUrl"
  | "crossOriginUrl"
  | "protocolRelativeUrl"
  | "unsafeScheme";

export type SynCloudOSRouteMatchMode = "path" | "href" | "none";

export interface SynCloudOSRouteDiagnostics {
  inputKind: SynCloudOSRouteInputKind;
  matchMode: SynCloudOSRouteMatchMode;
  routeableInternally: boolean;
  externalRouteCandidate: boolean;
  isAbsoluteUrl: boolean;
  isProtocolRelative: boolean;
  isSameOrigin: boolean;
  isCrossOrigin: boolean;
  isSafeExternalProtocol: boolean;
  isUnsafeScheme: boolean;
  protocol: string | null;
  origin: string | null;
  baseOrigin: string;
  canonicalHref: string | null;
  rejectionReason?: string;
  notes: string[];
}

export interface SynCloudOSRouteNormalization {
  requestedPath: string;
  pathname: string;
  search: string;
  hash: string;
  href: string;
  changed: boolean;
  changes: string[];
  inputKind: SynCloudOSRouteInputKind;
  matchMode: SynCloudOSRouteMatchMode;
  routeableInternally: boolean;
  externalRouteCandidate: boolean;
  isAbsoluteUrl: boolean;
  isProtocolRelative: boolean;
  isSameOrigin: boolean;
  isCrossOrigin: boolean;
  isSafeExternalProtocol: boolean;
  isUnsafeScheme: boolean;
  protocol: string | null;
  origin: string | null;
  baseOrigin: string;
  canonicalHref: string | null;
  rejectionReason?: string;
  diagnostics: SynCloudOSRouteDiagnostics;
}

export type SynCloudOSRouteResolution =
  | { kind: "webspring"; requestedPath: string; pathname: "/"; normalized: SynCloudOSRouteNormalization; diagnostics: SynCloudOSRouteDiagnostics; matchMode: "path"; matchKey: "/" }
  | { kind: "app"; requestedPath: string; pathname: string; normalized: SynCloudOSRouteNormalization; diagnostics: SynCloudOSRouteDiagnostics; app: SynCloudOSAppInfo; matchMode: "path"; matchKey: string }
  | { kind: "external"; requestedPath: string; pathname: string; normalized: SynCloudOSRouteNormalization; diagnostics: SynCloudOSRouteDiagnostics; href: string; canonicalHref: string; app: SynCloudOSAppInfo; matchMode: "href"; matchKey: string }
  | { kind: "notFound"; requestedPath: string; pathname: string; normalized: SynCloudOSRouteNormalization; diagnostics: SynCloudOSRouteDiagnostics; matchMode: SynCloudOSRouteMatchMode; matchKey: string | null };

export type SynCloudOSRouteHistoryAction = "open" | "notFound";

export interface SynCloudOSRouteHistoryRecord {
  id: string;
  action: SynCloudOSRouteHistoryAction;
  at: number;
  requestedPath: string;
  pathname: string;
  kind: SynCloudOSRouteResolution["kind"];
  appId?: string;
  packageName?: string;
  href?: string;
  canonicalHref?: string;
  matchMode: SynCloudOSRouteMatchMode;
  matchKey?: string | null;
  diagnostics: SynCloudOSRouteDiagnostics;
  notes: string[];
}

export interface SynCloudOSRouteExplanation {
  requestedPath: string;
  pathname: string;
  kind: SynCloudOSRouteResolution["kind"];
  appId?: string;
  packageName?: string;
  href?: string;
  canonicalHref?: string;
  normalized: SynCloudOSRouteNormalization;
  diagnostics: SynCloudOSRouteDiagnostics;
  matchMode: SynCloudOSRouteMatchMode;
  matchKey?: string | null;
  routeTableSize: number;
  reasons: string[];
  warnings: string[];
  resolution: SynCloudOSRouteResolution;
  at: number;
}

export interface SynCloudOSOpenRouteOptions {
  source?: "route" | "boot" | "test" | string;
  syncRoute?: boolean;
  historyMode?: "push" | "replace";
  context?: Record<string, unknown>;
  signal?: AbortSignal;
  correlationId?: string;
  /** Trusted host-only fence invoked after route preparation and immediately
   * before any application/presentation state can commit. Mounted AppSDK
   * navigation strips this callback at its boundary. */
  hostBeforeCommit?: (context: Readonly<{
    signal: AbortSignal;
    correlationId: string;
  }>) => void | Promise<void>;
}

export interface SynCloudOSOpenRouteResult {
  readonly runtimeId: string;
  readonly requestedPath: string;
  readonly pathname: string;
  readonly kind: SynCloudOSRouteResolution["kind"];
  readonly appId?: string;
  readonly presentationSettlementId?: string;
}

export interface SynCloudOSOpenRouteHandle extends OperationHandle<SynCloudOSOpenRouteResult> {
  retry(): SynCloudOSOpenRouteHandle;
}

export type SynCloudOSRouteTransitionInspectionOutcome =
  | "settled"
  | "route-error"
  | "invalid-query"
  | "blocked"
  | "denied"
  | "redirected"
  | "cancelled"
  | "superseded"
  | "not-found"
  | "failed";

/** Redacted diagnostic projection of the canonical route.open operation.
 * It deliberately excludes hrefs, params, query values and error/reason text. */
export interface SynCloudOSRouteTransitionInspectionRecord {
  readonly operationId: string;
  readonly correlationId: string;
  readonly parentCorrelationId?: string;
  readonly successorId?: string;
  readonly appId?: string;
  readonly outcome: SynCloudOSRouteTransitionInspectionOutcome;
  readonly phase: OperationPhase;
  readonly committed: boolean;
  readonly startedAt?: number;
  readonly updatedAt?: number;
  readonly endedAt?: number;
}
