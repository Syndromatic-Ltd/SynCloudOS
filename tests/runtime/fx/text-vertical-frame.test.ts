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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GFXPath } from "../../../src/FX/GraphicsFX/public";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXFramesetter, TFXGlyphDrawing, TFXParagraphStyle, TFXTypesetter } from "../../../src/FX/TextFX/public";

const fixture = "tests/fixtures/fx/fonts/notosansjp-vertical-subset.ttf";
const font = () => TFXFont.create(new Uint8Array(readFileSync(fixture)), new TFXFontDescriptor({ size: 20 }));
const arabicFont = () => TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosansarabic-NotoSansArabic[wdth,wght].ttf")), new TFXFontDescriptor({ size: 20 }));

describe("TextFX vertical progression", () => {
  it("uses real TTB vertical forms and explicit screen-y-down glyph placement", async () => {
    const value = await font();
    try {
      const text = "日本「A」";
      const attributes = [{ start: 0, end: text.length, font: value, language: "ja", verticalForms: true }];
      const vertical = new TFXTypesetter(new TFXAttributedString(text, attributes), "ltr", "vertical").createLine(0, text.length);
      const horizontal = new TFXTypesetter(new TFXAttributedString(text, attributes)).createLine(0, text.length);
      expect(vertical.orientation).toBe("vertical");
      expect(vertical.runs.every(run => run.shaped.direction === "ttb")).toBe(true);
      expect(vertical.runs.flatMap(run => run.shaped.glyphs).every(glyph => glyph.advance.y < 0)).toBe(true);
      const horizontalBracket = horizontal.runs.flatMap(run => run.shaped.glyphs).find(glyph => glyph.cluster === 2)!.id;
      const verticalBracket = vertical.runs.flatMap(run => run.shaped.glyphs).find(glyph => glyph.cluster === 2)!.id;
      expect(verticalBracket).not.toBe(horizontalBracket);
      const outlines = TFXGlyphDrawing.pathsForLine(vertical, { x: 50, y: 10 });
      expect(outlines.length).toBeGreaterThan(2);
      expect(outlines[1]!.path.bounds.y).toBeGreaterThan(outlines[0]!.path.bounds.y);

      const sideText = new TFXAttributedString("A", [{ start: 0, end: 1, font: value }]);
      const flat = new TFXTypesetter(sideText).createLine(0, 1);
      const sideways = new TFXTypesetter(sideText, "ltr", "vertical").createLine(0, 1);
      const flatBounds = TFXGlyphDrawing.pathsForLine(flat)[0]!.path.bounds;
      const sideBounds = TFXGlyphDrawing.pathsForLine(sideways)[0]!.path.bounds;
      expect(sideBounds.width).toBeCloseTo(flatBounds.height, 6);
      expect(sideBounds.height).toBeCloseTo(flatBounds.width, 6);

      const mixedText = "日A本";
      const mixed = new TFXTypesetter(new TFXAttributedString(mixedText, [
        { start: 0, end: 1, font: value, verticalForms: true, language: "ja" },
        { start: 1, end: 2, font: value },
        { start: 2, end: 3, font: value, verticalForms: true, language: "ja" },
      ]), "ltr", "vertical").createLine(0, mixedText.length);
      expect(mixed.runs.map(run => run.shaped.direction)).toEqual(["ttb", "ltr", "ttb"]);
      expect(TFXGlyphDrawing.pathsForLine(mixed).map(outline => outline.stringIndex)).toEqual([0, 1, 2]);
    } finally { value.dispose(); }
  });

  it("stacks columns in both Apple frame progressions and round-trips vertical carets", async () => {
    const value = await font();
    try {
      const text = "日本かな、日本かな。".repeat(8);
      const input = new TFXAttributedString(text, [{ start: 0, end: text.length, font: value, language: "ja", verticalForms: true }]);
      const setter = new TFXFramesetter(input);
      const right = setter.createFrame({ bounds: { x: 0, y: 0, width: 100, height: 100 }, progression: "rightToLeft" });
      const left = setter.createFrame({ bounds: { x: 0, y: 0, width: 100, height: 100 }, progression: "leftToRight" });
      expect(right.lines.length).toBeGreaterThan(1);
      expect(right.lines[1]!.origin.x).toBeLessThan(right.lines[0]!.origin.x);
      expect(left.lines[1]!.origin.x).toBeGreaterThan(left.lines[0]!.origin.x);
      expect(right.progression).toBe("rightToLeft");
      const first = right.lines[0]!;
      const offset = first.line.offsetForStringIndex(first.line.end).primary;
      expect(right.stringIndexForPosition({ x: first.origin.x, y: first.origin.y + offset })).toBe(first.line.end);
      expect(TFXGlyphDrawing.pathsForFrame(right).length).toBeGreaterThan(0);

      const mixedText = "日本「A」。".repeat(8);
      const mixedAttributes = Array.from(mixedText, (character, index) => ({
        start: index, end: index + 1, font: value, language: "ja", verticalForms: character !== "A",
      }));
      const mixedFrame = new TFXFramesetter(new TFXAttributedString(mixedText, mixedAttributes)).createFrame({
        bounds: { x: 0, y: 0, width: 120, height: 100 }, progression: "rightToLeft",
      });
      expect(mixedFrame.lines.length).toBeGreaterThan(1);
      for (let index = 1; index < mixedFrame.lines.length; index += 1) {
        const rightColumn = mixedFrame.lines[index - 1]!, leftColumn = mixedFrame.lines[index]!;
        const rightInk = TFXGlyphDrawing.pathsForLine(rightColumn.line, rightColumn.origin).filter(outline => outline.path.bounds.width > 0);
        const leftInk = TFXGlyphDrawing.pathsForLine(leftColumn.line, leftColumn.origin).filter(outline => outline.path.bounds.width > 0);
        expect(rightColumn.origin.x - leftColumn.origin.x).toBeGreaterThanOrEqual(rightColumn.line.ascent + leftColumn.line.descent);
        expect(Math.max(...leftInk.map(outline => outline.path.bounds.x + outline.path.bounds.width)))
          .toBeLessThanOrEqual(Math.min(...rightInk.map(outline => outline.path.bounds.x)) + 1e-9);
      }
      const controller = new AbortController();
      controller.abort(new DOMException("cancelled", "AbortError"));
      expect(() => setter.createFrame({ bounds: { x: 0, y: 0, width: 100, height: 100 }, progression: "rightToLeft", signal: controller.signal })).toThrow(/cancelled/i);
    } finally { value.dispose(); }
  });

  it("fits vertical typographic bands through a curved path and preserves BTT ownership", async () => {
    const value = await font();
    try {
      const text = "日本かな。".repeat(12);
      const input = new TFXAttributedString(text, [{ start: 0, end: text.length, font: value, language: "ja", verticalForms: true }]);
      const path = GFXPath.ellipse({ x: 0, y: 0, width: 140, height: 180 });
      const frame = new TFXFramesetter(input).createFrame({ path, progression: "rightToLeft" });
      expect(frame.lines.length).toBeGreaterThan(1);
      expect(frame.lines.every(({ line }) => line.runs.every(run => run.shaped.direction === "ttb"))).toBe(true);
      for (const { origin, line } of frame.lines) {
        const left = origin.x - line.ascent + 0.0625, right = origin.x + line.descent - 0.0625;
        const top = origin.y, bottom = origin.y + line.width - line.trailingWhitespaceWidth;
        expect(path.contains({ x: left, y: top })).toBe(true);
        expect(path.contains({ x: right, y: top })).toBe(true);
        expect(path.contains({ x: left, y: bottom })).toBe(true);
        expect(path.contains({ x: right, y: bottom })).toBe(true);
      }
      const arabic = await arabicFont();
      try {
        const arabicText = "سلام";
        const btt = new TFXTypesetter(new TFXAttributedString(arabicText, [{ start: 0, end: arabicText.length, font: arabic, verticalForms: true }]), "rtl", "vertical").createLine(0, arabicText.length);
        expect(btt.runs.every(run => run.shaped.direction === "btt")).toBe(true);
        const start = btt.offsetForStringIndex(0).primary, end = btt.offsetForStringIndex(arabicText.length).primary;
        expect(start).toBeGreaterThan(end);

        const spacedText = "س ل ا م";
        const spacedInput = new TFXAttributedString(spacedText, [{ start: 0, end: spacedText.length, font: arabic, verticalForms: true }]);
        const spaced = new TFXTypesetter(spacedInput, "rtl", "vertical").createLine(0, spacedText.length);
        const justified = spaced.createJustifiedLine(1, spaced.width + 30)!;
        expect(justified.width).toBeCloseTo(spaced.width + 30);
        const sourceSpaces = spaced.runs.flatMap(run => run.shaped.glyphs.filter(glyph => spacedText[run.start + glyph.cluster] === " "));
        const justifiedSpaces = justified.runs.flatMap(run => run.shaped.glyphs.filter(glyph => spacedText[run.start + glyph.cluster] === " "));
        expect(justifiedSpaces.map(glyph => Math.abs(glyph.advance.y))).toEqual(sourceSpaces.map(glyph => Math.abs(glyph.advance.y) + 10));
        expect(justified.runs.flatMap(run => run.shaped.glyphs).every(glyph => -glyph.position.y >= 0 && -glyph.position.y <= justified.width)).toBe(true);

        const arabicPath = GFXPath.ellipse({ x: 0, y: 0, width: 140, height: 180 });
        const arabicFrame = new TFXFramesetter(spacedInput, "rtl").createFrame({ path: arabicPath, progression: "rightToLeft" });
        expect(arabicFrame.visibleRange.end).toBe(spacedText.length);
        for (const { origin, line } of arabicFrame.lines) {
          const left = origin.x - line.ascent + 0.0625, right = origin.x + line.descent - 0.0625;
          const top = origin.y, bottom = origin.y + line.width;
          expect(arabicPath.contains({ x: left, y: top })).toBe(true);
          expect(arabicPath.contains({ x: right, y: top })).toBe(true);
          expect(arabicPath.contains({ x: left, y: bottom })).toBe(true);
          expect(arabicPath.contains({ x: right, y: bottom })).toBe(true);
          for (let index = line.start; index <= line.end; index += 1) {
            const offset = line.offsetForStringIndex(index).primary;
            expect(offset).toBeGreaterThanOrEqual(0);
            expect(offset).toBeLessThanOrEqual(line.width);
            expect(arabicFrame.stringIndexForPosition({ x: origin.x, y: origin.y + offset })).toBe(index);
          }
        }
      } finally { arabic.dispose(); }
    } finally { value.dispose(); }
  });

  it("keeps tabs, justification and truncation on the vertical inline axis", async () => {
    const value = await font();
    try {
      const tabText = "日\t本";
      const style = new TFXParagraphStyle();
      const tabLine = new TFXTypesetter(new TFXAttributedString(tabText, [{ start: 0, end: tabText.length, font: value, verticalForms: true, paragraphStyle: style }]), "ltr", "vertical").createLine(0, tabText.length);
      expect(tabLine.runs.find(run => run.start === 2)!.x).toBeCloseTo(28);
      expect(tabLine.runs.find(run => run.kind === "tab")!.shaped.advance).toEqual({ width: 0, height: 8 });

      const spacedText = "日 日 日";
      const source = new TFXTypesetter(new TFXAttributedString(spacedText, [{ start: 0, end: spacedText.length, font: value, verticalForms: true }]), "ltr", "vertical").createLine(0, spacedText.length);
      const justified = source.createJustifiedLine(1, source.width + 20)!;
      expect(justified.width).toBeCloseTo(source.width + 20);
      expect(justified.runs.flatMap(run => run.shaped.glyphs).filter(glyph => glyph.cluster === 1 || glyph.cluster === 3).every(glyph => glyph.advance.y < -20)).toBe(true);

      const tokenText = "。";
      const token = new TFXTypesetter(new TFXAttributedString(tokenText, [{ start: 0, end: tokenText.length, font: value, verticalForms: true }]), "ltr", "vertical").createLine(0, tokenText.length);
      const truncated = source.createTruncatedLine(source.width * 0.65, "tail", token)!;
      expect(truncated.orientation).toBe("vertical");
      expect(truncated.width).toBeLessThanOrEqual(source.width * 0.65 + 1e-9);
      expect(truncated.runs.some(run => run.kind === "truncation-token")).toBe(true);
      const horizontalToken = new TFXTypesetter(new TFXAttributedString(tokenText, [{ start: 0, end: 1, font: value }])).createLine(0, 1);
      expect(() => source.createTruncatedLine(source.width * 0.65, "tail", horizontalToken)).toThrow(/orientation/i);
    } finally { value.dispose(); }
  });
});
