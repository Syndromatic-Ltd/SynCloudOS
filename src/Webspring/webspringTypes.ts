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

import type { ComponentType, ExoticComponent, ReactNode } from "react";
import type { NSESmoothSurfaceCurve, NSESmoothSurfaceRadius } from "../NSE/SmoothSurface";
import type {
  SynWareLocalisedText,
  SynWareManifestV1,
  SynWarePresentation,
  SynWareResourceReference,
  SynWareWebspringShellManifest,
} from "../SynCloudOS/AppSDK";
import type { PreferencePaneDefinition } from "../SynCloudOS/Preferences";
import type {
  AuthenticationConfiguration as RuntimeAuthenticationConfiguration,
  AuthenticationInput as RuntimeAuthenticationInput,
  AuthenticationPolicy as RuntimeAuthenticationPolicy,
} from "../SynCloudOS/SynCloudOS";

export type Presentation = SynWarePresentation;
export type ShellMode = "launcher" | "persistent";
export type LocalisedText = SynWareLocalisedText;
export type ResourceReference = SynWareResourceReference;

export interface WebspringIconEffectProps {
  readonly active: boolean;
  readonly subtle: boolean;
  readonly className?: string;
}
export type WebspringIconEffectComponent = ComponentType<WebspringIconEffectProps>;

export type ActionResult =
  | { readonly status: "completed" }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly message: string };

/** A painted area: colour, texture, tint, spotlight and an overlay, drawn in that order. */
export interface WebspringSurface {
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
  readonly launcher: WebspringSurface;
  readonly shelf?: WebspringSurface;
}

/** A background with every default filled in. */
export interface WebspringBackground {
  readonly launcher: WebspringSurface;
  readonly shelf: WebspringSurface;
}

/** What a widget's `view` receives once its data has loaded. */
export interface WebspringWidgetViewProps<TData> {
  readonly data: TData;
  /** Loads the data again; the widget shows its loading state until it settles. */
  readonly refresh: () => void;
  /** Opens a declared route through the shell, without leaving the host page. */
  readonly navigate: (route: string) => Promise<ActionResult>;
}

export interface WebspringWidgetInput<TData> {
  readonly id: string;
  /** Plain text, or a localised string looked up in the app's own strings. */
  readonly title: LocalisedText | string;
  /** A resource path to the widget's icon, such as `./Resources/news.svg`. */
  readonly icon?: string;
  /** Fetches the widget's data. `signal` aborts on unmount, Retry, refresh and timeout. */
  readonly load: (signal: AbortSignal) => Promise<TData> | TData;
  readonly view: ComponentType<WebspringWidgetViewProps<TData>>;
  /** What an empty result shows: nothing, or a message. */
  readonly whenEmpty: "hide" | { readonly message: string };
  /** Defaults to treating an empty array, `null` and `undefined` as empty. */
  readonly isEmpty?: (data: TData) => boolean;
  /** Milliseconds a load may take before it counts as failed. Defaults to 10 000. */
  readonly timeout?: number;
}

/** A widget declared with `defineWidget`, defaults filled in. */
export interface WebspringWidget {
  readonly id: string;
  readonly title: LocalisedText;
  readonly icon?: string;
  readonly load: (signal: AbortSignal) => Promise<unknown>;
  readonly view: ComponentType<WebspringWidgetViewProps<unknown>>;
  readonly whenEmpty: "hide" | { readonly message: LocalisedText };
  readonly isEmpty: (data: unknown) => boolean;
  readonly timeout: number;
}

/** A widget as a view shows it: its text and icon resolved. */
export interface WebspringWidgetEntry {
  readonly widget: WebspringWidget;
  readonly title: string;
  readonly iconUrl: string | null;
  /** The text shown when the widget is empty and `whenEmpty` is a message. */
  readonly emptyMessage: string | null;
}

export interface WebspringViewDeclaration {
  readonly id: string;
  readonly presentations: readonly Presentation[];
  readonly mode: ShellMode;
}

export type AccountAction =
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

export interface WebspringApp {
  readonly bundleIdentifier: string;
  readonly displayName: string;
  readonly iconUrl: string | null;
  readonly route: string;
  readonly selected: boolean;
  readonly running: boolean;
  readonly state: "registered" | "idle" | "loading" | "ready" | "launching" | "active" | "suspended" | "failed" | "closed" | "disabled";
  readonly disabledReason?: string;
  readonly badgeCount: number;
  readonly accent: string;
  readonly featured: boolean;
  readonly selectorAngle: number;
}

export interface WebspringAppItem {
  readonly kind: "app";
  readonly id: string;
  readonly app: WebspringApp;
  readonly dialPlacement: WebspringDialPlacement;
}

export interface WebspringFolderItem {
  readonly kind: "folder";
  readonly id: string;
  readonly title: string;
  readonly apps: readonly WebspringApp[];
  /** The members' badge counts, summed. */
  readonly badgeCount: number;
  readonly dialPlacement: WebspringDialPlacement;
}

/** A top-level Webspring entry: an app, or a folder of apps. */
export type WebspringItem = WebspringAppItem | WebspringFolderItem;

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
  readonly apps: readonly WebspringApp[];
  /** Top-level entries in order. The desktop dial holds the first seven. */
  readonly items: readonly WebspringItem[];
  readonly folders: {
    /** Whether visitors may create, fill and empty folders by dragging. */
    readonly editable: boolean;
    readonly openFolderId: string | null;
    /** The entry a dragged app hovers over to merge with. */
    readonly dropTargetId: string | null;
  };
  /** The widgets the Board shows beneath its icons, in order. Empty when none are declared. */
  readonly widgets: readonly WebspringWidgetEntry[];
  readonly background: WebspringBackground;
  readonly branding: {
    readonly name: string;
    readonly logoUrl: string | null;
    readonly logoAlt: string;
    readonly lightLogoUrl: string | null;
    readonly darkLogoUrl: string | null;
    readonly compactLogoUrl: string | null;
  };
  readonly account: AccountAction;
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

