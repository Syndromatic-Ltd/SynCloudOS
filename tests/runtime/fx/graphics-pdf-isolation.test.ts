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

import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { GFXPDFContext, GFXPDFDocument, GFXPDFScanner } from "../../../src/FX/GraphicsFX/public";
import type { GFXPDFDocumentWorkerResponse } from "../../../src/FX/GraphicsFX/pdf/pdfDocumentProtocol";
import { BrowserPDFDocumentWorker } from "../../../src/FX/GraphicsFX/pdf/BrowserPDFDocumentWorker";

class WorkerFixture extends EventTarget {
    readonly messages: unknown[] = [];
    terminated = 0;
    postMessage(message: unknown): void {
        this.messages.push(message);
    }
    terminate(): void {
        this.terminated++;
    }
    respond(response: GFXPDFDocumentWorkerResponse): void {
        this.dispatchEvent(new MessageEvent("message", { data: response }));
    }
}

const minimalWorkerDocument = Object.freeze({
    pageCount: 1,
    pages: Object.freeze([Object.freeze({
        mediaBox: Object.freeze({ x: 0, y: 0, width: 10, height: 10 }),
        cropBox: Object.freeze({ x: 0, y: 0, width: 10, height: 10 }),
        bleedBox: Object.freeze({ x: 0, y: 0, width: 10, height: 10 }),
        trimBox: Object.freeze({ x: 0, y: 0, width: 10, height: 10 }),
        artBox: Object.freeze({ x: 0, y: 0, width: 10, height: 10 }),
        rotation: 0 as const,
        userUnit: 1,
    })]),
    metadata: Object.freeze({ title: "isolated" }),
    permissions: Object.freeze({ raw: null }),
});

function workerBytes(): Uint8Array {
    return new TextEncoder().encode("%PDF-1.7\nfixture");
}

describe("GraphicsFX isolated PDF document worker", () => {
    it("terminates an aborted parse without publication and leaves another worker usable", async () => {
        const first = new WorkerFixture();
        const backend = new BrowserPDFDocumentWorker(first as unknown as Worker, { maximumOperationMilliseconds: 1000 });
        const controller = new AbortController();
        const aborted = backend.open(workerBytes(), {}, controller.signal);
        controller.abort(new DOMException("cancel parse", "AbortError"));
        await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
        expect(first.terminated).toBe(1);

        const second = new WorkerFixture();
        const usable = new BrowserPDFDocumentWorker(second as unknown as Worker, { maximumOperationMilliseconds: 1000 });
        const opened = usable.open(workerBytes());
        const request = second.messages[0] as Readonly<{ id: number }>;
        second.respond(Object.freeze({ id: request.id, ok: true, kind: "document", value: minimalWorkerDocument }));
        await expect(opened).resolves.toMatchObject({ pageCount: 1, metadata: { title: "isolated" } });
        usable.dispose();
    });

    it("maps password dispositions and terminates an unresponsive parser", async () => {
        const passwordWorker = new WorkerFixture();
        const passwordBackend = new BrowserPDFDocumentWorker(passwordWorker as unknown as Worker, { maximumOperationMilliseconds: 1000 });
        const opened = passwordBackend.open(workerBytes());
        const request = passwordWorker.messages[0] as Readonly<{ id: number }>;
        passwordWorker.respond(Object.freeze({ id: request.id, ok: false, error: Object.freeze({ code: "password-required", message: "Password required." }) }));
        await expect(opened).rejects.toMatchObject({ name: "GFXPDFError", code: "password-required" });

        const hanging = new WorkerFixture();
        const hangingBackend = new BrowserPDFDocumentWorker(hanging as unknown as Worker, { maximumOperationMilliseconds: 10 });
        await expect(hangingBackend.open(workerBytes())).rejects.toMatchObject({ name: "GFXPDFError", code: "limit" });
        expect(hanging.terminated).toBe(1);
    });

    it("returns an owned prepared page and rejects pending work on dispose", async () => {
        const worker = new WorkerFixture();
        const backend = new BrowserPDFDocumentWorker(worker as unknown as Worker, { maximumOperationMilliseconds: 1000 });
        const prepared = backend.preparePage(workerBytes(), 0);
        const request = worker.messages[0] as Readonly<{ id: number }>;
        const pageBytes = new TextEncoder().encode("%PDF-1.7\nprepared");
        worker.respond(Object.freeze({ id: request.id, ok: true, kind: "prepared-page", value: Object.freeze({ bytes: pageBytes.buffer }) }));
        await expect(prepared).resolves.toEqual(pageBytes);

        const hangingWorker = new WorkerFixture();
        const hangingBackend = new BrowserPDFDocumentWorker(hangingWorker as unknown as Worker, { maximumOperationMilliseconds: 1000 });
        const pending = hangingBackend.open(workerBytes());
        hangingBackend.dispose();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(hangingWorker.terminated).toBe(1);
    });
});

describe("GraphicsFX bounded PDF open and stream decoding", () => {
    it("admits encoded bytes against caller limits before parsing", async () => {
        const writer = new GFXPDFContext();
        writer.beginPage({ width: 10, height: 10 });
        writer.endPage();
        const bytes = await writer.finish();
        await expect(GFXPDFDocument.open(bytes, { maximumEncodedBytes: bytes.length - 1 })).rejects.toMatchObject({ code: "limit" });
        const document = await GFXPDFDocument.open(bytes, { maximumEncodedBytes: bytes.length });
        expect(document.pageCount).toBe(1);
        document.dispose();
    });

    it("decodes bounded chained ASCIIHex/Flate streams with PNG predictors", async () => {
        const pdf = await PDFDocument.create();
        pdf.addPage([10, 10]);
        const predicted = Uint8Array.from([1, 10, 10, 10]);
        const compressed = deflateSync(predicted);
        const hex = new TextEncoder().encode(`${Array.from(compressed, byte => byte.toString(16).padStart(2, "0")).join("")}>`);
        const stream = pdf.context.stream(hex);
        stream.dict.set(PDFName.of("Filter"), pdf.context.obj([PDFName.of("ASCIIHexDecode"), PDFName.of("FlateDecode")]));
        stream.dict.set(PDFName.of("DecodeParms"), pdf.context.obj([null, { Predictor: 15, Colors: 1, BitsPerComponent: 8, Columns: 3 }]));
        const ref = pdf.context.register(stream);
        const document = await GFXPDFDocument.open(await pdf.save({ useObjectStreams: false }));
        const scanner = new GFXPDFScanner(document, 64);
        await expect(scanner.decodedStream({ objectNumber: ref.objectNumber, generationNumber: ref.generationNumber })).resolves.toEqual(Uint8Array.from([10, 20, 30]));
        document.dispose();
    });

    it("rejects unsupported filter chains without committing decoded output", async () => {
        const pdf = await PDFDocument.create();
        pdf.addPage([10, 10]);
        const stream = pdf.context.stream(new Uint8Array([1, 2, 3]));
        stream.dict.set(PDFName.of("Filter"), pdf.context.obj([PDFName.of("DCTDecode"), PDFName.of("FlateDecode")]));
        const ref = pdf.context.register(stream);
        const document = await GFXPDFDocument.open(await pdf.save({ useObjectStreams: false }));
        const scanner = new GFXPDFScanner(document, 64);
        await expect(scanner.decodedStream({ objectNumber: ref.objectNumber, generationNumber: ref.generationNumber })).rejects.toMatchObject({ code: "unsupported" });
        document.dispose();
    });
});
