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

import { describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, PDFName, PDFNumber, StandardFonts, degrees, rgb } from "pdf-lib";
import { GFXColour, GFXImage, GFXPath, GFXPDFContext, GFXPDFDocument, GFXPDFRenderDestination, GFXPDFRenderTask } from "../../../src/FX/GraphicsFX/public";
import { beginPDFDestination } from "../../../src/FX/GraphicsFX/pdf/GFXPDFRenderDestination";

const renderSources = vi.hoisted(() => [] as Array<Readonly<{ pageIndex: number; box: string; viewBox: { x: number; y: number; width: number; height: number }; rotation: number; scale: number; width: number; height: number }>>);
vi.mock("../../../src/FX/GraphicsFX/pdf/browserPDFRenderer", () => ({
    renderPDFPageInBrowser: async (source: (typeof renderSources)[number], signal: AbortSignal) => {
        renderSources.push(source);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 5);
            signal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(signal.reason);
            }, { once: true });
        });
        signal.throwIfAborted();
        const bytes = new Uint8Array(source.width * source.height * 4);
        for (let index = 0; index < bytes.length; index += 4)
            bytes.set([source.pageIndex * 40, 20, 200, 255], index);
        return new GFXImage({ width: source.width, height: source.height, alpha: "straight", colourSpace: "srgb", data: bytes });
    },
}));

async function fixture(): Promise<GFXPDFDocument> {
    const writer = new GFXPDFContext();
    writer.beginPage({ width: 20, height: 10 });
    writer.fill(GFXPath.rect({ x: 0, y: 0, width: 10, height: 10 }), GFXColour.rgba(1, 0, 0));
    writer.endPage();
    writer.beginPage({ width: 30, height: 20, rotation: 90 });
    writer.endPage();
    return GFXPDFDocument.open(await writer.finish());
}

