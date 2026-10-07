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

import type { SynCloudOSBetaAccessClass, SynCloudOSLoginSessionSnapshot } from "../LoginServices/loginServicesTypes";
import type { SynCloudOSIdentityUser } from "../Identity/identityTypes";
import type {
  SynCloudOSAccessMode,
  SynCloudOSAppAccessPolicy,
  SynCloudOSCapabilityMatrix,
  SynCloudOSPolicy,
  SynCloudOSPolicyAuditReport,
  SynCloudOSPolicyContextSummary,
  SynCloudOSPolicyDecision,
  SynCloudOSPolicyEvaluationOptions,
  SynCloudOSPolicyOriginSummary,
  SynCloudOSPolicyProfile,
  SynCloudOSPolicyRequest,
  SynCloudOSPolicySubject,
  SynCloudOSPolicySubjectGrant,
  SynCloudOSPolicyTraceEntry,
  SynCloudOSPolicyTraceResult,
  SynCloudOSRoleCapabilityRegistration,
  SynCloudOSRoleCapabilityRegistrationInput,
  SynCloudOSRoleCapabilityReportItem
} from "./policyTypes";
import type { SynCloudOSRole } from "../PermissionManager/permissionTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { defaultPolicyProfile } from "./defaultPolicyProfile";

type PolicyKitDependencies = {
  readonly bundleLoader?: Pick<SynCloudOSRuntime["bundles"], "getBundle">;
  readonly loginServices?: Pick<SynCloudOSRuntime["login"], "getSnapshot">;
  readonly identity?: Pick<SynCloudOSRuntime["identity"], "getCurrentUser">;
  readonly accessMode?: SynCloudOSAccessMode;
  /** The host's role taxonomy. Defaults to the conservative framework profile. */
  readonly profile?: SynCloudOSPolicyProfile;
};

type PolicyKitLoginSession = Pick<SynCloudOSLoginSessionSnapshot, "isAuthorised" | "status" | "synId" | "accessClass" | "displayName">;

/** The framework's host-authority role. Every profile gets it, with every
 * capability; it satisfies all role and access-class requirements. Sessions
 * never resolve to it: host code reaches it through issueSubject. */
const SYSTEM_ROLE: SynCloudOSRole = "system";

