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

import type { ComponentType, ReactNode } from "react";
import type { SmoothSurfaceCurve, SmoothSurfaceRadius } from "../NSE/SmoothSurface";
import type {
  SynWareLocalisedText,
  SynWarePresentation,
  SynWareResourceReference,
} from "../SynCloudOS/AppSDK";
import type { NSEPreferencePaneClass, PreferencePaneDescriptor } from "../SynCloudOS/Preferences";
import type { WSWidgetDescriptor } from "./WSWidget";
import type {
  AuthenticationConfiguration as RuntimeAuthenticationConfiguration,
  AuthenticationInput as RuntimeAuthenticationInput,
  AuthenticationPolicy as RuntimeAuthenticationPolicy,
} from "../SynCloudOS/SynCloudOS";

export type Presentation = SynWarePresentation;
export type ShellMode = "launcher" | "persistent";
export type LocalisedText = SynWareLocalisedText;
export type ResourceReference = SynWareResourceReference;

export interface WSIconEffectProps {
  readonly active: boolean;
  readonly subtle: boolean;
  readonly className?: string;
}
export type WSIconEffectComponent = ComponentType<WSIconEffectProps>;

export type WSActionResult =
  | { readonly status: "completed" }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly message: string };

export type ActionResult = WSActionResult;

/** A painted area: colour, texture, tint, spotlight and an overlay, drawn in that order. */
export interface WSSurface {
  /** The base colour, beneath the texture. Defaults to transparent. */
  readonly colour?: string;
  /** An image under the tint; `"none"` (or omitted) draws none. */
  readonly texture?: {
    readonly image: string;
    /** A CSS `background-size`. Defaults to `auto`. */
    readonly size?: string;
    /** Tile the image. Defaults to `true`; `false` draws it once. */
    readonly repeat?: boolean;
    /** A CSS `background-position`. Defaults to `0 0` when tiled and `center` otherwise. */
    readonly position?: string;
  } | "none";
  /** A wash of colour over the texture. `opacity` is from 0 to 1. */
  readonly tint?: { readonly colour: string; readonly opacity: number };
  /** A spotlight: a lighter centre (`centre`, white) and darkened edges (`edge`, black), each from 0 to 1.
   *  `false` draws none. */
  readonly vignette?: { readonly centre?: number; readonly edge?: number } | false;
  /** An image over everything else, such as a glow. `opacity` defaults to 1 and `blend` to `normal`. */
  readonly overlay?: {
    readonly image: string;
    readonly size?: string;
    readonly opacity?: number;
    readonly blend?: string;
  };
}

/** The Board's two painted areas. `shelf` is drawn only when the definition has widgets. */
export interface WebspringBackgroundInput {
  readonly launcher: WSSurface;
  readonly shelf?: WSSurface;
}

/** A background with every default filled in. */
export interface WebspringBackground {
  readonly launcher: WSSurface;
  readonly shelf: WSSurface;
}

/** A widget as a view shows it: its text and icon resolved. */
export interface WSWidgetEntry {
  readonly widget: WSWidgetDescriptor;
  readonly title: string;
  readonly iconUrl: string | null;
  /** The text shown when the widget is empty and `whenEmpty` is a message. */
  readonly emptyMessage: string | null;
}

/** The site's name and logos, resolved for the current locale and resources. */
export interface WSResolvedBranding {
  readonly name: string;
  readonly logoUrl: string | null;
  readonly logoAlt: string;
  readonly lightLogoUrl: string | null;
  readonly darkLogoUrl: string | null;
  readonly compactLogoUrl: string | null;
}

export type WSAccountAction =
  | { readonly kind: "none" }
  | { readonly kind: "pending" }
  | { readonly kind: "signIn"; readonly label: string }
  | { readonly kind: "account"; readonly label: string; readonly signOutLabel: string };

/** Where an entry sits on the desktop stage. */
export interface WebspringDialPlacement {
  readonly angle: number | null;
  readonly iconPosition: { readonly x: number; readonly y: number };
  readonly indicatorPosition: { readonly x: number; readonly y: number } | null;
  readonly labelPosition: { readonly x: number; readonly y: number };
}

export interface WSApp {
  readonly bundleIdentifier: string;
  readonly displayName: string;
  readonly iconUrl: string | null;
  readonly route: string;
  readonly selected: boolean;
  readonly running: boolean;
  readonly state: "registered" | "idle" | "loading" | "ready" | "launching" | "active" | "suspended" | "failed" | "closed" | "disabled";
  readonly disabledReason?: string;
  readonly badgeCount: number;
  readonly badgeLabel?: string;
  readonly accent: string;
  readonly featured: boolean;
  readonly selectorAngle: number;
}

