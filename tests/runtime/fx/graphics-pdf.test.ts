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
import { TFXFont, TFXFontDescriptor, TFXTypesetter, TFXAttributedString, TFXGlyphDrawing } from "../../../src/FX/TextFX/public";
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { GFXPDFContext, GFXPDFDocument, GFXPDFScanner, GFXPath, GFXColour, GFXImage, GFXDataConsumer, GFXGradient } from "../../../src/FX/GraphicsFX/public";
describe("GraphicsFX PDF recording and parsing", () => {
    it("writes multipage vector paths, shading and owned image pixels", async () => {
        const writer = new GFXPDFContext({ title: "Portable graphics" });
        writer.beginPage({ width: 100, height: 80 });
        writer.setFillColour(GFXColour.rgba(1, 0, 0));
        writer.fill(GFXPath.rect({ x: 10, y: 10, width: 20, height: 20 }));
        writer.fill(GFXPath.rect({ x: 40, y: 10, width: 40, height: 20 }), new GFXGradient([{ offset: 0, colour: GFXColour.rgba(0, 0, 0) }, { offset: 1, colour: GFXColour.rgba(1, 1, 1) }]));
        writer.drawImage(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 255, 0, 255]) }), { x: 10, y: 40, width: 10, height: 10 });
        writer.endPage();
        writer.beginPage({ width: 60, height: 90, rotation: 90 });
        writer.endPage();
        const bytes = await writer.finish();
        expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
        const document = await GFXPDFDocument.open(bytes);
        expect(document.pageCount).toBe(2);
        expect(document.page(1).rotation).toBe(90);
        expect(document.metadata.title).toBe("Portable graphics");
        const scanner = new GFXPDFScanner(document);
        expect(scanner.objects().some(item => item.kind === "stream")).toBe(true);
        document.dispose();
        expect(() => document.page(0)).toThrow();
    });
    it("captures transforms, alpha, evenodd clipping and rejects unbalanced state", async () => {
        const writer = new GFXPDFContext();
        writer.beginPage({ width: 20, height: 20 });
        writer.save();
        writer.concatTransform({ a: 1, b: 0, c: 0, d: 1, tx: 2, ty: 3 });
        writer.setAlpha(.5);
        writer.clip(GFXPath.rect({ x: 0, y: 0, width: 4, height: 4 }), "evenodd");
        writer.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }));
        expect(() => writer.endPage()).toThrow();
        writer.restore();
        writer.endPage();
        const bytes = await writer.finish();
        const backend = await PDFDocument.load(bytes);
        expect(backend.getPageCount()).toBe(1);
        await expect(writer.finish()).rejects.toThrow();
    });
    it("rejects malformed/oversized input, cancelled export and bounded consumer overflow", async () => {
        await expect(GFXPDFDocument.open(new Uint8Array([1, 2, 3]))).rejects.toThrow();
        const writer = new GFXPDFContext();
        writer.beginPage({ width: 10, height: 10 });
        writer.endPage();
        const controller = new AbortController();
        controller.abort();
        await expect(writer.finish(undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        const other = new GFXPDFContext();
        other.beginPage({ width: 10, height: 10 });
        other.endPage();
        await expect(other.finish(new GFXDataConsumer(2))).rejects.toThrow();
    });
    it("reads inherited boxes and transforms quarter-turn page coordinates", async () => {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([100, 200]);
        page.node.delete(PDFName.MediaBox);
        page.node.Parent()!.set(PDFName.MediaBox, pdf.context.obj([10, 20, 110, 220]));
        page.node.Parent()!.set(PDFName.Rotate, PDFNumber.of(90));
        const document = await GFXPDFDocument.open(await pdf.save());
        const descriptor = document.page(0);
        expect(descriptor.mediaBox).toEqual({ x: 10, y: 20, width: 100, height: 200 });
        expect(descriptor.rotation).toBe(90);
        expect(descriptor.viewport(1)).toMatchObject({ width: 200, height: 100 });
    });
});
describe("GraphicsFX independent PDF rendering and stream boundaries", () => {
    it("renders generated paths, native shading and bitmap through PDF.js", async () => {
        const writer = new GFXPDFContext();
        writer.beginPage({ width: 100, height: 80 });
        writer.fill(GFXPath.rect({ x: 10, y: 10, width: 20, height: 20 }), GFXColour.rgba(1, 0, 0));
        writer.fill(GFXPath.rect({ x: 40, y: 10, width: 40, height: 20 }), new GFXGradient([{ offset: 0, colour: GFXColour.rgba(0, 0, 0) }, { offset: 1, colour: GFXColour.rgba(1, 1, 1) }]));
        writer.drawImage(new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 255, 0, 255]) }), { x: 10, y: 40, width: 10, height: 10 });
        writer.endPage();
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), task = getDocument({ data: await writer.finish(), useSystemFonts: false, disableFontFace: true });
        const pdf = await task.promise;
        try {
            const page = await pdf.getPage(1), canvas = createCanvas(100, 80), ctx = canvas.getContext("2d");
            await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport: page.getViewport({ scale: 1 }) }).promise;
            const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
            expect(pixel(15, 15)).toEqual([255, 0, 0, 255]);
            expect(pixel(15, 45)).toEqual([0, 255, 0, 255]);
            expect(pixel(60, 20)[0]).toBeGreaterThan(110);
            expect(pixel(60, 20)[0]).toBeLessThan(145);
            expect(pixel(1, 1)).toEqual([255, 255, 255, 255]);
        }
        finally {
            await pdf.loadingTask.destroy();
        }
    });
    it("renders actual shaped TFX glyph outlines and enforces declared export rights atomically", async () => {
        const font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 20 }));
        try {
            const line = new TFXTypesetter(new TFXAttributedString("office", [{ start: 0, end: 6, font }])).createLine(0, 6), outlines = TFXGlyphDrawing.pathsForLine(line, { x: 5, y: 25 });
            const writer = new GFXPDFContext();
            writer.beginPage({ width: 80, height: 35 });
            expect(() => writer.drawGlyphOutlines([{ ...outlines[0]!, embedding: "unknown" }])).toThrow();
            writer.drawGlyphOutlines(outlines);
            writer.endPage();
            const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), pdf = await getDocument({ data: await writer.finish(), useSystemFonts: false, disableFontFace: true }).promise;
            try {
                const page = await pdf.getPage(1), canvas = createCanvas(80, 35), ctx = canvas.getContext("2d");
                await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport: page.getViewport({ scale: 1 }) }).promise;
                const data = ctx.getImageData(0, 0, 80, 35).data;
                expect(Array.from(data).filter((v, i) => i % 4 !== 3 && v < 100).length).toBeGreaterThan(200);
            }
            finally {
                await pdf.loadingTask.destroy();
            }
        }
        finally {
            font.dispose();
        }
    });
    it("detects indirect cycles and limits decompressed stream bytes", async () => {
        const pdf = await PDFDocument.create();
        pdf.addPage([10, 10]);
        const dictionary = pdf.context.obj({}), cycle = pdf.context.register(dictionary);
        dictionary.set(PDFName.of("Self"), cycle);
        const stream = pdf.context.register(pdf.context.flateStream(new Uint8Array(10000).fill(65)));
        const document = await GFXPDFDocument.open(await pdf.save({ useObjectStreams: false }));
        const scanner = new GFXPDFScanner(document, 100);
        expect(() => scanner.object({ objectNumber: cycle.objectNumber, generationNumber: 0 }, true)).toThrow("cycle");
        await expect(scanner.decodedStream({ objectNumber: stream.objectNumber, generationNumber: 0 })).rejects.toMatchObject({ code: "limit" });
        document.dispose();
    });
});
describe("GraphicsFX PDF numeric projection details", () => {
    it("renders transformed even-odd clips and uniform alpha correctly", async () => {
        const writer = new GFXPDFContext();
        writer.beginPage({ width: 20, height: 20 });
        writer.concatTransform({ a: 1, b: 0, c: 0, d: 1, tx: 2, ty: 3 });
        writer.clip(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }).append(GFXPath.rect({ x: 3, y: 3, width: 4, height: 4 })), "evenodd");
        writer.setAlpha(.5);
        writer.fill(GFXPath.rect({ x: 0, y: 0, width: 20, height: 20 }), GFXColour.rgba(1, 0, 0));
        writer.endPage();
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), task = getDocument({ data: await writer.finish(), disableFontFace: true }), pdf = await task.promise;
        try {
            const page = await pdf.getPage(1), canvas = createCanvas(20, 20), ctx = canvas.getContext("2d");
            await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport: page.getViewport({ scale: 1 }) }).promise;
            expect(Array.from(ctx.getImageData(3, 4, 1, 1).data)).toEqual([255, 128, 128, 255]);
            expect(Array.from(ctx.getImageData(6, 7, 1, 1).data)).toEqual([255, 255, 255, 255]);
            expect(Array.from(ctx.getImageData(1, 1, 1, 1).data)).toEqual([255, 255, 255, 255]);
        }
        finally {
            await task.destroy();
        }
    });
    it("accepts varying gradient alpha and reports password negotiation", async () => {
        const writer = new GFXPDFContext();
        writer.beginPage({ width: 10, height: 10 });
        expect(() => writer.fill(GFXPath.rect({ x: 0, y: 0, width: 5, height: 5 }), new GFXGradient([{ offset: 0, colour: GFXColour.rgba(1, 0, 0, 0) }, { offset: 1, colour: GFXColour.rgba(1, 0, 0, 1) }]))).not.toThrow();
        writer.endPage();
        const pdf = await PDFDocument.create();
        pdf.addPage([10, 10]);
        pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: "Standard", V: 1, R: 2, O: PDFName.of("invalid"), U: PDFName.of("invalid"), P: -4 }));
        await expect(GFXPDFDocument.open(await pdf.save({ useObjectStreams: false }))).rejects.toMatchObject({ code: "password-required" });
    });
});
it("embeds a parsed source page with rotation into a new destination without rasterization", async () => {
    const sourceWriter = new GFXPDFContext();
    sourceWriter.beginPage({ width: 20, height: 10, rotation: 90 });
    sourceWriter.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }), GFXColour.rgba(1, 0, 0));
    sourceWriter.endPage();
    const source = await GFXPDFDocument.open(await sourceWriter.finish()), writer = new GFXPDFContext();
    writer.beginPage({ width: 10, height: 20 });
    writer.drawPDFPage(source, 0, { x: 0, y: 0, width: 10, height: 20 });
    writer.endPage();
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), task = getDocument({ data: await writer.finish(), disableFontFace: true }), pdf = await task.promise;
    try {
        const page = await pdf.getPage(1), canvas = createCanvas(10, 20), ctx = canvas.getContext("2d");
        await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport: page.getViewport({ scale: 1 }) }).promise;
        expect(Array.from(ctx.getImageData(5, 5, 1, 1).data)).toEqual([255, 0, 0, 255]);
        expect(Array.from(ctx.getImageData(5, 15, 1, 1).data)).toEqual([255, 255, 255, 255]);
    }
    finally {
        await task.destroy();
        source.dispose();
    }
});
