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

import type { WindowBounds, WindowRecord, WindowRole, WindowStyle } from "../Windows";
import type { SynCloudOSAppAccessPolicy } from "../PolicyKit/policyTypes";
import type {
  SynCloudOSAppInfoExplanation,
  SynCloudOSAppInfoIssue,
  SynCloudOSAppInfoNormalisationNote,
  SynCloudOSAppInfoValidationReport
} from "../AppInfo/appInfoTypes";
import type {
  SynWareFrameBackgroundManifest,
  SynWareLocalisedText,
  SynCloudOSAppFrameSmoothSurfaceCurve,
  SynCloudOSAppFrameSmoothSurfaceManifest,
  SynCloudOSAppFrameSmoothSurfacePhysicality,
} from "../AppSDK/manifest/manifestTypes";

export type {
  SynCloudOSAppFrameSmoothSurfaceCurve,
  SynCloudOSAppFrameSmoothSurfaceManifest,
  SynCloudOSAppFrameSmoothSurfacePhysicality,
} from "../AppSDK/manifest/manifestTypes";

export type SynCloudOSAppType = "internal" | "external" | "system";
export type SynCloudOSAppPresentation = "appView" | "windowedView" | "systemSheet" | "backgroundService";
/** The right-slot control with its icon resolved to a URL. `"auto"` is a gear, `"userInfo"` a person, `"none"` nothing. */
export type SynCloudOSAppFrameRightSlot = "auto" | "userInfo" | "none" | {
  readonly icon: string;
  readonly label: SynWareLocalisedText;
};
export type SynCloudOSAppFrameBackground = SynWareFrameBackgroundManifest;
export type SynCloudOSAppFrameMaterial = "standard" | "metal";
export type SynCloudOSAppFrameTopBar = "standard" | "custom" | "none";
export type SynCloudOSWindowChrome = "system" | "custom" | "frameless";

export function normalizeSynCloudOSAppPresentation(
  presentation: unknown,
  fallback: SynCloudOSAppPresentation = "appView"
): SynCloudOSAppPresentation {
  if (
    presentation === "appView" ||
    presentation === "windowedView" ||
    presentation === "systemSheet" ||
    presentation === "backgroundService"
  ) {
    return presentation;
  }
  return fallback;
}

export interface SynCloudOSAppIconManifest {
  src: string;
  src2x?: string;
  src3x?: string;
  maskAsset?: string;
  warningArrowAsset?: string;
  shadowAsset?: string;
  focusAsset?: string;
  spinnerAsset?: string;
  alt?: string;
}

export interface SynCloudOSStagePoint {
  x: number;
  y: number;
}

export interface SynCloudOSAppWebspringManifest {
  visible: boolean;
  order: number;
  dialPosition?: number;
  featured?: boolean;
  defaultSelected?: boolean;
  accent?: string;
  stagePosition?: SynCloudOSStagePoint;
  indicatorPosition?: SynCloudOSStagePoint;
  selectorAngle?: number;
  labelPosition?: SynCloudOSStagePoint;
  labelAsset?: string;
}

export interface SynCloudOSAppWindowManifest {
  title: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  chrome: SynCloudOSWindowChrome;
  smoothSurface: SynCloudOSAppFrameSmoothSurfaceManifest;
  resizable: boolean;
  /** Canonical NSE window role used by windowedView presentations. */
  role: Extract<WindowRole, "standard" | "panel" | "hud">;
  defaultBounds: WindowBounds;
  minimumSize: { readonly width: number; readonly height: number };
  style: readonly WindowStyle[];
  mobilePolicy: WindowRecord["mobilePolicy"];
  restorationKey: string;
}

/**
 * Optional source-list window primitive. When present (and `topBar:"standard"`), the system frame
 * draws a sidebar-aligned rail seam in the top bar/status bar and owns a resizable sidebar width.
 * The app supplies only sidebar + main content via `NSESourceListScene`; it never re-implements the
 * bar, the seam, the resizer, or QuickSwitch.
 */
export interface SynCloudOSAppFrameSourceList {
  /** Rail wordmark. Defaults to the app's short name (resolved through the locale layer) so an app
   *  that already declares its identity does not restate it. Override only when the rail label must
   *  differ from the app name. */
  railLabel?: string;
  /** Resizable sidebar lower bound (px). Default 208. */
  minWidth?: number;
  /** Resizable sidebar upper bound (px). Default 460. */
  maxWidth?: number;
  /** Responsive default sidebar width (px). Default 264. Clamped into `[minWidth, maxWidth]`. */
  defaultWidth?: number;
}

export interface SynCloudOSAppFrameManifest {
  /** Chrome skin. Drives the standard top bar's look. `metal` is light/dark-aware. */
  material: SynCloudOSAppFrameMaterial;
  /** Top-bar behaviour. `standard` ⟹ system chrome, `custom` ⟹ app-owned chrome (may draw no bar), `none` ⟹ no bar + runtime return. */
  topBar: SynCloudOSAppFrameTopBar;
  /** Host launch/return motion, or motion completed by the application's content. */
  presentationMotion?: "host" | "content";
  /** The standard bar's right-hand control. Honoured only when `topBar:"standard"`. */
  rightSlot: SynCloudOSAppFrameRightSlot;
  /** What fills the body behind the content. */
  background: SynCloudOSAppFrameBackground;
  smoothSurface: SynCloudOSAppFrameSmoothSurfaceManifest;
  /** System-owned source-list rail. Honoured only when `topBar:"standard"`; otherwise dropped. */
  sourceList?: SynCloudOSAppFrameSourceList;
}

