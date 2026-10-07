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

import { useEffect, useRef, type RefObject } from "react";
import { NSEScrollViewController } from "./scrollTypes";
import "./scroll.css";

/**
iOS-style rubber-band damping. As a surface is pulled `distance` px past a boundary on an axis of
length `dimension`, the resisted (visible) offset grows logarithmically — following the log10 easing
used by Produkt's RubberBandEffect — so the further you pull, the stiffer it feels. `coeff` (~0.55)
tunes the stiffness; bigger = looser. Sign-preserving and side-effect free.
*/
export function rubberBandOffset(distance: number, dimension: number, coeff = 0.55): number {
  if (distance === 0 || dimension <= 0) return 0;
  const magnitude = Math.abs(distance);
  return Math.sign(distance) * dimension * coeff * Math.log10(1 + magnitude / dimension);
}

export interface NSERubberBandOptions {
  /** Allow pulling either boundary when content fits the viewport. Default false. */
  alwaysBounce?: boolean;
  /** Observe the resisted visual offset, including spring-back and cleanup. */
  onOffsetChange?: (offset: { x: number; y: number }) => void;
  /** Turn the effect on/off. Default true. */
  enabled?: boolean;
  /** Stiffness coefficient (~0.55; larger = looser pull). */
  coeff?: number;
  /** Scroll axis. Default "y". */
  axis?: "y" | "x" | "both";
  /** Milliseconds of wheel-idle before the bounce springs back. Default 90. */
  settleDelay?: number;
}
const SETTLE_DURATION_MS = 500;
const SETTLE_EPSILON_PX = 0.25;
const SETTLE_DECAY = 7;

function getNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function springProgress(elapsedMs: number) {
  const t = Math.min(1, Math.max(0, elapsedMs / SETTLE_DURATION_MS));
  return (1 - Math.exp(-SETTLE_DECAY * t)) / (1 - Math.exp(-SETTLE_DECAY));
}

function rubberBandRawFromOffset(offset: number, dimension: number, coeff: number) {
  if (offset === 0 || dimension <= 0 || coeff <= 0) return 0;
  const magnitude = dimension * (Math.pow(10, Math.abs(offset) / (dimension * coeff)) - 1);
  return Math.sign(offset) * magnitude;
}

