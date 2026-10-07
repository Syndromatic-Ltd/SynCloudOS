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
import { TFXFont, TFXFontDescriptor, TFXFontCollection, TFXAttributedString, TFXTypesetter } from "../../../src/FX/TextFX/public";

async function font(path: string) {
  return TFXFont.create(new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${path}`)), new TFXFontDescriptor({ size: 18 }));
}

it("selects complete graphemes from the declared cascade and retains real glyph clusters", async () => {
  const latin = await font("notosans-NotoSans[wdth,wght].ttf");
  const arabic = await font("notosansarabic-NotoSansArabic[wdth,wght].ttf");
  const text = "hello مرحبًا";
  const collection = new TFXFontCollection([latin, arabic]);
  const setter = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: latin, fallbackFonts: collection }]));
  const line = setter.createLine(0, text.length);
  expect(line.runs.some(run => run.font === arabic)).toBe(true);
  expect(line.runs.flatMap(run => run.shaped.glyphs).every(glyph => glyph.id > 0)).toBe(true);
  expect(collection.matchingFontDescriptors({ family: arabic.familyName })).toHaveLength(1);
  expect(collection.fontForText("😀")).toBeNull();
  latin.dispose(); arabic.dispose();
});

it("applies selected OpenType features to the actual shaper and rejects malformed settings", async () => {
  const latin = await font("notosans-NotoSans[wdth,wght].ttf");
  expect(latin.shape("office").glyphs.length).toBeLessThan(6);
  expect(latin.shape("office", { features: { liga: 0 } }).glyphs).toHaveLength(6);
  expect(() => latin.shape("office", { features: { invalid: 1 } })).toThrow(TypeError);
  expect(() => latin.shape("office", { features: { liga: NaN } })).toThrow(TypeError);
  latin.dispose();
});
