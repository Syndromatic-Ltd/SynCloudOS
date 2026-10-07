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

import { PDFArray, PDFBool, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRawStream, PDFRef, PDFString, PDFStream, type PDFObject } from "pdf-lib";
import { GFXPDFDocument, pdfAssertLive, pdfBackend, pdfObjectSnapshot } from "./GFXPDFDocument";
import type { GFXPDFObjectSnapshotEntry, GFXPDFSnapshotObject, GFXPDFStreamDecoding, GFXPDFStreamParameters } from "./pdfDocumentProtocol";
import { GFXPDFError } from "./pdfTypes";
export interface GFXPDFReference {
    readonly objectNumber: number;
    readonly generationNumber: number;
}
export interface GFXPDFContentOperator {
    readonly operator: string;
    readonly operands: readonly string[];
}
export type GFXPDFObject = Readonly<{
    kind: "null";
}> | Readonly<{
    kind: "boolean";
    value: boolean;
}> | Readonly<{
    kind: "number";
    value: number;
}> | Readonly<{
    kind: "name";
    value: string;
}> | Readonly<{
    kind: "string";
    value: string;
    bytes: Uint8Array;
}> | Readonly<{
    kind: "reference";
    reference: GFXPDFReference;
}> | Readonly<{
    kind: "array";
    items: readonly GFXPDFObject[];
}> | Readonly<{
    kind: "dictionary";
    entries: Readonly<Record<string, GFXPDFObject>>;
}> | Readonly<{
    kind: "stream";
    dictionary: GFXPDFObject;
    encodedBytes: Uint8Array;
}>;
function reference(value: GFXPDFReference): PDFRef {
    if (!Number.isSafeInteger(value.objectNumber) || value.objectNumber < 1 || !Number.isSafeInteger(value.generationNumber) || value.generationNumber < 0 || value.generationNumber > 65535)
        throw new TypeError("Invalid PDF reference.");
    return PDFRef.of(value.objectNumber, value.generationNumber);
}
function kind(value: PDFObject): GFXPDFObject["kind"] {
    if (value === PDFNull)
        return "null";
    if (value instanceof PDFBool)
        return "boolean";
    if (value instanceof PDFNumber)
        return "number";
    if (value instanceof PDFName)
        return "name";
    if (value instanceof PDFString || value instanceof PDFHexString)
        return "string";
    if (value instanceof PDFRef)
        return "reference";
    if (value instanceof PDFArray)
        return "array";
    if (value instanceof PDFStream)
        return "stream";
    if (value instanceof PDFDict)
        return "dictionary";
    throw new GFXPDFError("unsupported", "Unknown PDF object kind.");
}

const contentWhitespace = new Set([0, 9, 10, 12, 13, 32]);
const contentDelimiters = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

