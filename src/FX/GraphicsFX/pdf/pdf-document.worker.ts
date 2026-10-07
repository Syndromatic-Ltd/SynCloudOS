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

import {
    PDFArray,
    PDFBool,
    PDFDict,
    PDFDocument,
    EncryptedPDFError,
    PDFHexString,
    PDFName,
    PDFNull,
    PDFNumber,
    PDFRawStream,
    PDFRef,
    PDFString,
    type PDFObject,
    type PDFPage,
} from "pdf-lib";
import { getDocument, PasswordResponses, PDFWorker } from "pdfjs-dist";
import pdfWorkerURL from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";
import type { GFXRect } from "../GFXGeometry";
import type {
    GFXPDFDocumentDescriptor,
    GFXPDFDocumentPageDescriptor,
    GFXPDFDocumentWorkerRequest,
    GFXPDFDocumentWorkerResponse,
    GFXPDFObjectSnapshotEntry,
    GFXPDFSnapshotObject,
    GFXPDFStreamDecoding,
    GFXPDFStreamParameters,
} from "./pdfDocumentProtocol";
import { hasBoundedPDFEnvelope } from "./pdfDocumentProtocol";
import type { GFXPDFErrorCode, GFXPDFMetadata } from "./pdfTypes";

const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<GFXPDFDocumentWorkerRequest>) => void) | null;
    postMessage(message: GFXPDFDocumentWorkerResponse): void;
};

function errorResponse(id: number, code: GFXPDFErrorCode, message: string): GFXPDFDocumentWorkerResponse {
    return Object.freeze({ id, ok: false, error: Object.freeze({ code, message }) });
}

function rect(value: Readonly<{ x: number; y: number; width: number; height: number }>): GFXRect {
    const result = { x: value.x, y: value.y, width: value.width, height: value.height };
    if (![result.x, result.y, result.width, result.height].every(Number.isFinite) || result.width < 0 || result.height < 0 || Math.max(Math.abs(result.x), Math.abs(result.y), result.width, result.height) > 1e6)
        throw Object.assign(new Error("PDF page box exceeds coordinate bounds."), { code: "limit" satisfies GFXPDFErrorCode });
    return Object.freeze(result);
}

function pageDescriptor(page: PDFPage): GFXPDFDocumentPageDescriptor {
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(rotation))
        throw Object.assign(new Error("Page rotation is not a quarter turn."), { code: "malformed" satisfies GFXPDFErrorCode });
    const userUnit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1;
    if (!Number.isFinite(userUnit) || userUnit <= 0 || userUnit > 75000)
        throw Object.assign(new Error("Invalid PDF page user unit."), { code: "limit" satisfies GFXPDFErrorCode });
    return Object.freeze({
        mediaBox: rect(page.getMediaBox()),
        cropBox: rect(page.getCropBox()),
        bleedBox: rect(page.getBleedBox()),
        trimBox: rect(page.getTrimBox()),
        artBox: rect(page.getArtBox()),
        rotation: rotation as 0 | 90 | 180 | 270,
        userUnit,
    });
}

function metadataFromPDFLib(pdf: PDFDocument): GFXPDFMetadata {
    return Object.freeze({ title: pdf.getTitle(), author: pdf.getAuthor(), subject: pdf.getSubject(), keywords: pdf.getKeywords() });
}

function boxFromView(view: readonly number[]): GFXRect {
    if (view.length < 4) throw new TypeError("PDF.js page view is malformed.");
    const x = Number(view[0]), y = Number(view[1]), right = Number(view[2]), top = Number(view[3]);
    return rect({ x, y, width: right - x, height: top - y });
}

type SnapshotBudget = { work: number; bytes: number; readonly maximumWork: number; readonly maximumBytes: number };

function snapshotReference(reference: PDFRef) {
    return Object.freeze({ objectNumber: reference.objectNumber, generationNumber: reference.generationNumber });
}

