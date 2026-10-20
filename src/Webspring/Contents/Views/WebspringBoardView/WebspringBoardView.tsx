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

import { WebspringLaunchDim } from "../../../WebspringLaunchDim";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type TransitionEvent } from "react";
import { NSELayoutView, useNSEAnimationEnvironment, useNSEPresentation, type NSELayoutTransitionTiming } from "../../../../NSE/Animation";
import { Badge, LoadingSpinner } from "../../../../NSE/NSE";
import { useNSEFeedback } from "../../../../NSE/hostComposition";
import { NSEPushButton, NSEToolbar } from "@syndromatic/syncloudos/nse/controls";
import { MaterialProvider } from "../../../../NSE/Material";
import { getKeyboardReorderIndex } from "../../../../SynCloudOS/SynCloudOS";
import { WebspringWidgetShelf } from "../../../WebspringWidgetShelf";
import { webspringSurfaceStyle } from "../../../webspringSurface";
import { WebspringDragProxy, useWebspringDragProxyPosition } from "../../../WebspringDragProxy";
import { WebspringFolderTile } from "../../../WebspringFolderTile";
import { captureWebspringDragArtworkRects, type WebspringDragReorderSlots } from "../../../webspringDragReorder";
import { createWebspringDragArbiter, type WebspringDragArbiter, type WebspringDragEntry, type WebspringDragHandlers, type WebspringDragRect, type WebspringDragView } from "../../../webspringDragArbiter";
import { createWebspringBoardProjection } from "../../../webspringLayout";
import type { WebspringApp, WebspringFolderItem, WebspringItem, WebspringViewModel, WebspringViewProps } from "../../../webspringTypes";
import { resolveWebspringIconPresentation, type WebspringIconState, type WebspringRadialExit } from "../../../Webspring.transitions";
import { createWebspringBoardLaunchExits, useWebspringBoardMotion, webspringBoardLaunchTiming, type WebspringBoardLaunchExits } from "./WebspringBoardView.transitions";
import "../../../WebspringPresentation.css";
import "./WebspringBoardView.css";

const SWIPE_THRESHOLD = 44;
const TOP_LEVEL_SELECTOR = ".webspring-board-page [data-webspring-item-id]";
const FOLDER_PANEL_SELECTOR = "[data-webspring-folder-panel]";
const ARTWORK_SELECTOR = ".webspring-board-icon-well";
const FOLDER_MEMBER_SELECTOR = `${FOLDER_PANEL_SELECTOR} [data-webspring-item-id]`;
const REORDER_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
export interface WebspringBoardConfiguration { readonly pageSize?: number }

/** Where an icon is in the entrance and launch choreography. Only icons with
 * an exit (those on screen when an app opened) take part in a launch. */
function boardIconState(model: WebspringViewModel, exit: WebspringRadialExit | undefined): WebspringIconState {
  if (exit) {
    if (model.launchPhase === "launching" || model.launchPhase === "staging") return "launching";
    if (model.launchPhase === "covered") return "covered";
    if (model.launchPhase === "returning") return "returning";
  }
  return model.entrancePhase ?? "ready";
}

/** An icon's artwork, carried through the Webspring entrance and the iOS-style
 * launch: it flies out past the viewer as an app opens, and back in on return. */
