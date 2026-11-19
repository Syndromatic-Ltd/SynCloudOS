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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import { selectionCircleUrl, selectorArrowUrl, timeMachineShadowUrl, spinnerUrl } from "../Resources/frameworkAssets";
import {
  normalizeSynCloudOSAppPresentation,
  type SynCloudOSPresentationMotionManifest,
  type SynCloudOSAppManifest,
  type SynCloudOSAppPresentation,
  type SynCloudOSAppType,
  type SynCloudOSAppWindowManifest,
} from "../AppRegistry/appRegistryTypes";
import { normaliseWindowSmoothSurface } from "../Windows/windowTypes";
import { inspectExternalRouteSafety, normalizeRoutePath } from "../Routing/routeNormalization";
import type {
  SynCloudOSAppInfo,
  SynCloudOSAppInfoExplanation,
  SynCloudOSAppInfoIssue,
  SynCloudOSAppInfoIssueSeverity,
  SynCloudOSAppInfoNormalisationNote,
  SynCloudOSAppInfoValidationReport
} from "./appInfoTypes";

const appTypes: SynCloudOSAppType[] = ["internal", "external", "system"];
const presentations: SynCloudOSAppPresentation[] = ["appView", "windowedView", "systemSheet", "backgroundService"];
const defaultPresentationMotion: SynCloudOSPresentationMotionManifest = { presentationMotion: "host" };

