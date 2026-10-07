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

import { selectionCircleUrl, selectorArrowUrl, timeMachineShadowUrl, spinnerUrl } from "../Resources/frameworkAssets";
import {
  normalizeSynCloudOSAppPresentation,
  type SynCloudOSAppFrameLayout,
  type SynCloudOSAppFrameManifest,
  type SynCloudOSAppFrameMaterial,
  type SynCloudOSAppFrameSmoothSurfaceManifest,
  type SynCloudOSAppFrameSourceList,
  type SynCloudOSAppFrameTopBar,
  type SynCloudOSAppManifest,
  type SynCloudOSAppPresentation,
  type SynCloudOSAppType,
  type SynCloudOSAppWindowManifest,
  type SynCloudOSWindowChrome,
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
const windowChromeInputs = ["custom", "frameless", "system"];
const frameLayouts: SynCloudOSAppFrameLayout[] = ["defacto", "simple"];
const frameMaterials: SynCloudOSAppFrameMaterial[] = ["standard", "metal"];
const frameTopBars: SynCloudOSAppFrameTopBar[] = ["standard", "custom", "none"];
const framePresentationMotions = ["host", "content"] as const;
const frameSmoothSurfaceCurves = ["arc", "squircle", "superellipse", "clothoid"];
const defaultFrameSmoothSurface = {
  radius: 31,
  curve: "squircle",
  smoothing: 0.6,
  physicality: "default",
  overflow: "hidden"
} as const satisfies SynCloudOSAppFrameSmoothSurfaceManifest;
const defaultStandardFrame: SynCloudOSAppFrameManifest = {
  layout: "simple",
  material: "standard",
  topBar: "standard",
  presentationMotion: "host",
  rightSlot: "userInfo",
  smoothSurface: defaultFrameSmoothSurface
};
const defaultFrameSourceList = {
  minWidth: 208,
  maxWidth: 460,
  defaultWidth: 264
} as const satisfies Required<Omit<SynCloudOSAppFrameSourceList, "railLabel">>;

type NormalisedSynCloudOSAppManifest = SynCloudOSAppManifest & {
  presentation: SynCloudOSAppPresentation;
  frame: SynCloudOSAppFrameManifest;
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

function normaliseFrameField<T extends string>(
  frame: Record<string, unknown>,
  field: keyof SynCloudOSAppFrameManifest,
  valid: readonly T[],
  fallback: T,
  notes: SynCloudOSAppInfoNormalisationNote[]
): T {
  const value = frame[field];
  if (!(field in frame)) return fallback;
  if (valid.includes(value as T)) return value as T;
  note(notes, `frame.${String(field)}`, value, fallback, `Invalid frame ${String(field)} values are normalised to the default app-view composition.`);
  return fallback;
}

function normaliseFrameSmoothSurface(
  value: unknown,
  notes: SynCloudOSAppInfoNormalisationNote[]
): SynCloudOSAppFrameSmoothSurfaceManifest {
  if (value === undefined) return defaultFrameSmoothSurface;
  if (value === "off" || value === false) return "off";
  if (isFiniteNumber(value) && value >= 0) return value;
  if (!isRecord(value)) {
    note(notes, "frame.smoothSurface", value, defaultFrameSmoothSurface, "Invalid frame smoothSurface values use the default app smooth surface.");
    return defaultFrameSmoothSurface;
  }

  const output: Exclude<SynCloudOSAppFrameSmoothSurfaceManifest, "off" | false | number> = {};
  if (value.radius !== undefined) {
    if (isFiniteNumber(value.radius) && value.radius >= 0) {
      output.radius = value.radius;
    } else {
      note(notes, "frame.smoothSurface.radius", value.radius, defaultFrameSmoothSurface.radius, "Invalid smoothSurface radius values use the app default.");
    }
  }
  if (value.curve !== undefined) {
    if (frameSmoothSurfaceCurves.includes(value.curve as string)) {
      output.curve = value.curve as typeof output.curve;
    } else {
      note(notes, "frame.smoothSurface.curve", value.curve, defaultFrameSmoothSurface.curve, "Invalid smoothSurface curve values use the app default.");
    }
  }
  if (value.smoothing !== undefined) {
    if (isFiniteNumber(value.smoothing)) output.smoothing = Math.min(1, Math.max(0, value.smoothing));
    else note(notes, "frame.smoothSurface.smoothing", value.smoothing, defaultFrameSmoothSurface.smoothing, "Invalid smoothSurface smoothing values use the app default.");
  }
  if (value.exponent !== undefined) {
    if (isFiniteNumber(value.exponent) && value.exponent > 0) output.exponent = value.exponent;
    else note(notes, "frame.smoothSurface.exponent", value.exponent, undefined, "Invalid smoothSurface exponent values are ignored.");
  }
  if (value.preserveSmoothing !== undefined) {
    if (typeof value.preserveSmoothing === "boolean") output.preserveSmoothing = value.preserveSmoothing;
    else note(notes, "frame.smoothSurface.preserveSmoothing", value.preserveSmoothing, undefined, "Invalid smoothSurface preserveSmoothing values are ignored.");
  }
  (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).forEach((corner) => {
    if (value[corner] === undefined) return;
    if (isFiniteNumber(value[corner]) && value[corner] >= 0) output[corner] = value[corner];
    else note(notes, `frame.smoothSurface.${corner}`, value[corner], undefined, "Invalid smoothSurface corner radius values are ignored.");
  });
  if (value.overflow !== undefined) {
    if (value.overflow === "hidden" || value.overflow === "clip" || value.overflow === "visible") output.overflow = value.overflow;
    else note(notes, "frame.smoothSurface.overflow", value.overflow, defaultFrameSmoothSurface.overflow, "Invalid smoothSurface overflow values use the app default.");
  }
  if (value.physicality !== undefined) {
    if (value.physicality === "default" || value.physicality === "off" || isRecord(value.physicality)) {
      output.physicality = value.physicality as typeof output.physicality;
    } else {
      note(notes, "frame.smoothSurface.physicality", value.physicality, defaultFrameSmoothSurface.physicality, "Invalid smoothSurface physicality values use the app default.");
    }
  }

  return Object.keys(output).length === 0 ? defaultFrameSmoothSurface : output;
}

function normaliseFrameRightSlot(frame: Record<string, unknown>, notes: SynCloudOSAppInfoNormalisationNote[]): string {
  if (!("rightSlot" in frame)) return defaultStandardFrame.rightSlot;
  const value = frame.rightSlot;
  if (isNonEmptyString(value)) return value.trim();
  note(notes, "frame.rightSlot", value, defaultStandardFrame.rightSlot, "Invalid frame rightSlot values use the default user-info affordance.");
  return defaultStandardFrame.rightSlot;
}

function normaliseSourceListWidth(
  value: unknown,
  fallback: number,
  field: string,
  notes: SynCloudOSAppInfoNormalisationNote[]
): number {
  if (value === undefined) return fallback;
  if (isFiniteNumber(value) && value >= 1) return Math.round(value);
  note(notes, `frame.sourceList.${field}`, value, fallback, `Invalid frame sourceList ${field} values use the app default.`);
  return fallback;
}

function normaliseFrameSourceList(
  frame: Record<string, unknown>,
  topBar: SynCloudOSAppFrameTopBar,
  notes: SynCloudOSAppInfoNormalisationNote[]
): SynCloudOSAppFrameSourceList | undefined {
  if (!("sourceList" in frame) || frame.sourceList === undefined) return undefined;

  // A source-list rail only exists when the system owns the bar.
  if (topBar !== "standard") {
    note(notes, "frame.sourceList", frame.sourceList, undefined, "frame.sourceList is ignored unless topBar is \"standard\".");
    return undefined;
  }

  const value = frame.sourceList;
  if (!isRecord(value)) {
    note(notes, "frame.sourceList", value, defaultFrameSourceList, "Invalid frame sourceList values use the default source-list rail.");
    return { ...defaultFrameSourceList };
  }

  const minWidth = normaliseSourceListWidth(value.minWidth, defaultFrameSourceList.minWidth, "minWidth", notes);
  const maxWidthRaw = normaliseSourceListWidth(value.maxWidth, defaultFrameSourceList.maxWidth, "maxWidth", notes);
  const maxWidth = Math.max(minWidth, maxWidthRaw);
  if (maxWidth !== maxWidthRaw) {
    note(notes, "frame.sourceList.maxWidth", maxWidthRaw, maxWidth, "sourceList maxWidth is raised to at least minWidth.");
  }
  const defaultWidthRaw = normaliseSourceListWidth(value.defaultWidth, defaultFrameSourceList.defaultWidth, "defaultWidth", notes);
  const defaultWidth = Math.min(maxWidth, Math.max(minWidth, defaultWidthRaw));
  if (defaultWidth !== defaultWidthRaw) {
    note(notes, "frame.sourceList.defaultWidth", defaultWidthRaw, defaultWidth, "sourceList defaultWidth is clamped into [minWidth, maxWidth].");
  }

  const output: SynCloudOSAppFrameSourceList = { minWidth, maxWidth, defaultWidth };
  if (value.railLabel !== undefined) {
    if (isNonEmptyString(value.railLabel)) output.railLabel = value.railLabel.trim();
    else note(notes, "frame.sourceList.railLabel", value.railLabel, undefined, "Empty sourceList railLabel falls back to the app short name.");
  }
  return output;
}

function normaliseFrame(frame: unknown, notes: SynCloudOSAppInfoNormalisationNote[]): SynCloudOSAppFrameManifest {
  const record = isRecord(frame) ? frame : {};
  if (frame !== undefined && !isRecord(frame)) {
    note(notes, "frame", frame, defaultStandardFrame, "Frame composition must be an object.");
  }

  const topBar = normaliseFrameField(record, "topBar", frameTopBars, defaultStandardFrame.topBar, notes);
  const sourceList = normaliseFrameSourceList(record, topBar, notes);

  return {
    layout: normaliseFrameField(record, "layout", frameLayouts, defaultStandardFrame.layout, notes),
    material: normaliseFrameField(record, "material", frameMaterials, defaultStandardFrame.material, notes),
    topBar,
    presentationMotion: normaliseFrameField(record, "presentationMotion", framePresentationMotions, "host", notes),
    rightSlot: normaliseFrameRightSlot(record, notes),
    smoothSurface: normaliseFrameSmoothSurface(record.smoothSurface, notes),
    ...(sourceList ? { sourceList } : {})
  };
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
    : `application.${appId}.primary`;
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
    chrome: normaliseWindowChrome(record.chrome, notes),
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

function normaliseWindowChrome(
  value: unknown,
  notes: SynCloudOSAppInfoNormalisationNote[],
): SynCloudOSWindowChrome {
  if (value === "custom" || value === "frameless" || value === "system") return value;
  if (value !== undefined) {
    note(notes, "window.chrome", value, "system", "Invalid window chrome values use system chrome.");
  }
  return "system";
}

function createValidationReport(manifest: unknown, issues: SynCloudOSAppInfoIssue[]): SynCloudOSAppInfoValidationReport {
  const record = isRecord(manifest) ? manifest : {};
  const manifestId = isNonEmptyString(record.id) ? record.id.trim() : null;
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
    "id",
    "name",
    "packageName",
    "bundleId",
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

  if (manifest.frame !== undefined) {
    const frame = getNestedRecord(manifest, "frame");
    if (!frame) {
      addIssue(issues, "warning", "manifest.frame.defaulted", "frame", "frame must be an object and will default to the standard app-view composition.");
    } else {
      if (frame.layout !== undefined && !frameLayouts.includes(frame.layout as SynCloudOSAppFrameLayout)) {
        addIssue(issues, "warning", "manifest.frame.layout.defaulted", "frame.layout", "frame.layout is unknown and will default to simple.");
      }
      if (frame.material !== undefined && !frameMaterials.includes(frame.material as SynCloudOSAppFrameMaterial)) {
        addIssue(issues, "warning", "manifest.frame.material.defaulted", "frame.material", "frame.material is unknown and will default to standard.");
      }
      if (frame.topBar !== undefined && !frameTopBars.includes(frame.topBar as SynCloudOSAppFrameTopBar)) {
        addIssue(issues, "warning", "manifest.frame.topBar.defaulted", "frame.topBar", "frame.topBar is unknown and will default to standard.");
      }
      if (frame.rightSlot !== undefined && typeof frame.rightSlot !== "string") {
        addIssue(issues, "warning", "manifest.frame.rightSlot.defaulted", "frame.rightSlot", "frame.rightSlot must be a registry-key string and will default to userInfo.");
      }
      if (frame.presentationMotion !== undefined && !framePresentationMotions.includes(frame.presentationMotion as "host" | "content")) {
        addIssue(issues, "warning", "manifest.frame.presentationMotion.defaulted", "frame.presentationMotion", "frame.presentationMotion must be host or content and will default to host.");
      }
      if (frame.smoothSurface !== undefined) {
        const smoothSurface = frame.smoothSurface;
        const validSmoothSurface =
          smoothSurface === "off" ||
          smoothSurface === false ||
          isFiniteNumber(smoothSurface) ||
          isRecord(smoothSurface);
        if (!validSmoothSurface) {
          addIssue(issues, "warning", "manifest.frame.smoothSurface.defaulted", "frame.smoothSurface", "frame.smoothSurface is unknown and will default to the standard smooth app surface.");
        } else if (isRecord(smoothSurface)) {
          if (smoothSurface.radius !== undefined && (!isFiniteNumber(smoothSurface.radius) || smoothSurface.radius < 0)) {
            addIssue(issues, "warning", "manifest.frame.smoothSurface.radius.defaulted", "frame.smoothSurface.radius", "frame.smoothSurface.radius must be a non-negative number.");
          }
          if (smoothSurface.curve !== undefined && !frameSmoothSurfaceCurves.includes(smoothSurface.curve as string)) {
            addIssue(issues, "warning", "manifest.frame.smoothSurface.curve.defaulted", "frame.smoothSurface.curve", "frame.smoothSurface.curve is unknown and will default to squircle.");
          }
        }
      }
      if (frame.sourceList !== undefined) {
        if (frame.topBar !== undefined && frame.topBar !== "standard") {
          addIssue(issues, "warning", "manifest.frame.sourceList.ignored", "frame.sourceList", "frame.sourceList is only honoured when frame.topBar is \"standard\" and will otherwise be ignored.");
        } else if (!isRecord(frame.sourceList)) {
          addIssue(issues, "warning", "manifest.frame.sourceList.defaulted", "frame.sourceList", "frame.sourceList must be an object and will default to the standard source-list rail.");
        } else {
          (["minWidth", "maxWidth", "defaultWidth"] as const).forEach((widthField) => {
            const widthValue = (frame.sourceList as Record<string, unknown>)[widthField];
            if (widthValue !== undefined && (!isFiniteNumber(widthValue) || widthValue < 1)) {
              addIssue(issues, "warning", `manifest.frame.sourceList.${widthField}.defaulted`, `frame.sourceList.${widthField}`, `frame.sourceList.${widthField} must be a positive number.`);
            }
          });
        }
      }
    }
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
    if (webspring.dialPosition !== undefined && !isFiniteNumber(webspring.dialPosition)) {
      addIssue(issues, "warning", "manifest.webspring.dialPosition.ignored", "webspring.dialPosition", "webspring.dialPosition is not used for normal Webspring layout and must be finite when present.");
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
    if (!windowChromeInputs.includes(String(window.chrome))) {
      addIssue(issues, "error", "manifest.window.chrome.invalid", "window.chrome", "window.chrome must be system, custom, or frameless.");
    }
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
  const id = cleanString(manifest.id);
  const name = cleanString(manifest.name);
  const packageName = cleanString(manifest.packageName);
  const bundleId = cleanString(manifest.bundleId);
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
    id,
    name,
    packageName,
    bundleId,
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
    appId: appInfo.id,
    packageName: appInfo.packageName,
    bundleId: appInfo.bundleId,
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
