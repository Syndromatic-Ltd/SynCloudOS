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

import pdfDocumentWorkerURL from "./pdf-document.worker.ts?worker&url";
import { GFXPDFError, type GFXPDFOpenOptions } from "./pdfTypes";
import {
    normalisePDFOpenOptions,
    type GFXPDFDocumentDescriptor,
    type GFXPDFDocumentWorkerRequest,
    type GFXPDFDocumentWorkerResponse,
} from "./pdfDocumentProtocol";

export interface BrowserPDFDocumentWorkerOptions {
    readonly maximumOperationMilliseconds?: number;
}

export class BrowserPDFDocumentWorker {
    readonly #worker: Worker;
    readonly #maximumOperationMilliseconds: number | undefined;
    #sequence = 0;
    #disposed = false;
    #pending: Readonly<{ id: number; reject: (reason: unknown) => void; cleanup: () => void }> | undefined;

    constructor(worker: Worker, options: BrowserPDFDocumentWorkerOptions = {}) {
        if (!worker || typeof worker.postMessage !== "function" || typeof worker.terminate !== "function")
            throw new TypeError("PDF document Worker required.");
        if (options.maximumOperationMilliseconds !== undefined && (!Number.isSafeInteger(options.maximumOperationMilliseconds) || options.maximumOperationMilliseconds < 10 || options.maximumOperationMilliseconds > 60000))
            throw new RangeError("Invalid PDF worker operation time limit.");
        this.#worker = worker;
        this.#maximumOperationMilliseconds = options.maximumOperationMilliseconds;
    }

