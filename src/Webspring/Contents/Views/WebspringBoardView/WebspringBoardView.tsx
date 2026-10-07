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
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type TransitionEvent } from "react";
import { NSELayoutView, useNSEAnimationEnvironment, useNSEPresentation, type NSELayoutTransitionTiming } from "../../../../NSE/Animation";
import { Badge, LoadingSpinner } from "../../../../NSE/NSE";
import { useNSEFeedback } from "../../../../NSE/hostComposition";
import { NSEPushButton, NSEToolbar } from "@syndromatic/syncloudos/nse/controls";
import { MaterialProvider } from "../../../../NSE/Material";
import { LowerContentShelfView } from "../../../LowerContentShelfView";
import { WebspringDragProxy, useWebspringDragProxyPosition } from "../../../WebspringDragProxy";
import { captureWebspringDragReorderSlots, getWebspringDragReorderTargetFromPoint, type WebspringDragReorderSlots } from "../../../webspringDragReorder";
import { createWebspringBoardProjection, getKeyboardReorderIndex } from "../../../webspringLayout";
import type { WebspringViewModel, WebspringViewProps } from "../../../webspringTypes";
import { resolveWebspringIconPresentation, type WebspringIconState, type WebspringRadialExit } from "../../../Webspring.transitions";
import { createWebspringBoardLaunchExits, useWebspringBoardMotion, webspringBoardLaunchTiming, type WebspringBoardLaunchExits } from "./WebspringBoardView.transitions";
import "../../../WebspringPresentation.css";
import "./WebspringBoardView.css";

const SWIPE_THRESHOLD = 44;
type BoardApp = WebspringViewModel["apps"][number];
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

function BoardIcon({ app, index, columns, model, exit, opening, actions, reorderMotion, onLongPress, onMoved }: {
  app: BoardApp;
  index: number;
  columns: number;
  model: WebspringViewModel;
  exit: WebspringRadialExit | undefined;
  /** Tapped and loading, before the launch begins. */
  opening: boolean;
  actions: WebspringViewProps["actions"];
  reorderMotion: NSELayoutTransitionTiming | null;
  onLongPress(appId: string, pointerId: number): void;
  onMoved(app: BoardApp, index: number): void;
}) {
  const cancelLongPress = useRef<(() => void) | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const clearTimer = () => {
    cancelLongPress.current?.();
    cancelLongPress.current = null;
  };
  useEffect(() => clearTimer, []);
  const loading = opening || app.state === "loading" || app.state === "launching" || model.launchingAppId === app.id;
  const editing = model.layout.editing;
  const dragging = model.layout.draggingAppId === app.id;
  const disabled = app.state === "disabled";

  function handleKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && editing) {
      event.preventDefault();
      actions.finishEditing(true);
      return;
    }
    if (!editing || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const targetIndex = getKeyboardReorderIndex(model.apps.map((candidate) => candidate.id), app.id, event.key, columns);
    if (actions.moveAppByKeyboard(app.id, event.key, columns)) onMoved(app, targetIndex);
  }

  // A slot springs to wherever an update lays it out (a new cell on reorder,
  // or the grid shifting); the dragged icon follows the pointer's proxy, so
  // its slot moves at once.
  return <NSELayoutView className="webspring-board-slot" layoutTransition={dragging ? null : reorderMotion}><button
    type="button"
    className={`webspring-board-icon ${editing ? "is-editing" : ""} ${dragging ? "is-dragging" : ""} ${disabled ? "is-disabled" : ""}`}
    data-webspring-app-id={app.id}
    data-order-index={index}
    aria-label={editing ? `Move ${app.title}` : `Open ${app.title}`}
    aria-pressed={editing ? dragging : undefined}
    disabled={disabled}
    aria-description={disabled ? app.disabledReason : undefined}
    title={disabled ? app.disabledReason : undefined}
    onFocus={() => actions.prefetchApp(app.id, true)}
    onBlur={() => actions.prefetchApp(app.id, false)}
    onPointerDown={(event) => {
      if (event.button > 0 || event.isPrimary === false || disabled) return;
      pressStart.current = { x: event.clientX, y: event.clientY };
      if (editing) {
        actions.beginDrag(app.id);
        onLongPress(app.id, event.pointerId);
        return;
      }
      cancelLongPress.current = actions.scheduleLongPress(app.id, () => {
        onLongPress(app.id, event.pointerId);
      });
    }}
    onPointerMove={(event) => {
      const start = pressStart.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) clearTimer();
    }}
    onPointerUp={() => { pressStart.current = null; clearTimer(); }}
    onPointerCancel={() => { pressStart.current = null; clearTimer(); }}
    onLostPointerCapture={() => { pressStart.current = null; clearTimer(); }}
    onKeyDown={handleKeyboard}
    onClick={() => { if (!disabled && !editing) void actions.openApp(app.id, app.route); }}
  >
    <BoardIconArtwork index={index} total={model.apps.length} state={boardIconState(model, exit)} exit={exit}>
      <span className="webspring-board-icon-well" data-loading={loading ? "true" : undefined}>
        {app.iconUrl ? <img src={app.iconUrl} alt="" aria-hidden="true" draggable={false} /> : <span aria-hidden="true">{app.title.slice(0, 1)}</span>}
        {loading ? <LoadingSpinner label={`Loading ${app.title}`} variant="dark" /> : null}
        <Badge count={app.badgeCount} />
      </span>
      <span className="webspring-board-icon-label">{app.title}</span>
    </BoardIconArtwork>
  </button></NSELayoutView>;
}

