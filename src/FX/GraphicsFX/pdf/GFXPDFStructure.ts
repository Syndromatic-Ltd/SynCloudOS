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

import { normaliseRect, type GFXRect } from "../GFXGeometry";
import { dataRecord } from "./pdfTypes";

export interface GFXPDFOutline {
    readonly title: string;
    readonly pageIndex: number;
}

export interface GFXPDFLink {
    readonly rect: GFXRect;
    readonly uri: string;
}

export interface GFXPDFMarkedContent {
    readonly tag: string;
    readonly actualText?: string;
}

export interface GFXPDFOutputIntentOptions {
    readonly identifier: string;
}

export function normalisePDFLanguage(value: string): string {
    if (typeof value !== "string" || value.length < 2 || value.length > 64 || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value))
        throw new TypeError("PDF language must be a bounded BCP 47 tag.");
    return value;
}

export function normalisePDFOutline(value: GFXPDFOutline): GFXPDFOutline {
    const record = dataRecord(value, ["title", "pageIndex"]);
    if (typeof record.title !== "string" || !record.title.length || record.title.length > 1024 || !Number.isSafeInteger(record.pageIndex) || (record.pageIndex as number) < 0)
        throw new TypeError("Invalid PDF outline entry.");
    return Object.freeze({ title: record.title, pageIndex: record.pageIndex as number });
}

export function normalisePDFLink(value: GFXPDFLink): GFXPDFLink {
    const record = dataRecord(value, ["rect", "uri"]);
    if (typeof record.uri !== "string" || record.uri.length > 4096)
        throw new TypeError("Invalid PDF link URI.");
    let url: URL;
    try { url = new URL(record.uri); }
    catch { throw new TypeError("PDF link URI must be absolute."); }
    if (url.protocol !== "https:" && url.protocol !== "http:")
        throw new TypeError("PDF links support only HTTP(S) URI actions.");
    return Object.freeze({ rect: normaliseRect(record.rect as GFXRect), uri: url.href });
}

export function normalisePDFMarkedContent(value: GFXPDFMarkedContent): GFXPDFMarkedContent {
    const record = dataRecord(value, ["tag", "actualText"]);
    if (typeof record.tag !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(record.tag))
        throw new TypeError("Invalid PDF structure tag.");
    if (record.actualText !== undefined && (typeof record.actualText !== "string" || record.actualText.length > 4096))
        throw new TypeError("Invalid PDF marked-content replacement text.");
    return Object.freeze({ tag: record.tag, ...(record.actualText === undefined ? {} : { actualText: record.actualText }) });
}

export function normalisePDFOutputIntentOptions(value: GFXPDFOutputIntentOptions): GFXPDFOutputIntentOptions {
    const record = dataRecord(value, ["identifier"]);
    if (typeof record.identifier !== "string" || !record.identifier.length || record.identifier.length > 256)
        throw new TypeError("Invalid PDF output-intent identifier.");
    return Object.freeze({ identifier: record.identifier });
}