type NormalisedSynCloudOSAppManifest = SynCloudOSAppManifest & {
  presentation: SynCloudOSAppPresentation;
  frame: SynCloudOSPresentationMotionManifest;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addIssue(
  issues: SynCloudOSAppInfoIssue[],
  severity: SynCloudOSAppInfoIssueSeverity,
  code: string,
  field: string,
  message: string
) {
  issues.push({ severity, code, field, message });
}

function getNestedRecord(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return isRecord(value) ? value : null;
}

function note(
  notes: SynCloudOSAppInfoNormalisationNote[],
  field: string,
  from: unknown,
  to: unknown,
  reason: string
) {
  if (Object.is(from, to)) return;
  notes.push({ field, from, to, reason });
}

function cleanString(value: string) {
  return value.trim();
}

function normaliseRoute(route: unknown, appId: string, type: SynCloudOSAppType, notes: SynCloudOSAppInfoNormalisationNote[]) {
  const fallback = `/${appId}`;
  const initial = isNonEmptyString(route) ? cleanString(route) : fallback;
  note(notes, "route", route, initial, "Empty routes default to the app id route.");

  if (type !== "external") {
    const normalized = normalizeRoutePath(initial);
    note(notes, "route", initial, normalized.pathname, "Internal app routes use SynCloudOS normalized route keys.");
    return normalized.pathname;
  }

  return initial;
}

function normalisePath(path: unknown, packageName: string, notes: SynCloudOSAppInfoNormalisationNote[]) {
  const fallback = `${packageName}/`;
  const initial = isNonEmptyString(path) ? cleanString(path) : fallback;
  note(notes, "path", path, initial, "Empty bundle paths default to the package directory.");

  if (!initial.endsWith("/")) {
    const suffixed = `${initial}/`;
    note(notes, "path", initial, suffixed, "Bundle paths are normalised with a trailing slash.");
    return suffixed;
  }

  return initial;
}

function normaliseServiceList(
  services: unknown,
  field: "requiredServices" | "optionalServices",
  notes: SynCloudOSAppInfoNormalisationNote[]
) {
  const initial = Array.isArray(services) ? services : [];
  const cleaned = initial.filter(isNonEmptyString).map((serviceId) => serviceId.trim());
  const unique = Array.from(new Set(cleaned));
  if (initial.length !== unique.length || initial.some((serviceId, index) => serviceId !== unique[index])) {
    note(notes, field, services, unique, `${field} are trimmed and de-duplicated.`);
  }
  return unique;
}

function normaliseFrame(frame: unknown, notes: SynCloudOSAppInfoNormalisationNote[]): SynCloudOSPresentationMotionManifest {
  if (frame === undefined) return defaultPresentationMotion;
  if (isRecord(frame) && (frame.presentationMotion === "content" || frame.presentationMotion === "host")) {
    return { presentationMotion: frame.presentationMotion };
  }
  note(notes, "frame.presentationMotion", frame, defaultPresentationMotion, "Invalid presentation motion uses host motion.");
  return defaultPresentationMotion;
}

function normaliseWindow(
  input: SynCloudOSAppManifest["window"],
  appId: string,
  displayName: string,
  notes: SynCloudOSAppInfoNormalisationNote[],
): SynCloudOSAppWindowManifest {
  const record: Record<string, unknown> = isRecord(input) ? input : {};
  const defaultWidth = isFiniteNumber(record.defaultWidth) && record.defaultWidth > 0 ? record.defaultWidth : 820;
  const defaultHeight = isFiniteNumber(record.defaultHeight) && record.defaultHeight > 0 ? record.defaultHeight : 580;
  const minWidth = isFiniteNumber(record.minWidth) && record.minWidth > 0 ? record.minWidth : 340;
  const minHeight = isFiniteNumber(record.minHeight) && record.minHeight > 0 ? record.minHeight : 420;
  const suppliedBounds = isRecord(record.defaultBounds) ? record.defaultBounds : null;
  const defaultBounds = suppliedBounds &&
    isFiniteNumber(suppliedBounds.x) &&
    isFiniteNumber(suppliedBounds.y) &&
    isFiniteNumber(suppliedBounds.width) && suppliedBounds.width > 0 &&
    isFiniteNumber(suppliedBounds.height) && suppliedBounds.height > 0
    ? {
        x: suppliedBounds.x,
        y: suppliedBounds.y,
        width: suppliedBounds.width,
        height: suppliedBounds.height,
      }
    : { x: 80, y: 60, width: defaultWidth, height: defaultHeight };
  const suppliedMinimumSize = isRecord(record.minimumSize) ? record.minimumSize : null;
  const minimumSize = suppliedMinimumSize &&
    isFiniteNumber(suppliedMinimumSize.width) && suppliedMinimumSize.width > 0 &&
    isFiniteNumber(suppliedMinimumSize.height) && suppliedMinimumSize.height > 0
    ? { width: suppliedMinimumSize.width, height: suppliedMinimumSize.height }
    : { width: minWidth, height: minHeight };
  const resizable = typeof record.resizable === "boolean" ? record.resizable : true;
  const permittedStyles = new Set(["titled", "closable", "minimisable", "resizable", "zoomable"]);
  const suppliedStyles: SynCloudOSAppWindowManifest["style"][number][] = Array.isArray(record.style)
    ? [...new Set(record.style.filter((style: unknown): style is SynCloudOSAppWindowManifest["style"][number] => (
        typeof style === "string" && permittedStyles.has(style)
      )))]
    : [];
  const style = suppliedStyles.length > 0
    ? suppliedStyles
    : ["titled" as const, "closable" as const, "minimisable" as const, ...(resizable ? ["resizable" as const, "zoomable" as const] : [])];
  const role = record.role === "panel" || record.role === "hud" ? record.role : "standard";
  const mobilePolicy = record.mobilePolicy === "sheet" || record.mobilePolicy === "popover-to-sheet" ||
    record.mobilePolicy === "hidden" ? record.mobilePolicy : "fullscreen";
  const restorationKey = isNonEmptyString(record.restorationKey)
    ? cleanString(record.restorationKey)
    : `application.${normalizeBundleIdentifier(appId)}.primary`;
  note(notes, "window.defaultBounds", record.defaultBounds, defaultBounds, "Window bounds default to a finite CSS-pixel rectangle.");
  note(notes, "window.minimumSize", record.minimumSize, minimumSize, "Window minimum size defaults from the legacy size fields.");
  note(notes, "window.style", record.style, style, "Window style defaults from resizability.");
  return {
    ...(input ?? {}),
    title: isNonEmptyString(record.title) ? cleanString(record.title) : displayName,
    defaultWidth,
    defaultHeight,
    minWidth,
    minHeight,
    smoothSurface: normaliseWindowSmoothSurface(
      record.smoothSurface,
      (field, supplied, resolved, reason) => note(notes, `window.smoothSurface.${field}`, supplied, resolved, reason),
    ) ?? "off",
    resizable,
    role,
    defaultBounds,
    minimumSize,
    style,
    mobilePolicy,
    restorationKey,
  };
}

function createValidationReport(manifest: unknown, issues: SynCloudOSAppInfoIssue[]): SynCloudOSAppInfoValidationReport {
  const record = isRecord(manifest) ? manifest : {};
  const manifestId = isNonEmptyString(record.bundleIdentifier) ? record.bundleIdentifier.trim() : null;
  const packageName = isNonEmptyString(record.packageName) ? record.packageName.trim() : null;
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    ok: errors.length === 0,
    manifestId,
    packageName,
    issues,
    errors,
    warnings
  };
}

function describeValidationReport(report: SynCloudOSAppInfoValidationReport) {
  if (report.ok) return "SynCloudOS accepted the app manifest.";
  return report.errors.map((issue) => `${issue.field}: ${issue.message}`).join("\n");
}

