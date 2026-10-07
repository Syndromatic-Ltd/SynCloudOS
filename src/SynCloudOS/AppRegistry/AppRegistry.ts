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

import { AppInfo } from "../AppInfo/AppInfo";
import { captureSynWareManifest } from "../AppSDK/manifest/canonicalManifest";
import type { SynCloudOSAppInfo, SynCloudOSAppInfoValidationReport } from "../AppInfo/appInfoTypes";
import type { TrustedSynWareBundle } from "../BundleLoader/bundleTypes";
import { preserveTrustedSynWareBundleProvenance } from "../BundleLoader/trustedBundleProvenance";
import { getNormalizedRouteKey, inspectExternalRouteSafety } from "../Routing/routeNormalization";
import { getOrderedVisibleWebspringApps } from "../WebspringState/webspringStateProjection";
import type {
  SynCloudOSAppManifest,
  SynCloudOSAppRouteClaim,
  SynCloudOSAppRegistrationCollisionField,
  SynCloudOSAppRegistrationHistoryRecord,
  SynCloudOSAppRegistrationIssue,
  SynCloudOSAppRegistrationPreflightReport
} from "./appRegistryTypes";
import type {
  SynCloudOSAppRegistry,
  SynCloudOSEventBus,
  SynCloudOSBundleLoader,
  SynCloudOSRuntimeId,
  SynCloudOSRuntimeStore,
  SynCloudOSRuntime,
} from "../Runtime/runtimeInstanceTypes";

type SynCloudOSAppRegistrationInput = SynCloudOSAppManifest | TrustedSynWareBundle;

