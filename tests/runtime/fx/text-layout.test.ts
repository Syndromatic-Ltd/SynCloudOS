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
import { TFXFont, TFXFontDescriptor, TFXAttributedString, TFXTypesetter } from "../../../src/FX/TextFX/public";

async function font() {
  return TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 16 }));
}

it("preserves attributed UTF-16 ranges and breaks at actual shaped widths", async () => {
  const f = await font();
  const input = new TFXAttributedString("hello world hello", [{ start: 0, end: 17, font: f }]);
  const setter = new TFXTypesetter(input);
  const width = f.shape("hello ").advance.width + 1;
  const count = setter.suggestLineBreak(0, width);
  expect(count).toBe(6);
  const line = setter.createLine(0, count);
  expect(line.width).toBeLessThanOrEqual(width);
  expect(line.trailingWhitespaceWidth).toBeGreaterThan(0);
  expect(line.stringIndexForPosition(0)).toBe(0);
  expect(line.stringIndexForPosition(line.width + 10)).toBe(6);
  f.dispose();
});

it("rejects gaps, overlaps and surrogate-splitting attributed ranges", async () => {
  const f = await font();
  expect(() => new TFXAttributedString("abc", [{ start: 0, end: 2, font: f }])).toThrow();
  expect(() => new TFXAttributedString("a😀b", [{ start: 0, end: 2, font: f }, { start: 2, end: 4, font: f }])).toThrow();
  f.dispose();
});

it("fits long unbreakable words at grapheme boundaries and honors explicit newlines", async () => {
  const f = await font();
  const text = "abcdefgh\nlast";
  const setter = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: f }]));
  expect(setter.suggestLineBreak(0, 1)).toBe(1);
  expect(setter.suggestLineBreak(0, 1000)).toBe(9);
  expect(() => setter.suggestLineBreak(0, NaN)).toThrow();
  f.dispose();
});
