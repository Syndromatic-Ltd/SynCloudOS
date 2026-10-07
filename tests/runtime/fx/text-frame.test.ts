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
import { TFXFont, TFXFontDescriptor, TFXAttributedString, TFXFramesetter } from "../../../src/FX/TextFX/public";

it("flows actual shaped lines around exclusions and reports unconsumed text", async () => {
  const font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 16 }));
  const text = "A long document with several words and multiple lines. ".repeat(10);
  const setter = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]));
  const frame = setter.createFrame({ bounds: { x: 0, y: 0, width: 220, height: 70 }, exclusions: [{ x: 0, y: 0, width: 80, height: 30 }] });
  expect(frame.lines.length).toBeGreaterThan(1);
  expect(frame.lines[0].origin.x).toBe(80);
  expect(frame.visibleRange.end).toBeLessThan(text.length);
  expect(frame.stringIndexForPosition(frame.lines[0].origin)).toBe(0);
  const next = setter.createFrame({ start: frame.visibleRange.end, bounds: { x: 0, y: 0, width: 220, height: 70 } });
  expect(next.visibleRange.start).toBe(frame.visibleRange.end);
  expect(next.visibleRange.end).toBeGreaterThan(frame.visibleRange.end);
  expect(() => setter.createFrame({ bounds: { x: 0, y: 0, width: -1, height: 20 } })).toThrow();
  font.dispose();
});
