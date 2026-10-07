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

import { TFXParagraphStyle } from "./TFXParagraphStyle";
import { normaliseRect, type GFXRect } from "../GraphicsFX/GFXGeometry";
import { GFXPath } from "../GraphicsFX/GFXPath";
import type { GFXFillRule } from "../GraphicsFX/graphicsTypes";
import { TFXAttributedString, isTFXStringBoundary } from "./TFXAttributedString";
import { TFXFrame, type TFXFrameLine, type TFXFrameProgression } from "./TFXFrame";
import { TFXTypesetter } from "./TFXTypesetter";
import { TFXPathFrameGeometry, type TFXFrameInterval } from "./TFXPathFrameGeometry";
import { TFXFont } from "./TFXFont";
import { TFXLine } from "./TFXLine";
const paragraphBreak = /[\r\n\u2029]/u;
const hardBreak = /[\r\n\u000b\u000c\u0085\u2028\u2029]/u;

interface TFXFrameCommonOptions {
  /** Optional metrics for a semantic final paragraph with no UTF-16 characters. */
  readonly emptyParagraph?: Readonly<{ font: TFXFont; paragraphStyle?: TFXParagraphStyle }>;
  /** Starts a continuation at this block distance inside the same supplied path/rectangle. */
  readonly blockOffset?: number;
  /** Counts occupied rows/columns; split exclusion fragments share one row. */
  readonly maximumLines?: number;
  readonly start?: number;
  readonly lineSpacing?: number;
  readonly exclusions?: readonly GFXRect[];
  readonly signal?: AbortSignal;
  readonly progression?: TFXFrameProgression;
}
export type TFXFrameOptions = TFXFrameCommonOptions & (
  | { readonly bounds: GFXRect; readonly path?: never; readonly pathFillRule?: never }
  | { readonly path: GFXPath; readonly pathFillRule?: GFXFillRule; readonly bounds?: never }
);