export function createAppRegistry(runtime: SynCloudOSRuntime, dependencies: { appManagerController: any; bundleLoader?: any; runtimeController: any; serviceRegistry: any }) {
const AppManagerController = dependencies.appManagerController;
const BundleLoader = dependencies.bundleLoader ?? runtime.bundles;
const ErrorManager = runtime.errors;
const EventBus = runtime.events;
const RuntimeController = dependencies.runtimeController;
const RuntimeStore = runtime.store;

const registrationHistory: SynCloudOSAppRegistrationHistoryRecord[] = [];
const registrationReports: SynCloudOSAppRegistrationPreflightReport[] = [];

function recordRegistrationHistory(record: SynCloudOSAppRegistrationHistoryRecord) {
  registrationHistory.push(record);
  registrationHistory.splice(0, Math.max(0, registrationHistory.length - 120));
}

function recordRegistrationReport(report: SynCloudOSAppRegistrationPreflightReport) {
  registrationReports.push(report);
  registrationReports.splice(0, Math.max(0, registrationReports.length - 120));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Legacy registrations remain supported, but any V1-shaped declaration is
 * admitted only through the shared V1 schema and canonical bundle adapter. */
function validateSynWareRegistrationInput(input: unknown): boolean {
  if (!isRecord(input)) return true;
  const ownData = (value: object, key: string): { readonly present: boolean; readonly value: unknown } | null => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return { present: false, value: undefined };
    if (!("value" in descriptor)) return null;
    return { present: true, value: descriptor.value };
  };
  const direct = ownData(input, "schemaVersion");
  if (direct?.present) {
    captureSynWareManifest(input);
    return false;
  }
  const manifest = ownData(input, "manifest");
  if (manifest === null) return false;
  if (!manifest?.present || !isRecord(manifest.value)) return true;
  const v1 = ownData(manifest.value, "schemaVersion");
  if (v1 === null) return false;
  if (v1?.present) {
    captureSynWareManifest(manifest.value);
    return false;
  }
  const declaration = ownData(input, "synWareManifest");
  if (declaration === null || !declaration?.present || declaration.value === undefined) return declaration !== null;
  return captureSynWareManifest(declaration.value).ok;
}

function isTrustedBundle(value: unknown): value is TrustedSynWareBundle {
  return isRecord(value) && isRecord(value.manifest);
}

function getManifestCandidate(input: unknown) {
  return isTrustedBundle(input) ? input.manifest : input;
}

function validationDetails(report: SynCloudOSAppInfoValidationReport) {
  return JSON.stringify({
    manifestId: report.manifestId,
    packageName: report.packageName,
    errors: report.errors,
    warnings: report.warnings
  }, null, 2);
}

function createHistoryId(action: string, appId: string) {
  return `app-registry-${action}-${appId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createReportId(appId: string | null) {
  return `app-preflight-${appId ?? "unknown"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getStringField(record: unknown, field: string) {
  return isRecord(record) && typeof record[field] === "string" ? record[field].trim() : null;
}

function normalizeIdentityValue(value: string) {
  return value.trim().toLowerCase();
}

function getStaticRouteClaims(app: Pick<SynCloudOSAppManifest, "route" | "routeClaims">): readonly SynCloudOSAppRouteClaim[] {
  if (!app.routeClaims?.length) {
    return Object.freeze([{ path: app.route, match: "exact" as const }]);
  }
  return app.routeClaims;
}

function normalizedInternalClaim(claim: SynCloudOSAppRouteClaim) {
  const normalized = getNormalizedRouteKey(claim.path);
  if (normalized.matchMode !== "path" || !normalized.key) return null;
  return Object.freeze({
    pathname: normalized.pathname,
    match: claim.match,
  });
}

function claimOwnsPath(claim: SynCloudOSAppRouteClaim, pathname: string): boolean {
  const normalized = normalizedInternalClaim(claim);
  if (!normalized) return false;
  if (normalized.match === "exact") return normalized.pathname === pathname;
  if (normalized.pathname === "/") return false;
  return pathname === normalized.pathname || pathname.startsWith(`${normalized.pathname}/`);
}

function claimsOverlap(left: SynCloudOSAppRouteClaim, right: SynCloudOSAppRouteClaim): boolean {
  const a = normalizedInternalClaim(left);
  const b = normalizedInternalClaim(right);
  if (!a || !b) return false;
  if (a.match === "exact" && b.match === "exact") return a.pathname === b.pathname;
  if (a.match === "prefix" && b.match === "prefix") {
    return a.pathname === b.pathname
      || a.pathname.startsWith(`${b.pathname}/`)
      || b.pathname.startsWith(`${a.pathname}/`);
  }
  const prefix = a.match === "prefix" ? a.pathname : b.pathname;
  const exact = a.match === "exact" ? a.pathname : b.pathname;
  return exact === prefix || exact.startsWith(`${prefix}/`);
}

function appInfoIssueToRegistrationIssue(issue: SynCloudOSAppInfoValidationReport["issues"][number]): SynCloudOSAppRegistrationIssue {
  return {
    severity: issue.severity === "error" ? "fatal" : "warning",
    code: issue.code,
    field: issue.field,
    message: issue.message,
    source: "AppInfo",
    disablesApp: issue.code === "manifest.route.externalUnsafe",
    appInfoIssue: issue
  };
}

function createCollisionIssue(
  severity: SynCloudOSAppRegistrationIssue["severity"],
  field: SynCloudOSAppRegistrationCollisionField,
  value: string,
  normalizedValue: string | null,
  existing: SynCloudOSAppInfo,
  message: string
): SynCloudOSAppRegistrationIssue {
  return {
    severity,
    code: severity === "fatal" ? `registry.${field}.collision` : `registry.${field}.shared`,
    field,
    message,
    source: "AppRegistry",
    collision: {
      field,
      value,
      normalizedValue,
      existingAppId: existing.id,
      existingPackageName: existing.packageName
    }
  };
}

function createValidationPreflightReport(input: unknown, validation: SynCloudOSAppInfoValidationReport): SynCloudOSAppRegistrationPreflightReport {
  const manifest = getManifestCandidate(input);
  const appId = getStringField(manifest, "id");
  const packageName = getStringField(manifest, "packageName");
  const route = getStringField(manifest, "route");
  const routeKey = route ? getNormalizedRouteKey(route) : null;
  const issues = validation.issues.map(appInfoIssueToRegistrationIssue);

  return {
    id: createReportId(appId),
    at: Date.now(),
    action: appId && RuntimeStore.getSnapshot().appInfo[appId] ? "update" : "register",
    ok: validation.ok,
    appId,
    packageName,
    bundleId: getStringField(manifest, "bundleId"),
    route,
    normalizedRoute: routeKey?.pathname ?? null,
    routeKey: routeKey?.key ?? null,
    routeMatchMode: routeKey?.matchMode ?? "none",
    canonicalHref: routeKey?.canonicalHref ?? null,
    componentKey: getStringField(manifest, "componentKey"),
    previousApp: null,
    disabled: false,
    collisions: [],
    issues,
    fatalIssues: issues.filter((issue) => issue.severity === "fatal"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
    validation,
    normalisationNotes: [],
    explanation: null
  };
}

function createNormalisationFailurePreflightReport(input: unknown, message: string): SynCloudOSAppRegistrationPreflightReport {
  const manifest = getManifestCandidate(input);
  const appId = getStringField(manifest, "id");
  const packageName = getStringField(manifest, "packageName");
  const route = getStringField(manifest, "route");
  const routeKey = route ? getNormalizedRouteKey(route) : null;
  const issue: SynCloudOSAppRegistrationIssue = {
    severity: "fatal",
    code: "registry.normalisation.failed",
    field: "manifest",
    message,
    source: "AppRegistry"
  };

  return {
    id: createReportId(appId),
    at: Date.now(),
    action: appId && RuntimeStore.getSnapshot().appInfo[appId] ? "update" : "register",
    ok: false,
    appId,
    packageName,
    bundleId: getStringField(manifest, "bundleId"),
    route,
    normalizedRoute: routeKey?.pathname ?? null,
    routeKey: routeKey?.key ?? null,
    routeMatchMode: routeKey?.matchMode ?? "none",
    canonicalHref: routeKey?.canonicalHref ?? null,
    componentKey: getStringField(manifest, "componentKey"),
    previousApp: null,
    disabled: false,
    collisions: [],
    issues: [issue],
    fatalIssues: [issue],
    warnings: [],
    validation: null,
    normalisationNotes: [],
    explanation: null
  };
}

function createRegistryPreflightReport(
  result: ReturnType<typeof AppInfo.normalise>
): SynCloudOSAppRegistrationPreflightReport {
  const { info, validation, normalisationNotes, explanation } = result;
  const snapshot = RuntimeStore.getSnapshot();
  const previousInfo = snapshot.appInfo[info.id] ?? null;
  const routeKey = getNormalizedRouteKey(info.route);
  const issues = validation.warnings.map(appInfoIssueToRegistrationIssue);
  const collisions: SynCloudOSAppRegistrationPreflightReport["collisions"] = [];
  const apps = Object.values(snapshot.appInfo);

  const addCollision = (issue: SynCloudOSAppRegistrationIssue) => {
    if (issue.collision) collisions.push(issue.collision);
    issues.push(issue);
  };

  const bundleCollision = apps.find((app) => app.id !== info.id && normalizeIdentityValue(app.bundleId) === normalizeIdentityValue(info.bundleId));
  if (bundleCollision) {
    addCollision(createCollisionIssue(
      "fatal",
      "bundleId",
      info.bundleId,
      normalizeIdentityValue(info.bundleId),
      bundleCollision,
      `Bundle id "${info.bundleId}" is already registered by ${bundleCollision.packageName}.`
    ));
  }

  const packageCollision = apps.find((app) => app.id !== info.id && normalizeIdentityValue(app.packageName) === normalizeIdentityValue(info.packageName));
  if (packageCollision) {
    addCollision(createCollisionIssue(
      "fatal",
      "packageName",
      info.packageName,
      normalizeIdentityValue(info.packageName),
      packageCollision,
      `Package name "${info.packageName}" is already registered by ${packageCollision.id}.`
    ));
  }

  const infoClaims = getStaticRouteClaims(info);
  const routeCollision = routeKey.key
    ? apps.find((app) => app.id !== info.id && getStaticRouteClaims(app)
      .some((existingClaim) => infoClaims.some((candidateClaim) => claimsOverlap(existingClaim, candidateClaim))))
    : null;
  if (routeCollision) {
    addCollision(createCollisionIssue(
      "fatal",
      "route",
      info.route,
      routeKey.key,
      routeCollision,
      `Route "${info.route}" normalises to a route key already registered by ${routeCollision.packageName}.`
    ));
  }

  const componentCollision = apps.find((app) => app.id !== info.id && app.componentKey === info.componentKey);
  if (componentCollision) {
    addCollision(createCollisionIssue(
      "fatal",
      "componentKey",
      info.componentKey,
      info.componentKey,
      componentCollision,
      `Component key "${info.componentKey}" is already used by ${componentCollision.packageName}.`
    ));
  }

  if (info.type === "external") {
    const routeSafety = inspectExternalRouteSafety(info.route);
    const alreadyWarned = issues.some((issue) => issue.code === "manifest.route.externalUnsafe");
    if (!routeSafety.safe && !alreadyWarned) {
      issues.push({
        severity: "warning",
        code: "registry.externalRoute.unsafe",
        field: "route",
        message: `${routeSafety.reason ?? "External routes must use http or https."} The app will register disabled until the route is changed.`,
        source: "AppRegistry",
        disablesApp: true
      });
    }
  }

  const fatalIssues = issues.filter((issue) => issue.severity === "fatal");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    id: createReportId(info.id),
    at: Date.now(),
    action: previousInfo ? "update" : "register",
    ok: fatalIssues.length === 0,
    appId: info.id,
    packageName: info.packageName,
    bundleId: info.bundleId,
    route: info.route,
    normalizedRoute: routeKey.pathname,
    routeKey: routeKey.key,
    routeMatchMode: routeKey.matchMode,
    canonicalHref: routeKey.canonicalHref,
    componentKey: info.componentKey,
    previousApp: previousInfo
      ? {
        appId: previousInfo.id,
        packageName: previousInfo.packageName,
        bundleId: previousInfo.bundleId,
        route: previousInfo.route,
        componentKey: previousInfo.componentKey
      }
      : null,
    disabled: info.isDisabled,
    collisions,
    issues,
    fatalIssues,
    warnings,
    validation,
    normalisationNotes,
    explanation
  };
}

function publishRegistrationWarnings(report: SynCloudOSAppRegistrationPreflightReport) {
  if (report.warnings.length === 0) return;
  EventBus.publish("app.register.warning", {
    reportId: report.id,
    appId: report.appId,
    packageName: report.packageName,
    warnings: report.warnings,
    report
  }, report.packageName ?? report.appId ?? "AppRegistry");
}

function registrationReason(report: SynCloudOSAppRegistrationPreflightReport, fallback: string) {
  return report.fatalIssues[0]?.message ?? report.warnings[0]?.message ?? fallback;
}

function historyFromReport(
  report: SynCloudOSAppRegistrationPreflightReport,
  action: SynCloudOSAppRegistrationHistoryRecord["action"],
  result: SynCloudOSAppRegistrationHistoryRecord["result"],
  reason: string
): SynCloudOSAppRegistrationHistoryRecord {
  const appId = report.appId ?? "unknown";
  const packageName = report.packageName ?? appId;
  return {
    id: createHistoryId(action, appId),
    appId,
    packageName,
    action,
    result,
    at: Date.now(),
    reason,
    bundleId: report.bundleId ?? undefined,
    route: report.route ?? undefined,
    normalizedRoute: report.normalizedRoute,
    routeKey: report.routeKey,
    componentKey: report.componentKey ?? undefined,
    reportId: report.id,
    warnings: report.warnings,
    fatalIssues: report.fatalIssues,
    report
  };
}

function rejectRegistrationPreflight(report: SynCloudOSAppRegistrationPreflightReport) {
  recordRegistrationReport(report);
  publishRegistrationWarnings(report);
  EventBus.publish("app.register.failed", {
    appId: report.appId,
    packageName: report.packageName,
    report,
    fatalIssues: report.fatalIssues
  }, report.packageName ?? report.appId ?? "AppRegistry");
  recordRegistrationHistory(historyFromReport(report, "failed", "rejected", registrationReason(report, "Registration rejected by AppRegistry preflight.")));
}

function captureRegistrationFailure(
  input: unknown,
  title: string,
  message: string,
  technicalDetails: string,
  report?: SynCloudOSAppRegistrationPreflightReport
) {
  const manifest = getManifestCandidate(input);
  const appId = report?.appId ?? (isRecord(manifest) && typeof manifest.id === "string" ? manifest.id : undefined);
  const packageName = report?.packageName ?? (isRecord(manifest) && typeof manifest.packageName === "string" ? manifest.packageName : undefined);

  if (report) {
    recordRegistrationReport(report);
    publishRegistrationWarnings(report);
  }

  ErrorManager.capture({
    code: "APP_LAUNCH_FAILED",
    title,
    message,
    appId,
    packageName,
    technicalDetails,
    source: "SynCloudOS.AppRegistry.register",
    context: { manifest, report }
  });
  EventBus.publish("app.register.failed", { appId, packageName, technicalDetails, report }, packageName ?? appId);
  recordRegistrationHistory(report
    ? historyFromReport(report, "failed", "rejected", message)
    : {
      id: createHistoryId("failed", appId ?? "unknown"),
      appId: appId ?? "unknown",
      packageName: packageName ?? "unknown",
      action: "failed",
      result: "rejected",
      at: Date.now(),
      reason: message,
      warnings: [],
      fatalIssues: []
    });
}

function createBundleFromInput(input: SynCloudOSAppRegistrationInput, info: SynCloudOSAppInfo) {
  if (isTrustedBundle(input)) {
    const normalisedBundle = BundleLoader.createBundle({
      ...input,
      manifest: info,
      componentKey: input.componentKey || info.componentKey,
      services: input.services ?? [...info.requiredServices, ...(info.optionalServices ?? [])],
      optionalServices: input.optionalServices ?? info.optionalServices
    });
    return preserveTrustedSynWareBundleProvenance(input, normalisedBundle);
  }

  return BundleLoader.createBundle(info);
}

const appRegistry = {
  runtimeId: RuntimeStore.runtimeId,
  register(input: SynCloudOSAppRegistrationInput): SynCloudOSAppInfo | null {
    if (!validateSynWareRegistrationInput(input)) return null;
    const manifestCandidate = getManifestCandidate(input);
    const validation = AppInfo.validate(manifestCandidate);
    if (!validation.ok) {
      const report = createValidationPreflightReport(input, validation);
      captureRegistrationFailure(
        input,
        "SynCloudOS rejected an app manifest.",
        "The app manifest could not be validated for registration.",
        validationDetails(validation),
        report
      );
      return null;
    }

    let result: ReturnType<typeof AppInfo.normalise>;
    try {
      result = AppInfo.normalise(manifestCandidate as SynCloudOSAppManifest);
    } catch (error) {
      captureRegistrationFailure(
        input,
        "SynCloudOS rejected an app manifest.",
        "The app manifest could not be normalised into AppInfo.",
        error instanceof Error ? error.message : String(error),
        createNormalisationFailurePreflightReport(input, error instanceof Error ? error.message : String(error))
      );
      return null;
    }

    const { info, explanation } = result;
    const applicationMutation = runtime.windows.captureApplicationMutation(info.id);
    const requiredReport = dependencies.serviceRegistry.getServiceReport(info.requiredServices);
    info.serviceStatus = Object.fromEntries(requiredReport.items.map((item: { serviceId: string; available: boolean }) => [item.serviceId, item.available]));
    info.hasAccessToRequiredServices = requiredReport.ok;
    const optionalReport = dependencies.serviceRegistry.getServiceReport(info.optionalServices ?? []);
    info.optionalServiceStatus = Object.fromEntries(optionalReport.items.map((item: { serviceId: string; available: boolean }) => [item.serviceId, item.available]));
    info.unavailableOptionalServices = optionalReport.items.filter((item: { available: boolean }) => !item.available).map((item: { serviceId: string }) => item.serviceId);
    info.isDisabled = info.isDisabled || !requiredReport.ok;
    const preflight = createRegistryPreflightReport(result);
    if (!preflight.ok) {
      rejectRegistrationPreflight(preflight);
      return null;
    }

    const bundle = createBundleFromInput(input, info);
    const previousSnapshot = RuntimeStore.getSnapshot();
    const previousInfo = previousSnapshot.appInfo[info.id] ?? null;
    const previousBundleState = BundleLoader.captureBundleRegistrationState(info.id);
    const previousBundle = previousBundleState.bundle as TrustedSynWareBundle | null;
    const previousManager = AppManagerController.getManagerForApp(info.id);
    const hadManager = previousManager !== null;

    void BundleLoader.invokeLifecycleHookForBundle(bundle, "applicationWillRegister", {
      reason: previousInfo ? "AppRegistry.register update" : "AppRegistry.register"
    });
    runtime.windows.validateApplicationMutation(applicationMutation);
    let registeredBundle: TrustedSynWareBundle | null = null;
    const registeredInfo = RuntimeController.transaction((context: any) => {
      // runtime.transaction.begin is synchronously observable. Revalidate only
      // after that publication, before any non-store registration authority is
      // installed.
      runtime.windows.validateApplicationMutation(applicationMutation);
      registeredBundle = BundleLoader.registerBundle(bundle, { publish: false });
      const manager = AppManagerController.createManagerForApp(info, {
        replace: hadManager,
        publish: false,
        reason: previousInfo ? "AppRegistry.register refreshed AppInfo" : "AppRegistry.register"
      });

      context.mutate((draft: any) => {
        const previousLifecycle = draft.lifecycle[info.id];
        const nextLifecycle = info.isDisabled ? "disabled" : previousLifecycle === "disabled" ? "registered" : previousLifecycle ?? "registered";
        const previousRecord = draft.managers[info.id] ?? null;

        draft.rawApps[info.id] = registeredBundle!.manifest;
        draft.appInfo[info.id] = info;
        draft.lifecycle[info.id] = nextLifecycle;
        draft.managers[info.id] = manager.createRecord(previousRecord, nextLifecycle);
        draft.webspring.lastRefreshAt = Date.now();
        if (info.webspring.defaultSelected || !draft.webspring.selectedAppId) {
          draft.webspring.selectedAppId = info.id;
        }
      });
      // Advance before runtime.transaction.commit can publish the completed
      // store snapshot. Re-entrant observers therefore see one generation.
      runtime.windows.advanceApplicationSessionEpoch(info.id);
      return info;
    }, {
      label: previousInfo ? `AppRegistry.update:${info.id}` : `AppRegistry.register:${info.id}`,
      source: "SynCloudOS.AppRegistry.register"
    }) as SynCloudOSAppInfo | undefined;

    if (!registeredInfo || !registeredBundle) {
      BundleLoader.restoreBundleRegistrationState(previousBundleState);
      AppManagerController.restoreManagerForApp(info.id, previousManager);
      return null;
    }
    BundleLoader.publishBundleRegistration(registeredBundle, previousBundle !== null);
    if (hadManager) {
      AppManagerController.publishManagerReplacement(
        info,
        previousInfo ? "AppRegistry.register refreshed AppInfo" : "AppRegistry.register",
      );
    }

    recordRegistrationReport(preflight);
    publishRegistrationWarnings(preflight);
    void BundleLoader.invokeLifecycleHook(info.id, previousInfo ? "applicationDidUpdate" : "applicationDidRegister", {
      reason: previousInfo ? "AppRegistry.register update" : "AppRegistry.register"
    });
    EventBus.publish(previousInfo ? "app.register.update" : "app.register", {
      appId: info.id,
      packageName: info.packageName,
      bundleId: info.bundleId,
      replacedManager: hadManager,
      explanation,
      preflight,
      normalisationNotes: result.normalisationNotes,
      validationWarnings: result.validation.warnings,
      warnings: preflight.warnings
    }, info.packageName);
    recordRegistrationHistory(historyFromReport(
      preflight,
      previousInfo ? "update" : "register",
      "accepted",
      previousInfo ? "Manifest updated." : "Manifest registered."
    ));
    return registeredInfo;
  },

  registerBundle(bundle: TrustedSynWareBundle) {
    return this.register(bundle);
  },

  registerManifest(manifest: SynCloudOSAppManifest) {
    return this.register(manifest);
  },

  registerMany(inputs: SynCloudOSAppRegistrationInput[]) {
    return inputs.map((input) => this.register(input)).filter(Boolean) as SynCloudOSAppInfo[];
  },

  preflight(input: SynCloudOSAppRegistrationInput): SynCloudOSAppRegistrationPreflightReport {
    if (!validateSynWareRegistrationInput(input)) {
      return createNormalisationFailurePreflightReport(undefined, "The V1 SynWare registration did not pass the canonical manifest boundary.");
    }
    const manifestCandidate = getManifestCandidate(input);
    const validation = AppInfo.validate(manifestCandidate);
    if (!validation.ok) return createValidationPreflightReport(input, validation);

    try {
      return createRegistryPreflightReport(AppInfo.normalise(manifestCandidate as SynCloudOSAppManifest));
    } catch (error) {
      return createNormalisationFailurePreflightReport(input, error instanceof Error ? error.message : String(error));
    }
  },

  validate(input: unknown) {
    if (!validateSynWareRegistrationInput(input)) return AppInfo.validate({});
    return AppInfo.validate(getManifestCandidate(input));
  },

  normalise(manifest: SynCloudOSAppManifest) {
    return AppInfo.normalise(manifest);
  },

  explain(input: SynCloudOSAppManifest | SynCloudOSAppInfo) {
    const current = isRecord(input) && typeof input.id === "string" ? RuntimeStore.getSnapshot().appInfo[input.id] : null;
    if (current) return AppInfo.explain(current);
    return AppInfo.normalise(input as SynCloudOSAppManifest).explanation;
  },

  registerDisplayApp(manifest: SynCloudOSAppManifest) {
    return this.register({
      ...manifest,
      webspring: {
        ...manifest.webspring,
        visible: true
      }
    });
  },

  registerExternalApp(manifest: SynCloudOSAppManifest) {
    return this.register({
      ...manifest,
      type: "external"
    });
  },

  async unregister(appId: string) {
    const authority = runtime.windows.beginApplicationClose(appId);
    try {
      const bundle = BundleLoader.getBundle(appId);
      const manager = AppManagerController.getManagerForApp(appId);
      const closeResult = await runtime.windows.requestCloseApplication(
        appId,
        { reason: "application-quit" },
        authority,
      );
      if (closeResult && closeResult.outcome !== "closed") return null;
      if (bundle) {
        await BundleLoader.invokeLifecycleHookForBundle(bundle, "applicationWillUnregister", { reason: "AppRegistry.unregister" });
      }
      runtime.windows.validateApplicationCloseAuthority(authority);
      if (BundleLoader.getBundle(appId) !== bundle) {
        throw new Error(`Application "${appId}" registration changed during unregister.`);
      }
      if (AppManagerController.getManagerForApp(appId) !== manager) {
        throw new Error(`Application "${appId}" manager changed during unregister.`);
      }

      const removedBundle = RuntimeController.transaction((context: any) => {
        context.mutate((draft: any) => {
          delete draft.rawApps[appId];
          delete draft.appInfo[appId];
          delete draft.lifecycle[appId];
          delete draft.managers[appId];
          draft.webspring.lastRefreshAt = Date.now();
          if (draft.application.currentAppId === appId) draft.application.currentAppId = null;
          if (draft.application.activeAppId === appId) draft.application.activeAppId = null;
          draft.application.openAppIds = draft.application.openAppIds.filter((id: string) => id !== appId);
          if (draft.webspring.selectedAppId === appId) draft.webspring.selectedAppId = null;
        });
        AppManagerController.removeManagerForApp(appId);
        return BundleLoader.unregisterBundle(appId);
      }, {
        label: `AppRegistry.unregister:${appId}`,
        source: "SynCloudOS.AppRegistry.unregister"
      }) as TrustedSynWareBundle | null | undefined;
      if (removedBundle) {
        await BundleLoader.invokeLifecycleHookForBundle(removedBundle, "applicationDidUnregister", { reason: "AppRegistry.unregister" });
      }
      EventBus.publish("app.unregister", { appId, packageName: removedBundle?.manifest.packageName }, removedBundle?.manifest.packageName ?? appId);
      recordRegistrationHistory({
        id: createHistoryId("unregister", appId),
        appId,
        packageName: removedBundle?.manifest.packageName ?? appId,
        action: "unregister",
        result: "removed",
        at: Date.now(),
        reason: "App unregistered.",
        bundleId: removedBundle?.manifest.bundleId,
        route: removedBundle?.manifest.route,
        normalizedRoute: removedBundle ? getNormalizedRouteKey(removedBundle.manifest.route).pathname : null,
        routeKey: removedBundle ? getNormalizedRouteKey(removedBundle.manifest.route).key : null,
        componentKey: removedBundle?.manifest.componentKey,
        warnings: [],
        fatalIssues: []
      });
    } finally {
      runtime.windows.endApplicationClose(authority);
    }
  },

  getApp(appId: string) {
    return RuntimeStore.getSnapshot().appInfo[appId] ?? null;
  },

  getApps() {
    return RuntimeStore.getSnapshot().appInfo;
  },

  getAllApps() {
    return Object.values(RuntimeStore.getSnapshot().appInfo);
  },

  getRawApps() {
    return RuntimeStore.getSnapshot().rawApps;
  },

  getDisplayApps() {
    const snapshot = RuntimeStore.getSnapshot();
    return getOrderedVisibleWebspringApps(
      Object.values(snapshot.appInfo),
      snapshot.webspring.layout.preference.order
    );
  },

  refreshDisplayApps() {
    RuntimeStore.mutate((draft) => {
      draft.webspring.lastRefreshAt = Date.now();
      if (draft.webspring.selectedAppId && !draft.appInfo[draft.webspring.selectedAppId]?.webspring.visible) {
        draft.webspring.selectedAppId = null;
      }
    });
    EventBus.publish("webspring.refresh", { displayApps: this.getDisplayApps().map((app) => app.id) }, "Webspring");
    return this.getDisplayApps();
  },

  getRegistrationHistory(limit?: number) {
    return typeof limit === "number" ? registrationHistory.slice(-limit) : [...registrationHistory];
  },

  getRegistrationReports(limit?: number) {
    return typeof limit === "number" ? registrationReports.slice(-limit) : [...registrationReports];
  },

  getLastRegistrationReport() {
    return registrationReports.at(-1) ?? null;
  },

  getAppForRoute(pathname: string) {
    const requestedRoute = getNormalizedRouteKey(pathname);
    if (!requestedRoute.key || requestedRoute.matchMode !== "path") return null;
    return Object.values(RuntimeStore.getSnapshot().appInfo).find((app) => {
      if (app.type === "external") return false;
      return getStaticRouteClaims(app).some((claim) => claimOwnsPath(claim, requestedRoute.pathname));
    }) ?? null;
  },

  dispose() {
    registrationHistory.length = 0;
    registrationReports.length = 0;
  }
};

return appRegistry;
}

