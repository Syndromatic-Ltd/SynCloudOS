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
import { useWebspringFolderPreparation } from "../../../useWebspringFolderPreparation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type TransitionEvent } from "react";
import { NSELayoutView, useNSEAnimationEnvironment, useNSEPresentation, type NSELayoutTransitionTiming } from "../../../../NSE/Animation";
import { Badge, LoadingSpinner } from "../../../../NSE/NSE";
import { useNSEFeedback } from "../../../../NSE/hostComposition";
import { NSEPushButton, NSEToolbar } from "@syndromatic/syncloudos/nse/controls";
import { MaterialProvider } from "../../../../NSE/Material";
import { getKeyboardReorderIndex } from "../../../../SynCloudOS/SynCloudOS";
import { LowerContentShelfView } from "../../../LowerContentShelfView";
import { WebspringDragProxy, useWebspringDragProxyPosition } from "../../../WebspringDragProxy";
import { WebspringFolderTile } from "../../../WebspringFolderTile";
import { captureWebspringDragReorderSlots, getWebspringDragReorderTargetFromPoint, type WebspringDragReorderSlots } from "../../../webspringDragReorder";
import { createWebspringBoardProjection } from "../../../webspringLayout";
import type { WebspringApp, WebspringFolderItem, WebspringItem, WebspringViewModel, WebspringViewProps } from "../../../webspringTypes";
import { resolveWebspringIconPresentation, type WebspringIconState, type WebspringRadialExit } from "../../../Webspring.transitions";
import { createWebspringBoardLaunchExits, useWebspringBoardMotion, webspringBoardLaunchTiming, type WebspringBoardLaunchExits } from "./WebspringBoardView.transitions";
import "../../../WebspringPresentation.css";
import "./WebspringBoardView.css";

const SWIPE_THRESHOLD = 44;
/** How long a dragged app rests over an entry's centre before they merge. */
const MERGE_HOVER_MS = 350;
const TOP_LEVEL_SELECTOR = ".webspring-board-page [data-webspring-item-id]";
const FOLDER_PANEL_SELECTOR = "[data-webspring-folder-panel]";
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

