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

import { normalisePoint, normaliseRect, type GFXPoint, type GFXRect, type GFXSize } from "./GFXGeometry";
import { GFXColour } from "./GFXColour";
import { srgbLinearChannel } from "./colourConversion";
import { encodeImagePNG } from "./imagePNG";
import type { GFXColourSpace, GFXRGBAComponents } from "./colourTypes";
import type { GFXBytePixelDescriptor } from "./GFXPixelDescriptor";
export type GFXAlphaFormat = "straight" | "premultiplied" | "opaque";
export type GFXPixelFormat = "rgba8" | "bgra8" | "rgb8" | "gray8" | "a8";
export type GFXInterpolation = "nearest" | "linear";
export interface GFXImageDescriptor {
    readonly width: number;
    readonly height: number;
    readonly bytesPerRow?: number;
    readonly pixelFormat?: GFXPixelFormat;
    readonly alpha: GFXAlphaFormat;
    readonly colourSpace: GFXColourSpace;
    readonly data: Uint8Array | Uint8ClampedArray;
}
function imageDescriptorData(value: unknown): GFXImageDescriptor {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
        throw new TypeError("Image descriptor must be plain data.");
    const descriptors = Object.getOwnPropertyDescriptors(value), allowed = ["width", "height", "bytesPerRow", "pixelFormat", "alpha", "colourSpace", "data"], required = ["width", "height", "alpha", "colourSpace", "data"];
    const keys = Object.keys(descriptors);
    if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !descriptors[key]) || keys.some((key) => !("value" in descriptors[key]!)))
        throw new TypeError("Image descriptor has an invalid data shape.");
    return Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])) as unknown as GFXImageDescriptor;
}
function integer(value: number, name: string, minimum = 0): number {
    if (!Number.isSafeInteger(value) || value < minimum)
        throw new RangeError(`${name} must be a bounded integer.`);
    return value;
}
function allocation(width: number, height: number, bytesPerPixel: number): Uint8Array {
    integer(width, "width", 1);
    integer(height, "height", 1);
    const bytes = width * height * bytesPerPixel;
    if (!Number.isSafeInteger(bytes) || bytes > 64 * 1024 * 1024)
        throw new RangeError("Image operation exceeds the 64 MiB pixel limit.");
    return new Uint8Array(bytes);
}
function interpolation(value: GFXInterpolation): GFXInterpolation {
    if (value !== "nearest" && value !== "linear")
        throw new TypeError("Unsupported image interpolation.");
    return value;
}
/** Straight unit components of the byte pixel at `index`. The single
 * implementation behind `GFXImage.pixel`, shared with per-sample FX paths. */
export function bytePixelComponents(bytes: Uint8Array, index: number, pixelFormat: GFXPixelFormat, alpha: GFXAlphaFormat): GFXRGBAComponents {
    if (pixelFormat === "a8")
        return { r: 1, g: 1, b: 1, a: bytes[index]! / 255 };
    if (pixelFormat === "gray8") {
        const white = bytes[index]! / 255;
        return { r: white, g: white, b: white, a: 1 };
    }
    const a = alpha === "opaque" ? 1 : bytes[index + 3]! / 255;
    const divisor = alpha === "premultiplied" ? a * 255 : 255;
    const red = pixelFormat === "bgra8" ? 2 : 0, blue = pixelFormat === "bgra8" ? 0 : 2;
    return {
        r: divisor ? Math.min(1, bytes[index + red]! / divisor) : 0,
        g: divisor ? Math.min(1, bytes[index + 1]! / divisor) : 0,
        b: divisor ? Math.min(1, bytes[index + blue]! / divisor) : 0,
        a,
    };
}
let borrowBytes: (image: GFXImage) => Uint8Array;
/**
 * The image's own storage, for read-only use by FX-internal per-sample paths
 * that must not allocate a copy or a record per pixel. Callers must never
 * write to or transfer it; public API consumers receive copies via
 * `copyData()`. Not part of the public GraphicsFX entry.
 */
