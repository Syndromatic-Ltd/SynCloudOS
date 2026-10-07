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

import type { GFXAlphaFormat } from "./GFXImage";
import type { GFXColourSpace } from "./colourTypes";
import type { GFXExtendedRGBA } from "./GFXColourTransform";
import type { GFXPixelDescriptor } from "./GFXPixelDescriptor";

export type GFXFloatSampleFormat = "float16" | "float32";
export interface GFXFloatImageDescriptor {
  readonly width: number;
  readonly height: number;
  readonly sampleFormat: GFXFloatSampleFormat;
  readonly alpha: GFXAlphaFormat;
  readonly colourSpace: GFXColourSpace;
  readonly data: Float32Array | Uint16Array;
}
export interface GFXIndexedImageDescriptor {
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array | Uint16Array;
  readonly palette: readonly GFXExtendedRGBA[];
  readonly colourSpace: GFXColourSpace;
}

const finite = (value: number, name: string) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
};
const integer = (value: number, name: string, minimum = 1) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`${name} must be a bounded integer.`);
  return value;
};
const validateSpace = (value: GFXColourSpace) => {
  if (!["srgb", "linear-srgb", "display-p3", "grayscale"].includes(value)) throw new TypeError("Unsupported colour space.");
  return value;
};

function halfToFloat(value: number): number {
  const sign = value & 0x8000 ? -1 : 1, exponent = (value >>> 10) & 0x1f, mantissa = value & 0x3ff;
  if (exponent === 0) return sign * (mantissa === 0 ? 0 : 2 ** -14 * mantissa / 1024);
  if (exponent === 31) return mantissa ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

function float32ToHalf(value: number): number {
  const bits = new Uint32Array(new Float32Array([value]).buffer)[0]!, sign = (bits >>> 16) & 0x8000;
  let exponent = ((bits >>> 23) & 0xff) - 127 + 15, mantissa = bits & 0x7fffff;
  if (((bits >>> 23) & 0xff) === 0xff) return sign | (mantissa ? 0x7e00 : 0x7c00);
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa = (mantissa | 0x800000) >>> (1 - exponent);
    return sign | ((mantissa + 0x1000) >>> 13);
  }
  if (exponent >= 31) return sign | 0x7c00;
  mantissa += 0x1000;
  if (mantissa & 0x800000) {
    exponent += 1; mantissa = 0;
    if (exponent >= 31) return sign | 0x7c00;
  }
  return sign | (exponent << 10) | (mantissa >>> 13);
}

/** Immutable extended-range RGBA storage. Alpha stays normalized; RGB may be negative or exceed one. */
export class GFXFloatImage {
  readonly width: number;
  readonly height: number;
  readonly sampleFormat: GFXFloatSampleFormat;
  readonly alpha: GFXAlphaFormat;
  readonly colourSpace: GFXColourSpace;
  readonly bytesPerRow: number;
  readonly bytesPerPixel: number;
  readonly pixelFormat = "rgba-float" as const;
  readonly descriptor: GFXPixelDescriptor;
  readonly #float32: Float32Array | null;
  readonly #float16: Uint16Array | null;

