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

import type { GFXRect } from "../GFXGeometry";
import type { GFXPDFErrorCode, GFXPDFMetadata, GFXPDFOpenOptions, GFXPDFPermissionMetadata } from "./pdfTypes";

export interface GFXPDFDocumentPageDescriptor {
    readonly mediaBox: GFXRect;
    readonly cropBox: GFXRect;
    readonly bleedBox: GFXRect;
    readonly trimBox: GFXRect;
    readonly artBox: GFXRect;
    readonly rotation: 0 | 90 | 180 | 270;
    readonly userUnit: number;
}

export interface GFXPDFSnapshotReference {
    readonly objectNumber: number;
    readonly generationNumber: number;
}

export interface GFXPDFStreamParameters {
    readonly predictor?: number;
    readonly colors?: number;
    readonly bitsPerComponent?: number;
    readonly columns?: number;
    readonly unsupportedKeys: readonly string[];
}

export interface GFXPDFStreamDecoding {
    readonly filters: readonly string[];
    readonly parameters: readonly (GFXPDFStreamParameters | null)[];
}

export type GFXPDFSnapshotObject =
    | Readonly<{ kind: "null" }>
    | Readonly<{ kind: "boolean"; value: boolean }>
    | Readonly<{ kind: "number"; value: number }>
    | Readonly<{ kind: "name"; value: string }>
    | Readonly<{ kind: "string"; value: string; bytes: Uint8Array }>
    | Readonly<{ kind: "reference"; reference: GFXPDFSnapshotReference }>
    | Readonly<{ kind: "array"; items: readonly GFXPDFSnapshotObject[] }>
    | Readonly<{ kind: "dictionary"; entries: Readonly<Record<string, GFXPDFSnapshotObject>> }>
    | Readonly<{ kind: "stream"; dictionary: GFXPDFSnapshotObject; encodedBytes: Uint8Array; decoding: GFXPDFStreamDecoding }>;

export interface GFXPDFObjectSnapshotEntry {
    readonly reference: GFXPDFSnapshotReference;
    readonly value: GFXPDFSnapshotObject;
}

export interface GFXPDFDocumentDescriptor {
    readonly pageCount: number;
    readonly pages: readonly GFXPDFDocumentPageDescriptor[];
    readonly metadata: GFXPDFMetadata;
    readonly permissions: GFXPDFPermissionMetadata;
    /** Present for parser dialects that can expose a bounded, data-only object table. */
    readonly objects?: readonly GFXPDFObjectSnapshotEntry[];
}

export interface GFXPDFNormalizedOpenOptions {
    readonly maximumEncodedBytes: number;
    readonly maximumDecodedBytes: number;
    readonly maximumPageCount: number;
    readonly maximumObjectCount: number;
    readonly maximumOperationMilliseconds: number;
    readonly password?: string;
}

export type GFXPDFDocumentWorkerRequest =
    | Readonly<{
        id: number;
        operation: "open";
        bytes: ArrayBuffer;
        options: GFXPDFNormalizedOpenOptions;
    }>
    | Readonly<{
        id: number;
        operation: "prepare-page";
        bytes: ArrayBuffer;
        pageIndex: number;
        options: GFXPDFNormalizedOpenOptions;
    }>;

export type GFXPDFDocumentWorkerResponse =
    | Readonly<{ id: number; ok: true; kind: "document"; value: GFXPDFDocumentDescriptor }>
    | Readonly<{ id: number; ok: true; kind: "prepared-page"; value: Readonly<{ bytes: ArrayBuffer }> }>
    | Readonly<{ id: number; ok: false; error: Readonly<{ code: GFXPDFErrorCode; message: string }> }>;

function boundedInteger(value: unknown, fallback: number, name: string, min: number, max: number): number {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(resolved) || (resolved as number) < min || (resolved as number) > max)
        throw new RangeError(`Invalid PDF ${name}.`);
    return resolved as number;
}

export function normalisePDFOpenOptions(options: GFXPDFOpenOptions = {}): GFXPDFNormalizedOpenOptions {
    if (!options || typeof options !== "object" || Array.isArray(options))
        throw new TypeError("PDF open options must be a plain object.");
    const prototype = Object.getPrototypeOf(options);
    if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError("PDF open options must be a plain object.");
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const allowed = new Set(["maximumEncodedBytes", "maximumDecodedBytes", "maximumPageCount", "maximumObjectCount", "maximumOperationMilliseconds", "password"]);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (!allowed.has(key) || !("value" in descriptor))
            throw new TypeError("Unknown or executable PDF open option.");
    }
    const password = descriptors.password?.value;
    if (password !== undefined && (typeof password !== "string" || password.length > 1024))
        throw new TypeError("PDF password must be a string of at most 1024 characters.");
    return Object.freeze({
        maximumEncodedBytes: boundedInteger(descriptors.maximumEncodedBytes?.value, 16 * 1024 * 1024, "encoded byte limit", 8, 64 * 1024 * 1024),
        maximumDecodedBytes: boundedInteger(descriptors.maximumDecodedBytes?.value, 32 * 1024 * 1024, "decoded byte limit", 1, 128 * 1024 * 1024),
        maximumPageCount: boundedInteger(descriptors.maximumPageCount?.value, 256, "page limit", 1, 4096),
        maximumObjectCount: boundedInteger(descriptors.maximumObjectCount?.value, 20000, "object limit", 1, 100000),
        maximumOperationMilliseconds: boundedInteger(descriptors.maximumOperationMilliseconds?.value, 5000, "operation time limit", 10, 60000),
        ...(password !== undefined ? { password } : {}),
    });
}

/** Cheap structural admission check. Full parsing still belongs to the isolated parser. */
export function hasBoundedPDFEnvelope(bytes: Uint8Array): boolean {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8) return false;
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) return false;
    const start = Math.max(0, bytes.byteLength - 64 * 1024);
    const tail = new TextDecoder("latin1").decode(bytes.subarray(start));
    const eof = tail.lastIndexOf("%%EOF");
    if (eof < 0 || !/^\s*$/u.test(tail.slice(eof + 5))) return false;
    const startXref = tail.lastIndexOf("startxref", eof);
    if (startXref < 0) return false;
    const body = tail.slice(startXref + "startxref".length, eof).trim();
    if (!/^\d+$/u.test(body)) return false;
    const offset = Number(body);
    return Number.isSafeInteger(offset) && offset >= 0 && offset < bytes.byteLength;
}
