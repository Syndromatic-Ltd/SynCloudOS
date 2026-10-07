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

import type { TFXFont, TFXFontShapeOptions } from "./TFXFont";
import type { TFXGlyphInfo, TFXGlyphRun } from "./TFXGlyphRun";
import { glyphInlineAdvance, glyphInlineOffset, glyphInlinePosition, inlineAdvance, isVerticalDirection, logicalDirection, positionedInlineAdvance, type TFXLineOrientation } from "./TFXInlineGeometry";
import { TFXRunDelegate } from "./TFXRunDelegate";
import type { TFXRubyPosition } from "./TFXRubyAnnotation";
import type { TFXVerticalPresentation } from "./TFXVerticalOrientation";

export type TFXPositionedGlyphRunKind = "glyph" | "tab" | "attachment" | "truncation-token";
export type TFXLineTruncationType = "head" | "middle" | "tail";
export interface TFXLineStringRange { readonly location: number; readonly length: number; }
export interface TFXLineCaretOffsets { readonly primary: number; readonly secondary: number; }
export interface TFXLineCaretOffset { readonly offset: number; readonly stringIndex: number; readonly leadingEdge: boolean; }
export type TFXLineCaretVisitor = (caret: TFXLineCaretOffset) => boolean | void;
export interface TFXLineTextPosition {
  readonly utf16Offset: number;
  readonly graphemeBoundary: boolean;
  /** Visual-run glyph indices, deliberately distinct from source UTF-16 offsets. */
  readonly glyphIndices: readonly number[];
}

export interface TFXPositionedGlyphRun {
  readonly kind: TFXPositionedGlyphRunKind;
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly font: TFXFont;
  readonly shaped: TFXGlyphRun;
  readonly verticalPresentation?: TFXVerticalPresentation;
  readonly inlineAdvanceOverride?: number;
  readonly combinedScale?: number;
  readonly delegate?: TFXRunDelegate;
  /** Internal shaping context retained so truncation can reshape a newly exposed boundary. */
  readonly shapingOptions?: Readonly<TFXFontShapeOptions>;
  readonly ruby?: readonly TFXPositionedRubyRun[];
}

export interface TFXPositionedRubyRun {
  readonly position: TFXRubyPosition;
  readonly text: string;
  readonly font: TFXFont;
  readonly shaped: TFXGlyphRun;
  readonly scale: number;
  /** Inline displacement of the base inside its ruby layout cell. */
  readonly baseInlineOffset: number;
  /** Inline advance of the base/ruby cell; permitted overhang is excluded. */
  readonly cellWidth: number;
  readonly inlineOffset: number;
  readonly crossOffset: number;
  readonly crossMin: number;
  readonly crossMax: number;
  readonly width: number;
  readonly glyphInlineOffsets: readonly number[];
}

interface ClusterUnit {
  readonly source: TFXPositionedGlyphRun;
  readonly start: number;
  readonly end: number;
  readonly width: number;
  readonly text: string;
  readonly glyphs: readonly TFXGlyphInfo[];
}

interface RetainedRun {
  readonly run: Omit<TFXPositionedGlyphRun, "x">;
  readonly baseInlineOffset: number;
  readonly cellWidth: number;
}

interface CaretEdge extends TFXLineCaretOffset {
  readonly direction: "ltr" | "rtl";
  readonly enumerable: boolean;
  readonly clusterEnd?: number;
}

interface CaretMap {
  readonly visual: readonly CaretEdge[];
  readonly logical: ReadonlyMap<number, readonly CaretEdge[]>;
  readonly logicalIndices: readonly number[];
  readonly logicalSpans: readonly CaretEdge[];
  readonly tokenIndex: number | null;
  readonly tokenOffset: number | null;
}

const caretGraphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function clusterUnits(runs: readonly TFXPositionedGlyphRun[], signal?: AbortSignal): readonly ClusterUnit[] {
  const units: ClusterUnit[] = [];
  let work = 0;
  for (const run of runs) {
    signal?.throwIfAborted();
    if (run.kind === "tab") {
      units.push({ source: run, start: run.start, end: run.end, width: inlineAdvance(run.shaped), text: "\t", glyphs: [] });
      continue;
    }
    if (run.kind === "attachment") {
      units.push({ source: run, start: run.start, end: run.end, width: positionedInlineAdvance(run), text: "\uFFFC", glyphs: [] });
      continue;
    }
    if (run.verticalPresentation === "combined") {
      units.push({ source: run, start: run.start, end: run.end, width: positionedInlineAdvance(run), text: run.shaped.text, glyphs: run.shaped.glyphs });
      continue;
    }
    if (run.kind !== "glyph" || !run.shaped.glyphs.length) continue;
    if (run.ruby?.length) {
      units.push({ source: run, start: run.start, end: run.end, width: Math.max(inlineAdvance(run.shaped), ...run.ruby.map(ruby => ruby.cellWidth)), text: run.shaped.text, glyphs: run.shaped.glyphs });
      continue;
    }
    const glyphsByCluster = new Map<number, TFXGlyphInfo[]>();
    for (const glyph of run.shaped.glyphs) {
      if ((work++ & 255) === 0) signal?.throwIfAborted();
      const grouped = glyphsByCluster.get(glyph.cluster);
      if (grouped) grouped.push(glyph);
      else glyphsByCluster.set(glyph.cluster, [glyph]);
    }
    const clusters = [...glyphsByCluster.keys()].sort((left, right) => left - right);
    const ends = new Map(clusters.map((cluster, index) => [cluster, clusters[index + 1] ?? run.shaped.text.length]));
    for (let index = 0; index < run.shaped.glyphs.length;) {
      if ((work++ & 255) === 0) signal?.throwIfAborted();
      const cluster = run.shaped.glyphs[index]!.cluster;
      let finish = index + 1;
      while (finish < run.shaped.glyphs.length && run.shaped.glyphs[finish]!.cluster === cluster) finish += 1;
      const glyphs = run.shaped.glyphs.slice(index, finish);
      const end = ends.get(cluster)!;
      units.push({
        source: run,
        start: run.start + cluster,
        end: run.start + end,
        width: glyphs.reduce((sum, glyph) => sum + glyphInlineAdvance(glyph, run.shaped.direction), 0),
        text: run.shaped.text.slice(cluster, end),
        glyphs,
      });
      index = finish;
    }
  }
  return units;
}

function reshapedRunsForUnits(units: readonly ClusterUnit[], signal?: AbortSignal): readonly RetainedRun[] {
  const runs: RetainedRun[] = [];
  for (let index = 0; index < units.length;) {
    signal?.throwIfAborted();
    const first = units[index]!;
    if (first.source.kind === "tab" || first.source.kind === "attachment") {
      runs.push({ run: { ...first.source }, baseInlineOffset: 0, cellWidth: positionedInlineAdvance(first.source) });
      index += 1;
      continue;
    }
    if (first.source.verticalPresentation === "combined") {
      runs.push({ run: { ...first.source }, baseInlineOffset: 0, cellWidth: positionedInlineAdvance(first.source) });
      index += 1;
      continue;
    }
    if (first.source.ruby?.length) {
      const baseInlineOffset = Math.max(...first.source.ruby.map(ruby => ruby.baseInlineOffset));
      const cellWidth = Math.max(inlineAdvance(first.source.shaped), ...first.source.ruby.map(ruby => ruby.cellWidth));
      runs.push({ run: { ...first.source }, baseInlineOffset, cellWidth });
      index += 1;
      continue;
    }
    let finish = index + 1;
    let start = first.start;
    let end = first.end;
    while (finish < units.length) {
      const next = units[finish]!;
      if (next.source !== first.source || (next.start !== end && next.end !== start)) break;
      start = Math.min(start, next.start);
      end = Math.max(end, next.end);
      finish += 1;
    }
    const text = first.source.shaped.text.slice(start - first.source.start, end - first.source.start);
    const shapingOptions = first.source.shapingOptions ?? { direction: first.source.shaped.direction };
    const shaped = first.source.font.shape(text, shapingOptions);
    runs.push({
      run: { kind: "glyph", start, end, font: first.source.font, shaped, shapingOptions },
      baseInlineOffset: 0,
      cellWidth: inlineAdvance(shaped),
    });
    index = finish;
  }
  return runs;
}

function actualTrailingWhitespaceWidth(runs: readonly TFXPositionedGlyphRun[], lineEnd: number): number {
  const logical = runs
    .filter((run) => run.kind !== "truncation-token")
    .slice()
    .sort((left, right) => right.end - left.end || right.start - left.start);
  let expected = lineEnd;
  let width = 0;
  for (const run of logical) {
    if (run.end !== expected) break;
    if (run.kind === "tab") {
      width += inlineAdvance(run.shaped);
      expected = run.start;
      continue;
    }
    const whitespace = run.shaped.text.match(/\s+$/u)?.[0] ?? "";
    if (!whitespace) break;
    const whitespaceStart = run.shaped.text.length - whitespace.length;
    width += run.shaped.glyphs.reduce((sum, glyph) =>
      sum + (glyph.cluster >= whitespaceStart ? glyphInlineAdvance(glyph, run.shaped.direction) : 0), 0);
    expected = run.start + whitespaceStart;
    if (whitespaceStart > 0) break;
  }
  return width;
}

