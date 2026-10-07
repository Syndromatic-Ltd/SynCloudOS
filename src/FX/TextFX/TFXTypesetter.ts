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

import LineBreaker from "linebreak";
import createBidi from "bidi-js";
import { unicodeScriptCode } from "unicode-script";
import { isTFXStringBoundary, TFXAttributedString, type TFXTextAttributes } from "./TFXAttributedString";
import { TFXLine, type TFXPositionedGlyphRun, type TFXPositionedRubyRun } from "./TFXLine";
import { inlineAdvance, glyphInlineAdvance, logicalDirection, positionedInlineAdvance, type TFXLineOrientation } from "./TFXInlineGeometry";
import { TFXParagraphStyle } from "./TFXParagraphStyle";
import { layoutTFXRuby, tfxRubyGlyphOffsets } from "./TFXRubyLayout";
import {
  tfxAllowsLineBreak,
  tfxVerticalOrientationForGrapheme,
  type TFXVerticalPresentation,
} from "./TFXVerticalOrientation";

const bidi = createBidi();
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const defaultParagraphStyle = new TFXParagraphStyle();

interface TFXLogicalRun {
  readonly start: number;
  readonly end: number;
  readonly level: number;
  readonly script: string;
  readonly attributes: TFXTextAttributes;
  readonly verticalPresentation?: TFXVerticalPresentation;
  readonly sourceScriptNeutral?: boolean;
}

function sameResolvedAttributes(left: TFXTextAttributes, right: TFXTextAttributes): boolean {
  return left.font === right.font &&
    left.language === right.language &&
    left.features === right.features &&
    left.paragraphStyle === right.paragraphStyle &&
    left.fallbackFonts === right.fallbackFonts &&
    left.verticalForms === right.verticalForms &&
    left.verticalOrientation === right.verticalOrientation &&
    left.textCombine === right.textCombine &&
    left.lineBreakPolicy === right.lineBreakPolicy &&
    left.runDelegate === right.runDelegate &&
    left.rubyAnnotation === right.rubyAnnotation;
}

function expandVerticalLogicalRuns(runs: readonly TFXLogicalRun[], text: string, orientation: TFXLineOrientation): TFXLogicalRun[] {
  if (orientation !== "vertical") return [...runs];
  const expanded: TFXLogicalRun[] = [];
  for (const run of runs) {
    if (run.attributes.runDelegate || run.attributes.rubyAnnotation) {
      expanded.push({
        ...run,
        ...(run.attributes.verticalForms ? { verticalPresentation: "upright" as const } : {}),
      });
      continue;
    }
    const value = text.slice(run.start, run.end);
    const segments = [...graphemes.segment(value)];
    if (run.attributes.textCombine === "all" && segments.length) {
      expanded.push({ ...run, verticalPresentation: "combined" });
      continue;
    }
    for (let index = 0; index < segments.length;) {
      const segment = segments[index]!;
      const absoluteStart = run.start + segment.index;
      if (
        run.attributes.textCombine === "digits2" &&
        /^[0-9]$/u.test(segment.segment) &&
        index + 1 < segments.length &&
        /^[0-9]$/u.test(segments[index + 1]!.segment)
      ) {
        const next = segments[index + 1]!;
        expanded.push({
          ...run,
          start: absoluteStart,
          end: run.start + next.index + next.segment.length,
          verticalPresentation: "combined",
        });
        index += 2;
        continue;
      }
      const presentation: TFXVerticalPresentation | undefined = run.attributes.verticalForms
        ? "upright"
        : run.attributes.verticalOrientation === "upright"
          ? "upright"
          : run.attributes.verticalOrientation === "sideways"
            ? "sideways"
            : run.attributes.verticalOrientation === "auto"
              ? tfxVerticalOrientationForGrapheme(segment.segment)
              : undefined;
      const strongScript = [...segment.segment]
        .map(unicodeScriptCode)
        .find(script => !["Zyyy", "Zinh", "Zzzz"].includes(script));
      const sourceScriptNeutral = strongScript === undefined;
      const resolvedScript = strongScript ?? run.script;
      const absoluteEnd = absoluteStart + segment.segment.length;
      const previous = expanded.at(-1);
      if (
        previous &&
        previous.end === absoluteStart &&
        previous.level === run.level &&
        previous.attributes === run.attributes &&
        previous.verticalPresentation === presentation &&
        (previous.script === resolvedScript || previous.sourceScriptNeutral === true || sourceScriptNeutral)
      ) {
        expanded[expanded.length - 1] = {
          ...previous,
          end: absoluteEnd,
          script: previous.sourceScriptNeutral === true && !sourceScriptNeutral ? resolvedScript : previous.script,
          sourceScriptNeutral: previous.sourceScriptNeutral === true && sourceScriptNeutral,
        };
      } else {
        expanded.push({
          ...run,
          start: absoluteStart,
          end: absoluteEnd,
          script: resolvedScript,
          sourceScriptNeutral,
          ...(presentation ? { verticalPresentation: presentation } : {}),
        });
      }
      index += 1;
    }
  }
  return expanded;
}