export interface SynCloudOSAppLifecycleManifest {
  preload?: boolean;
  loadInBackground?: boolean;
  awakesInBackgroundFromNotification?: boolean;
}

export interface SynCloudOSAppNotificationManifest {
  showsNotifications?: boolean;
  badgeCount?: number;
}

export interface SynCloudOSAppMenuPreferencesContribution {
  /** App-owned responder command. System Preferences uses system.showPreferences separately. */
  readonly commandId: string;
  readonly label?: string;
}

export interface SynCloudOSAppMenuManifest {
  readonly trigger?: "content";
  readonly preferences?: SynCloudOSAppMenuPreferencesContribution;
}

export interface SynCloudOSAppSeoManifest {
  title: string;
  description: string;
}

/**
 * What the About box shows. Mirrors the Info.plist keys macOS's standard About
 * panel reads, so the mapping stays obvious to anyone coming from a .app bundle:
 *
 *   version   → CFBundleShortVersionString  (the user-facing "Version 1.0")
 *   build     → CFBundleVersion             (shown in parentheses after it)
 *   copyright → NSHumanReadableCopyright
 *   name/icon → CFBundleName / CFBundleIconFile, already on the manifest
 *
 * `trademark` and `tagline` have no Info.plist equivalent — macOS apps put that
 * text in Credits.rtf. They are first-class here because every Syndromatic app
 * carries the same trademark line and a one-line statement of what it is.
 */
export interface SynCloudOSAppAboutManifest {
  version: string;
  build?: string;
  copyright: string;
  trademark: string;
  tagline?: string;
}

export interface SynCloudOSAppRouteClaim {
  readonly path: string;
  readonly match: "exact" | "prefix";
}

export interface SynCloudOSAppManifest {
  id: string;
  name: string;
  packageName: string;
  bundleId: string;
  displayName: string;
  shortName: string;
  description: string;
  type: SynCloudOSAppType;
  /** Declared disablement survives service availability recomputation. */
  disabled?: boolean;
  disabledReason?: string;
  route: string;
  /** Static routing ownership projected from the authoring manifest. The
   * primary route remains the app identity; these claims decide which full
   * destinations belong to the app without evaluating bundle code. */
  routeClaims?: readonly SynCloudOSAppRouteClaim[];
  path: string;
  componentKey: string;
  presentation?: SynCloudOSAppPresentation;
  requiredServices: string[];
  optionalServices?: string[];
  icon: SynCloudOSAppIconManifest;
  webspring: SynCloudOSAppWebspringManifest;
  window: SynCloudOSAppWindowManifest;
  frame?: Partial<SynCloudOSAppFrameManifest>;
  lifecycle: SynCloudOSAppLifecycleManifest;
  notifications: SynCloudOSAppNotificationManifest;
  applicationMenu?: SynCloudOSAppMenuManifest;
  seo: SynCloudOSAppSeoManifest;
  about: SynCloudOSAppAboutManifest;
  policy?: SynCloudOSAppAccessPolicy;
}

export type SynCloudOSAppRegistryMap = Record<string, SynCloudOSAppManifest>;

export type SynCloudOSAppRegistrationAction = "register" | "update" | "unregister" | "failed";
export type SynCloudOSAppRegistrationIssueSeverity = "fatal" | "warning";
export type SynCloudOSAppRegistrationRouteMatchMode = "path" | "href" | "none";
export type SynCloudOSAppRegistrationCollisionField = "bundleId" | "packageName" | "route" | "componentKey";

export interface SynCloudOSAppRegistrationCollision {
  field: SynCloudOSAppRegistrationCollisionField;
  value: string;
  normalizedValue?: string | null;
  existingAppId: string;
  existingPackageName: string;
}

export interface SynCloudOSAppRegistrationIssue {
  severity: SynCloudOSAppRegistrationIssueSeverity;
  code: string;
  field: string;
  message: string;
  source: "AppInfo" | "AppRegistry";
  disablesApp?: boolean;
  collision?: SynCloudOSAppRegistrationCollision;
  appInfoIssue?: SynCloudOSAppInfoIssue;
}

export interface SynCloudOSAppRegistrationPreflightReport {
  id: string;
  at: number;
  action: "register" | "update";
  ok: boolean;
  appId: string | null;
  packageName: string | null;
  bundleId: string | null;
  route: string | null;
  normalizedRoute: string | null;
  routeKey: string | null;
  routeMatchMode: SynCloudOSAppRegistrationRouteMatchMode;
  canonicalHref: string | null;
  componentKey: string | null;
  previousApp: {
    appId: string;
    packageName: string;
    bundleId: string;
    route: string;
    componentKey: string;
  } | null;
  disabled: boolean;
  collisions: SynCloudOSAppRegistrationCollision[];
  issues: SynCloudOSAppRegistrationIssue[];
  fatalIssues: SynCloudOSAppRegistrationIssue[];
  warnings: SynCloudOSAppRegistrationIssue[];
  validation: SynCloudOSAppInfoValidationReport | null;
  normalisationNotes: SynCloudOSAppInfoNormalisationNote[];
  explanation: SynCloudOSAppInfoExplanation | null;
}

export interface SynCloudOSAppRegistrationHistoryRecord {
  id: string;
  appId: string;
  packageName: string;
  action: SynCloudOSAppRegistrationAction;
  result: "accepted" | "rejected" | "removed";
  at: number;
  reason?: string;
  bundleId?: string;
  route?: string;
  normalizedRoute?: string | null;
  routeKey?: string | null;
  componentKey?: string;
  reportId?: string;
  warnings: SynCloudOSAppRegistrationIssue[];
  fatalIssues: SynCloudOSAppRegistrationIssue[];
  report?: SynCloudOSAppRegistrationPreflightReport;
}