function caretEdgesForRuns(
  runs: readonly TFXPositionedGlyphRun[],
  lineStart: number,
  lineEnd: number,
  lineWidth: number,
  lineDirection: "ltr" | "rtl",
  truncatedRange: TFXLineStringRange | null,
  signal?: AbortSignal,
): readonly CaretEdge[] {
  const edges: CaretEdge[] = [];
  let work = 0;
  for (const run of runs) {
    if ((work++ & 255) === 0) signal?.throwIfAborted();
    if (run.kind === "truncation-token") continue;
    const direction = logicalDirection(run.shaped.direction);
    if (run.kind === "tab" || run.delegate) {
      const leading = direction === "rtl" ? run.x + positionedInlineAdvance(run) : run.x;
      const trailing = direction === "rtl" ? run.x : run.x + positionedInlineAdvance(run);
      edges.push({ offset: leading, stringIndex: run.start, leadingEdge: true, direction, enumerable: true });
      edges.push({ offset: trailing, stringIndex: run.end, leadingEdge: false, direction, enumerable: true });
      continue;
    }
    if (run.verticalPresentation === "combined") {
      const segments = [...caretGraphemes.segment(run.shaped.text)];
      const advance = positionedInlineAdvance(run);
      for (let index = 0; index <= segments.length; index += 1) {
        const localIndex = index === segments.length
          ? run.shaped.text.length
          : segments[index]!.index;
        edges.push({
          offset: run.x + advance * index / Math.max(1, segments.length),
          stringIndex: run.start + localIndex,
          leadingEdge: index < segments.length,
          direction,
          enumerable: true,
          ...(index < segments.length ? { clusterEnd: run.start + localIndex + segments[index]!.segment.length } : {}),
        });
      }
      continue;
    }
    const glyphsByCluster = new Map<number, TFXGlyphInfo[]>();
    for (const glyph of run.shaped.glyphs) {
      if ((work++ & 255) === 0) signal?.throwIfAborted();
      const grouped = glyphsByCluster.get(glyph.cluster);
      if (grouped) grouped.push(glyph);
      else glyphsByCluster.set(glyph.cluster, [glyph]);
    }
    const clusters = [...glyphsByCluster.keys()].sort((left, right) => left - right);
    const clusterEnds = new Map(clusters.map((cluster, index) => [cluster, clusters[index + 1] ?? run.shaped.text.length]));
    for (const cluster of clusters) {
      if ((work++ & 255) === 0) signal?.throwIfAborted();
      const glyphs = glyphsByCluster.get(cluster)!;
      const left = glyphs.reduce((minimum, glyph) => Math.min(minimum, run.x + glyphInlinePosition(glyph, run.shaped.direction), run.x + glyphInlinePosition(glyph, run.shaped.direction) + glyphInlineAdvance(glyph, run.shaped.direction)), Infinity);
      const right = glyphs.reduce((maximum, glyph) => Math.max(maximum, run.x + glyphInlinePosition(glyph, run.shaped.direction), run.x + glyphInlinePosition(glyph, run.shaped.direction) + glyphInlineAdvance(glyph, run.shaped.direction)), -Infinity);
      const start = run.start + cluster;
      const localEnd = clusterEnds.get(cluster)!;
      const end = run.start + localEnd;
      const leading = direction === "rtl" ? right : left;
      const trailing = direction === "rtl" ? left : right;
      edges.push({ offset: leading, stringIndex: start, leadingEdge: true, direction, enumerable: true, clusterEnd: end });
      edges.push({ offset: trailing, stringIndex: end, leadingEdge: false, direction, enumerable: true });

      const clusterText = run.shaped.text.slice(cluster, localEnd);
      const graphemeBoundaries = [...caretGraphemes.segment(clusterText)]
        .slice(1)
        .map((segment) => segment.index);
      const fontCarets = glyphs
        .flatMap((glyph) => (glyph.ligatureCaretOffsets ?? []).map((offset) => run.x + glyphInlinePosition(glyph, run.shaped.direction) + glyphInlineOffset(glyph, run.shaped.direction) + (isVerticalDirection(run.shaped.direction) ? -offset : offset)))
        .sort((a, b) => direction === "rtl" ? b - a : a - b);
      for (let graphemeIndex = 0; graphemeIndex < graphemeBoundaries.length; graphemeIndex += 1) {
        const localIndex = graphemeBoundaries[graphemeIndex]!;
        const offset = fontCarets[graphemeIndex] ?? leading + (trailing - leading) * localIndex / clusterText.length;
        edges.push({ offset, stringIndex: start + localIndex, leadingEdge: true, direction, enumerable: true });
      }
    }
  }
  if (!edges.some((edge) => edge.stringIndex === lineStart)) {
    edges.push({ offset: lineDirection === "rtl" ? lineWidth : 0, stringIndex: lineStart, leadingEdge: true, direction: lineDirection, enumerable: true });
  }
  if (!edges.some((edge) => edge.stringIndex === lineEnd)) {
    edges.push({ offset: lineDirection === "rtl" ? 0 : lineWidth, stringIndex: lineEnd, leadingEdge: false, direction: lineDirection, enumerable: true });
  }
  if (truncatedRange?.length) {
    const tokenRuns = runs.filter((run) => run.kind === "truncation-token");
    if (tokenRuns.length) {
      const tokenIndex = tokenRuns[0]!.start;
      const tokenLeft = tokenRuns.reduce((minimum, run) => Math.min(minimum, run.x), Infinity);
      const tokenRight = tokenRuns.reduce((maximum, run) => Math.max(maximum, run.x + positionedInlineAdvance(run)), -Infinity);
      for (let index = edges.length - 1; index >= 0; index -= 1) {
        if (edges[index]!.stringIndex === tokenIndex) edges.splice(index, 1);
      }
      edges.push({ offset: (tokenLeft + tokenRight) / 2, stringIndex: tokenIndex, leadingEdge: true, direction: lineDirection, enumerable: true });
    }
  }
  return edges;
}

