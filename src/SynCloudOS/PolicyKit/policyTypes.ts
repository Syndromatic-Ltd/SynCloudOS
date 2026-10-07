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
import type { SynCloudOSAppManifest } from "../AppRegistry/appRegistryTypes";
import type { SynCloudOSIdentityUser } from "../Identity/identityTypes";
import type { SynCloudOSBetaAccessClass, SynCloudOSLoginSessionSnapshot } from "../LoginServices/loginServicesTypes";
import type { SynCloudOSRole } from "../PermissionManager/permissionTypes";
import type { SynCloudOSServiceReport } from "../ServiceRegistry/serviceTypes";

export type SynCloudOSAccessMode =
  | "fullyLocked"
  | "webspringVisibleAppProtected"
  | "public"
  | "mixed"
  | "developer"
  | "enterprisePrivate";

export type SynCloudOSPolicyAction =
  | "webspring.enter"
  | "webspring.displayApp"
  | "webspring.refresh"
  | "app.register"
  | "app.launch"
  | "app.close"
  | "route.open"
  | "external.open"
  | "service.use"
  | "runtime.inspect"
  | "runtime.mutate"
  | "statechart.goto"
  | "diagnostics.view"
  | "plugin.register"
  | "notification.post"
  | "notification.action"
  | "notification.requestPermission"
  | string;

export type SynCloudOSPolicyDecisionKind = "allow" | "deny";
export type SynCloudOSPolicyTraceResult = SynCloudOSPolicyDecisionKind | "info";

export interface SynCloudOSAppAccessPolicy {
  public?: boolean;
  requiresLogin?: boolean;
  requiredAccessClasses?: SynCloudOSBetaAccessClass[];
  requiredRoles?: SynCloudOSRole[];
  requiredCapabilities?: string[];
  requiredBundlePermissions?: string[];
}

export interface SynCloudOSPolicySubject {
  user: SynCloudOSIdentityUser;
  role: SynCloudOSRole;
  capabilities: string[];
  isAuthenticated: boolean;
  loginSession?: Pick<SynCloudOSLoginSessionSnapshot, "isAuthorised" | "status" | "synId" | "accessClass" | "displayName">;
}

/** What a policy profile sees of the login session when resolving a role. */
export interface SynCloudOSPolicyProfileSession {
  readonly isAuthorised: boolean;
  readonly synId?: string | null;
  readonly accessClass?: SynCloudOSBetaAccessClass | null;
}

/**
 * A host's role taxonomy. PolicyKit's engine (subject derivation, grants,
 * requirements, access modes, audit) is generic; which roles exist, what each
 * may do and how a signed-in session maps to a role are host policy.
 * `defaultPolicyProfile` is the default.
 */
export interface SynCloudOSPolicyProfile {
  readonly id: string;
  /** Built-in capabilities per role, in report order. `"*"` grants every
   * capability. The framework's `system` role is reserved and added by
   * PolicyKit; a profile cannot declare it. */
  readonly roles: Readonly<Record<string, readonly string[]>>;
  /** The role of a session that is not authorised. Must be declared in `roles`. */
  readonly anonymousRole: SynCloudOSRole;
  /** The role a session holds. `claimedRole` is the identity service's role
   * for the user, if any. A role the profile did not declare (or `system`)
   * fails closed to `anonymousRole`. */
  resolveRole(session: SynCloudOSPolicyProfileSession, claimedRole?: SynCloudOSRole): SynCloudOSRole;
  /** Capabilities a session's access class adds to its role's. */
  accessClassCapabilities?(accessClass: SynCloudOSBetaAccessClass | null | undefined): readonly string[];
  /** The access class of an active identity session, from the server's role
   * claims. Defaults to `"external"`. */
  sessionAccessClass?(claimedRoles: readonly string[]): SynCloudOSBetaAccessClass;
}

/**
 * Host-issued authority to evaluate a request as a specific subject instead
 * of the one derived from the runtime's login and identity services. Opaque:
 * only the PolicyKit that issued it honours it, so it cannot be forged from
 * request metadata. Issue with `PolicyKit.issueSubject`.
 */
export interface SynCloudOSPolicySubjectGrant {
  readonly purpose: string;
}

