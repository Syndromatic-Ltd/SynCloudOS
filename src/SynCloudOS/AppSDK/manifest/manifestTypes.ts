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

export type SynCloudOSAppFrameSmoothSurfaceCurve = "arc" | "squircle" | "superellipse" | "clothoid";
export type SynCloudOSAppFrameSmoothSurfacePhysicality = "default" | "off" | {
  top?: { offsetX?: number; offsetY: number; blur?: number; spread?: number; color: string; opacity: number };
  bottom?: { offsetX?: number; offsetY: number; blur?: number; spread?: number; color: string; opacity: number };
};
export type SynCloudOSAppFrameSmoothSurfaceManifest = "off" | false | number | {
  radius?: number;
  curve?: SynCloudOSAppFrameSmoothSurfaceCurve;
  smoothing?: number;
  exponent?: number;
  preserveSmoothing?: boolean;
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
  overflow?: "hidden" | "clip" | "visible";
  physicality?: SynCloudOSAppFrameSmoothSurfacePhysicality;
};

/** Host-owned bundle-location identity used when projecting one captured V1
 * authoring manifest into the runtime registry shape. */
export interface SynWareRuntimeManifestContext {
  /** Legal attribution belongs to the host, not the framework vendor. */
  readonly about?: { readonly copyright?: string; readonly trademark?: string; readonly tagline?: string };
  readonly appRoot: string;
  readonly packageName: string;
  readonly path: string;
  /** Resource path to URL, for the resources the manifest names (the frame's right-slot icon). Omitted for hosts that
   *  bundle none, which use the resource path itself. */
  readonly resourceUrls?: Readonly<Record<string, string>>;
  readonly componentKey: string;
}

export type SynWarePresentation = "desktop" | "tablet" | "mobile";

export interface SynWareRouteManifest {
  readonly path: string;
  readonly title?: string;
  readonly primary?: boolean;
  readonly match?: "exact" | "prefix";
}

export interface SynWareMinimumViewportManifest {
  readonly width?: number;
  readonly height?: number;
}

export interface SynWareWindowDefaultsManifest {
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly minimumWidth?: number;
  readonly minimumHeight?: number;
  /** Window chrome anatomy for windows this app creates. Defaults to "system". */
  readonly chrome?: "system" | "custom" | "frameless";
  /** Full SmoothSurface manifest shape (radius, curve, smoothing, exponent,
   * per-corner overrides, overflow, physicality), "off"/false, or a bare
   * radius number. */
  readonly smoothSurface?: SynCloudOSAppFrameSmoothSurfaceManifest;
  readonly resizable?: boolean;
  readonly role?: "standard" | "panel" | "modal" | "sheet" | "hud";
}

/** A painted area for an app's background: colour, texture, tint, spotlight and an overlay, drawn in that order.
 *  Image values are URLs. The same shape as the Webspring Board's `WebspringSurface`. */
export interface SynWareSurfaceManifest {
  /** The base colour, beneath the texture. */
  readonly colour?: string;
  readonly texture?: {
    readonly image: string;
    /** A CSS `background-size`. */
    readonly size?: string;
    /** Tile the image. Defaults to `true`. */
    readonly repeat?: boolean;
    /** A CSS `background-position`. */
    readonly position?: string;
  } | "none";
  /** A wash of colour over the texture. `opacity` is from 0 to 1. */
  readonly tint?: { readonly colour: string; readonly opacity: number };
  /** A spotlight: a lighter centre (white) and darkened edges (black), each from 0 to 1. `false` draws none. */
  readonly vignette?: { readonly centre?: number; readonly edge?: number } | false;
  /** An image over everything else, such as a glow. */
  readonly overlay?: {
    readonly image: string;
    readonly size?: string;
    readonly opacity?: number;
    readonly blend?: string;
  };
}

