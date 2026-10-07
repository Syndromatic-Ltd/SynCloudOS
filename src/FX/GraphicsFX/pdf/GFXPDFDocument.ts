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

import { PDFDocument, EncryptedPDFError, PDFName, PDFNumber, type PDFPage } from "pdf-lib";
import { normaliseRect, type GFXRect } from "../GFXGeometry";
import { hasBoundedPDFEnvelope, normalisePDFOpenOptions, type GFXPDFDocumentDescriptor, type GFXPDFDocumentPageDescriptor, type GFXPDFNormalizedOpenOptions, type GFXPDFObjectSnapshotEntry } from "./pdfDocumentProtocol";
import { GFXPDFError, bounded, type GFXPDFViewport, type GFXPDFMetadata, type GFXPDFOpenOptions, type GFXPDFPermissionMetadata } from "./pdfTypes";
import { GFXPDFRenderDestination, assertPDFDestination, beginPDFDestination, finishPDFDestination, publishPDFDestination } from "./GFXPDFRenderDestination";
import { GFXPDFRenderTask } from "./GFXPDFRenderTask";
type DocumentState = {
    backend?: PDFDocument;
    bytes: Uint8Array;
    tasks: Set<GFXPDFRenderTask>;
    lifetime: AbortController;
    options: GFXPDFNormalizedOpenOptions;
    objects?: readonly GFXPDFObjectSnapshotEntry[];
    password?: string;
};
const owners = new WeakMap<GFXPDFDocument, DocumentState>();
const pageOwners = new WeakMap<GFXPDFPage, GFXPDFDocument>();
const activeRenderTasks = new Set<GFXPDFRenderTask>();
const maximumActiveRenderTasks = 8;
let renderBackend: Promise<typeof import("./browserPDFRenderer")> | undefined;
export function pdfBackend(document: GFXPDFDocument): PDFDocument {
    const state = pdfDocumentState(document);
    if (!state.backend)
        throw new GFXPDFError("unsupported", "This isolated PDF document does not expose an in-process parser backend.");
    return state.backend;
}
function pdfDocumentState(document: GFXPDFDocument): DocumentState {
    const state = owners.get(document);
    if (!state)
        throw new GFXPDFError("disposed", "PDF document is disposed or invalid.");
    return state;
}
export function pdfObjectSnapshot(document: GFXPDFDocument): readonly GFXPDFObjectSnapshotEntry[] | undefined {
    return pdfDocumentState(document).objects;
}
export function pdfAssertLive(document: GFXPDFDocument): void {
    pdfDocumentState(document);
}
export async function pdfPageForEmbedding(document: GFXPDFDocument, index: number, signal?: AbortSignal): Promise<PDFPage> {
    const state = pdfDocumentState(document);
    if (!Number.isSafeInteger(index) || index < 0)
        throw new RangeError("PDF page index is out of bounds.");
    if (state.backend) {
        if (index >= state.backend.getPageCount()) throw new RangeError("PDF page index is out of bounds.");
        return state.backend.getPage(index);
    }
    signal?.throwIfAborted();
    state.lifetime.signal.throwIfAborted();
    const combined = signal ? AbortSignal.any([signal, state.lifetime.signal]) : state.lifetime.signal;
    const { preparePDFPageInBrowser } = await import("./BrowserPDFDocumentWorker");
    combined.throwIfAborted();
    const prepared = await preparePDFPageInBrowser(state.bytes, index, state.options, combined);
    combined.throwIfAborted();
    if (owners.get(document) !== state)
        throw new DOMException("PDF document was disposed during page preparation.", "AbortError");
    const trusted = await PDFDocument.load(prepared, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false, parseSpeed: 100, capNumbers: true });
    combined.throwIfAborted();
    if (owners.get(document) !== state)
        throw new DOMException("PDF document was disposed during page preparation.", "AbortError");
    if (trusted.getPageCount() !== 1)
        throw new GFXPDFError("malformed", "Prepared PDF page is not a single-page document.");
    return trusted.getPage(0);
}
function pageDescriptor(page: PDFPage): GFXPDFDocumentPageDescriptor {
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(rotation))
        throw new GFXPDFError("malformed", "Page rotation is not a quarter turn.");
    const userUnit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1;
    bounded(userUnit, "page user unit", Number.EPSILON, 75000);
    return Object.freeze({
        mediaBox: normaliseRect(page.getMediaBox()),
        cropBox: normaliseRect(page.getCropBox()),
        bleedBox: normaliseRect(page.getBleedBox()),
        trimBox: normaliseRect(page.getTrimBox()),
        artBox: normaliseRect(page.getArtBox()),
        rotation: rotation as 0 | 90 | 180 | 270,
        userUnit,
    });
}
let createPage: (owner: GFXPDFDocument, index: number, page: GFXPDFDocumentPageDescriptor) => GFXPDFPage;
export class GFXPDFPage {
    static {
        createPage = (owner, index, page) => new GFXPDFPage(owner, index, page);
    }
    readonly mediaBox: GFXRect;
    readonly cropBox: GFXRect;
    readonly bleedBox: GFXRect;
    readonly trimBox: GFXRect;
    readonly artBox: GFXRect;
    readonly rotation: 0 | 90 | 180 | 270;
    readonly userUnit: number;
    private constructor(owner: GFXPDFDocument, readonly index: number, page: GFXPDFDocumentPageDescriptor) {
        pageOwners.set(this, owner);
        this.mediaBox = normaliseRect(page.mediaBox);
        this.cropBox = normaliseRect(page.cropBox);
        this.bleedBox = normaliseRect(page.bleedBox);
        this.trimBox = normaliseRect(page.trimBox);
        this.artBox = normaliseRect(page.artBox);
        this.rotation = page.rotation;
        this.userUnit = page.userUnit;
        bounded(this.userUnit, "page user unit", Number.EPSILON, 75000);
        for (const box of [this.mediaBox, this.cropBox, this.bleedBox, this.trimBox, this.artBox]) {
            if (!Number.isFinite(box.x + box.width) || !Number.isFinite(box.y + box.height) || Math.max(Math.abs(box.x), Math.abs(box.y), box.width, box.height) > 1e6)
                throw new GFXPDFError("limit", "PDF page box exceeds coordinate bounds.");
        }
        Object.freeze(this);
    }
    viewport(scale = 1, box: "media" | "crop" = "crop"): GFXPDFViewport {
        bounded(scale, "viewport scale", .001, 32);
        if (box !== "media" && box !== "crop")
            throw new TypeError("Unknown PDF viewport box.");
        const r = box === "media" ? this.mediaBox : this.cropBox;
        const projectedScale = scale * this.userUnit;
        const transform = this.rotation === 0 ? { a: projectedScale, b: 0, c: 0, d: -projectedScale, tx: -r.x * projectedScale, ty: (r.y + r.height) * projectedScale } : this.rotation === 90 ? { a: 0, b: projectedScale, c: projectedScale, d: 0, tx: -r.y * projectedScale, ty: -r.x * projectedScale } : this.rotation === 180 ? { a: -projectedScale, b: 0, c: 0, d: projectedScale, tx: (r.x + r.width) * projectedScale, ty: -r.y * projectedScale } : { a: 0, b: -projectedScale, c: -projectedScale, d: 0, tx: (r.y + r.height) * projectedScale, ty: (r.x + r.width) * projectedScale };
        return Object.freeze({ width: (this.rotation % 180 ? r.height : r.width) * projectedScale, height: (this.rotation % 180 ? r.width : r.height) * projectedScale, transform: Object.freeze(transform) });
    }
    startRender(destination = new GFXPDFRenderDestination(), signal?: AbortSignal): GFXPDFRenderTask {
        const owner = pageOwners.get(this), state = owner ? owners.get(owner) : undefined;
        if (!owner || !state)
            throw new GFXPDFError("disposed", "PDF document is disposed or invalid.");
        if (!(destination instanceof GFXPDFRenderDestination))
            throw new TypeError("GFXPDFRenderDestination required.");
        if (signal !== undefined && !(signal instanceof AbortSignal))
            throw new TypeError("AbortSignal required.");
        signal?.throwIfAborted();
        if (activeRenderTasks.size >= maximumActiveRenderTasks)
            throw new GFXPDFError("limit", "Too many PDF render tasks are active.");
        const viewport = this.viewport(destination.scale, destination.box);
        const width = Math.ceil(viewport.width), height = Math.ceil(viewport.height), pixels = width * height;
        if (!Number.isSafeInteger(pixels) || width < 1 || height < 1 || pixels > destination.maximumPixels)
            throw new RangeError("PDF render exceeds the destination pixel budget.");
        let generation = -1;
        const task = new GFXPDFRenderTask(async taskSignal => {
            const check = () => {
                taskSignal.throwIfAborted();
                signal?.throwIfAborted();
                if (owners.get(owner) !== state)
                    throw new DOMException("PDF document was disposed during rendering.", "AbortError");
                assertPDFDestination(destination, generation);
            };
            check();
            const { renderPDFPageInBrowser } = await (renderBackend ??= import("./browserPDFRenderer"));
            check();
            const box = destination.box === "media" ? this.mediaBox : this.cropBox;
            const image = await renderPDFPageInBrowser(Object.freeze({ bytes: state.bytes, pageIndex: this.index, box: destination.box, viewBox: box, rotation: this.rotation, scale: destination.scale, width, height, maximumPixels: destination.maximumPixels, ...(state.password !== undefined ? { password: state.password } : {}) }), taskSignal);
            check();
            if (image.width !== width || image.height !== height || image.pixelFormat !== "rgba8" || image.alpha !== "straight" || image.colourSpace !== "srgb")
                throw new GFXPDFError("malformed", "PDF renderer returned an invalid image descriptor.");
            publishPDFDestination(destination, generation, image);
            return image;
        });
        generation = beginPDFDestination(destination, () => task.cancel());
        state.tasks.add(task);
        activeRenderTasks.add(task);
        const abort = () => task.cancel();
        signal?.addEventListener("abort", abort, { once: true });
        task.waitUntilCompleted().finally(() => {
            finishPDFDestination(destination, generation);
            state.tasks.delete(task);
            activeRenderTasks.delete(task);
            signal?.removeEventListener("abort", abort);
        }).catch(() => undefined);
        return task;
    }
    render(destination = new GFXPDFRenderDestination(), signal?: AbortSignal) {
        return this.startRender(destination, signal).waitUntilCompleted();
    }
}
export class GFXPDFDocument {
    readonly #pages: readonly GFXPDFPage[];
    readonly metadata: GFXPDFMetadata;
    readonly permissions: GFXPDFPermissionMetadata;
    private constructor(backend: PDFDocument | undefined, bytes: Uint8Array, descriptor: GFXPDFDocumentDescriptor, options: GFXPDFNormalizedOpenOptions) {
        owners.set(this, {
            ...(backend ? { backend } : {}),
            bytes,
            tasks: new Set(),
            lifetime: new AbortController(),
            options,
            ...(descriptor.objects ? { objects: descriptor.objects } : {}),
            ...(options.password !== undefined ? { password: options.password } : {}),
        });
        if (descriptor.pages.length !== descriptor.pageCount)
            throw new GFXPDFError("malformed", "PDF page descriptor count is inconsistent.");
        this.#pages = Object.freeze(descriptor.pages.map((page, index) => createPage(this, index, page)));
        this.metadata = Object.freeze({ ...descriptor.metadata });
        this.permissions = Object.freeze({ raw: descriptor.permissions.raw ? Object.freeze([...descriptor.permissions.raw]) : null });
        Object.freeze(this);
    }
    static open(bytes: Uint8Array, signal?: AbortSignal): Promise<GFXPDFDocument>;
    static open(bytes: Uint8Array, options?: GFXPDFOpenOptions, signal?: AbortSignal): Promise<GFXPDFDocument>;
    static async open(bytes: Uint8Array, optionsOrSignal: GFXPDFOpenOptions | AbortSignal = {}, maybeSignal?: AbortSignal): Promise<GFXPDFDocument> {
        const signal = typeof AbortSignal === "function" && optionsOrSignal instanceof AbortSignal ? optionsOrSignal : maybeSignal;
        const options = typeof AbortSignal === "function" && optionsOrSignal instanceof AbortSignal ? {} : optionsOrSignal;
        signal?.throwIfAborted();
        if (!(bytes instanceof Uint8Array))
            throw new TypeError("PDF bytes must be a Uint8Array.");
        const normalised = normalisePDFOpenOptions(options as GFXPDFOpenOptions);
        if (bytes.length < 8 || bytes.length > normalised.maximumEncodedBytes)
            throw new GFXPDFError("limit", "PDF input exceeds the encoded byte budget.");
        const owned = bytes.slice();
        if (String.fromCharCode(...owned.subarray(0, 5)) !== "%PDF-")
            throw new GFXPDFError("malformed", "PDF header is missing.");
        if (typeof Worker === "function") {
            const { openPDFDocumentInBrowser } = await import("./BrowserPDFDocumentWorker");
            const descriptor = await openPDFDocumentInBrowser(owned, options as GFXPDFOpenOptions, signal as AbortSignal | undefined);
            signal?.throwIfAborted();
            return new GFXPDFDocument(undefined, owned, descriptor, normalised);
        }
        if (!hasBoundedPDFEnvelope(owned))
            throw new GFXPDFError("malformed", "PDF trailer or cross-reference envelope is malformed or truncated.");
        try {
            const backend = await PDFDocument.load(owned, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false, parseSpeed: 100, capNumbers: true });
            signal?.throwIfAborted();
            const pages = backend.getPages();
            const objects = backend.context.enumerateIndirectObjects().length;
            if (pages.length < 1 || pages.length > normalised.maximumPageCount || objects > normalised.maximumObjectCount)
                throw new GFXPDFError("limit", "PDF page or object limit exceeded.");
            const descriptor: GFXPDFDocumentDescriptor = Object.freeze({
                pageCount: pages.length,
                pages: Object.freeze(pages.map(pageDescriptor)),
                metadata: Object.freeze({ title: backend.getTitle(), author: backend.getAuthor(), subject: backend.getSubject(), keywords: backend.getKeywords() }),
                permissions: Object.freeze({ raw: null }),
            });
            return new GFXPDFDocument(backend, owned, descriptor, normalised);
        }
        catch (error) {
            signal?.throwIfAborted();
            if (error instanceof GFXPDFError)
                throw error;
            if (error instanceof EncryptedPDFError || (error instanceof Error && error.message === new EncryptedPDFError().message)) {
                if (normalised.password !== undefined)
                    throw new GFXPDFError("unsupported", "Encrypted PDF password validation requires the isolated browser parser backend.");
                throw new GFXPDFError("password-required", "PDF password is required.");
            }
            throw new GFXPDFError("malformed", error instanceof Error ? error.message : "Malformed PDF.");
        }
    }
    get pageCount(): number {
        pdfAssertLive(this);
        return this.#pages.length;
    }
    page(index: number): GFXPDFPage {
        pdfAssertLive(this);
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.#pages.length)
            throw new RangeError("PDF page index is out of bounds.");
        return this.#pages[index]!;
    }
    dispose(): void {
        const state = owners.get(this);
        if (!state)
            return;
        owners.delete(this);
        state.lifetime.abort(new DOMException("PDF document disposed.", "AbortError"));
        for (const task of state.tasks)
            task.cancel();
        state.tasks.clear();
        state.bytes.fill(0);
    }
}