    open(bytes: Uint8Array, options: GFXPDFOpenOptions = {}, signal?: AbortSignal): Promise<GFXPDFDocumentDescriptor> {
        if (this.#disposed)
            return Promise.reject(new GFXPDFError("disposed", "PDF document worker is disposed."));
        if (this.#pending)
            return Promise.reject(new GFXPDFError("limit", "PDF document worker already has an active operation."));
        signal?.throwIfAborted();
        if (!(bytes instanceof Uint8Array))
            return Promise.reject(new TypeError("PDF bytes must be a Uint8Array."));
        const normalised = normalisePDFOpenOptions({ ...options, ...(this.#maximumOperationMilliseconds !== undefined ? { maximumOperationMilliseconds: this.#maximumOperationMilliseconds } : {}) });
        if (bytes.length < 8 || bytes.length > normalised.maximumEncodedBytes)
            return Promise.reject(new GFXPDFError("limit", "PDF input exceeds the encoded byte budget."));
        const owned = bytes.slice();
        const id = ++this.#sequence;
        const request: GFXPDFDocumentWorkerRequest = Object.freeze({ id, operation: "open", bytes: owned.buffer, options: normalised });
        return this.#execute(request, normalised.maximumOperationMilliseconds, signal, response => {
            if (response.kind !== "document") throw new TypeError("PDF document worker returned the wrong response kind.");
            return response.value;
        });
    }

    preparePage(bytes: Uint8Array, pageIndex: number, options: GFXPDFOpenOptions = {}, signal?: AbortSignal): Promise<Uint8Array> {
        if (this.#disposed)
            return Promise.reject(new GFXPDFError("disposed", "PDF document worker is disposed."));
        if (this.#pending)
            return Promise.reject(new GFXPDFError("limit", "PDF document worker already has an active operation."));
        signal?.throwIfAborted();
        if (!(bytes instanceof Uint8Array))
            return Promise.reject(new TypeError("PDF bytes must be a Uint8Array."));
        if (!Number.isSafeInteger(pageIndex) || pageIndex < 0)
            return Promise.reject(new RangeError("PDF page index is out of bounds."));
        const normalised = normalisePDFOpenOptions({ ...options, ...(this.#maximumOperationMilliseconds !== undefined ? { maximumOperationMilliseconds: this.#maximumOperationMilliseconds } : {}) });
        if (bytes.length < 8 || bytes.length > normalised.maximumEncodedBytes)
            return Promise.reject(new GFXPDFError("limit", "PDF input exceeds the encoded byte budget."));
        const owned = bytes.slice();
        const id = ++this.#sequence;
        const request: GFXPDFDocumentWorkerRequest = Object.freeze({ id, operation: "prepare-page", bytes: owned.buffer, pageIndex, options: normalised });
        return this.#execute(request, normalised.maximumOperationMilliseconds, signal, response => {
            if (response.kind !== "prepared-page" || !(response.value.bytes instanceof ArrayBuffer))
                throw new TypeError("PDF document worker returned the wrong prepared-page response.");
            return new Uint8Array(response.value.bytes);
        });
    }

    #execute<T>(request: GFXPDFDocumentWorkerRequest, maximumOperationMilliseconds: number, signal: AbortSignal | undefined, project: (response: Extract<GFXPDFDocumentWorkerResponse, Readonly<{ ok: true }>>) => T): Promise<T> {
        const id = request.id;
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const finish = (operation: () => void) => {
                if (settled) return;
                settled = true;
                cleanup();
                this.#pending = undefined;
                operation();
            };
            const terminate = () => {
                try { this.#worker.terminate(); } catch { /* termination is best-effort */ }
                this.#disposed = true;
            };
            const onAbort = () => finish(() => {
                terminate();
                reject(signal?.reason ?? new DOMException("PDF document parse cancelled.", "AbortError"));
            });
            const onError = (event: ErrorEvent) => finish(() => {
                terminate();
                reject(event.error instanceof Error ? event.error : new Error(event.message || "PDF document worker failed."));
            });
            const onMessage = (event: MessageEvent<GFXPDFDocumentWorkerResponse>) => {
                const response = event.data;
                if (!response || response.id !== id) return;
                finish(() => {
                    terminate();
                    if (!response.ok) reject(new GFXPDFError(response.error.code, response.error.message));
                    else {
                        try { resolve(project(response)); }
                        catch (error) { reject(error); }
                    }
                });
            };
            const cleanup = () => {
                if (timer !== undefined) clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                this.#worker.removeEventListener("message", onMessage);
                this.#worker.removeEventListener("error", onError);
            };
            this.#worker.addEventListener("message", onMessage);
            this.#worker.addEventListener("error", onError);
            signal?.addEventListener("abort", onAbort, { once: true });
            timer = setTimeout(() => finish(() => {
                terminate();
                reject(new GFXPDFError("limit", "PDF document parse exceeded its operation time budget."));
            }), maximumOperationMilliseconds);
            this.#pending = Object.freeze({ id, reject, cleanup });
            try {
                this.#worker.postMessage(request, [request.bytes]);
            }
            catch (error) {
                finish(() => {
                    terminate();
                    reject(error);
                });
            }
        });
    }

    dispose(): void {
        if (this.#disposed) return;
        this.#disposed = true;
        const pending = this.#pending;
        this.#pending = undefined;
        pending?.cleanup();
        pending?.reject(new DOMException("PDF document worker disposed.", "AbortError"));
        try { this.#worker.terminate(); } catch { /* continue disposal */ }
    }
}

export async function openPDFDocumentInBrowser(bytes: Uint8Array, options: GFXPDFOpenOptions = {}, signal?: AbortSignal): Promise<GFXPDFDocumentDescriptor> {
    if (typeof Worker !== "function")
        throw new GFXPDFError("unsupported", "PDF document isolation requires module worker support.");
    const worker = new Worker(pdfDocumentWorkerURL, { type: "module", name: "syncloudos-gfx-pdf-document" });
    const backend = new BrowserPDFDocumentWorker(worker);
    try { return await backend.open(bytes, options, signal); }
    finally { backend.dispose(); }
}

export async function preparePDFPageInBrowser(bytes: Uint8Array, pageIndex: number, options: GFXPDFOpenOptions = {}, signal?: AbortSignal): Promise<Uint8Array> {
    if (typeof Worker !== "function")
        throw new GFXPDFError("unsupported", "PDF page isolation requires module worker support.");
    const worker = new Worker(pdfDocumentWorkerURL, { type: "module", name: "syncloudos-gfx-pdf-page" });
    const backend = new BrowserPDFDocumentWorker(worker);
    try { return await backend.preparePage(bytes, pageIndex, options, signal); }
    finally { backend.dispose(); }
}
