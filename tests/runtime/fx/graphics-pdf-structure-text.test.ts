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
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString } from "pdf-lib";
import {
  TFXAttributedString,
  TFXFont,
  TFXFontDescriptor,
  TFXGlyphDrawing,
  TFXTypesetter,
} from "../../../src/FX/TextFX/public";
import { GFXColour, GFXColourProfile, GFXGradient, GFXPDFContext, GFXPDFDocument, GFXPDFScanner, GFXPath } from "../../../src/FX/GraphicsFX/public";

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/fx/fonts/${name}`));

function restrictEmbedding(source: Uint8Array): Uint8Array {
  const bytes = source.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4, false);
  for (let index = 0; index < count; index += 1) {
    const entry = 12 + index * 16;
    const tag = String.fromCharCode(bytes[entry]!, bytes[entry + 1]!, bytes[entry + 2]!, bytes[entry + 3]!);
    if (tag !== "OS/2") continue;
    const offset = view.getUint32(entry + 8, false);
    view.setUint16(offset + 8, 2, false);
    return bytes;
  }
  throw new TypeError("Fixture font has no OS/2 embedding-rights table.");
}

async function line(text: string, fontName: string, y: number) {
  const font = await TFXFont.create(fixture(fontName), new TFXFontDescriptor({ size: 18 }));
  const shaped = new TFXTypesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createLine(0, text.length);
  return { font, runs: TFXGlyphDrawing.pdfTextRunsForLine(shaped, { x: 10, y }) };
}

function rgbProfile(): Uint8Array {
  const names = ["rXYZ", "gXYZ", "bXYZ", "rTRC", "gTRC", "bTRC"], matrix = [[.4360747, .2225045, .0139322], [.3850649, .7168786, .0971045], [.1430804, .0606169, .7141733]];
  const offset = 132 + names.length * 12, size = offset + 3 * 20 + 3 * 16, bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => { for (let index = 0; index < value.length; index++) bytes[at + index] = value.charCodeAt(index); };
  view.setUint32(0, size); bytes[8] = 4; text(12, "mntr"); text(16, "RGB "); text(20, "XYZ "); text(36, "acsp");
  [.9642, 1, .8249].forEach((value, index) => view.setInt32(68 + index * 4, Math.round(value * 65536)));
  view.setUint32(128, names.length);
  let position = offset;
  names.forEach((name, index) => {
    text(132 + index * 12, name); view.setUint32(136 + index * 12, position); view.setUint32(140 + index * 12, index < 3 ? 20 : 16);
    if (index < 3) {
      text(position, "XYZ "); matrix[index]!.forEach((value, axis) => view.setInt32(position + 8 + axis * 4, Math.round(value * 65536))); position += 20;
    } else {
      text(position, "curv"); view.setUint32(position + 8, 1); view.setUint16(position + 12, Math.round(2.2 * 256)); position += 16;
    }
  });
  return bytes;
}

describe("GraphicsFX structured searchable PDF text", () => {
  it("preserves logical Unicode extraction while rendering the existing shaped outlines", async () => {
    const latin = await line("office", "notosans-NotoSans[wdth,wght].ttf", 28);
    const arabic = await line("مرحبا", "notosansarabic-NotoSansArabic[wdth,wght].ttf", 58);
    const indic = await line("नमस्ते", "notosansdevanagari-NotoSansDevanagari[wdth,wght].ttf", 88);
    try {
      const writer = new GFXPDFContext({ title: "Searchable text" });
      writer.beginPage({ width: 180, height: 110 });
      writer.drawPositionedText(latin.runs);
      writer.drawPositionedText(arabic.runs);
      writer.drawPositionedText(indic.runs);
      writer.endPage();

      const bytes = await writer.finish();
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true });
      const pdf = await task.promise;
      try {
        const page = await pdf.getPage(1);
        const text = await page.getTextContent();
        const extracted = text.items.map((item) => "str" in item ? item.str : "").join("");
        expect(extracted).toContain("office");
        expect(extracted).toContain("مرحبا");
        expect(extracted).toContain("नमस्ते");

        const canvas = createCanvas(180, 110), context = canvas.getContext("2d");
        await page.render({ canvas: canvas as never, canvasContext: context as never, viewport: page.getViewport({ scale: 1 }) }).promise;
        const pixels = context.getImageData(0, 0, 180, 110).data;
        expect(Array.from(pixels).filter((value, index) => index % 4 !== 3 && value < 100).length).toBeGreaterThan(300);
      }
      finally {
        await task.destroy();
      }
    }
    finally {
      latin.font.dispose();
      arabic.font.dispose();
      indic.font.dispose();
    }
  });

  it("rejects restricted font embedding atomically before recording searchable text", async () => {
    const font = await TFXFont.create(
      restrictEmbedding(fixture("notosans-NotoSans[wdth,wght].ttf")),
      new TFXFontDescriptor({ size: 18 }),
    );
    try {
      expect(font.embedding).toBe("restricted");
      const shaped = new TFXTypesetter(new TFXAttributedString("blocked", [{ start: 0, end: 7, font }])).createLine(0, 7);
      const runs = TFXGlyphDrawing.pdfTextRunsForLine(shaped, { x: 10, y: 28 });
      const writer = new GFXPDFContext();
      writer.beginPage({ width: 100, height: 40 });
      expect(() => writer.drawPositionedText(runs)).toThrowError(DOMException);
      writer.endPage();
      const bytes = await writer.finish();
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({ data: bytes, disableFontFace: true });
      const pdf = await task.promise;
      try {
        const page = await pdf.getPage(1);
        const text = await page.getTextContent();
        expect(text.items).toHaveLength(0);
      }
      finally {
        await task.destroy();
      }
    }
    finally {
      font.dispose();
    }
  });

  it("emits language, outlines, safe URI links, marked structure and an ICC output intent", async () => {
    const writer = new GFXPDFContext({ title: "Structured document" });
    writer.setLanguage("en-GB");
    writer.setOutputIntent(new GFXColourProfile(rgbProfile()), { identifier: "SynCloudOS RGB" });
    writer.beginPage({ width: 120, height: 80 });
    writer.beginMarkedContent({ tag: "P", actualText: "Accessible paragraph" });
    writer.fill(GFXPath.rect({ x: 10, y: 10, width: 60, height: 20 }), GFXColour.rgba(.2, .4, .8));
    writer.endMarkedContent();
    writer.addLink({ rect: { x: 10, y: 40, width: 60, height: 20 }, uri: "https://example.test/read" });
    writer.endPage();
    writer.addOutline({ title: "Introduction", pageIndex: 0 });

    const bytes = await writer.finish(), inspectionBytes = bytes.slice();
    const backend = await PDFDocument.load(inspectionBytes);
    const language = backend.catalog.lookup(PDFName.of("Lang"));
    expect(language).toBeInstanceOf(PDFString);
    expect((language as PDFString).decodeText()).toBe("en-GB");
    expect(backend.catalog.lookup(PDFName.of("Outlines"))).toBeInstanceOf(PDFDict);
    expect(backend.catalog.lookup(PDFName.of("StructTreeRoot"))).toBeInstanceOf(PDFDict);
    expect(backend.catalog.lookup(PDFName.of("OutputIntents"))).toBeInstanceOf(PDFArray);
    const annotations = backend.getPage(0).node.Annots();
    expect(annotations?.size()).toBe(1);
    const annotation = annotations!.lookup(0, PDFDict), action = annotation.lookup(PDFName.of("A"), PDFDict);
    expect(action.lookup(PDFName.of("S"), PDFName).decodeText()).toBe("URI");
    expect(action.lookup(PDFName.of("URI"), PDFString).decodeText()).toBe("https://example.test/read");

    const document = await GFXPDFDocument.open(bytes), scanner = new GFXPDFScanner(document);
    try {
      const streams = scanner.objects().filter((entry) => entry.kind === "stream");
      const operatorSets = await Promise.all(streams.map(async (entry) => {
        try { return await scanner.contentOperators(entry.reference); }
        catch { return []; }
      }));
      const operators = operatorSets.flat().map((entry) => entry.operator);
      expect(operators).toContain("BDC");
      expect(operators).toContain("EMC");
    }
    finally {
      document.dispose();
    }
  });

  it("projects object-bounding-box hard stops and varying alpha without losing declared paint semantics", async () => {
    const writer = new GFXPDFContext();
    writer.beginPage({ width: 120, height: 40 });
    writer.fill(GFXPath.rect({ x: 0, y: 0, width: 60, height: 40 }), new GFXGradient([
      { offset: 0, colour: GFXColour.rgba(1, 0, 0) },
      { offset: .5, colour: GFXColour.rgba(1, 0, 0) },
      { offset: .5, colour: GFXColour.rgba(0, 0, 1) },
      { offset: 1, colour: GFXColour.rgba(0, 0, 1) },
    ]));
    writer.fill(GFXPath.rect({ x: 60, y: 0, width: 60, height: 40 }), new GFXGradient([
      { offset: 0, colour: GFXColour.rgba(1, 0, 0, 0) },
      { offset: 1, colour: GFXColour.rgba(1, 0, 0, 1) },
    ]));
    writer.endPage();

    const bytes = await writer.finish(), inspectionBytes = bytes.slice();
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), task = getDocument({ data: bytes, disableFontFace: true }), pdf = await task.promise;
    try {
      const page = await pdf.getPage(1), canvas = createCanvas(120, 40), context = canvas.getContext("2d");
      await page.render({ canvas: canvas as never, canvasContext: context as never, viewport: page.getViewport({ scale: 1 }) }).promise;
      const pixel = (x: number) => Array.from(context.getImageData(x, 20, 1, 1).data);
      expect(pixel(15).slice(0, 3)).toEqual([255, 0, 0]);
      expect(pixel(45).slice(0, 3)).toEqual([0, 0, 255]);
      expect(pixel(62)[1]).toBeGreaterThan(235);
      expect(pixel(62)[2]).toBeGreaterThan(235);
      expect(pixel(116)[0]).toBeGreaterThan(245);
      expect(pixel(116)[1]).toBeLessThan(35);
      expect(pixel(116)[2]).toBeLessThan(35);
    }
    finally {
      await task.destroy();
    }
    const backend = await PDFDocument.load(inspectionBytes);
    const hasSoftMask = backend.context.enumerateIndirectObjects().some(([, value]) => value instanceof PDFRawStream && value.dict.has(PDFName.of("SMask")));
    expect(hasSoftMask).toBe(true);
  });

  it("bounds malformed content scans and treats JavaScript actions as inert data", async () => {
    const backend = await PDFDocument.create({ updateMetadata: false });
    const page = backend.addPage([20, 20]);
    const malformed = backend.context.register(backend.context.stream("(unterminated Tj"));
    page.node.addContentStream(malformed);
    const action = backend.context.register(backend.context.obj({
      S: "JavaScript",
      JS: PDFString.of("globalThis.__gfxPdfActionExecuted = true"),
    }));
    const bytes = await backend.save({ useObjectStreams: false, addDefaultPage: false });
    const document = await GFXPDFDocument.open(bytes), scanner = new GFXPDFScanner(document);
    const globalRecord = globalThis as typeof globalThis & { __gfxPdfActionExecuted?: boolean };
    delete globalRecord.__gfxPdfActionExecuted;
    try {
      await expect(scanner.contentOperators({ objectNumber: malformed.objectNumber, generationNumber: malformed.generationNumber })).rejects.toMatchObject({ code: "malformed" });
      const inspected = scanner.object({ objectNumber: action.objectNumber, generationNumber: action.generationNumber }, true);
      expect(inspected.kind).toBe("dictionary");
      expect(globalRecord.__gfxPdfActionExecuted).toBeUndefined();
    }
    finally {
      delete globalRecord.__gfxPdfActionExecuted;
      document.dispose();
    }
  });
});