function adjustedBreakCandidate(
  input: TFXAttributedString,
  start: number,
  candidate: number,
): number {
  let absolute = start + candidate;
  const attributes = input.runs.find(run => absolute > run.start && absolute < run.end);
  if (!attributes) return candidate;
  if (
    attributes.textCombine === "digits2" &&
    /^[0-9]$/u.test(input.text.slice(absolute - 1, absolute)) &&
    /^[0-9]$/u.test(input.text.slice(absolute, absolute + 1))
  ) {
    absolute += 1;
  } else if (attributes.textCombine === "all") {
    absolute = attributes.end;
  }
  const policy = attributes.lineBreakPolicy ?? "auto";
  if (policy !== "auto" && absolute < input.text.length) {
    const before = [...graphemes.segment(input.text.slice(attributes.start, absolute))].at(-1)?.segment ?? "";
    const after = [...graphemes.segment(input.text.slice(absolute, attributes.end))][0]?.segment ?? "";
    if (before && after && !tfxAllowsLineBreak(before, after, policy, attributes.language)) {
      absolute += after.length;
    }
  }
  return absolute - start;
}

function createRubyRuns(run: { readonly attributes: TFXTextAttributes; readonly direction: "ltr" | "rtl" | "ttb" | "btt"; readonly script: string }, baseWidth: number, orientation: TFXLineOrientation, signal?: AbortSignal): { readonly baseOffset: number; readonly cellWidth: number; readonly ruby: readonly TFXPositionedRubyRun[] } {
  const annotation = run.attributes.rubyAnnotation;
  if (!annotation) return { baseOffset: 0, cellWidth: baseWidth, ruby: Object.freeze([]) };
  const ruby: TFXPositionedRubyRun[] = [];
  let cellWidth = baseWidth, baseOffset = 0;
  for (const position of ["before", "after", "interCharacter", "inline"] as const) {
    signal?.throwIfAborted();
    const content = annotation.contentForPosition(position);
    if (!content) continue;
    const text = content.text;
    const rubyScripts = scriptsForText(text);
    const rubyScript = rubyScripts.find(script => script !== "Zyyy") ?? run.script;
    if (rubyScripts.some(script => script !== "Zyyy" && script !== rubyScript)) throw new DOMException("Ruby text may not cross script boundaries in portable TextFX.", "NotSupportedError");
    const font = content.font ?? run.attributes.font;
    const scale = content.font ? 1 : annotation.sizeFactor;
    const shaped = font.shape(text, {
      direction: run.direction,
      script: rubyScript,
      language: content.language ?? run.attributes.language,
      features: content.features ?? run.attributes.features,
    });
    const naturalWidth = inlineAdvance(shaped) * scale;
    const rubyAscent = (orientation === "vertical" ? font.verticalAscent : font.ascent) * scale;
    const rubyDescent = (orientation === "vertical" ? font.verticalDescent : font.descent) * scale;
    const placement = layoutTFXRuby({
      position,
      baseWidth,
      rubyWidth: naturalWidth,
      alignment: annotation.alignment,
      overhang: annotation.overhang,
      collisionPolicy: annotation.collisionPolicy,
      direction: logicalDirection(run.direction),
      orientation,
      baseAscent: run.attributes.font.ascent,
      baseDescent: run.attributes.font.descent,
      baseVerticalAscent: run.attributes.font.verticalAscent,
      baseVerticalDescent: run.attributes.font.verticalDescent,
      rubyAscent,
      rubyDescent,
      fontSize: run.attributes.font.descriptor.size,
    });
    cellWidth = Math.max(cellWidth, placement.cellWidth);
    baseOffset = Math.max(baseOffset, placement.baseInlineOffset);
    ruby.push(Object.freeze({
      position,
      text,
      font,
      shaped,
      scale,
      baseInlineOffset: placement.baseInlineOffset,
      cellWidth: placement.cellWidth,
      inlineOffset: placement.inlineOffset,
      crossOffset: placement.crossOffset,
      crossMin: placement.crossMin,
      crossMax: placement.crossMax,
      width: placement.width,
      glyphInlineOffsets: tfxRubyGlyphOffsets(shaped.glyphs.length, naturalWidth, placement.width, annotation.alignment),
    }));
  }
  const reconciled = ruby.map((item) => Object.freeze({
    ...item,
    baseInlineOffset: baseOffset,
    cellWidth,
    inlineOffset: item.inlineOffset + item.baseInlineOffset - baseOffset,
  }));
  return { baseOffset, cellWidth, ruby: Object.freeze(reconciled) };
}

