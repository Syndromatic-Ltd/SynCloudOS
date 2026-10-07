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
import { expect, it } from "vitest";
import { TFXFont, TFXFontDescriptor } from "../../../src/FX/TextFX/public";

const fontBytes = (family: string, name: string) => new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${family}-${name}[wdth,wght].ttf`));

it("shapes true ligature glyphs with UTF-16 clusters and immutable positions", async () => {
  const font = await TFXFont.create(fontBytes("notosans", "NotoSans"), new TFXFontDescriptor({ size: 20 }));
  const run = font.shape("office");
  expect(run.glyphs.length).toBeLessThan(6);
  expect(run.glyphs.every(glyph => glyph.id > 0)).toBe(true);
  expect(run.glyphs.map(glyph => glyph.cluster)).toContain(1);
  expect(Object.isFrozen(run.glyphs[0])).toBe(true);
  expect(run.advance.width).toBeGreaterThan(20);
  expect(font.glyphPath(run.glyphs[0].id)).toMatch(/[MLQC]/);
  font.dispose();
  expect(() => font.shape("x")).toThrow(/disposed/);
});

it("preserves Arabic and Indic clusters rather than returning codepoint IDs", async () => {
  for (const [family, name, text, direction] of [
    ["notosansarabic", "NotoSansArabic", "مرحبا", "rtl"],
    ["notosansdevanagari", "NotoSansDevanagari", "नमस्ते", "ltr"],
  ] as const) {
    const font = await TFXFont.create(fontBytes(family, name), new TFXFontDescriptor({ size: 18 }));
    const run = font.shape(text, { direction });
    expect(run.glyphs.every(glyph => glyph.id > 0 && glyph.cluster < text.length)).toBe(true);
    expect(run.direction).toBe(direction);
    expect(font.supportsCodePoint(text.codePointAt(0)!)).toBe(true);
    font.dispose();
  }
});

it("rejects malformed fonts, invalid sizes and out-of-range variations", async () => {
  expect(() => new TFXFontDescriptor({ size: Number.NaN })).toThrow();
  await expect(TFXFont.create(new Uint8Array([0, 1]), new TFXFontDescriptor({ size: 12 }))).rejects.toThrow();
  await expect(TFXFont.create(fontBytes("notosans", "NotoSans"), new TFXFontDescriptor({ size: 12, variations: { wght: -1 } }))).rejects.toThrow(/variation/i);
});