function BoardIconArtwork({ index, total, state, exit, children }: {
  index: number;
  total: number;
  state: WebspringIconState;
  exit: WebspringRadialExit | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const presentation = resolveWebspringIconPresentation({
    reducedMotion, state, index, total, radialExit: exit,
    exitDuration: webspringBoardLaunchTiming.iconExitDuration, exitStagger: 0,
  });
  useNSEPresentation(ref, presentation);
  return <span ref={ref} className="webspring-board-icon-artwork" style={presentation.style}>{children}</span>;
}

interface BoardEntryProps {
  /** Index within the entry's container: the top level, or its folder. */
  index: number;
  /** The IDs in the entry's container, in order, for keyboard moves. */
  containerIds: readonly string[];
  columns: number;
  model: WebspringViewModel;
  exit: WebspringRadialExit | undefined;
  actions: WebspringViewProps["actions"];
  reorderMotion: NSELayoutTransitionTiming | null;
  onLongPress(itemId: string, pointerId: number): void;
  onMoved(title: string, index: number): void;
}

/** Press, long-press and keyboard handling shared by app and folder icons. */
function useBoardEntryInteraction(itemId: string, title: string, disabled: boolean, { index, containerIds, columns, model, actions, onLongPress, onMoved }: BoardEntryProps) {
  const cancelLongPress = useRef<(() => void) | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const clearTimer = useCallback(() => {
    cancelLongPress.current?.();
    cancelLongPress.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);
  const editing = model.layout.editing;

  return {
    editing,
    dragging: model.layout.draggingItemId === itemId,
    dataProps: { "data-webspring-item-id": itemId, "data-order-index": index },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.key === "Escape" && editing) {
        event.preventDefault();
        actions.finishEditing(true);
        return;
      }
      if (!editing || !REORDER_KEYS.includes(event.key)) return;
      event.preventDefault();
      const targetIndex = getKeyboardReorderIndex(containerIds, itemId, event.key, columns);
      if (actions.moveItemByKeyboard(itemId, event.key, columns)) onMoved(title, targetIndex);
    },
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button > 0 || event.isPrimary === false || disabled) return;
      pressStart.current = { x: event.clientX, y: event.clientY };
      if (editing) {
        actions.beginDrag(itemId);
        onLongPress(itemId, event.pointerId);
        return;
      }
      cancelLongPress.current = actions.scheduleLongPress(itemId, () => {
        onLongPress(itemId, event.pointerId);
      });
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const start = pressStart.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) clearTimer();
    },
    onPointerEnd() { pressStart.current = null; clearTimer(); },
  };
}

function BoardIcon({ app, opening, ...entry }: BoardEntryProps & {
  app: WebspringApp;
  /** Tapped and loading, before the launch begins. */
  opening: boolean;
}) {
  const { model, actions, exit, reorderMotion, index } = entry;
  const disabled = app.state === "disabled";
  const interaction = useBoardEntryInteraction(app.id, app.title, disabled, entry);
  const loading = opening || app.state === "loading" || app.state === "launching" || model.launchingAppId === app.id;
  const { editing, dragging } = interaction;

  // A slot springs to wherever an update lays it out (a new cell on reorder,
  // or the grid shifting); the dragged icon follows the pointer's proxy, so
  // its slot moves at once.
  return <NSELayoutView className="webspring-board-slot" layoutTransition={dragging ? null : reorderMotion}><button
    type="button"
    className={`webspring-board-icon ${editing ? "is-editing" : ""} ${dragging ? "is-dragging" : ""} ${disabled ? "is-disabled" : ""}`}
    {...interaction.dataProps}
    aria-label={editing ? `Move ${app.title}` : `Open ${app.title}`}
    aria-pressed={editing ? dragging : undefined}
    disabled={disabled}
    aria-description={disabled ? app.disabledReason : undefined}
    title={disabled ? app.disabledReason : undefined}
    onFocus={() => actions.prefetchApp(app.id, true)}
    onBlur={() => actions.prefetchApp(app.id, false)}
    onPointerDown={interaction.onPointerDown}
    onPointerMove={interaction.onPointerMove}
    onPointerUp={interaction.onPointerEnd}
    onPointerCancel={interaction.onPointerEnd}
    onLostPointerCapture={interaction.onPointerEnd}
    onKeyDown={interaction.onKeyDown}
    onClick={() => { if (!disabled && !editing) void actions.openApp(app.id, app.route); }}
  >
    <BoardIconArtwork index={index} total={model.items.length} state={boardIconState(model, exit)} exit={exit}>
      <span className="webspring-board-icon-well" data-loading={loading ? "true" : undefined} data-drop-target={model.folders.dropTargetId === app.id ? "true" : undefined}>
        {app.iconUrl ? <img src={app.iconUrl} alt="" aria-hidden="true" draggable={false} /> : <span aria-hidden="true">{app.title.slice(0, 1)}</span>}
        {loading ? <LoadingSpinner label={`Loading ${app.title}`} variant="dark" /> : null}
        <Badge count={app.badgeCount} />
      </span>
      <span className="webspring-board-icon-label">{app.title}</span>
    </BoardIconArtwork>
  </button></NSELayoutView>;
}