export class TFXLine {
  #caretMapCache: CaretMap | null = null;
  readonly start: number;
  readonly end: number;
  readonly runs: readonly TFXPositionedGlyphRun[];
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly leading: number;
  readonly trailingWhitespaceWidth: number;
  readonly direction: "ltr" | "rtl";
  readonly orientation: TFXLineOrientation;
  readonly truncatedRange: TFXLineStringRange | null;

  constructor(
    start: number,
    end: number,
    runs: readonly TFXPositionedGlyphRun[],
    trailingWhitespaceWidth = 0,
    direction: "ltr" | "rtl" = "ltr",
    truncatedRange: TFXLineStringRange | null = null,
    orientation: TFXLineOrientation = "horizontal",
  ) {
    this.start = start; this.end = end;
    if (orientation !== "horizontal" && orientation !== "vertical") throw new TypeError("Invalid line orientation.");
    for (const run of runs) {
      const delegated = run.delegate !== undefined;
      if (run.kind === "attachment" && !delegated) throw new TypeError("An attachment run requires a TFXRunDelegate.");
      if (delegated && run.kind !== "attachment" && run.kind !== "truncation-token") throw new TypeError("A TFXRunDelegate belongs only to attachment content.");
      if (delegated) {
        if (!(run.delegate instanceof TFXRunDelegate)) throw new TypeError("An attachment run requires a canonical TFXRunDelegate.");
        if (run.shaped.glyphs.length || run.shaped.text !== "\uFFFC") throw new TypeError("An attachment run must contain only a zero-glyph U+FFFC marker.");
        if (run.kind === "attachment" && run.end !== run.start + 1) throw new RangeError("An attachment run must own one UTF-16 unit.");
        if (Math.abs(inlineAdvance(run.shaped) - run.delegate.width) > 1e-9) throw new RangeError("Attachment run advance must match its delegate width.");
        if (isVerticalDirection(run.shaped.direction) !== (orientation === "vertical")) throw new TypeError("Attachment direction must match line orientation.");
      }
    }
    this.runs = Object.freeze(runs.map(run => Object.freeze({ ...run, ...(run.ruby ? { ruby: Object.freeze(run.ruby.map(item => Object.freeze({ ...item, glyphInlineOffsets: Object.freeze([...item.glyphInlineOffsets]) }))) } : {}) })));
    this.width = runs.reduce((maximum, run) => Math.max(maximum, run.x + positionedInlineAdvance(run), ...(run.ruby ?? []).map(ruby => run.x + ruby.inlineOffset + ruby.width)), 0);
    const upright = (run: TFXPositionedGlyphRun) =>
      run.kind === "tab" || run.verticalPresentation === "combined" || isVerticalDirection(run.shaped.direction);
    this.ascent = runs.reduce((maximum, run) => Math.max(maximum, run.delegate?.ascent ?? (orientation === "vertical"
      ? (upright(run) ? run.font.verticalAscent : run.font.descent)
      : run.font.ascent), ...(run.ruby ?? []).map(ruby => Math.max(0, -ruby.crossMin))), 0);
    this.descent = runs.reduce((maximum, run) => Math.max(maximum, run.delegate?.descent ?? (orientation === "vertical"
      ? (upright(run) ? run.font.verticalDescent : run.font.ascent)
      : run.font.descent), ...(run.ruby ?? []).map(ruby => Math.max(0, ruby.crossMax))), 0);
    this.leading = runs.reduce((maximum, run) => Math.max(maximum, run.delegate ? 0 : orientation === "vertical"
      ? (upright(run) ? run.font.verticalLeading : run.font.leading)
      : run.font.leading), 0);
    this.trailingWhitespaceWidth = trailingWhitespaceWidth;
    this.direction = direction;
    this.orientation = orientation;
    this.truncatedRange = truncatedRange ? Object.freeze({ ...truncatedRange }) : null;
    Object.freeze(this);
  }

