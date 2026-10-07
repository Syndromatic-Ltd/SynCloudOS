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

import type { GFXImage } from "../GFXImage";
import { bounded } from "./pdfTypes";

export interface GFXPDFRenderRequest {
    readonly scale?: number;
    readonly box?: "media" | "crop";
    readonly maximumPixels?: number;
}

type State = { generation: number; disposed: boolean; image: GFXImage | null; cancel: (() => void) | null };
const states = new WeakMap<GFXPDFRenderDestination, State>();

function state(destination: GFXPDFRenderDestination): State {
    const value = states.get(destination);
    if (!value || value.disposed)
        throw new DOMException("PDF render destination is disposed.", "AbortError");
    return value;
}

export function beginPDFDestination(destination: GFXPDFRenderDestination, cancel: () => void): number {
    const value = state(destination);
    const previous = value.cancel;
    value.cancel = null;
    const generation = ++value.generation;
    previous?.();
    if (value.disposed)
        throw new DOMException("PDF render destination is disposed.", "AbortError");
    if (value.generation !== generation)
        throw new DOMException("PDF render destination was superseded.", "AbortError");
    value.cancel = cancel;
    return generation;
}

export function assertPDFDestination(destination: GFXPDFRenderDestination, generation: number): void {
    if (state(destination).generation !== generation)
        throw new DOMException("PDF render destination was superseded.", "AbortError");
}

export function publishPDFDestination(destination: GFXPDFRenderDestination, generation: number, image: GFXImage): void {
    assertPDFDestination(destination, generation);
    state(destination).image = image;
}

export function finishPDFDestination(destination: GFXPDFRenderDestination, generation: number): void {
    const value = states.get(destination);
    if (value && value.generation === generation)
        value.cancel = null;
}

export class GFXPDFRenderDestination {
    readonly scale: number;
    readonly box: "media" | "crop";
    readonly maximumPixels: number;
    constructor(request: GFXPDFRenderRequest = {}) {
        if (!request || typeof request !== "object" || Array.isArray(request))
            throw new TypeError("PDF render request must be an object.");
        this.scale = bounded(request.scale ?? 1, "render scale", .001, 8);
        this.box = request.box ?? "crop";
        if (this.box !== "media" && this.box !== "crop")
            throw new TypeError("Unknown PDF render box.");
        this.maximumPixels = request.maximumPixels ?? 16 * 1024 * 1024;
        if (!Number.isSafeInteger(this.maximumPixels) || this.maximumPixels < 1 || this.maximumPixels > 16 * 1024 * 1024)
            throw new RangeError("Invalid PDF render pixel budget.");
        states.set(this, { generation: 0, disposed: false, image: null, cancel: null });
        Object.freeze(this);
    }
    get image(): GFXImage | null {
        return state(this).image;
    }
    dispose(): void {
        const value = states.get(this);
        if (value) {
            const cancel = value.cancel;
            value.cancel = null;
            value.disposed = true;
            value.generation++;
            value.image = null;
            cancel?.();
        }
    }
}