function filterNames(value: PDFObject | undefined): readonly string[] {
    if (!value || value === PDFNull) return Object.freeze([]);
    if (value instanceof PDFName) return Object.freeze([value.decodeText()]);
    if (!(value instanceof PDFArray))
        throw Object.assign(new Error("PDF stream Filter must be a name or array of names."), { code: "malformed" satisfies GFXPDFErrorCode });
    const names: string[] = [];
    for (let index = 0; index < value.size(); index++) {
        const item = value.get(index);
        if (!(item instanceof PDFName))
            throw Object.assign(new Error("PDF stream filter array contains a non-name entry."), { code: "malformed" satisfies GFXPDFErrorCode });
        names.push(item.decodeText());
    }
    return Object.freeze(names);
}

function streamParameters(dictionary: PDFDict): GFXPDFStreamParameters {
    const supported = new Set(["Predictor", "Colors", "BitsPerComponent", "Columns"]);
    const result: { predictor?: number; colors?: number; bitsPerComponent?: number; columns?: number; unsupportedKeys: readonly string[] } = { unsupportedKeys: Object.freeze([]) };
    const unsupported: string[] = [];
    for (const [key, value] of dictionary.entries()) {
        const name = key.decodeText();
        if (!supported.has(name)) {
            unsupported.push(name);
            continue;
        }
        if (!(value instanceof PDFNumber) || !Number.isSafeInteger(value.asNumber()))
            throw Object.assign(new Error(`PDF stream ${name} must be an integer.`), { code: "malformed" satisfies GFXPDFErrorCode });
        const number = value.asNumber();
        if (name === "Predictor") result.predictor = number;
        else if (name === "Colors") result.colors = number;
        else if (name === "BitsPerComponent") result.bitsPerComponent = number;
        else result.columns = number;
    }
    result.unsupportedKeys = Object.freeze(unsupported);
    return Object.freeze(result);
}

function streamDecoding(dictionary: PDFDict): GFXPDFStreamDecoding {
    const filters = filterNames(dictionary.lookup(PDFName.of("Filter")));
    const raw = dictionary.lookup(PDFName.of("DecodeParms"));
    if (!raw || raw === PDFNull)
        return Object.freeze({ filters, parameters: Object.freeze(Array.from({ length: filters.length }, () => null)) });
    if (filters.length === 1) {
        if (!(raw instanceof PDFDict))
            throw Object.assign(new Error("PDF stream DecodeParms must be a dictionary for a single filter."), { code: "malformed" satisfies GFXPDFErrorCode });
        return Object.freeze({ filters, parameters: Object.freeze([streamParameters(raw)]) });
    }
    if (!(raw instanceof PDFArray) || raw.size() !== filters.length)
        throw Object.assign(new Error("PDF stream DecodeParms must align with the filter chain."), { code: "malformed" satisfies GFXPDFErrorCode });
    const parameters: (GFXPDFStreamParameters | null)[] = [];
    for (let index = 0; index < raw.size(); index++) {
        const item = raw.get(index);
        if (item === PDFNull) parameters.push(null);
        else if (item instanceof PDFDict) parameters.push(streamParameters(item));
        else throw Object.assign(new Error("PDF stream DecodeParms contains a non-dictionary entry."), { code: "malformed" satisfies GFXPDFErrorCode });
    }
    return Object.freeze({ filters, parameters: Object.freeze(parameters) });
}

