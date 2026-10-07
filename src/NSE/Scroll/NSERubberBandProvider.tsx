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

import { useEffect, type ReactNode } from "react";
import { rubberBandOffset } from "./index";

export interface NSERubberBandProviderProps {
  children?: ReactNode;
  /** Turn the global effect on/off. Default true. */
  enabled?: boolean;
  /** Stiffness coefficient (~0.55; larger = looser). */
  coeff?: number;
  /** Milliseconds of wheel-idle before the bounce springs back. Default 90. */
  settleDelay?: number;
}

interface BounceState {
  element: HTMLElement;
  raw: number;
  offset: number;
  timer: number;
  frame: number;
  kids: HTMLElement[];
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
Gives every scrollable surface under it iOS-style rubber-band overscroll, with no per-component
wiring, for both wheel/trackpad and touch input. Capture-phase, non-passive listeners find the scroll
container under the pointer/finger and, when it is already at a boundary, take over and apply a
log10-damped translate that springs back on release.

Conservative and correct: it translates a scroll surface's in-flow children (never the container), so
the container's background/clip stay put and the revealed gap shows the surface's own background, never
the desktop behind it. This makes overscroll automagic for plain app shells that scroll their own root
with several children — no per-app wrapper or wiring. Pinned children (position absolute/fixed) are
decorative/background layers and stay put; only the scrolling content bounces. It skips containers a
component already manages with `useNSERubberBandScroll` (`data-nse-rubberband="managed"`), opt-outs
(`data-nse-rubberband="off"`), the document root, empty or pathologically large surfaces, and any
surface with a child carrying a transform it didn't apply (an in-flight animation it shouldn't fight).
Per-element state is kept for the element's lifetime so a rested surface re-engages on the next pull.
*/
export function NSERubberBandProvider({
  children,
  enabled = true,
  coeff = 0.55,
  settleDelay = 90
}: NSERubberBandProviderProps) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const states = new WeakMap<HTMLElement, BounceState>();
    // A WeakMap isn't iterable, so track live bounce states separately purely so
    // pending timers/frames and inline transforms can be cleaned on unmount.
    const active = new Set<BounceState>();
    // Backstop against translating an unvirtualized mega-list every frame (those should use
    // NSEVirtualList, which is `managed` and skipped here anyway). Generous — apps scroll a handful.
    const MAX_BOUNCE_CHILDREN = 120;

    // The in-flow element children of a scroll surface — the content that should bounce. Pinned
    // (absolute/fixed) children are decorative/background layers and stay put; a child carrying a
    // foreign transform means an animation we shouldn't fight, so the whole surface opts out (null).
    // Logical provider boundaries use display:contents, on which transforms have no visual effect;
    // flatten those wrappers until we reach the real painted children.
    const inFlowChildren = (element: HTMLElement): HTMLElement[] | null => {
      const kids: HTMLElement[] = [];
      const collect = (child: Element): boolean => {
        if (!(child instanceof HTMLElement)) return true;
        const style = getComputedStyle(child);
        if (style.position === "absolute" || style.position === "fixed") return true;
        if (style.transform !== "none") return false;
        if (style.display === "contents") {
          for (const nested of child.children) {
            if (!collect(nested)) return false;
          }
          return true;
        }
        kids.push(child);
        return kids.length <= MAX_BOUNCE_CHILDREN;
      };
      for (const child of element.children) {
        if (!collect(child)) return null;
      }
      return kids;
    };

    const findScrollable = (start: EventTarget | null): HTMLElement | null => {
      let element = start instanceof HTMLElement ? start : null;
      while (element && element !== document.body && element !== document.documentElement) {
        const mark = element.dataset.nseRubberband;
        if (mark === "off" || mark === "managed") return null;
        const style = getComputedStyle(element);
        const overflowY = style.overflowY;
        const scrollable = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
        if (scrollable && element.scrollHeight > element.clientHeight + 1) {
          // Engage any scroll surface with at least one (and not a pathological number of) element
          // children. Which children translate — and the guard against fighting an in-flight
          // transform — are resolved lazily in step(), only when a bounce actually begins.
          const count = element.childElementCount;
          if (count < 1 || count > MAX_BOUNCE_CHILDREN) return null;
          return element;
        }
        element = element.parentElement;
      }
      return null;
    };

    const stopBounceLoop = (state: BounceState) => {
      if (state.frame !== 0) {
        cancelAnimationFrame(state.frame);
        state.frame = 0;
      }
    };

    const paint = (state: BounceState, nextOffset: number) => {
      state.offset = Math.abs(nextOffset) <= SETTLE_EPSILON_PX ? 0 : nextOffset;
      state.element.style.setProperty("--nse-rubber-band-offset-y", `${state.offset}px`);
      for (const kid of state.kids) {
        kid.style.transition = "none";
        kid.style.transform = state.offset === 0 ? "" : `translateY(${state.offset}px)`;
      }
    };

    const clearBounce = (state: BounceState) => {
      state.raw = 0;
      state.offset = 0;
      stopBounceLoop(state);
      window.clearTimeout(state.timer);
      state.element.style.removeProperty("--nse-rubber-band-offset-y");
      for (const kid of state.kids) {
        kid.style.transition = "";
        kid.style.transform = "";
      }
      active.delete(state);
    };

    const settle = (state: BounceState) => {
      window.clearTimeout(state.timer);
      const startOffset = state.offset;
      state.raw = 0;
      stopBounceLoop(state);
      if (Math.abs(startOffset) <= SETTLE_EPSILON_PX) {
        clearBounce(state);
        return;
      }

      active.add(state);
      const start = getNow();
      const tick = () => {
        const elapsed = getNow() - start;
        const nextOffset = startOffset * (1 - springProgress(elapsed));
        if (elapsed >= SETTLE_DURATION_MS || Math.abs(nextOffset) <= SETTLE_EPSILON_PX) {
          state.frame = 0;
          clearBounce(state);
          return;
        }
        paint(state, nextOffset);
        state.frame = window.requestAnimationFrame(tick);
      };
      state.frame = window.requestAnimationFrame(tick);
    };

    // Rubber-band step for one element. `delta` is positive when scrolling toward the bottom.
    // Returns true when engaged. State is kept (never deleted) so re-engagement always works.
    const step = (element: HTMLElement, delta: number): boolean => {
      const size = element.clientHeight;
      const atTop = element.scrollTop <= 0;
      const atBottom = element.scrollTop >= element.scrollHeight - size - 1;
      let state = states.get(element);
      const wasSettling = Boolean(state && state.frame !== 0);
      if (state && wasSettling) {
        stopBounceLoop(state);
        state.raw = rubberBandRawFromOffset(state.offset, size, coeff);
      }
      const prevRaw = state ? state.raw : 0;

      let raw = prevRaw;
      if (raw > 0) raw = Math.max(0, raw - delta);
      else if (raw < 0) raw = Math.min(0, raw - delta);
      else if (delta < 0 && atTop) raw = -delta;
      else if (delta > 0 && atBottom) raw = -delta;
      else return false;

      // Beginning a fresh bounce from rest — (re)capture the in-flow children to translate. Bail if
      // any carries a foreign transform (inFlowChildren → null) so we never fight an in-flight slide.
      if (prevRaw === 0) {
        // Re-engaging while a JS settle is still running: reuse the kids we're
        // already animating. Re-detecting via inFlowChildren() would reject them
        // (they carry our own transform) and drop the input.
        if (!wasSettling || !state) {
          const kids = inFlowChildren(element);
          if (!kids || kids.length === 0) return false;
          if (state) state.kids = kids;
          else {
            state = { element, raw: 0, offset: 0, timer: 0, frame: 0, kids };
            states.set(element, state);
          }
        }
      }
      if (!state) return false;

      state.raw = raw;
      window.clearTimeout(state.timer);
      active.add(state);
      paint(state, rubberBandOffset(raw, size, coeff));
      return true;
    };

    const scheduleSettle = (element: HTMLElement) => {
      const state = states.get(element);
      if (!state) return;
      window.clearTimeout(state.timer);
      active.add(state);
      state.timer = window.setTimeout(() => settle(state), settleDelay);
    };

    const handleWheel = (event: WheelEvent) => {
      const element = findScrollable(event.target);
      if (!element) return;
      if (step(element, event.deltaY)) {
        event.preventDefault();
        scheduleSettle(element);
      }
    };

    // Touch: track the finger's element + last position and feed its drag through the same step.
    let touched: HTMLElement | null = null;
    let lastTouch = 0;
    const handleTouchStart = (event: TouchEvent) => {
      touched = event.touches.length === 1 ? findScrollable(event.target) : null;
      if (touched) lastTouch = event.touches[0].clientY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!touched || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const delta = lastTouch - y;
      lastTouch = y;
      if (step(touched, delta)) event.preventDefault();
    };
    const endTouch = () => {
      if (!touched) return;
      const state = states.get(touched);
      if (state) settle(state);
      touched = null;
    };

    const opts = { passive: false, capture: true } as AddEventListenerOptions;
    const passiveOpts = { passive: true, capture: true } as AddEventListenerOptions;
    document.addEventListener("wheel", handleWheel, opts);
    document.addEventListener("touchstart", handleTouchStart, passiveOpts);
    document.addEventListener("touchmove", handleTouchMove, opts);
    document.addEventListener("touchend", endTouch, passiveOpts);
    document.addEventListener("touchcancel", endTouch, passiveOpts);
    return () => {
      document.removeEventListener("wheel", handleWheel, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchstart", handleTouchStart, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchmove", handleTouchMove, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchend", endTouch, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchcancel", endTouch, { capture: true } as EventListenerOptions);
      for (const state of active) clearBounce(state);
      active.clear();
    };
  }, [enabled, coeff, settleDelay]);

  return children as ReactNode;
}
