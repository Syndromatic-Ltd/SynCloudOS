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

import type { GFXRect, GFXAffineTransform } from "../GFXGeometry";
export interface GFXPDFPageOptions {
    readonly width: number;
    readonly height: number;
    readonly rotation?: 0 | 90 | 180 | 270;
    readonly cropBox?: GFXRect;
    readonly bleedBox?: GFXRect;
    readonly trimBox?: GFXRect;
    readonly artBox?: GFXRect;
}
export interface GFXPDFMetadata {
    readonly title?: string;
    readonly author?: string;
    readonly subject?: string;
    readonly keywords?: string;
}
export interface GFXPDFOpenOptions {
    readonly maximumEncodedBytes?: number;
    readonly maximumDecodedBytes?: number;
    readonly maximumPageCount?: number;
    readonly maximumObjectCount?: number;
    readonly maximumOperationMilliseconds?: number;
    readonly password?: string;
}
export interface GFXPDFPermissionMetadata {
    /** Raw PDF.js permission flags, preserved as document metadata rather than enforced as a security boundary. */
    readonly raw: readonly number[] | null;
}
export interface GFXPDFViewport {
    readonly width: number;
    readonly height: number;
    readonly transform: GFXAffineTransform;
}
export interface GFXPDFRenderSource {
    readonly bytes: Uint8Array;
    readonly pageIndex: number;
    readonly box: "media" | "crop";
    readonly viewBox: GFXRect;
    readonly rotation: 0 | 90 | 180 | 270;
    readonly scale: number;
    readonly width: number;
    readonly height: number;
    readonly maximumPixels: number;
    readonly password?: string;
}
export type GFXPDFErrorCode = "malformed" | "encrypted" | "password-required" | "incorrect-password" | "permission" | "limit" | "disposed" | "unsupported";
export class GFXPDFError extends Error {
    constructor(readonly code: GFXPDFErrorCode, message: string) {
        super(message);
        this.name = "GFXPDFError";
    }
}
export function bounded(value: number, name: string, min = 0, max = 1e6): number {
    if (!Number.isFinite(value) || value < min || value > max)
        throw new RangeError(`Invalid PDF ${name}.`);
    return value;
}
export function dataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError("PDF options must be plain data.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.keys(descriptors).some(key => !keys.includes(key) || !("value" in descriptors[key]!)))
        throw new TypeError("Unknown or executable PDF option.");
    return Object.fromEntries(Object.keys(descriptors).map(key => [key, descriptors[key]!.value]));
}
