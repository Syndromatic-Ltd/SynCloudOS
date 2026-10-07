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
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXLine, TFXTypesetter } from "../../../src/FX/TextFX/public";

const loadFont = (file: string, size = 18) => TFXFont.create(
  new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${file}`)),
  new TFXFontDescriptor({ size }),
);

describe("TextFX line caret offsets", () => {
  it("uses real ligature carets and accepts an index inside a combining cluster", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "office e\u0301";
      const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      const ligature = line.runs.flatMap((run) => run.shaped.glyphs).find((glyph) => glyph.cluster === 1)!;
      expect(ligature.ligatureCaretOffsets).toHaveLength(2);
      const ffiStart = line.offsetForStringIndex(1).primary;
      const firstCaret = line.offsetForStringIndex(2).primary;
      const secondCaret = line.offsetForStringIndex(3).primary;
      const ffiEnd = line.offsetForStringIndex(4).primary;
      expect(ffiStart).toBeLessThan(firstCaret);
      expect(firstCaret).toBeLessThan(secondCaret);
      expect(secondCaret).toBeLessThan(ffiEnd);
      expect(line.stringIndexForPosition(firstCaret)).toBe(2);
      expect(line.stringIndexForPosition(secondCaret)).toBe(3);

      const combiningMarkIndex = text.indexOf("\u0301");
      expect(() => line.offsetForStringIndex(combiningMarkIndex)).not.toThrow();
      expect(line.offsetForStringIndex(combiningMarkIndex).primary).toBe(line.offsetForStringIndex(combiningMarkIndex - 1).primary);
      expect(() => line.offsetForStringIndex(text.length + 1)).toThrow(RangeError);
    } finally { font.dispose(); }
  });

  it("returns a distinct secondary offset only at a bidi ambiguity", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "abc אבג";
      const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]), "ltr").createLine(0, text.length);
      const boundary = text.indexOf("א");
      const offsets = line.offsetForStringIndex(boundary);
      expect(offsets.primary).not.toBe(offsets.secondary);
      expect(line.stringIndexForPosition(offsets.primary)).toBe(boundary);
      expect(line.stringIndexForPosition(offsets.secondary)).toBe(boundary);
      expect(line.offsetForStringIndex(1).secondary).toBe(line.offsetForStringIndex(1).primary);

      const enumerated: Array<{ offset: number; stringIndex: number; leadingEdge: boolean }> = [];
      line.enumerateCaretOffsets((caret) => { enumerated.push(caret); });
      expect(enumerated.map((caret) => caret.offset)).toEqual([...enumerated].map((caret) => caret.offset).sort((a, b) => a - b));
      expect(enumerated.filter((caret) => caret.stringIndex === boundary)).toHaveLength(2);
      const stopped: number[] = [];
      line.enumerateCaretOffsets((caret) => { stopped.push(caret.stringIndex); return false; });
      expect(stopped).toHaveLength(1);
      const controller = new AbortController();
      controller.abort(new DOMException("cancelled", "AbortError"));
      expect(() => line.enumerateCaretOffsets(() => {}, controller.signal)).toThrow(/cancelled/i);
    } finally { font.dispose(); }
  });

  it("maps every omitted truncation index to the token boundary", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "a long office line for caret truncation";
      const source = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }])).createLine(0, 1);
      const line = source.createTruncatedLine(source.width * 0.55, "middle", token)!;
      const range = line.truncatedRange!;
      const expected = line.offsetForStringIndex(range.location);
      for (let index = range.location; index <= range.location + range.length; index += 1) {
        expect(line.offsetForStringIndex(index)).toEqual(expected);
      }
    } finally { font.dispose(); }
  });

  it("orders real RTL ligature carets and snaps an index inside a surrogate cluster", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf", 36);
    try {
      const rtlShape = font.shape("ffi", { direction: "rtl", script: "Latn" });
      const rtl = new TFXLine(0, 3, [{ kind: "glyph", start: 0, end: 3, x: 0, font, shaped: rtlShape }], 0, "rtl");
      const offsets = [0, 1, 2, 3].map((index) => rtl.offsetForStringIndex(index).primary);
      expect(rtlShape.glyphs.some((glyph) => glyph.ligatureCaretOffsets?.length)).toBe(true);
      expect(offsets[0]).toBeGreaterThan(offsets[1]!);
      expect(offsets[1]).toBeGreaterThan(offsets[2]!);
      expect(offsets[2]).toBeGreaterThan(offsets[3]!);

      const text = "A😀B";
      const surrogate = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
      expect(surrogate.offsetForStringIndex(2)).toEqual(surrogate.offsetForStringIndex(1));
    } finally { font.dispose(); }
  });

  it("keeps mixed-bidi truncation carets ordered and bounds repeated logical queries", async () => {
    const font = await loadFont("notosans-NotoSans[wdth,wght].ttf", 9);
    try {
      const mixedText = "abc אבג prefix middle suffix xyz";
      const source = new TFXTypesetter(new TFXAttributedString(mixedText, [{ start: 0, end: mixedText.length, font }])).createLine(0, mixedText.length);
      const token = new TFXTypesetter(new TFXAttributedString("…", [{ start: 0, end: 1, font }])).createLine(0, 1);
      const truncated = source.createTruncatedLine(source.width * 0.82, "middle", token)!;
      expect(new Set(truncated.runs.filter((run) => run.kind === "glyph").map((run) => run.shaped.direction))).toEqual(new Set(["ltr", "rtl"]));
      const visual: number[] = [];
      truncated.enumerateCaretOffsets((caret) => { visual.push(caret.offset); });
      expect(visual).toEqual([...visual].sort((left, right) => left - right));
      const omitted = truncated.truncatedRange!;
      expect(truncated.offsetForStringIndex(omitted.location)).toEqual(truncated.offsetForStringIndex(omitted.location + omitted.length));

      const boundedText = `a${"\u0301".repeat(65_535)}`;
      const bounded = new TFXTypesetter(new TFXAttributedString(boundedText, [{ start: 0, end: boundedText.length, font }])).createLine(0, boundedText.length);
      for (let index = 0; index < boundedText.length; index += 1) {
        expect(bounded.offsetForStringIndex(index)).toEqual(bounded.offsetForStringIndex(0));
      }
      expect(bounded.offsetForStringIndex(boundedText.length).primary).toBeGreaterThan(bounded.offsetForStringIndex(0).primary);
    } finally { font.dispose(); }
  });
});
