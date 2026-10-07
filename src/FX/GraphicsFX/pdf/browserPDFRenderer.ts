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

/// <reference types="vite/client" />
import pdfWorkerURL from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";
import { GFXImage } from "../GFXImage";
import { GFXPDFError, type GFXPDFRenderSource } from "./pdfTypes";

type RenderCanvas = OffscreenCanvas | HTMLCanvasElement;

function createCanvas(width: number, height: number): RenderCanvas {
    if (typeof OffscreenCanvas === "function")
        return new OffscreenCanvas(width, height);
    if (typeof document === "object" && typeof document.createElement === "function") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    throw new GFXPDFError("unsupported", "PDF rendering requires OffscreenCanvas or an HTML canvas.");
}

/** Browser-only maintained backend. The module is dynamically loaded by GFXPDFPage. */
export async function renderPDFPageInBrowser(source: GFXPDFRenderSource, signal: AbortSignal): Promise<GFXImage> {
    signal.throwIfAborted();
    if (typeof Worker !== "function")
        throw new GFXPDFError("unsupported", "PDF rendering requires module worker support.");
    const pdfjs = await import("pdfjs-dist");
    signal.throwIfAborted();
    const browserWorker = new Worker(pdfWorkerURL, { type: "module", name: "syncloudos-gfx-pdf-render" });
    let pdfWorker: InstanceType<typeof pdfjs.PDFWorker>;
    try {
        pdfWorker = new pdfjs.PDFWorker({ port: browserWorker as never });
    }
    catch (error) {
        try {
            browserWorker.terminate();
        }
        catch {
            // Preserve the backend-construction failure after attempting release.
        }
        throw error;
    }
    let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
    let renderTask: ReturnType<Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>["getPage"]>>["render"]> | undefined;
    let tornDown = false;
    const attempt = (operation: () => void | Promise<unknown>) => {
        try {
            const result = operation();
            void Promise.resolve(result).catch(() => undefined);
        }
        catch {
            // Continue releasing the other independent backend resources.
        }
    };
    const teardown = () => {
        if (tornDown)
            return;
        tornDown = true;
        attempt(() => browserWorker.terminate());
        attempt(() => renderTask?.cancel());
        attempt(() => loadingTask?.destroy());
        attempt(() => pdfWorker.destroy());
    };
    signal.addEventListener("abort", teardown, { once: true });
    try {
        loadingTask = pdfjs.getDocument({
            data: source.bytes.slice(),
            password: source.password,
            worker: pdfWorker,
            stopAtErrors: true,
            maxImageSize: source.maximumPixels,
            canvasMaxAreaInBytes: source.maximumPixels * 4,
            isOffscreenCanvasSupported: typeof OffscreenCanvas === "function",
            disableFontFace: true,
            useSystemFonts: false,
            enableXfa: false,
        });
        const pdf = await loadingTask.promise;
        signal.throwIfAborted();
        if (pdf.numPages <= source.pageIndex)
            throw new GFXPDFError("malformed", "PDF renderer page count disagrees with the document descriptor.");
        const page = await pdf.getPage(source.pageIndex + 1);
        signal.throwIfAborted();
        const defaultViewport = page.getViewport({ scale: source.scale });
        const Viewport = defaultViewport.constructor as unknown as new (options: Readonly<{ viewBox: number[]; userUnit: number; scale: number; rotation: number }>) => typeof defaultViewport;
        const viewport = source.box === "crop" ? defaultViewport : new Viewport({ viewBox: [source.viewBox.x, source.viewBox.y, source.viewBox.x + source.viewBox.width, source.viewBox.y + source.viewBox.height], userUnit: page.userUnit, scale: source.scale, rotation: source.rotation });
        const canvas = createCanvas(source.width, source.height);
        const context = canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
        if (!context)
            throw new GFXPDFError("unsupported", "PDF rendering could not create a 2D canvas context.");
        renderTask = page.render({ canvas: canvas as never, canvasContext: context as never, viewport, background: "rgb(255,255,255)" });
        await renderTask.promise;
        signal.throwIfAborted();
        const pixels = context.getImageData(0, 0, source.width, source.height).data;
        return new GFXImage({ width: source.width, height: source.height, alpha: "straight", colourSpace: "srgb", data: pixels });
    }
    catch (error) {
        signal.throwIfAborted();
        if (error instanceof GFXPDFError)
            throw error;
        throw new GFXPDFError("malformed", error instanceof Error ? error.message : "PDF page rendering failed.");
    }
    finally {
        signal.removeEventListener("abort", teardown);
        teardown();
    }
}