/**
Adds iOS-style rubber-band overscroll to any native scroll surface. `scrollRef` is the element that
actually scrolls (it receives the wheel listener and supplies the scroll bounds); `targetRef` is the
element translated to show the bounce — usually an inner content wrapper, or the scroll element itself
when a clipping ancestor hides the overflow (as with menus/sidebars).

React's synthetic `onWheel` is passive, so a native non-passive listener is required to take over the
scroll at a boundary. The pull past the edge is accumulated and log10-damped; after a short idle the
transform springs back to zero. The transform is applied imperatively to avoid a re-render per tick.
*/
export function useNSERubberBandScroll(
  scrollRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  options: NSERubberBandOptions = {}
): void {
  const ownerRef = useRef<object | null>(null);
  const offsetCallback = useRef(options.onOffsetChange);
  offsetCallback.current = options.onOffsetChange;
  if (ownerRef.current === null) ownerRef.current = Object.freeze({});
  const {
    enabled = true,
    alwaysBounce = false,
    coeff = 0.55,
    axis = "y",
    settleDelay = 90
  } = options;

  useEffect(() => {
    const node = scrollRef.current;
    const target = targetRef.current;
    if (!node || !target || !enabled) return;

    const horizontalOnly = axis === "x";
    const verticalOnly = axis === "y";
    let rawX = 0;
    let rawY = 0;
    let offsetX = 0;
    let offsetY = 0;
    let settleTimer = 0;
    let settleFrame = 0;
    let ownsGesture = false;
    // Mark the scroll element so the global NSERubberBandProvider doesn't also handle it.
    const previousMark = node.dataset.nseRubberband;
    node.dataset.nseRubberband = "managed";

    const paint = (nextX: number, nextY: number) => {
      offsetX = Math.abs(nextX) <= SETTLE_EPSILON_PX ? 0 : nextX;
      offsetY = Math.abs(nextY) <= SETTLE_EPSILON_PX ? 0 : nextY;
      target.style.transition = "none";
      target.style.transform = offsetX === 0 && offsetY === 0
        ? ""
        : horizontalOnly ? `translateX(${offsetX}px)` : verticalOnly ? `translateY(${offsetY}px)` : `translate(${offsetX}px, ${offsetY}px)`;
      offsetCallback.current?.({ x: offsetX, y: offsetY });
    };
    const stopSettleLoop = () => {
      if (settleFrame !== 0) {
        cancelAnimationFrame(settleFrame);
        settleFrame = 0;
      }
    };
    const claimGesture = () => {
      if (ownsGesture) return true;
      ownsGesture = NSEScrollViewController.claim(node, ownerRef.current);
      return ownsGesture;
    };
    const releaseGesture = () => {
      if (!ownsGesture) return;
      ownsGesture = false;
      NSEScrollViewController.release(node, ownerRef.current);
    };
    const isNearestOwner = (targetNode: EventTarget | null) => targetNode instanceof Element && targetNode.closest('[data-nse-rubberband="managed"]') === node;
    const settle = () => {
      window.clearTimeout(settleTimer);
      const startX = offsetX;
      const startY = offsetY;
      rawX = 0;
      rawY = 0;
      stopSettleLoop();
      releaseGesture();
      if (Math.abs(startX) <= SETTLE_EPSILON_PX && Math.abs(startY) <= SETTLE_EPSILON_PX) {
        paint(0, 0);
        return;
      }

      const start = getNow();
      const tick = () => {
        const elapsed = getNow() - start;
        const progress = 1 - springProgress(elapsed);
        const nextX = startX * progress;
        const nextY = startY * progress;
        if (elapsed >= SETTLE_DURATION_MS || (Math.abs(nextX) <= SETTLE_EPSILON_PX && Math.abs(nextY) <= SETTLE_EPSILON_PX)) {
          settleFrame = 0;
          paint(0, 0);
          return;
        }
        paint(nextX, nextY);
        settleFrame = requestAnimationFrame(tick);
      };
      settleFrame = requestAnimationFrame(tick);
    };

    // Shared rubber-band step for wheel and touch. `delta` is positive when scrolling toward the end
    // (wheel deltaY, or an upward finger drag). Returns true when the bounce engaged.
    const applyDelta = (direction: "x" | "y", delta: number): boolean => {
      if ((direction === "x" && verticalOnly) || (direction === "y" && horizontalOnly) || delta === 0) return false;
      const horizontal = direction === "x";
      const size = horizontal ? node.clientWidth : node.clientHeight;
      const scrollSize = horizontal ? node.scrollWidth : node.scrollHeight;
      if (scrollSize <= size + 1 && !alwaysBounce) return false;
      let raw = horizontal ? rawX : rawY;
      const offset = horizontal ? offsetX : offsetY;
      if (settleFrame !== 0) {
        stopSettleLoop();
        raw = rubberBandRawFromOffset(offset, size, coeff);
      }
      const position = horizontal ? node.scrollLeft : node.scrollTop;
      const atStart = position <= 0;
      const atEnd = position >= scrollSize - size - 1;

      if (raw > 0) raw = Math.max(0, raw - delta); // already bounced at the start — ease toward 0
      else if (raw < 0) raw = Math.min(0, raw - delta); // already bounced at the end
      else if (delta < 0 && atStart) raw = -delta; // begin a start bounce
      else if (delta > 0 && atEnd) raw = -delta; // begin an end bounce
      else return false;

      if (horizontal) rawX = raw;
      else rawY = raw;
      const nextOffset = rubberBandOffset(raw, size, coeff);
      paint(horizontal ? nextOffset : offsetX, horizontal ? offsetY : nextOffset);
      return true;
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || !isNearestOwner(event.target) || !claimGesture()) return;
      const handledX = applyDelta("x", horizontalOnly ? (event.deltaX || event.deltaY) : event.deltaX);
      const handledY = applyDelta("y", event.deltaY);
      if (!handledX && !handledY) { releaseGesture(); return; }
      event.preventDefault();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, settleDelay);
    };

    // Touch: a single finger's drag is fed through the same rubber-band step (touchscreens; trackpads
    // and mice already emit wheel events).
    let touching = false;
    let lastTouchX = 0;
    let lastTouchY = 0;
    const handleTouchStart = (event: TouchEvent) => {
      touching = event.touches.length === 1 && isNearestOwner(event.target) && claimGesture();
      if (touching) { lastTouchX = event.touches[0].clientX; lastTouchY = event.touches[0].clientY; }
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!touching || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const handledX = applyDelta("x", lastTouchX - touch.clientX);
      const handledY = applyDelta("y", lastTouchY - touch.clientY);
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      if (handledX || handledY) event.preventDefault();
    };
    const endTouch = () => {
      if (!touching) { releaseGesture(); return; }
      touching = false;
      settle();
    };
    const handlePointerDown = (event: PointerEvent) => { if (isNearestOwner(event.target)) claimGesture(); };
    const handlePointerEnd = () => releaseGesture();

    node.addEventListener("wheel", handleWheel, { passive: false });
    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", endTouch, { passive: true });
    node.addEventListener("touchcancel", endTouch, { passive: true });
    node.addEventListener("pointerdown", handlePointerDown, { passive: true });
    node.addEventListener("pointerup", handlePointerEnd, { passive: true });
    node.addEventListener("pointercancel", handlePointerEnd, { passive: true });
    node.addEventListener("lostpointercapture", handlePointerEnd, { passive: true });
    return () => {
      node.removeEventListener("wheel", handleWheel);
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", endTouch);
      node.removeEventListener("touchcancel", endTouch);
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("pointerup", handlePointerEnd);
      node.removeEventListener("pointercancel", handlePointerEnd);
      node.removeEventListener("lostpointercapture", handlePointerEnd);
      window.clearTimeout(settleTimer);
      stopSettleLoop();
      releaseGesture();
      target.style.transition = "";
      target.style.transform = "";
      offsetCallback.current?.({ x: 0, y: 0 });
      if (previousMark === undefined) delete node.dataset.nseRubberband;
      else node.dataset.nseRubberband = previousMark;
    };
  }, [scrollRef, targetRef, enabled, alwaysBounce, coeff, axis, settleDelay]);
}

export { NSEScrollView, type NSEScrollViewProps } from "./NSEScrollView";
export { NSERubberBandProvider, type NSERubberBandProviderProps } from "./NSERubberBandProvider";
export { NSEClipView, type NSEClipViewProps } from "./NSEClipView";
export * from "./scrollTypes";
export * from "./NSEScroller";