export function validateAppManifest(manifest: unknown): SynCloudOSAppInfoValidationReport {
  const issues: SynCloudOSAppInfoIssue[] = [];

  if (!isRecord(manifest)) {
    addIssue(issues, "error", "manifest.object", "manifest", "SynCloudOS expected a manifest object.");
    return createValidationReport(manifest, issues);
  }

  const requiredIdentityFields = [
    "bundleIdentifier",
    "version",
    "name",
    "packageName",
    "displayName",
    "shortName",
    "description",
    "componentKey"
  ];
  requiredIdentityFields.forEach((field) => {
    if (!isNonEmptyString(manifest[field])) {
      addIssue(issues, "error", `manifest.${field}.required`, field, `${field} must be a non-empty string.`);
    }
  });
  for (const field of ["id", "title", "bundleId"]) {
    if (Object.hasOwn(manifest, field)) {
      addIssue(issues, "error", `manifest.${field}.unsupported`, field, `${field} is not an application identity field; use bundleIdentifier and displayName.`);
    }
  }
  if (typeof manifest.bundleIdentifier === "string" && !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+){2,}$/.test(manifest.bundleIdentifier)) {
    addIssue(issues, "error", "manifest.bundleIdentifier.invalid", "bundleIdentifier", "bundleIdentifier must be a reverse-DNS identifier with at least two dots.");
  }
  if (isRecord(manifest.about) && Object.hasOwn(manifest.about, "version")) {
    addIssue(issues, "error", "manifest.about.version.unsupported", "about.version", "Declare the application version only in version.");
  }

  if (!isNonEmptyString(manifest.route)) {
    addIssue(issues, "warning", "manifest.route.defaulted", "route", "route is empty and will be normalised from the app id.");
  }

  if (!isNonEmptyString(manifest.path)) {
    addIssue(issues, "warning", "manifest.path.defaulted", "path", "path is empty and will be normalised from the package name.");
  }

  if (!appTypes.includes(manifest.type as SynCloudOSAppType)) {
    addIssue(issues, "error", "manifest.type.invalid", "type", "type must be internal, external, or system.");
  }

  if (manifest.disabled !== undefined && typeof manifest.disabled !== "boolean") {
    addIssue(issues, "error", "manifest.disabled.invalid", "disabled", "disabled must be a boolean.");
  }
  if (manifest.disabledReason !== undefined && typeof manifest.disabledReason !== "string") {
    addIssue(issues, "error", "manifest.disabledReason.invalid", "disabledReason", "disabledReason must be a string.");
  }

  if (manifest.type === "external" && isNonEmptyString(manifest.route)) {
    const routeSafety = inspectExternalRouteSafety(manifest.route);
    if (!routeSafety.safe) {
      addIssue(
        issues,
        "warning",
        "manifest.route.externalUnsafe",
        "route",
        `${routeSafety.reason ?? "External routes must use http or https."} The app will register disabled until the route is changed.`
      );
    }
  }

  if (
    manifest.presentation !== undefined &&
    !presentations.includes(manifest.presentation as SynCloudOSAppPresentation)
  ) {
    addIssue(issues, "error", "manifest.presentation.invalid", "presentation", "presentation must be appView, windowedView, systemSheet, or backgroundService.");
  }

  const motion = getNestedRecord(manifest, "frame")?.presentationMotion;
  if (motion !== undefined && motion !== "host" && motion !== "content") {
    addIssue(issues, "warning", "manifest.frame.presentationMotion.defaulted", "frame.presentationMotion", "Unknown presentation motion uses host motion.");
  }

  if (!Array.isArray(manifest.requiredServices)) {
    addIssue(issues, "warning", "manifest.requiredServices.defaulted", "requiredServices", "requiredServices is missing and will default to an empty list.");
  } else if (!manifest.requiredServices.every(isNonEmptyString)) {
    addIssue(issues, "warning", "manifest.requiredServices.cleaned", "requiredServices", "requiredServices contains empty entries that will be removed.");
  }

  if (manifest.optionalServices !== undefined && !Array.isArray(manifest.optionalServices)) {
    addIssue(issues, "warning", "manifest.optionalServices.defaulted", "optionalServices", "optionalServices must be an array and will default to an empty list.");
  } else if (Array.isArray(manifest.optionalServices) && !manifest.optionalServices.every(isNonEmptyString)) {
    addIssue(issues, "warning", "manifest.optionalServices.cleaned", "optionalServices", "optionalServices contains empty entries that will be removed.");
  }

  const icon = getNestedRecord(manifest, "icon");
  if (!icon) {
    addIssue(issues, "error", "manifest.icon.required", "icon", "icon must be an object with an icon source.");
  } else if (!isNonEmptyString(icon.src)) {
    addIssue(issues, "error", "manifest.icon.src.required", "icon.src", "icon.src must be a non-empty string.");
  }

  const webspring = getNestedRecord(manifest, "webspring");
  if (!webspring) {
    addIssue(issues, "error", "manifest.webspring.required", "webspring", "webspring must describe Webspring placement.");
  } else {
    if (typeof webspring.visible !== "boolean") {
      addIssue(issues, "error", "manifest.webspring.visible.required", "webspring.visible", "webspring.visible must be a boolean.");
    }
    if (!isFiniteNumber(webspring.order)) {
      addIssue(issues, "error", "manifest.webspring.order.required", "webspring.order", "webspring.order must be a finite number.");
    }
  }

  const window = getNestedRecord(manifest, "window");
  if (!window) {
    addIssue(issues, "error", "manifest.window.required", "window", "window must describe app presentation chrome and sizing.");
  } else {
    if (!isNonEmptyString(window.title)) {
      addIssue(issues, "error", "manifest.window.title.required", "window.title", "window.title must be a non-empty string.");
    }
    ["defaultWidth", "defaultHeight", "minWidth", "minHeight"].forEach((field) => {
      if (!isFiniteNumber(window[field])) {
        addIssue(issues, "error", `manifest.window.${field}.required`, `window.${field}`, `window.${field} must be a finite number.`);
      }
    });
    if (typeof window.resizable !== "boolean") {
      addIssue(issues, "error", "manifest.window.resizable.required", "window.resizable", "window.resizable must be a boolean.");
    }
  }

  if (!isRecord(manifest.lifecycle)) {
    addIssue(issues, "warning", "manifest.lifecycle.defaulted", "lifecycle", "lifecycle is missing and will default to an empty lifecycle manifest.");
  }

  if (!isRecord(manifest.notifications)) {
    addIssue(issues, "warning", "manifest.notifications.defaulted", "notifications", "notifications is missing and will default to no notifications.");
  }

  const seo = getNestedRecord(manifest, "seo");
  if (!seo) {
    addIssue(issues, "warning", "manifest.seo.defaulted", "seo", "seo is missing and will be normalised from display copy.");
  } else {
    if (!isNonEmptyString(seo.title)) {
      addIssue(issues, "warning", "manifest.seo.title.defaulted", "seo.title", "seo.title is empty and will be normalised from displayName.");
    }
    if (!isNonEmptyString(seo.description)) {
      addIssue(issues, "warning", "manifest.seo.description.defaulted", "seo.description", "seo.description is empty and will be normalised from description.");
    }
  }

  return createValidationReport(manifest, issues);
}

