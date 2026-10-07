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
import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createDocumentOutputPreparation } from "../../src/SynCloudOS/Documents/DocumentOutputPreparation";
import { TFXAttributedString } from "../../src/FX/TextFX/TFXAttributedString";
import { TFXFont } from "../../src/FX/TextFX/TFXFont";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { TFXTypesetter } from "../../src/FX/TextFX/TFXTypesetter";
import { TFXGlyphDrawing } from "../../src/FX/TextFX/TFXGlyphDrawing";
import { GFXImage } from "../../src/FX/GraphicsFX/GFXImage";
import { GFXPath } from "../../src/FX/GraphicsFX/GFXPath";
import { GFXColour } from "../../src/FX/GraphicsFX/GFXColour";

it("records a private fixed-page engine with searchable Unicode, links, images and exact raster geometry", async () => {
  const lines = [
    { id: "latin", file: "notosans-NotoSans[wdth,wght].ttf", text: "office café", y: 28 },
    { id: "arabic", file: "notosansarabic-NotoSansArabic[wdth,wght].ttf", text: "مرحبا", y: 56 },
    { id: "indic", file: "notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf", text: "नमस्ते", y: 84 },
  ];
  const released: string[] = [];
  const prepared = await createDocumentOutputPreparation({
    settle: () => ({ status: "settled" }), capture: () => ({ documentId: "private-engine", revision: 41, model: { title: "fixed output", lines } }),
  }).prepare({ engine: captured => ({ metadata: { title: captured.model.title }, dependencies: [
    ...captured.model.lines.map(line => ({ id: line.id, kind: "font" as const, async retain() {
      const font = await TFXFont.create(new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${line.file}`)), new TFXFontDescriptor({ size: 18 }));
      return { status: "retained" as const, lease: { value: font, release() { released.push(line.id); font.dispose(); } } };
    } })),
    { id: "image", kind: "resource", retain() { return { status: "retained", lease: {
      value: new GFXImage({ width: 1, height: 1, alpha: "opaque", colourSpace: "srgb", data: new Uint8Array([0, 255, 0, 255]) }),
      release() { released.push("image"); },
    } }; } },
  ], pages: [{ geometry: { width: 210, height: 120 }, draw(context, drawing) {
    for (const line of drawing.snapshot.model.lines) {
      const font = drawing.dependencies.get(line.id) as TFXFont;
      const shaped = new TFXTypesetter(new TFXAttributedString(line.text, [{ start: 0, end: line.text.length, font }])).createLine(0, line.text.length);
      context.drawPositionedText(TFXGlyphDrawing.pdfTextRunsForLine(shaped, { x: 10, y: line.y }));
    }
    context.fill(GFXPath.rect({ x: 160, y: 10, width: 20, height: 20 }), GFXColour.rgba(1, 0, 0));
    context.drawImage(drawing.dependencies.get("image") as GFXImage, { x: 160, y: 50, width: 20, height: 20 });
    context.addLink({ rect: { x: 155, y: 80, width: 40, height: 20 }, uri: "https://example.test/output" });
  } }, { geometry: { width: 72, height: 144, rotation: 90 }, draw(context) {
    context.fill(GFXPath.rect({ x: 5, y: 5, width: 5, height: 5 }));
  } }] }) });
  expect(prepared.status).toBe("prepared");
  if (prepared.status !== "prepared") return;
  const result = await prepared.output.exportPDF();
  expect(result.status).toBe("exported");
  expect(released.sort()).toEqual(["arabic", "image", "indic", "latin"]);
  prepared.output.release();
  expect(released).toHaveLength(4);
  if (result.status !== "exported") return;
  const backend = await PDFDocument.load(result.bytes);
  expect(backend.getTitle()).toBe("fixed output");
  expect(backend.getPages().map(page => ({ ...page.getSize(), rotation: page.getRotation().angle }))).toEqual([
    { width: 210, height: 120, rotation: 0 }, { width: 72, height: 144, rotation: 90 },
  ]);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: result.bytes.slice(), useSystemFonts: false, disableFontFace: true });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const text = await page.getTextContent();
    const extracted = text.items.map(item => "str" in item ? item.str : "").join("");
    for (const line of lines) expect(extracted).toContain(line.text);
    expect((await page.getAnnotations()).some(annotation => annotation.url === "https://example.test/output")).toBe(true);
    const canvas = createCanvas(210, 120), context = canvas.getContext("2d");
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport: page.getViewport({ scale: 1 }) }).promise;
    expect(Array.from(context.getImageData(170, 20, 1, 1).data)).toEqual([255, 0, 0, 255]);
    expect(Array.from(context.getImageData(170, 60, 1, 1).data)).toEqual([0, 255, 0, 255]);
    const pixels = context.getImageData(0, 0, 140, 100).data;
    expect(Array.from(pixels).filter((value, index) => index % 4 !== 3 && value < 100).length).toBeGreaterThan(300);
    const operators = await page.getOperatorList();
    expect(operators.fnArray.length).toBeGreaterThan(20);
  } finally { await task.destroy(); }
});