  stringIndexForPosition(x: number): number {
    if (!Number.isFinite(x)) throw new RangeError("Text hit-test position must be finite.");
    const visual = this.#caretMap().visual;
    let lower = 0, upper = visual.length;
    while (lower < upper) {
      const middle = lower + ((upper - lower) >> 1);
      if (visual[middle]!.offset < x) lower = middle + 1;
      else upper = middle;
    }
    if (lower === 0) return visual[0]!.stringIndex;
    if (lower === visual.length) return visual.at(-1)!.stringIndex;
    const before = visual[lower - 1]!, after = visual[lower]!;
    return x - before.offset <= after.offset - x ? before.stringIndex : after.stringIndex;
  }

  textPositionForUTF16Offset(utf16Offset: number): TFXLineTextPosition {
    if (!Number.isSafeInteger(utf16Offset) || utf16Offset < this.start || utf16Offset > this.end) {
      throw new RangeError("UTF-16 offset is outside the line range.");
    }
    const boundaries = new Set<number>([this.start, this.end]);
    const glyphIndices: number[] = [];
    let visualGlyphIndex = 0;
    for (const run of this.runs) {
      if (run.kind === "truncation-token") {
        visualGlyphIndex += run.shaped.glyphs.length;
        continue;
      }
      for (const segment of caretGraphemes.segment(run.shaped.text)) boundaries.add(run.start + segment.index);
      boundaries.add(run.end);
      const clusters = [...new Set(run.shaped.glyphs.map(glyph => glyph.cluster))].sort((left, right) => left - right);
      const ends = new Map(clusters.map((cluster, index) => [cluster, clusters[index + 1] ?? run.shaped.text.length]));
      for (const glyph of run.shaped.glyphs) {
        const clusterStart = run.start + glyph.cluster;
        const clusterEnd = run.start + (ends.get(glyph.cluster) ?? run.shaped.text.length);
        if (
          (utf16Offset >= clusterStart && utf16Offset < clusterEnd) ||
          (utf16Offset === this.end && clusterEnd === this.end)
        ) {
          glyphIndices.push(visualGlyphIndex);
        }
        visualGlyphIndex += 1;
      }
    }
    return Object.freeze({
      utf16Offset,
      graphemeBoundary: boundaries.has(utf16Offset),
      glyphIndices: Object.freeze(glyphIndices),
    });
  }