/** Resolve neutral graphemes to adjacent script context without splitting combining sequences. */
function scriptsForText(text: string): readonly string[] {
  const segments = [...graphemes.segment(text)].map(segment => ({
    ...segment,
    script: [...segment.segment].map(unicodeScriptCode).find(script => !["Zyyy", "Zinh", "Zzzz"].includes(script)),
  }));
  let previous: string | undefined;
  for (const segment of segments) {
    segment.script ??= previous;
    previous = segment.script;
  }
  let next = "Zyyy";
  const scripts: string[] = new Array(text.length);
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    segment.script ??= next;
    next = segment.script;
    scripts.fill(segment.script, segment.index, segment.index + segment.segment.length);
  }
  return scripts;
}

export class TFXTypesetter {
  readonly #input: TFXAttributedString;
  readonly #direction: "ltr" | "rtl";
  readonly #orientation: TFXLineOrientation;
  constructor(input: TFXAttributedString, direction: "ltr" | "rtl" = "ltr", orientation: TFXLineOrientation = "horizontal") {
    if (!["ltr", "rtl"].includes(direction)) throw new TypeError("Invalid paragraph direction.");
    if (orientation !== "horizontal" && orientation !== "vertical") throw new TypeError("Invalid line orientation.");
    this.#input = input;
    this.#direction = direction;
    this.#orientation = orientation;
  }
  createLine(start: number, length: number, signal?: AbortSignal): TFXLine {
    signal?.throwIfAborted();
    const end = start + length;
    const text = this.#input.text;
    if (length < 0 || !isTFXStringBoundary(text, start) || !isTFXStringBoundary(text, end)) throw new RangeError("Invalid line range.");
    if (this.#input.runs.some(run => run.rubyAnnotation && run.start < end && run.end > start && (start > run.start || end < run.end))) throw new RangeError("A line may not split an atomic ruby base range.");
    const content = text.slice(start, end).replace(/[\r\n\u000b\u000c\u0085\u2028\u2029]+$/u, "");
    if (!content.includes("\t")) return this.#createUntabbedLine(start, length, signal);
    const tabs = [...content.matchAll(/\t/gu)].map((match) => start + match.index);
    if (tabs.length > 1024) throw new RangeError("A TextFX line accepts at most 1024 tab controls.");
    const paragraphStart = start === 0 ? 0 : Math.max(text.lastIndexOf("\n", start - 1), text.lastIndexOf("\r", start - 1), text.lastIndexOf("\u2029", start - 1)) + 1;
    const paragraphStyle = this.#input.runs.find((run) => run.start <= paragraphStart && run.end > paragraphStart)?.paragraphStyle ?? defaultParagraphStyle;
    const fields = [start, ...tabs.map((index) => index + 1)];
    const fieldEnds = [...tabs, start + content.length];
    const lines = fields.map((fieldStart, index) => this.#createUntabbedLine(fieldStart, fieldEnds[index]! - fieldStart, signal));
    const logicalRuns: TFXPositionedGlyphRun[] = [];
    let cursor = 0;
    for (let index = 0; index < lines.length; index += 1) {
      signal?.throwIfAborted();
      const field = lines[index]!;
      if (index > 0) {
        const tabIndex = tabs[index - 1]!;
        const attributes = this.#input.runs.find((run) => run.start <= tabIndex && run.end > tabIndex)!;
        const style = paragraphStyle;
        const explicit = style.tabStops.find((tab) => tab.location > cursor + 1e-9);
        let target = explicit?.location ?? cursor;
        if (!explicit && style.defaultTabInterval > 0) {
          target = Math.ceil(cursor / style.defaultTabInterval) * style.defaultTabInterval;
          if (target <= cursor + 1e-9) target += style.defaultTabInterval;
        }
        const alignment = explicit?.textAlignment === "natural"
          ? (this.#direction === "rtl" ? "right" : "left")
          : (explicit?.textAlignment ?? "left");
        const fieldStart = Math.max(cursor, target - (alignment === "right" ? field.width : alignment === "center" ? field.width / 2 : 0));
        const advance = fieldStart - cursor;
        logicalRuns.push({
          kind: "tab",
          start: tabIndex,
          end: tabIndex + 1,
          x: cursor,
          font: attributes.font,
          shaped: Object.freeze({
            text: "\t",
            direction: this.#direction,
            glyphs: Object.freeze([]),
            advance: Object.freeze(this.#orientation === "vertical" ? { width: 0, height: advance } : { width: advance, height: 0 }),
          }),
        });
        cursor = fieldStart;
      }
      for (const run of field.runs) logicalRuns.push({ ...run, x: cursor + run.x });
      cursor += field.width;
    }
    const runs = this.#direction === "rtl"
      ? logicalRuns.map((run) => ({ ...run, x: cursor - run.x - positionedInlineAdvance(run) })).sort((left, right) => left.x - right.x)
      : logicalRuns;
    const trailing = content.match(/\s+$/u)?.[0] ?? "";
    const trailingStart = start + content.length - trailing.length;
    const trailingWidth = runs.reduce((width, run) => width + (run.kind === "tab"
      ? (run.start >= trailingStart ? inlineAdvance(run.shaped) : 0)
      : run.shaped.glyphs.reduce((sum, glyph) => sum + (run.start + glyph.cluster >= trailingStart ? glyphInlineAdvance(glyph, run.shaped.direction) : 0), 0)), 0);
    return new TFXLine(start, end, runs, trailingWidth, this.#direction, null, this.#orientation);
  }

  #createUntabbedLine(start: number, length: number, signal?: AbortSignal): TFXLine {
    signal?.throwIfAborted();
    const end = start + length;
    const text = this.#input.text;
    if (length < 0 || !isTFXStringBoundary(text, start) || !isTFXStringBoundary(text, end)) throw new RangeError("Invalid line range.");
    const content = text.slice(start, end).replace(/[\r\n\u000b\u000c\u0085\u2028\u2029]+$/u, "");
    const { levels } = bidi.getEmbeddingLevels(content, this.#direction);
    const scripts = scriptsForText(content);
    let logical: TFXLogicalRun[] = [];
    const resolved: TFXTextAttributes[] = [];
    for (const run of this.#input.runs) {
      signal?.throwIfAborted();
      if (!run.fallbackFonts) { resolved.push(run); continue; }
      const begin = Math.max(start, run.start), finish = Math.min(start + content.length, run.end);
      for (const segment of graphemes.segment(text.slice(begin, finish))) {
        const font = run.fallbackFonts.fontForText(segment.segment, run.font) ?? run.font;
        const segmentStart = begin + segment.index, segmentEnd = segmentStart + segment.segment.length;
        const previous = resolved[resolved.length - 1];
        if (previous && previous.end === segmentStart && sameResolvedAttributes(previous, { ...run, font })) resolved[resolved.length - 1] = { ...previous, end: segmentEnd };
        else resolved.push({ ...run, start: segmentStart, end: segmentEnd, font });
      }
    }
    for (const attributes of resolved) {
      let cursor = Math.max(start, attributes.start);
      const finish = Math.min(start + content.length, attributes.end);
      if (attributes.rubyAnnotation && cursor < finish) {
        const level = levels[cursor - start] ?? 0;
        const script = scripts[cursor - start];
        for (let index = cursor + 1; index < finish; index += 1) {
          if ((levels[index - start] ?? 0) !== level || scripts[index - start] !== script) throw new DOMException("A ruby base range may not cross bidi or script boundaries.", "NotSupportedError");
        }
        logical.push({ start: cursor, end: finish, level, script, attributes });
        continue;
      }
      while (cursor < finish) {
        signal?.throwIfAborted();
        const level = levels[cursor - start] ?? 0;
        const script = scripts[cursor - start];
        let next = cursor + 1;
        while (next < finish && (levels[next - start] ?? 0) === level && scripts[next - start] === script) next++;
        logical.push({ start: cursor, end: next, level, script, attributes });
        cursor = next;
      }
    }
    logical = expandVerticalLogicalRuns(logical, text, this.#orientation);
    const maximum = Math.max(0, ...logical.map(run => run.level));
    const minimumOdd = Math.min(Infinity, ...logical.filter(run => run.level % 2).map(run => run.level));
    for (let level = maximum; level >= minimumOdd; level--) {
      for (let i = 0; i < logical.length;) {
        if (logical[i].level < level) { i++; continue; }
        let j = i + 1;
        while (j < logical.length && logical[j].level >= level) j++;
        logical.splice(i, j - i, ...logical.slice(i, j).reverse()); i = j;
      }
    }
    let x = 0;
    const runs: TFXPositionedGlyphRun[] = logical.map(run => {
      const upright = run.verticalPresentation === "upright" || (run.verticalPresentation === undefined && run.attributes.verticalForms);
      const direction = this.#orientation === "vertical" && (upright || run.attributes.runDelegate)
        ? (run.level % 2 ? "btt" as const : "ttb" as const)
        : (run.level % 2 ? "rtl" as const : "ltr" as const);
      const shapingOptions = { direction, script: run.script, language: run.attributes.language, features: run.attributes.features };
      const delegate = run.attributes.runDelegate;
      if (delegate) {
        const shaped = Object.freeze({
          text: "\uFFFC",
          direction,
          glyphs: Object.freeze([]),
          advance: Object.freeze(this.#orientation === "vertical" ? { width: 0, height: delegate.width } : { width: delegate.width, height: 0 }),
        });
        const result = { kind: "attachment" as const, start: run.start, end: run.end, x, font: run.attributes.font, shaped, delegate };
        x += delegate.width;
        return result;
      }
      const shaped = run.attributes.font.shape(text.slice(run.start, run.end), shapingOptions);
      const combined = this.#orientation === "vertical" && run.verticalPresentation === "combined";
      const combinedScale = combined
        ? Math.min(
            1,
            run.attributes.font.descriptor.size / Math.max(shaped.advance.width, 1e-9),
            run.attributes.font.descriptor.size / Math.max(run.attributes.font.ascent + run.attributes.font.descent, 1e-9),
          )
        : undefined;
      const naturalAdvance = combined ? run.attributes.font.descriptor.size : inlineAdvance(shaped);
      const rubyLayout = createRubyRuns({ attributes: run.attributes, direction, script: run.script }, naturalAdvance, this.#orientation, signal);
      const result = {
        kind: "glyph" as const,
        start: run.start,
        end: run.end,
        x: x + rubyLayout.baseOffset,
        font: run.attributes.font,
        shaped,
        shapingOptions,
        ...(run.verticalPresentation ? { verticalPresentation: run.verticalPresentation } : {}),
        ...(combined ? { inlineAdvanceOverride: naturalAdvance, combinedScale } : {}),
        ...(rubyLayout.ruby.length ? { ruby: rubyLayout.ruby } : {}),
      };
      x += rubyLayout.cellWidth;
      return result;
    });
    let minimumRuby = 0;
    for (const run of runs) for (const ruby of run.ruby ?? []) minimumRuby = Math.min(minimumRuby, run.x + ruby.inlineOffset);
    if (minimumRuby < 0) {
      for (let index = 0; index < runs.length; index += 1) runs[index] = { ...runs[index]!, x: runs[index]!.x - minimumRuby };
    }
    const trailing = content.match(/\s+$/u)?.[0] ?? "";
    const trailingStart = start + content.length - trailing.length;
    const trailingWidth = runs.reduce((width, run) => width + run.shaped.glyphs.reduce((sum, glyph) =>
      sum + (run.start + glyph.cluster >= trailingStart ? glyphInlineAdvance(glyph, run.shaped.direction) : 0), 0), 0);
    return new TFXLine(start, end, runs, trailingWidth, this.#direction, null, this.#orientation);
  }
  suggestLineBreak(start: number, width: number, signal?: AbortSignal): number {
    signal?.throwIfAborted();
    const text = this.#input.text;
    if (!isTFXStringBoundary(text, start) || !Number.isFinite(width) || width < 0) throw new RangeError("Invalid line start or width.");
    if (start === text.length) return 0;
    const suffix = text.slice(start);
    const breaker = new LineBreaker(suffix);
    let accepted = 0;
    const atomicEnd = (candidate: number) => {
      const absolute = start + candidate;
      const ruby = this.#input.runs.find(run => run.rubyAnnotation && absolute > run.start && absolute < run.end);
      return adjustedBreakCandidate(this.#input, start, ruby ? ruby.end - start : candidate);
    };
    let lastCandidate = -1;
    for (let next = breaker.nextBreak(); next; next = breaker.nextBreak()) {
      signal?.throwIfAborted();
      const candidate = atomicEnd(next.position);
      if (candidate === lastCandidate) continue;
      lastCandidate = candidate;
      if (this.createLine(start, candidate, signal).width > width) break;
      accepted = candidate;
      if (next.required) return accepted;
    }
    if (accepted) return accepted;
    // A too-wide LineBreaker candidate must not suppress the policy-adjusted
    // forced grapheme candidate used when no natural break fits.
    lastCandidate = -1;
    for (const segment of graphemes.segment(suffix)) {
      signal?.throwIfAborted();
      const end = atomicEnd(segment.index + segment.segment.length);
      if (end === lastCandidate) continue;
      lastCandidate = end;
      if (accepted && this.createLine(start, end, signal).width > width) break;
      accepted = end;
      if (this.createLine(start, end, signal).width > width) break;
    }
    return accepted;
  }
}
