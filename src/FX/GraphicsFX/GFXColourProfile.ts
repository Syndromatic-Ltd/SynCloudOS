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

import { GFXColour } from "./GFXColour";
import { GFXImage, type GFXImageDescriptor } from "./GFXImage";
import type { GFXRGBAComponents } from "./colourTypes";
type Matrix = readonly number[];
type Curve = (value: number) => number;
type LUTTransform = (value: readonly [number, number, number]) => readonly [number, number, number];
const srgbD50: Matrix = Object.freeze([.4360747, .3850649, .1430804, .2225045, .7168786, .0606169, .0139322, .0971045, .7141733]);
function multiply(m: Matrix, v: readonly number[]): number[] {
    return [m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!, m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!, m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!];
}
function inverse(m: Matrix): Matrix {
    const [a, b, c, d, e, f, g, h, i] = m as readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number
    ], det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (!Number.isFinite(det) || Math.abs(det) < 1e-10)
        throw new RangeError("ICC matrix is singular.");
    return Object.freeze([(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]);
}
const srgbInverse = inverse(srgbD50);
/** The ICC PCS illuminant used by ImageFX's matrix/TRC colour-profile path. */
export const d50ReferenceWhite = Object.freeze({ x: .9642, y: 1, z: .8249 });
export type GFXD50XYZ = Readonly<{ x: number; y: number; z: number; }>;
/** Converts normalized linear sRGB into the same D50-adapted PCS used for ICC matrix profiles. */
export function linearSRGBToD50XYZ(value: Readonly<{ r: number; g: number; b: number; }>): GFXD50XYZ {
    if (![value.r, value.g, value.b].every(Number.isFinite))
        throw new RangeError("Linear sRGB components must be finite.");
    const [x, y, z] = multiply(srgbD50, [value.r, value.g, value.b]);
    return Object.freeze({ x: x!, y: y!, z: z! });
}
/** Converts D50 PCS values back into ImageFX's normalized linear-sRGB working components. */
export function d50XYZToLinearSRGB(value: GFXD50XYZ): Readonly<{ r: number; g: number; b: number; }> {
    if (![value.x, value.y, value.z].every(Number.isFinite))
        throw new RangeError("D50 PCS components must be finite.");
    const [r, g, b] = multiply(srgbInverse, [value.x, value.y, value.z]);
    return Object.freeze({ r: r!, g: g!, b: b! });
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const decodeSRGBChannel = (n: number) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
const encodeSRGBChannel = (n: number) => n <= .0031308 ? 12.92 * n : 1.055 * Math.pow(Math.max(0, n), 1 / 2.4) - .055;
function lut8Transform(bytes: Uint8Array, offset: number, size: number): LUTTransform {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const signature = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (signature !== "mft1")
        throw new TypeError("ICC LUT transform must use bounded lut8Type (mft1).");
    const inputs = bytes[offset + 8]!, outputs = bytes[offset + 9]!, grid = bytes[offset + 10]!;
    if (inputs !== 3 || outputs !== 3 || grid < 2 || grid > 17)
        throw new TypeError("ICC LUT8 requires 3-channel input/output and a 2..17 grid.");
    const matrix = Object.freeze(Array.from({ length: 9 }, (_, index) => view.getInt32(offset + 12 + index * 4) / 65536));
    const inputOffset = offset + 48;
    const clutOffset = inputOffset + inputs * 256;
    const clutEntries = grid ** inputs * outputs;
    const outputOffset = clutOffset + clutEntries;
    if (outputOffset + outputs * 256 > offset + size)
        throw new RangeError("ICC LUT8 payload is truncated.");
    const table = (base: number, channel: number, value: number) => {
        const position = clamp(value) * 255, low = Math.min(254, Math.floor(position)), fraction = position - low;
        const a = bytes[base + channel * 256 + low]! / 255, b = bytes[base + channel * 256 + low + 1]! / 255;
        return a + (b - a) * fraction;
    };
    return Object.freeze((value: readonly [number, number, number]) => {
        const prepared = [table(inputOffset, 0, value[0]), table(inputOffset, 1, value[1]), table(inputOffset, 2, value[2])];
        const mixed = multiply(matrix, prepared).map(clamp);
        const base = mixed.map(component => component * (grid - 1));
        const lower = base.map(component => Math.min(grid - 2, Math.floor(component)));
        const fraction = base.map((component, index) => component - lower[index]!);
        const clut = [0, 0, 0];
        for (let r = 0; r < 2; r++) for (let g = 0; g < 2; g++) for (let b = 0; b < 2; b++) {
            const weight = (r ? fraction[0]! : 1 - fraction[0]!) * (g ? fraction[1]! : 1 - fraction[1]!) * (b ? fraction[2]! : 1 - fraction[2]!);
            const index = (((lower[0]! + r) * grid + lower[1]! + g) * grid + lower[2]! + b) * outputs;
            for (let channel = 0; channel < 3; channel++)
                clut[channel] += bytes[clutOffset + index + channel]! / 255 * weight;
        }
        return Object.freeze([table(outputOffset, 0, clut[0]!), table(outputOffset, 1, clut[1]!), table(outputOffset, 2, clut[2]!)] as const);
    });
}
function components(value: GFXRGBAComponents): GFXRGBAComponents {
    for (const n of [value.r, value.g, value.b, value.a])
        if (!Number.isFinite(n) || n < 0 || n > 1)
            throw new RangeError("Profile components must be finite unit values.");
    return value;
}
/** ICC v2/v4 RGB matrix/TRC profiles, relative colorimetric with explicit clipping.
 * PCS matrices are D50-adapted; unsupported LUT/CMYK/HDR profiles reject. */
export class GFXColourProfile {
    readonly version: 2 | 4;
    readonly preferredIntent: number;
    readonly tags: readonly string[];
    readonly #bytes: Uint8Array;
    readonly #matrix: Matrix;
    readonly #inverse: Matrix;
    readonly #curves: readonly Curve[];
    readonly #a2b: LUTTransform | null;
    readonly #b2a: LUTTransform | null;
    constructor(data: Uint8Array) {
        if (!(data instanceof Uint8Array) || data.length < 132 || data.length > 4 * 1024 * 1024)
            throw new RangeError("ICC profile requires 132 bytes to 4 MiB.");
        const bytes = data.slice(), view = new DataView(bytes.buffer), signature = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
        if (view.getUint32(0) !== bytes.length || signature(36) !== "acsp")
            throw new TypeError("ICC header or declared length is invalid.");
        const version = bytes[8];
        if (version !== 2 && version !== 4)
            throw new TypeError("Only ICC v2 and v4 profiles are supported.");
        if (signature(16) !== "RGB " || signature(20) !== "XYZ " || !["mntr", "scnr", "prtr", "spac"].includes(signature(12)))
            throw new TypeError("ICC profile requires RGB data and XYZ PCS with a matrix/TRC device class.");
        const illuminant = [view.getInt32(68) / 65536, view.getInt32(72) / 65536, view.getInt32(76) / 65536];
        if (illuminant.some((value, index) => Math.abs(value - [d50ReferenceWhite.x, d50ReferenceWhite.y, d50ReferenceWhite.z][index]!) > .001))
            throw new TypeError("ICC PCS illuminant must be D50.");
        const intent = view.getUint32(64);
        if (intent > 3)
            throw new RangeError("Invalid ICC preferred rendering intent.");
        const count = view.getUint32(128);
        if (count > 128 || 132 + count * 12 > bytes.length)
            throw new RangeError("ICC tag table is invalid or oversized.");
        const tags = new Map<string, {
            offset: number;
            size: number;
        }>();
        const ranges: {
            offset: number;
            size: number;
        }[] = [];
        for (let i = 0; i < count; i++) {
            const entry = 132 + i * 12, name = signature(entry), offset = view.getUint32(entry + 4), size = view.getUint32(entry + 8);
            if (tags.has(name) || offset % 4 !== 0 || offset < 132 + count * 12 || size < 8 || offset + size > bytes.length)
                throw new RangeError("ICC tag is duplicated, misaligned or out of bounds.");
            for (const previous of ranges)
                if (offset < previous.offset + previous.size && previous.offset < offset + size && (offset !== previous.offset || size !== previous.size))
                    throw new RangeError("ICC tag storage partially overlaps.");
            const range = { offset, size };
            tags.set(name, range);
            ranges.push(range);
        }
        if (["A2B1", "A2B2", "B2A1", "B2A2", "D2B0", "B2D0"].some(name => tags.has(name)))
            throw new TypeError("ICC intent-specific or iccMAX multi-process transforms require another backend.");
        if (tags.has("A2B0") !== tags.has("B2A0"))
            throw new TypeError("ICC LUT profiles require paired A2B0/B2A0 transforms for reversible conversion.");
        const tag = (name: string, minSize: number) => {
            const value = tags.get(name);
            if (!value || value.size < minSize)
                throw new TypeError(`ICC ${name} tag is missing or truncated.`);
            return value;
        };
        const fixed = (offset: number) => view.getInt32(offset) / 65536;
        const columns = ["rXYZ", "gXYZ", "bXYZ"].map(name => {
            const t = tag(name, 20);
            if (signature(t.offset) !== "XYZ ")
                throw new TypeError("ICC matrix tag must contain XYZ values.");
            return [fixed(t.offset + 8), fixed(t.offset + 12), fixed(t.offset + 16)];
        });
        const matrix = Object.freeze([columns[0]![0]!, columns[1]![0]!, columns[2]![0]!, columns[0]![1]!, columns[1]![1]!, columns[2]![1]!, columns[0]![2]!, columns[1]![2]!, columns[2]![2]!]);
        const curves = ["rTRC", "gTRC", "bTRC"].map(name => {
            const t = tag(name, 12), type = signature(t.offset);
            let curve: Curve;
            if (type === "curv") {
                const n = view.getUint32(t.offset + 8);
                if (n > 4096 || 12 + n * 2 > t.size)
                    throw new RangeError("ICC tone curve size exceeds bounds.");
                if (n === 0)
                    curve = x => x;
                else if (n === 1) {
                    const gamma = view.getUint16(t.offset + 12) / 256;
                    if (gamma <= 0)
                        throw new RangeError("ICC gamma must be positive.");
                    curve = x => x ** gamma;
                }
                else {
                    const values = Array.from({ length: n }, (_, i) => view.getUint16(t.offset + 12 + i * 2) / 65535);
                    if (values.some((v, i) => i > 0 && v < values[i - 1]!))
                        throw new RangeError("ICC curve must be monotonic.");
                    curve = x => {
                        const p = clamp(x) * (n - 1), i = Math.min(n - 2, Math.floor(p));
                        return values[i]! + (values[i + 1]! - values[i]!) * (p - i);
                    };
                }
            }
            else if (type === "para") {
                const kind = view.getUint16(t.offset + 8), counts = [1, 3, 4, 5, 7], count = counts[kind];
                if (count === undefined || 12 + count * 4 > t.size)
                    throw new TypeError("Unsupported or truncated ICC parametric curve.");
                const values = Array.from({ length: count }, (_, i) => fixed(t.offset + 12 + i * 4)), [g, a, b, c, d, e, f] = values;
                if (g! <= 0 || kind > 0 && a! <= 0)
                    throw new RangeError("ICC parametric exponent/slope is invalid.");
                curve = x => kind === 0 ? x ** g! : kind === 1 ? (x >= -b! / a! ? (a! * x + b!) ** g! : 0) : kind === 2 ? (x >= -b! / a! ? (a! * x + b!) ** g! + c! : c!) : kind === 3 ? (x >= d! ? (a! * x + b!) ** g! : c! * x) : (x >= d! ? (a! * x + b!) ** g! + e! : c! * x + f!);
            }
            else
                throw new TypeError("Unsupported ICC tone curve type.");
            let previous = -Infinity;
            for (let i = 0; i <= 1024; i++) {
                const value = curve(i / 1024);
                if (!Number.isFinite(value) || value < -.0001 || value > 1.0001 || value + 1e-8 < previous)
                    throw new RangeError("ICC curve must be finite, normalized and monotonic.");
                previous = value;
            }
            if (curve(1) - curve(0) < 1e-8)
                throw new RangeError("ICC curve has no invertible range.");
            return curve;
        });
        this.version = version;
        this.preferredIntent = intent;
        this.tags = Object.freeze([...tags.keys()]);
        this.#bytes = bytes;
        this.#matrix = matrix;
        this.#inverse = inverse(matrix);
        this.#curves = Object.freeze(curves);
        const a2b = tags.get("A2B0"), b2a = tags.get("B2A0");
        this.#a2b = a2b ? lut8Transform(bytes, a2b.offset, a2b.size) : null;
        this.#b2a = b2a ? lut8Transform(bytes, b2a.offset, b2a.size) : null;
        if ((this.#a2b === null) !== (this.#b2a === null))
            throw new TypeError("ICC LUT profiles require paired A2B0/B2A0 transforms for reversible conversion.");
        Object.freeze(this);
    }
    copyData(): Uint8Array {
        return this.#bytes.slice();
    }
    toSRGB(value: GFXRGBAComponents): GFXRGBAComponents {
        const c = components(value);
        if (this.#a2b) {
            const pcs = this.#a2b([c.r, c.g, c.b]);
            const linear = d50XYZToLinearSRGB({ x: pcs[0], y: pcs[1], z: pcs[2] });
            return Object.freeze({ r: clamp(encodeSRGBChannel(linear.r)), g: clamp(encodeSRGBChannel(linear.g)), b: clamp(encodeSRGBChannel(linear.b)), a: c.a });
        }
        const linear = [c.r, c.g, c.b].map((v, i) => this.#curves[i]!(v)), rgb = multiply(srgbInverse, multiply(this.#matrix, linear));
        return GFXColour.linearSRGB(clamp(rgb[0]!), clamp(rgb[1]!), clamp(rgb[2]!), c.a).converting("srgb").components;
    }
    fromSRGB(value: GFXRGBAComponents): GFXRGBAComponents {
        const c = components(value);
        if (this.#b2a) {
            const pcs = linearSRGBToD50XYZ({ r: decodeSRGBChannel(c.r), g: decodeSRGBChannel(c.g), b: decodeSRGBChannel(c.b) });
            const device = this.#b2a([clamp(pcs.x), clamp(pcs.y), clamp(pcs.z)]);
            return Object.freeze({ r: clamp(device[0]), g: clamp(device[1]), b: clamp(device[2]), a: c.a });
        }
        const linear = GFXColour.rgba(c.r, c.g, c.b, c.a).converting("linear-srgb").components, device = multiply(this.#inverse, multiply(srgbD50, [linear.r, linear.g, linear.b]));
        const encoded = device.map((target, i) => {
            const curve = this.#curves[i]!;
            let low = 0, high = 1;
            for (let n = 0; n < 32; n++) {
                const middle = (low + high) / 2;
                if (curve(middle) < target)
                    low = middle;
                else
                    high = middle;
            }
            return (low + high) / 2;
        });
        return Object.freeze({ r: encoded[0]!, g: encoded[1]!, b: encoded[2]!, a: c.a });
    }
    decodeImage(descriptor: Omit<GFXImageDescriptor, "colourSpace">): GFXImage {
        if (descriptor.width * descriptor.height > 4 * 1024 * 1024)
            throw new RangeError("Profile conversion exceeds four million pixels.");
        if (descriptor.pixelFormat === "gray8" || descriptor.pixelFormat === "a8")
            throw new TypeError("RGB profiles require RGB image channels.");
        const input = new GFXImage({ ...descriptor, colourSpace: "srgb" }), bytes = new Uint8Array(input.width * input.height * 4);
        for (let y = 0; y < input.height; y++)
            for (let x = 0; x < input.width; x++) {
                const c = this.toSRGB(input.pixel(x, y)), i = (y * input.width + x) * 4;
                bytes[i] = Math.round(c.r * 255);
                bytes[i + 1] = Math.round(c.g * 255);
                bytes[i + 2] = Math.round(c.b * 255);
                bytes[i + 3] = Math.round(c.a * 255);
            }
        return new GFXImage({ width: input.width, height: input.height, alpha: "straight", colourSpace: "srgb", data: bytes });
    }
}
