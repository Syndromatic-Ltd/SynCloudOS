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

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import { action } from "../SynCloudOS/AppSDK";
import { NSEViewController, useObserve } from "../NSE/sdkPackageEntry";
import { useNSEAnimationEnvironment } from "../NSE/Animation";
import { useNSEFeedback } from "../NSE/hostComposition";
import { MaterialProvider } from "../NSE/Material";
import type { WSApplication } from "./WSApplication";
import { WSIconView } from "./WSIconView";
import { defaultWSLaunchZoom } from "./Webspring.transitions";
import type { WSSurface } from "./WSSurface";
import { WSDragProxy, useWSDragProxyPosition } from "./WSDragProxy";
import { WSLaunchDim, resolveWebspringLaunchDimMotion } from "./WSLaunchDim";
import { captureWSDragArtworkRects, type WebspringDragReorderSlots } from "./webspringDragReorder";
import {
  createWSDragArbiter,
  type WebspringDragArbiter,
  type WebspringDragEntry,
  type WebspringDragHandlers,
  type WebspringDragRect,
  type WebspringDragView,
} from "./webspringDragArbiter";
import type {
  ActionResult,
  Presentation,
  ShellMode,
  WebspringActions,
  WSFolderPresentationComponent,
  WSLaunchZoom,
  WebspringViewModel,
  WSAccountAction,
  WSApp,
  WSFolderItem,
  WSItem,
  WSResolvedBranding,
  WSWidgetEntry,
} from "./webspringTypes";

/** What the host gives a launcher before every render. */
export interface WSLauncherHostState {
  readonly application: WSApplication;
  readonly model: WebspringViewModel;
  readonly actions: WebspringActions;
  readonly folderPresentation: WSFolderPresentationComponent;
}

/** @internal The host sets a launcher's state through this method before it renders. */
export const wsSetLauncherHostState: unique symbol = Symbol("ws.setLauncherHostState");
/** @internal The root view reads the host state through this method. */
export const wsLauncherHostState: unique symbol = Symbol("ws.launcherHostState");
/** @internal The root view marks the app tapped on the launcher through this method. */
export const wsSetOpeningApp: unique symbol = Symbol("ws.setOpeningApp");

/** Attributes for the launcher's root element, which is also the folder split's stage. */
export interface WSLauncherRootProps {
  readonly as?: "main" | "div" | "section";
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly [attribute: `data-${string}`]: string | undefined;
}

/** The launcher's open folder, editability and merge target. */
export interface WSLauncherFolders {
  readonly editable: boolean;
  readonly openFolder: WSFolderItem | null;
  /** The entry a dragged app hovers over to merge with. */
  readonly dropTargetId: string | null;
}

/** A `WSLauncherViewController` subclass. */
export type WSLauncherViewControllerClass = (abstract new (...args: never[]) => WSLauncherViewController) & {
  readonly mode?: ShellMode;
  readonly presentations?: readonly Presentation[];
  readonly returnTracks?: readonly ("material" | "icons")[];
  readonly launchZoom?: WSLaunchZoom;
};


/**
 * The base class for Webspring launchers, after SpringBoard's root view controller. A subclass
 * draws its stage and icons; `WSLauncherRootView` owns the drag, the open folder, the launch
 * dim and the live region.
 */
export class WSLauncherViewController<TApp extends WSApplication = WSApplication> extends NSEViewController {
  /** `"persistent"` keeps the launcher on screen, so its home route may be an app route. */
  static mode: ShellMode = "launcher";
  static presentations: readonly Presentation[] = ["desktop", "tablet", "mobile"];
  /** The tracks reported through `completeReturnTrack` before a return settles. */
  static returnTracks: readonly ("material" | "icons")[] = ["material", "icons"];
  static launchZoom: WSLaunchZoom = defaultWSLaunchZoom;

  #host: WSLauncherHostState | null = null;
  #openingAppId: string | null = null;

  #state(): WSLauncherHostState {
    if (!this.#host) throw new TypeError("WSLauncherViewController state is set by the host before it renders.");
    return this.#host;
  }

  /** @internal */
  [wsSetLauncherHostState](state: WSLauncherHostState): void {
    this.#host = state;
  }