export class TFXFramesetter {
  readonly #input: TFXAttributedString;
  readonly #typesetter: TFXTypesetter;
  readonly #verticalTypesetter: TFXTypesetter;
  readonly #direction: "ltr" | "rtl";
  constructor(input: TFXAttributedString, direction: "ltr" | "rtl" = "ltr") {
    this.#direction = direction;
    this.#input = input;
    this.#typesetter = new TFXTypesetter(input, direction);
    this.#verticalTypesetter = new TFXTypesetter(input, direction, "vertical");
  }
  createFrame(options: TFXFrameOptions): TFXFrame {
    options.signal?.throwIfAborted();
    const hasBounds = options.bounds !== undefined, hasPath = options.path !== undefined;
    if (hasBounds === hasPath) throw new TypeError("A text frame requires exactly one bounds rectangle or path.");
    if (hasBounds && options.pathFillRule !== undefined) throw new TypeError("A text frame fill rule requires a path.");
    const pathFillRule = options.pathFillRule ?? "nonzero";
    if (pathFillRule !== "nonzero" && pathFillRule !== "evenodd") throw new TypeError("Unsupported text frame path fill rule.");
    if (hasPath && !(options.path instanceof GFXPath)) throw new TypeError("Text frame path must be a GFXPath.");
    const path = hasPath ? options.path : GFXPath.rect(options.bounds);
    const bounds = normaliseRect(path.bounds);
    if (!(bounds.width > 0 && bounds.height > 0)) throw new RangeError("A text frame path must have non-empty area.");
    const pathGeometry = hasPath ? new TFXPathFrameGeometry(path, pathFillRule, options.signal) : undefined;
    const progression = options.progression ?? "topToBottom";
    if (!["topToBottom", "rightToLeft", "leftToRight"].includes(progression)) throw new TypeError("Invalid text frame progression.");
    const start = options.start ?? 0;
    if (!isTFXStringBoundary(this.#input.text, start)) throw new RangeError("Invalid frame start.");
    const spacing = options.lineSpacing ?? 0;
    if (!Number.isFinite(spacing) || spacing < 0) throw new RangeError("Line spacing must be finite and non-negative.");
    const blockOffset = options.blockOffset ?? 0, maximumLines = options.maximumLines ?? 10000;
    if (!Number.isFinite(blockOffset) || blockOffset < 0 || blockOffset > 1048576) throw new RangeError("Frame block offset must be finite and bounded.");
    if (!Number.isSafeInteger(maximumLines) || maximumLines < 1 || maximumLines > 10000) throw new RangeError("Frame maximumLines must be within 1..10000.");
    if ((options.exclusions?.length ?? 0) > 64) throw new RangeError("A text frame permits at most 64 exclusions.");
    const exclusions = (options.exclusions ?? []).map(normaliseRect);
    if (options.emptyParagraph && (!(options.emptyParagraph.font instanceof TFXFont) || (options.emptyParagraph.paragraphStyle !== undefined && !(options.emptyParagraph.paragraphStyle instanceof TFXParagraphStyle)))) throw new TypeError("Empty paragraph requires resolved font and paragraph metrics.");
    if (progression !== "topToBottom") return this.#withEmptyParagraph(this.#createVerticalFrame(options, bounds, path, pathFillRule, pathGeometry, exclusions, start, spacing, progression), options);
    const lines: TFXFrameLine[] = [];
    let cursor = start;
    let rows = 0;
    let occupiedRows = 0;
    let spacedParagraph = -1;
    const defaultStyle = new TFXParagraphStyle();
    for (let y = bounds.y + blockOffset; y < bounds.y + bounds.height && cursor < this.#input.text.length && occupiedRows < maximumLines;) {
      options.signal?.throwIfAborted();
      if (++rows > 4096) throw new RangeError("Text frame exceeds its row work limit.");
      const firstLine = cursor === 0 || paragraphBreak.test(this.#input.text[cursor - 1]);
      const paragraphStart = cursor === 0 ? 0 : Math.max(this.#input.text.lastIndexOf("\n", cursor - 1), this.#input.text.lastIndexOf("\r", cursor - 1), this.#input.text.lastIndexOf("\u2029", cursor - 1)) + 1;
      const style = this.#input.runs.find(run => run.start <= paragraphStart && run.end > paragraphStart)?.paragraphStyle ?? defaultStyle;
      if (firstLine && spacedParagraph !== paragraphStart) {
        y += style.paragraphSpacingBefore;
        spacedParagraph = paragraphStart;
      }
      const indent = firstLine ? style.firstLineHeadIndent : style.headIndent;
      const rowStart = cursor;
      let height = 1, ascent = 0, descent = 0;
      let pending: TFXFrameLine[] = [];
      // Growing the row band can introduce more exclusions; it never removes one.
      // Reflow until all exclusions intersecting the actual resolved glyph metrics apply.
      for (let pass = 0; pass <= exclusions.length + 1; pass++) {
        const indentStart = bounds.x + (this.#direction === "rtl" ? style.tailIndent : indent);
        const indentEnd = bounds.x + bounds.width - (this.#direction === "rtl" ? indent : style.tailIndent);
        let intervals: readonly TFXFrameInterval[] = pathGeometry ? pathGeometry.intervalsForBand(y, y + height, options.signal) : [{ start: bounds.x, end: bounds.x + bounds.width }];
        intervals = intervals.flatMap(interval => {
          const start = Math.max(interval.start, indentStart), end = Math.min(interval.end, indentEnd);
          return end > start ? [{ start, end }] : [];
        });
        for (const exclusion of exclusions) {
          if (exclusion.y >= y + height || exclusion.y + exclusion.height <= y) continue;
          intervals = intervals.flatMap(interval => {
            const left = Math.max(interval.start, exclusion.x);
            const right = Math.min(interval.end, exclusion.x + exclusion.width);
            if (left >= right) return [interval];
            return [
              ...(interval.start < left ? [{ start: interval.start, end: left }] : []),
              ...(right < interval.end ? [{ start: right, end: interval.end }] : []),
            ];
          });
        }
        if (this.#direction === "rtl") intervals = intervals.slice().reverse();
        pending = []; cursor = rowStart; ascent = 0; descent = 0;
        let leading = 0;
        for (const interval of intervals) {
          options.signal?.throwIfAborted();
          if (interval.end <= interval.start) continue;
          const count = this.#typesetter.suggestLineBreak(cursor, interval.end - interval.start, options.signal);
          if (!count) break;
          let line = this.#typesetter.createLine(cursor, count, options.signal);
          if (line.width - line.trailingWhitespaceWidth > interval.end - interval.start + 1e-9) continue;
          const emptyFont = !line.runs.length ? this.#input.runs.find(run => run.start <= cursor && run.end > cursor)?.font : undefined;
          if (emptyFont) line = emptyMetricLine(emptyFont, line.start, line.end, this.#direction, "horizontal");
          ascent = Math.max(ascent, line.ascent, emptyFont?.ascent ?? 0);
          descent = Math.max(descent, line.descent, emptyFont?.descent ?? 0);
          leading = Math.max(leading, line.leading, emptyFont?.leading ?? 0);
          const endsParagraph = paragraphBreak.test(this.#input.text[cursor + count - 1]) || cursor + count === this.#input.text.length;
          if (style.alignment === "justified" && !endsParagraph) line = line.createJustifiedLine(1, interval.end - interval.start) ?? line;
          const alignment = style.alignment === "natural" || style.alignment === "justified" ? (this.#direction === "rtl" ? "right" : "left") : style.alignment;
          const free = Math.max(0, interval.end - interval.start - (line.width - line.trailingWhitespaceWidth));
          const x = interval.start + (alignment === "right" ? free : alignment === "center" ? free / 2 : 0) - (this.#direction === "rtl" ? line.trailingWhitespaceWidth : 0);
          pending.push({ origin: { x, y: 0 }, line });
          cursor += count;
          if (endsParagraph || hardBreak.test(this.#input.text[cursor - 1])) break;
        }
        const measured = Math.max(1, ascent + descent + leading + spacing);
        if (measured <= height) break;
        const hasNewExclusion = exclusions.some(exclusion => exclusion.y >= y + height && exclusion.y < y + measured && exclusion.y + exclusion.height > y);
        height = measured;
        // A path can narrow anywhere across the newly grown typographic band,
        // so unlike rectangles it must always be fitted once at full height.
        if (pathGeometry) continue;
        if (!hasNewExclusion) break;
      }
      if (!pending.length) {
        cursor = rowStart;
        const ends = exclusions.filter(exclusion => exclusion.y < y + height && exclusion.y + exclusion.height > y).map(exclusion => exclusion.y + exclusion.height);
        if (!ends.length) {
          if (!pathGeometry) break;
          y += Math.max(1, height);
          continue;
        }
        y = Math.min(...ends);
        continue;
      }
      if (y + ascent + descent > bounds.y + bounds.height) { cursor = rowStart; break; }
      lines.push(...pending.map(fragment => ({ ...fragment, origin: { x: fragment.origin.x, y: y + ascent } })));
      occupiedRows++;
      y += height + style.lineSpacing;
      if (cursor > rowStart && paragraphBreak.test(this.#input.text[cursor - 1])) y += style.paragraphSpacing;
    }
    return this.#withEmptyParagraph(new TFXFrame(bounds, lines, start, cursor, path, pathFillRule, progression), options);
  }

  #withEmptyParagraph(frame: TFXFrame, options: TFXFrameOptions): TFXFrame {
    const empty = options.emptyParagraph;
    if (!empty || frame.visibleRange.end !== this.#input.text.length || (this.#input.text.length && !paragraphBreak.test(this.#input.text.at(-1)!))) return frame;
    const vertical = frame.progression !== "topToBottom";
    const occupied = new Set(frame.lines.map(item => vertical ? item.origin.x : item.origin.y)).size;
    if (occupied >= (options.maximumLines ?? 10000)) return frame;
    const last = frame.lines.at(-1);
    const previousStyle = last ? this.#input.runs.find(run => last.line.start >= run.start && last.line.start < run.end)?.paragraphStyle : undefined;
    const spacing = (last?.line.leading ?? 0) + (options.lineSpacing ?? 0) + (previousStyle?.lineSpacing ?? 0) + (previousStyle?.paragraphSpacing ?? 0);
    const blockOffset = last ? vertical
      ? frame.progression === "rightToLeft" ? frame.bounds.x + frame.bounds.width - (last.origin.x - last.line.ascent - spacing) : last.origin.x + last.line.descent + spacing - frame.bounds.x
      : last.origin.y + last.line.descent + spacing - frame.bounds.y
      : options.blockOffset ?? 0;
    // Reuse the existing band/path/exclusion fitting, with an explicitly mapped zero-character line.
    const { emptyParagraph: _empty, ...base } = options;
    const placeholder = new TFXFramesetter(new TFXAttributedString("\n", [{ start: 0, end: 1, font: empty.font, paragraphStyle: empty.paragraphStyle }]), this.#direction).createFrame({ ...base, start: 0, blockOffset, maximumLines: 1 });
    if (!placeholder.lines.length) return frame;
    const item = placeholder.lines[0]!;
    const end = this.#input.text.length;
    const line = emptyMetricLine(empty.font, end, end, this.#direction, vertical ? "vertical" : "horizontal");
    return new TFXFrame(frame.bounds, [...frame.lines, { origin: item.origin, line }], frame.visibleRange.start, frame.visibleRange.end, frame.path, frame.pathFillRule, frame.progression);
  }

  #createVerticalFrame(
    options: TFXFrameOptions,
    bounds: GFXRect,
    path: GFXPath,
    pathFillRule: GFXFillRule,
    pathGeometry: TFXPathFrameGeometry | undefined,
    exclusions: readonly GFXRect[],
    start: number,
    spacing: number,
    progression: Exclude<TFXFrameProgression, "topToBottom">,
  ): TFXFrame {
    const lines: TFXFrameLine[] = [];
    const crossDirection = progression === "rightToLeft" ? -1 : 1;
    let edge = progression === "rightToLeft" ? bounds.x + bounds.width - (options.blockOffset ?? 0) : bounds.x + (options.blockOffset ?? 0);
    let cursor = start, columns = 0, spacedParagraph = -1;
    let occupiedColumns = 0;
    const defaultStyle = new TFXParagraphStyle();
    const insideCrossBounds = () => crossDirection < 0 ? edge > bounds.x : edge < bounds.x + bounds.width;
    while (insideCrossBounds() && cursor < this.#input.text.length && occupiedColumns < (options.maximumLines ?? 10000)) {
      options.signal?.throwIfAborted();
      if (++columns > 4096) throw new RangeError("Text frame exceeds its column work limit.");
      const firstLine = cursor === 0 || paragraphBreak.test(this.#input.text[cursor - 1]);
      const paragraphStart = cursor === 0 ? 0 : Math.max(this.#input.text.lastIndexOf("\n", cursor - 1), this.#input.text.lastIndexOf("\r", cursor - 1), this.#input.text.lastIndexOf("\u2029", cursor - 1)) + 1;
      const style = this.#input.runs.find(run => run.start <= paragraphStart && run.end > paragraphStart)?.paragraphStyle ?? defaultStyle;
      if (firstLine && spacedParagraph !== paragraphStart) { edge += crossDirection * style.paragraphSpacingBefore; spacedParagraph = paragraphStart; }
      const indent = firstLine ? style.firstLineHeadIndent : style.headIndent;
      const rowStart = cursor;
      let thickness = 1, ascent = 0, descent = 0;
      let pending: TFXFrameLine[] = [];
      for (let pass = 0; pass <= exclusions.length + 1; pass++) {
        const left = crossDirection < 0 ? edge - thickness : edge;
        const right = crossDirection < 0 ? edge : edge + thickness;
        const indentStart = bounds.y + (this.#direction === "rtl" ? style.tailIndent : indent);
        const indentEnd = bounds.y + bounds.height - (this.#direction === "rtl" ? indent : style.tailIndent);
        let intervals: readonly TFXFrameInterval[] = pathGeometry ? pathGeometry.intervalsForColumnBand(left, right, options.signal) : [{ start: bounds.y, end: bounds.y + bounds.height }];
        intervals = intervals.flatMap(interval => {
          const intervalStart = Math.max(interval.start, indentStart), intervalEnd = Math.min(interval.end, indentEnd);
          return intervalEnd > intervalStart ? [{ start: intervalStart, end: intervalEnd }] : [];
        });
        for (const exclusion of exclusions) {
          if (exclusion.x >= right || exclusion.x + exclusion.width <= left) continue;
          intervals = intervals.flatMap(interval => {
            const top = Math.max(interval.start, exclusion.y), bottom = Math.min(interval.end, exclusion.y + exclusion.height);
            if (top >= bottom) return [interval];
            return [...(interval.start < top ? [{ start: interval.start, end: top }] : []), ...(bottom < interval.end ? [{ start: bottom, end: interval.end }] : [])];
          });
        }
        if (this.#direction === "rtl") intervals = intervals.slice().reverse();
        pending = []; cursor = rowStart; ascent = 0; descent = 0;
        let leading = 0;
        for (const interval of intervals) {
          options.signal?.throwIfAborted();
          if (interval.end <= interval.start) continue;
          const count = this.#verticalTypesetter.suggestLineBreak(cursor, interval.end - interval.start, options.signal);
          if (!count) break;
          let line = this.#verticalTypesetter.createLine(cursor, count, options.signal);
          if (line.width - line.trailingWhitespaceWidth > interval.end - interval.start + 1e-9) continue;
          const emptyFont = !line.runs.length ? this.#input.runs.find(run => run.start <= cursor && run.end > cursor)?.font : undefined;
          if (emptyFont) line = emptyMetricLine(emptyFont, line.start, line.end, this.#direction, "vertical");
          ascent = Math.max(ascent, line.ascent, emptyFont?.verticalAscent ?? 0);
          descent = Math.max(descent, line.descent, emptyFont?.verticalDescent ?? 0);
          leading = Math.max(leading, line.leading, emptyFont?.verticalLeading ?? 0);
          const endsParagraph = paragraphBreak.test(this.#input.text[cursor + count - 1]) || cursor + count === this.#input.text.length;
          if (style.alignment === "justified" && !endsParagraph) line = line.createJustifiedLine(1, interval.end - interval.start) ?? line;
          const alignment = style.alignment === "natural" || style.alignment === "justified" ? (this.#direction === "rtl" ? "right" : "left") : style.alignment;
          const free = Math.max(0, interval.end - interval.start - (line.width - line.trailingWhitespaceWidth));
          const y = interval.start + (alignment === "right" ? free : alignment === "center" ? free / 2 : 0) - (this.#direction === "rtl" ? line.trailingWhitespaceWidth : 0);
          pending.push({ origin: { x: 0, y }, line }); cursor += count;
          if (endsParagraph || hardBreak.test(this.#input.text[cursor - 1])) break;
        }
        const measured = Math.max(1, ascent + descent + leading + spacing);
        if (measured <= thickness) break;
        thickness = measured;
      }
      if (!pending.length) { cursor = rowStart; edge += crossDirection * Math.max(1, thickness); continue; }
      const baseline = crossDirection < 0 ? edge - descent : edge + ascent;
      if (baseline - ascent < bounds.x || baseline + descent > bounds.x + bounds.width) { cursor = rowStart; break; }
      lines.push(...pending.map(fragment => ({ ...fragment, origin: { x: baseline, y: fragment.origin.y } })));
      occupiedColumns++;
      edge += crossDirection * (thickness + style.lineSpacing);
      if (cursor > rowStart && paragraphBreak.test(this.#input.text[cursor - 1])) edge += crossDirection * style.paragraphSpacing;
    }
    return new TFXFrame(bounds, lines, start, cursor, path, pathFillRule, progression);
  }
}

function emptyMetricLine(font: TFXFont, start: number, end: number, direction: "ltr" | "rtl", orientation: "horizontal" | "vertical"): TFXLine {
  return new TFXLine(start, end, [{ kind: "glyph", start, end, x: 0, font, shaped: font.shape("", { direction: orientation === "vertical" ? (direction === "rtl" ? "btt" : "ttb") : direction }) }], 0, direction, null, orientation);
}