  offsetForStringIndex(stringIndex: number): TFXLineCaretOffsets {
    if (!Number.isSafeInteger(stringIndex) || stringIndex < this.start || stringIndex > this.end) {
      throw new RangeError("String index is outside the line range.");
    }
    const caretMap = this.#caretMap();
    if (caretMap.tokenIndex !== null && caretMap.tokenOffset !== null && this.truncatedRange &&
      stringIndex >= this.truncatedRange.location &&
      stringIndex <= this.truncatedRange.location + this.truncatedRange.length) {
      return Object.freeze({ primary: caretMap.tokenOffset, secondary: caretMap.tokenOffset });
    }
    const candidates = caretMap.logical.get(stringIndex) ?? [];
    const unique = candidates.filter((candidate, index) =>
      candidates.findIndex((other) => Math.abs(other.offset - candidate.offset) <= 1e-9) === index);
    if (!unique.length) {
      const spans = caretMap.logicalSpans;
      let spanLower = 0, spanUpper = spans.length;
      while (spanLower < spanUpper) {
        const middle = spanLower + ((spanUpper - spanLower) >> 1);
        if (spans[middle]!.stringIndex <= stringIndex) spanLower = middle + 1;
        else spanUpper = middle;
      }
      const containing = spans[spanLower - 1];
      if (containing?.clusterEnd !== undefined && stringIndex < containing.clusterEnd) {
        return Object.freeze({ primary: containing.offset, secondary: containing.offset });
      }
      const indices = caretMap.logicalIndices;
      let lower = 0, upper = indices.length;
      while (lower < upper) {
        const middle = lower + ((upper - lower) >> 1);
        if (indices[middle]! < stringIndex) lower = middle + 1;
        else upper = middle;
      }
      const before = indices[Math.max(0, lower - 1)]!;
      const after = indices[Math.min(indices.length - 1, lower)]!;
      const beforeDistance = Math.abs(stringIndex - before);
      const afterDistance = Math.abs(after - stringIndex);
      const nearestIndex = beforeDistance <= afterDistance
        ? before
        : after;
      const nearest = caretMap.logical.get(nearestIndex)![0]!;
      return Object.freeze({ primary: nearest.offset, secondary: nearest.offset });
    }
    const primary = unique.find((caret) => caret.direction === this.direction) ?? unique[0]!;
    const secondary = unique.find((caret) => caret !== primary)?.offset ?? primary.offset;
    return Object.freeze({ primary: primary.offset, secondary });
  }

  enumerateCaretOffsets(visitor: TFXLineCaretVisitor, signal?: AbortSignal): void {
    if (typeof visitor !== "function") throw new TypeError("Caret visitor must be a function.");
    signal?.throwIfAborted();
    const edges = this.#caretMap(signal).visual;
    let previous: CaretEdge | null = null;
    for (let index = 0; index < edges.length; index += 1) {
      if ((index & 255) === 0) signal?.throwIfAborted();
      const edge = edges[index]!;
      if (!edge.enumerable || (previous && edge.stringIndex === previous.stringIndex && Math.abs(edge.offset - previous.offset) <= 1e-9)) continue;
      previous = edge;
      if (visitor(Object.freeze({ offset: edge.offset, stringIndex: edge.stringIndex, leadingEdge: edge.leadingEdge })) === false) return;
    }
  }

  #caretMap(signal?: AbortSignal): CaretMap {
    signal?.throwIfAborted();
    if (this.#caretMapCache) return this.#caretMapCache;
    const visual = caretEdgesForRuns(this.runs, this.start, this.end, this.width, this.direction, this.truncatedRange, signal)
      .slice()
      .sort((left, right) => left.offset - right.offset || left.stringIndex - right.stringIndex);
    const logical = new Map<number, CaretEdge[]>();
    for (let index = 0; index < visual.length; index += 1) {
      if ((index & 255) === 0) signal?.throwIfAborted();
      const edge = visual[index]!;
      const grouped = logical.get(edge.stringIndex);
      if (grouped) grouped.push(edge);
      else logical.set(edge.stringIndex, [edge]);
    }
    for (const [index, edges] of logical) logical.set(index, Object.freeze(edges.slice()) as CaretEdge[]);
    const logicalIndices = Object.freeze([...logical.keys()].sort((left, right) => left - right));
    const logicalSpans = Object.freeze(visual.filter((edge) => edge.clusterEnd !== undefined).sort((left, right) => left.stringIndex - right.stringIndex));
    const tokenIndex = this.runs.find((run) => run.kind === "truncation-token")?.start ?? null;
    const tokenOffset = tokenIndex === null ? null : (logical.get(tokenIndex)?.[0]?.offset ?? null);
    this.#caretMapCache = Object.freeze({ visual: Object.freeze(visual), logical, logicalIndices, logicalSpans, tokenIndex, tokenOffset });
    return this.#caretMapCache;
  }