function normaliseManifest(manifest: SynCloudOSAppManifest, notes: SynCloudOSAppInfoNormalisationNote[]): NormalisedSynCloudOSAppManifest {
  const id = cleanString(manifest.bundleIdentifier);
  const name = cleanString(manifest.name);
  const packageName = cleanString(manifest.packageName);
  const displayName = cleanString(manifest.displayName);
  const shortName = cleanString(manifest.shortName);
  const description = cleanString(manifest.description);
  const componentKey = cleanString(manifest.componentKey);
  const type = manifest.type;
  const presentation = normalizeSynCloudOSAppPresentation(manifest.presentation, "appView");
  note(notes, "presentation", manifest.presentation, presentation, "Missing presentation values default to appView.");

  const requiredServices = normaliseServiceList(manifest.requiredServices, "requiredServices", notes);
  const optionalServices = normaliseServiceList(manifest.optionalServices, "optionalServices", notes);
  const lifecycle: Record<string, unknown> = isRecord(manifest.lifecycle) ? manifest.lifecycle : {};
  const notifications: Record<string, unknown> = isRecord(manifest.notifications) ? manifest.notifications : {};
  const seo: Record<string, unknown> = isRecord(manifest.seo) ? manifest.seo : {};

  return {
    ...manifest,
    bundleIdentifier: id,
    version: cleanString(manifest.version),
    name,
    packageName,
    displayName,
    shortName,
    description,
    type,
    route: normaliseRoute(manifest.route, id, type, notes),
    path: normalisePath(manifest.path, packageName, notes),
    componentKey,
    presentation,
    requiredServices,
    optionalServices,
    icon: {
      ...manifest.icon,
      src: cleanString(manifest.icon.src),
      alt: isNonEmptyString(manifest.icon.alt) ? cleanString(manifest.icon.alt) : `${displayName} icon`
    },
    webspring: {
      ...manifest.webspring
    },
    window: normaliseWindow(manifest.window, id, displayName, notes),
    frame: normaliseFrame(manifest.frame, notes),
    lifecycle,
    notifications,
    seo: {
      ...seo,
      title: isNonEmptyString(seo.title) ? cleanString(seo.title) : displayName,
      description: isNonEmptyString(seo.description) ? cleanString(seo.description) : description
    }
  };
}

