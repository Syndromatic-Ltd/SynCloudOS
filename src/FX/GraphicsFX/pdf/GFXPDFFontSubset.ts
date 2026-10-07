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

import type { GFXPath } from "../GFXPath";
import type { GFXPoint } from "../GFXGeometry";

export type GFXPDFFontEmbedding = "allowed" | "restricted" | "unknown";

export interface GFXPDFFontSubsetOptions {
    readonly familyName: string;
    readonly size: number;
}

export interface GFXPDFPositionedTextRun {
    readonly sourceStart: number;
    readonly sourceEnd: number;
    readonly text: string;
    readonly direction: "ltr" | "rtl" | "ttb" | "btt";
    readonly baseline: GFXPoint;
    readonly font: GFXPDFFontSubset;
    readonly outlines: readonly Readonly<{
        readonly glyphId: number;
        readonly stringIndex: number;
        readonly path: GFXPath;
        readonly embedding: GFXPDFFontEmbedding;
    }>[];
}

const programs = new WeakMap<GFXPDFFontSubset, Uint8Array>();

function embeddingRights(bytes: Uint8Array): GFXPDFFontEmbedding {
    if (bytes.byteLength < 12)
        return "unknown";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(4, false);
    if (count > 4096 || 12 + count * 16 > bytes.byteLength)
        return "unknown";
    for (let index = 0; index < count; index++) {
        const offset = 12 + index * 16;
        const tag = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
        if (tag !== "OS/2")
            continue;
        const table = view.getUint32(offset + 8, false), length = view.getUint32(offset + 12, false);
        if (length < 10 || table + 10 > bytes.byteLength)
            return "unknown";
        const fsType = view.getUint16(table + 8, false);
        return (fsType & 0x0002) !== 0 || (fsType & 0x0200) !== 0 ? "restricted" : "allowed";
    }
    return "unknown";
}

function fingerprint(bytes: Uint8Array): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < bytes.length; index++) {
        hash ^= bytes[index]!;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${bytes.byteLength.toString(16)}-${hash.toString(16).padStart(8, "0")}`;
}

/** Opaque, owned font program for PDF subsetting. The original bytes are never exposed publicly. */
export class GFXPDFFontSubset {
    readonly identity: string;
    readonly familyName: string;
    readonly size: number;
    readonly embedding: GFXPDFFontEmbedding;

    constructor(source: Uint8Array, options: GFXPDFFontSubsetOptions) {
        if (!(source instanceof Uint8Array) || source.byteLength < 12 || source.byteLength > 32 * 1024 * 1024)
            throw new RangeError("PDF font program must contain 12 bytes to 32 MiB.");
        if (!options || typeof options !== "object" || Object.getPrototypeOf(options) !== Object.prototype || Object.getOwnPropertySymbols(options).length)
            throw new TypeError("PDF font subset options must be plain data.");
        const fields = Object.getOwnPropertyDescriptors(options);
        if (Object.keys(fields).length !== 2 || !fields.familyName || !fields.size || !("value" in fields.familyName) || !("value" in fields.size))
            throw new TypeError("PDF font subset options require familyName and size data properties.");
        const familyName = fields.familyName.value, size = fields.size.value;
        if (typeof familyName !== "string" || !familyName.length || familyName.length > 256)
            throw new TypeError("PDF font family name is invalid.");
        if (typeof size !== "number" || !Number.isFinite(size) || size <= 0 || size > 4096)
            throw new RangeError("PDF font size is invalid.");
        const bytes = source.slice();
        this.identity = `gfx-pdf-font-${fingerprint(bytes)}`;
        this.familyName = familyName;
        this.size = size;
        this.embedding = embeddingRights(bytes);
        programs.set(this, bytes);
        Object.freeze(this);
    }
}

/** Internal GraphicsFX bridge. Deliberately absent from the public barrel. */
export function pdfFontProgram(font: GFXPDFFontSubset): Uint8Array {
    const bytes = programs.get(font);
    if (!bytes)
        throw new TypeError("Unknown PDF font subset owner.");
    return bytes;
}
