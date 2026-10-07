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

import { memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { ChronosphereDisposable } from "./chronosphereEnvironment";
import { useChronosphereEnvironment } from "./chronosphereEnvironment";
import type { ChronosphereVersion } from "./chronosphereTypes";
import "./chronosphere-timeline.css";

interface ChronosphereTimelineProps {
  /** Already ordered newest first, using the same indices as the stage. */
  entries: readonly ChronosphereVersion[];
  activeIndex: number;
  onSelect(index: number): void;
  reducedMotion: boolean;
  visible: boolean;
  label: string;
}

const HIT_HEIGHT = 24;
const LENS_RADIUS = 96;
const LENS_EXPANSION = 0.8;
// Room for the lens's maximum displacement plus half an expanded hit target.
const EDGE = 60;
const OVERSCAN = LENS_RADIUS + EDGE;
type Lens = { center: number; amount: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Integral of a cosine bell: an odd, monotone displacement around the pointer.
 * Its derivative expands spacing by 1 + expansion * bell, so ticks never cross.
 * Applying it to the actual buttons keeps painted marks and hit targets together. */
function lensOffset(distance: number) {
  const x = clamp(distance, -LENS_RADIUS, LENS_RADIUS);
  return LENS_EXPANSION * (x / 2 + LENS_RADIUS * Math.sin(Math.PI * x / LENS_RADIUS) / (2 * Math.PI));
}

/** Internal edge ruler. The stage owns selection and entrance AnimationFX;
 * this component owns pointer sampling, scrolling, focus and the dock lens. */
export const ChronosphereTimeline = memo(function ChronosphereTimeline({
  entries, activeIndex, onSelect, reducedMotion, visible, label,
}: ChronosphereTimelineProps) {
  const { scheduler, signal } = useChronosphereEnvironment();
  const viewportRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const pendingFocus = useRef<number | null>(null);
  const pointerY = useRef<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });
  const [lens, setLens] = useState<Lens>({ center: 0, amount: 0 });
  const currentLens = useRef(lens);
  const targetLens = useRef(lens);
  const frame = useRef<ChronosphereDisposable | null>(null);
  const lastTime = useRef<number | null>(null);
  const count = entries.length;
  const selected = clamp(Number.isFinite(activeIndex) ? Math.trunc(activeIndex) : 0, 0, Math.max(0, count - 1));
  const height = viewport.height;
  // Large viewports also have a bounded number of live rows (at most ~100).
  const pitch = Math.max(HIT_HEIGHT, (height - 2 * EDGE) / Math.max(1, Math.min(80, count - 1)));
  const trackHeight = count ? Math.max(height, 2 * EDGE + (count - 1) * pitch) : height;
  const firstCenter = (trackHeight - Math.max(0, count - 1) * pitch) / 2;
  const position = useCallback((index: number) => firstCenter + (count - 1 - index) * pitch, [firstCenter, count, pitch]);

  const cancelFrame = useCallback(() => {
    frame.current?.dispose(); frame.current = null; lastTime.current = null;
  }, []);

  const sample = useCallback(function sample(time: number) {
    frame.current = null;
    if (signal.aborted) return;
    const previous = currentLens.current, target = targetLens.current;
    const dt = lastTime.current === null ? 16 : clamp(time - lastTime.current, 0, 64);
    lastTime.current = time;
    const ease = 1 - Math.exp(-dt / 55);
    const settled = Math.abs(previous.center - target.center) < 0.1 && Math.abs(previous.amount - target.amount) < 0.002;
    const next = settled ? target : {
      center: previous.center + (target.center - previous.center) * ease,
      amount: previous.amount + (target.amount - previous.amount) * ease,
    };
    currentLens.current = next; setLens(next);
    if (!settled) frame.current = scheduler.requestAnimationFrame(sample);
    else lastTime.current = null;
  }, [scheduler, signal]);

  const aim = useCallback((center: number | null) => {
    if (reducedMotion || !visible || signal.aborted) return;
    if (center !== null && currentLens.current.amount === 0) currentLens.current = { center, amount: 0 };
    targetLens.current = { center: center ?? currentLens.current.center, amount: center === null ? 0 : 1 };
    frame.current ??= scheduler.requestAnimationFrame(sample);
  }, [reducedMotion, visible, signal, scheduler, sample]);

  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => {
      const measured = node.getBoundingClientRect().height;
      setViewport(previous => previous.height === measured && previous.scrollTop === node.scrollTop
        ? previous : { height: measured, scrollTop: node.scrollTop });
    };
    measure();
    const Observer = node.ownerDocument.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  useLayoutEffect(() => {
    signal.addEventListener("abort", cancelFrame, { once: true });
    return () => { signal.removeEventListener("abort", cancelFrame); cancelFrame(); };
  }, [signal, scheduler, cancelFrame]);

  useLayoutEffect(() => {
    cancelFrame(); pointerY.current = null;
    const reset = { center: 0, amount: 0 };
    currentLens.current = reset; targetLens.current = reset; setLens(reset);
  }, [visible, reducedMotion, count, pitch, cancelFrame]);

  const reveal = useCallback((index: number) => {
    const node = viewportRef.current;
    if (!node || height <= 0) return;
    const center = position(index), margin = Math.min(EDGE, height / 3);
    const top = node.scrollTop;
    const next = clamp(center < top + margin ? center - margin : center > top + height - margin
      ? center - height + margin : top, 0, Math.max(0, trackHeight - height));
    node.scrollTop = next;
    setViewport(previous => previous.scrollTop === next ? previous : { ...previous, scrollTop: next });
  }, [height, position, trackHeight]);

  // Follow external selection/resize, but do not undo the user's independent scrolling.
  useLayoutEffect(() => {
    if (visible && count) reveal(selected);
  }, [selected, entries[selected]?.id, visible, count, reveal]);

  useLayoutEffect(() => {
    if (pendingFocus.current === null || !visible) return;
    const node = buttons.current.get(pendingFocus.current);
    if (node) { pendingFocus.current = null; node.focus({ preventScroll: true }); }
  });

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const page = Math.max(1, Math.floor(height / pitch) - 1);
    let next: number;
    switch (event.key) {
      case "ArrowUp": case "ArrowLeft": next = index + 1; break;
      case "ArrowDown": case "ArrowRight": next = index - 1; break;
      case "PageUp": next = index + page; break;
      case "PageDown": next = index - page; break;
      case "Home": next = 0; break;
      case "End": next = count - 1; break;
      default: return; // Enter/Space retain native activation; Escape reaches the stage.
    }
    event.preventDefault(); event.stopPropagation();
    next = clamp(next, 0, count - 1);
    pendingFocus.current = next; setFocusedIndex(next); reveal(next); onSelect(next);
  };

  const start = clamp(Math.floor((viewport.scrollTop - OVERSCAN - firstCenter) / pitch), 0, count - 1);
  const end = clamp(Math.ceil((viewport.scrollTop + height + OVERSCAN - firstCenter) / pitch), 0, count - 1);
  const mounted = new Set<number>();
  for (let row = start; row <= end && count; row++) mounted.add(count - 1 - row);
  // Keep the tab stop and focused button alive even when scrolled out of view.
  if (count) mounted.add(selected);
  if (focusedIndex !== null && focusedIndex < count) mounted.add(focusedIndex);
  const ordered = [...mounted].sort((a, b) => b - a);
  const tabStop = focusedIndex !== null && focusedIndex < count ? focusedIndex : selected;

  return <div className="chronosphere-rail chronosphere-timeline" role="group" aria-label={label}
    aria-hidden={!visible || undefined} inert={!visible || !count} data-reduced-motion={reducedMotion}
    style={{ opacity: visible ? 1 : 0 }}>
    <div className="chronosphere-timeline-viewport" ref={viewportRef}
      onWheel={event => event.stopPropagation()}
      onScroll={event => {
        const node = event.currentTarget;
        setViewport(previous => ({ ...previous, scrollTop: node.scrollTop }));
        if (pointerY.current !== null) aim(node.scrollTop + pointerY.current);
      }}
      onPointerMove={event => {
        if (event.pointerType === "touch" || reducedMotion || !visible) return;
        const node = event.currentTarget;
        pointerY.current = event.clientY - node.getBoundingClientRect().top;
        aim(node.scrollTop + pointerY.current);
      }}
      onPointerLeave={() => {
        pointerY.current = null;
        const focused = focusedIndex === null ? null : buttons.current.get(focusedIndex);
        aim(focused?.matches(":focus-visible") ? position(focusedIndex!) : null);
      }}
      onPointerCancel={() => { pointerY.current = null; aim(null); }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusedIndex(null);
          if (pointerY.current === null) aim(null);
        }
      }}>
      <ol className="chronosphere-timeline-track" role="list" style={{ height: `${trackHeight}px` }}>
        {ordered.map(index => {
          const entry = entries[index], base = position(index), distance = base - lens.center;
          const magnify = reducedMotion ? 0 : lens.amount * (Math.abs(distance) < LENS_RADIUS
            ? (1 + Math.cos(Math.PI * distance / LENS_RADIUS)) / 2 : 0);
          const top = base + (reducedMotion ? 0 : lens.amount * lensOffset(distance));
          const active = index === selected;
          return <li key={entry.id} className="chronosphere-timeline-tick" aria-posinset={count - index} aria-setsize={count}
            data-active={active} data-labelled={count <= 20 || index % 4 === 0 || index === count - 1 || active || magnify > 0.08}
            style={{ top: `${top}px`, "--timeline-magnify": magnify } as CSSProperties}>
            <button type="button" className="chronosphere-timeline-hit" data-entry-index={index}
              ref={node => { if (node) buttons.current.set(index, node); else buttons.current.delete(index); }}
              style={{ height: `${HIT_HEIGHT + magnify * 12}px` }} tabIndex={visible ? tabStop === index ? 0 : -1 : -1}
              aria-current={active ? "true" : undefined} aria-label={`${entry.dateLabel} — ${entry.displayLabel ?? entry.title}`}
              title={`${entry.dateLabel} — ${entry.displayLabel ?? entry.title}`} onClick={() => onSelect(index)}
              onKeyDown={event => onKeyDown(event, index)}
              onFocus={event => {
                setFocusedIndex(index);
                // Pointer focus must not scroll the pressed target away before click.
                if (pointerY.current === null) {
                  reveal(index);
                  if (event.currentTarget.matches(":focus-visible")) aim(position(index));
                }
              }}>
              <span className="chronosphere-timeline-label">{entry.dateLabel}</span>
              <span className="chronosphere-timeline-mark" aria-hidden="true" />
            </button>
          </li>;
        })}
      </ol>
    </div>
  </div>;
});
