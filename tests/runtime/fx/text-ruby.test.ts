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
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXFramesetter,
  TFXGlyphDrawing,
  TFXRubyAnnotation,
  TFXTypesetter,
} from "../../../src/FX/TextFX/public";

const japaneseFont = () => TFXFont.create(
  new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosansjp-vertical-subset.ttf")),
  new TFXFontDescriptor({ size: 20 }),
);
const arabicFont = () => TFXFont.create(
  new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosansarabic-NotoSansArabic[wdth,wght].ttf")),
  new TFXFontDescriptor({ size: 20 }),
);

describe("TextFX ruby annotations", () => {
  it("owns bounded Core Text-style values across all portable positions", async () => {
    const annotation = new TFXRubyAnnotation({
      alignment: "distributeSpace",
      overhang: "none",
      sizeFactor: 0.5,
      text: { before: "にほん", after: "Japan" },
    });
    expect(Object.isFrozen(annotation)).toBe(true);
    expect(annotation).toMatchObject({ alignment: "distributeSpace", overhang: "none", sizeFactor: 0.5 });
    expect(annotation.textForPosition("before")).toBe("にほん");
    expect(annotation.textForPosition("inline")).toBeNull();
    expect(() => new TFXRubyAnnotation({ sizeFactor: 0, text: { before: "x" } })).toThrow(/size factor/i);
    expect(() => new TFXRubyAnnotation({ text: {} })).toThrow(/requires text/i);

    const value = await japaneseFont();
    try {
      const inline = new TFXTypesetter(new TFXAttributedString("日", [{ start: 0, end: 1, font: value, rubyAnnotation: new TFXRubyAnnotation({ text: { inline: "にち" } }) }])).createLine(0, 1);
      expect(inline.runs[0]!.ruby?.map((entry) => entry.position)).toEqual(["inline"]);
      const lineEdge = new TFXTypesetter(new TFXAttributedString("日", [{ start: 0, end: 1, font: value, rubyAnnotation: new TFXRubyAnnotation({ alignment: "lineEdge", text: { before: "にち" } }) }])).createLine(0, 1);
      expect(lineEdge.runs[0]!.ruby?.[0]!.inlineOffset).toBeGreaterThanOrEqual(0);
      expect(() => new TFXAttributedString("日 本", [{ start: 0, end: 3, font: value, rubyAnnotation: annotation }])).toThrow(/non-whitespace/i);
      const mixedScript = new TFXAttributedString("日", [{ start: 0, end: 1, font: value, rubyAnnotation: new TFXRubyAnnotation({ text: { before: "日A" } }) }]);
      expect(() => new TFXTypesetter(mixedScript).createLine(0, 1)).toThrow(/script boundaries/i);
    } finally { value.dispose(); }
  });

  it("shapes real horizontal ruby glyphs while preserving every base caret", async () => {
    const value = await japaneseFont();
    try {
      const ruby = new TFXRubyAnnotation({ alignment: "distributeLetter", overhang: "none", sizeFactor: 0.5, text: { before: "日本" } });
      const attributed = new TFXAttributedString("日本", [{ start: 0, end: 2, font: value, language: "ja", rubyAnnotation: ruby }]);
      const line = new TFXTypesetter(attributed).createLine(0, 2);
      const plain = new TFXTypesetter(new TFXAttributedString("日本", [{ start: 0, end: 2, font: value, language: "ja" }])).createLine(0, 2);
      const positioned = line.runs[0]!.ruby![0]!;
      expect(positioned.shaped.glyphs.length).toBeGreaterThan(1);
      expect(positioned.shaped.glyphs.every(glyph => glyph.id > 0)).toBe(true);
      expect(positioned.glyphInlineOffsets.at(-1)).toBeGreaterThan(positioned.glyphInlineOffsets[0]!);
      expect(line.ascent).toBeGreaterThan(plain.ascent);
      expect(line.width).toBeGreaterThanOrEqual(plain.width);
      for (const index of [0, 1, 2]) {
        const offset = line.offsetForStringIndex(index).primary;
        expect(line.stringIndexForPosition(offset)).toBe(index);
      }
      const drawings = TFXGlyphDrawing.drawingsForLine(line, { x: 10, y: 50 });
      const base = drawings.filter(drawing => drawing.kind === "glyph");
      const annotation = drawings.filter(drawing => drawing.kind === "ruby");
      expect(annotation).toHaveLength(positioned.shaped.glyphs.length);
      expect(annotation.every(drawing => drawing.stringIndex === 0 && drawing.rubyPosition === "before")).toBe(true);
      expect(Math.max(...annotation.map(drawing => drawing.path.bounds.y))).toBeLessThan(Math.max(...base.map(drawing => drawing.path.bounds.y)));

      const spaced = new TFXTypesetter(new TFXAttributedString("日本 日", [
        { start: 0, end: 2, font: value, language: "ja", rubyAnnotation: ruby },
        { start: 2, end: 4, font: value, language: "ja" },
      ])).createLine(0, 4);
      const justified = spaced.createJustifiedLine(1, spaced.width + 10)!;
      expect(justified.runs.some(run => run.ruby?.[0]?.text === "日本")).toBe(true);
      expect(justified.width).toBeCloseTo(spaced.width + 10, 6);
    } finally { value.dispose(); }
  });

  it("applies alignment and overhang without replacing base-string ownership", async () => {
    const value = await japaneseFont();
    try {
      const make = (alignment: "start" | "center" | "end", overhang: "auto" | "none") => new TFXTypesetter(new TFXAttributedString("日", [{
        start: 0,
        end: 1,
        font: value,
        rubyAnnotation: new TFXRubyAnnotation({ alignment, overhang, sizeFactor: 0.6, text: { before: "日本日本" } }),
      }])).createLine(0, 1);
      const start = make("start", "auto"), center = make("center", "auto"), end = make("end", "auto"), none = make("center", "none");
      const relativeRubyX = (line: typeof start) => line.runs[0]!.ruby![0]!.inlineOffset;
      expect(relativeRubyX(start)).toBeGreaterThan(relativeRubyX(center));
      expect(relativeRubyX(center)).toBeGreaterThan(relativeRubyX(end));
      expect(none.width).toBeGreaterThanOrEqual(start.runs[0]!.ruby![0]!.width);
      expect(none.offsetForStringIndex(0).primary).toBeGreaterThanOrEqual(0);
      expect(none.offsetForStringIndex(1).primary).toBeLessThanOrEqual(none.width);
    } finally { value.dispose(); }
  });

  it("resolves start, end and named overhang against RTL and BTT inline direction", async () => {
    const value = await arabicFont();
    try {
      const make = (orientation: "horizontal" | "vertical", alignment: "start" | "end", overhang: "start" | "end") => {
        const annotation = new TFXRubyAnnotation({ alignment, overhang, sizeFactor: 0.5, text: { before: "تج".repeat(16) } });
        const input = new TFXAttributedString("س", [{ start: 0, end: 1, font: value, language: "ar", verticalForms: orientation === "vertical", rubyAnnotation: annotation }]);
        return new TFXTypesetter(input, "rtl", orientation).createLine(0, 1).runs[0]!.ruby![0]!.inlineOffset;
      };
      for (const orientation of ["horizontal", "vertical"] as const) {
        expect(make(orientation, "start", "start")).toBeGreaterThanOrEqual(0);
        expect(make(orientation, "end", "end")).toBeLessThan(0);
        expect(make(orientation, "start", "start")).toBeGreaterThan(make(orientation, "end", "end"));
      }
    } finally { value.dispose(); }
  });

  it("places before/after ruby on opposite sides of real vertical columns", async () => {
    const value = await japaneseFont();
    try {
      const annotation = new TFXRubyAnnotation({ sizeFactor: 0.5, text: { before: "日本", after: "日本" } });
      const input = new TFXAttributedString("日本語日本語", [
        { start: 0, end: 2, font: value, language: "ja", verticalForms: true, rubyAnnotation: annotation },
        { start: 2, end: 6, font: value, language: "ja", verticalForms: true },
      ]);
      const frame = new TFXFramesetter(input).createFrame({ bounds: { x: 0, y: 0, width: 100, height: 70 }, progression: "rightToLeft" });
      expect(frame.lines.length).toBeGreaterThan(0);
      const first = frame.lines[0]!;
      const ruby = first.line.runs.flatMap(run => run.ruby ?? []);
      expect(ruby.map(run => run.position)).toEqual(["before", "after"]);
      expect(ruby.find(run => run.position === "before")!.crossOffset).toBeGreaterThan(0);
      expect(ruby.find(run => run.position === "after")!.crossOffset).toBeLessThan(0);
      const outlines = TFXGlyphDrawing.drawingsForFrame(frame).filter(drawing => drawing.kind === "ruby");
      const before = outlines.filter(drawing => drawing.rubyPosition === "before");
      const after = outlines.filter(drawing => drawing.rubyPosition === "after");
      expect(Math.min(...before.map(drawing => drawing.path.bounds.x))).toBeGreaterThan(Math.min(...after.map(drawing => drawing.path.bounds.x)));
      expect(frame.lines.every(({ origin, line }) => origin.x - line.ascent >= -1e-9 && origin.x + line.descent <= 100 + 1e-9)).toBe(true);
    } finally { value.dispose(); }
  });

  it("keeps ruby bases atomic for wrapping/truncation but retains internal RTL carets", async () => {
    const value = await arabicFont();
    try {
      const ruby = new TFXRubyAnnotation({ alignment: "center", overhang: "auto", sizeFactor: 0.5, text: { before: "تج" } });
      const input = new TFXAttributedString("ساب", [
        { start: 0, end: 1, font: value, language: "ar" },
        { start: 1, end: 3, font: value, language: "ar", rubyAnnotation: ruby },
      ]);
      const typesetter = new TFXTypesetter(input, "rtl");
      expect(() => typesetter.createLine(0, 2)).toThrow(/split.*ruby/i);
      const line = typesetter.createLine(0, 3);
      for (const index of [1, 2, 3]) expect(line.offsetForStringIndex(index).primary).toBeGreaterThanOrEqual(0);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font: value }]), "rtl").createLine(0, 1);
      const narrow = line.createTruncatedLine(token.width + line.runs.find(run => run.start === 0)!.shaped.advance.width, "tail", token)!;
      expect(narrow.runs.some(run => run.ruby?.length)).toBe(false);
      expect(narrow.truncatedRange).toMatchObject({ location: 1, length: 2 });
      const retained = line.createTruncatedLine(line.runs.find(run => run.start === 0)!.shaped.advance.width + line.runs.find(run => run.ruby?.length)!.ruby![0]!.cellWidth, "head", token)!;
      expect(retained.runs.some(run => run.ruby?.[0]?.text === "تج")).toBe(true);
      expect(TFXGlyphDrawing.drawingsForLine(retained).some(drawing => drawing.kind === "ruby")).toBe(true);
      const controller = new AbortController();
      controller.abort(new DOMException("ruby drawing cancelled", "AbortError"));
      expect(() => TFXGlyphDrawing.drawingsForLine(line, undefined, controller.signal)).toThrow(/cancelled/i);
    } finally { value.dispose(); }
  });

  it("preflights ruby glyphs against the drawing limit before writing output", async () => {
    const value = await japaneseFont();
    try {
      const text = "日".repeat(40);
      const runs = Array.from({ length: text.length }, (_, index) => ({
        start: index,
        end: index + 1,
        font: value,
        language: "ja",
        rubyAnnotation: new TFXRubyAnnotation({ text: { before: "日".repeat(256) } }),
      }));
      const line = new TFXTypesetter(new TFXAttributedString(text, runs)).createLine(0, text.length);
      let writes = 0;
      expect(() => TFXGlyphDrawing.drawLine({ fill: () => { writes += 1; } }, line)).toThrow(/glyph.*limit/i);
      expect(writes).toBe(0);
    } finally { value.dispose(); }
  });
});
