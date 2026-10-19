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
import { TFXFont, TFXFontDescriptor, TFXTypesetter, TFXAttributedString, TFXGlyphDrawing } from "../../../src/FX/TextFX/public";
import { GFXPath } from "../../../src/FX/GraphicsFX/GFXPath";

it("draws the original shaped glyph outlines at baseline positions without reshaping", async () => {
  const font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 20 }));
  const line = new TFXTypesetter(new TFXAttributedString("office", [{ start: 0, end: 6, font }])).createLine(0, 6);
  const paths = TFXGlyphDrawing.pathsForLine(line, { x: 10, y: 40 });
  expect(paths).toHaveLength(line.runs[0].shaped.glyphs.length);
  expect(paths.length).toBeLessThan(6);
  expect(paths.every(entry => entry.path instanceof GFXPath && entry.path.commands.length > 0)).toBe(true);
  expect(paths.map(entry => entry.glyphId)).toEqual(line.runs[0].shaped.glyphs.map(glyph => glyph.id));
  const first = paths[0].path.bounds;
  expect(first.y).toBeLessThan(40);
  expect(first.y + first.height).toBeLessThan(42);
  const shifted = TFXGlyphDrawing.pathsForLine(line, { x: 20, y: 50 })[0].path.bounds;
  expect(shifted.x - first.x).toBeCloseTo(10);
  expect(shifted.y - first.y).toBeCloseTo(10);
  expect(paths[0].embedding).toBe("allowed");
  font.dispose();
  expect(() => TFXGlyphDrawing.pathsForLine(line)).toThrow(expect.objectContaining({ code: "TFX_FONT_DISPOSED" }));
});