export interface SynCloudOSPolicyRequest {
  action: SynCloudOSPolicyAction;
  /** Diagnostic label; never an authority source. */
  source?: string;
  /** Diagnostic label; never an authority source. */
  origin?: "runtime" | "webspring" | "route" | "developerConsole" | "plugin" | "test" | "hostContribution" | string;
  app?: SynCloudOSAppInfo | SynCloudOSAppManifest | null;
  route?: string;
  href?: string;
  accessMode?: SynCloudOSAccessMode;
  /** Descriptive only. Evaluation uses the derived subject unless the request
   * carries a `subjectGrant` issued by this PolicyKit. */
  subject?: SynCloudOSPolicySubject;
  subjectGrant?: SynCloudOSPolicySubjectGrant;
  bundlePermissions?: string[];
  serviceReport?: SynCloudOSServiceReport;
  requiredCapabilities?: string[];
  requiredRoles?: SynCloudOSRole[];
  requiredAccessClasses?: SynCloudOSBetaAccessClass[];
  context?: Record<string, unknown>;
}

export interface SynCloudOSPolicyTraceEntry {
  step: string;
  result: SynCloudOSPolicyTraceResult;
  message: string;
  requiredCapabilities: string[];
  requiredRoles: SynCloudOSRole[];
  requiredAccessClasses: SynCloudOSBetaAccessClass[];
  matchedCapabilities: string[];
  missingCapabilities: string[];
  matchedRoles: SynCloudOSRole[];
  missingRoles: SynCloudOSRole[];
  matchedAccessClasses: SynCloudOSBetaAccessClass[];
  missingAccessClasses: SynCloudOSBetaAccessClass[];
}

export interface SynCloudOSPolicyOriginSummary {
  action: SynCloudOSPolicyAction;
  origin?: string;
  source?: string;
  resource?: string;
  appId?: string;
  route?: string;
  href?: string;
}

export interface SynCloudOSPolicyContextSummary {
  keys: string[];
  values: Record<string, string | number | boolean | null>;
}

export interface SynCloudOSPolicyDecision {
  id: string;
  action: SynCloudOSPolicyAction;
  decision: SynCloudOSPolicyDecisionKind;
  allowed: boolean;
  reason: string;
  mode: SynCloudOSAccessMode;
  subjectRole: SynCloudOSRole;
  subjectId?: string;
  resource?: string;
  appId?: string;
  route?: string;
  href?: string;
  at: number;
  origin?: string;
  source?: string;
  sessionAuthorised: boolean;
  accessClass?: SynCloudOSLoginSessionSnapshot["accessClass"];
  requiredCapabilities: string[];
  requiredRoles: SynCloudOSRole[];
  requiredAccessClasses: SynCloudOSBetaAccessClass[];
  matchedCapabilities: string[];
  missingCapabilities: string[];
  matchedRoles: SynCloudOSRole[];
  missingRoles: SynCloudOSRole[];
  matchedAccessClasses: SynCloudOSBetaAccessClass[];
  missingAccessClasses: SynCloudOSBetaAccessClass[];
  trace: SynCloudOSPolicyTraceEntry[];
  originSummary: SynCloudOSPolicyOriginSummary;
  contextSummary?: SynCloudOSPolicyContextSummary;
}

export type SynCloudOSPolicy = (request: SynCloudOSPolicyRequest, next: SynCloudOSPolicyDecision) => SynCloudOSPolicyDecision;

export interface SynCloudOSPolicyEvaluationOptions {
  applyRegisteredPolicies?: boolean;
}

export interface SynCloudOSPolicyAuditReport {
  generatedAt: number;
  total: number;
  allowed: number;
  denied: number;
  byAction: Record<string, number>;
  byOrigin: Record<string, number>;
  byRole: Partial<Record<SynCloudOSRole, number>>;
  decisions: SynCloudOSPolicyDecision[];
}

export interface SynCloudOSRoleCapabilityReportItem {
  role: SynCloudOSRole;
  capabilities: string[];
  capabilityCount: number;
  wildcard: boolean;
}
export interface SynCloudOSRoleCapabilityRegistrationInput {
  readonly roles: readonly SynCloudOSRole[];
  readonly capabilities: readonly string[];
}

export interface SynCloudOSRoleCapabilityRegistration {
  dispose(): boolean;
}


export type SynCloudOSCapabilityMatrix = Record<SynCloudOSRole, Record<string, boolean>>;