function snapshotObject(value: PDFObject, budget: SnapshotBudget, active: Set<PDFObject>, depth = 0): GFXPDFSnapshotObject {
    budget.work++;
    if (budget.work > budget.maximumWork || depth > 64)
        throw Object.assign(new Error("PDF object snapshot work limit exceeded."), { code: "limit" satisfies GFXPDFErrorCode });
    if (active.has(value))
        throw Object.assign(new Error("PDF direct-object cycle detected."), { code: "malformed" satisfies GFXPDFErrorCode });
    active.add(value);
    try {
        if (value === PDFNull) return Object.freeze({ kind: "null" });
        if (value instanceof PDFBool) return Object.freeze({ kind: "boolean", value: value.asBoolean() });
        if (value instanceof PDFNumber) {
            const number = value.asNumber();
            if (!Number.isFinite(number))
                throw Object.assign(new Error("Nonfinite PDF number."), { code: "malformed" satisfies GFXPDFErrorCode });
            return Object.freeze({ kind: "number", value: number });
        }
        if (value instanceof PDFName) return Object.freeze({ kind: "name", value: value.decodeText() });
        if (value instanceof PDFString || value instanceof PDFHexString) {
            const source = value.asBytes();
            budget.bytes += source.length;
            if (budget.bytes > budget.maximumBytes)
                throw Object.assign(new Error("PDF object snapshot byte budget exceeded."), { code: "limit" satisfies GFXPDFErrorCode });
            return Object.freeze({ kind: "string", value: value.decodeText(), bytes: source.slice() });
        }
        if (value instanceof PDFRef) return Object.freeze({ kind: "reference", reference: snapshotReference(value) });
        if (value instanceof PDFArray) {
            const items: GFXPDFSnapshotObject[] = [];
            for (let index = 0; index < value.size(); index++)
                items.push(snapshotObject(value.get(index), budget, active, depth + 1));
            return Object.freeze({ kind: "array", items: Object.freeze(items) });
        }
        if (value instanceof PDFRawStream) {
            const source = value.getContents();
            budget.bytes += source.length;
            if (budget.bytes > budget.maximumBytes)
                throw Object.assign(new Error("PDF encoded stream snapshot exceeds byte budget."), { code: "limit" satisfies GFXPDFErrorCode });
            return Object.freeze({
                kind: "stream",
                dictionary: snapshotObject(value.dict, budget, active, depth + 1),
                encodedBytes: source.slice(),
                decoding: streamDecoding(value.dict),
            });
        }
        if (value instanceof PDFDict) {
            const entries: Record<string, GFXPDFSnapshotObject> = Object.create(null);
            for (const [key, item] of value.entries())
                entries[key.decodeText()] = snapshotObject(item, budget, active, depth + 1);
            return Object.freeze({ kind: "dictionary", entries: Object.freeze(entries) });
        }
        throw Object.assign(new Error("Unsupported PDF object representation."), { code: "unsupported" satisfies GFXPDFErrorCode });
    }
    finally {
        active.delete(value);
    }
}

function objectSnapshot(backend: PDFDocument, request: GFXPDFDocumentWorkerRequest & Readonly<{ operation: "open" }>): readonly GFXPDFObjectSnapshotEntry[] {
    const objects = backend.context.enumerateIndirectObjects();
    if (objects.length > request.options.maximumObjectCount)
        throw Object.assign(new Error("PDF object limit exceeded."), { code: "limit" satisfies GFXPDFErrorCode });
    const budget: SnapshotBudget = {
        work: 0,
        bytes: 0,
        maximumWork: Math.min(200000, Math.max(20000, request.options.maximumObjectCount * 16)),
        maximumBytes: request.options.maximumDecodedBytes,
    };
    return Object.freeze(objects.map(([reference, value]) => Object.freeze({
        reference: snapshotReference(reference),
        value: snapshotObject(value, budget, new Set()),
    })));
}