export function explainAppInfo(appInfo: SynCloudOSAppInfo): SynCloudOSAppInfoExplanation {
  const unavailableServices = Object.entries(appInfo.serviceStatus)
    .filter(([, available]) => !available)
    .map(([serviceId]) => serviceId);
  const unavailableOptionalServices = Object.entries(appInfo.optionalServiceStatus)
    .filter(([, available]) => !available)
    .map(([serviceId]) => serviceId);
  const externalRouteSafety = appInfo.type === "external" ? inspectExternalRouteSafety(appInfo.route) : null;
  const externalRouteDisabled = Boolean(externalRouteSafety && !externalRouteSafety.safe);
  const disabled = appInfo.isDisabled || !appInfo.hasAccessToRequiredServices || externalRouteDisabled;
  const disabledReasons = [
    ...(appInfo.disabled === true
      ? [appInfo.disabledReason?.trim() || "Application disabled by its declaration."]
      : []),
    ...(!appInfo.hasAccessToRequiredServices
      ? [`Required services unavailable: ${unavailableServices.join(", ") || "unknown"}.`]
      : []),
    ...(externalRouteDisabled
      ? [externalRouteSafety?.reason ?? "External route must use http or https."]
      : [])
  ];

  return {
    packageName: appInfo.packageName,
    bundleIdentifier: appInfo.bundleIdentifier,
    displayName: appInfo.displayName,
    route: appInfo.route,
    path: appInfo.path,
    type: appInfo.type,
    presentation: normalizeSynCloudOSAppPresentation(appInfo.presentation, "appView"),
    visibleOnWebspring: appInfo.webspring.visible,
    hasAccessToRequiredServices: appInfo.hasAccessToRequiredServices,
    unavailableServices,
    unavailableOptionalServices,
    status: disabled ? "disabled" : "registered",
    reason: disabled
      ? disabledReasons.join(" ") || "AppInfo is marked disabled."
      : "Manifest accepted, bundle registered, and app manager ready."
  };
}

export function normaliseAppInfo(manifest: SynCloudOSAppManifest) {
  const validation = validateAppManifest(manifest);
  if (!validation.ok) {
    throw new Error(describeValidationReport(validation));
  }

  const normalisationNotes: SynCloudOSAppInfoNormalisationNote[] = [];
  const normalisedManifest = normaliseManifest(manifest, normalisationNotes);
  const capitalizedName = normalisedManifest.name.charAt(0).toUpperCase() + normalisedManifest.name.slice(1);
  const serviceStatus = Object.fromEntries(normalisedManifest.requiredServices.map((serviceId) => [serviceId, true]));
  const optionalServiceStatus = Object.fromEntries((normalisedManifest.optionalServices ?? []).map((serviceId) => [serviceId, true]));
  const unavailableOptionalServices: string[] = [];
  const hasAccessToRequiredServices = true;
  const externalRouteSafety = normalisedManifest.type === "external" ? inspectExternalRouteSafety(normalisedManifest.route) : null;
  const hasSafeExternalRoute = !externalRouteSafety || externalRouteSafety.safe;
  const now = Date.now();

  const info: SynCloudOSAppInfo = {
    ...normalisedManifest,
    icon: {
      maskAsset: selectionCircleUrl,
      warningArrowAsset: selectorArrowUrl,
      shadowAsset: timeMachineShadowUrl,
      focusAsset: selectionCircleUrl,
      spinnerAsset: spinnerUrl,
      alt: `${normalisedManifest.displayName} icon`,
      ...normalisedManifest.icon
    },
    webspring: {
      ...normalisedManifest.webspring
    },
    capitalizedName,
    registeredAt: now,
    normalizedAt: now,
    normalisationNotes,
    isReady: false,
    isDisabled: normalisedManifest.disabled === true || !hasAccessToRequiredServices || !hasSafeExternalRoute,
    isFailed: false,
    hasAccessToRequiredServices,
    serviceStatus,
    optionalServiceStatus,
    unavailableOptionalServices
  };

  return {
    info,
    validation,
    normalisationNotes,
    explanation: explainAppInfo(info)
  };
}

export function createAppInfo(manifest: SynCloudOSAppManifest): SynCloudOSAppInfo {
  return normaliseAppInfo(manifest).info;
}