function scanContentOperators(bytes: Uint8Array, signal?: AbortSignal, assertLive?: () => void): readonly GFXPDFContentOperator[] {
    const source = new TextDecoder("latin1").decode(bytes), result: GFXPDFContentOperator[] = [], operands: string[] = [];
    let index = 0, work = 0;
    const tick = () => {
        if ((work++ & 255) === 0) {
            signal?.throwIfAborted();
            assertLive?.();
        }
        if (work > 2_000_000) throw new GFXPDFError("limit", "PDF content-token budget exceeded.");
    };
    const skip = () => {
        for (;;) {
            while (index < source.length && contentWhitespace.has(source.charCodeAt(index))) { tick(); index++; }
            if (source.charCodeAt(index) !== 37) return;
            while (index < source.length && source.charCodeAt(index) !== 10 && source.charCodeAt(index) !== 13) { tick(); index++; }
        }
    };
    const literalString = (): string => {
        const start = index++;
        let depth = 1, escaped = false;
        while (index < source.length) {
            tick();
            const character = source.charCodeAt(index++);
            if (escaped) { escaped = false; continue; }
            if (character === 92) { escaped = true; continue; }
            if (character === 40) depth++;
            else if (character === 41 && --depth === 0) return source.slice(start, index);
        }
        throw new GFXPDFError("malformed", "Unterminated PDF content string.");
    };
    const composite = (opening: "[" | "<<", closing: "]" | ">>"): string => {
        const start = index;
        index += opening.length;
        let depth = 1;
        while (index < source.length) {
            tick();
            if (source[index] === "(") { literalString(); continue; }
            if (opening === "[" && source[index] === "[") { depth++; index++; continue; }
            if (opening === "[" && source[index] === "]") { index++; if (--depth === 0) return source.slice(start, index); continue; }
            if (opening === "<<" && source.startsWith("<<", index)) { depth++; index += 2; continue; }
            if (opening === "<<" && source.startsWith(">>", index)) { index += 2; if (--depth === 0) return source.slice(start, index); continue; }
            index++;
        }
        throw new GFXPDFError("malformed", `Unterminated PDF content ${opening === "[" ? "array" : "dictionary"}.`);
    };
    const operandToken = (): string => {
        const start = index;
        if (source[index] === "(") return literalString();
        if (source[index] === "[") return composite("[", "]");
        if (source.startsWith("<<", index)) return composite("<<", ">>");
        if (source[index] === "<") {
            index++;
            while (index < source.length && source[index] !== ">") { tick(); index++; }
            if (index >= source.length) throw new GFXPDFError("malformed", "Unterminated PDF content hex string.");
            index++;
            return source.slice(start, index);
        }
        if (source[index] === "/") {
            index++;
            while (index < source.length && !contentWhitespace.has(source.charCodeAt(index)) && !contentDelimiters.has(source.charCodeAt(index))) { tick(); index++; }
            if (index === start + 1) throw new GFXPDFError("malformed", "Empty PDF content name.");
            return source.slice(start, index);
        }
        while (index < source.length && !contentWhitespace.has(source.charCodeAt(index)) && !contentDelimiters.has(source.charCodeAt(index))) { tick(); index++; }
        return source.slice(start, index);
    };
    while (index < source.length) {
        skip();
        if (index >= source.length) break;
        const token = operandToken();
        if (!token) throw new GFXPDFError("malformed", "Invalid PDF content token.");
        const operand = token[0] === "/" || token[0] === "(" || token[0] === "[" || token[0] === "<" || token === "true" || token === "false" || token === "null" || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token);
        if (operand) {
            if (operands.length >= 256) throw new GFXPDFError("limit", "PDF content operand limit exceeded.");
            operands.push(token);
            continue;
        }
        if (!/^[A-Za-z0-9*'\"]{1,16}$/.test(token)) throw new GFXPDFError("malformed", "Invalid PDF content operator.");
        if (token === "BI") throw new GFXPDFError("unsupported", "Inline-image content scanning is explicitly unsupported.");
        if (result.length >= 20_000) throw new GFXPDFError("limit", "PDF content operator limit exceeded.");
        result.push(Object.freeze({ operator: token, operands: Object.freeze(operands.splice(0)) }));
    }
    if (operands.length) throw new GFXPDFError("malformed", "PDF content stream ends with operands but no operator.");
    return Object.freeze(result);
}

function filterNames(value: PDFObject | undefined): readonly string[] {
    if (!value || value === PDFNull)
        return Object.freeze([]);
    if (value instanceof PDFName)
        return Object.freeze([value.decodeText()]);
    if (value instanceof PDFArray) {
        const result: string[] = [];
        for (let index = 0; index < value.size(); index++) {
            const item = value.get(index);
            if (!(item instanceof PDFName))
                throw new GFXPDFError("malformed", "PDF stream filter array contains a non-name entry.");
            result.push(item.decodeText());
        }
        return Object.freeze(result);
    }
    throw new GFXPDFError("malformed", "PDF stream Filter must be a name or array of names.");
}

function plainParameters(dictionary: PDFDict): GFXPDFStreamParameters {
    const supported = new Set(["Predictor", "Colors", "BitsPerComponent", "Columns"]);
    const unsupportedKeys: string[] = [];
    const values: { predictor?: number; colors?: number; bitsPerComponent?: number; columns?: number; unsupportedKeys: readonly string[] } = { unsupportedKeys };
    for (const [key, item] of dictionary.entries()) {
        const name = key.decodeText();
        if (!supported.has(name)) {
            unsupportedKeys.push(name);
            continue;
        }
        if (!(item instanceof PDFNumber) || !Number.isSafeInteger(item.asNumber()))
            throw new GFXPDFError("malformed", `PDF stream ${name} must be an integer.`);
        const number = item.asNumber();
        if (name === "Predictor") values.predictor = number;
        else if (name === "Colors") values.colors = number;
        else if (name === "BitsPerComponent") values.bitsPerComponent = number;
        else values.columns = number;
    }
    values.unsupportedKeys = Object.freeze(unsupportedKeys);
    return Object.freeze(values);
}

function filterParameters(value: PDFObject | undefined, count: number): readonly (GFXPDFStreamParameters | null)[] {
    if (!value || value === PDFNull)
        return Object.freeze(Array.from({ length: count }, () => null));
    if (count === 1) {
        if (!(value instanceof PDFDict))
            throw new GFXPDFError("malformed", "PDF stream DecodeParms must be a dictionary for a single filter.");
        return Object.freeze([plainParameters(value)]);
    }
    if (!(value instanceof PDFArray) || value.size() !== count)
        throw new GFXPDFError("malformed", "PDF stream DecodeParms must align with the filter chain.");
    const result: (GFXPDFStreamParameters | null)[] = [];
    for (let index = 0; index < value.size(); index++) {
        const item = value.get(index);
        if (item === PDFNull) result.push(null);
        else if (item instanceof PDFDict) result.push(plainParameters(item));
        else throw new GFXPDFError("malformed", "PDF stream DecodeParms contains a non-dictionary entry.");
    }
    return Object.freeze(result);
}

function numberParameter(parameters: GFXPDFStreamParameters | null, name: "Predictor" | "Colors" | "BitsPerComponent" | "Columns", fallback: number): number {
    if (!parameters) return fallback;
    if (parameters.unsupportedKeys.length)
        throw new GFXPDFError("unsupported", `Unsupported PDF stream parameter ${parameters.unsupportedKeys[0]}.`);
    const key = name === "Predictor" ? "predictor" : name === "Colors" ? "colors" : name === "BitsPerComponent" ? "bitsPerComponent" : "columns";
    return parameters[key] ?? fallback;
}

function decodeASCIIHex(bytes: Uint8Array, maximumDecodedBytes: number): Uint8Array<ArrayBuffer> {
    const nibbles: number[] = [];
    for (const byte of bytes) {
        if (byte === 0x3e) break;
        if (byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32) continue;
        const value = byte >= 48 && byte <= 57 ? byte - 48 : byte >= 65 && byte <= 70 ? byte - 55 : byte >= 97 && byte <= 102 ? byte - 87 : -1;
        if (value < 0)
            throw new GFXPDFError("malformed", "ASCIIHexDecode encountered a non-hexadecimal byte.");
        nibbles.push(value);
        if (Math.ceil(nibbles.length / 2) > maximumDecodedBytes)
            throw new GFXPDFError("limit", "Decoded PDF stream exceeds budget.");
    }
    if (nibbles.length % 2) nibbles.push(0);
    const out = new Uint8Array(nibbles.length / 2);
    for (let index = 0; index < out.length; index++)
        out[index] = (nibbles[index * 2]! << 4) | nibbles[index * 2 + 1]!;
    return out;
}

async function inflate(bytes: Uint8Array, maximumDecodedBytes: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    if (typeof DecompressionStream !== "function")
        throw new GFXPDFError("unsupported", "FlateDecode requires DecompressionStream support.");
    const input = new Uint8Array(bytes.byteLength);
    input.set(bytes);
    const stream = new Blob([input.buffer]).stream().pipeThrough(new DecompressionStream("deflate"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const abort = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
    signal?.addEventListener("abort", abort, { once: true });
    try {
        while (true) {
            signal?.throwIfAborted();
            const next = await reader.read();
            if (next.done) break;
            length += next.value.length;
            if (length > maximumDecodedBytes) {
                await reader.cancel();
                throw new GFXPDFError("limit", "Decoded PDF stream exceeds budget.");
            }
            chunks.push(next.value);
        }
        const out = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }
    finally {
        signal?.removeEventListener("abort", abort);
        reader.releaseLock();
    }
}

function paeth(left: number, up: number, upperLeft: number): number {
    const estimate = left + up - upperLeft;
    const dl = Math.abs(estimate - left), du = Math.abs(estimate - up), dul = Math.abs(estimate - upperLeft);
    return dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft;
}

function applyPredictor(bytes: Uint8Array, parameters: GFXPDFStreamParameters | null, maximumDecodedBytes: number): Uint8Array<ArrayBuffer> {
    const predictor = numberParameter(parameters, "Predictor", 1);
    if (predictor === 1) return Uint8Array.from(bytes);
    const colours = numberParameter(parameters, "Colors", 1);
    const bits = numberParameter(parameters, "BitsPerComponent", 8);
    const columns = numberParameter(parameters, "Columns", 1);
    if (colours < 1 || colours > 32 || columns < 1 || columns > 1_000_000 || bits !== 8)
        throw new GFXPDFError("unsupported", "PDF stream predictor supports bounded 8-bit component rows only.");
    const bytesPerPixel = colours;
    const rowBytes = colours * columns;
    if (!Number.isSafeInteger(rowBytes) || rowBytes < 1)
        throw new GFXPDFError("limit", "PDF predictor row exceeds arithmetic bounds.");
    if (predictor === 2) {
        if (bytes.length % rowBytes !== 0)
            throw new GFXPDFError("malformed", "TIFF predictor rows are truncated.");
        if (bytes.length > maximumDecodedBytes)
            throw new GFXPDFError("limit", "Decoded PDF stream exceeds budget.");
        const out = Uint8Array.from(bytes);
        for (let row = 0; row < out.length; row += rowBytes)
            for (let index = bytesPerPixel; index < rowBytes; index++)
                out[row + index] = (out[row + index]! + out[row + index - bytesPerPixel]!) & 0xff;
        return out;
    }
    if (predictor < 10 || predictor > 15)
        throw new GFXPDFError("unsupported", `Unsupported PDF stream predictor ${predictor}.`);

    const tagged = bytes.length % (rowBytes + 1) === 0 && bytes.length > 0;
    if (!tagged && predictor === 15)
        throw new GFXPDFError("malformed", "PNG optimum predictor rows require filter tags.");
    if (!tagged && bytes.length % rowBytes !== 0)
        throw new GFXPDFError("malformed", "PNG predictor rows are truncated.");
    const rows = tagged ? bytes.length / (rowBytes + 1) : bytes.length / rowBytes;
    const outputLength = rows * rowBytes;
    if (!Number.isSafeInteger(outputLength) || outputLength > maximumDecodedBytes)
        throw new GFXPDFError("limit", "Decoded PDF stream exceeds budget.");
    const out = new Uint8Array(outputLength);
    let inputOffset = 0, outputOffset = 0;
    for (let row = 0; row < rows; row++) {
        const filter = tagged ? bytes[inputOffset++]! : predictor - 10;
        if (filter < 0 || filter > 4)
            throw new GFXPDFError("malformed", "PNG predictor row uses an unknown filter.");
        for (let index = 0; index < rowBytes; index++) {
            const raw = bytes[inputOffset++]!;
            const left = index >= bytesPerPixel ? out[outputOffset + index - bytesPerPixel]! : 0;
            const up = row > 0 ? out[outputOffset + index - rowBytes]! : 0;
            const upperLeft = row > 0 && index >= bytesPerPixel ? out[outputOffset + index - rowBytes - bytesPerPixel]! : 0;
            const base = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
            out[outputOffset + index] = (raw + base) & 0xff;
        }
        outputOffset += rowBytes;
    }
    return out;
}

function snapshotKey(referenceValue: GFXPDFReference): string {
    reference(referenceValue);
    return `${referenceValue.objectNumber}:${referenceValue.generationNumber}`;
}

function snapshotMap(entries: readonly GFXPDFObjectSnapshotEntry[]): ReadonlyMap<string, GFXPDFObjectSnapshotEntry> {
    const result = new Map<string, GFXPDFObjectSnapshotEntry>();
    for (const entry of entries) {
        const key = snapshotKey(entry.reference);
        if (result.has(key)) throw new GFXPDFError("malformed", "Duplicate PDF object reference in isolated snapshot.");
        result.set(key, entry);
    }
    return result;
}

function cloneSnapshotObject(root: GFXPDFSnapshotObject, entries: ReadonlyMap<string, GFXPDFObjectSnapshotEntry>, maximumDecodedBytes: number, resolveReferences: boolean, rootReference?: GFXPDFReference): GFXPDFObject {
    let work = 0, bytes = 0;
    const activeReferences = new Set<string>();
    if (rootReference) activeReferences.add(snapshotKey(rootReference));
    const visit = (value: GFXPDFSnapshotObject, depth: number): GFXPDFObject => {
        if (++work > 20000 || depth > 64)
            throw new GFXPDFError("limit", "PDF object traversal limit exceeded.");
        if (value.kind === "null") return Object.freeze({ kind: "null" });
        if (value.kind === "boolean") return Object.freeze({ kind: "boolean", value: value.value });
        if (value.kind === "number") {
            if (!Number.isFinite(value.value)) throw new GFXPDFError("malformed", "Nonfinite PDF number.");
            return Object.freeze({ kind: "number", value: value.value });
        }
        if (value.kind === "name") return Object.freeze({ kind: "name", value: value.value });
        if (value.kind === "string") {
            bytes += value.bytes.byteLength;
            if (bytes > maximumDecodedBytes) throw new GFXPDFError("limit", "PDF object byte budget exceeded.");
            return Object.freeze({ kind: "string", value: value.value, bytes: Uint8Array.from(value.bytes) });
        }
        if (value.kind === "reference") {
            const referenceValue = Object.freeze({ objectNumber: value.reference.objectNumber, generationNumber: value.reference.generationNumber });
            if (!resolveReferences) return Object.freeze({ kind: "reference", reference: referenceValue });
            const key = snapshotKey(referenceValue);
            if (activeReferences.has(key)) throw new GFXPDFError("malformed", "PDF object cycle detected.");
            const entry = entries.get(key);
            if (!entry) throw new GFXPDFError("malformed", "Dangling PDF reference.");
            activeReferences.add(key);
            try { return visit(entry.value, depth + 1); }
            finally { activeReferences.delete(key); }
        }
        if (value.kind === "array")
            return Object.freeze({ kind: "array", items: Object.freeze(value.items.map(item => visit(item, depth + 1))) });
        if (value.kind === "dictionary") {
            const dictionary: Record<string, GFXPDFObject> = Object.create(null);
            for (const [key, item] of Object.entries(value.entries)) dictionary[key] = visit(item, depth + 1);
            return Object.freeze({ kind: "dictionary", entries: Object.freeze(dictionary) });
        }
        bytes += value.encodedBytes.byteLength;
        if (bytes > maximumDecodedBytes) throw new GFXPDFError("limit", "Encoded PDF stream budget exceeded.");
        return Object.freeze({ kind: "stream", dictionary: visit(value.dictionary, depth + 1), encodedBytes: Uint8Array.from(value.encodedBytes) });
    };
    return visit(root, 0);
}

async function decodeStream(encodedBytes: Uint8Array, decoding: GFXPDFStreamDecoding, maximumDecodedBytes: number, signal: AbortSignal | undefined, assertLive: () => void): Promise<Uint8Array> {
    if (encodedBytes.byteLength > maximumDecodedBytes)
        throw new GFXPDFError("limit", "Encoded PDF stream exceeds budget.");
    if (decoding.parameters.length !== decoding.filters.length)
        throw new GFXPDFError("malformed", "PDF stream filter parameters are inconsistent.");
    const supported = new Set(["FlateDecode", "Fl", "ASCIIHexDecode", "AHx"]);
    const unsupported = decoding.filters.find(filter => !supported.has(filter));
    if (unsupported)
        throw new GFXPDFError("unsupported", `Unsupported PDF stream filter ${unsupported}.`);
    let decoded: Uint8Array<ArrayBuffer> = Uint8Array.from(encodedBytes);
    for (let index = 0; index < decoding.filters.length; index++) {
        signal?.throwIfAborted();
        assertLive();
        const filter = decoding.filters[index]!;
        if (filter === "ASCIIHexDecode" || filter === "AHx")
            decoded = decodeASCIIHex(decoded, maximumDecodedBytes);
        else
            decoded = await inflate(decoded, maximumDecodedBytes, signal);
        decoded = applyPredictor(decoded, decoding.parameters[index] ?? null, maximumDecodedBytes);
    }
    signal?.throwIfAborted();
    assertLive();
    if (decoded.length > maximumDecodedBytes)
        throw new GFXPDFError("limit", "Decoded PDF stream exceeds budget.");
    return decoded;
}
export class GFXPDFScanner {
    constructor(readonly document: GFXPDFDocument, readonly maximumDecodedBytes = 8 * 1024 * 1024) {
        pdfAssertLive(document);
        if (!Number.isSafeInteger(maximumDecodedBytes) || maximumDecodedBytes < 1 || maximumDecodedBytes > 32 * 1024 * 1024)
            throw new RangeError("Invalid PDF stream budget.");
        Object.freeze(this);
    }
    objects(): readonly Readonly<{
        reference: GFXPDFReference;
        kind: GFXPDFObject["kind"];
    }>[] {
        const snapshot = pdfObjectSnapshot(this.document);
        if (snapshot)
            return Object.freeze(snapshot.map(entry => Object.freeze({
                reference: Object.freeze({ objectNumber: entry.reference.objectNumber, generationNumber: entry.reference.generationNumber }),
                kind: entry.value.kind,
            })));
        return Object.freeze(pdfBackend(this.document).context.enumerateIndirectObjects().map(([ref, value]) => Object.freeze({ reference: Object.freeze({ objectNumber: ref.objectNumber, generationNumber: ref.generationNumber }), kind: kind(value) })));
    }
    object(ref: GFXPDFReference, resolveReferences = false): GFXPDFObject {
        const snapshot = pdfObjectSnapshot(this.document);
        if (snapshot) {
            const entries = snapshotMap(snapshot), entry = entries.get(snapshotKey(ref));
            if (!entry) throw new RangeError("Unknown PDF object reference.");
            return cloneSnapshotObject(entry.value, entries, this.maximumDecodedBytes, resolveReferences, ref);
        }
        const backend = pdfBackend(this.document), root = backend.context.lookup(reference(ref));
        if (!root)
            throw new RangeError("Unknown PDF object reference.");
        const active = new Set<PDFObject>();
        let work = 0, bytes = 0;
        const visit = (value: PDFObject, depth: number): GFXPDFObject => {
            if (++work > 20000 || depth > 64)
                throw new GFXPDFError("limit", "PDF object traversal limit exceeded.");
            if (active.has(value))
                throw new GFXPDFError("malformed", "PDF object cycle detected.");
            active.add(value);
            try {
                if (value === PDFNull)
                    return Object.freeze({ kind: "null" });
                if (value instanceof PDFBool)
                    return Object.freeze({ kind: "boolean", value: value.asBoolean() });
                if (value instanceof PDFNumber) {
                    const n = value.asNumber();
                    if (!Number.isFinite(n))
                        throw new GFXPDFError("malformed", "Nonfinite PDF number.");
                    return Object.freeze({ kind: "number", value: n });
                }
                if (value instanceof PDFName)
                    return Object.freeze({ kind: "name", value: value.decodeText() });
                if (value instanceof PDFString || value instanceof PDFHexString) {
                    const data = value.asBytes();
                    bytes += data.length;
                    if (bytes > this.maximumDecodedBytes)
                        throw new GFXPDFError("limit", "PDF object byte budget exceeded.");
                    return Object.freeze({ kind: "string", value: value.decodeText(), bytes: data.slice() });
                }
                if (value instanceof PDFRef) {
                    if (resolveReferences) {
                        const resolved = backend.context.lookup(value);
                        if (!resolved)
                            throw new GFXPDFError("malformed", "Dangling PDF reference.");
                        return visit(resolved, depth + 1);
                    }
                    return Object.freeze({ kind: "reference", reference: Object.freeze({ objectNumber: value.objectNumber, generationNumber: value.generationNumber }) });
                }
                if (value instanceof PDFArray) {
                    const items = [];
                    for (let i = 0; i < value.size(); i++)
                        items.push(visit(value.get(i), depth + 1));
                    return Object.freeze({ kind: "array", items: Object.freeze(items) });
                }
                if (value instanceof PDFRawStream) {
                    bytes += value.getContentsSize();
                    if (bytes > this.maximumDecodedBytes)
                        throw new GFXPDFError("limit", "Encoded PDF stream budget exceeded.");
                    return Object.freeze({ kind: "stream", dictionary: visit(value.dict, depth + 1), encodedBytes: value.getContents().slice() });
                }
                if (value instanceof PDFDict) {
                    const entries: Record<string, GFXPDFObject> = Object.create(null);
                    for (const [key, item] of value.entries())
                        entries[key.decodeText()] = visit(item, depth + 1);
                    return Object.freeze({ kind: "dictionary", entries: Object.freeze(entries) });
                }
                throw new GFXPDFError("unsupported", "Unsupported PDF object representation.");
            }
            finally {
                active.delete(value);
            }
        };
        return visit(root, 0);
    }
    async decodedStream(ref: GFXPDFReference, signal?: AbortSignal): Promise<Uint8Array> {
        signal?.throwIfAborted();
        const snapshot = pdfObjectSnapshot(this.document);
        if (snapshot) {
            const entry = snapshotMap(snapshot).get(snapshotKey(ref));
            if (!entry) throw new RangeError("Unknown PDF object reference.");
            if (entry.value.kind !== "stream") throw new TypeError("Reference does not identify a raw PDF stream.");
            return decodeStream(entry.value.encodedBytes, entry.value.decoding, this.maximumDecodedBytes, signal, () => pdfAssertLive(this.document));
        }
        const backend = pdfBackend(this.document), value = backend.context.lookup(reference(ref));
        if (!(value instanceof PDFRawStream))
            throw new TypeError("Reference does not identify a raw PDF stream.");
        const filters = filterNames(value.dict.lookup(PDFName.of("Filter")));
        const decoding: GFXPDFStreamDecoding = Object.freeze({ filters, parameters: filterParameters(value.dict.lookup(PDFName.of("DecodeParms")), filters.length) });
        return decodeStream(value.getContents(), decoding, this.maximumDecodedBytes, signal, () => { pdfBackend(this.document); });
    }
    async contentOperators(ref: GFXPDFReference, signal?: AbortSignal): Promise<readonly GFXPDFContentOperator[]> {
        const bytes = await this.decodedStream(ref, signal);
        signal?.throwIfAborted();
        pdfAssertLive(this.document);
        return scanContentOperators(bytes, signal, () => pdfAssertLive(this.document));
    }
}
