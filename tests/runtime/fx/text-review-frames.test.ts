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
import { TFXFont, TFXFontDescriptor, TFXFontCollection, TFXAttributedString, TFXFramesetter, TFXGlyphDrawing, TFXParagraphStyle } from "../../../src/FX/TextFX/public";
const font = (file: string, size: number) => TFXFont.create(new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${file}`)), new TFXFontDescriptor({ size }));
const latinFile = "notosans-NotoSans[wdth,wght].ttf", arabicFile = "notosansarabic-NotoSansArabic[wdth,wght].ttf";

it("keeps RTL visible glyphs inside the right edge when trailing spaces are on the visual left", async () => {
  const arabic = await font(arabicFile, 18), text = "مرحبا ";
  const frame = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: arabic }]), "rtl").createFrame({ bounds: { x: 0, y: 0, width: 100, height: 60 } });
  const fragment = frame.lines[0];
  const paths = TFXGlyphDrawing.pathsForLine(fragment.line, fragment.origin).filter(value => value.path.commands.length);
  expect(Math.max(...paths.map(value => value.path.bounds.x + value.path.bounds.width))).toBeLessThanOrEqual(100);
  arabic.dispose();
});

it("skips an exclusion fragment too narrow for its first grapheme", async () => {
  const f = await font(latinFile, 20);
  const frame = new TFXFramesetter(new TFXAttributedString("WWW", [{ start: 0, end: 3, font: f }])).createFrame({ bounds: { x: 0, y: 0, width: 100, height: 100 }, exclusions: [{ x: 5, y: 0, width: 45, height: 100 }] });
  expect(frame.lines[0].line.start).toBe(0);
  expect(frame.lines.every(fragment => fragment.origin.x >= 50)).toBe(true);
  f.dispose();
});

it("treats Unicode paragraph separators as paragraph boundaries with spacing", async () => {
  const f = await font(latinFile, 20), text = "a\u2029b";
  const paragraphStyle = new TFXParagraphStyle({ paragraphSpacingBefore: 7, paragraphSpacing: 10 });
  const frame = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: f, paragraphStyle }])).createFrame({ bounds: { x: 0, y: 0, width: 100, height: 150 } });
  expect(frame.lines).toHaveLength(2);
  expect(frame.lines[1].origin.y - frame.lines[0].origin.y).toBeCloseTo(f.ascent + f.descent + f.leading + 17);
  f.dispose();
});

it("fits a small first line even when a later paragraph uses a larger font", async () => {
  const small = await font(latinFile, 12), large = await font(latinFile, 100);
  const frame = new TFXFramesetter(new TFXAttributedString("ok\nX", [{ start: 0, end: 3, font: small }, { start: 3, end: 4, font: large }])).createFrame({ bounds: { x: 0, y: 0, width: 100, height: 30 } });
  expect(frame.lines).toHaveLength(1);
  expect(frame.lines[0].line.end).toBe(3);
  expect(frame.lines[0].origin.y).toBeCloseTo(small.ascent);
  small.dispose(); large.dispose();
});

it("uses resolved fallback metrics to reject overflow and position the baseline", async () => {
  const small = await font(latinFile, 12), arabic = await font(arabicFile, 18);
  const text = "مرحبا", input = new TFXAttributedString(text, [{ start: 0, end: text.length, font: small, fallbackFonts: new TFXFontCollection([arabic]) }]);
  const setter = new TFXFramesetter(input, "rtl");
  expect(setter.createFrame({ bounds: { x: 0, y: 0, width: 100, height: 20 } }).lines).toHaveLength(0);
  const frame = setter.createFrame({ bounds: { x: 0, y: 0, width: 100, height: 60 } });
  expect(frame.lines).toHaveLength(1);
  expect(frame.lines[0].origin.y).toBeCloseTo(arabic.ascent);
  small.dispose(); arabic.dispose();
});

it("visits the right exclusion interval first for an RTL paragraph", async () => {
  const arabic = await font(arabicFile, 18), text = "مرحبا مرحبا مرحبا مرحبا";
  const frame = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font: arabic }]), "rtl").createFrame({ bounds: { x: 0, y: 0, width: 200, height: 50 }, exclusions: [{ x: 80, y: 0, width: 40, height: 50 }] });
  expect(frame.lines.length).toBeGreaterThanOrEqual(2);
  expect(frame.lines[0].line.start).toBe(0);
  expect(frame.lines[0].origin.x).toBeGreaterThanOrEqual(120);
  expect(frame.lines[1].origin.x).toBeLessThan(80);
  arabic.dispose();
});