function BoardFolderIcon({ folder, onOpen, onPrepare, ...entry }: BoardEntryProps & {
  folder: WebspringFolderItem;
  onOpen(folder: WebspringFolderItem, cell: HTMLElement): void;
  /** Readies the opening as the folder is about to be opened. */
  onPrepare(): void;
}) {
  const { model, exit, reorderMotion, index } = entry;
  const interaction = useBoardEntryInteraction(folder.id, folder.title, false, entry);
  const { editing, dragging } = interaction;
  const prepare = editing ? undefined : onPrepare;
  const open = model.folders.openFolderId === folder.id;

  return <NSELayoutView className="webspring-board-slot" layoutTransition={dragging ? null : reorderMotion}><button
    type="button"
    className={`webspring-board-icon is-folder ${editing ? "is-editing" : ""} ${dragging ? "is-dragging" : ""}`}
    {...interaction.dataProps}
    aria-label={editing ? `Move folder ${folder.title}` : `Open folder ${folder.title}`}
    aria-pressed={editing ? dragging : undefined}
    aria-haspopup="dialog"
    aria-expanded={open}
    onPointerEnter={prepare}
    onFocus={prepare}
    onPointerDown={(event) => {
      prepare?.();
      interaction.onPointerDown(event);
    }}
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

/** The top-level entry whose centre (the inner half of its slot) holds the point. */
function getMergeTarget(
  slots: WebspringDragReorderSlots | undefined,
  items: readonly WebspringItem[],
  point: { x: number; y: number },
  draggingId: string,
) {
  for (const [index, rect] of slots ?? []) {
    const item = items[index];
    if (!item || item.id === draggingId) continue;
    const insetX = rect.width / 4;
    const insetY = rect.height / 4;
    if (point.x >= rect.left + insetX && point.x <= rect.left + rect.width - insetX &&
      point.y >= rect.top + insetY && point.y <= rect.top + rect.height - insetY) return item.id;
  }
  return null;
}

function WebspringBoard({ model, actions, applicationOutlet, folderPresentation: FolderPresentation, configuration }: WebspringViewProps & { configuration: WebspringBoardConfiguration }) {
  const feedback = useNSEFeedback();
  const boardMotion = useWebspringBoardMotion();
  const columns = 4;
  const pageSize = configuration.pageSize ?? (model.layout.board.pageSize === 20 ? columns * 4 : model.layout.board.pageSize);
  const board = useMemo(() => createWebspringBoardProjection(model.items, { pageSize, dockSize: 0 }), [model.items, pageSize]);
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
  const slotsRef = useRef<WebspringDragReorderSlots | undefined>(undefined);
  /** The entry a dragged app rests on; `armed` once it has rested long enough to merge. */
  const mergeHover = useRef<{ id: string; timer: number; view: Window; armed: boolean } | null>(null);
  const { point, setProxyElement, recordPoint, showProxy, hideProxy } = useWebspringDragProxyPosition();
  const draggingId = model.layout.draggingItemId;
  const draggingItem = model.items.find((item) => item.id === draggingId) ?? null;
  const draggingFolder = draggingItem?.kind === "folder" ? draggingItem : null;
  const draggingApp = draggingItem?.kind === "app" ? draggingItem.app : model.apps.find((app) => app.id === draggingId) ?? null;
  const openFolder = model.items.find((item): item is WebspringFolderItem => item.kind === "folder" && item.id === model.folders.openFolderId) ?? null;
  const [folderAnchor, setFolderAnchor] = useState<DOMRectReadOnly | null>(null);
  const prepareFolder = useWebspringFolderPreparation(FolderPresentation, model.items.some((item) => item.kind === "folder") ? stageElement : null);
  const activePage = Math.min(page, board.pages.length - 1);
  const launchDim = boardMotion.launchBackdropDim;
  const [iconExits, setIconExits] = useState<WebspringBoardLaunchExits | null>(null);
  // The tapped app shows its spinner at once, while its bundle loads.
  const [openingAppId, setOpeningAppId] = useState<string | null>(null);
  const previousLaunchPhase = useRef(model.launchPhase);
  const previousOpenFolderId = useRef(model.folders.openFolderId);
  useEffect(() => setPage((value) => Math.min(value, board.pages.length - 1)), [board.pages.length]);
  draggingItemIdRef.current = model.layout.draggingItemId;
  // Read through a ref so a new actions object never counts as a page change.
  const setDropTargetRef = useRef(actions.setDropTarget);
  setDropTargetRef.current = actions.setDropTarget;
  /** Forgets the hovered merge candidate and withdraws the target it armed. */
  const disarmMerge = useCallback(() => {
    const hover = mergeHover.current;
    if (!hover) return;
    hover.view.clearTimeout(hover.timer);
    mergeHover.current = null;
    if (hover.armed) setDropTargetRef.current(null);
  }, []);
  useEffect(() => () => {
    disarmMerge();
    if (draggingItemIdRef.current) actions.finishDrag(false);
    hideProxy();
  }, [actions, disarmMerge, hideProxy]);
  useEffect(() => {
    if (model.layout.draggingItemId) return;
    activeDragId.current = null;
    slotsRef.current = undefined;
    disarmMerge();
    const pointerId = pointerStart.current?.pointerId;
    pointerStart.current = null;
    hideProxy();
    const root = boardElement.current;
    if (pointerId !== undefined && root?.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
  }, [model.layout.draggingItemId, disarmMerge, hideProxy]);
  // A drag that leaves a folder, or turns the page, measures the top level
  // afresh; a merge armed on the previous page no longer applies.
  useEffect(() => {
    disarmMerge();
    if (activeDragId.current && boardElement.current) {
      slotsRef.current = captureWebspringDragReorderSlots(TOP_LEVEL_SELECTOR, boardElement.current);
    }
  }, [activePage, model.folders.openFolderId, disarmMerge]);
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

  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button > 0 || event.isPrimary === false || activeDragId.current) return;
    suppressNextClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    slotsRef.current = captureWebspringDragReorderSlots("[data-webspring-item-id]", event.currentTarget);
    recordPoint({ x: event.clientX, y: event.clientY }, Boolean(activeDragId.current));
  }

  /** Reorders inside the open folder; leaving its panel takes the app out to the top level. */
  function dragInFolder(root: HTMLElement, dragId: string, folder: WebspringFolderItem, at: { x: number; y: number }) {
    const panel = root.querySelector<HTMLElement>(FOLDER_PANEL_SELECTOR)?.getBoundingClientRect();
    if (!panel || (at.x >= panel.left && at.x <= panel.right && at.y >= panel.top && at.y <= panel.bottom)) {
      const target = getWebspringDragReorderTargetFromPoint(`${FOLDER_PANEL_SELECTOR} [data-webspring-item-id]`, at, dragId, root, slotsRef.current);
      if (target && actions.moveItem(dragId, target.targetIndex, false)) {
        const app = folder.apps.find((candidate) => candidate.id === dragId);
        if (app) announceMove(app.title, target.targetIndex);
      }
      return;
    }
    if (!model.folders.editable) return;
    const folderIndex = topLevelIds.indexOf(folder.id);
    actions.closeFolder();
    if (actions.moveAppOutOfFolder(dragId, folderIndex + 1)) {
      const app = folder.apps.find((candidate) => candidate.id === dragId);
      if (app) setAnnouncement(`${app.title} moved out of ${folder.title}.`);
    }
    slotsRef.current = undefined;
  }

  /** Over an entry's centre a dragged app waits to merge; elsewhere it reorders. */
  function dragAtTopLevel(root: HTMLElement, dragId: string, at: { x: number; y: number }) {
    if (model.folders.editable && !draggingFolder) {
      const mergeId = getMergeTarget(slotsRef.current, model.items, at, dragId);
      // A new candidate, or none, starts the rest over.
      if (mergeHover.current?.id !== mergeId) disarmMerge();
      if (mergeId) {
        const view = root.ownerDocument.defaultView;
        if (view && !mergeHover.current) {
          const hover = { id: mergeId, view, armed: false, timer: 0 };
          hover.timer = view.setTimeout(() => {
            if (mergeHover.current !== hover) return;
            hover.armed = true;
            actions.setDropTarget(mergeId);
          }, MERGE_HOVER_MS);
          mergeHover.current = hover;
        }
        return;
      }
    }
    const target = getWebspringDragReorderTargetFromPoint(TOP_LEVEL_SELECTOR, at, dragId, root, slotsRef.current);
    if (target && actions.moveItem(dragId, target.targetIndex, false)) {
      const item = model.items.find((candidate) => candidate.id === dragId);
      const title = item ? item.kind === "app" ? item.app.title : item.title : null;
      if (title) announceMove(title, target.targetIndex);
    }
  }

  function pointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== pointerStart.current?.pointerId) return;
    recordPoint({ x: event.clientX, y: event.clientY }, Boolean(activeDragId.current));
    const dragId = activeDragId.current;
    if (!dragId) return;
    showProxy();
    const at = { x: event.clientX, y: event.clientY };
    const folder = openFolder?.apps.some((app) => app.id === dragId) ? openFolder : null;
    if (folder) {
      dragInFolder(event.currentTarget, dragId, folder, at);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.timeStamp - lastPageSwitchAt.current > 450) {
      if (event.clientX >= bounds.right - 48 && activePage < board.pages.length - 1) {
        disarmMerge();
        setPage((value) => value + 1);
        lastPageSwitchAt.current = event.timeStamp;
        return;
      }
      if (event.clientX <= bounds.left + 48 && activePage > 0) {
        disarmMerge();
        setPage((value) => value - 1);
        lastPageSwitchAt.current = event.timeStamp;
        return;
      }
    }
    dragAtTopLevel(event.currentTarget, dragId, at);
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
    // Only the entry under the pointer, once armed, takes the drop.
    const mergeId = mergeHover.current?.armed ? mergeHover.current.id : null;
    disarmMerge();
    const dragId = activeDragId.current;
    if (dragId) {
      const merged = commit && mergeId !== null && actions.dropOnItem(dragId, mergeId);
      actions.finishDrag(commit);
      if (merged) feedback?.trigger("success", { intensity: .45 });
      else if (commit) feedback?.trigger("light", { intensity: .35 });
      activeDragId.current = null;
      suppressNextClick.current = true;
    }
    pointerStart.current = null;
    slotsRef.current = undefined;
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
    showProxy();
    suppressNextClick.current = true;
    feedback?.trigger("selection", { intensity: .5 });
  }, [feedback, showProxy]);

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
    : <BoardFolderIcon key={item.id} folder={item} onOpen={openFolderFromIcon} onPrepare={prepareFolder} {...entryProps(globalIndex, topLevelIds, iconExits?.get(item.id))} />;

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
      <section className="webspring-board-pages" aria-label="Applications">
        <div className="webspring-board-page" data-page={activePage}>
          {board.pages[activePage]?.map((item, index) => renderEntry(item, activePage * board.pageSize + index))}
        </div>
      </section>
      {board.pages.length > 1 ? <nav className="webspring-board-page-controls" aria-label="Application pages">
        {board.pages.map((_items, index) => <button key={index} type="button" aria-label={`Show application page ${index + 1}`} aria-current={index === activePage ? "page" : undefined} onClick={() => setPage(index)} onPointerEnter={() => { if (model.layout.draggingItemId) setPage(index); }} />)}
      </nav> : null}
      </section>
      <div className="webspring-board-journal">
        <div className="webspring-board-paper-glow" aria-hidden="true" />
        <LowerContentShelfView
          selectedApp={null}
          mode="news"
          notification={null}
          sections={model.sections}
          onOpenContent={actions.openApp}
          onRefreshContent={actions.refreshContent}
          onOpenNotificationCentre={actions.openNotificationCentre}
        />
      </div>
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
      <WebspringDragProxy app={draggingApp} folder={draggingFolder} point={point} mobile proxyRef={setProxyElement} />
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