export interface WebspringFolderPresentationProps {
  readonly folder: WebspringFolderItem;
  /** The element that is copied and split. */
  readonly stage: HTMLElement;
  /** The folder's whole cell (icon and label), in viewport coordinates. */
  readonly anchor: DOMRectReadOnly;
  readonly reducedMotion: boolean;
  /** The view-styled icon for a member app inside the panel. */
  renderApp(app: WebspringApp, index: number): ReactNode;
  /** Called once the presentation has closed. */
  onClose(): void;
}
export type WebspringFolderPresentationComponent = ComponentType<WebspringFolderPresentationProps>;

export interface WebspringViewProps {
  readonly model: WebspringViewModel;
  readonly actions: WebspringActions;
  readonly applicationOutlet: ReactNode;
  /** How the shell presents an open folder. */
  readonly folderPresentation: WebspringFolderPresentationComponent;
}

export type WebspringViewComponent = (ComponentType<WebspringViewProps> | ExoticComponent<WebspringViewProps>) & {
  /** Tracks reported through completeReturnTrack before the shell return settles.
   * Omitted declarations retain the legacy material-and-icons requirement.
   * Declare a nonempty, distinct list on the registered component (including React wrappers). */
  readonly returnTracks?: readonly ("material" | "icons")[];
  /** How an application's launch zoom follows this view's own launch
   * choreography. Omitted fields keep the defaults. */
  readonly launchZoom?: WebspringLaunchZoom;
};

/** The zoom that presents an application launched from a Webspring view. */
export interface WebspringLaunchZoom {
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

export type WebspringManifest = SynWareManifestV1 & {
  readonly webspringShell: SynWareWebspringShellManifest;
};

/** QuickSwitch grows with its icons up to the screen edge; this chooses what happens there. */
export interface WebspringQuickSwitchOptions {
  /** `shrink` (default) scales the icons down so every one fits; `scroll` keeps them full size
   *  and scrolls the row, fading its ends. */
  readonly overflow?: "shrink" | "scroll";
}

/** A corner radius: a percentage of the folder tile's shorter side (up to `"50%"`),
 *  pixels, or an NSE radius token. A percentage keeps the shape as the tile scales. */
export type WebspringFolderCornerRadius = `${number}%` | NSESmoothSurfaceRadius;

/** A rounded-rectangle folder's corners, drawn with NSESmoothSurface geometry. */
export interface WebspringFolderSmoothSurface {
  /** Defaults to `"36%"`. */
  readonly radius?: WebspringFolderCornerRadius;
  /** Defaults to `squircle`. */
  readonly curve?: NSESmoothSurfaceCurve;
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
export interface WebspringFolderAppearanceOptions {
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
  /** Panes made with `definePreferencePane`. A pane with a built-in's id replaces it. */
  readonly panes?: readonly PreferencePaneDefinition[];
  /** Built-in pane ids to remove: appearance, sounds, motion, notifications, language, account. */
  readonly hide?: readonly string[];
}

export interface WebspringPreferences {
  readonly panes: readonly PreferencePaneDefinition[];
  readonly hide: readonly string[];
}

export interface WebspringDefinitionInput<TManifest extends Omit<WebspringManifest, "schemaVersion"> & { readonly schemaVersion?: 1 } = WebspringManifest> {
  readonly manifest: TManifest;
  readonly components: Readonly<Record<string, WebspringViewComponent>>;
  readonly widgets?: readonly WebspringWidget[];
  /** Paints the Board. Defaults to a tinted cotton texture with a spotlight. */
  readonly background?: WebspringBackgroundInput;
  readonly iconEffect?: WebspringIconEffectComponent;
  readonly quickSwitch?: WebspringQuickSwitchOptions;
  /** Defaults to `createWebspringFolderSplitPresentation()`. */
  readonly folderPresentation?: WebspringFolderPresentationComponent;
  /** How folder icons look in every view. Defaults to an inset rounded rectangle. */
  readonly folderAppearance?: WebspringFolderAppearanceOptions;
  /** Adds panes to System Preferences and hides built-in ones. */
  readonly preferences?: WebspringPreferencesOptions;
}

export interface WebspringDefinition<TManifest extends WebspringManifest = WebspringManifest> {
  readonly manifest: Readonly<TManifest>;
  readonly components: Readonly<Record<string, WebspringViewComponent>>;
  /** Immutable requirements captured from each registered view component by defineWebspring. */
  readonly returnTracks: Readonly<Record<string, readonly ("material" | "icons")[]>>;
  /** Launch zooms captured from each registered view component, defaults filled in. */
  readonly launchZooms: Readonly<Record<string, Readonly<Required<WebspringLaunchZoom>>>>;
  readonly widgets: readonly WebspringWidget[];
  readonly background: Readonly<WebspringBackground>;
  readonly iconEffect?: WebspringIconEffectComponent;
  readonly quickSwitch?: Readonly<WebspringQuickSwitchOptions>;
  readonly folderPresentation: WebspringFolderPresentationComponent;
  /** The folder appearance, defaults filled in. */
  readonly folderAppearance: WebspringFolderAppearance;
  /** System Preferences: the developer's panes and the built-ins to hide. */
  readonly preferences: WebspringPreferences;
}
