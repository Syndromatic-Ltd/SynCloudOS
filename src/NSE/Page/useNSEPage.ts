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
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useNSEAnimationEnvironment } from "../Animation";
import { useNSEFeedback } from "../Feedback";
import { nseUnowned } from "../Controllers/ownership";
import { useNSEDeferredDisposal } from "../interactionLifecycle";
import { NSEPageController } from "./NSEPageController";
import {
  clampNSEPageProgress,
  easeInOutNSEPageProgress,
  easeOutNSEPageProgress,
  getNSEPageCurlDragProgress,
  getNSEPageDefaultCorner,
  getNSEPageGeometryStyle,
  getNSEPageNearestEdge,
  getNSEPageProgressFromPoint,
  getNSEPageTearDefaultCorner,
  getNSEPageTearDragProgress,
  isNSEPagePointNearEdge,
  isNSEPageTearGrab,
  NSE_PAGE_TEAR_FREE_AT,
  resolveNSEPageGeometry
} from "./nsePageGeometry";
import { getNSEPagePreset } from "./nsePagePresets";
import type {
  NSEPageCompletionReason,
  NSEPageControllerSnapshot,
  NSEPageDogEarHandlers,
  NSEPageEdge,
  NSEPageEvent,
  NSEPageGeometry,
  NSEPageGestureOptions,
  NSEPageHandle,
  NSEPagePhase,
  NSEPagePoint,
  NSEPagePointerHandler,
  NSEPageSize,
  NSEPageTurnOptions,
  UseNSEPageOptions,
  UseNSEPageResult
} from "./nsePageTypes";

const DEFAULT_PAGE_SIZE: NSEPageSize = { width: 480, height: 640 };
/** How far a finger must move before a book leaf lifts to follow it, in px. */
const BOOK_DRAG_SLOP_PX = 6;

function getNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function requestFrame(callback: FrameRequestCallback) {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(() => callback(getNow()), 16) as unknown as number;
}

function cancelFrame(frame: number) {
  if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frame);
    return;
  }
  globalThis.clearTimeout(frame);
}

function resolveGestureOptions(
  interactive: boolean | NSEPageGestureOptions | undefined,
  presetGesture: NSEPageGestureOptions
): Required<NSEPageGestureOptions> {
  const fallbackEdge = Array.isArray(presetGesture.edges) ? presetGesture.edges[0] ?? "right" : "right";
  if (interactive === false) {
    return {
      enabled: false,
      edges: [fallbackEdge],
      snapThreshold: presetGesture.snapThreshold ?? 0.5,
      openProgress: presetGesture.openProgress ?? 1,
      edgeActivationSize: presetGesture.edgeActivationSize ?? 64,
      preventScroll: presetGesture.preventScroll ?? true,
      haptics: presetGesture.haptics ?? true
    };
  }

  const options = typeof interactive === "object" ? interactive : {};
  return {
    enabled: typeof interactive === "object" ? options.enabled ?? true : interactive === true,
    edges: options.edges ?? presetGesture.edges ?? "all",
    snapThreshold: options.snapThreshold ?? presetGesture.snapThreshold ?? 0.5,
    openProgress: options.openProgress ?? presetGesture.openProgress ?? 1,
    edgeActivationSize: options.edgeActivationSize ?? presetGesture.edgeActivationSize ?? 64,
    preventScroll: options.preventScroll ?? presetGesture.preventScroll ?? true,
    haptics: options.haptics ?? presetGesture.haptics ?? true
  };
}

function getAllowedEdges(edges: NSEPageGestureOptions["edges"], fallback: NSEPageEdge): NSEPageEdge[] {
  if (edges === "all") return ["left", "right", "top", "bottom"];
  if (Array.isArray(edges) && edges.length > 0) return edges;
  return [fallback];
}

function pointFromPointer(event: { clientX: number; clientY: number }): NSEPagePoint {
  return { x: event.clientX, y: event.clientY };
}

/** A tear gathers pace as the paper gives, and the sheet leaves at speed. */
function easeTearProgress(progress: number) {
  const t = clampNSEPageProgress(progress);
  return t * t * (2.2 - 1.2 * t);
}

/** A tear let go mid-pull carries on at the finger's pace, quickening as the sheet comes free. */
function easeReleasedTearProgress(progress: number) {
  const t = clampNSEPageProgress(progress);
  return t * (0.7 + 0.3 * t);
}

function newTearSeed() {
  return 1 + Math.random() * 997;
}