describe("GraphicsFX canonical PDF page rendering", () => {
    it("settles cancellation promptly even when backend work ignores its signal", async () => {
        const image = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 0, 0, 255]) });
        let resolveLate!: (value: GFXImage) => void;
        const task = new GFXPDFRenderTask(() => new Promise(resolve => { resolveLate = resolve; }));
        await Promise.resolve();
        task.cancel();
        await expect(Promise.race([task.waitUntilCompleted(), new Promise((_, reject) => setTimeout(() => reject(new Error("cancel timeout")), 25))])).rejects.toMatchObject({ name: "AbortError" });
        expect(task.status).toBe("cancelled");
        resolveLate(image);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(task.status).toBe("cancelled");
    });

    it("marks destination state before invoking reentrant cancellation callbacks", () => {
        const destination = new GFXPDFRenderDestination();
        let callbackCount = 0;
        beginPDFDestination(destination, () => {
            callbackCount++;
            beginPDFDestination(destination, () => undefined);
        });
        expect(() => beginPDFDestination(destination, () => undefined)).toThrowError(/superseded/i);
        expect(callbackCount).toBe(1);
        const disposed = new GFXPDFRenderDestination();
        beginPDFDestination(disposed, () => {
            callbackCount++;
            expect(() => beginPDFDestination(disposed, () => undefined)).toThrowError(/disposed/i);
        });
        disposed.dispose();
        expect(callbackCount).toBe(2);
    });

    it("has independent known vector, text and image pixel evidence", async () => {
        const pdf = await PDFDocument.create(), page = pdf.addPage([60, 30]), font = await pdf.embedFont(StandardFonts.Helvetica);
        page.drawRectangle({ x: 2, y: 2, width: 10, height: 10, color: rgb(1, 0, 0) });
        page.drawText("I", { x: 30, y: 10, size: 12, font, color: rgb(0, 0, 0) });
        const green = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 255, 0, 255]) });
        page.drawImage(await pdf.embedPng(green.toPNG()), { x: 45, y: 2, width: 10, height: 10 });
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), loading = getDocument({ data: await pdf.save(), disableFontFace: true, useSystemFonts: false });
        const rendered = await loading.promise;
        try {
            const sourcePage = await rendered.getPage(1), canvas = createCanvas(120, 60), context = canvas.getContext("2d");
            await sourcePage.render({ canvas: canvas as never, canvasContext: context as never, viewport: sourcePage.getViewport({ scale: 2 }) }).promise;
            expect(Array.from(context.getImageData(10, 45, 1, 1).data)).toEqual([255, 0, 0, 255]);
            expect(Array.from(context.getImageData(100, 45, 1, 1).data)).toEqual([0, 255, 0, 255]);
            const textPixels = context.getImageData(58, 15, 10, 30).data;
            expect(Array.from(textPixels).filter((value, index) => index % 4 !== 3 && value < 80).length).toBeGreaterThan(20);
        }
        finally {
            await loading.destroy();
        }
    });

    it("publishes a bounded scaled and rotated GFXImage", async () => {
        const document = await fixture();
        const destination = new GFXPDFRenderDestination({ scale: 2, box: "crop" });
        const result = await document.page(1).render(destination);
        expect(result).toBe(destination.image);
        expect(result).toMatchObject({ width: 40, height: 60, alpha: "straight", colourSpace: "srgb" });
        expect(result.pixel(0, 0)).toEqual({ r: 40 / 255, g: 20 / 255, b: 200 / 255, a: 1 });
        expect(renderSources.at(-1)).toMatchObject({ pageIndex: 1, box: "crop", viewBox: { x: 0, y: 0, width: 30, height: 20 }, rotation: 90, scale: 2, width: 40, height: 60 });
        document.dispose();
    });

    it("applies PDF UserUnit to cropped, rotated and scaled output geometry", async () => {
        const pdf = await PDFDocument.create(), backendPage = pdf.addPage([10, 20]);
        backendPage.setCropBox(2, 3, 4, 6);
        backendPage.setRotation(degrees(90));
        backendPage.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
        backendPage.drawRectangle({ x: 2, y: 3, width: 4, height: 6, color: rgb(0, 0, 1) });
        const bytes = await pdf.save(), document = await GFXPDFDocument.open(bytes), page = document.page(0);
        expect(page).toMatchObject({ rotation: 90, userUnit: 2 });
        expect(page.viewport(2, "crop")).toMatchObject({ width: 24, height: 16 });
        const result = await page.render(new GFXPDFRenderDestination({ scale: 2, box: "crop" }));
        expect(result).toMatchObject({ width: 24, height: 16 });
        expect(renderSources.at(-1)).toMatchObject({ viewBox: { x: 2, y: 3, width: 4, height: 6 }, rotation: 90, scale: 2, width: 24, height: 16 });
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"), loading = getDocument({ data: bytes, disableFontFace: true });
        try {
            const independentPage = await (await loading.promise).getPage(1), viewport = independentPage.getViewport({ scale: 2 }), canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height)), context = canvas.getContext("2d");
            await independentPage.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise;
            expect({ width: viewport.width, height: viewport.height }).toEqual({ width: 24, height: 16 });
            expect(Array.from(context.getImageData(12, 8, 1, 1).data)).toEqual([0, 0, 255, 255]);
        }
        finally {
            await loading.destroy();
        }
        document.dispose();
    });

    it("cancels before and during work without publishing partial output", async () => {
        const document = await fixture(), page = document.page(0);
        const before = new AbortController();
        before.abort();
        expect(() => page.startRender(new GFXPDFRenderDestination(), before.signal)).toThrowError(/abort/i);
        const destination = new GFXPDFRenderDestination(), task = page.startRender(destination);
        task.cancel();
        await expect(task.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        expect(task.status).toBe("cancelled");
        expect(destination.image).toBeNull();
        document.dispose();
    });

    it("supersedes a destination, permits reentrant destinations and aborts on disposal", async () => {
        const document = await fixture(), page = document.page(0), shared = new GFXPDFRenderDestination();
        const superseded = page.startRender(shared), replacement = page.startRender(shared);
        await expect(superseded.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        const replacementImage = await replacement.waitUntilCompleted();
        expect(replacementImage).toBe(shared.image);
        const first = new GFXPDFRenderDestination(), second = new GFXPDFRenderDestination();
        await expect(Promise.all([page.render(first), page.render(second)])).resolves.toHaveLength(2);
        const disposedDestination = new GFXPDFRenderDestination(), disposedTask = page.startRender(disposedDestination);
        disposedDestination.dispose();
        await expect(disposedTask.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
        const documentTask = page.startRender(new GFXPDFRenderDestination());
        document.dispose();
        await expect(documentTask.waitUntilCompleted()).rejects.toMatchObject({ name: "AbortError" });
    });

    it("rejects invalid scale and output pixel budgets before backend work", async () => {
        expect(() => new GFXPDFRenderDestination({ scale: 0 })).toThrow();
        expect(() => new GFXPDFRenderDestination({ scale: 8.01 })).toThrow();
        const document = await fixture();
        expect(() => document.page(0).startRender(new GFXPDFRenderDestination({ scale: 8, maximumPixels: 10 }))).toThrow(/pixel/i);
        document.dispose();
    });

    it("bounds concurrently active worker jobs", async () => {
        const document = await fixture(), page = document.page(0);
        const tasks = Array.from({ length: 8 }, () => page.startRender(new GFXPDFRenderDestination()));
        expect(() => page.startRender(new GFXPDFRenderDestination())).toThrow(/active/i);
        tasks.forEach(task => task.cancel());
        await Promise.allSettled(tasks.map(task => task.waitUntilCompleted()));
        document.dispose();
    });
});