  createJustifiedLine(factor: number, width: number): TFXLine | null {
    if (!Number.isFinite(factor) || factor < 0 || factor > 1 || !Number.isFinite(width) || width < 0) throw new RangeError("Invalid justification factor or width.");
    if (factor === 0 || width === this.width) return this;
    const lastContent = this.runs.reduce((maximum, run) => run.kind === "glyph"
      ? Math.max(maximum, run.start + run.shaped.text.trimEnd().length)
      : maximum, this.start);
    const eligible = (run: TFXPositionedGlyphRun, cluster: number) =>
      run.kind === "glyph" && run.start + cluster < lastContent && /[ \u3000]/u.test(run.shaped.text[cluster] ?? "");
    const count = this.runs.reduce((total, run) => total + run.shaped.glyphs.filter(g => eligible(run, g.cluster)).length, 0);
    if (!count) return null;
    const extra = (width - this.width) * factor / count;
    if (this.runs.some(run => run.shaped.glyphs.some(g => eligible(run, g.cluster) && glyphInlineAdvance(g, run.shaped.direction) + extra < 0))) return null;
    let x = 0;
    let runs = this.runs.map(run => {
      let offset = 0;
      const glyphs = run.shaped.glyphs.map(glyph => {
        const delta = eligible(run, glyph.cluster) ? extra : 0;
        const vertical = isVerticalDirection(run.shaped.direction);
        const sign = vertical ? -1 : 1;
        const result = Object.freeze({
          ...glyph,
          position: Object.freeze(vertical ? { ...glyph.position, y: glyph.position.y + sign * offset } : { ...glyph.position, x: glyph.position.x + offset }),
          advance: Object.freeze(vertical ? { ...glyph.advance, y: glyph.advance.y + sign * delta } : { ...glyph.advance, x: glyph.advance.x + delta }),
        });
        offset += delta;
        return result;
      });
      const shaped = Object.freeze({ ...run.shaped, glyphs: Object.freeze(glyphs), advance: Object.freeze(isVerticalDirection(run.shaped.direction) ? { ...run.shaped.advance, height: run.shaped.advance.height + offset } : { ...run.shaped.advance, width: run.shaped.advance.width + offset }) });
      const baseInlineOffset = run.ruby?.reduce((maximum, ruby) => Math.max(maximum, ruby.baseInlineOffset), 0) ?? 0;
      const naturalAdvance = run.inlineAdvanceOverride ?? inlineAdvance(shaped);
      const cellWidth = run.ruby?.reduce((maximum, ruby) => Math.max(maximum, ruby.cellWidth), naturalAdvance) ?? naturalAdvance;
      const result = { ...run, x: x + baseInlineOffset, shaped };
      x += cellWidth;
      return result;
    });
    const minimum = runs.reduce((value, run) => Math.min(value, run.x, ...(run.ruby ?? []).map(ruby => run.x + ruby.inlineOffset)), 0);
    if (minimum < 0) runs = runs.map(run => ({ ...run, x: run.x - minimum }));
    return new TFXLine(this.start, this.end, runs, this.trailingWhitespaceWidth, this.direction, this.truncatedRange, this.orientation);
  }