/** What fills the app's body behind its content. `"system"` is the light or dark app background,
 *  `"none"` leaves the body unpainted for the app to paint, and a surface paints that. */
export type SynWareFrameBackgroundManifest = "system" | "none" | SynWareSurfaceManifest;

/** The control in the standard top bar's right slot. `"auto"` is a gear; `"userInfo"` a person; `"none"` draws nothing. */
export type SynWareFrameRightSlotManifest = "auto" | "userInfo" | "none" | {
  readonly icon: SynWareResourceReference;
  readonly label: SynWareLocalisedText;
};

export interface SynWareFrameManifest {
  readonly material?: "standard" | "metal";
  readonly topBar?: "standard" | "custom" | "none";
  /** Defaults to host motion. Content owns its launch and return choreography. */
  readonly presentationMotion?: "host" | "content";
  /** Defaults to `"auto"`. */
  readonly rightSlot?: SynWareFrameRightSlotManifest;
  /** Defaults to `"system"`. */
  readonly background?: SynWareFrameBackgroundManifest;
  readonly smoothSurface?: "off" | { readonly radius?: number };
  readonly sourceList?: {
    readonly railLabel?: string;
    readonly minWidth?: number;
    readonly maxWidth?: number;
    readonly defaultWidth?: number;
  };
}

export interface SynWareApplicationMenuManifest {
  readonly trigger?: "content";
  readonly preferences?: { readonly commandId: string; readonly label?: string };
}

export interface SynWareDocumentTypeManifest {
  readonly id: string;
  readonly extensions?: readonly string[];
  readonly displayName?: string;
}

export interface SynWareCommandManifest {
  readonly id: string;
  readonly title: string;
  readonly menu?: string;
  readonly shortcut?: string;
}

export interface SynWareMenuManifest {
  readonly id: string;
  readonly title: string;
  readonly commandIds?: readonly string[];
}

export interface SynWareServiceManifest {
  readonly id: string;
  readonly required?: boolean;
  readonly minimumVersion?: string;
}

export interface SynWareLocaleBundleManifest {
  readonly locale: string;
  readonly path: string;
}

/**
 * `development`: the development server and development builds serve it;
 * production builds leave it out. Omitted: every build serves it.
 */
export type SynWareApplicationAvailability = "development";

/** Every V1 manifest field is optional in `Contents/Info.ts`: what it omits is
 * derived from the folder name, the project's `package.json` version and the
 * files in `Contents/Resources`. */
export type SynWareManifestOverrides = Partial<SynWareManifestV1>;

export interface SynWareAppearanceManifest {
  readonly id: string;
  /** "system" follows the host's theme; "neutral" opts out of themed chrome. */
  readonly variant?: "system" | "neutral";
}

export interface SynWareLifecycleManifest {
  /** Opt into speculative module preloading. False does not prevent launch. */
  readonly preload?: boolean;
  readonly suspend?: boolean;
  readonly resume?: boolean;
  readonly terminate?: boolean;
}

export interface SynWareBackgroundManifest {
  readonly enabled?: boolean;
  readonly tasks?: readonly string[];
}

/** Runtime-governing intent which must be explicit when it differs from the
 * generic V1 declaration defaults. This keeps identity and policy independent
 * from an app's historical identifier. */
export interface SynWareRuntimeManifest {
  /** Keep the app registered while blocking launch and module preloading. */
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly bundleId?: string;
  readonly presentation?: "appView" | "windowedView" | "systemSheet" | "backgroundService";
  readonly type?: "internal" | "system" | "external";
  readonly policy?: {
    readonly public?: boolean;
    readonly requiresLogin?: boolean;
    readonly requiredCapabilities?: readonly string[];
    readonly requiredAccessClasses?: readonly ("team" | "external")[];
  };
  readonly notifications?: { readonly badgeCount?: number };
}

export interface SynWareWebspringManifest {
  readonly order?: number;
  readonly icon?: string;
  readonly visible?: boolean;
  readonly featured?: boolean;
  readonly defaultSelected?: boolean;
}