function WebspringBoard({ model, actions, applicationOutlet, configuration }: WebspringViewProps & { configuration: WebspringBoardConfiguration }) {
  const feedback = useNSEFeedback();
  const boardMotion = useWebspringBoardMotion();
  const columns = 4;
  const pageSize = configuration.pageSize ?? (model.layout.board.pageSize === 20 ? columns * 4 : model.layout.board.pageSize);
  const board = useMemo(() => createWebspringBoardProjection(model.apps, { pageSize, dockSize: 0 }), [model.apps, pageSize]);
  const [page, setPage] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const boardElement = useRef<HTMLElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const draggingAppIdRef = useRef<string | null>(model.layout.draggingAppId);
  const suppressNextClick = useRef(false);
  const activeDragId = useRef<string | null>(model.layout.draggingAppId);
  const lastPageSwitchAt = useRef(0);
  const slotsRef = useRef<WebspringDragReorderSlots | undefined>(undefined);
  const { point, setProxyElement, recordPoint, showProxy, hideProxy } = useWebspringDragProxyPosition();
  const draggingApp = model.apps.find((app) => app.id === model.layout.draggingAppId) ?? null;
  const activePage = Math.min(page, board.pages.length - 1);
  const launchDim = boardMotion.launchBackdropDim;
  const [iconExits, setIconExits] = useState<WebspringBoardLaunchExits | null>(null);
  // The tapped app shows its spinner at once, while its bundle loads.
  const [openingAppId, setOpeningAppId] = useState<string | null>(null);
  const previousLaunchPhase = useRef(model.launchPhase);
  useEffect(() => setPage((value) => Math.min(value, board.pages.length - 1)), [board.pages.length]);
  draggingAppIdRef.current = model.layout.draggingAppId;
  useEffect(() => () => {
    if (draggingAppIdRef.current) actions.finishDrag(false);
    hideProxy();
  }, [actions, hideProxy]);
  useEffect(() => {
    if (model.layout.draggingAppId) return;
    activeDragId.current = null;
    slotsRef.current = undefined;
    const pointerId = pointerStart.current?.pointerId;
    pointerStart.current = null;
    hideProxy();
    const root = boardElement.current;
    if (pointerId !== undefined && root?.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
  }, [model.layout.draggingAppId, hideProxy]);
  useEffect(() => {
    if (activeDragId.current && boardElement.current) {
      slotsRef.current = captureWebspringDragReorderSlots("[data-webspring-app-id]", boardElement.current);
    }
  }, [activePage]);
  useEffect(() => {
    if (model.launchPhase === "returning" && (model.presentationTraits.reducedMotion || model.apps.length === 0)) {
      actions.completeReturnTrack("material");
    }
  }, [actions, model.apps.length, model.launchPhase, model.presentationTraits.reducedMotion]);

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

  const announceMove = useCallback((app: BoardApp, index: number) => {
    feedback?.trigger("selection", { intensity: .35 });
    setAnnouncement(`${app.title} moved to position ${index + 1}.`);
  }, [feedback]);

  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button > 0 || event.isPrimary === false || activeDragId.current) return;
    suppressNextClick.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    slotsRef.current = captureWebspringDragReorderSlots("[data-webspring-app-id]", event.currentTarget);
    recordPoint({ x: event.clientX, y: event.clientY }, Boolean(activeDragId.current));
  }

  function pointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerId !== pointerStart.current?.pointerId) return;
    recordPoint({ x: event.clientX, y: event.clientY }, Boolean(activeDragId.current));
    const draggingId = activeDragId.current;
    if (!draggingId) return;
    showProxy();
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.timeStamp - lastPageSwitchAt.current > 450) {
      if (event.clientX >= bounds.right - 48 && activePage < board.pages.length - 1) {
        setPage((value) => value + 1);
        lastPageSwitchAt.current = event.timeStamp;
        return;
      }
      if (event.clientX <= bounds.left + 48 && activePage > 0) {
        setPage((value) => value - 1);
        lastPageSwitchAt.current = event.timeStamp;
        return;
      }
    }
    const target = getWebspringDragReorderTargetFromPoint(
      ".webspring-board [data-webspring-app-id]",
      { x: event.clientX, y: event.clientY },
      draggingId,
      event.currentTarget,
      slotsRef.current,
    );
    if (target && actions.moveApp(draggingId, target.targetIndex, false)) {
      const app = model.apps.find((candidate) => candidate.id === draggingId);
      if (app) announceMove(app, target.targetIndex);
    }
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
    if (activeDragId.current) {
      actions.finishDrag(commit);
      if (commit) feedback?.trigger("light", { intensity: .35 });
      activeDragId.current = null;
      suppressNextClick.current = true;
    }
    pointerStart.current = null;
    slotsRef.current = undefined;
    hideProxy();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const renderIcon = (app: BoardApp, globalIndex: number) => <BoardIcon
    key={app.id}
    app={app}
    index={globalIndex}
    columns={columns}
    model={model}
    exit={iconExits?.get(app.id)}
    opening={openingAppId === app.id}
    actions={{ ...actions, openApp: (appId, route) => {
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
    } }}
    reorderMotion={boardMotion.iconReorder}
    onLongPress={(appId, pointerId) => {
      boardElement.current?.setPointerCapture?.(pointerId);
      activeDragId.current = appId;
      showProxy();
      suppressNextClick.current = true;
      feedback?.trigger("selection", { intensity: .5 });
    }}
    onMoved={announceMove}
  />;

  return <MaterialProvider>
    <main
      ref={boardElement}
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
        if (!model.layout.editing && (event.key === "Enter" || event.key === " ")) suppressNextClick.current = false;
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
      <p id="webspring-board-keyboard-help" className="webspring-reorder-announcement">Hold an application to reorder. Use arrow keys to move it. Press Escape when finished.</p>
      <section className="webspring-board-pages" aria-label="Applications">
        <div className="webspring-board-page" data-page={activePage}>
          {board.pages[activePage]?.map((app, index) => renderIcon(app, activePage * board.pageSize + index))}
        </div>
      </section>
      {board.pages.length > 1 ? <nav className="webspring-board-page-controls" aria-label="Application pages">
        {board.pages.map((_apps, index) => <button key={index} type="button" aria-label={`Show application page ${index + 1}`} aria-current={index === activePage ? "page" : undefined} onClick={() => setPage(index)} onPointerEnter={() => { if (model.layout.draggingAppId) setPage(index); }} />)}
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
      <WebspringLaunchDim visible={model.launchPhase === "launching"} motion={launchDim} />
      {applicationOutlet}
      <WebspringDragProxy app={draggingApp} point={point} mobile proxyRef={setProxyElement} />
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