async function openDescriptor(request: GFXPDFDocumentWorkerRequest & Readonly<{ operation: "open" }>): Promise<GFXPDFDocumentDescriptor> {
    if (!(request.bytes instanceof ArrayBuffer) || request.bytes.byteLength < 8 || request.bytes.byteLength > request.options.maximumEncodedBytes)
        throw Object.assign(new Error("PDF input exceeds the encoded byte budget."), { code: "limit" satisfies GFXPDFErrorCode });
    const bytes = new Uint8Array(request.bytes);
    if (!hasBoundedPDFEnvelope(bytes))
        throw Object.assign(new Error("PDF trailer or cross-reference envelope is malformed or truncated."), { code: "malformed" satisfies GFXPDFErrorCode });

    let backend: PDFDocument | undefined;
    try {
        backend = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false, parseSpeed: 100, capNumbers: true });
    }
    catch (error) {
        if (!(error instanceof EncryptedPDFError) && !(error instanceof Error && error.message === new EncryptedPDFError().message)) throw error;
    }
    if (backend) {
        const objects = backend.context.enumerateIndirectObjects().length;
        if (objects > request.options.maximumObjectCount)
            throw Object.assign(new Error("PDF object limit exceeded."), { code: "limit" satisfies GFXPDFErrorCode });
        const pages = backend.getPages().map(pageDescriptor);
        if (pages.length < 1 || pages.length > request.options.maximumPageCount)
            throw Object.assign(new Error("PDF page limit exceeded."), { code: "limit" satisfies GFXPDFErrorCode });
        return Object.freeze({
            pageCount: pages.length,
            pages: Object.freeze(pages),
            metadata: metadataFromPDFLib(backend),
            permissions: Object.freeze({ raw: null }),
            objects: objectSnapshot(backend, request),
        });
    }

    if (typeof Worker !== "function")
        throw Object.assign(new Error("Encrypted PDF negotiation requires nested module worker support."), { code: "unsupported" satisfies GFXPDFErrorCode });
    const browserWorker = new Worker(pdfWorkerURL, { type: "module", name: "syncloudos-gfx-pdf-password" });
    let pdfWorker: PDFWorker;
    try {
        pdfWorker = new PDFWorker({ port: browserWorker as never });
    }
    catch (error) {
        browserWorker.terminate();
        throw error;
    }
    const loadingTask = getDocument({
        data: bytes.slice(),
        password: request.options.password,
        worker: pdfWorker,
        stopAtErrors: true,
        disableFontFace: true,
        useSystemFonts: false,
        enableXfa: false,
        maxImageSize: request.options.maximumDecodedBytes >>> 2,
        canvasMaxAreaInBytes: request.options.maximumDecodedBytes,
    });
    try {
        const passwordFailure = new Promise<never>((_resolve, reject) => {
            loadingTask.onPassword = (_updatePassword: (password: string) => void, reason: number) => {
                const code = reason === PasswordResponses.NEED_PASSWORD ? "password-required" : "incorrect-password";
                reject(Object.assign(new Error(code === "password-required" ? "PDF password is required." : "PDF password is incorrect."), { code: code satisfies GFXPDFErrorCode }));
            };
        });
        const pdf = await Promise.race([loadingTask.promise, passwordFailure]);
        if (pdf.numPages < 1 || pdf.numPages > request.options.maximumPageCount)
            throw Object.assign(new Error("PDF page limit exceeded."), { code: "limit" satisfies GFXPDFErrorCode });
        const rawPermissions = await pdf.getPermissions();
        const permissions = Object.freeze({ raw: rawPermissions ? Object.freeze([...rawPermissions]) : null });
        const metadataResult = await pdf.getMetadata().catch(() => null);
        const info = (metadataResult?.info ?? {}) as Record<string, unknown>;
        const metadata: GFXPDFMetadata = Object.freeze({
            ...(typeof info.Title === "string" ? { title: info.Title } : {}),
            ...(typeof info.Author === "string" ? { author: info.Author } : {}),
            ...(typeof info.Subject === "string" ? { subject: info.Subject } : {}),
            ...(typeof info.Keywords === "string" ? { keywords: info.Keywords } : {}),
        });
        const pages: GFXPDFDocumentPageDescriptor[] = [];
        for (let index = 1; index <= pdf.numPages; index++) {
            const page = await pdf.getPage(index);
            const crop = boxFromView(page.view);
            const rotation = ((page.rotate % 360) + 360) % 360;
            if (![0, 90, 180, 270].includes(rotation))
                throw Object.assign(new Error("Page rotation is not a quarter turn."), { code: "malformed" satisfies GFXPDFErrorCode });
            pages.push(Object.freeze({ mediaBox: crop, cropBox: crop, bleedBox: crop, trimBox: crop, artBox: crop, rotation: rotation as 0 | 90 | 180 | 270, userUnit: page.userUnit }));
            page.cleanup();
        }
        return Object.freeze({ pageCount: pages.length, pages: Object.freeze(pages), metadata, permissions });
    }
    finally {
        try { await loadingTask.destroy(); } catch { /* worker termination remains authoritative */ }
        try { await pdfWorker.destroy(); } catch { /* worker termination remains authoritative */ }
        try { browserWorker.terminate(); } catch { /* worker termination remains authoritative */ }
    }
}

