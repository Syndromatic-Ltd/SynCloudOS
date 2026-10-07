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
import { GFXImage, GFXPath } from "../../../src/FX/GraphicsFX/public";
import {
  TFXAttributedString,
  TFXFont,
  TFXFontCollection,
  TFXFontDescriptor,
  TFXFramesetter,
  TFXGlyphDrawing,
  TFXRunDelegate,
  TFXTypesetter,
  type TFXTextAttributes,
} from "../../../src/FX/TextFX/public";

const font = () => TFXFont.create(
  new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")),
  new TFXFontDescriptor({ size: 20 }),
);
const image = (rgba = [20, 90, 180, 255]) => new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array(rgba) });
const attachment = (width = 24, ascent = 18, descent = 4, label = "Inline chart") =>
  new TFXRunDelegate({ width, ascent, descent, attachment: { image: image(), accessibilityLabel: label } });

describe("TextFX run-delegate attachments", () => {
  it("owns immutable metrics and accepts only one U+FFFC attributed range", async () => {
    const pixels = new Uint8Array([1, 2, 3, 255]);
    const owned = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: pixels });
    pixels[0] = 255;
    const delegate = new TFXRunDelegate({ width: 20, ascent: 12, descent: 3, attachment: { image: owned, accessibilityLabel: "Diagram" } });
    expect(Object.isFrozen(delegate)).toBe(true);
    expect(Object.isFrozen(delegate.attachment)).toBe(true);
    expect(delegate.attachment.image.pixel(0, 0).r).toBeCloseTo(1 / 255);
    expect(delegate).toMatchObject({ width: 20, ascent: 12, descent: 3 });
    expect(() => new TFXRunDelegate({ width: -1, ascent: 1, descent: 1, attachment: { image: owned, accessibilityLabel: "Diagram" } })).toThrow(/width/i);
    const oversized = new GFXImage({ width: 2_097_153, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array(2_097_153 * 4) });
    expect(() => new TFXRunDelegate({ width: 1, ascent: 1, descent: 1, attachment: { image: oversized, accessibilityLabel: "Too large" } })).toThrow(/8 MiB/i);

    const value = await font();
    try {
      expect(() => new TFXAttributedString("x", [{ start: 0, end: 1, font: value, runDelegate: delegate }])).toThrow(/U\+FFFC/i);
      expect(() => new TFXAttributedString("\uFFFCx", [{ start: 0, end: 2, font: value, runDelegate: delegate }])).toThrow(/single U\+FFFC/i);
      expect(() => new TFXAttributedString("\uFFFC", [{ start: 0, end: 1, font: value, runDelegate: delegate, features: { liga: 0 } }])).toThrow(/features/i);
      expect(() => new TFXAttributedString("\uFFFC", [{ start: 0, end: 1, font: value, runDelegate: delegate, fallbackFonts: new TFXFontCollection([value]) }])).toThrow(/fallback fonts/i);
      expect(new TFXAttributedString("\uFFFC", [{ start: 0, end: 1, font: value, runDelegate: delegate }]).runs[0]!.runDelegate).toBe(delegate);
      const many = "\uFFFC".repeat(1025);
      expect(() => new TFXAttributedString(many, Array.from(many, (_, index) => ({ start: index, end: index + 1, font: value, runDelegate: delegate })))).toThrow(/1024 attachments/i);
    } finally { value.dispose(); }
  });

  it("keeps glyph and image drawing ordered with atomic caret geometry", async () => {
    const value = await font();
    try {
      const delegate = attachment(30, 19, 5);
      const text = "A\uFFFCB";
      const attributes: TFXTextAttributes[] = [
        { start: 0, end: 1, font: value },
        { start: 1, end: 2, font: value, runDelegate: delegate },
        { start: 2, end: 3, font: value },
      ];
      const line = new TFXTypesetter(new TFXAttributedString(text, attributes)).createLine(0, text.length);
      const attachmentRun = line.runs.find(run => run.kind === "attachment")!;
      expect(attachmentRun.shaped.glyphs).toHaveLength(0);
      expect(attachmentRun.shaped.advance.width).toBe(30);
      expect(line.ascent).toBeGreaterThanOrEqual(19);
      expect(line.descent).toBeGreaterThanOrEqual(5);
      expect(line.offsetForStringIndex(2).primary - line.offsetForStringIndex(1).primary).toBeCloseTo(30);
      expect(line.stringIndexForPosition(attachmentRun.x + 2)).toBe(1);
      expect(line.stringIndexForPosition(attachmentRun.x + 28)).toBe(2);

      const drawings = TFXGlyphDrawing.drawingsForLine(line, { x: 10, y: 40 });
      expect(drawings.map(drawing => "path" in drawing ? "glyph" : "attachment")).toEqual(["glyph", "attachment", "glyph"]);
      const projected = TFXGlyphDrawing.attachmentsForLine(line, { x: 10, y: 40 })[0]!;
      expect(projected).toMatchObject({ kind: "attachment", stringIndex: 1, accessibilityLabel: "Inline chart", rect: { y: 21, width: 30, height: 24 } });
      const partial: string[] = [];
      expect(() => TFXGlyphDrawing.drawLine({ fill: () => partial.push("glyph") }, line, { x: 10, y: 40 })).toThrow(/drawImage/i);
      expect(partial).toEqual([]);
      const order: string[] = [];
      TFXGlyphDrawing.drawLine({ fill: () => order.push("glyph"), drawImage: () => order.push("attachment") }, line, { x: 10, y: 40 });
      expect(order).toEqual(["glyph", "attachment", "glyph"]);

      const attachmentFirst = new TFXTypesetter(new TFXAttributedString("\uFFFCA", [
        { start: 0, end: 1, font: value, runDelegate: delegate },
        { start: 1, end: 2, font: value },
      ])).createLine(0, 2);
      const lineCalls: string[] = [];
      expect(() => TFXGlyphDrawing.drawLine({ drawImage: () => lineCalls.push("attachment") } as never, attachmentFirst)).toThrow(/fill/i);
      expect(lineCalls).toEqual([]);
      const frame = new TFXFramesetter(new TFXAttributedString("\uFFFCA", [
        { start: 0, end: 1, font: value, runDelegate: delegate },
        { start: 1, end: 2, font: value },
      ])).createFrame({ bounds: { x: 0, y: 0, width: 100, height: 60 } });
      const frameCalls: string[] = [];
      expect(() => TFXGlyphDrawing.drawFrame({ drawImage: () => frameCalls.push("attachment") } as never, frame)).toThrow(/fill/i);
      expect(frameCalls).toEqual([]);
      expect(() => TFXGlyphDrawing.drawLine(null as never, attachmentFirst)).toThrow(/destination/i);
    } finally { value.dispose(); }
  });

  it("retains source and caller-owned image tokens atomically through truncation", async () => {
    const value = await font();
    try {
      const sourceDelegate = attachment(24, 16, 4, "Source attachment");
      const tokenDelegate = attachment(9, 7, 2, "Attachment token");
      const sourceText = "A\uFFFCBCDE";
      const source = new TFXTypesetter(new TFXAttributedString(sourceText, [
        { start: 0, end: 1, font: value },
        { start: 1, end: 2, font: value, runDelegate: sourceDelegate },
        { start: 2, end: sourceText.length, font: value },
      ])).createLine(0, sourceText.length);
      const token = new TFXTypesetter(new TFXAttributedString("\uFFFC", [{ start: 0, end: 1, font: value, runDelegate: tokenDelegate }])).createLine(0, 1);
      const firstWidth = new TFXTypesetter(new TFXAttributedString("A", [{ start: 0, end: 1, font: value }])).createLine(0, 1).width;
      const truncated = source.createTruncatedLine(firstWidth + sourceDelegate.width + token.width, "tail", token)!;
      const projected = TFXGlyphDrawing.attachmentsForLine(truncated);
      expect(projected.map(value => value.kind)).toEqual(["attachment", "truncation-token"]);
      expect(projected.map(value => value.accessibilityLabel)).toEqual(["Source attachment", "Attachment token"]);
      expect(projected[1]!.stringIndex).toBe(truncated.truncatedRange!.location);
      expect(truncated.width).toBeLessThanOrEqual(firstWidth + sourceDelegate.width + token.width + 1e-9);
    } finally { value.dispose(); }
  });

  it("uses delegate metrics in horizontal, vertical, path and cancellation geometry", async () => {
    const value = await font();
    try {
      const delegate = attachment(30, 20, 10);
      const text = "\uFFFC\uFFFC";
      const input = new TFXAttributedString(text, [
        { start: 0, end: 1, font: value, runDelegate: delegate },
        { start: 1, end: 2, font: value, runDelegate: delegate },
      ]);
      const horizontal = new TFXFramesetter(input).createFrame({
        path: GFXPath.rect({ x: 0, y: 0, width: 45, height: 100 }),
        exclusions: [{ x: 0, y: 0, width: 45, height: 30 }],
      });
      expect(horizontal.lines).toHaveLength(2);
      expect(horizontal.lines[0]!.origin.y).toBeGreaterThanOrEqual(50);
      expect(horizontal.lines[1]!.origin.y - horizontal.lines[0]!.origin.y).toBeGreaterThanOrEqual(30);
      const vertical = new TFXFramesetter(input).createFrame({ path: GFXPath.rect({ x: 0, y: 0, width: 70, height: 45 }), progression: "rightToLeft" });
      expect(vertical.lines).toHaveLength(2);
      const projected = TFXGlyphDrawing.attachmentsForFrame(vertical);
      expect(projected).toHaveLength(2);
      expect(projected[0]!.rect).toMatchObject({ width: 30, height: 30 });
      expect(projected.every(item => item.rect.x >= 0 && item.rect.y >= 0 && item.rect.x + item.rect.width <= 70 && item.rect.y + item.rect.height <= 45)).toBe(true);
      for (const line of vertical.lines) {
        for (const index of [line.line.start, line.line.end]) {
          const offset = line.line.offsetForStringIndex(index).primary;
          expect(vertical.stringIndexForPosition({ x: line.origin.x, y: line.origin.y + offset })).toBe(index);
        }
      }
      const controller = new AbortController();
      controller.abort(new DOMException("attachment drawing cancelled", "AbortError"));
      expect(() => TFXGlyphDrawing.drawingsForFrame(vertical, controller.signal)).toThrow(/cancelled/i);
    } finally { value.dispose(); }
  });
});