export interface WSAppItem {
  readonly kind: "app";
  readonly id: string;
  readonly app: WSApp;
  readonly dialPlacement: WebspringDialPlacement;
}

export interface WSFolderItem {
  readonly kind: "folder";
  readonly id: string;
  readonly title: string;
  readonly apps: readonly WSApp[];
  /** The members' badge counts, summed. */
  readonly badgeCount: number;
  readonly dialPlacement: WebspringDialPlacement;
}

/** A top-level Webspring entry: an app, or a folder of apps. */
export type WSItem = WSAppItem | WSFolderItem;

export interface WebspringViewModel {
  readonly presentation: Presentation;
  readonly activeAppId: string | null;
  readonly routePath: string;
  readonly sessionState: "authorised" | "locked";
  readonly shellLockState: "login" | "webspring";
  readonly entrancePhase: "waiting" | "holding" | "ready";
  readonly selectedAppId: string | null;
  readonly hoveredAppId: string | null;
  readonly activeIndicatorId: string | null;
  readonly selectorAngle: number;
  readonly previewAppId: string | null;
  readonly launchingAppId: string | null;
  readonly launchTransitionId: string | null;
  readonly returnTransitionId: string | null;
  readonly launchPhase: "idle" | "staging" | "launching" | "covered" | "returning";
  readonly layout: {
    readonly editing: boolean;
    /** The app or folder being dragged. */
    readonly draggingItemId: string | null;
    readonly board: { readonly version: 1; readonly pageSize: number; readonly dockSize: number };
  };
  readonly presentationTraits: {
    readonly width: number;
    readonly height: number;
    readonly reducedMotion: boolean;
    readonly safeAreaInsets: { readonly blockStart: number; readonly inlineEnd: number; readonly blockEnd: number; readonly inlineStart: number };
  };
  /** Every visible app, flat, in display order; folder members appear inline. */
  readonly apps: readonly WSApp[];
  /** Top-level entries in order. The desktop dial holds the first seven. */
  readonly items: readonly WSItem[];
  readonly folders: {
    /** Whether visitors may create, fill and empty folders by dragging. */
    readonly editable: boolean;
    readonly openFolderId: string | null;
    /** The entry a dragged app hovers over to merge with. */
    readonly dropTargetId: string | null;
  };
  /** The widgets the Board shows beneath its icons, in order. Empty when none are declared. */
  readonly widgets: readonly WSWidgetEntry[];
  readonly background: WebspringBackground;
  readonly branding: WSResolvedBranding;
  readonly account: WSAccountAction;
}

export interface WebspringActions {
  openApp(appId: string, route?: string): Promise<ActionResult>;
  returnHome(): Promise<ActionResult>;
  /** Replaces the top-level order; it must list every top-level entry exactly once. */
  reorder(itemIds: readonly string[]): Promise<ActionResult>;
  previewApp(appId: string | null): void;
  prefetchApp(appId: string, active: boolean): void;
  beginEditing(appId?: string | null): void;
  scheduleLongPress(appId: string, onRecognised: () => void): () => void;
  finishEditing(commit?: boolean): void;
  resetOrder(): void;
  /** Reorders within the container holding the item: the top level, or its folder. */
  moveItem(itemId: string, targetIndex: number, commit?: boolean): boolean;
  moveItemByKeyboard(itemId: string, key: string, columns?: number): boolean;
  /** Hover feedback for a merge; ignored unless folders are editable. */
  setDropTarget(itemId: string | null): void;
  /** Drops an app on a top-level entry: onto an app it makes a folder of the two,
   *  onto a folder it joins it. Editable folders only. */
  dropOnItem(appId: string, targetItemId: string): boolean;
  /** Moves an app from its folder to the top level; an emptied folder is deleted. */
  moveAppOutOfFolder(appId: string, targetIndex: number): boolean;
  /** Refused while an app is launching; during a drag only when the drag passes
   *  `duringDrag`, which is how a folder springs open under a resting app. */
  openFolder(folderId: string, options?: { readonly duringDrag?: boolean }): boolean;
  closeFolder(): void;
  /** Starts dragging an app or a folder. */
  beginDrag(itemId: string): void;
  finishDrag(commit?: boolean): void;
  completeLaunch(transitionId: string, appId: string): void;
  /**
   * Completes a launch once the view's own launch motion has run its course,
   * `delayMs` from now. Returns a function that cancels it.
   */
  scheduleLaunchCompletion(transitionId: string, appId: string, delayMs: number): () => void;
  completeReturnTrack(track: "material" | "icons"): void;
  openNotificationCentre(notificationId?: string): void;
  requestSignIn(): Promise<ActionResult>;
  requestSignOut(): Promise<ActionResult>;
}

