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

import type { AppManager } from "../AppManager/AppManager";
import type { SynCloudOSAppLifecycleState } from "../AppManager/appManagerTypes";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { SynCloudOSLoginSessionSnapshot } from "../LoginServices/loginServicesTypes";
import type { SynCloudOSPolicyDecision, SynCloudOSPolicyRequest } from "../PolicyKit/policyTypes";
import type { SynCloudOSServiceReport } from "../ServiceRegistry/serviceTypes";
import type { ApplicationSessionMutationTicket } from "../Documents";
import type { LifecycleRequestOptions } from "../Lifecycle/lifecycleTypes";

export type SynCloudOSLaunchSource =
  | "webspring"
  | "route"
  | "boot"
  | "developer"
  | "notification"
  | "statechart"
  | "workspace";

export type SynCloudOSLaunchDecisionCode =
  | "READY"
  | "QUEUED"
  | "DEFERRED_LOGIN_SESSION"
  | "APP_NOT_FOUND"
  | "LOGIN_SESSION_REQUIRED"
  | "POLICY_DENIED"
  | "APP_DISABLED"
  | "SERVICE_UNAVAILABLE"
  | "LIFECYCLE_BLOCKED"
  | "LAUNCH_IN_PROGRESS";

export interface SynCloudOSLaunchQueueItem {
  requestId: string;
  appId: string;
  packageName: string;
  source?: SynCloudOSLaunchSource;
  requestedAt: number;
  deferredReason?: string;
  attempt: number;
}

export interface SynCloudOSLaunchQueueSnapshot {
  active: SynCloudOSLaunchQueueItem | null;
  queued: SynCloudOSLaunchQueueItem[];
  deferred: SynCloudOSLaunchQueueItem[];
}

export type SynCloudOSLaunchHistoryAction =
  | "requested"
  | "queued"
  | "deferred"
  | "coalesced"
  | "started"
  | "authorised"
  | "loading"
  | "ready"
  | "staged"
  | "multiswitch.begin"
  | "multiswitch.complete"
  | "complete"
  | "failed"
  | "cancelled"
  | "external.opened"
  | "external.denied"
  | "preload.requested"
  | "preload.complete"
  | "preload.failed"
  | "retry.requested";

export interface SynCloudOSLaunchHistoryOptions {
  source?: SynCloudOSLaunchSource;
  focus?: boolean;
  syncRoute?: boolean;
  queue?: boolean;
  deferUntilAuthorised?: boolean;
  hold?: boolean;
  reason?: string;
  context?: Record<string, unknown>;
}

export interface SynCloudOSLaunchHistoryRecord {
  id: string;
  action: SynCloudOSLaunchHistoryAction;
  at: number;
  appId: string;
  packageName?: string;
  requestId?: string;
  source?: SynCloudOSLaunchSource;
  attempt?: number;
  reason?: string;
  code?: SynCloudOSLaunchDecisionCode | SynCloudOSExternalAppDecisionCode | string;
  href?: string;
  options?: SynCloudOSLaunchHistoryOptions;
  queue: SynCloudOSLaunchQueueSnapshot;
  notes: string[];
}

export type SynCloudOSPolicyAuthorisationRequest = SynCloudOSPolicyRequest;

export interface SynCloudOSPolicyAuthorisationResult extends Partial<SynCloudOSPolicyDecision> {
  allowed?: boolean;
  authorised?: boolean;
  ok?: boolean;
  reason?: string;
  message?: string;
  code?: string;
  context?: Record<string, unknown>;
}

export interface SynCloudOSPolicyAuthorisationExplanation {
  available: boolean;
  checked: boolean;
  allowed: boolean;
  reason?: string;
  code?: string;
  result?: boolean | SynCloudOSPolicyAuthorisationResult;
}

export interface SynCloudOSPolicyKit {
  authorise?: (
    request: SynCloudOSPolicyAuthorisationRequest
  ) =>
    | boolean
    | SynCloudOSPolicyAuthorisationResult
    | Promise<boolean | SynCloudOSPolicyAuthorisationResult>;
}

export interface SynCloudOSLaunchRequestDetails {
  requestId: string;
  appId: string;
  app: SynCloudOSAppInfo;
  manager: AppManager;
  options: SynCloudOSOpenAppOptions;
  requestedAt: number;
  deferredReason?: string;
  attempt: number;
  /** Runtime-owned epoch authority; callers may inspect but cannot mint it. */
  applicationMutation: ApplicationSessionMutationTicket;
}

export interface SynCloudOSLaunchStatechartHooks {
  onRequested?: (request: SynCloudOSLaunchRequestDetails) => void;
  onCancelled?: (request: SynCloudOSLaunchRequestDetails) => void;
  onLoading?: (request: SynCloudOSLaunchRequestDetails) => void;
  onReady?: (request: SynCloudOSLaunchRequestDetails) => void;
  onActive?: (request: SynCloudOSLaunchRequestDetails) => void;
  onFailed?: (request: SynCloudOSLaunchRequestDetails, error: unknown) => void;
  onQueued?: (request: SynCloudOSLaunchRequestDetails) => void;
  onDeferred?: (request: SynCloudOSLaunchRequestDetails) => void;
}

export interface SynCloudOSOpenAppOptions {
  /** @internal Parent operation authority; never projected by AppSDK. */
  lifecycle?: LifecycleRequestOptions;
  source?: SynCloudOSLaunchSource;
  focus?: boolean;
  syncRoute?: boolean;
  queue?: boolean;
  hold?: boolean;
  deferUntilAuthorised?: boolean;
  reason?: string;
  context?: Record<string, unknown>;
  statechart?: SynCloudOSLaunchStatechartHooks;
}

export interface SynCloudOSLaunchExplanation {
  appId: string;
  canLaunch: boolean;
  canQueue: boolean;
  canDefer: boolean;
  accepted: boolean;
  code: SynCloudOSLaunchDecisionCode;
  reason: string;
  blockers: string[];
  app: Pick<SynCloudOSAppInfo, "bundleIdentifier" | "packageName" | "displayName" | "type" | "presentation" | "route"> | null;
  lifecycleState: SynCloudOSAppLifecycleState | null;
  serviceReport: SynCloudOSServiceReport | null;
  loginServices: Pick<SynCloudOSLoginSessionSnapshot, "isAuthorised" | "status" | "lastFailureReason">;
  policy: SynCloudOSPolicyAuthorisationExplanation;
  queue: SynCloudOSLaunchQueueSnapshot;
}

export type SynCloudOSExternalAppDecisionCode =
  | "READY"
  | "APP_NOT_FOUND"
  | "NOT_EXTERNAL_APP"
  | "UNSAFE_EXTERNAL_SCHEME"
  | "SERVICE_UNAVAILABLE"
  | "POLICY_DENIED";

export interface SynCloudOSExternalAppExplanation {
  appId: string;
  canOpen: boolean;
  accepted: boolean;
  code: SynCloudOSExternalAppDecisionCode;
  reason: string;
  blockers: string[];
  app: Pick<SynCloudOSAppInfo, "bundleIdentifier" | "packageName" | "displayName" | "type" | "route"> | null;
  href: string | null;
  canonicalHref: string | null;
  isSafeProtocol: boolean;
  serviceReport: SynCloudOSServiceReport | null;
  policy: SynCloudOSPolicyAuthorisationExplanation;
}
