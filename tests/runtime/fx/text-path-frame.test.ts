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
import { GFXPath } from "../../../src/FX/GraphicsFX/public";
import { TFXAttributedString, TFXFont, TFXFontDescriptor, TFXFramesetter } from "../../../src/FX/TextFX/public";

const loadFont = () => TFXFont.create(
  new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")),
  new TFXFontDescriptor({ size: 12 }),
);

describe("TextFX path frames", () => {
  it("fits full typographic bands inside a curved frame", async () => {
    const font = await loadFont();
    try {
      const path = GFXPath.ellipse({ x: 0, y: 0, width: 220, height: 100 });
      const text = "curved frame words ".repeat(20);
      const frame = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createFrame({ path, pathFillRule: "nonzero" });
      expect(frame.path).toBe(path);
      expect(frame.bounds).toEqual(path.bounds);
      expect(frame.lines.length).toBeGreaterThan(2);
      for (const { line, origin } of frame.lines) {
        const top = origin.y - line.ascent;
        const bottom = origin.y + line.descent;
        for (const y of [top + 0.0625, bottom - 0.0625]) {
          expect(path.contains({ x: origin.x, y }, "nonzero")).toBe(true);
          expect(path.contains({ x: origin.x + line.width - line.trailingWhitespaceWidth, y }, "nonzero")).toBe(true);
        }
      }
    } finally { font.dispose(); }
  });

  it("honours even-odd holes and disjoint RTL island order", async () => {
    const font = await loadFont();
    try {
      const outer = GFXPath.rect({ x: 0, y: 0, width: 200, height: 80 });
      const hole = GFXPath.rect({ x: 70, y: 0, width: 60, height: 80 });
      const path = outer.append(hole);
      const text = "words ".repeat(40);
      const frame = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createFrame({ path, pathFillRule: "evenodd" });
      expect(frame.lines.some(({ origin }) => origin.x < 70)).toBe(true);
      expect(frame.lines.some(({ origin }) => origin.x >= 130)).toBe(true);
      expect(frame.lines.every(({ origin, line }) => origin.x + line.width <= 70 + 1e-9 || origin.x >= 130 - 1e-9)).toBe(true);

      const rtl = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]), "rtl").createFrame({ path, pathFillRule: "evenodd" });
      expect(rtl.lines[0]!.origin.x).toBeGreaterThanOrEqual(130);
    } finally { font.dispose(); }
  });

  it("keeps rectangular options compatible and rejects invalid path geometry", async () => {
    const font = await loadFont();
    try {
      const text = "rectangle compatibility";
      const setter = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]));
      const bounds = { x: 2, y: 3, width: 180, height: 50 };
      const rectangular = setter.createFrame({ bounds });
      const pathFrame = setter.createFrame({ path: GFXPath.rect(bounds) });
      expect(pathFrame.lines.map(({ origin, line }) => [origin.x, origin.y, line.start, line.end])).toEqual(
        rectangular.lines.map(({ origin, line }) => [origin.x, origin.y, line.start, line.end]),
      );
      expect(() => setter.createFrame({ path: new GFXPath() })).toThrow(/non-empty area/i);
      expect(() => setter.createFrame({ path: GFXPath.rect(bounds), pathFillRule: "invalid" as never })).toThrow(/fill rule/i);
    } finally { font.dispose(); }
  });

  it("handles a self-intersecting contour deterministically and honours cancellation", async () => {
    const font = await loadFont();
    try {
      const bowTie = new GFXPath().move({ x: 0, y: 0 }).line({ x: 120, y: 100 })
        .line({ x: 0, y: 100 }).line({ x: 120, y: 0 }).close();
      const text = "سلام multilingual path ".repeat(12);
      const setter = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]));
      const frame = setter.createFrame({ path: bowTie, pathFillRule: "evenodd" });
      expect(frame.lines.length).toBeGreaterThan(0);
      for (const { origin, line } of frame.lines) {
        const y = origin.y;
        expect(bowTie.contains({ x: origin.x, y }, "evenodd")).toBe(true);
        expect(bowTie.contains({ x: origin.x + line.width - line.trailingWhitespaceWidth, y }, "evenodd")).toBe(true);
      }
      const controller = new AbortController();
      controller.abort(new DOMException("cancelled", "AbortError"));
      expect(() => setter.createFrame({ path: bowTie, signal: controller.signal })).toThrow(/cancelled/i);
    } finally { font.dispose(); }
  });
});