export function borrowGFXImageBytes(image: GFXImage): Uint8Array {
    return borrowBytes(image);
}
/** Immutable decoded byte pixels. Padding, channel order, alpha encoding and colour space are explicit. */
export class GFXImage {
    static {
        borrowBytes = image => image.#bytes;
    }
    readonly width: number;
    readonly height: number;
    readonly bytesPerRow: number;
    readonly bytesPerPixel: number;
    readonly pixelFormat: GFXPixelFormat;
    readonly alpha: GFXAlphaFormat;
    readonly colourSpace: GFXColourSpace;
    readonly descriptor: GFXBytePixelDescriptor;
    #bytes: Uint8Array;
    constructor(descriptor: GFXImageDescriptor) {
        const input = imageDescriptorData(descriptor);
        this.width = integer(input.width, "width", 1);
        this.height = integer(input.height, "height", 1);
        this.pixelFormat = input.pixelFormat ?? "rgba8";
        if (!["rgba8", "bgra8", "rgb8", "gray8", "a8"].includes(this.pixelFormat))
            throw new TypeError("Unsupported pixel format.");
        this.bytesPerPixel = this.pixelFormat === "rgba8" || this.pixelFormat === "bgra8" ? 4 : this.pixelFormat === "rgb8" ? 3 : 1;
        this.bytesPerRow = integer(input.bytesPerRow ?? this.width * this.bytesPerPixel, "bytesPerRow", this.width * this.bytesPerPixel);
        if (!Number.isSafeInteger(this.bytesPerRow * this.height) || this.bytesPerRow * this.height > 64 * 1024 * 1024)
            throw new RangeError("Image exceeds the 64 MiB pixel limit.");
        if (!["straight", "premultiplied", "opaque"].includes(input.alpha))
            throw new TypeError("Unsupported alpha format.");
        if ((this.pixelFormat === "rgb8" || this.pixelFormat === "gray8") && input.alpha !== "opaque")
            throw new TypeError("This pixel format has no alpha channel.");
        if (this.pixelFormat === "a8" && input.alpha !== "straight")
            throw new TypeError("Alpha-only pixels require straight alpha metadata.");
        if (!["srgb", "linear-srgb", "display-p3", "grayscale"].includes(input.colourSpace))
            throw new TypeError("Unsupported colour space or profile.");
        if (this.pixelFormat === "gray8" && input.colourSpace !== "grayscale")
            throw new TypeError("Gray8 pixels require grayscale colour metadata.");
        if (!(input.data instanceof Uint8Array) && !(input.data instanceof Uint8ClampedArray))
            throw new TypeError("Byte pixel storage is required.");
        if (input.data.byteLength !== this.bytesPerRow * this.height)
            throw new RangeError("Pixel data length must match height and row stride.");
        this.alpha = input.alpha;
        this.colourSpace = input.colourSpace;
        this.descriptor = Object.freeze({
            width: this.width,
            height: this.height,
            bytesPerRow: this.bytesPerRow,
            pixelFormat: this.pixelFormat,
            sampleFormat: "unorm8" as const,
            alpha: this.alpha,
            colourSpace: this.colourSpace,
        });
        this.#bytes = new Uint8Array(input.data);
        Object.freeze(this);
    }
    copyData(): Uint8Array {
        return this.#bytes.slice();
    }
    pixel(x: number, y: number): GFXRGBAComponents {
        integer(x, "x");
        integer(y, "y");
        if (x >= this.width || y >= this.height)
            throw new RangeError("Pixel lies outside image.");
        return Object.freeze(bytePixelComponents(this.#bytes, y * this.bytesPerRow + x * this.bytesPerPixel, this.pixelFormat, this.alpha));
    }
    /** Pixel centres are half-integers. Linear interpolation uses premultiplied components. */
    sample(position: GFXPoint, options: Readonly<{
        interpolation?: GFXInterpolation;
        edge?: "clamp" | "repeat" | "transparent";
    }> = {}): GFXRGBAComponents {
        const point = normalisePoint(position), mode = interpolation(options.interpolation ?? "nearest"), edge = options.edge ?? "clamp";
        if (!["clamp", "repeat", "transparent"].includes(edge))
            throw new TypeError("Unsupported image edge policy.");
        const read = (x: number, y: number): GFXRGBAComponents => {
            if (edge === "transparent" && (x < 0 || y < 0 || x >= this.width || y >= this.height))
                return { r: 0, g: 0, b: 0, a: 0 };
            const address = (n: number, size: number) => edge === "repeat" ? ((n % size) + size) % size : Math.max(0, Math.min(size - 1, n));
            return this.pixel(address(x, this.width), address(y, this.height));
        };
        if (mode === "nearest")
            return read(Math.floor(point.x), Math.floor(point.y));
        const x = Math.floor(point.x - 0.5), y = Math.floor(point.y - 0.5), fx = point.x - 0.5 - x, fy = point.y - 0.5 - y;
        const values = [read(x, y), read(x + 1, y), read(x, y + 1), read(x + 1, y + 1)], weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
        let a = 0, r = 0, g = 0, b = 0;
        for (let i = 0; i < 4; i++) {
            const c = values[i]!, alpha = c.a * weights[i]!;
            a += alpha;
            r += c.r * alpha;
            g += c.g * alpha;
            b += c.b * alpha;
        }
        return Object.freeze({ r: a ? r / a : 0, g: a ? g / a : 0, b: a ? b / a : 0, a });
    }
    /** Crop intersects integral pixel bounds; an empty intersection returns null. */
    cropped(rect: GFXRect): GFXImage | null {
        const r = normaliseRect(rect);
        if (![r.x, r.y, r.width, r.height].every(Number.isSafeInteger) || !Number.isSafeInteger(r.x + r.width) || !Number.isSafeInteger(r.y + r.height))
            throw new RangeError("Crop bounds must be integral safe pixel coordinates.");
        const x = Math.max(0, r.x), y = Math.max(0, r.y), right = Math.min(this.width, r.x + r.width), bottom = Math.min(this.height, r.y + r.height);
        if (right <= x || bottom <= y)
            return null;
        const width = right - x, height = bottom - y, bytes = allocation(width, height, this.bytesPerPixel), stride = width * this.bytesPerPixel;
        for (let row = 0; row < height; row++)
            bytes.set(this.#bytes.subarray((y + row) * this.bytesPerRow + x * this.bytesPerPixel, (y + row) * this.bytesPerRow + x * this.bytesPerPixel + stride), row * stride);
        return new GFXImage({ width, height, alpha: this.alpha, colourSpace: this.colourSpace, pixelFormat: this.pixelFormat, data: bytes });
    }
    #colour(c: GFXRGBAComponents): GFXColour {
        return this.colourSpace === "display-p3" ? GFXColour.displayP3(c.r, c.g, c.b, c.a) : this.colourSpace === "linear-srgb" ? GFXColour.linearSRGB(c.r, c.g, c.b, c.a) : GFXColour.rgba(c.r, c.g, c.b, c.a);
    }
    #mapped(width: number, height: number, sample: (x: number, y: number) => GFXRGBAComponents, colourSpace: GFXColourSpace, alpha: GFXAlphaFormat = "straight"): GFXImage {
        const bytes = allocation(width, height, 4);
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const c = sample(x, y), i = (y * width + x) * 4, factor = alpha === "premultiplied" ? c.a : 1;
                bytes[i] = Math.round(c.r * factor * 255);
                bytes[i + 1] = Math.round(c.g * factor * 255);
                bytes[i + 2] = Math.round(c.b * factor * 255);
                bytes[i + 3] = alpha === "opaque" ? 255 : Math.round(c.a * 255);
            }
        return new GFXImage({ width, height, alpha, colourSpace, data: bytes });
    }
    converting(colourSpace: GFXColourSpace, alpha: GFXAlphaFormat = this.alpha): GFXImage {
        if (!["straight", "premultiplied", "opaque"].includes(alpha))
            throw new TypeError("Unsupported alpha format.");
        GFXColour.rgba(0, 0, 0).converting(colourSpace);
        if (colourSpace === this.colourSpace && alpha === this.alpha)
            return this;
        return this.#mapped(this.width, this.height, (x, y) => this.#colour(this.pixel(x, y)).converting(colourSpace).components, colourSpace, alpha);
    }
    resized(size: GFXSize, mode: GFXInterpolation = "linear"): GFXImage {
        integer(size.width, "width", 1);
        integer(size.height, "height", 1);
        interpolation(mode);
        return this.#mapped(size.width, size.height, (x, y) => this.sample({ x: (x + 0.5) * this.width / size.width, y: (y + 0.5) * this.height / size.height }, { interpolation: mode }), this.colourSpace);
    }
    extractMask(mode: "alpha" | "luminance" = "alpha"): GFXImage {
        if (mode !== "alpha" && mode !== "luminance")
            throw new TypeError("Unsupported mask extraction mode.");
        const bytes = allocation(this.width, this.height, 1);
        for (let y = 0; y < this.height; y++)
            for (let x = 0; x < this.width; x++) {
                const colour = this.#colour(this.pixel(x, y)).converting("srgb").components;
                const alpha = mode === "alpha" ? colour.a : colour.a * (0.2126 * srgbLinearChannel(colour.r) + 0.7152 * srgbLinearChannel(colour.g) + 0.0722 * srgbLinearChannel(colour.b));
                bytes[y * this.width + x] = Math.round(alpha * 255);
            }
        return new GFXImage({ width: this.width, height: this.height, pixelFormat: "a8", alpha: "straight", colourSpace: "srgb", data: bytes });
    }
    withAlphaMask(mask: GFXImage): GFXImage {
        if (!(mask instanceof GFXImage) || mask.width !== this.width || mask.height !== this.height)
            throw new RangeError("Alpha mask dimensions must match the image.");
        return this.#mapped(this.width, this.height, (x, y) => {
            const c = this.pixel(x, y);
            return { ...c, a: c.a * mask.pixel(x, y).a };
        }, this.colourSpace);
    }
    toPNG(): Uint8Array {
        return encodeImagePNG(this);
    }
}
/** Callback storage stays with its owner until the provider is released. */
export interface GFXCallbackDataProvider {
    readonly length: number;
    read(offset: number, length: number): Uint8Array | Uint8ClampedArray;
    release(): void;
}
/** Byte provider owns its snapshot; consumers can request only bounded slices. */
export class GFXDataProvider {
    #bytes: Uint8Array | null = null;
    #read: GFXCallbackDataProvider["read"] | null = null;
    #release: GFXCallbackDataProvider["release"] | null = null;
    #length: number;
    #released = false;
    constructor(data: Uint8Array | GFXCallbackDataProvider) {
        if (data instanceof Uint8Array) {
            if (data.length > 64 * 1024 * 1024)
                throw new RangeError("Invalid or oversized provider data.");
            this.#bytes = data.slice();
            this.#length = data.length;
        } else {
            if (!data || typeof data !== "object" || !Number.isSafeInteger(data.length) || data.length < 0 || data.length > 64 * 1024 * 1024 || typeof data.read !== "function" || typeof data.release !== "function")
                throw new RangeError("Invalid or oversized provider data.");
            this.#length = data.length;
            this.#read = data.read.bind(data);
            this.#release = data.release.bind(data);
        }
        Object.freeze(this);
    }
    get length() {
        return this.#length;
    }
    get released() {
        return this.#released;
    }
    read(offset: number, length: number): Uint8Array {
        if (this.#released)
            throw new Error("Provider is released.");
        integer(offset, "offset");
        integer(length, "length");
        if (offset > this.length || length > this.length - offset)
            throw new RangeError("Read exceeds provider bounds.");
        if (this.#bytes)
            return this.#bytes.slice(offset, offset + length);
        const result = this.#read!(offset, length);
        if (!(result instanceof Uint8Array) && !(result instanceof Uint8ClampedArray) || result.length !== length)
            throw new RangeError("Callback provider returned an invalid read length.");
        return Uint8Array.from(result);
    }
    release(): void {
        if (this.#released)
            return;
        this.#released = true;
        this.#bytes = null;
        const release = this.#release;
        this.#read = null;
        this.#release = null;
        release?.();
    }
}
export class GFXDataConsumer {
    #chunks: Uint8Array[] = [];
    #length = 0;
    #closed = false;
    constructor(readonly maximumBytes = 64 * 1024 * 1024) {
        integer(maximumBytes, "maximumBytes");
    }
    write(bytes: Uint8Array): void {
        if (this.#closed)
            throw new Error("Consumer is closed.");
        if (!(bytes instanceof Uint8Array) || this.#length + bytes.length > this.maximumBytes)
            throw new RangeError("Consumer capacity exceeded.");
        this.#chunks.push(bytes.slice());
        this.#length += bytes.length;
    }
    finish(): Uint8Array {
        if (this.#closed)
            throw new Error("Consumer is closed.");
        this.#closed = true;
        const data = new Uint8Array(this.#length);
        let offset = 0;
        for (const chunk of this.#chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }
        this.#chunks = [];
        return data;
    }
    dispose(): void {
        this.#closed = true;
        this.#chunks = [];
        this.#length = 0;
    }
}
export interface GFXImageDrawingDestination {
    drawImage(image: GFXImage, rect: GFXRect): void;
}