export interface WSFolderPresentationProps {
  readonly folder: WSFolderItem;
  /** The element that is copied and split. */
  readonly stage: HTMLElement;
  /** The folder's whole cell (icon and label), in viewport coordinates. */
  readonly anchor: DOMRectReadOnly;
  readonly reducedMotion: boolean;
  /** The view-styled icon for a member app inside the panel. */
  renderApp(app: WSApp, index: number): ReactNode;
  /** Called once the presentation has closed. */
  onClose(): void;
}
export type WSFolderPresentationComponent = ComponentType<WSFolderPresentationProps>;

/** The zoom that presents an application launched from a Webspring view. */
export interface WSLaunchZoom {
  /** Seconds the zoom waits after the launch starts. Defaults to 0.72. */
  readonly delay?: number;
  /** Seconds the zoom takes. Defaults to 0.68. */
  readonly duration?: number;
  /** The zoom's easing. Defaults to `accelerate`. */
  readonly easing?: "standard" | "emphasized" | "decelerate" | "accelerate";
}
export type AuthenticationPolicy = RuntimeAuthenticationPolicy;
export type AuthenticationConfiguration = RuntimeAuthenticationConfiguration;
export type AuthenticationInput = RuntimeAuthenticationInput;

/** QuickSwitch grows with its icons up to the screen edge; this chooses what happens there. */
export interface WSQuickSwitchOptions {
  /** `shrink` (default) scales the icons down so every one fits; `scroll` keeps them full size
   *  and scrolls the row, fading its ends. */
  readonly overflow?: "shrink" | "scroll";
}

/** A corner radius: a percentage of the folder tile's shorter side (up to `"50%"`),
 *  pixels, or an NSE radius token. A percentage keeps the shape as the tile scales. */
export type WebspringFolderCornerRadius = `${number}%` | SmoothSurfaceRadius;

/** A rounded-rectangle folder's corners, drawn with SmoothSurface geometry. */
export interface WebspringFolderSmoothSurface {
  /** Defaults to `"36%"`. */
  readonly radius?: WebspringFolderCornerRadius;
  /** Defaults to `squircle`. */
  readonly curve?: SmoothSurfaceCurve;
  /** From 0 to 1. Defaults to 0.6. */
  readonly smoothing?: number;
}

/** The outline of a folder's icon. */
export type WebspringFolderShape =
  | { readonly kind: "roundedRect"; readonly smoothSurface?: WebspringFolderSmoothSurface }
  | { readonly kind: "circle" };

/** An image the folder's well is lined with. */
export interface WebspringFolderTexture {
  readonly kind: "texture";
  /** The image URL. */
  readonly image: string;
  /** A CSS `background-size`. Defaults to `cover`. */
  readonly size?: string;
  /** A CSS colour beneath the image. Defaults to `transparent`. */
  readonly colour?: string;
}

/** What lines the folder's well: `inset`, the dark translucent well, or a texture. */
export type WebspringFolderFill = "inset" | WebspringFolderTexture;

/** How every view draws a folder's icon. */
export interface WSFolderAppearanceOptions {
  /** Defaults to a `roundedRect` with the default smooth surface. */
  readonly shape?: WebspringFolderShape;
  /** Defaults to `inset`. */
  readonly fill?: WebspringFolderFill;
}

/** A folder appearance with every default filled in. */
export interface WebspringFolderAppearance {
  readonly shape:
    | { readonly kind: "roundedRect"; readonly smoothSurface: Readonly<Required<WebspringFolderSmoothSurface>> }
    | { readonly kind: "circle" };
  readonly fill: "inset" | Readonly<Required<WebspringFolderTexture>>;
}

export interface WebspringPreferencesOptions {
  /** Subclasses extending `NSEPreferencePane`. A pane with a built-in's id replaces it. */
  readonly panes?: readonly (NSEPreferencePaneClass | PreferencePaneDescriptor)[];
  /** Built-in pane ids to remove: appearance, sounds, motion, notifications, language, account. */
  readonly hide?: readonly string[];
}

export interface WebspringPreferences {
  readonly panes: readonly PreferencePaneDescriptor[];
  readonly hide: readonly string[];
}