export function useNSEPage(options: UseNSEPageOptions = {}): UseNSEPageResult {
  const feedback = useNSEFeedback();
  const { reducedMotion: environmentReducedMotion } = useNSEAnimationEnvironment();
  const reducedMotion = options.reducedMotion ?? environmentReducedMotion;
  const preset = useMemo(() => getNSEPagePreset(options.preset, options.presetOverrides), [options.preset, options.presetOverrides]);
  const controllerRef = useRef<NSEPageController | null>(null);
  const rootElementRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeTurnRef = useRef<object | null>(null);
  /** A turn waiting for the rendering surface before it starts. */
  /** A turn waiting for its renderer to be ready, and where it is headed. */
  const pendingTurnRef = useRef<{ targetProgress: number } | null>(null);
  const draggingRef = useRef<{ pointerId: number; edge: NSEPageEdge; startedAt: number; startedProgress: number; origin: NSEPagePoint | null; peak: number } | null>(null);
  /** Shapes the ragged line of the page's next tear. */
  const tearSeedRef = useRef(newTearSeed());
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const [pageSize, setPageSize] = useState<NSEPageSize>(DEFAULT_PAGE_SIZE);
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const dragPointerRef = useRef<NSEPagePoint | null>(null);
  const dragMovedRef = useRef(false);
  // Latest pointer sample + its scheduled rAF, so drag frames are coalesced to
  // one geometry apply per display frame (see onPointerMove).
  const pendingMoveRef = useRef<{ clientX: number; clientY: number; pointerId: number } | null>(null);
  const moveFrameRef = useRef<number | null>(null);

  const resolvedMode = options.mode ?? preset.mode;
  const resolvedCorner = options.corner ?? preset.corner ?? (resolvedMode === "tear"
    ? getNSEPageTearDefaultCorner(options.edge ?? preset.edge)
    : getNSEPageDefaultCorner(options.edge ?? preset.edge));
  // In curl mode "closed" is the resting fold — the real dog-ear.
  const restProgress = resolvedMode === "curl" ? preset.motion.restProgress ?? 0.06 : 0;

  if (controllerRef.current == null) {
    const initialOpenProgress = preset.interaction.openProgress ?? 1;
    const initialProgress = options.progress ?? (
      options.open != null
        ? options.open ? initialOpenProgress : restProgress
        : options.defaultOpen
          ? initialOpenProgress
          : options.defaultProgress ?? restProgress
    );
    controllerRef.current = new NSEPageController({
      owner: nseUnowned,
      progress: initialProgress,
      mode: options.mode ?? preset.mode,
      edge: options.edge ?? preset.edge,
      direction: options.direction ?? preset.direction,
      torn: options.torn
    });
  }

  const controller = controllerRef.current;
  useNSEDeferredDisposal(controller);
  const [snapshot, setSnapshot] = useState<NSEPageControllerSnapshot>(() => controller.getSnapshot());
  const snapshotRef = useRef(snapshot);
  const lastPhaseRef = useRef<NSEPagePhase>(snapshot.phase);
  const lastOpenRef = useRef(snapshot.progress >= (preset.interaction.openProgress ?? 1));
  // A parent render may occur between coalesced drag samples. React's last
  // snapshot can be older than the controller; never overwrite live progress.
  snapshotRef.current = controller.getSnapshot();

  const effectiveSnapshot = useMemo(() => {
    const openProgress = preset.interaction.openProgress ?? 1;
    const progress = options.progress ?? (options.open == null ? snapshot.progress : options.open ? openProgress : restProgress);
    return {
      ...snapshot,
      progress: clampNSEPageProgress(progress),
      targetProgress: clampNSEPageProgress(options.open == null ? snapshot.targetProgress : options.open ? openProgress : restProgress),
      mode: options.mode ?? snapshot.mode ?? preset.mode,
      edge: options.edge ?? snapshot.edge ?? preset.edge,
      corner: options.corner ?? preset.corner,
      direction: options.direction ?? snapshot.direction ?? preset.direction,
      torn: options.torn ?? snapshot.torn
    };
  }, [options.corner, options.direction, options.edge, options.mode, options.open, options.progress, options.torn, preset.corner, preset.direction, preset.edge, preset.interaction.openProgress, preset.mode, restProgress, snapshot]);

  const geometry = useMemo(() => resolveNSEPageGeometry({
    progress: effectiveSnapshot.progress,
    mode: effectiveSnapshot.mode,
    edge: effectiveSnapshot.edge,
    direction: effectiveSnapshot.direction,
    corner: effectiveSnapshot.corner,
    phase: effectiveSnapshot.phase,
    motion: preset.motion,
    material: preset.material,
    torn: effectiveSnapshot.torn,
    size: pageSize,
    pointer: dragPointerRef.current ?? undefined,
    reducedMotion,
    tearSeed: tearSeedRef.current
  }), [effectiveSnapshot, pageSize, preset.material, preset.motion, reducedMotion]);

  const emit = useCallback((reason: NSEPageCompletionReason, nextSnapshot = controller.getSnapshot()) => {
    const event: NSEPageEvent = { snapshot: nextSnapshot, reason };
    callbacksRef.current.onProgressChange?.(nextSnapshot.progress, event);
    if (nextSnapshot.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = nextSnapshot.phase;
      callbacksRef.current.onPhaseChange?.(nextSnapshot.phase, event);
    }
    const openProgress = preset.interaction.openProgress ?? 1;
    const isEndpoint = nextSnapshot.progress === 0 || nextSnapshot.progress >= openProgress;
    const isOpen = nextSnapshot.progress >= openProgress;
    if (isEndpoint && isOpen !== lastOpenRef.current) {
      lastOpenRef.current = isOpen;
      callbacksRef.current.onOpenChange?.(isOpen, event);
    }
    return event;
  }, [controller, preset.interaction.openProgress]);

  // Untransformed layout size (not getBoundingClientRect): ancestors animate
  // transforms (e.g. the app launch zoom) and the fold math needs untransformed
  // px. ResizeObserver's borderBoxSize supplies this in *fractional* CSS px, so
  // the fold maps precisely onto the rendered box at fractional DPR (Windows
  // 125/150%, Retina); offsetWidth (integer) is only the initial/fallback read.
  const applyMeasuredSize = useCallback((width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    setPageSize((current) =>
      Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { width, height }
    );
  }, []);

  const setRootRef = useCallback((node: HTMLElement | null) => {
    rootElementRef.current = node;
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!node) return;
    applyMeasuredSize(node.offsetWidth, node.offsetHeight);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        const box = entry && (Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize);
        if (box) applyMeasuredSize(box.inlineSize, box.blockSize);
        else applyMeasuredSize(node.offsetWidth, node.offsetHeight);
      });
      observer.observe(node);
      resizeObserverRef.current = observer;
    }
  }, [applyMeasuredSize]);

  const clearAnimation = useCallback(() => {
    if (frameRef.current != null) {
      cancelFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const commitProgress = useCallback((progress: number, reason: NSEPageCompletionReason = "programmatic") => {
    const nextSnapshot = controller.setProgress(progress, reason);
    emit(reason, nextSnapshot);
    return nextSnapshot;
  }, [controller, emit]);

  const cancelActiveTurn = useCallback((reason: Extract<NSEPageCompletionReason, "cancel" | "superseded"> = "superseded") => {
    pendingTurnRef.current = null;
    clearAnimation();
    if (activeTurnRef.current == null) return false;
    activeTurnRef.current = null;
    const canceledSnapshot = controller.cancel(reason);
    const canceledEvent = emit(reason, canceledSnapshot);
    callbacksRef.current.onTurnEnd?.(canceledEvent);
    return true;
  }, [clearAnimation, controller, emit]);

  const cancelToRest = useCallback(() => {
    pendingTurnRef.current = null;
    clearAnimation();
    const endedActiveTurn = activeTurnRef.current != null;
    activeTurnRef.current = null;
    const canceledSnapshot = controller.cancel("cancel");
    emit("cancel", canceledSnapshot);
    const restingSnapshot = controller.complete(restProgress, "cancel");
    const restingEvent = emit("cancel", restingSnapshot);
    if (endedActiveTurn) callbacksRef.current.onTurnEnd?.(restingEvent);
  }, [clearAnimation, controller, emit, restProgress]);

  const startTurn = useCallback((targetProgress: number, turnOptions: NSEPageTurnOptions = {}) => {
    cancelActiveTurn();
    const target = clampNSEPageProgress(targetProgress);
    const startSnapshot = controller.startTurn({
      ...turnOptions,
      targetProgress: target,
      mode: turnOptions.mode ?? options.mode ?? preset.mode,
      edge: turnOptions.edge ?? options.edge ?? preset.edge,
      direction: turnOptions.direction ?? options.direction ?? preset.direction,
      reason: turnOptions.reason ?? "programmatic"
    });
    const turnToken = {};
    activeTurnRef.current = turnToken;
    const startEvent = emit(startSnapshot.reason, startSnapshot);
    callbacksRef.current.onTurnStart?.(startEvent);

    const from = startSnapshot.progress;
    const releasedPointer = preset.motion.curlPath === "book" ? dragPointerRef.current : null;
    const tearing = startSnapshot.mode === "tear";
    // A tear let go carries on along the finger's pull; one let go short of
    // tearing eases back as the finger's hold relaxes.
    const tearPointer = tearing ? dragPointerRef.current : null;
    const tearCorner = tearPointer ? {
      x: resolvedCorner.endsWith("left") ? 0 : pageSizeRef.current.width,
      y: resolvedCorner.startsWith("top") ? 0 : pageSizeRef.current.height
    } : null;
    const duration = reducedMotion
      ? preset.motion.reducedDurationMs
      : turnOptions.reason === "tear"
        ? Math.max(turnOptions.durationMs ?? options.durationMs ?? preset.motion.durationMs, preset.motion.durationMs)
        : turnOptions.durationMs ?? options.durationMs ?? preset.motion.durationMs;

    if (reducedMotion || duration <= 0 || Math.abs(from - target) < 0.001) {
      const phase: NSEPagePhase = turnOptions.reason === "tear" ? "torn" : "idle";
      const nextSnapshot = turnOptions.reason === "tear"
        ? controller.tear({ ...turnOptions, progress: target })
        : controller.complete(target, turnOptions.reason ?? "programmatic");
      const reducedSnapshot = phase === "torn" ? nextSnapshot : { ...nextSnapshot, phase };
      activeTurnRef.current = null;
      const event = emit(turnOptions.reason ?? "programmatic", reducedSnapshot);
      callbacksRef.current.onTurnEnd?.(event);
      if (turnOptions.reason === "tear") callbacksRef.current.onTear?.(event);
      return;
    }

    // A leaf let go mid-drag carries on at the finger's pace and slows to rest,
    // taking less time the less it has left to travel. A tapped or commanded
    // turn gathers speed and eases in to land, as a page turned by hand does.
    const travelDuration = tearing
      ? duration * Math.max(0.35, Math.abs(target - from))
      : releasedPointer ? duration * (0.55 + 0.45 * Math.abs(target - from)) : duration;
    const ease = tearing
      ? target < from ? easeOutNSEPageProgress : tearPointer ? easeReleasedTearProgress : easeTearProgress
      : releasedPointer ? easeOutNSEPageProgress : easeInOutNSEPageProgress;
    const startedAt = getNow();
    const step = (now: number) => {
      if (activeTurnRef.current !== turnToken) return;
      const elapsed = now - startedAt;
      const t = clampNSEPageProgress(elapsed / travelDuration);
      const eased = ease(t);
      if (releasedPointer) {
        const left = (options.corner ?? preset.corner ?? "bottom-right").endsWith("left");
        const top = (options.corner ?? preset.corner ?? "bottom-right").startsWith("top");
        const endX = (left ? 0 : pageSizeRef.current.width) + (left ? 1 : -1) * 2 * pageSizeRef.current.width * target;
        const endY = top ? 0 : pageSizeRef.current.height;
        // A leaf carried over the spine lifts in an arc, as a page does in the hand.
        const arc = Math.sin(Math.PI * eased) * Math.abs(target - from) * pageSizeRef.current.height * 0.12;
        dragPointerRef.current = {
          x: releasedPointer.x + (endX - releasedPointer.x) * eased,
          y: releasedPointer.y + (endY - releasedPointer.y) * eased + (top ? arc : -arc)
        };
      }
      if (tearPointer && tearCorner && target < from) {
        const hold = 1 - eased;
        dragPointerRef.current = {
          x: tearCorner.x + (tearPointer.x - tearCorner.x) * hold,
          y: tearCorner.y + (tearPointer.y - tearCorner.y) * hold
        };
      }
      const frameSnapshot = controller.setProgress(from + (target - from) * eased, turnOptions.reason ?? "programmatic");
      emit(turnOptions.reason ?? "programmatic", frameSnapshot);

      if (t < 1) {
        frameRef.current = requestFrame(step);
        return;
      }

      // Leave the endpoint geometry committed for one frame before ending the
      // lifecycle. Consumers can swap destination content on onTurnEnd without
      // skipping the final painted pose.
      frameRef.current = requestFrame(() => {
        if (activeTurnRef.current !== turnToken) return;
        frameRef.current = null;
        activeTurnRef.current = null;
        dragPointerRef.current = null;
        const nextSnapshot = turnOptions.reason === "tear"
          ? controller.tear({ ...turnOptions, progress: target })
          : controller.complete(target, turnOptions.reason ?? "programmatic");
        const event = emit(turnOptions.reason ?? "programmatic", nextSnapshot);
        callbacksRef.current.onTurnEnd?.(event);
        if (turnOptions.reason === "tear") callbacksRef.current.onTear?.(event);
        if (preset.interaction.haptics) void feedback?.trigger(target === 1 ? "selection" : "soft");
      });
    };

    frameRef.current = requestFrame(step);
  }, [cancelActiveTurn, controller, emit, options.corner, options.direction, options.durationMs, options.edge, options.mode, preset.corner, preset.direction, preset.edge, preset.interaction.haptics, preset.mode, preset.motion.curlPath, preset.motion.durationMs, preset.motion.reducedDurationMs, reducedMotion, resolvedCorner]);

  // A turn waits for the page's rendering surface, so it runs in one renderer
  // from start to finish; anything that cancels the turn cancels the wait.
  const animateTo = useCallback((targetProgress: number, turnOptions: NSEPageTurnOptions = {}) => {
    const surface = reducedMotion ? null : callbacksRef.current.awaitSurface?.() ?? null;
    if (!surface) {
      pendingTurnRef.current = null;
      startTurn(targetProgress, turnOptions);
      return;
    }
    const token = { targetProgress };
    pendingTurnRef.current = token;
    void surface.then(() => {
      if (pendingTurnRef.current !== token) return;
      pendingTurnRef.current = null;
      startTurn(targetProgress, turnOptions);
    });
  }, [reducedMotion, startTurn]);

  const gestureOptions = useMemo(() => resolveGestureOptions(options.interactive, {
    edges: [options.edge ?? preset.edge],
    snapThreshold: preset.interaction.snapThreshold,
    openProgress: preset.interaction.openProgress,
    edgeActivationSize: preset.interaction.edgeActivationSize,
    preventScroll: preset.interaction.preventScroll,
    haptics: preset.interaction.haptics
  }), [options.edge, options.interactive, preset.edge, preset.interaction.edgeActivationSize, preset.interaction.haptics, preset.interaction.openProgress, preset.interaction.preventScroll, preset.interaction.snapThreshold]);

  const localPointFromEvent = useCallback((event: { clientX: number; clientY: number }, root: HTMLElement): NSEPagePoint => {
    // Map client coords into untransformed page-local px so dragging keeps
    // working while ancestors animate transforms.
    const rect = root.getBoundingClientRect();
    const width = root.offsetWidth || rect.width;
    const height = root.offsetHeight || rect.height;
    const scaleX = rect.width > 0 ? width / rect.width : 1;
    const scaleY = rect.height > 0 ? height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }, []);

  const onPointerDown = useCallback<NSEPagePointerHandler>((event) => {
    if (options.disabled || !gestureOptions.enabled || event.button !== 0) return;
    const root = rootElementRef.current;
    if (!root) return;

    // Interactive controls hosted on the page (toolbars, buttons near an
    // activation edge) keep their pointer; only the dog-ear hands its
    // pointer over so the fold can be dragged straight off it.
    const targetElement = event.target instanceof Element ? event.target : null;
    if (
      targetElement?.closest("button, a, input, select, textarea, [data-nse-page-no-drag]") &&
      !targetElement.closest(".nse-page__dogear")
    ) {
      return;
    }

    const bounds = root.getBoundingClientRect();
    const point = pointFromPointer(event);
    const tearing = resolvedMode === "tear";
    const allowedEdges = getAllowedEdges(gestureOptions.edges, options.edge ?? preset.edge);
    // A sheet is torn from its binding, held by the corner it tears from.
    const edge = tearing ? options.edge ?? preset.edge : getNSEPageNearestEdge(point, bounds, allowedEdges);
    if (tearing
      ? !isNSEPageTearGrab(localPointFromEvent(event, root), resolvedCorner, pageSizeRef.current, edge, gestureOptions.edgeActivationSize)
      : !isNSEPagePointNearEdge(point, bounds, edge, gestureOptions.edgeActivationSize)) return;

    if (gestureOptions.preventScroll) event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const restingProgress = controller.getSnapshot().progress;
    cancelActiveTurn();
    let progress = getNSEPageProgressFromPoint(edge, point, bounds);
    let origin: NSEPagePoint | null = null;
    if (tearing) {
      const local = localPointFromEvent(event, root);
      progress = getNSEPageTearDragProgress(local, resolvedCorner, pageSizeRef.current, edge, preset.motion);
      dragPointerRef.current = local;
    } else if (resolvedMode === "curl") {
      const local = localPointFromEvent(event, root);
      if (preset.motion.curlPath === "book") {
        // A book leaf stays where it lies until the finger moves: a tap turns
        // it smoothly from rest instead of first snapping its corner to the
        // finger.
        origin = local;
        progress = restingProgress;
        dragPointerRef.current = null;
      } else {
        progress = getNSEPageCurlDragProgress(local, resolvedCorner, pageSizeRef.current);
        dragPointerRef.current = local;
      }
    }
    dragMovedRef.current = false;
    draggingRef.current = {
      pointerId: event.pointerId,
      edge,
      startedAt: getNow(),
      startedProgress: progress,
      origin,
      peak: progress
    };
    const nextSnapshot = controller.startDrag({
      progress,
      edge,
      mode: resolvedMode,
      direction: options.direction ?? preset.direction
    });
    emit("gesture", nextSnapshot);
    if (gestureOptions.haptics) void feedback?.trigger("light");
  }, [cancelActiveTurn, controller, emit, gestureOptions, localPointFromEvent, options.direction, options.disabled, options.edge, preset.direction, preset.edge, preset.motion, resolvedCorner, resolvedMode]);

  // Applies the most recent pointer sample once per frame. Reads the rect a
  // single time here (not per pointer event), so the whole fold — front-face
  // clip and mirrored flap — is derived from one snapshot and written in one
  // style flush. That atomicity is what removes the Retina "gap flash" (front
  // and flap were previously updated on separate, desyncing paths), and the
  // coalescing removes the per-sample layout thrash.
  const flushMove = useCallback(() => {
    moveFrameRef.current = null;
    const pending = pendingMoveRef.current;
    const drag = draggingRef.current;
    const root = rootElementRef.current;
    if (!pending || !drag || !root || drag.pointerId !== pending.pointerId) return;
    let progress: number;
    if (resolvedMode === "tear") {
      // Paper once torn stays torn: the rip holds however the finger wavers.
      const local = localPointFromEvent(pending, root);
      dragPointerRef.current = local;
      progress = Math.max(drag.peak, getNSEPageTearDragProgress(local, resolvedCorner, pageSizeRef.current, drag.edge, preset.motion));
      drag.peak = progress;
    } else if (resolvedMode === "curl") {
      const local = localPointFromEvent(pending, root);
      if (drag.origin) {
        // A book leaf lifts once the finger has clearly moved, then follows it.
        if (!dragMovedRef.current && Math.hypot(local.x - drag.origin.x, local.y - drag.origin.y) < BOOK_DRAG_SLOP_PX) return;
        dragMovedRef.current = true;
        // Hold the leaf flat until it can lift in the renderer it will finish in.
        if (!reducedMotion && callbacksRef.current.awaitSurface?.()) return;
      }
      dragPointerRef.current = local;
      progress = preset.motion.curlPath === "book"
        ? clampNSEPageProgress((resolvedCorner.endsWith("left") ? local.x : pageSizeRef.current.width - local.x) / (2 * pageSizeRef.current.width))
        : getNSEPageCurlDragProgress(local, resolvedCorner, pageSizeRef.current);
    } else {
      progress = getNSEPageProgressFromPoint(drag.edge, pointFromPointer(pending), root.getBoundingClientRect());
    }
    if (!drag.origin && Math.abs(progress - drag.startedProgress) > 0.03) dragMovedRef.current = true;
    commitProgress(progress, "gesture");
    // Torn clean through, the sheet comes away in the hand and flies on.
    if (resolvedMode === "tear" && progress >= NSE_PAGE_TEAR_FREE_AT) {
      draggingRef.current = null;
      pendingMoveRef.current = null;
      animateTo(1, { edge: drag.edge, mode: "tear", reason: "tear" });
    }
  }, [animateTo, commitProgress, localPointFromEvent, preset.motion, reducedMotion, resolvedCorner, resolvedMode]);

  const onPointerMove = useCallback<NSEPagePointerHandler>((event) => {
    const drag = draggingRef.current;
    const root = rootElementRef.current;
    if (!drag || !root || drag.pointerId !== event.pointerId) return;

    // preventDefault must stay synchronous (a deferred call can't cancel the
    // native gesture); the expensive geometry work is deferred to a single rAF.
    if (gestureOptions.preventScroll) event.preventDefault();
    pendingMoveRef.current = { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
    if (moveFrameRef.current == null) moveFrameRef.current = requestFrame(flushMove);
  }, [flushMove, gestureOptions.preventScroll]);

  const finishDrag = useCallback<NSEPagePointerHandler>((event) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    // Apply any pending drag frame now so the snap decision uses the final
    // pointer position, not last frame's.
    if (moveFrameRef.current != null) {
      cancelFrame(moveFrameRef.current);
      flushMove();
    }
    pendingMoveRef.current = null;

    draggingRef.current = null;
    // A tapped book leaf turns along its own path; a dragged one leaves the
    // finger. A tear carries on along the finger's pull.
    if (resolvedMode !== "tear" && (preset.motion.curlPath !== "book" || !dragMovedRef.current)) dragPointerRef.current = null;
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // The browser may already have released capture during cancellation.
      }
    }

    const progress = controller.getSnapshot().progress;
    if (resolvedMode === "tear") {
      if (progress >= gestureOptions.snapThreshold) animateTo(1, { edge: drag.edge, mode: "tear", reason: "tear" });
      else animateTo(0, { edge: drag.edge, reason: "gesture" });
      return;
    }
    const shouldOpen = preset.motion.curlPath === "book" && !dragMovedRef.current
      ? true : progress >= gestureOptions.snapThreshold;
    // Pointer capture can retarget the synthetic click to the root. Settle
    // a book-corner tap here and suppress any subsequent dog-ear click.
    if (preset.motion.curlPath === "book") dragMovedRef.current = true;
    animateTo(shouldOpen ? gestureOptions.openProgress : restProgress, {
      edge: drag.edge,
      reason: "gesture"
    });
  }, [animateTo, controller, flushMove, gestureOptions.openProgress, gestureOptions.snapThreshold, preset.motion.curlPath, resolvedMode, restProgress]);

  const cancelDrag = useCallback<NSEPagePointerHandler>((event) => {
    if (!draggingRef.current || draggingRef.current.pointerId !== event.pointerId) return;
    if (moveFrameRef.current != null) {
      cancelFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
    pendingMoveRef.current = null;
    draggingRef.current = null;
    dragPointerRef.current = null;
    cancelToRest();
  }, [cancelToRest]);

  const handle = useMemo<NSEPageHandle>(() => ({
    getSnapshot: () => controller.getSnapshot(),
    setProgress: commitProgress,
    turnTo: animateTo,
    turnForward: (turnOptions) => animateTo(1, { ...turnOptions, direction: "forward" }),
    turnBackward: (turnOptions) => animateTo(0, { ...turnOptions, direction: "backward" }),
    open: (turnOptions) => animateTo(turnOptions?.targetProgress ?? preset.interaction.openProgress ?? 1, turnOptions),
    close: (turnOptions) => animateTo(turnOptions?.targetProgress ?? restProgress, turnOptions),
    tear: (turnOptions) => animateTo(1, { ...turnOptions, reason: "tear", mode: "tear" }),
    cancel: () => {
      cancelToRest();
    },
    reset: () => {
      cancelActiveTurn();
      dragPointerRef.current = null;
      tearSeedRef.current = newTearSeed();
      const nextSnapshot = controller.reset({
        progress: restProgress,
        mode: options.mode ?? preset.mode,
        edge: options.edge ?? preset.edge,
        direction: options.direction ?? preset.direction
      });
      emit("reset", nextSnapshot);
    }
  }), [animateTo, cancelActiveTurn, cancelToRest, commitProgress, controller, emit, options.direction, options.edge, options.mode, preset.direction, preset.edge, preset.interaction.openProgress, preset.mode, restProgress]);

  const dogEarHandlers = useMemo<NSEPageDogEarHandlers>(() => {
    const peekDelta = preset.motion.peekDelta ?? 0.045;
    const openTarget = gestureOptions.openProgress ?? preset.interaction.openProgress ?? 1;
    // Peek targets are absolute poses, so repeated enter/leave events can
    // never ratchet the page open.
    const peekTarget = Math.min(restProgress + peekDelta, openTarget * 0.5);
    return {
      onPointerEnter: () => {
        if (callbacksRef.current.disabled || draggingRef.current) return;
        // A peek never supersedes a turn, running or still waiting to start.
        if (controller.getSnapshot().phase === "turning" && controller.getSnapshot().targetProgress >= .5) return;
        if ((pendingTurnRef.current?.targetProgress ?? 0) >= .5) return;
        if (snapshotRef.current.progress >= openTarget * 0.4) return;
        // A peek is only a hint: it waits for no surface and never runs in a
        // stand-in renderer, so it never holds up or downgrades a real turn.
        if (!reducedMotion && callbacksRef.current.surfacePending?.()) return;
        animateTo(peekTarget, { durationMs: 220, reason: "gesture" });
      },
      onPointerLeave: () => {
        if (draggingRef.current) return;
        if (controller.getSnapshot().phase === "turning" && controller.getSnapshot().targetProgress >= .5) return;
        if ((pendingTurnRef.current?.targetProgress ?? 0) >= .5) return;
        if (snapshotRef.current.progress >= openTarget * 0.4) return;
        if (snapshotRef.current.progress <= restProgress) return;
        animateTo(restProgress, { durationMs: 240, reason: "gesture" });
      },
      onPointerDown: () => {
        // Deliberately empty: the root edge-drag gesture may claim this
        // pointer so the fold can be dragged straight off the dog-ear.
      },
      onClick: () => {
        if (callbacksRef.current.disabled) return;
        if (dragMovedRef.current) {
          // A real drag just ended on this pointer; the snap already decided.
          dragMovedRef.current = false;
          return;
        }
        const current = snapshotRef.current.progress;
        if (current >= openTarget * 0.5) {
          animateTo(restProgress, { reason: "programmatic" });
        } else {
          animateTo(openTarget, { reason: "programmatic" });
        }
      }
    };
  }, [animateTo, controller, gestureOptions.openProgress, preset.interaction.openProgress, preset.motion.peekDelta, reducedMotion, restProgress]);

  /*
   * Drag fast path. Pointer-move frames write the geometry CSS variables
   * (and the progress-derived data attributes) straight to the root element
   * instead of committing React state: dragging costs a style recalc, not a
   * re-render of the whole page subtree. React state still commits on every
   * phase change (drag start/end, snap, settle), so the tree reconciles to
   * the truth the moment the gesture ends. Controlled progress keeps the
   * React path — the consumer owns the pose there.
   */
  const reactPhaseRef = useRef<NSEPagePhase>(snapshot.phase);
  const isFastFrame = useCallback((phase: NSEPagePhase) =>
    phase === "dragging" ? draggingRef.current != null : phase === "turning" && activeTurnRef.current != null, []);
  const frameListenersRef = useRef(new Set<(geometry: NSEPageGeometry) => void>());
  const subscribeFrame = useCallback((listener: (geometry: NSEPageGeometry) => void) => {
    frameListenersRef.current.add(listener);
    return () => { frameListenersRef.current.delete(listener); };
  }, []);

  const applyDragFrame = useCallback((nextSnapshot: NSEPageControllerSnapshot) => {
    const root = rootElementRef.current;
    if (!root) return;
    const frameGeometry = resolveNSEPageGeometry({
      progress: nextSnapshot.progress,
      mode: nextSnapshot.mode,
      edge: nextSnapshot.edge,
      direction: nextSnapshot.direction,
      corner: callbacksRef.current.corner ?? preset.corner,
      phase: nextSnapshot.phase,
      motion: preset.motion,
      material: preset.material,
      torn: nextSnapshot.torn,
      size: pageSizeRef.current,
      pointer: dragPointerRef.current ?? undefined,
      reducedMotion,
      tearSeed: tearSeedRef.current
    });
    const style = getNSEPageGeometryStyle(frameGeometry, { motion: preset.motion, material: preset.material });
    for (const [property, value] of Object.entries(style)) {
      if (property.startsWith("--")) root.style.setProperty(property, String(value));
    }
    root.dataset.progress = frameGeometry.progress.toFixed(3);
    root.dataset.revealed = frameGeometry.insideInteractive ? "true" : "false";
    const peekDelta = preset.motion.peekDelta ?? 0.045;
    const isCurling = frameGeometry.mode === "tear"
      ? !frameGeometry.reduced && frameGeometry.progress > 0.001
      : frameGeometry.mode === "curl" && !frameGeometry.reduced &&
        frameGeometry.progress > restProgress + peekDelta + 0.03;
    root.dataset.curling = isCurling ? "true" : "false";
    for (const listener of frameListenersRef.current) listener(frameGeometry);
  }, [preset.corner, preset.material, preset.motion, reducedMotion, restProgress]);

  useEffect(() => controller.subscribe((nextSnapshot) => {
    snapshotRef.current = nextSnapshot;
    const isUncontrolled = callbacksRef.current.progress == null;
    // Drag frames and the frames of an animated turn skip React: each is
    // written straight to the page, so a turn never re-renders the page's
    // content mid-flight. React catches up whenever the phase changes.
    if (isUncontrolled && nextSnapshot.phase === reactPhaseRef.current && isFastFrame(nextSnapshot.phase)) {
      applyDragFrame(nextSnapshot);
      return;
    }
    reactPhaseRef.current = nextSnapshot.phase;
    setSnapshot(nextSnapshot);
  }), [applyDragFrame, controller, isFastFrame]);

  // If something else re-renders the page mid-drag, React writes style from
  // its last committed snapshot — re-sync the live drag pose over it.
  useLayoutEffect(() => {
    const live = snapshotRef.current;
    if (callbacksRef.current.progress == null && live.phase === reactPhaseRef.current && isFastFrame(live.phase)) {
      applyDragFrame(live);
    }
  });

  useEffect(() => {
    if (options.progress == null && options.open == null && options.torn == null) return;
    const nextProgress = options.progress ?? (
      options.open == null
        ? controller.getSnapshot().progress
        : options.open ? preset.interaction.openProgress ?? 1 : restProgress
    );
    controller.setProgress(nextProgress, "controlled");
    if (options.torn != null && options.torn !== controller.getSnapshot().torn) {
      if (options.torn) controller.tear({ progress: nextProgress });
      else controller.reset({ progress: nextProgress });
    }
  }, [controller, options.open, options.progress, options.torn, preset.interaction.openProgress, restProgress]);

  useEffect(() => clearAnimation, [clearAnimation]);

  useEffect(() => () => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (moveFrameRef.current != null) {
      cancelFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
  }, []);

  return {
    snapshot: effectiveSnapshot,
    geometry,
    preset,
    rootRef: setRootRef,
    interactive: gestureOptions.enabled && !options.disabled,
    getStyle: (style) => getNSEPageGeometryStyle(geometry, {
      motion: preset.motion,
      material: preset.material
    }, style),
    handle,
    dogEarHandlers,
    subscribeFrame,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: cancelDrag,
      onLostPointerCapture: cancelDrag
    }
  };
}