  createTruncatedLine(
    width: number,
    type: TFXLineTruncationType,
    token: TFXLine | null,
    signal?: AbortSignal,
  ): TFXLine | null {
    if (!Number.isFinite(width) || width < 0) throw new RangeError("Truncation width must be finite and non-negative.");
    if (!["head", "middle", "tail"].includes(type)) throw new TypeError("Invalid line truncation type.");
    if (token !== null && !(token instanceof TFXLine)) throw new TypeError("A truncation token must be a TFXLine or null.");
    if (token && token.orientation !== this.orientation) throw new TypeError("A truncation token must match the line orientation.");
    signal?.throwIfAborted();
    if (this.truncatedRange !== null || this.runs.some((run) => run.kind === "truncation-token")) {
      throw new DOMException("An already-truncated TFXLine cannot be truncated again.", "InvalidStateError");
    }
    if (this.width <= width) return this;
    const tokenWidth = token?.width ?? 0;
    if (tokenWidth > width) return null;
    const available = width - tokenWidth;
    const physical = clusterUnits(this.runs, signal);
    const logical = [...physical].sort((left, right) => left.start - right.start || left.end - right.end);
    const prefix: ClusterUnit[] = [];
    const suffix: ClusterUnit[] = [];
    let used = 0;
    if (type === "tail") {
      for (const unit of logical) {
        signal?.throwIfAborted();
        if (used + unit.width > available + 1e-9) break;
        prefix.push(unit); used += unit.width;
      }
    } else if (type === "head") {
      for (let index = logical.length - 1; index >= 0; index -= 1) {
        signal?.throwIfAborted();
        const unit = logical[index]!;
        if (used + unit.width > available + 1e-9) break;
        suffix.push(unit); used += unit.width;
      }
    } else {
      let left = 0, right = logical.length - 1;
      while (left <= right) {
        signal?.throwIfAborted();
        let progressed = false;
        const leading = logical[left]!;
        if (used + leading.width <= available + 1e-9) {
          prefix.push(leading); used += leading.width; left += 1; progressed = true;
        }
        if (left <= right) {
          const trailing = logical[right]!;
          if (used + trailing.width <= available + 1e-9) {
            suffix.push(trailing); used += trailing.width; right -= 1; progressed = true;
          }
        }
        if (!progressed) break;
      }
    }
    if (type !== "tail") suffix.reverse();
    let suffixCursor = 0;
    const retainedSuffix = () => suffixCursor === 0 ? suffix : suffix.slice(suffixCursor);
    const rangeForSelection = (): TFXLineStringRange => {
      const prefixEnd = prefix.at(-1)?.end ?? this.start;
      const suffixStart = suffix[suffixCursor]?.start ?? this.end;
      return type === "head"
        ? { location: this.start, length: Math.max(0, suffixStart - this.start) }
        : type === "tail"
          ? { location: prefixEnd, length: Math.max(0, this.end - prefixEnd) }
          : { location: prefixEnd, length: Math.max(0, suffixStart - prefixEnd) };
    };
    const compose = () => {
      const range = rangeForSelection();
      const tokenIndex = type === "head" ? range.location + range.length : range.location;
      const prefixSet = new Set(prefix);
      const suffixSet = new Set(retainedSuffix());
      const prefixPhysical = physical.filter((unit) => prefixSet.has(unit));
      const suffixPhysical = physical.filter((unit) => suffixSet.has(unit));
      const parts: Array<readonly ClusterUnit[] | "token"> = this.direction === "ltr"
        ? type === "head" ? ["token", suffixPhysical] : type === "tail" ? [prefixPhysical, "token"] : [prefixPhysical, "token", suffixPhysical]
        : type === "head" ? [suffixPhysical, "token"] : type === "tail" ? ["token", prefixPhysical] : [suffixPhysical, "token", prefixPhysical];
      const runs: TFXPositionedGlyphRun[] = [];
      let x = 0;
      for (const part of parts) {
        signal?.throwIfAborted();
        if (part === "token") {
          if (!token) continue;
          for (const run of token.runs) runs.push(Object.freeze({ ...run, kind: "truncation-token", start: tokenIndex, end: tokenIndex, x: x + run.x }));
          x += token.width;
          continue;
        }
        for (const retained of reshapedRunsForUnits(part, signal)) {
          runs.push(Object.freeze({ ...retained.run, x: x + retained.baseInlineOffset }));
          x += retained.cellWidth;
        }
      }
      const minimum = runs.reduce((value, run) => Math.min(value, run.x, ...(run.ruby ?? []).map(ruby => run.x + ruby.inlineOffset)), 0);
      if (minimum < 0) {
        for (let index = 0; index < runs.length; index += 1) runs[index] = Object.freeze({ ...runs[index]!, x: runs[index]!.x - minimum });
      }
      const measured = runs.reduce((value, run) => Math.max(value, run.x + positionedInlineAdvance(run), ...(run.ruby ?? []).map(ruby => run.x + ruby.inlineOffset + ruby.width)), 0);
      return { runs, width: measured };
    };
    let composed = compose();
    // Context changes only at retained-span boundaries. Bound correction to a fixed
    // number of full-span reshapes, then conservatively retain only the token.
    for (let adjustment = 0; composed.width > width + 1e-9 && adjustment < 16; adjustment += 1) {
      signal?.throwIfAborted();
      const overflow = composed.width - width;
      let removed = 0;
      let removalWork = 0;
      while (removed < overflow && (prefix.length || suffixCursor < suffix.length)) {
        if ((removalWork++ & 255) === 0) signal?.throwIfAborted();
        const unit = type === "head"
          ? suffix[suffixCursor++]
          : type === "tail"
            ? prefix.pop()
            : (prefix.at(-1)?.width ?? -1) >= (suffix[suffixCursor]?.width ?? -1)
              ? prefix.pop()
              : suffix[suffixCursor++];
        if (!unit) break;
        removed += unit.width;
      }
      composed = compose();
    }
    if (composed.width > width + 1e-9) {
      prefix.length = 0;
      suffixCursor = suffix.length;
      composed = compose();
    }
    const runs = composed.runs;
    const truncatedRange = rangeForSelection();
    const trailingWhitespaceWidth = actualTrailingWhitespaceWidth(runs, this.end);
    return new TFXLine(this.start, this.end, runs, trailingWhitespaceWidth, this.direction, truncatedRange, this.orientation);
  }
}
