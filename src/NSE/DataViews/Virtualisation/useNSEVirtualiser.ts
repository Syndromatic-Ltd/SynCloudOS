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

import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from "react";

import { computeNSEVirtualRangeFromIndex, NSEVirtualSizeIndex } from "./computeVirtualRange";
import type { NSEVirtualItem, NSEVirtualiser, NSEVirtualiserOptions } from "./virtualisationTypes";

export interface NSEVirtualiserHookOptions extends NSEVirtualiserOptions {
  readonly viewportRef?: RefObject<HTMLElement | null>;
  readonly viewportStart?: number;
  readonly viewportSize?: number;
  readonly viewportInsetEnd?: number;
}

export function useNSEVirtualiser(options: NSEVirtualiserHookOptions): NSEVirtualiser {
  const [attachedViewport, setAttachedViewport] = useState<HTMLElement | null>(null);
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [viewport, setViewport] = useState({ start: options.viewportStart ?? 0, size: options.viewportSize ?? 0 });
  const sizeIndex = useMemo(() => new NSEVirtualSizeIndex(options.count, options.estimateSize), [options.count, options.estimateSize, options.sizingGeneration]);
  const viewportNode = attachedViewport ?? viewportRefCurrent(options.viewportRef);

  useLayoutEffect(() => {
    const node = attachedViewport ?? viewportRefCurrent(options.viewportRef);
    if (!node) return;
    const readViewport = () => {
      const start = options.axis === "block" ? node.scrollTop : node.scrollLeft;
      const measured = options.axis === "block" ? node.clientHeight : node.clientWidth;
      const size = Math.max(0, (measured > 0 ? measured : options.viewportSize ?? 0) - (options.viewportInsetEnd ?? 0));
      setViewport((current) => current.start === start && current.size === size ? current : { start, size });
    };
    readViewport();
    node.addEventListener("scroll", readViewport, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(readViewport);
    observer?.observe(node);
    return () => { node.removeEventListener("scroll", readViewport); observer?.disconnect(); };
  }, [attachedViewport, options.axis, options.viewportInsetEnd, options.viewportRef, options.viewportSize]);

  const range = useMemo(() => computeNSEVirtualRangeFromIndex({
    viewportStart: viewportNode ? viewport.start : options.viewportStart ?? viewport.start,
    viewportSize: viewportNode ? viewport.size : options.viewportSize ?? viewport.size,
    overscan: options.overscan,
    retainedIndices: options.retainedIndices,
  }, sizeIndex), [measurementRevision, options.overscan, options.retainedIndices, options.viewportSize, options.viewportStart, sizeIndex, viewport.size, viewport.start, viewportNode]);

  const items = useMemo(() => {
    const result: NSEVirtualItem[] = [];
    for (const rendered of range.rendered) for (let itemIndex = rendered.start; itemIndex < rendered.start + rendered.length; itemIndex += 1) {
      const start = sizeIndex.startAt(itemIndex);
      const size = sizeIndex.sizeAt(itemIndex);
      result.push({ index: itemIndex, key: options.getKey(itemIndex), start, size, end: start + size });
    }
    return result;
  }, [options.getKey, range.rendered, sizeIndex]);

  const measure = useCallback((index: number, size: number) => {
    if (index < 0 || index >= options.count) return;
    if (sizeIndex.update(index, size)) setMeasurementRevision((revision) => revision + 1);
  }, [options.count, sizeIndex]);

  const scrollToIndex = useCallback((index: number, alignment: "start" | "centre" | "end" | "nearest" = "nearest") => {
    if (options.count === 0) return;
    const target = Math.min(Math.max(0, Math.floor(index)), options.count - 1);
    const start = sizeIndex.startAt(target);
    const size = sizeIndex.sizeAt(target);
    const node = attachedViewport ?? viewportRefCurrent(options.viewportRef);
    const measuredViewportSize = node ? (options.axis === "block" ? node.clientHeight : node.clientWidth) || options.viewportSize || viewport.size : options.viewportSize ?? viewport.size;
    const viewportSize = Math.max(0, measuredViewportSize - (options.viewportInsetEnd ?? 0));
    const current = node ? options.axis === "block" ? node.scrollTop : node.scrollLeft : options.viewportStart ?? viewport.start;
    let next = start;
    if (alignment === "centre") next = start - (viewportSize - size) / 2;
    if (alignment === "end") next = start - viewportSize + size;
    if (alignment === "nearest") next = start < current ? start : start + size > current + viewportSize ? start - viewportSize + size : current;
    next = Math.max(0, Math.min(next, Math.max(0, range.totalSize - viewportSize)));
    if (node) { if (options.axis === "block") node.scrollTop = next; else node.scrollLeft = next; }
    setViewport((state) => state.start === next ? state : { ...state, start: next });
  }, [attachedViewport, options.axis, options.count, options.viewportInsetEnd, options.viewportRef, options.viewportSize, options.viewportStart, range.totalSize, sizeIndex, viewport.size, viewport.start]);

  return useMemo(() => ({ snapshot: { axis: options.axis, range, items }, measure, scrollToIndex, attachViewport: setAttachedViewport }), [items, measure, options.axis, range, scrollToIndex]);
}

function viewportRefCurrent(ref: RefObject<HTMLElement | null> | undefined): HTMLElement | null {
  return ref?.current ?? null;
}