function BoardFolderIcon({ folder, onOpen, ...entry }: BoardEntryProps & {
  folder: WebspringFolderItem;
  onOpen(folder: WebspringFolderItem, cell: HTMLElement): void;
}) {
  const { model, exit, reorderMotion, index } = entry;
  const interaction = useBoardEntryInteraction(folder.id, folder.title, false, entry);
  const { editing, dragging } = interaction;
  const open = model.folders.openFolderId === folder.id;

  return <NSELayoutView className="webspring-board-slot" layoutTransition={dragging ? null : reorderMotion}><button
    type="button"
    className={`webspring-board-icon is-folder ${editing ? "is-editing" : ""} ${dragging ? "is-dragging" : ""}`}
    {...interaction.dataProps}
    aria-label={editing ? `Move folder ${folder.title}` : `Open folder ${folder.title}`}
    aria-pressed={editing ? dragging : undefined}
    aria-haspopup="dialog"
    aria-expanded={open}
    onPointerDown={interaction.onPointerDown}
    onPointerMove={interaction.onPointerMove}
    onPointerUp={interaction.onPointerEnd}
    onPointerCancel={interaction.onPointerEnd}
    onLostPointerCapture={interaction.onPointerEnd}
    onKeyDown={interaction.onKeyDown}
    onClick={(event) => onOpen(folder, event.currentTarget)}
  >
    <BoardIconArtwork index={index} total={model.items.length} state={boardIconState(model, exit)} exit={exit}>
      <span className="webspring-board-icon-well">
        <WebspringFolderTile folder={folder} dropTarget={model.folders.dropTargetId === folder.id} />
        <Badge count={folder.badgeCount} />
      </span>
      <span className="webspring-board-icon-label">{folder.title}</span>
    </BoardIconArtwork>
  </button></NSELayoutView>;
}

/** The entries a drag arbitrates over: each visible icon's artwork rect without
 *  its label, cached by slot while the layout springs between moves. */
function readDragEntries(
  root: ParentNode,
  selector: string,
  artworkRects: WebspringDragReorderSlots | undefined,
  kindOf: (id: string) => "app" | "folder"
): WebspringDragEntry[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector), (element) => {
    const id = element.dataset.webspringItemId ?? "";
    const index = Number(element.dataset.orderIndex);
    const artwork = artworkRects?.get(index) ??
      (element.querySelector<HTMLElement>(ARTWORK_SELECTOR) ?? element).getBoundingClientRect();
    return { id, index, kind: kindOf(id), artwork };
  });
}

