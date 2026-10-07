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
import { TFXFont, TFXFontDescriptor, TFXAttributedString, TFXTypesetter, TFXFramesetter, TFXParagraphStyle } from "../../../src/FX/TextFX/public";
async function font() { return TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 16 })); }

it("applies paragraph spacing once when exclusions block its first row", async () => {
  const f = await font(), text = "hello";
  const paragraphStyle = new TFXParagraphStyle({ paragraphSpacingBefore: 7 });
  const input = new TFXAttributedString(text, [{ start: 0, end: text.length, font: f, paragraphStyle }]);
  const rowHeight = f.ascent + f.descent + f.leading;
  const frame = new TFXFramesetter(input).createFrame({ bounds: { x: 0, y: 0, width: 200, height: 200 }, exclusions: [{ x: 0, y: 7, width: 200, height: rowHeight }] });
  expect(frame.lines[0].origin.y).toBeCloseTo(7 + rowHeight + f.ascent);
  f.dispose();
});

it("justifies actual whitespace advances without changing glyph IDs or input clusters", async () => {
  const f = await font(), text = "one two three";
  const line = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: f }])).createLine(0, text.length);
  const expanded = line.createJustifiedLine(1, line.width + 40)!;
  expect(expanded.width).toBeCloseTo(line.width + 40);
  expect(expanded.runs.flatMap(run => run.shaped.glyphs.map(g => [g.id, g.cluster]))).toEqual(line.runs.flatMap(run => run.shaped.glyphs.map(g => [g.id, g.cluster])));
  expect(expanded.stringIndexForPosition(expanded.width)).toBe(text.length);
  expect(() => line.createJustifiedLine(2, 100)).toThrow(RangeError);
  f.dispose();
});

it("positions real lines using paragraph alignment, indents and inter-paragraph spacing", async () => {
  const f = await font(), text = "short\nnext";
  const paragraphStyle = new TFXParagraphStyle({ alignment: "right", firstLineHeadIndent: 12, tailIndent: 8, paragraphSpacing: 10 });
  const frame = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: f, paragraphStyle }])).createFrame({ bounds: { x: 0, y: 0, width: 200, height: 150 } });
  expect(frame.lines).toHaveLength(2);
  expect(frame.lines[0].origin.x + frame.lines[0].line.width).toBeCloseTo(192);
  expect(frame.lines[1].origin.y - frame.lines[0].origin.y).toBeCloseTo(f.ascent + f.descent + f.leading + 10);
  expect(() => new TFXParagraphStyle({ firstLineHeadIndent: -1 })).toThrow(RangeError);
  f.dispose();
});
