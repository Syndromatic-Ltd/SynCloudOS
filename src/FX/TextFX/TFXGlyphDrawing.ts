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

import type { GFXPath } from "../GraphicsFX/GFXPath";
import type { GFXImage } from "../GraphicsFX/GFXImage";
import { normalisePoint, type GFXPoint, type GFXRect } from "../GraphicsFX/GFXGeometry";
import { TFXLine, type TFXPositionedGlyphRunKind } from "./TFXLine";
import type { TFXFont } from "./TFXFont";
import { glyphInlineOffset, glyphInlinePosition, isVerticalDirection } from "./TFXInlineGeometry";
import { TFXFrame } from "./TFXFrame";
import type { TFXRubyPosition } from "./TFXRubyAnnotation";
import type { GFXPDFPositionedTextRun } from "../GraphicsFX/pdf/GFXPDFFontSubset";

export interface TFXGlyphOutline {
  readonly glyphId: number;
  /** Distinguishes source text from caller-owned truncation-token glyphs. */
  readonly kind: Exclude<TFXPositionedGlyphRunKind, "tab" | "attachment"> | "ruby";
  /** Original UTF-16 source index, or the omitted-range boundary for every token glyph. */
  readonly stringIndex: number;
  readonly path: GFXPath;
  readonly embedding: TFXFont["embedding"];
  readonly rubyPosition?: TFXRubyPosition;
}

export interface TFXAttachmentDrawing {
  readonly kind: "attachment" | "truncation-token";
  readonly stringIndex: number;
  readonly image: GFXImage;
  readonly rect: GFXRect;
  readonly accessibilityLabel: string;
}

export type TFXLineDrawing = TFXGlyphOutline | TFXAttachmentDrawing;
export type TFXPDFTextRun = GFXPDFPositionedTextRun;
const isGlyphOutline = (drawing: TFXLineDrawing): drawing is TFXGlyphOutline => "path" in drawing;

interface TFXDrawingDestination {
  fill(path: GFXPath): void;
  drawImage?(image: GFXImage, rect: GFXRect): void;
}

const requireDrawingOperations: (
  destination: unknown,
  drawings: readonly TFXLineDrawing[],
) => asserts destination is TFXDrawingDestination = (destination, drawings) => {
  if (destination === null || typeof destination !== "object") {
    throw new TypeError("A drawing destination is required.");
  }
  if (drawings.some(isGlyphOutline) && typeof (destination as TFXDrawingDestination).fill !== "function") {
    throw new TypeError("Glyph drawing requires a fill destination.");
  }
  if (drawings.some(drawing => !isGlyphOutline(drawing)) && typeof (destination as TFXDrawingDestination).drawImage !== "function") {
    throw new TypeError("Attachment drawing requires a drawImage destination.");
  }
};