  constructor(descriptor: GFXFloatImageDescriptor) {
    if (!descriptor || typeof descriptor !== "object") throw new TypeError("Float image descriptor required.");
    this.width = integer(descriptor.width, "width");
    this.height = integer(descriptor.height, "height");
    if (descriptor.sampleFormat !== "float16" && descriptor.sampleFormat !== "float32") throw new TypeError("Unsupported float sample format.");
    this.sampleFormat = descriptor.sampleFormat;
    if (!["straight", "premultiplied", "opaque"].includes(descriptor.alpha)) throw new TypeError("Unsupported alpha format.");
    this.alpha = descriptor.alpha;
    this.colourSpace = validateSpace(descriptor.colourSpace);
    const samples = this.width * this.height * 4, bytes = samples * (this.sampleFormat === "float16" ? 2 : 4);
    if (!Number.isSafeInteger(samples) || bytes > 64 * 1024 * 1024) throw new RangeError("Float image exceeds the 64 MiB pixel limit.");
    if (!(descriptor.data instanceof Float32Array) && !(descriptor.data instanceof Uint16Array)) throw new TypeError("Float image storage must be Float32Array or Uint16Array.");
    if (descriptor.data.length !== samples) throw new RangeError("Float image data length does not match dimensions.");
    const source = descriptor.data instanceof Float32Array ? descriptor.data : Float32Array.from(descriptor.data, halfToFloat);
    for (let i = 0; i < source.length; i += 4) {
      for (let c = 0; c < 3; c++) finite(source[i + c]!, "RGB sample");
      const alpha = finite(source[i + 3]!, "alpha sample");
      if (alpha < 0 || alpha > 1) throw new RangeError("Float alpha must be a unit value.");
    }
    if (this.sampleFormat === "float32") {
      this.#float32 = source.slice();
      this.#float16 = null;
    } else {
      this.#float16 = Uint16Array.from(source, float32ToHalf);
      this.#float32 = null;
    }
    this.bytesPerPixel = this.sampleFormat === "float16" ? 8 : 16;
    this.bytesPerRow = this.width * this.bytesPerPixel;
    this.descriptor = Object.freeze({
      width: this.width,
      height: this.height,
      bytesPerRow: this.bytesPerRow,
      pixelFormat: this.pixelFormat,
      sampleFormat: this.sampleFormat,
      alpha: this.alpha,
      colourSpace: this.colourSpace,
    });
    Object.freeze(this);
  }

  static fromIndexed(descriptor: GFXIndexedImageDescriptor): GFXFloatImage {
    if (!descriptor || typeof descriptor !== "object") throw new TypeError("Indexed image descriptor required.");
    const width = integer(descriptor.width, "width"), height = integer(descriptor.height, "height");
    if (!(descriptor.indices instanceof Uint8Array) && !(descriptor.indices instanceof Uint16Array)) throw new TypeError("Indexed pixels require Uint8Array or Uint16Array.");
    if (descriptor.indices.length !== width * height) throw new RangeError("Indexed data length does not match dimensions.");
    if (!Array.isArray(descriptor.palette) || descriptor.palette.length < 1 || descriptor.palette.length > 65536) throw new RangeError("Indexed palette must contain 1..65536 colours.");
    const palette = descriptor.palette.map((entry, index) => {
      if (!entry || typeof entry !== "object") throw new TypeError(`Palette entry ${index} is invalid.`);
      const value = { r: finite(entry.r, "palette red"), g: finite(entry.g, "palette green"), b: finite(entry.b, "palette blue"), a: finite(entry.a, "palette alpha") };
      if (value.a < 0 || value.a > 1) throw new RangeError("Palette alpha must be a unit value.");
      return Object.freeze(value);
    });
    const data = new Float32Array(width * height * 4);
    for (let pixel = 0; pixel < descriptor.indices.length; pixel++) {
      const colour = palette[descriptor.indices[pixel]!];
      if (!colour) throw new RangeError("Indexed pixel references outside the palette.");
      data.set([colour.r, colour.g, colour.b, colour.a], pixel * 4);
    }
    return new GFXFloatImage({ width, height, sampleFormat: "float32", alpha: "straight", colourSpace: validateSpace(descriptor.colourSpace), data });
  }

  copyData(): Float32Array | Uint16Array {
    return this.#float32 ? this.#float32.slice() : this.#float16!.slice();
  }

  pixel(x: number, y: number): GFXExtendedRGBA {
    integer(x, "x", 0); integer(y, "y", 0);
    if (x >= this.width || y >= this.height) throw new RangeError("Pixel lies outside image.");
    const i = (y * this.width + x) * 4;
    const read = (offset: number) => this.#float32 ? this.#float32[i + offset]! : halfToFloat(this.#float16![i + offset]!);
    const a = this.alpha === "opaque" ? 1 : read(3);
    if (a === 0) return Object.freeze({ r: 0, g: 0, b: 0, a: 0 });
    const divisor = this.alpha === "premultiplied" ? a : 1;
    return Object.freeze({ r: read(0) / divisor, g: read(1) / divisor, b: read(2) / divisor, a });
  }
}
