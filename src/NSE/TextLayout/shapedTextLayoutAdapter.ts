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

import { rectContainsRect, type GFXRect } from "../../FX/GraphicsFX/GFXGeometry";
import { GFXPath } from "../../FX/GraphicsFX/GFXPath";
import { TFXFramesetter } from "../../FX/TextFX/TFXFramesetter";
import { isTFXStringBoundary, type TFXAttributedString } from "../../FX/TextFX/TFXAttributedString";
import { snapshotTFXTextContainers, type TFXTextContainer } from "../../FX/TextFX/TFXTextContainer";
import type { NSEShapedTextProjection } from "./shapedTextProjection";
import { createNSEShapedTextGeometryProvider, type NSEShapedTextGeometryFrame } from "./textGeometryProvider";
import { sameNSETextGeometryRevision, snapshotNSETextGeometryRevision, type NSETextGeometryProvider, type NSETextGeometryRevision } from "./textGeometryTypes";
import { NSEUnsupportedShapedTextError } from "./shapedTextWindows";
export interface NSEShapedTextLayoutRequest {
  readonly flowId: string; readonly revision: NSETextGeometryRevision;
  readonly projection: NSEShapedTextProjection; readonly containers: readonly TFXTextContainer[];
  readonly paths?: readonly (GFXPath | undefined)[];
  readonly fromCharacter?: number; readonly signal?: AbortSignal;
}
export interface NSEShapedTextContainerConsumption { readonly containerIndex: number; readonly range: Readonly<{ location: number; length: number }>; readonly outcome: "consumed" | "no-progress" | "empty" }
export interface NSEShapedTextLayoutResult {
  readonly frames: readonly NSEShapedTextGeometryFrame[];
  readonly provider: NSETextGeometryProvider & { dispose(): void };
  readonly consumedRange: Readonly<{ location: number; length: number }>;
  readonly overflowRange: Readonly<{ location: number; length: number }>;
  readonly containers: readonly NSEShapedTextContainerConsumption[];
  readonly complete: boolean;
}
export interface NSEShapedTextLayoutAdapterOptions {
  readonly isCurrent?: (revision: NSETextGeometryRevision) => boolean;
  readonly subscribeFontReadiness?: (listener: () => void) => () => void;
  readonly subscribeResourceReadiness?: (listener: () => void) => () => void;
  readonly yieldToHost?: (signal: AbortSignal) => Promise<void>;
  /** Rows processed before yielding; defaults to 2. */
  readonly maximumRowsPerSlice?: number;
  readonly signal?: AbortSignal;
}
export class NSEShapedTextLayoutAdapter {
  readonly #options: NSEShapedTextLayoutAdapterOptions;
  readonly #unsubscribers: readonly (() => void)[];
  #disposed = false;
  #generation = 0;
  #controller: AbortController | null = null;
  #projection: NSEShapedTextProjection | null = null;
  #lastRevision: NSETextGeometryRevision | null = null;
  #minimumFontGeneration = 0;
  #minimumResourceGeneration = 0;
  #setters = new Map<TFXAttributedString, TFXFramesetter>();
  #cached: { key: string; paths: readonly (GFXPath | undefined)[]; signal?: AbortSignal; result: NSEShapedTextLayoutResult } | null = null;
  constructor(options: NSEShapedTextLayoutAdapterOptions = {}) {
    if (options.maximumRowsPerSlice !== undefined && (!Number.isSafeInteger(options.maximumRowsPerSlice) || options.maximumRowsPerSlice < 1 || options.maximumRowsPerSlice > 256)) throw new RangeError("Shaped work slices must contain 1..256 rows.");
    this.#options = Object.freeze({ ...options });
    const invalidate = () => this.invalidate();
    this.#unsubscribers = [options.subscribeFontReadiness?.(() => {
      if (this.#lastRevision) this.#minimumFontGeneration = Math.max(this.#minimumFontGeneration, this.#lastRevision.fontGeneration + 1);
      this.#setters.clear(); invalidate();
    }), options.subscribeResourceReadiness?.(() => {
      if (this.#lastRevision) this.#minimumResourceGeneration = Math.max(this.#minimumResourceGeneration, this.#lastRevision.resourceGeneration + 1);
      this.#setters.clear(); invalidate();
    })].filter((value): value is () => void => !!value);
    options.signal?.addEventListener("abort", invalidate, { once: true });
    this.#unsubscribers = [...this.#unsubscribers, () => options.signal?.removeEventListener("abort", invalidate)];
  }
  async layout(request: NSEShapedTextLayoutRequest): Promise<NSEShapedTextLayoutResult> {
    if (this.#disposed) throw new DOMException("Shaped layout adapter disposed.", "AbortError");
    this.#options.signal?.throwIfAborted(); request.signal?.throwIfAborted();
    const revision = snapshotNSETextGeometryRevision(request.revision), projection = request.projection, from = request.fromCharacter ?? 0;
    if (revision.fontGeneration < this.#minimumFontGeneration || revision.resourceGeneration < this.#minimumResourceGeneration) throw new DOMException("Shaped font/resource generation is stale.", "AbortError");
    this.#lastRevision = revision;
    if (!request.flowId?.trim() || !isTFXStringBoundary(projection.text, from)) throw new RangeError("Invalid shaped flow or UTF-16 continuation.");
    const containers = [...request.containers], paths = [...(request.paths ?? [])];
    const values = snapshotTFXTextContainers(containers);
    if (paths.length > containers.length || paths.some(path => path !== undefined && !(path instanceof GFXPath))) throw new TypeError("Paths must correspond to supplied containers.");
    if (containers.some(container => container.truncation !== "none")) throw new NSEUnsupportedShapedTextError("container-truncation");
    if (containers.some(container => container.exclusionRects.length > 64)) throw new NSEUnsupportedShapedTextError("more-than-64-exclusions");
    const key = JSON.stringify([request.flowId, revision, from, values]);
    if (this.#projection === projection && this.#cached?.key === key && this.#cached.signal === request.signal && paths.length === this.#cached.paths.length && paths.every((path, index) => path === this.#cached!.paths[index]) && this.#cached.result.provider.snapshot().current) return this.#cached.result;
    this.invalidate();
    const generation = this.#generation, controller = new AbortController(); this.#controller = controller;
    const signal = AbortSignal.any([controller.signal, ...(request.signal ? [request.signal] : []), ...(this.#options.signal ? [this.#options.signal] : [])]);
    const current = () => !this.#disposed && generation === this.#generation && !signal.aborted && (this.#options.isCurrent?.(revision) ?? true);
    const check = () => { signal.throwIfAborted(); if (!current()) throw new DOMException("Shaped geometry generations changed.", "AbortError"); };
    if (this.#projection !== projection) { this.#projection = projection; this.#setters = new Map(); }
    const setters = this.#setters;
    const frames: NSEShapedTextGeometryFrame[] = [], consumption: NSEShapedTextContainerConsumption[] = [];
    let cursor = from;
    let needsEmptyParagraph = !!projection.emptyParagraph;
    try {
      check();
      const ordered = containers.map((container, index) => ({ container, index })).sort((a, b) => a.container.flowOrder - b.container.flowOrder || a.index - b.index);
      for (const { container, index } of ordered) {
        check(); const start = cursor, bounds = innerBounds(container), path = paths[index];
        if (path && !rectContainsRect(bounds, path.bounds)) throw new RangeError("Supplied shaped path exceeds container insets.");
        let blockOffset = 0, rows = 0;
        while ((cursor < projection.text.length || needsEmptyParagraph) && bounds.width > 0 && bounds.height > 0 && rows < container.maximumLines) {
          check();
          const window = cursor === projection.text.length ? projection.windows.at(-1) : projection.windows.find(window => cursor >= window.start && cursor < window.end);
          if (!window) throw new RangeError("Shaped window maps do not cover the requested UTF-16 offset.");
          let setter = setters.get(window.input);
          if (!setter) { setter = new TFXFramesetter(window.input, projection.direction); setters.set(window.input, setter); }
          const sliceRows = Math.min(container.maximumLines - rows, this.#options.maximumRowsPerSlice ?? 2);
          const frame = setter.createFrame({ ...(path ? { path } : { bounds }), ...(needsEmptyParagraph && window.end === projection.text.length ? { emptyParagraph: projection.emptyParagraph } : {}), exclusions: container.exclusionRects, start: cursor - window.start, blockOffset, maximumLines: sliceRows, progression: container.writingMode === "horizontal-tb" ? "topToBottom" : container.writingMode === "vertical-rl" ? "rightToLeft" : "leftToRight", signal });
          const emptyLaidOut = frame.lines.some(item => item.line.start === item.line.end && item.line.end + window.start === projection.text.length);
          if (emptyLaidOut) needsEmptyParagraph = false;
          if (frame.visibleRange.end <= frame.visibleRange.start && !emptyLaidOut) break;
          frames.push(Object.freeze({ frame, textOffset: window.start, containerId: `container:${index}`, space: Object.freeze({ name: `container:${index}`, units: projection.units }) }));
          const rowOrigins = new Set(frame.lines.map(item => item.line.orientation === "vertical" ? item.origin.x : item.origin.y)); rows += rowOrigins.size;
          cursor = window.start + frame.visibleRange.end;
          const last = frame.lines[frame.lines.length - 1]!;
          const style = window.input.runs.find(run => last.line.start >= run.start && last.line.start < run.end)?.paragraphStyle;
          const paragraphEnd = /[\r\n\u2029]/u.test(window.input.text[frame.visibleRange.end - 1] ?? "");
          const spacing = last.line.leading + (style?.lineSpacing ?? 0) + (paragraphEnd ? style?.paragraphSpacing ?? 0 : 0);
          blockOffset = container.writingMode === "horizontal-tb" ? last.origin.y + last.line.descent + spacing - bounds.y : container.writingMode === "vertical-rl" ? bounds.x + bounds.width - (last.origin.x - last.line.ascent - spacing) : last.origin.x + last.line.descent + spacing - bounds.x;
          await (this.#options.yieldToHost ?? yieldToHost)(signal); check();
          if (cursor < window.end && rowOrigins.size < sliceRows) break;
        }
        consumption.push(Object.freeze({ containerIndex: index, range: Object.freeze({ location: start, length: cursor - start }), outcome: cursor > start ? "consumed" : cursor === projection.text.length && !needsEmptyParagraph ? "empty" : "no-progress" }));
      }
      check();
      const complete = cursor === projection.text.length && !needsEmptyParagraph;
      const provider = createNSEShapedTextGeometryProvider({ flowId: request.flowId, revision, textLength: projection.text.length, complete: complete && from === 0, frames, isCurrent: current, signal });
      const result = Object.freeze({ frames: Object.freeze(frames), provider, complete, consumedRange: Object.freeze({ location: from, length: cursor - from }), overflowRange: Object.freeze({ location: cursor, length: projection.text.length - cursor }), containers: Object.freeze(consumption) });
      this.#cached = { key, paths, signal: request.signal, result };
      return result;
    } finally { if (this.#controller === controller) this.#controller = null; }
  }
  invalidate(): void {
    this.#generation++;
    this.#controller?.abort(new DOMException("Shaped layout superseded or readiness changed.", "AbortError"));
    this.#controller = null;
    this.#cached?.result.provider.dispose(); this.#cached = null;
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.invalidate();
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#setters.clear(); this.#projection = null;
  }
  diagnostics(): Readonly<{ activeOperationCount: number; retainedWindowCount: number; retainedResultCount: number; disposed: boolean }> {
    return Object.freeze({ activeOperationCount: this.#controller ? 1 : 0, retainedWindowCount: this.#setters.size, retainedResultCount: this.#cached ? 1 : 0, disposed: this.#disposed });
  }
}

function innerBounds(container: TFXTextContainer): GFXRect {
  const { insets: i, size: s, writingMode: mode } = container;
  return mode === "horizontal-tb" ? { x: i.inlineStart, y: i.blockStart, width: s.width - i.inlineStart - i.inlineEnd, height: s.height - i.blockStart - i.blockEnd }
    : { x: mode === "vertical-rl" ? i.blockEnd : i.blockStart, y: i.inlineStart, width: s.width - i.blockStart - i.blockEnd, height: s.height - i.inlineStart - i.inlineEnd };
}
function yieldToHost(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 0);
    signal.addEventListener("abort", abort, { once: true });
  });
}