  /** @internal */
  [wsLauncherHostState](): WSLauncherHostState {
    return this.#state();
  }

  get application(): TApp { return this.#state().application as TApp; }
  get presentation(): Presentation { return this.#state().model.presentation; }
  /** Top-level entries in order: apps, and folders of apps. */
  get items(): readonly WSItem[] { return this.#state().model.items; }
  /** Every visible app, flat, in display order; folder members appear inline. */
  get apps(): readonly WSApp[] { return this.#state().model.apps; }
  get widgets(): readonly WSWidgetEntry[] { return this.#state().model.widgets; }
  get folders(): WSLauncherFolders {
    const { folders, items } = this.#state().model;
    const openFolder = items.find((item): item is WSFolderItem => item.kind === "folder" && item.id === folders.openFolderId) ?? null;
    return { editable: folders.editable, openFolder, dropTargetId: folders.dropTargetId };
  }
  get branding(): WSResolvedBranding { return this.#state().model.branding; }
  get account(): WSAccountAction { return this.#state().model.account; }
  get activeAppId(): string | null { return this.#state().model.activeAppId; }
  get routePath(): string { return this.#state().model.routePath; }
  get sessionState(): WebspringViewModel["sessionState"] { return this.#state().model.sessionState; }
  get shellLockState(): WebspringViewModel["shellLockState"] { return this.#state().model.shellLockState; }
  get isEditing(): boolean { return this.#state().model.layout.editing; }
  /** The app or folder being dragged. */
  get draggingItemId(): string | null { return this.#state().model.layout.draggingItemId; }
  get selectedAppId(): string | null { return this.#state().model.selectedAppId; }
  get hoveredAppId(): string | null { return this.#state().model.hoveredAppId; }
  get previewAppId(): string | null { return this.#state().model.previewAppId; }
  get launchingAppId(): string | null { return this.#state().model.launchingAppId; }
  /** The app tapped on this launcher, while its bundle loads. */
  get openingAppId(): string | null { return this.#openingAppId; }
  get launchTransitionId(): string | null { return this.#state().model.launchTransitionId; }
  get returnTransitionId(): string | null { return this.#state().model.returnTransitionId; }
  get entrancePhase(): WebspringViewModel["entrancePhase"] { return this.#state().model.entrancePhase; }
  get launchPhase(): WebspringViewModel["launchPhase"] { return this.#state().model.launchPhase; }
  get presentationTraits(): WebspringViewModel["presentationTraits"] { return this.#state().model.presentationTraits; }
  /** The visitor's saved Board page size. */
  get pageSize(): number { return this.#state().model.layout.board.pageSize; }
  get dockSize(): number { return this.#state().model.layout.board.dockSize; }
  get launcherSurface(): WSSurface { return this.#state().model.background.launcher; }
  get shelfSurface(): WSSurface { return this.#state().model.background.shelf; }

  openApp(appId: string, route?: string): Promise<ActionResult> { return this.#state().actions.openApp(appId, route); }
  @action returnHome(): Promise<ActionResult> { return this.#state().actions.returnHome(); }
  /** Replaces the top-level order; it must list every top-level entry exactly once. */
  reorder(itemIds: readonly string[]): Promise<ActionResult> { return this.#state().actions.reorder(itemIds); }
  previewApp(appId: string | null): void { this.#state().actions.previewApp(appId); }
  prefetchApp(appId: string, active: boolean): void { this.#state().actions.prefetchApp(appId, active); }
  @action beginEditing(itemId?: string | null): void { this.#state().actions.beginEditing(itemId); }
  @action finishEditing(commit = true): void { this.#state().actions.finishEditing(commit); }
  @action resetOrder(): void { this.#state().actions.resetOrder(); }
  /** Reorders within the container holding the item: the top level, or its folder. */
  moveItem(itemId: string, targetIndex: number, commit = false): boolean { return this.#state().actions.moveItem(itemId, targetIndex, commit); }
  moveItemByKeyboard(itemId: string, key: string, columns?: number): boolean { return this.#state().actions.moveItemByKeyboard(itemId, key, columns); }
  /** Refused while an app is launching, and during a drag unless `duringDrag` is set. */
  openFolder(folderId: string, options?: { readonly duringDrag?: boolean }): boolean { return this.#state().actions.openFolder(folderId, options); }
  @action closeFolder(): void { this.#state().actions.closeFolder(); }
  completeLaunch(transitionId: string, appId: string): void { this.#state().actions.completeLaunch(transitionId, appId); }
  completeReturnTrack(track: "material" | "icons"): void { this.#state().actions.completeReturnTrack(track); }
  openNotificationCentre(notificationId?: string): void { this.#state().actions.openNotificationCentre(notificationId); }
  requestSignIn(): Promise<ActionResult> { return this.#state().actions.requestSignIn(); }
  requestSignOut(): Promise<ActionResult> { return this.#state().actions.requestSignOut(); }

  /** Where an open folder's presentation is anchored: by default the folder's own cell. */
  folderAnchor(_folder: WSFolderItem, element: HTMLElement): DOMRectReadOnly {
    return element.getBoundingClientRect();
  }

  /** Draws one member of the open folder. */
  renderFolderItem(app: WSApp, index: number): ReactNode {
    return createElement(WSIconView, { key: app.bundleIdentifier, app, index });
  }

  /** Attributes for the root element; it is the folder split's stage. */
  launcherRootProps(): WSLauncherRootProps {
    return { as: "div", className: "ws-launcher" };
  }

  /** Changes whenever the visible icons move to a new container, so a drag measures them again. */
  get dragLayoutKey(): unknown { return null; }

  /** Seconds from the start of a launch until the app covers the launcher. */
  launchCompletionDelay(): number {
    const zoom = { ...defaultWSLaunchZoom, ...(this.constructor as WSLauncherViewControllerClass).launchZoom };
    return zoom.delay + zoom.duration;
  }

  /** Brings an entry into view, such as a folder opened while its page is off screen. */
  revealItem(_itemId: string): void {}
  /** A drag rests at the launcher's edge. Returns whether the launcher scrolled. */
  dragDidReachEdge(_edge: "start" | "end"): boolean { return false; }
  /** A horizontal swipe outside edit mode. Returns whether the launcher handled it. */
  launcherDidSwipe(_direction: "previous" | "next"): boolean { return false; }
  /** An app tapped on this launcher is about to open; `root` is the launcher's root element. */
  launcherWillOpenApp(_appId: string, _root: HTMLElement): void {}
  /** An app tapped on this launcher did not open. */
  launcherDidNotOpenApp(_appId: string): void {}
  /** The launch phase changed. */
  launchPhaseDidChange(_previous: WebspringViewModel["launchPhase"], _current: WebspringViewModel["launchPhase"]): void {}

  /** @internal */
  [wsSetOpeningApp](appId: string | null): void {
    if (this.#openingAppId === appId) return;
    this.#openingAppId = appId;
    this.notifyObservers();
  }
}

/** The launcher plumbing `WSIconView` uses: icons drag, launch and move through it. */
export interface WSLauncherPlumbing {
  readonly beginPointerDrag: (itemId: string, pointerId: number) => void;
  readonly announceMove: (title: string, index: number) => void;
  readonly openApp: (app: WSApp) => void;
  readonly openFolder: (folder: WSFolderItem, cell: HTMLElement) => void;
  readonly scheduleLongPress: (itemId: string, onRecognised: () => void) => () => void;
  readonly beginDrag: (itemId: string) => void;
}

/** The launcher WSLauncherRootView renders, for the views inside it. */
export const WSLauncherContext = createContext<WSLauncherViewController | null>(null);
/** @internal */
export const WSLauncherPlumbingContext = createContext<WSLauncherPlumbing | null>(null);

/** The enclosing launcher controller. Throws outside a `WSLauncherRootView`. */
export function useWSLauncher(): WSLauncherViewController {
  const controller = useContext(WSLauncherContext);
  if (!controller) throw new TypeError("useWSLauncher and WSIconView must be used inside a WSLauncherRootView.");
  return useObserve(controller);
}

/** @internal The enclosing launcher, or null outside one. */
export function useOptionalWSLauncher(): WSLauncherViewController | null {
  return useObserve(useContext(WSLauncherContext)) ?? null;
}

const SWIPE_THRESHOLD = 44;
const FOLDER_PANEL_SELECTOR = "[data-webspring-folder-panel]";
const ARTWORK_SELECTOR = ".webspring-board-icon-well";
const ITEM_SELECTOR = "[data-webspring-item-id]";
const FOLDER_MEMBER_SELECTOR = `${FOLDER_PANEL_SELECTOR} ${ITEM_SELECTOR}`;
const WIDGET_SHELF_SELECTOR = "[data-nse-role=\"widget-shelf\"]";

/** Top-level entries: every item outside the open folder's panel. */
function topLevelElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter((element) => !element.closest(FOLDER_PANEL_SELECTOR));
}

function captureTopLevelArtwork(root: ParentNode): WebspringDragReorderSlots {
  return new Map(topLevelElements(root).map((element) => [
    Number(element.dataset.orderIndex),
    (element.querySelector<HTMLElement>(ARTWORK_SELECTOR) ?? element).getBoundingClientRect(),
  ] as const));
}

/** The entries a drag arbitrates over: each icon's artwork rect without its label, cached by slot. */
function readDragEntries(
  elements: readonly HTMLElement[],
  artworkRects: WebspringDragReorderSlots | undefined,
  kindOf: (id: string) => "app" | "folder",
): WebspringDragEntry[] {
  return elements.map((element) => {
    const id = element.dataset.webspringItemId ?? "";
    const index = Number(element.dataset.orderIndex);
    const artwork = artworkRects?.get(index) ?? (element.querySelector<HTMLElement>(ARTWORK_SELECTOR) ?? element).getBoundingClientRect();
    return { id, index, kind: kindOf(id), artwork };
  });
}

function sameId(left: string | null | undefined, right: string | null | undefined): boolean {
  return normalizeBundleIdentifier(left) === normalizeBundleIdentifier(right);
}

/**
 * Renders a launcher controller's view inside the plumbing every launcher shares: pointer
 * drags, the open folder, the launch dim, the drag proxy and the reorder live region.
 */
export function WSLauncherRootView({ controller, applicationOutlet }: {
  readonly controller: WSLauncherViewController;
  readonly applicationOutlet?: ReactNode;
}) {
  useObserve(controller);
  const { model, actions, folderPresentation: FolderPresentation } = controller[wsLauncherHostState]();
  const feedback = useNSEFeedback();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const launchDim = useMemo(() => resolveWebspringLaunchDimMotion(reducedMotion), [reducedMotion]);
  const topLevelIds = useMemo(() => model.items.map((item) => item.id), [model.items]);
  const [announcement, setAnnouncement] = useState("");
  const rootElement = useRef<HTMLElement | null>(null);
  const [stageElement, setStageElement] = useState<HTMLElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const draggingItemIdRef = useRef<string | null>(model.layout.draggingItemId);
  const suppressNextClick = useRef(false);
  const activeDragId = useRef<string | null>(model.layout.draggingItemId);
  const lastPageSwitchAt = useRef(0);
  /** Artwork rects by slot, measured at the grab and held while icons spring between slots. */
  const topLevelArtwork = useRef<WebspringDragReorderSlots | undefined>(undefined);
  const panelArtwork = useRef<WebspringDragReorderSlots | undefined>(undefined);
  /** The one arbiter timing this drag's rests; null between drags. */
  const dragArbiter = useRef<WebspringDragArbiter | null>(null);
  /** The open folder's cell, linking its icon to its panel while a drag is inside. */
  const folderOrigin = useRef<WebspringDragRect | null>(null);
  /** The current render's drag handlers, read by the arbiter's rests. */
  const dragHandlers = useRef<WebspringDragHandlers | null>(null);
  const { point, beginGrab, setProxyElement, recordPoint, showProxy, hideProxy } = useWSDragProxyPosition();
  const draggingId = model.layout.draggingItemId;
  const draggingItem = model.items.find((item) => item.id === draggingId) ?? null;
  const draggingFolder = draggingItem?.kind === "folder" ? draggingItem : null;
  const draggingApp = draggingItem?.kind === "app" ? draggingItem.app : model.apps.find((app) => sameId(app.bundleIdentifier, draggingId)) ?? null;
  const dragLayoutKey = controller.dragLayoutKey;
  // The dragged icon is drawn at the size of the one it came from.
  const dragProxyRef = useCallback((element: HTMLDivElement | null) => {
    setProxyElement(element);
    const well = draggingId ? rootElement.current?.querySelector<HTMLElement>(`[data-webspring-item-id="${draggingId}"] ${ARTWORK_SELECTOR}`) : null;
    if (element && well) element.style.setProperty("--webspring-drag-proxy-icon-size", `${well.getBoundingClientRect().width}px`);
  }, [draggingId, setProxyElement]);
  const openFolder = model.items.find((item): item is WSFolderItem => item.kind === "folder" && item.id === model.folders.openFolderId) ?? null;
  const [folderAnchor, setFolderAnchor] = useState<DOMRectReadOnly | null>(null);
  // A folder's apps sit outside the launcher's grid, so they are drawn at the size of the folder's own icon.
  const [folderIconSize, setFolderIconSize] = useState<number | null>(null);
  const previousLaunchPhase = useRef(model.launchPhase);
  const previousOpenFolderId = useRef(model.folders.openFolderId);
  draggingItemIdRef.current = model.layout.draggingItemId;

  useEffect(() => () => {
    dragArbiter.current?.clear();
    if (draggingItemIdRef.current) actions.finishDrag(false);
    hideProxy();
  }, [actions, hideProxy]);
  useEffect(() => {
    if (model.layout.draggingItemId) return;
    activeDragId.current = null;
    topLevelArtwork.current = undefined;
    panelArtwork.current = undefined;
    folderOrigin.current = null;
    dragArbiter.current?.clear();
    dragArbiter.current = null;
    const pointerId = pointerStart.current?.pointerId;
    pointerStart.current = null;
    hideProxy();
    const root = rootElement.current;
    if (pointerId !== undefined && root?.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
  }, [model.layout.draggingItemId, hideProxy]);
  // A drag that leaves a folder, or turns the page, measures the container afresh.
  useEffect(() => {
    dragArbiter.current?.clear();
    if (!activeDragId.current || !rootElement.current) return;
    topLevelArtwork.current = captureTopLevelArtwork(rootElement.current);
    panelArtwork.current = model.folders.openFolderId
      ? captureWSDragArtworkRects(FOLDER_MEMBER_SELECTOR, ARTWORK_SELECTOR, rootElement.current)
      : undefined;
    if (!model.folders.openFolderId) folderOrigin.current = null;
  }, [dragLayoutKey, model.folders.openFolderId]);

  // The open folder's cell anchors its presentation, measured again as the viewport
  // resizes; a folder opened elsewhere is brought into view first.
  useLayoutEffect(() => {
    const folderId = model.folders.openFolderId;
    if (!folderId) {
      setFolderAnchor(null);
      return;
    }
    const cell = rootElement.current ? topLevelElements(rootElement.current).find((element) => element.dataset.webspringItemId === folderId) : undefined;
    const folder = model.items.find((item): item is WSFolderItem => item.kind === "folder" && item.id === folderId);
    if (cell && folder) {
      const measure = () => {
        setFolderAnchor(controller.folderAnchor(folder, cell));
        const well = cell.querySelector<HTMLElement>(ARTWORK_SELECTOR);
        setFolderIconSize(well ? well.offsetWidth : null);
      };
      measure();
      const view = cell.ownerDocument.defaultView;
      view?.addEventListener("resize", measure);
      return () => view?.removeEventListener("resize", measure);
    }
    if (topLevelIds.includes(folderId)) controller.revealItem(folderId);
  }, [controller, model.folders.openFolderId, model.items, topLevelIds, dragLayoutKey]);

  // Focus returns to a folder's icon when it closes, unless an app took over.
  useEffect(() => {
    const previous = previousOpenFolderId.current;
    previousOpenFolderId.current = model.folders.openFolderId;
    if (!previous || model.folders.openFolderId || model.launchPhase !== "idle" || activeDragId.current || !rootElement.current) return;
    topLevelElements(rootElement.current).find((element) => element.dataset.webspringItemId === previous)?.focus({ preventScroll: true });
  }, [model.folders.openFolderId, model.launchPhase]);

  useEffect(() => {
    const previous = previousLaunchPhase.current;
    previousLaunchPhase.current = model.launchPhase;
    if (previous !== model.launchPhase) controller.launchPhaseDidChange(previous, model.launchPhase);
    if (model.launchPhase !== "idle") controller[wsSetOpeningApp](null);
  }, [controller, model.launchPhase]);
  // The launch is complete once the app covers the launcher and its own motion has run.
  useEffect(() => {
    const transitionId = model.launchTransitionId, appId = model.launchingAppId;
    if (model.launchPhase !== "launching" || !transitionId || !appId) return;
    const seconds = model.presentationTraits.reducedMotion ? 0 : controller.launchCompletionDelay();
    return actions.scheduleLaunchCompletion(transitionId, appId, seconds * 1000);
  }, [actions, controller, model.launchPhase, model.launchTransitionId, model.launchingAppId, model.presentationTraits.reducedMotion]);

  const announceMove = useCallback((title: string, index: number) => {
    feedback?.trigger("selection", { intensity: .35 });
    setAnnouncement(`${title} moved to position ${index + 1}.`);
  }, [feedback]);

  // The current render's commands for the drag's rests: the arbiter holds the
  // timers while these read the latest model and actions.
  dragHandlers.current = {
    reorder(index) {
      const dragId = activeDragId.current;
      if (!dragId || !actions.moveItem(dragId, index, false)) return;
      const member = openFolder?.apps.find((app) => sameId(app.bundleIdentifier, dragId));
      const item = model.items.find((candidate) => candidate.id === dragId);
      const title = member?.displayName ?? (item ? item.kind === "app" ? item.app.displayName : item.title : null);
      if (title) announceMove(title, index);
    },
    merge(targetId) {
      actions.setDropTarget(targetId);
    },
    springOpen(folderId) {
      const index = model.items.findIndex((item) => item.id === folderId);
      folderOrigin.current = index >= 0 ? topLevelArtwork.current?.get(index) ?? null : null;
      actions.openFolder(folderId, { duringDrag: true });
    },
    leavePanel() {
      const dragId = activeDragId.current;
      // A member dragged past the edge returns to the top level where it left the folder.
      if (dragId && openFolder?.apps.some((app) => sameId(app.bundleIdentifier, dragId)) && model.folders.editable) {
        if (actions.moveAppOutOfFolder(dragId, topLevelIds.indexOf(openFolder.id) + 1)) {
          const app = openFolder.apps.find((candidate) => sameId(candidate.bundleIdentifier, dragId));
          if (app) setAnnouncement(`${app.displayName} moved out of ${openFolder.title}.`);
        }
      }
      actions.closeFolder();
    },
  };

  /** Where the icon's centre is: the open folder's panel, or the top level. */
  function readDragView(root: HTMLElement): WebspringDragView {
    if (openFolder) {
      if (!panelArtwork.current?.size) panelArtwork.current = captureWSDragArtworkRects(FOLDER_MEMBER_SELECTOR, ARTWORK_SELECTOR, root);
      return {
        container: "folder",
        folderId: openFolder.id,
        panel: root.querySelector<HTMLElement>(FOLDER_PANEL_SELECTOR)?.getBoundingClientRect() ?? null,
        origin: folderOrigin.current,
        entries: readDragEntries(Array.from(root.querySelectorAll<HTMLElement>(FOLDER_MEMBER_SELECTOR)), panelArtwork.current, () => "app"),
      };
    }
    const folderIds = new Set(model.items.filter((item) => item.kind === "folder").map((item) => item.id));
    return {
      container: "board",
      entries: readDragEntries(topLevelElements(root), topLevelArtwork.current, (id) => folderIds.has(id) ? "folder" : "app"),
    };
  }

  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button > 0 || event.isPrimary === false || activeDragId.current) return;
    if ((event.target as Element | null)?.closest?.(WIDGET_SHELF_SELECTOR)) return;
    suppressNextClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    // The icon keeps its grab offset, so its centre follows the pointer instead of jumping to it.
    const entry = (event.target as Element | null)?.closest<HTMLElement>(ITEM_SELECTOR) ?? null;
    beginGrab(
      { x: event.clientX, y: event.clientY },
      entry?.querySelector<HTMLElement>(ARTWORK_SELECTOR)?.getBoundingClientRect() ?? null,
    );
    recordPoint({ x: event.clientX, y: event.clientY }, Boolean(activeDragId.current));
  }

  function pointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== pointerStart.current?.pointerId) return;
    const dragId = activeDragId.current;
    const hitPoint = recordPoint({ x: event.clientX, y: event.clientY }, Boolean(dragId));
    if (!dragId) return;
    showProxy();
    const root = event.currentTarget;
    const bounds = root.getBoundingClientRect();
    if (!openFolder && event.timeStamp - lastPageSwitchAt.current > 450) {
      const edge = event.clientX >= bounds.right - 48 ? "end" : event.clientX <= bounds.left + 48 ? "start" : null;
      if (edge && controller.dragDidReachEdge(edge)) {
        dragArbiter.current?.clear();
        lastPageSwitchAt.current = event.timeStamp;
        return;
      }
    }
    dragArbiter.current?.update(hitPoint, readDragView(root));
  }

  function pointerEnd(event: PointerEvent<HTMLElement>, commit: boolean) {
    if (event.pointerId !== pointerStart.current?.pointerId) return;
    const start = pointerStart.current;
    if (!activeDragId.current && commit && start && !model.layout.editing) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) && controller.launcherDidSwipe(dx < 0 ? "next" : "previous")) {
        suppressNextClick.current = true;
      }
    }
    const dragId = activeDragId.current;
    if (dragId) {
      const result = dragArbiter.current?.end() ?? { mergeTargetId: null, folderId: null, dropIndex: null };
      dragArbiter.current = null;
      const dropFolder = result.folderId
        ? model.items.find((item): item is WSFolderItem => item.kind === "folder" && item.id === result.folderId) ?? null
        : null;
      const member = dropFolder?.apps.some((app) => sameId(app.bundleIdentifier, dragId)) ?? false;
      let joined = false;
      // A release inside a folder joins it, unless the app was already one of its members.
      if (commit && result.mergeTargetId) joined = actions.dropOnItem(dragId, result.mergeTargetId);
      else if (commit && dropFolder && !member) joined = actions.dropOnItem(dragId, dropFolder.id);
      if (commit && result.dropIndex !== null && (joined || member)) actions.moveItem(dragId, result.dropIndex, false);
      actions.finishDrag(commit);
      if (joined) feedback?.trigger("success", { intensity: .45 });
      else if (commit) feedback?.trigger("light", { intensity: .35 });
      activeDragId.current = null;
      suppressNextClick.current = true;
    }
    pointerStart.current = null;
    topLevelArtwork.current = undefined;
    panelArtwork.current = undefined;
    folderOrigin.current = null;
    hideProxy();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const beginPointerDrag = useCallback((itemId: string, pointerId: number) => {
    rootElement.current?.setPointerCapture?.(pointerId);
    activeDragId.current = itemId;
    const root = rootElement.current;
    topLevelArtwork.current = root ? captureTopLevelArtwork(root) : undefined;
    panelArtwork.current = root ? captureWSDragArtworkRects(FOLDER_MEMBER_SELECTOR, ARTWORK_SELECTOR, root) : undefined;
    const folderIndex = openFolder ? model.items.findIndex((item) => item.id === openFolder.id) : -1;
    folderOrigin.current = folderIndex >= 0 ? topLevelArtwork.current?.get(folderIndex) ?? null : null;
    const kind = model.items.find((item) => item.id === itemId)?.kind ?? "app";
    dragArbiter.current = createWSDragArbiter({
      itemId,
      kind,
      // Folders never merge, and a launcher with fixed folders has nothing to merge into.
      canMerge: model.folders.editable && kind === "app",
      reorder: (index) => dragHandlers.current?.reorder(index),
      merge: (targetId) => dragHandlers.current?.merge(targetId),
      springOpen: (folderId) => dragHandlers.current?.springOpen(folderId),
      leavePanel: (folderId) => dragHandlers.current?.leavePanel(folderId),
    });
    showProxy();
    suppressNextClick.current = true;
    feedback?.trigger("selection", { intensity: .5 });
  }, [feedback, model.folders.editable, model.items, openFolder, showProxy]);

  const plumbing = useMemo((): WSLauncherPlumbing => ({
    beginPointerDrag,
    announceMove,
    openApp(app) {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      feedback?.trigger("light", { intensity: .45 });
      if (rootElement.current) controller.launcherWillOpenApp(app.bundleIdentifier, rootElement.current);
      controller[wsSetOpeningApp](app.bundleIdentifier);
      void actions.openApp(app.bundleIdentifier, app.route).then((result) => {
        if (sameId(controller.openingAppId, app.bundleIdentifier)) controller[wsSetOpeningApp](null);
        if (result.status !== "completed") controller.launcherDidNotOpenApp(app.bundleIdentifier);
      });
    },
    openFolder(folder, cell) {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      if (model.folders.openFolderId === folder.id) return;
      setFolderAnchor(controller.folderAnchor(folder, cell));
      if (actions.openFolder(folder.id)) feedback?.trigger("light", { intensity: .4 });
    },
    scheduleLongPress: actions.scheduleLongPress,
    beginDrag: actions.beginDrag,
  }), [actions, announceMove, beginPointerDrag, controller, feedback, model.folders.openFolderId]);

  const { as: Root = "div", ...rootProps } = controller.launcherRootProps();
  const renderFolderApp = (app: WSApp, index: number) => controller.renderFolderItem(app, index);

  return <WSLauncherContext.Provider value={controller}>
    <WSLauncherPlumbingContext.Provider value={plumbing}>
      <MaterialProvider>
        <Root
          {...rootProps}
          ref={(element: HTMLElement | null) => {
            rootElement.current = element;
            setStageElement(element);
          }}
          onPointerDownCapture={pointerDown}
          onPointerMoveCapture={pointerMove}
          onPointerUpCapture={(event: PointerEvent<HTMLElement>) => pointerEnd(event, true)}
          onPointerCancelCapture={(event: PointerEvent<HTMLElement>) => pointerEnd(event, false)}
          onLostPointerCapture={(event: PointerEvent<HTMLElement>) => { if (event.target === event.currentTarget) pointerEnd(event, false); }}
          onKeyDownCapture={(event: { key: string }) => {
            if (event.key === "Enter" || event.key === " ") suppressNextClick.current = false;
          }}
        >
          <WSLauncherContent controller={controller} />
          {openFolder && folderAnchor && stageElement ? <div
            data-nse-part="content" className="webspring-board-folder-layer"
            style={folderIconSize ? { "--webspring-board-icon-size": `${folderIconSize}px` } as CSSProperties : undefined}
          >
            <FolderPresentation
              key={openFolder.id}
              folder={openFolder}
              stage={stageElement}
              anchor={folderAnchor}
              reducedMotion={model.presentationTraits.reducedMotion}
              renderApp={renderFolderApp}
              onClose={actions.closeFolder}
            />
          </div> : null}
          <WSLaunchDim visible={model.launchPhase === "launching"} motion={launchDim} />
          {applicationOutlet}
          <WSDragProxy app={draggingApp} folder={draggingFolder} point={point} mobile proxyRef={dragProxyRef} />
          <span className="webspring-reorder-announcement" aria-live="polite">{announcement}</span>
        </Root>
      </MaterialProvider>
    </WSLauncherPlumbingContext.Provider>
  </WSLauncherContext.Provider>;
}

/** The subclass's own view: `renderView()` or `static view`. */
function WSLauncherContent({ controller }: { readonly controller: WSLauncherViewController }) {
  if (typeof controller.renderView === "function") return <>{controller.renderView()}</>;
  const View = (controller.constructor as { readonly view?: ComponentType<{ readonly controller: WSLauncherViewController }> }).view;
  if (!View) throw new TypeError(`${controller.constructor.name} has no static view or renderView; declare one rendering form.`);
  return <View controller={controller} />;
}