function WebspringBoard({ model, actions, applicationOutlet, folderPresentation: FolderPresentation, configuration }: WebspringViewProps & { configuration: WebspringBoardConfiguration }) {
  const feedback = useNSEFeedback();
  const boardMotion = useWebspringBoardMotion();
  const columns = 4;
  const pageSize = configuration.pageSize ?? (model.layout.board.pageSize === 20 ? columns * 4 : model.layout.board.pageSize);
  const board = useMemo(() => createWebspringBoardProjection(model.items, { pageSize, dockSize: 0 }), [model.items, pageSize]);
  const rows = Math.max(1, Math.ceil(pageSize / columns));
  const launcherStyle = useMemo(() => webspringSurfaceStyle(model.background.launcher, "--webspring-launcher"), [model.background.launcher]);
  const pagesStyle = { "--webspring-board-columns": String(columns), "--webspring-board-rows": String(rows) } as CSSProperties;
  const topLevelIds = useMemo(() => model.items.map((item) => item.id), [model.items]);
  const [page, setPage] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const boardElement = useRef<HTMLElement | null>(null);
  const [stageElement, setStageElement] = useState<HTMLElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const draggingItemIdRef = useRef<string | null>(model.layout.draggingItemId);
  const suppressNextClick = useRef(false);
  const activeDragId = useRef<string | null>(model.layout.draggingItemId);
  const lastPageSwitchAt = useRef(0);
  /** Artwork rects by slot, measured at the grab and held while icons spring between slots. */
  const boardArtwork = useRef<WebspringDragReorderSlots | undefined>(undefined);
  const panelArtwork = useRef<WebspringDragReorderSlots | undefined>(undefined);
  /** The one arbiter timing this drag's rests; null between drags. */
  const dragArbiter = useRef<WebspringDragArbiter | null>(null);
  /** The open folder's cell on the Board, linking its icon to its panel while a drag is inside. */
  const folderOrigin = useRef<WebspringDragRect | null>(null);
  /** The current render's drag handlers, read by the arbiter's rests. */
  const dragHandlers = useRef<WebspringDragHandlers | null>(null);
  const { point, beginGrab, setProxyElement, recordPoint, showProxy, hideProxy } = useWebspringDragProxyPosition();
  const draggingId = model.layout.draggingItemId;
  const draggingItem = model.items.find((item) => item.id === draggingId) ?? null;
  const draggingFolder = draggingItem?.kind === "folder" ? draggingItem : null;
  const draggingApp = draggingItem?.kind === "app" ? draggingItem.app : model.apps.find((app) => app.id === draggingId) ?? null;
  // The dragged icon is drawn at the size of the one it came from, which the Board fits to the screen.
  const dragProxyRef = useCallback((element: HTMLDivElement | null) => {
    setProxyElement(element);
    const well = draggingId ? boardElement.current?.querySelector<HTMLElement>(`[data-webspring-item-id="${draggingId}"] .webspring-board-icon-well`) : null;
    if (element && well) element.style.setProperty("--webspring-drag-proxy-icon-size", `${well.getBoundingClientRect().width}px`);
  }, [draggingId, setProxyElement]);
  const openFolder = model.items.find((item): item is WebspringFolderItem => item.kind === "folder" && item.id === model.folders.openFolderId) ?? null;
  const [folderAnchor, setFolderAnchor] = useState<DOMRectReadOnly | null>(null);
  const activePage = Math.min(page, board.pages.length - 1);
  const launchDim = boardMotion.launchBackdropDim;
  const [iconExits, setIconExits] = useState<WebspringBoardLaunchExits | null>(null);
  // The tapped app shows its spinner at once, while its bundle loads.
  const [openingAppId, setOpeningAppId] = useState<string | null>(null);
  const previousLaunchPhase = useRef(model.launchPhase);
  const previousOpenFolderId = useRef(model.folders.openFolderId);
  useEffect(() => setPage((value) => Math.min(value, board.pages.length - 1)), [board.pages.length]);
  draggingItemIdRef.current = model.layout.draggingItemId;
  useEffect(() => () => {
    dragArbiter.current?.clear();
    if (draggingItemIdRef.current) actions.finishDrag(false);
    hideProxy();
  }, [actions, hideProxy]);
  useEffect(() => {
    if (model.layout.draggingItemId) return;
    activeDragId.current = null;
    boardArtwork.current = undefined;
    panelArtwork.current = undefined;
    folderOrigin.current = null;
    dragArbiter.current?.clear();
    dragArbiter.current = null;
    const pointerId = pointerStart.current?.pointerId;
    pointerStart.current = null;
    hideProxy();
    const root = boardElement.current;
    if (pointerId !== undefined && root?.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
  }, [model.layout.draggingItemId, hideProxy]);
  // A drag that leaves a folder, or turns the page, measures the container
  // afresh; rests started on the previous one no longer apply.
  useEffect(() => {
    dragArbiter.current?.clear();
    if (!activeDragId.current || !boardElement.current) return;
    boardArtwork.current = captureWebspringDragArtworkRects(TOP_LEVEL_SELECTOR, ARTWORK_SELECTOR, boardElement.current);
    panelArtwork.current = model.folders.openFolderId
      ? captureWebspringDragArtworkRects(FOLDER_MEMBER_SELECTOR, ARTWORK_SELECTOR, boardElement.current)
      : undefined;
    if (!model.folders.openFolderId) folderOrigin.current = null;
  }, [activePage, model.folders.openFolderId]);
  useEffect(() => {
    if (model.launchPhase === "returning" && (model.presentationTraits.reducedMotion || model.items.length === 0)) {
      actions.completeReturnTrack("material");
    }
  }, [actions, model.items.length, model.launchPhase, model.presentationTraits.reducedMotion]);

  // The open folder's cell (icon and label) anchors its presentation, measured
  // again as the viewport resizes; a folder opened elsewhere brings its page into view first.
  useLayoutEffect(() => {
    const folderId = model.folders.openFolderId;
    if (!folderId) {
      setFolderAnchor(null);
      return;
    }
    const cell = boardElement.current?.querySelector<HTMLElement>(`.webspring-board-page [data-webspring-item-id="${folderId}"]`);
    if (cell) {
      const measure = () => setFolderAnchor(cell.getBoundingClientRect());
      measure();
      const view = cell.ownerDocument.defaultView;
      view?.addEventListener("resize", measure);
      return () => view?.removeEventListener("resize", measure);
    }
    const index = topLevelIds.indexOf(folderId);
    if (index >= 0) setPage(Math.floor(index / board.pageSize));
  }, [board.pageSize, model.folders.openFolderId, topLevelIds, activePage]);

  // Focus returns to a folder's icon when it closes, unless an app took over.
  useEffect(() => {
    const previous = previousOpenFolderId.current;
    previousOpenFolderId.current = model.folders.openFolderId;
    if (!previous || model.folders.openFolderId || model.launchPhase !== "idle" || activeDragId.current) return;
    boardElement.current?.querySelector<HTMLElement>(`.webspring-board-page [data-webspring-item-id="${previous}"]`)?.focus({ preventScroll: true });
  }, [model.folders.openFolderId, model.launchPhase]);

  useEffect(() => {
    const previous = previousLaunchPhase.current;
    previousLaunchPhase.current = model.launchPhase;
    if (model.launchPhase === "idle" && previous !== "idle") setIconExits(null);
    if (model.launchPhase !== "idle") setOpeningAppId(null);
  }, [model.launchPhase]);
  // The launch is complete once the app covers the board and the icons have gone.
  useEffect(() => {
    const transitionId = model.launchTransitionId, appId = model.launchingAppId;
    if (model.launchPhase !== "launching" || !transitionId || !appId) return;
    const { appZoom, iconExitDuration } = webspringBoardLaunchTiming;
    const seconds = model.presentationTraits.reducedMotion ? 0 : Math.max(iconExitDuration, appZoom.delay + appZoom.duration);
    return actions.scheduleLaunchCompletion(transitionId, appId, seconds * 1000);
  }, [actions, model.launchPhase, model.launchTransitionId, model.launchingAppId, model.presentationTraits.reducedMotion]);

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
      const member = openFolder?.apps.find((app) => app.id === dragId);
      const item = model.items.find((candidate) => candidate.id === dragId);
      const title = member?.title ?? (item ? item.kind === "app" ? item.app.title : item.title : null);
      if (title) announceMove(title, index);
    },
    merge(targetId) {
      actions.setDropTarget(targetId);
    },
    springOpen(folderId) {
      const index = model.items.findIndex((item) => item.id === folderId);
      folderOrigin.current = index >= 0 ? boardArtwork.current?.get(index) ?? null : null;
      actions.openFolder(folderId, { duringDrag: true });
    },
    leavePanel() {
      const dragId = activeDragId.current;
      // A member dragged past the edge returns to the top level where it left the folder.
      if (dragId && openFolder?.apps.some((app) => app.id === dragId) && model.folders.editable) {
        if (actions.moveAppOutOfFolder(dragId, topLevelIds.indexOf(openFolder.id) + 1)) {
          const app = openFolder.apps.find((candidate) => candidate.id === dragId);
          if (app) setAnnouncement(`${app.title} moved out of ${openFolder.title}.`);
        }
      }
      actions.closeFolder();
    }
  };

  /** Where the icon's centre is: the open folder's panel, or the Board's page. */
  function readDragView(root: HTMLElement): WebspringDragView {
    if (openFolder) {
      if (!panelArtwork.current?.size) {
        panelArtwork.current = captureWebspringDragArtworkRects(FOLDER_MEMBER_SELECTOR, ARTWORK_SELECTOR, root);
      }
      return {
        container: "folder",
        folderId: openFolder.id,
        panel: root.querySelector<HTMLElement>(FOLDER_PANEL_SELECTOR)?.getBoundingClientRect() ?? null,
        origin: folderOrigin.current,
        entries: readDragEntries(root, FOLDER_MEMBER_SELECTOR, panelArtwork.current, () => "app")
      };
    }
    const folderIds = new Set(model.items.filter((item) => item.kind === "folder").map((item) => item.id));
    return {
      container: "board",
      entries: readDragEntries(root, TOP_LEVEL_SELECTOR, boardArtwork.current, (id) => folderIds.has(id) ? "folder" : "app")
    };
  }

  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button > 0 || event.isPrimary === false || activeDragId.current) return;
    suppressNextClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    // The icon keeps its grab offset, so its centre follows the pointer instead of jumping to it.
    const entry = (event.target as Element | null)?.closest<HTMLElement>("[data-webspring-item-id]") ?? null;
    beginGrab(
      { x: event.clientX, y: event.clientY },
      entry?.querySelector<HTMLElement>(ARTWORK_SELECTOR)?.getBoundingClientRect() ?? null
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
      if (event.clientX >= bounds.right - 48 && activePage < board.pages.length - 1) {
        dragArbiter.current?.clear();
        setPage((value) => value + 1);
        lastPageSwitchAt.current = event.timeStamp;
        return;
      }
      if (event.clientX <= bounds.left + 48 && activePage > 0) {
        dragArbiter.current?.clear();
        setPage((value) => value - 1);
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
      if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        setPage((value) => Math.max(0, Math.min(board.pages.length - 1, value + (dx < 0 ? 1 : -1))));
        suppressNextClick.current = true;
      }
    }
    const dragId = activeDragId.current;
    if (dragId) {
      const result = dragArbiter.current?.end() ?? { mergeTargetId: null, folderId: null, dropIndex: null };
      dragArbiter.current = null;
      const dropFolder = result.folderId
        ? model.items.find((item): item is WebspringFolderItem => item.kind === "folder" && item.id === result.folderId) ?? null
        : null;
      const member = dropFolder?.apps.some((app) => app.id === dragId) ?? false;
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
    boardArtwork.current = undefined;
    panelArtwork.current = undefined;
    folderOrigin.current = null;
    hideProxy();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const launchActions = useMemo(() => ({ ...actions, openApp: (appId: string, route?: string) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return Promise.resolve({ status: "cancelled" as const });
    }
    feedback?.trigger("light", { intensity: .45 });
    const root = boardElement.current;
    if (root) setIconExits(createWebspringBoardLaunchExits(root));
    setOpeningAppId(appId);
    return actions.openApp(appId, route).then((result) => {
      setOpeningAppId((current) => current === appId ? null : current);
      if (result.status !== "completed") setIconExits(null);
      return result;
    });
  } }), [actions, feedback]);

  const beginPointerDrag = useCallback((itemId: string, pointerId: number) => {
    boardElement.current?.setPointerCapture?.(pointerId);
    activeDragId.current = itemId;
    const root = boardElement.current;
    boardArtwork.current = root ? captureWebspringDragArtworkRects(TOP_LEVEL_SELECTOR, ARTWORK_SELECTOR, root) : undefined;
    panelArtwork.current = root ? captureWebspringDragArtworkRects(FOLDER_MEMBER_SELECTOR, ARTWORK_SELECTOR, root) : undefined;
    const folderIndex = openFolder ? model.items.findIndex((item) => item.id === openFolder.id) : -1;
    folderOrigin.current = folderIndex >= 0 ? boardArtwork.current?.get(folderIndex) ?? null : null;
    const kind = model.items.find((item) => item.id === itemId)?.kind ?? "app";
    dragArbiter.current = createWebspringDragArbiter({
      itemId,
      kind,
      // Folders never merge, and a view with fixed folders has nothing to merge into.
      canMerge: model.folders.editable && kind === "app",
      reorder: (index) => dragHandlers.current?.reorder(index),
      merge: (targetId) => dragHandlers.current?.merge(targetId),
      springOpen: (folderId) => dragHandlers.current?.springOpen(folderId),
      leavePanel: (folderId) => dragHandlers.current?.leavePanel(folderId)
    });
    showProxy();
    suppressNextClick.current = true;
    feedback?.trigger("selection", { intensity: .5 });
  }, [feedback, model.folders.editable, model.items, showProxy]);

  const openFolderFromIcon = useCallback((folder: WebspringFolderItem, cell: HTMLElement) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (model.folders.openFolderId === folder.id) return;
    setFolderAnchor(cell.getBoundingClientRect());
    if (actions.openFolder(folder.id)) feedback?.trigger("light", { intensity: .4 });
  }, [actions, feedback, model.folders.openFolderId]);

  const entryProps = (index: number, containerIds: readonly string[], exit: WebspringRadialExit | undefined): BoardEntryProps => ({
    index,
    containerIds,
    columns,
    model,
    exit,
    actions: launchActions,
    reorderMotion: boardMotion.iconReorder,
    onLongPress: beginPointerDrag,
    onMoved: announceMove,
  });

  const renderEntry = (item: WebspringItem, globalIndex: number) => item.kind === "app"
    ? <BoardIcon key={item.id} app={item.app} opening={openingAppId === item.id} {...entryProps(globalIndex, topLevelIds, iconExits?.get(item.id))} />
    : <BoardFolderIcon key={item.id} folder={item} onOpen={openFolderFromIcon} {...entryProps(globalIndex, topLevelIds, iconExits?.get(item.id))} />;

  const renderFolderApp = (app: WebspringApp, index: number) => <BoardIcon
    key={app.id}
    app={app}
    opening={openingAppId === app.id}
    {...entryProps(index, openFolder?.apps.map((member) => member.id) ?? [], undefined)}
  />;

  return <MaterialProvider>
    <main
      ref={(element) => {
        boardElement.current = element;
        setStageElement(element);
      }}
      className="webspring-board"
      style={launcherStyle}
      data-launch-phase={model.launchPhase}
      data-entrance-phase={model.entrancePhase}
      data-layout-editing={model.layout.editing ? "true" : "false"}
      data-reduced-motion={model.presentationTraits.reducedMotion ? "true" : "false"}
      onPointerMoveCapture={pointerMove}
      onPointerUpCapture={(event) => pointerEnd(event, true)}
      onPointerCancelCapture={(event) => pointerEnd(event, false)}
      onLostPointerCapture={(event) => { if (event.target === event.currentTarget) pointerEnd(event, false); }}
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === " ") suppressNextClick.current = false;
      }}
    >
      <section
        className="webspring-board-launcher"
        aria-label="Webspring"
        onPointerDownCapture={pointerDown}
      >
        <div className="webspring-board-material" aria-hidden="true" onTransitionEnd={(event: TransitionEvent<HTMLDivElement>) => {
          if (model.launchPhase === "returning" && event.target === event.currentTarget && event.propertyName === "transform") actions.completeReturnTrack("material");
        }} />
        <header className="webspring-board-brand">
          {model.branding.logoUrl
            ? <img className="webspring-board-logo" src={model.branding.logoUrl} alt={model.branding.logoAlt} />
            : <span>{model.branding.name}</span>}
        </header>
        <div className={`webspring-board-controls ${model.layout.editing ? "is-editing" : ""}`}>
      {model.layout.editing ? <NSEToolbar composition="children" position="inline" grouped aria-label="Webspring edit controls">
        <NSEPushButton tone="dark" haptic="success" onClick={() => actions.finishEditing(true)}>Done</NSEPushButton>
        <NSEPushButton tone="dark" haptic="success" onClick={actions.resetOrder}>Reset</NSEPushButton>
      </NSEToolbar> : <NSEPushButton tone="dark" onClick={() => actions.beginEditing(null)} aria-describedby="webspring-board-keyboard-help">Reorder applications</NSEPushButton>}
        </div>
      <p id="webspring-board-keyboard-help" className="webspring-reorder-announcement">
        {model.folders.editable
          ? "Hold an application to reorder. Rest it on another application or a folder to group them. Use arrow keys to move it. Press Escape when finished."
          : "Hold an application to reorder. Use arrow keys to move it. Press Escape when finished."}
      </p>
      <section className="webspring-board-pages" style={pagesStyle} aria-label="Applications">
        <div className="webspring-board-page" data-page={activePage}>
          {board.pages[activePage]?.map((item, index) => renderEntry(item, activePage * board.pageSize + index))}
        </div>
      </section>
      {board.pages.length > 1 ? <nav className="webspring-board-page-controls" aria-label="Application pages">
        {board.pages.map((_items, index) => <button key={index} type="button" aria-label={`Show application page ${index + 1}`} aria-current={index === activePage ? "page" : undefined} onClick={() => setPage(index)} onPointerEnter={() => { if (model.layout.draggingItemId) setPage(index); }} />)}
      </nav> : null}
      </section>
      {model.widgets.length > 0 ? <WebspringWidgetShelf entries={model.widgets} surface={model.background.shelf} /> : null}
      {openFolder && folderAnchor && stageElement ? <div className="webspring-board-folder-layer" onPointerDownCapture={pointerDown}>
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
      <WebspringLaunchDim visible={model.launchPhase === "launching"} motion={launchDim} />
      {applicationOutlet}
      <WebspringDragProxy app={draggingApp} folder={draggingFolder} point={point} mobile proxyRef={dragProxyRef} />
      <span className="webspring-reorder-announcement" aria-live="polite">{announcement}</span>
    </main>
  </MaterialProvider>;
}

export function createWebspringBoardView(configuration: WebspringBoardConfiguration = {}) {
  const stableConfiguration = Object.freeze({ ...configuration });
  return Object.assign(function ConfiguredWebspringBoardView(props: WebspringViewProps) {
    return <WebspringBoard {...props} configuration={stableConfiguration} />;
  }, { returnTracks: Object.freeze(["material"] as const), launchZoom: webspringBoardLaunchTiming.appZoom });
}

export const WebspringBoardView = createWebspringBoardView();