/** Projects existing shaped glyphs; never invokes a second text shaper. */
export class TFXGlyphDrawing {
  static drawingsForLine(line: TFXLine, origin: GFXPoint = { x: 0, y: 0 }, signal?: AbortSignal): readonly TFXLineDrawing[] {
    if (!(line instanceof TFXLine)) throw new TypeError("Glyph drawing requires a shaped TFXLine.");
    const point = normalisePoint(origin);
    const count = line.runs.reduce((sum, run) => sum + (run.delegate ? 1 : run.shaped.glyphs.length) + (run.ruby?.reduce((rubySum, ruby) => rubySum + ruby.shaped.glyphs.length, 0) ?? 0), 0);
    if (count > 10000) throw new RangeError("Glyph drawing exceeds its per-call work limit.");
    let commands = 0;
    const result: TFXLineDrawing[] = [];
    for (const run of line.runs) {
      signal?.throwIfAborted();
      if (run.delegate) {
        const { width, ascent, descent, attachment } = run.delegate;
        if (width > 0 && ascent + descent > 0) result.push(Object.freeze({
          kind: run.kind === "truncation-token" ? "truncation-token" : "attachment",
          stringIndex: run.start,
          image: attachment.image,
          rect: Object.freeze(line.orientation === "vertical"
            ? { x: point.x - ascent, y: point.y + run.x, width: ascent + descent, height: width }
            : { x: point.x + run.x, y: point.y - ascent, width, height: ascent + descent }),
          accessibilityLabel: attachment.accessibilityLabel,
        }));
        continue;
      }
      for (const glyph of run.shaped.glyphs) {
        signal?.throwIfAborted();
        const outline = run.font.createPathForGlyph(glyph.id);
        commands += outline.commands.length;
        if (commands > 100000) throw new RangeError("Glyph outline command budget exceeded.");
      const vertical = line.orientation === "vertical";
      const combined = vertical && run.verticalPresentation === "combined";
      const upright = vertical && isVerticalDirection(run.shaped.direction);
      const combinedScale = run.combinedScale ?? 1;
      const combinedWidth = run.shaped.advance.width * combinedScale;
      const combinedCell = run.inlineAdvanceOverride ?? run.font.descriptor.size;
      const combinedHeight = (run.font.ascent + run.font.descent) * combinedScale;
      const path = outline.transformed(combined
        ? { a: combinedScale, b: 0, c: 0, d: -combinedScale,
            tx: point.x - combinedWidth / 2 + (glyph.position.x + glyph.offset.x) * combinedScale,
            ty: point.y + run.x + (combinedCell - combinedHeight) / 2 + run.font.ascent * combinedScale - (glyph.position.y + glyph.offset.y) * combinedScale }
        : upright
          ? { a: 1, b: 0, c: 0, d: -1,
              tx: point.x + glyph.position.x + glyph.offset.x,
              ty: point.y + run.x + glyphInlinePosition(glyph, run.shaped.direction) + glyphInlineOffset(glyph, run.shaped.direction) }
          : vertical
            ? { a: 0, b: 1, c: 1, d: 0,
                tx: point.x + glyph.position.y + glyph.offset.y,
                ty: point.y + run.x + glyph.position.x + glyph.offset.x }
            : { a: 1, b: 0, c: 0, d: -1,
                tx: point.x + run.x + glyph.position.x + glyph.offset.x,
                ty: point.y - glyph.position.y - glyph.offset.y });
      const kind = run.kind === "truncation-token" ? "truncation-token" : "glyph";
      result.push(Object.freeze({
        glyphId: glyph.id,
        kind,
        stringIndex: kind === "truncation-token" ? run.start : run.start + glyph.cluster,
        path,
        embedding: run.font.embedding,
      }));
      }
      for (const ruby of run.ruby ?? []) {
        for (let index = 0; index < ruby.shaped.glyphs.length; index += 1) {
          signal?.throwIfAborted();
          const glyph = ruby.shaped.glyphs[index]!;
          const outline = ruby.font.createPathForGlyph(glyph.id);
          commands += outline.commands.length;
          if (commands > 100000) throw new RangeError("Glyph outline command budget exceeded.");
          const spacing = ruby.glyphInlineOffsets[index] ?? 0;
          const vertical = line.orientation === "vertical";
          const upright = vertical && isVerticalDirection(ruby.shaped.direction);
          const path = outline.transformed(upright
            ? { a: ruby.scale, b: 0, c: 0, d: -ruby.scale,
                tx: point.x + ruby.crossOffset + (glyph.position.x + glyph.offset.x) * ruby.scale,
                ty: point.y + run.x + ruby.inlineOffset + (glyphInlinePosition(glyph, ruby.shaped.direction) + glyphInlineOffset(glyph, ruby.shaped.direction)) * ruby.scale + spacing }
            : vertical
              ? { a: 0, b: ruby.scale, c: ruby.scale, d: 0,
                  tx: point.x + ruby.crossOffset + (glyph.position.y + glyph.offset.y) * ruby.scale,
                  ty: point.y + run.x + ruby.inlineOffset + (glyph.position.x + glyph.offset.x) * ruby.scale + spacing }
              : { a: ruby.scale, b: 0, c: 0, d: -ruby.scale,
                  tx: point.x + run.x + ruby.inlineOffset + (glyph.position.x + glyph.offset.x) * ruby.scale + spacing,
                  ty: point.y + ruby.crossOffset - (glyph.position.y + glyph.offset.y) * ruby.scale });
          result.push(Object.freeze({
            glyphId: glyph.id,
            kind: run.kind === "truncation-token" ? "truncation-token" : "ruby",
            stringIndex: run.start,
            path,
            embedding: ruby.font.embedding,
            rubyPosition: ruby.position,
          }));
        }
      }
    }
    return Object.freeze(result);
  }