async function preparePage(request: GFXPDFDocumentWorkerRequest & Readonly<{ operation: "prepare-page" }>): Promise<ArrayBuffer> {
    if (!(request.bytes instanceof ArrayBuffer) || request.bytes.byteLength < 8 || request.bytes.byteLength > request.options.maximumEncodedBytes)
        throw Object.assign(new Error("PDF input exceeds the encoded byte budget."), { code: "limit" satisfies GFXPDFErrorCode });
    if (!Number.isSafeInteger(request.pageIndex) || request.pageIndex < 0 || request.pageIndex >= request.options.maximumPageCount)
        throw Object.assign(new Error("PDF page index is out of bounds."), { code: "limit" satisfies GFXPDFErrorCode });
    const bytes = new Uint8Array(request.bytes);
    if (!hasBoundedPDFEnvelope(bytes))
        throw Object.assign(new Error("PDF trailer or cross-reference envelope is malformed or truncated."), { code: "malformed" satisfies GFXPDFErrorCode });
    let source: PDFDocument;
    try {
        source = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false, parseSpeed: 100, capNumbers: true });
    }
    catch (error) {
        if (error instanceof EncryptedPDFError || (error instanceof Error && error.message === new EncryptedPDFError().message)) {
            if (request.options.password !== undefined)
                throw Object.assign(new Error("Encrypted PDF page embedding is unavailable for this parser backend."), { code: "unsupported" satisfies GFXPDFErrorCode });
            throw Object.assign(new Error("PDF password is required."), { code: "password-required" satisfies GFXPDFErrorCode });
        }
        throw error;
    }
    const objects = source.context.enumerateIndirectObjects().length;
    if (objects > request.options.maximumObjectCount)
        throw Object.assign(new Error("PDF object limit exceeded."), { code: "limit" satisfies GFXPDFErrorCode });
    if (request.pageIndex >= source.getPageCount())
        throw Object.assign(new Error("PDF page index is out of bounds."), { code: "malformed" satisfies GFXPDFErrorCode });
    const output = await PDFDocument.create({ updateMetadata: false });
    const [copied] = await output.copyPages(source, [request.pageIndex]);
    if (!copied)
        throw Object.assign(new Error("PDF page could not be copied for embedding."), { code: "malformed" satisfies GFXPDFErrorCode });
    output.addPage(copied);
    const encoded = await output.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50, updateFieldAppearances: false });
    if (encoded.byteLength > request.options.maximumDecodedBytes)
        throw Object.assign(new Error("Prepared PDF page exceeds the decoded byte budget."), { code: "limit" satisfies GFXPDFErrorCode });
    const owned = Uint8Array.from(encoded);
    return owned.buffer;
}

scope.onmessage = event => {
    const request = event.data;
    if (!request || !Number.isSafeInteger(request.id)) return;
    const work = request.operation === "open"
        ? openDescriptor(request).then(value => Object.freeze({ id: request.id, ok: true, kind: "document" as const, value }))
        : preparePage(request).then(bytes => Object.freeze({ id: request.id, ok: true, kind: "prepared-page" as const, value: Object.freeze({ bytes }) }));
    void work.then(
        response => scope.postMessage(response),
        error => {
            const code = (error as { code?: unknown })?.code;
            const typed = typeof code === "string" && ["malformed", "encrypted", "password-required", "incorrect-password", "permission", "limit", "disposed", "unsupported"].includes(code)
                ? code as GFXPDFErrorCode
                : "malformed";
            scope.postMessage(errorResponse(request.id, typed, error instanceof Error ? error.message : "Malformed PDF."));
        },
    );
};
