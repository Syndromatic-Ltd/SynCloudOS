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
import type {
  SynWareLocalisedText,
  SynWareManifestV1,
  SynWarePresentation,
  SynWareResourceReference,
  SynWareWebspringShellManifest,
} from "../SynCloudOS/AppSDK";
import type {
  AuthenticationConfiguration as RuntimeAuthenticationConfiguration,
  AuthenticationInput as RuntimeAuthenticationInput,
  AuthenticationPolicy as RuntimeAuthenticationPolicy,
  WebspringContentItem,
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

export type ContentItem = WebspringContentItem;

export type ContentState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly items: readonly ContentItem[] }
  | { readonly status: "unavailable" | "error"; readonly message: LocalisedText };

export interface WebspringContent {
  readonly sections: readonly {
    readonly id: string;
    readonly title: LocalisedText;
    readonly sourceId: string;
    readonly limit: number;
    readonly empty: "hide" | "message";
  }[];
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
  readonly id: string;
  readonly title: string;
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
  readonly sections: readonly { readonly id: string; readonly title: string; readonly empty: "hide" | "message"; readonly state: ContentState }[];
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
  /** Refused while an item is dragged or an app is launching. */
  openFolder(folderId: string): boolean;
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
  refreshContent(): Promise<void>;
}

export interface WebspringFolderPresentationProps {
  readonly folder: WebspringFolderItem;
  /** The element that is snapshotted and split. */
  readonly stage: HTMLElement;
  /** The folder's whole cell (icon and label), in viewport coordinates. */
  readonly anchor: DOMRectReadOnly;
  readonly reducedMotion: boolean;
  /** The view-styled icon for a member app inside the panel. */
  renderApp(app: WebspringApp, index: number): ReactNode;
  /** Called once the presentation has closed. */
  onClose(): void;
}
export type WebspringFolderPresentationComponent = ComponentType<WebspringFolderPresentationProps> & {
  /**
   * Starts the work an opening over `stage` needs as the user reaches for a
   * folder (the split presentation holds a snapshot of the stage), so the
   * opening can begin at once. Views call it through useWebspringFolderPreparation.
   */
  readonly prepare?: (stage: HTMLElement) => void;
  /** Keeps that work done ahead of any reach while the view is at rest; returns the function that stops. */
  readonly keepPrepared?: (stage: HTMLElement) => () => void;
  /** Loads what the presentation needs, ahead of any folder; called once a view shows folders. */
  readonly warm?: () => void;
};

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

export interface WebspringDefinitionInput<TManifest extends WebspringManifest = WebspringManifest> {
  readonly manifest: TManifest;
  readonly components: Readonly<Record<string, WebspringViewComponent>>;
  readonly content?: WebspringContent;
  readonly iconEffect?: WebspringIconEffectComponent;
  readonly quickSwitch?: WebspringQuickSwitchOptions;
  /** Defaults to `createWebspringFolderSplitPresentation()`. */
  readonly folderPresentation?: WebspringFolderPresentationComponent;
}

export interface WebspringDefinition<TManifest extends WebspringManifest = WebspringManifest> {
  readonly manifest: Readonly<TManifest>;
  readonly components: Readonly<Record<string, WebspringViewComponent>>;
  /** Immutable requirements captured from each registered view component by defineWebspring. */
  readonly returnTracks: Readonly<Record<string, readonly ("material" | "icons")[]>>;
  /** Launch zooms captured from each registered view component, defaults filled in. */
  readonly launchZooms: Readonly<Record<string, Readonly<Required<WebspringLaunchZoom>>>>;
  readonly content?: Readonly<WebspringContent>;
  readonly iconEffect?: WebspringIconEffectComponent;
  readonly quickSwitch?: Readonly<WebspringQuickSwitchOptions>;
  readonly folderPresentation: WebspringFolderPresentationComponent;
}
