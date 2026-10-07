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
  TFXFontCollection,
  TFXFontDescriptor,
  TFXTypesetter,
  TFX_VERTICAL_ORIENTATION_UNICODE_VERSION,
  tfxVerticalOrientationForGrapheme,
} from "../../../src/FX/TextFX/public";

const fixture = (name: string, size = 20) =>
  TFXFont.create(
    new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${name}`)),
    new TFXFontDescriptor({ size }),
  );

describe("TextFX multilingual geometry", () => {
  it("uses pinned UAX #50 orientation data without replacing HarfBuzz glyph identity", async () => {
    expect(TFX_VERTICAL_ORIENTATION_UNICODE_VERSION).toMatch(/^17\./u);
    expect(tfxVerticalOrientationForGrapheme("日")).toBe("upright");
    expect(tfxVerticalOrientationForGrapheme("「")).toBe("upright");
    expect(tfxVerticalOrientationForGrapheme("A")).toBe("sideways");
    expect(tfxVerticalOrientationForGrapheme("😀")).toBe("upright");

    const font = await fixture("notosansjp-vertical-subset.ttf");
    try {
      const text = "日A「本";
      const line = new TFXTypesetter(new TFXAttributedString(text, [{
        start: 0,
        end: text.length,
        font,
        language: "ja",
        verticalOrientation: "auto",
      }]), "ltr", "vertical").createLine(0, text.length);
      expect(line.runs.map(run => run.verticalPresentation)).toEqual(["upright", "sideways", "upright"]);
      expect(line.runs.flatMap(run => run.shaped.glyphs).every(glyph => glyph.id > 0)).toBe(true);
    } finally {
      font.dispose();
    }
  });

  it("combines two ASCII digits into one upright vertical cell with stable grapheme carets", async () => {
    const font = await fixture("notosansjp-vertical-subset.ttf");
    try {
      const text = "日12本";
      const line = new TFXTypesetter(new TFXAttributedString(text, [{
        start: 0,
        end: text.length,
        font,
        language: "ja",
        verticalOrientation: "auto",
        textCombine: "digits2",
      }]), "ltr", "vertical").createLine(0, text.length);
      const combined = line.runs.find(run => run.start === 1 && run.end === 3);
      expect(combined?.verticalPresentation).toBe("combined");
      expect(combined?.shaped.text).toBe("12");
      expect(combined?.shaped.glyphs).toHaveLength(2);
      expect(combined?.inlineAdvanceOverride).toBeCloseTo(font.descriptor.size);
      const start = line.offsetForStringIndex(1).primary;
      const middle = line.offsetForStringIndex(2).primary;
      const end = line.offsetForStringIndex(3).primary;
      expect(start).toBeLessThan(middle);
      expect(middle).toBeLessThan(end);
      expect(end - start).toBeCloseTo(font.descriptor.size);

      const oneCell = new TFXTypesetter(new TFXAttributedString("12本", [{
        start: 0,
        end: 3,
        font,
        language: "ja",
        verticalOrientation: "auto",
        textCombine: "digits2",
      }]), "ltr", "vertical");
      expect(oneCell.suggestLineBreak(0, font.descriptor.size + 0.01)).toBe(2);
    } finally {
      font.dispose();
    }
  });

  it("distinguishes UTF-16 offsets, grapheme boundaries and HarfBuzz glyph indices", async () => {
    const latin = await fixture("notosans-NotoSans[wdth,wght].ttf");
    try {
      const text = "A👩‍💻B";
      const line = new TFXTypesetter(new TFXAttributedString(text, [{
        start: 0,
        end: text.length,
        font: latin,
      }])).createLine(0, text.length);
      const insideEmoji = line.textPositionForUTF16Offset(3);
      expect(insideEmoji.utf16Offset).toBe(3);
      expect(insideEmoji.graphemeBoundary).toBe(false);
      expect(insideEmoji.glyphIndices.every(Number.isSafeInteger)).toBe(true);
      const emojiStart = line.textPositionForUTF16Offset(1);
      expect(emojiStart.graphemeBoundary).toBe(true);
      expect(emojiStart.glyphIndices.length).toBeGreaterThan(0);
      const glyphCount = line.runs.reduce((count, run) => count + run.shaped.glyphs.length, 0);
      expect(emojiStart.glyphIndices.every(index => index >= 0 && index < glyphCount)).toBe(true);
    } finally {
      latin.dispose();
    }
  });

  it("uses actual fallback fonts for Arabic and Devanagari metrics without splitting graphemes", async () => {
    const primary = await fixture("notosansjp-vertical-subset.ttf", 14);
    const arabic = await fixture("notosansarabic-NotoSansArabic[wdth,wght].ttf", 28);
    const devanagari = await fixture("notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf", 24);
    try {
      const text = "x مرحبًا नमस्ते";
      const fallback = new TFXFontCollection([primary, arabic, devanagari]);
      const line = new TFXTypesetter(new TFXAttributedString(text, [{
        start: 0,
        end: text.length,
        font: primary,
        fallbackFonts: fallback,
      }])).createLine(0, text.length);
      expect(line.runs.some(run => run.font === arabic)).toBe(true);
      expect(line.runs.some(run => run.font === devanagari)).toBe(true);
      expect(line.ascent).toBeGreaterThan(primary.ascent);
      for (const segment of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
        expect(line.textPositionForUTF16Offset(segment.index).graphemeBoundary).toBe(true);
      }
    } finally {
      primary.dispose();
      arabic.dispose();
      devanagari.dispose();
    }
  });

  it("makes Japanese strict and loose line-break policy explicit", async () => {
    const font = await fixture("notosansjp-vertical-subset.ttf");
    try {
      const text = "あぁい";
      const firstWidth = new TFXTypesetter(new TFXAttributedString("あ", [{ start: 0, end: 1, font }])).createLine(0, 1).width;
      const strict = new TFXTypesetter(new TFXAttributedString(text, [{
        start: 0,
        end: text.length,
        font,
        language: "ja",
        lineBreakPolicy: "strict",
      }]));
      const loose = new TFXTypesetter(new TFXAttributedString(text, [{
        start: 0,
        end: text.length,
        font,
        language: "ja",
        lineBreakPolicy: "loose",
      }]));
      expect(strict.suggestLineBreak(0, firstWidth + 0.01)).toBe(2);
      expect(loose.suggestLineBreak(0, firstWidth + 0.01)).toBe(1);
    } finally {
      font.dispose();
    }
  });
});
