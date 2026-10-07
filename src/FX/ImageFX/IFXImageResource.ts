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

import { GFXImage } from "../GraphicsFX/GFXImage";
import { createGFXPixelLease, type GFXPixelLease } from "../GraphicsFX/GFXPixelLease";
import type { GFXSize } from "../GraphicsFX/GFXGeometry";
import { IFXImage } from "./IFXImage";
/** The host projects one resource and one bound export-authorized operation. */
export interface IFXResourceHandle {
    readonly state: "loading" | "ready" | "failed" | "released";
    readonly revision: number;
    readonly src: string;
    readonly intrinsicSize: GFXSize | null;
    readonly density: number | null;
    /** EXIF orientation of the encoded source; decoded pixels may already be oriented. */
    readonly sourceOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
    readonly sourceICCProfile: Uint8Array | null;
    readonly accessibleLabel: string;
    readonly renderingMode: "original" | "template";
    readonly tintColour: string | null;
    readonly capInsets: Readonly<{
        top: number;
        right: number;
        bottom: number;
        left: number;
    }> | null;
    readonly resizingMode: "stretch" | "tile" | "cap-insets";
    readonly ready: Promise<void>;
    subscribe(listener: () => void): () => void;
    release(): void;
}
export interface IFXImageResourcePort {
    readonly resource: IFXResourceHandle;
    readPixels(signal?: AbortSignal): Promise<GFXImage>;
    export(format: "image/png" | "image/webp", signal?: AbortSignal): Promise<Uint8Array>;
}
export class IFXImageResource implements IFXResourceHandle {
    readonly #port: IFXImageResourcePort;
    readonly #controller = new AbortController();
    constructor(port: IFXImageResourcePort) {
        if (!port || typeof port.readPixels !== "function" || typeof port.export !== "function" || !port.resource)
            throw new TypeError("Projected image resource port required.");
        this.#port = Object.freeze({ resource: port.resource, readPixels: port.readPixels.bind(port), export: port.export.bind(port) });
        Object.freeze(this);
    }
    get state() {
        return this.#port.resource.state;
    }
    get revision() {
        return this.#port.resource.revision;
    }
    get src() {
        return this.#port.resource.src;
    }
    get intrinsicSize() {
        return this.#port.resource.intrinsicSize;
    }
    get density() {
        return this.#port.resource.density;
    }
    get sourceOrientation() {
        return this.#port.resource.sourceOrientation;
    }
    get sourceICCProfile() {
        return this.#port.resource.sourceICCProfile;
    }
    get accessibleLabel() {
        return this.#port.resource.accessibleLabel;
    }
    get renderingMode() {
        return this.#port.resource.renderingMode;
    }
    get tintColour() {
        return this.#port.resource.tintColour;
    }
    get capInsets() {
        return this.#port.resource.capInsets;
    }
    get resizingMode() {
        return this.#port.resource.resizingMode;
    }
    get ready() {
        return this.#port.resource.ready;
    }
    readonly subscribe = (listener: () => void): (() => void) => {
        return this.#port.resource.subscribe(listener);
    };
    async #runOwned<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
        this.#controller.signal.throwIfAborted();
        signal?.throwIfAborted();
        const controller = new AbortController();
        const abort = () => controller.abort(signal?.reason ?? this.#controller.signal.reason ?? new DOMException("Image resource aborted.", "AbortError"));
        signal?.addEventListener("abort", abort, { once: true });
        this.#controller.signal.addEventListener("abort", abort, { once: true });
        try {
            await new Promise<void>((resolve, reject) => {
                const abortReady = () => {
                    controller.signal.removeEventListener("abort", abortReady);
                    reject(controller.signal.reason);
                };
                controller.signal.addEventListener("abort", abortReady, { once: true });
                this.ready.then(() => {
                    controller.signal.removeEventListener("abort", abortReady);
                    resolve();
                }, error => {
                    controller.signal.removeEventListener("abort", abortReady);
                    reject(error);
                });
                if (controller.signal.aborted)
                    abortReady();
            });
            controller.signal.throwIfAborted();
            const revision = this.revision;
            const result = await operation(controller.signal);
            controller.signal.throwIfAborted();
            if (this.state !== "ready" || this.revision !== revision)
                throw new DOMException("Image resource changed during access.", "AbortError");
            return result;
        }
        finally {
            signal?.removeEventListener("abort", abort);
            this.#controller.signal.removeEventListener("abort", abort);
        }
    }
    async pixelLease(signal?: AbortSignal): Promise<GFXPixelLease> {
        const pixels = await this.#runOwned(ownedSignal => this.#port.readPixels(ownedSignal), signal);
        if (!(pixels instanceof GFXImage))
            throw new TypeError("Image host must return owned GFXImage pixels.");
        return createGFXPixelLease(pixels);
    }
    async export(format: "image/png" | "image/webp", signal?: AbortSignal): Promise<Uint8Array> {
        if (format !== "image/png" && format !== "image/webp")
            throw new TypeError("Image export format is unsupported.");
        const bytes = await this.#runOwned(ownedSignal => this.#port.export(format, ownedSignal), signal);
        if (!(bytes instanceof Uint8Array) || bytes.byteLength > 8 * 1024 * 1024)
            throw new TypeError("Image host returned invalid export bytes.");
        return Uint8Array.prototype.slice.call(bytes) as Uint8Array;
    }
    async image(signal?: AbortSignal): Promise<IFXImage> {
        const lease = await this.pixelLease(signal);
        return IFXImage.fromPixels(lease.transferImage());
    }
    release(): void {
        if (this.#controller.signal.aborted)
            return;
        this.#controller.abort(new DOMException("Image resource released.", "AbortError"));
        this.#port.resource.release();
    }
}