export interface SynWareLocalisedText {
  readonly key: string;
  readonly fallback?: string;
}

export interface SynWareResourceReference {
  readonly resource: string;
  readonly alternativeText: SynWareLocalisedText;
}

export interface SynWareWebspringViewManifest {
  readonly id: string;
  readonly presentations: readonly SynWarePresentation[];
  readonly mode: "launcher" | "persistent";
}

/** A folder the Webspring shell seeds on first run. */
export interface SynWareWebspringFolderManifest {
  /** `folder.` followed by a lowercase slug; unique, and never an app ID. */
  readonly id: string;
  readonly title: SynWareLocalisedText;
  /** Sorted with the apps' `webspring.order`; on a tie folders come first, then IDs. */
  readonly order: number;
  /** Member app IDs in order. An app may belong to one folder only; unknown or
   *  invisible IDs are skipped. */
  readonly apps: readonly string[];
}

export interface SynWareWebspringFoldersManifest {
  /** Whether visitors create, fill and empty folders by dragging. */
  readonly editable: boolean;
  readonly initial: readonly SynWareWebspringFolderManifest[];
}

export interface SynWareWebspringShellManifest {
  readonly views: readonly SynWareWebspringViewManifest[];
  readonly defaults: Readonly<Record<SynWarePresentation, string>>;
  readonly homeRoute: string;
  readonly branding: {
    readonly name: SynWareLocalisedText;
    readonly logo?: SynWareResourceReference;
    readonly lightLogo?: SynWareResourceReference;
    readonly darkLogo?: SynWareResourceReference;
    readonly compactLogo?: SynWareResourceReference;
    /** A single-shape SVG for the top bar's "return to Webspring" button, drawn in the theme's colours. Omitted: a generic house. */
    readonly homeIcon?: SynWareResourceReference;
  };
  /** Omitted means `{ editable: false, initial: [] }`. */
  readonly folders?: SynWareWebspringFoldersManifest;
}

export interface SynWareManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly routes?: readonly SynWareRouteManifest[];
  readonly presentations?: readonly SynWarePresentation[];
  readonly minimumViewport?: SynWareMinimumViewportManifest;
  readonly windowDefaults?: SynWareWindowDefaultsManifest;
  readonly frame?: SynWareFrameManifest;
  readonly documentTypes?: readonly SynWareDocumentTypeManifest[];
  readonly commands?: readonly SynWareCommandManifest[];
  readonly menus?: readonly SynWareMenuManifest[];
  readonly applicationMenu?: SynWareApplicationMenuManifest;
  readonly services?: readonly SynWareServiceManifest[];
  readonly permissions?: readonly string[];
  /** Whether the build serves this application in development only. */
  readonly availability?: SynWareApplicationAvailability;
  readonly appearances?: readonly SynWareAppearanceManifest[];
  readonly lifecycle?: SynWareLifecycleManifest;
  readonly background?: SynWareBackgroundManifest;
  readonly runtime?: SynWareRuntimeManifest;
  readonly migrationVersion?: number;
  readonly webspring?: SynWareWebspringManifest;
  readonly webspringShell?: SynWareWebspringShellManifest;
}

export interface SynWareManifestIssue {
  readonly path: string;
  readonly code: "required" | "type" | "unknown-key" | "format" | "conflict";
  readonly message: string;
}

export interface SynWareManifestValidationSuccess<TManifest extends SynWareManifestV1 = SynWareManifestV1> {
  readonly ok: true;
  readonly value: TManifest;
  readonly errors: readonly [];
}

export interface SynWareManifestValidationFailure {
  readonly ok: false;
  readonly value: null;
  readonly errors: readonly SynWareManifestIssue[];
}

export type SynWareManifestValidation = SynWareManifestValidationSuccess | SynWareManifestValidationFailure;