  static pathsForLine(line: TFXLine, origin: GFXPoint = { x: 0, y: 0 }, signal?: AbortSignal): readonly TFXGlyphOutline[] {
    return Object.freeze(this.drawingsForLine(line, origin, signal).filter(isGlyphOutline));
  }

  /**
   * Builds opt-in PDF text runs from the already-shaped line. Runs are returned
   * in logical source order while their baseline/outlines retain visual layout.
   */
  static pdfTextRunsForLine(line: TFXLine, origin: GFXPoint = { x: 0, y: 0 }, signal?: AbortSignal): readonly TFXPDFTextRun[] {
    if (!(line instanceof TFXLine)) throw new TypeError("PDF text export requires a shaped TFXLine.");
    const point = normalisePoint(origin);
    const outlines = this.pathsForLine(line, point, signal);
    const result = line.runs
      .filter((run) => run.kind === "glyph" && !run.delegate && run.end > run.start)
      .slice()
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .map((run) => {
        signal?.throwIfAborted();
        const owned = outlines.filter((outline) => outline.kind !== "truncation-token" && outline.stringIndex >= run.start && outline.stringIndex < run.end);
        return Object.freeze({
          sourceStart: run.start,
          sourceEnd: run.end,
          text: run.shaped.text,
          direction: run.shaped.direction,
          baseline: Object.freeze({ x: point.x + run.x, y: point.y }),
          font: run.font.pdfFontSubset(),
          outlines: Object.freeze(owned),
        });
      });
    if (result.length > 4096) throw new RangeError("PDF text run limit exceeded.");
    return Object.freeze(result);
  }

  static attachmentsForLine(line: TFXLine, origin: GFXPoint = { x: 0, y: 0 }, signal?: AbortSignal): readonly TFXAttachmentDrawing[] {
    return Object.freeze(this.drawingsForLine(line, origin, signal).filter((drawing): drawing is TFXAttachmentDrawing => !isGlyphOutline(drawing)));
  }

  /** Uses the destination's current fill and transform; leaves its state untouched. */
  static drawLine(destination: TFXDrawingDestination, line: TFXLine, origin?: GFXPoint, signal?: AbortSignal): void {
    const drawings = this.drawingsForLine(line, origin, signal);
    requireDrawingOperations(destination, drawings);
    for (const entry of drawings) {
      signal?.throwIfAborted();
      if (isGlyphOutline(entry)) destination.fill(entry.path);
      else destination.drawImage!(entry.image, entry.rect);
    }
  }

  static drawingsForFrame(frame: TFXFrame, signal?: AbortSignal): readonly TFXLineDrawing[] {
    if (!(frame instanceof TFXFrame)) throw new TypeError("Glyph drawing requires a TFXFrame.");
    const result: TFXLineDrawing[] = [];
    for (const item of frame.lines) {
      signal?.throwIfAborted();
      result.push(...this.drawingsForLine(item.line, item.origin, signal));
      if (result.length > 10_000) throw new RangeError("Frame glyph drawing exceeds its per-call work limit.");
    }
    return Object.freeze(result);
  }

  static pathsForFrame(frame: TFXFrame, signal?: AbortSignal): readonly TFXGlyphOutline[] {
    return Object.freeze(this.drawingsForFrame(frame, signal).filter(isGlyphOutline));
  }

  static attachmentsForFrame(frame: TFXFrame, signal?: AbortSignal): readonly TFXAttachmentDrawing[] {
    return Object.freeze(this.drawingsForFrame(frame, signal).filter((drawing): drawing is TFXAttachmentDrawing => !isGlyphOutline(drawing)));
  }

  static drawFrame(destination: TFXDrawingDestination, frame: TFXFrame, signal?: AbortSignal): void {
    const drawings = this.drawingsForFrame(frame, signal);
    requireDrawingOperations(destination, drawings);
    for (const entry of drawings) {
      signal?.throwIfAborted();
      if (isGlyphOutline(entry)) destination.fill(entry.path);
      else destination.drawImage!(entry.image, entry.rect);
    }
  }
}