function hasOwn(record: object, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Validates a host profile and returns its role table with the reserved
 * system role added. */
function policyRoleTable(profile: SynCloudOSPolicyProfile): Readonly<Record<string, readonly string[]>> {
  if (!profile || typeof profile !== "object" || typeof profile.id !== "string" || profile.id.trim().length === 0)
    throw new TypeError("A policy profile requires an id.");
  if (!profile.roles || typeof profile.roles !== "object") throw new TypeError(`Policy profile ${profile.id} requires roles.`);
  if (typeof profile.resolveRole !== "function") throw new TypeError(`Policy profile ${profile.id} requires resolveRole.`);
  if (hasOwn(profile.roles, SYSTEM_ROLE))
    throw new TypeError(`Policy profile ${profile.id} cannot declare the framework's reserved "system" role.`);
  const table: Record<string, readonly string[]> = {};
  for (const [role, capabilities] of Object.entries(profile.roles)) {
    if (role.trim().length === 0 || role !== role.trim()) throw new TypeError(`Policy profile ${profile.id} has an invalid role name "${role}".`);
    if (!Array.isArray(capabilities) || capabilities.some((capability) => typeof capability !== "string" || capability.trim().length === 0))
      throw new TypeError(`Policy profile ${profile.id} role "${role}" requires an array of capability names.`);
    table[role] = Object.freeze([...capabilities]);
  }
  if (!hasOwn(table, profile.anonymousRole))
    throw new TypeError(`Policy profile ${profile.id} must declare its anonymous role "${String(profile.anonymousRole)}".`);
  table[SYSTEM_ROLE] = Object.freeze(["*"]);
  return Object.freeze(table);
}

export function createPolicyKit(runtime: SynCloudOSRuntime, dependencies: PolicyKitDependencies = {}) {
const BundleLoader = dependencies.bundleLoader ?? runtime.bundles;
const EventBus = runtime.events;
const RuntimeStore = runtime.store;
const LoginServices = dependencies.loginServices ?? runtime.login;
const profile = dependencies.profile ?? defaultPolicyProfile;
const roleCapabilities = policyRoleTable(profile);
const Identity = dependencies.identity ?? {
  getCurrentUser: () => identityUserFromSession(runtime.login.getSnapshot()),
};

function isIdentityUser(value: unknown): value is SynCloudOSIdentityUser {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as SynCloudOSIdentityUser;
  return typeof candidate.id === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.role === "string" && hasOwn(roleCapabilities, candidate.role) &&
    typeof candidate.isAuthenticated === "boolean" &&
    typeof candidate.isAnonymous === "boolean";
}

function identityUserFromSession(session: PolicyKitLoginSession): SynCloudOSIdentityUser {
  return {
    id: session.synId ? `synid.${session.synId}` : "public.anonymous",
    displayName: session.displayName ?? "Public",
    role: getEffectiveRole(undefined, session),
    isAuthenticated: session.isAuthorised,
    isAnonymous: !session.isAuthorised,
    synId: session.synId,
  };
}

const policies = new Map<string, SynCloudOSPolicy>();
// The audit is runtime diagnostics: bounded by entries and bytes, outside the
// reactive snapshot, and counted by the resource ledger.
const auditLog = runtime.diagnostics.policyDecisions;
/** Subjects this PolicyKit has issued grants for; see issueSubject. */
const subjectGrants = new WeakMap<SynCloudOSPolicySubjectGrant, SynCloudOSPolicySubject>();
const registeredRoleCapabilities = new Map<SynCloudOSRole, Map<string, number>>();

const defaultAccessMode: SynCloudOSAccessMode =
  typeof import.meta.env.VITE_SYNCLOUDOS_ACCESS_MODE === "string"
    ? (import.meta.env.VITE_SYNCLOUDOS_ACCESS_MODE as SynCloudOSAccessMode)
    : "fullyLocked";

let accessMode: SynCloudOSAccessMode = dependencies.accessMode ?? defaultAccessMode;

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}
type RegisteredRoleCapabilities = ReadonlyMap<SynCloudOSRole, ReadonlyMap<string, number>>;

function registeredCapabilitiesForRole(
  role: SynCloudOSRole,
  registrations?: RegisteredRoleCapabilities,
): string[] {
  const registered = registrations?.get(role);
  return registered ? [...registered.keys()] : [];
}

function capabilitiesForRole(role: SynCloudOSRole, registrations?: RegisteredRoleCapabilities): string[] {
  return unique([
    ...(roleCapabilities[role] ?? []),
    ...registeredCapabilitiesForRole(role, registrations),
  ]);
}

function normaliseRoleCapabilityRegistration(input: SynCloudOSRoleCapabilityRegistrationInput): {
  readonly roles: SynCloudOSRole[];
  readonly capabilities: string[];
} {
  if (!input || typeof input !== "object" || !Array.isArray(input.roles) || !Array.isArray(input.capabilities)) {
    throw new TypeError("Role capability registrations require roles and capabilities arrays.");
  }
  const roles = unique(input.roles.map((role) => {
    if (typeof role !== "string" || role.trim().length === 0) {
      throw new TypeError("Role capability registration roles must be non-empty strings.");
    }
    const normalized = role.trim() as SynCloudOSRole;
    if (!Object.prototype.hasOwnProperty.call(roleCapabilities, normalized)) {
      throw new TypeError(`Unknown policy role "${role}".`);
    }
    return normalized;
  }));
  const capabilities = unique(input.capabilities.map((capability) => {
    if (typeof capability !== "string" || capability.trim().length === 0) {
      throw new TypeError("Role capability registration capabilities must be non-empty strings.");
    }
    return capability.trim();
  }));
  if (roles.length === 0) throw new TypeError("Role capability registrations require at least one role.");
  if (capabilities.length === 0) throw new TypeError("Role capability registrations require at least one capability.");
  return { roles, capabilities };
}


function getPolicyRoles() {
  return Object.keys(roleCapabilities) as SynCloudOSRole[];
}

function getEffectiveRole(claimedRole: SynCloudOSRole | undefined, session: PolicyKitLoginSession): SynCloudOSRole {
  const role = profile.resolveRole(
    Object.freeze({ isAuthorised: session.isAuthorised, synId: session.synId ?? null, accessClass: session.accessClass ?? null }),
    claimedRole,
  );
  // A role the profile did not declare, or the reserved system role, fails closed.
  return typeof role === "string" && role !== SYSTEM_ROLE && hasOwn(roleCapabilities, role) ? role : profile.anonymousRole;
}

function getLoginSessionSubject(): PolicyKitLoginSession {
  const session = LoginServices.getSnapshot();
  return {
    isAuthorised: session.isAuthorised,
    status: session.status,
    synId: session.synId,
    accessClass: session.accessClass,
    displayName: session.displayName
  };
}

function getAccessClassCapabilities(accessClass: SynCloudOSBetaAccessClass | null | undefined): readonly string[] {
  return profile.accessClassCapabilities?.(accessClass) ?? [];
}

function getSubject(
  request: SynCloudOSPolicyRequest,
  registrations?: RegisteredRoleCapabilities,
): SynCloudOSPolicySubject {
  // Request metadata (origin, source, subject) describes a caller but is never
  // an authority source. Only a grant this PolicyKit issued to host code can
  // substitute a subject; everything else resolves from the runtime's
  // host-owned login and identity services.
  const granted = request.subjectGrant ? subjectGrants.get(request.subjectGrant) : undefined;
  if (granted) return granted;
  const loginSession = getLoginSessionSubject();
  const identityUser = Identity.getCurrentUser();
  const baseUser = isIdentityUser(identityUser) ? identityUser : identityUserFromSession(loginSession);
  const role = getEffectiveRole(baseUser.role, loginSession);
  const user: SynCloudOSIdentityUser = {
    ...baseUser,
    role,
    isAuthenticated: loginSession.isAuthorised,
    isAnonymous: !loginSession.isAuthorised,
  };
  return {
    user,
    role,
    capabilities: unique([
      ...capabilitiesForRole(role, registrations),
      ...getAccessClassCapabilities(loginSession.accessClass),
    ]),
    isAuthenticated: loginSession.isAuthorised,
    loginSession
  };
}

function hasCapability(subject: SynCloudOSPolicySubject, capability: string) {
  return subject.capabilities.includes("*") || subject.capabilities.includes(capability);
}

function hasRole(subject: SynCloudOSPolicySubject, roles: SynCloudOSRole[]) {
  return roles.length === 0 || roles.includes(subject.role) || subject.role === SYSTEM_ROLE;
}

function getMatchedCapabilities(subject: SynCloudOSPolicySubject, requiredCapabilities: string[]) {
  return unique(requiredCapabilities).filter((capability) => hasCapability(subject, capability));
}

function getMissingCapabilities(subject: SynCloudOSPolicySubject, requiredCapabilities: string[]) {
  return unique(requiredCapabilities).filter((capability) => !hasCapability(subject, capability));
}

function getMatchedRoles(subject: SynCloudOSPolicySubject, requiredRoles: SynCloudOSRole[]) {
  const roles = unique(requiredRoles);
  if (roles.length === 0) return [];
  if (subject.role === SYSTEM_ROLE) return [...roles];
  return roles.filter((role) => role === subject.role);
}

function getMissingRoles(subject: SynCloudOSPolicySubject, requiredRoles: SynCloudOSRole[]) {
  const roles = unique(requiredRoles);
  if (roles.length === 0 || subject.role === SYSTEM_ROLE) return [];
  return roles.filter((role) => role !== subject.role);
}

function getMatchedAccessClasses(subject: SynCloudOSPolicySubject, requiredAccessClasses: SynCloudOSBetaAccessClass[]) {
  const classes = unique(requiredAccessClasses);
  const accessClass = subject.loginSession?.accessClass ?? null;
  if (!accessClass || classes.length === 0) return [];
  return classes.includes(accessClass) ? [accessClass] : [];
}

function getMissingAccessClasses(subject: SynCloudOSPolicySubject, requiredAccessClasses: SynCloudOSBetaAccessClass[]) {
  const classes = unique(requiredAccessClasses);
  if (classes.length === 0 || getMatchedAccessClasses(subject, classes).length > 0) return [];
  return classes;
}

function hasAccessClass(subject: SynCloudOSPolicySubject, requiredAccessClasses: SynCloudOSBetaAccessClass[]) {
  const classes = unique(requiredAccessClasses);
  return classes.length === 0 || getMatchedAccessClasses(subject, classes).length > 0 || subject.role === SYSTEM_ROLE;
}

function appPolicy(app: SynCloudOSPolicyRequest["app"]): SynCloudOSAppAccessPolicy {
  if (!app || typeof app !== "object") return {};
  const maybePolicy = (app as { policy?: SynCloudOSAppAccessPolicy }).policy;
  return maybePolicy ?? {};
}

/** DEV-build convenience for the developer console's display actions. The
 * console is a host tool; this is not an authorisation boundary. */
function isDeveloperDisplayAction(request: SynCloudOSPolicyRequest) {
  if (!import.meta.env.DEV) return false;
  return (
    request.origin === "developerConsole" &&
    (request.action === "webspring.enter" ||
      request.action === "webspring.displayApp" ||
      request.action === "webspring.refresh" ||
      request.action === "statechart.goto")
  );
}

function resourceForRequest(request: SynCloudOSPolicyRequest) {
  return request.app?.id ?? request.route ?? request.href ?? request.action;
}

function summariseContextValue(value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") return "Object";
  if (typeof value === "undefined") return "undefined";
  return typeof value;
}

function summariseContext(context?: Record<string, unknown>): SynCloudOSPolicyContextSummary | undefined {
  if (!context) return undefined;
  const keys = Object.keys(context);
  if (keys.length === 0) return undefined;
  return {
    keys: [...keys],
    values: Object.fromEntries(keys.slice(0, 20).map((key) => [key, summariseContextValue(context[key])]))
  };
}

function summariseOrigin(request: SynCloudOSPolicyRequest, resource?: string): SynCloudOSPolicyOriginSummary {
  return {
    action: request.action,
    origin: request.origin,
    source: request.source,
    resource,
    appId: request.app?.id,
    route: request.route,
    href: request.href
  };
}

function createTraceEntry(
  step: string,
  result: SynCloudOSPolicyTraceResult,
  message: string,
  subject: SynCloudOSPolicySubject,
  requiredCapabilities: string[] = [],
  requiredRoles: SynCloudOSRole[] = [],
  requiredAccessClasses: SynCloudOSBetaAccessClass[] = []
): SynCloudOSPolicyTraceEntry {
  const capabilities = unique(requiredCapabilities);
  const roles = unique(requiredRoles);
  const accessClasses = unique(requiredAccessClasses);
  return {
    step,
    result,
    message,
    requiredCapabilities: capabilities,
    requiredRoles: roles,
    requiredAccessClasses: accessClasses,
    matchedCapabilities: getMatchedCapabilities(subject, capabilities),
    missingCapabilities: getMissingCapabilities(subject, capabilities),
    matchedRoles: getMatchedRoles(subject, roles),
    missingRoles: getMissingRoles(subject, roles),
    matchedAccessClasses: getMatchedAccessClasses(subject, accessClasses),
    missingAccessClasses: getMissingAccessClasses(subject, accessClasses)
  };
}

function createDecisionTraceEntry(step: string, result: SynCloudOSPolicyTraceResult, message: string, decision: SynCloudOSPolicyDecision): SynCloudOSPolicyTraceEntry {
  return {
    step,
    result,
    message,
    requiredCapabilities: [...(decision.requiredCapabilities ?? [])],
    requiredRoles: [...(decision.requiredRoles ?? [])],
    requiredAccessClasses: [...(decision.requiredAccessClasses ?? [])],
    matchedCapabilities: [...(decision.matchedCapabilities ?? [])],
    missingCapabilities: [...(decision.missingCapabilities ?? [])],
    matchedRoles: [...(decision.matchedRoles ?? [])],
    missingRoles: [...(decision.missingRoles ?? [])],
    matchedAccessClasses: [...(decision.matchedAccessClasses ?? [])],
    missingAccessClasses: [...(decision.missingAccessClasses ?? [])]
  };
}

function cloneTraceEntry(entry: SynCloudOSPolicyTraceEntry): SynCloudOSPolicyTraceEntry {
  return {
    step: entry.step,
    result: entry.result,
    message: entry.message,
    requiredCapabilities: [...(entry.requiredCapabilities ?? [])],
    requiredRoles: [...(entry.requiredRoles ?? [])],
    requiredAccessClasses: [...(entry.requiredAccessClasses ?? [])],
    matchedCapabilities: [...(entry.matchedCapabilities ?? [])],
    missingCapabilities: [...(entry.missingCapabilities ?? [])],
    matchedRoles: [...(entry.matchedRoles ?? [])],
    missingRoles: [...(entry.missingRoles ?? [])],
    matchedAccessClasses: [...(entry.matchedAccessClasses ?? [])],
    missingAccessClasses: [...(entry.missingAccessClasses ?? [])]
  };
}

function cloneOriginSummary(summary: SynCloudOSPolicyOriginSummary): SynCloudOSPolicyOriginSummary {
  return { ...summary };
}

function cloneContextSummary(summary: SynCloudOSPolicyContextSummary): SynCloudOSPolicyContextSummary {
  return {
    keys: [...summary.keys],
    values: { ...summary.values }
  };
}

function cloneDecision(decision: SynCloudOSPolicyDecision): SynCloudOSPolicyDecision {
  return {
    ...decision,
    requiredCapabilities: [...(decision.requiredCapabilities ?? [])],
    requiredRoles: [...(decision.requiredRoles ?? [])],
    requiredAccessClasses: [...(decision.requiredAccessClasses ?? [])],
    matchedCapabilities: [...(decision.matchedCapabilities ?? [])],
    missingCapabilities: [...(decision.missingCapabilities ?? [])],
    matchedRoles: [...(decision.matchedRoles ?? [])],
    missingRoles: [...(decision.missingRoles ?? [])],
    matchedAccessClasses: [...(decision.matchedAccessClasses ?? [])],
    missingAccessClasses: [...(decision.missingAccessClasses ?? [])],
    trace: (decision.trace ?? []).map(cloneTraceEntry),
    originSummary: decision.originSummary
      ? cloneOriginSummary(decision.originSummary)
      : {
          action: decision.action,
          origin: decision.origin,
          source: decision.source,
          resource: decision.resource,
          appId: decision.appId,
          route: decision.route,
          href: decision.href
        },
    contextSummary: decision.contextSummary ? cloneContextSummary(decision.contextSummary) : undefined
  };
}

function appendTrace(decision: SynCloudOSPolicyDecision, entry: SynCloudOSPolicyTraceEntry) {
  const next = cloneDecision(decision);
  next.trace = [...next.trace, cloneTraceEntry(entry)];
  return next;
}

function baseDecision(
  request: SynCloudOSPolicyRequest,
  subject: SynCloudOSPolicySubject,
  allowed: boolean,
  reason: string,
  requiredCapabilities: string[] = [],
  requiredRoles: SynCloudOSRole[] = [],
  requiredAccessClasses: SynCloudOSBetaAccessClass[] = [],
  trace: SynCloudOSPolicyTraceEntry[] = []
): SynCloudOSPolicyDecision {
  const capabilities = unique(requiredCapabilities);
  const roles = unique(requiredRoles);
  const accessClasses = unique(requiredAccessClasses);
  const resource = resourceForRequest(request);
  return {
    id: `policy-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action: request.action,
    decision: allowed ? "allow" : "deny",
    allowed,
    reason,
    mode: request.accessMode ?? accessMode,
    subjectRole: subject.role,
    subjectId: subject.user?.id,
    resource,
    appId: request.app?.id,
    route: request.route,
    href: request.href,
    at: Date.now(),
    origin: request.origin,
    source: request.source,
    sessionAuthorised: subject.loginSession?.isAuthorised ?? subject.isAuthenticated,
    accessClass: subject.loginSession?.accessClass,
    requiredCapabilities: capabilities,
    requiredRoles: roles,
    requiredAccessClasses: accessClasses,
    matchedCapabilities: getMatchedCapabilities(subject, capabilities),
    missingCapabilities: getMissingCapabilities(subject, capabilities),
    matchedRoles: getMatchedRoles(subject, roles),
    missingRoles: getMissingRoles(subject, roles),
    matchedAccessClasses: getMatchedAccessClasses(subject, accessClasses),
    missingAccessClasses: getMissingAccessClasses(subject, accessClasses),
    trace: [
      ...trace.map(cloneTraceEntry),
      createTraceEntry("policy.decision", allowed ? "allow" : "deny", reason, subject, capabilities, roles, accessClasses)
    ],
    originSummary: summariseOrigin(request, resource),
    contextSummary: summariseContext(request.context)
  };
}

function decide(
  request: SynCloudOSPolicyRequest,
  registrations?: RegisteredRoleCapabilities,
): SynCloudOSPolicyDecision {
  const mode = request.accessMode ?? accessMode;
  const subject = getSubject(request, registrations);
  const policy = appPolicy(request.app);
  const app = request.app ?? null;
  const bundlePermissions = request.bundlePermissions ?? (app?.id ? BundleLoader.getBundle(app.id)?.permissions ?? [] : []);
  const requiredCapabilities = unique([
    ...(request.requiredCapabilities ?? []),
    ...(policy.requiredCapabilities ?? [])
  ]);
  const requiredRoles = unique([...(request.requiredRoles ?? []), ...(policy.requiredRoles ?? [])]);
  const requiredAccessClasses = unique([
    ...(request.requiredAccessClasses ?? []),
    ...(policy.requiredAccessClasses ?? [])
  ]);
  const trace = [
    createTraceEntry("policy.mode", "info", `Evaluating in ${mode} access mode.`, subject),
    createTraceEntry("policy.subject", "info", `Resolved ${subject.role} policy subject.`, subject),
    createTraceEntry("policy.requirements", "info", "Collected request, app, and bundle policy requirements.", subject, requiredCapabilities, requiredRoles, requiredAccessClasses)
  ];
  const appType = app?.type ?? "internal";
  const isSystemApp = appType === "system";
  const isExternalApp = appType === "external";
  const isPublicByManifest = policy.public === true || bundlePermissions.includes("app.open.public");
  const explicitlyRequiresLogin = policy.requiresLogin === true || bundlePermissions.includes("app.open.protected");

  if (isDeveloperDisplayAction(request)) {
    return baseDecision(request, subject, true, "Developer display-level action allowed.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (request.action === "runtime.inspect") {
    return baseDecision(request, subject, true, "Runtime inspection is allowed.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (request.action === "runtime.mutate" || request.action === "plugin.register") {
    const required = unique([...requiredCapabilities, "runtime.configure"]);
    const allowed = required.every((capability) => hasCapability(subject, capability));
    return baseDecision(request, subject, allowed, allowed ? "Privileged runtime mutation allowed." : "Runtime mutation requires runtime.configure.", required, requiredRoles, requiredAccessClasses, trace);
  }

  if ((request.action === "app.launch" || request.action === "route.open" || isSystemApp) && !hasAccessClass(subject, requiredAccessClasses)) {
    return baseDecision(request, subject, false, "This app requires a different SynCloudOS access class.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (request.action === "diagnostics.view" || isSystemApp) {
    const required = unique([...requiredCapabilities, "diagnostics.view"]);
    const allowed = required.every((capability) => hasCapability(subject, capability)) && hasRole(subject, requiredRoles);
    return baseDecision(request, subject, allowed, allowed ? "System app access allowed." : "System app access requires diagnostics.view.", required, requiredRoles, requiredAccessClasses, trace);
  }

  if (request.action === "webspring.enter" || request.action === "webspring.displayApp" || request.action === "webspring.refresh") {
    if (mode === "fullyLocked" && !subject.isAuthenticated) {
      return baseDecision(request, subject, false, "This deployment requires an authorised session before Webspring is shown.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
    }
    return baseDecision(request, subject, true, "Webspring display action allowed.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (request.action === "external.open") {
    if (request.href && !/^https?:\/\//i.test(request.href)) {
      return baseDecision(request, subject, false, "External routes must use http or https.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
    }
    return baseDecision(request, subject, true, "External route allowed.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (request.action === "route.open" && isExternalApp) {
    return baseDecision(request, subject, true, "External app route allowed.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (request.action === "app.launch" || request.action === "route.open") {
    const requiresLogin =
      mode === "fullyLocked" ||
      mode === "enterprisePrivate" ||
      (mode === "developer" && !isExternalApp) ||
      (mode === "webspringVisibleAppProtected" && !isExternalApp) ||
      explicitlyRequiresLogin ||
      (!isPublicByManifest && mode === "mixed");
    if (requiresLogin && !subject.isAuthenticated) {
      return baseDecision(request, subject, false, "This app launch requires an authorised session.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
    }
    if (!hasRole(subject, requiredRoles)) {
      return baseDecision(request, subject, false, "This app launch requires a different role.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
    }
    const missingCapabilities = requiredCapabilities.filter((capability) => !hasCapability(subject, capability));
    if (missingCapabilities.length > 0) {
      return baseDecision(request, subject, false, "This app launch requires additional capabilities.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
    }
    return baseDecision(request, subject, true, "App launch allowed.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (!hasAccessClass(subject, requiredAccessClasses)) {
    return baseDecision(request, subject, false, "This action requires a different SynCloudOS access class.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  if (!hasRole(subject, requiredRoles)) {
    return baseDecision(request, subject, false, "This action requires a different role.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }
  const missingCapabilities = requiredCapabilities.filter((capability) => !hasCapability(subject, capability));
  if (missingCapabilities.length > 0) {
    return baseDecision(request, subject, false, "This action requires additional capabilities.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
  }

  return baseDecision(request, subject, true, "No policy blocked this action.", requiredCapabilities, requiredRoles, requiredAccessClasses, trace);
}

function applyRegisteredPolicies(
  request: SynCloudOSPolicyRequest,
  initialDecision: SynCloudOSPolicyDecision,
  options: SynCloudOSPolicyEvaluationOptions = {}
) {
  // decide() builds a fresh decision; there is nothing to copy it away from.
  if (options.applyRegisteredPolicies === false || policies.size === 0) return initialDecision;

  let decision = cloneDecision(initialDecision);
  for (const [policyId, policy] of policies.entries()) {
    const before = cloneDecision(decision);
    const next = cloneDecision(policy(request, cloneDecision(decision)));
    next.decision = next.allowed ? "allow" : "deny";
    if (next.allowed !== before.allowed && next.reason === before.reason) {
      next.reason = next.allowed
        ? "Registered policy allowed the action."
        : "Registered policy denied the action.";
    }
    decision = appendTrace(
      next,
      createDecisionTraceEntry(
        `policy.registered.${policyId}`,
        next.allowed ? "allow" : "deny",
        next.allowed === before.allowed
          ? "Registered policy completed without changing the allow/deny result."
          : `Registered policy changed the result from ${before.decision} to ${next.decision}.`,
        next
      )
    );
  }
  return decision;
}

function evaluateRequest(
  request: SynCloudOSPolicyRequest,
  options: SynCloudOSPolicyEvaluationOptions = {},
  registrations?: RegisteredRoleCapabilities,
) {
  return applyRegisteredPolicies(request, decide(request, registrations), options);
}

function audit(decision: SynCloudOSPolicyDecision) {
  // `decision` is this evaluation's own object; the audit retains it (or its
  // bounded projection) and everyone else receives a copy.
  auditLog.append(decision);
  EventBus.publish("policy.decision", cloneDecision(decision), decision.action);
  return cloneDecision(decision);
}

function getAuditEntries(limit?: number) {
  return auditLog.entries(limit).map(cloneDecision);
}

function countBy<T>(items: T[], selector: (item: T) => string | undefined) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = selector(item) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

let disposed = false;
const changeListeners = new Set<() => void>();
/** Policy inputs held here (role capabilities, registered policies, access
 * mode) change without a runtime-store publication; observers of the policy
 * subject subscribe to these changes explicitly. */
const notifyChanged = () => {
  for (const listener of [...changeListeners]) listener();
};

const policyKit = {
  /**
   * Issues host authority to evaluate requests as `subject` (for example a
   * host contribution seeding trusted documents, or plugin registration by
   * the runtime). Only host code holding this PolicyKit can issue grants;
   * the returned grant is opaque and honoured only by this instance.
   */
  issueSubject(subject: SynCloudOSPolicySubject, options: Readonly<{ purpose: string }>): SynCloudOSPolicySubjectGrant {
    if (disposed) throw new Error("PolicyKit is disposed.");
    if (!subject || typeof subject !== "object" || !subject.user || typeof subject.role !== "string" || !Array.isArray(subject.capabilities))
      throw new TypeError("A policy subject grant requires a complete subject.");
    if (!options || typeof options.purpose !== "string" || options.purpose.trim().length === 0)
      throw new TypeError("A policy subject grant requires a purpose.");
    const issued: SynCloudOSPolicySubject = Object.freeze({
      ...subject,
      user: Object.freeze({ ...subject.user }),
      capabilities: Object.freeze([...subject.capabilities]) as string[],
      ...(subject.loginSession ? { loginSession: Object.freeze({ ...subject.loginSession }) } : {}),
    });
    const grant: SynCloudOSPolicySubjectGrant = Object.freeze({ purpose: options.purpose.trim() });
    subjectGrants.set(grant, issued);
    return grant;
  },

  /** Withdraws a grant; later requests carrying it use the derived subject. */
  revokeSubject(grant: SynCloudOSPolicySubjectGrant): boolean {
    return subjectGrants.delete(grant);
  },

  subscribe(listener: () => void): () => void {
    if (disposed) return () => undefined;
    changeListeners.add(listener);
    return () => { changeListeners.delete(listener); };
  },

  runtimeId: RuntimeStore.runtimeId,
  registerRoleCapabilities(input: SynCloudOSRoleCapabilityRegistrationInput): SynCloudOSRoleCapabilityRegistration {
    if (disposed) throw new Error("PolicyKit is disposed.");
    const { roles, capabilities } = normaliseRoleCapabilityRegistration(input);
    for (const role of roles) {
      const grants = registeredRoleCapabilities.get(role) ?? new Map<string, number>();
      for (const capability of capabilities) grants.set(capability, (grants.get(capability) ?? 0) + 1);
      registeredRoleCapabilities.set(role, grants);
    }
    notifyChanged();
    let active = true;
    return {
      dispose() {
        if (!active) return false;
        active = false;
        for (const role of roles) {
          const grants = registeredRoleCapabilities.get(role);
          if (!grants) continue;
          for (const capability of capabilities) {
            const count = grants.get(capability) ?? 0;
            if (count <= 1) grants.delete(capability);
            else grants.set(capability, count - 1);
          }
          if (grants.size === 0) registeredRoleCapabilities.delete(role);
        }
        notifyChanged();
        return true;
      },
    };
  },

  authorise(request: SynCloudOSPolicyRequest): SynCloudOSPolicyDecision {
    return audit(evaluateRequest(request, {}, registeredRoleCapabilities));
  },

  getCurrentSubject(): SynCloudOSPolicySubject {
    return getSubject({ action: "runtime.inspect" }, registeredRoleCapabilities);
  },


  evaluate(request: SynCloudOSPolicyRequest, options: SynCloudOSPolicyEvaluationOptions = {}): SynCloudOSPolicyDecision {
    return evaluateRequest(request, options, registeredRoleCapabilities);
  },

  can(request: SynCloudOSPolicyRequest | string) {
    const policyRequest =
      typeof request === "string"
        ? { action: request, requiredCapabilities: [request], source: "PolicyKit.can" }
        : request;
    return this.authorise(policyRequest).allowed;
  },

  explain(request: SynCloudOSPolicyRequest) {
    return this.evaluate(request);
  },

  registerPolicy(policyId: string, policy: SynCloudOSPolicy) {
    if (disposed) throw new Error("PolicyKit is disposed.");
    if (policies.has(policyId)) throw new TypeError(`Policy ${policyId} is already registered.`);
    policies.set(policyId, policy);
    notifyChanged();
    EventBus.publish("policy.register", { policyId }, policyId);
    return policy;
  },

  removePolicy(policyId: string) {
    const removed = policies.delete(policyId);
    if (removed) notifyChanged();
    EventBus.publish("policy.remove", { policyId, removed }, policyId);
    return removed;
  },

  setAccessMode(mode: SynCloudOSAccessMode) {
    const changed = accessMode !== mode;
    accessMode = mode;
    if (changed) notifyChanged();
    EventBus.publish("policy.accessMode.changed", { mode }, mode);
    return mode;
  },

  getAccessMode() {
    return accessMode;
  },

  getAuditLog(limit?: number) {
    return getAuditEntries(limit);
  },

  getAuditReport(limit?: number): SynCloudOSPolicyAuditReport {
    const decisions = getAuditEntries(limit);
    const allowed = decisions.filter((decision) => decision.allowed).length;
    return {
      generatedAt: Date.now(),
      total: decisions.length,
      allowed,
      denied: decisions.length - allowed,
      byAction: countBy(decisions, (decision) => decision.action),
      byOrigin: countBy(decisions, (decision) => decision.origin),
      byRole: countBy(decisions, (decision) => decision.subjectRole) as Partial<Record<SynCloudOSRole, number>>,
      decisions
    };
  },

  clearAuditLog() {
    auditLog.clear();
  },

  getRoleCapabilities(role: SynCloudOSRole) {
    return capabilitiesForRole(role, registeredRoleCapabilities);
  },

  getRoleCapabilityReport(): SynCloudOSRoleCapabilityReportItem[] {
    return getPolicyRoles().map((role) => {
      const capabilities = capabilitiesForRole(role, registeredRoleCapabilities);
      return {
        role,
        capabilities,
        capabilityCount: capabilities.length,
        wildcard: capabilities.includes("*")
      };
    });
  },

  getCapabilityMatrix(): SynCloudOSCapabilityMatrix {
    const registeredCapabilities = Array.from(registeredRoleCapabilities.values())
      .flatMap((grants) => [...grants.keys()]);
    const capabilities = unique([
      ...Object.values(roleCapabilities).flat(),
      ...registeredCapabilities,
    ]).sort();
    return getPolicyRoles().reduce<SynCloudOSCapabilityMatrix>((matrix, role) => {
      const roleCaps = capabilitiesForRole(role, registeredRoleCapabilities);
      matrix[role] = Object.fromEntries(
        capabilities.map((capability) => [capability, roleCaps.includes("*") || roleCaps.includes(capability)])
      );
      return matrix;
    }, {} as SynCloudOSCapabilityMatrix);
  },

  dispose() {
    disposed = true;
    changeListeners.clear();
    policies.clear();
    registeredRoleCapabilities.clear();
  }
};

return policyKit;
}
