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

import type { GFXAlphaFormat } from "../GraphicsFX/GFXImage";
import type { GFXColourSpace } from "../GraphicsFX/colourTypes";
import type { GFXRect } from "../GraphicsFX/GFXGeometry";

export type VFXPixelFormat = "rgba8" | "bgra8" | "i420" | "nv12";
export type VFXYUVMatrix = "bt709-full";

export interface VFXPlaneLayout {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly offset: number;
  readonly bytesPerRow: number;
  readonly rowBytes: number;
  readonly byteLength: number;
}

export interface VFXPixelAspectRatio {
  readonly numerator: number;
  readonly denominator: number;
}

export interface VFXVideoFormatInit {
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly pixelFormat: VFXPixelFormat;
  readonly colourSpace: GFXColourSpace;
  readonly alpha?: GFXAlphaFormat;
  readonly planeStrides?: readonly number[];
  readonly cleanAperture?: GFXRect;
  readonly pixelAspectRatio?: VFXPixelAspectRatio;
}

const maximumDimension = 16_384;
const maximumBytes = 256 * 1024 * 1024;

function positiveInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum)
    throw new RangeError(`${label} must be a positive bounded integer.`);
  return value as number;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new RangeError(`${label} must be a nonnegative bounded integer.`);
  return value as number;
}

function snapshotAspect(value: VFXPixelAspectRatio | undefined): VFXPixelAspectRatio {
  const numerator = positiveInteger(value?.numerator ?? 1, "Pixel-aspect numerator", 1_000_000);
  const denominator = positiveInteger(value?.denominator ?? 1, "Pixel-aspect denominator", 1_000_000);
  return Object.freeze({ numerator, denominator });
}

function snapshotAperture(value: GFXRect | undefined, width: number, height: number): GFXRect {
  const candidate = value ?? { x: 0, y: 0, width, height };
  if (!candidate || typeof candidate !== "object") throw new TypeError("Clean aperture must be a rectangle.");
  const x = nonnegativeInteger(candidate.x, "Clean-aperture x");
  const y = nonnegativeInteger(candidate.y, "Clean-aperture y");
  const apertureWidth = positiveInteger(candidate.width, "Clean-aperture width", maximumDimension);
  const apertureHeight = positiveInteger(candidate.height, "Clean-aperture height", maximumDimension);
  if (x + apertureWidth > width || y + apertureHeight > height)
    throw new RangeError("Clean aperture must fit within coded video dimensions.");
  return Object.freeze({ x, y, width: apertureWidth, height: apertureHeight });
}

function denseStrides(value: readonly number[] | undefined, expected: number): readonly number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== expected) throw new RangeError(`Video plane strides must contain exactly ${expected} entries.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Video plane strides must be a dense data array.");
    result.push(positiveInteger(descriptor.value, "Video plane stride", maximumBytes));
  }
  return Object.freeze(result);
}

function planeDimensions(format: VFXPixelFormat, width: number, height: number): readonly Readonly<{ width: number; height: number; rowBytes: number }>[] {
  if (format === "rgba8" || format === "bgra8") return Object.freeze([{ width, height, rowBytes: width * 4 }]);
  const chromaWidth = Math.ceil(width / 2), chromaHeight = Math.ceil(height / 2);
  if (format === "i420") return Object.freeze([
    { width, height, rowBytes: width },
    { width: chromaWidth, height: chromaHeight, rowBytes: chromaWidth },
    { width: chromaWidth, height: chromaHeight, rowBytes: chromaWidth },
  ]);
  return Object.freeze([
    { width, height, rowBytes: width },
    { width: chromaWidth, height: chromaHeight, rowBytes: chromaWidth * 2 },
  ]);
}

export class VFXVideoFormat {
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly pixelFormat: VFXPixelFormat;
  readonly colourSpace: GFXColourSpace;
  readonly alpha: GFXAlphaFormat;
  readonly yuvMatrix: VFXYUVMatrix | null;
  readonly cleanAperture: GFXRect;
  readonly pixelAspectRatio: VFXPixelAspectRatio;
  readonly planeLayouts: readonly VFXPlaneLayout[];
  readonly byteLength: number;

  constructor(init: VFXVideoFormatInit) {
    if (!init || typeof init !== "object") throw new TypeError("Video format requires initialization data.");
    this.codedWidth = positiveInteger(init.codedWidth, "Coded width", maximumDimension);
    this.codedHeight = positiveInteger(init.codedHeight, "Coded height", maximumDimension);
    if (!["rgba8", "bgra8", "i420", "nv12"].includes(init.pixelFormat)) throw new TypeError("Unsupported VideoFX pixel format.");
    this.pixelFormat = init.pixelFormat;
    if (!["srgb", "linear-srgb", "display-p3", "grayscale"].includes(init.colourSpace)) throw new TypeError("Unsupported VideoFX colour space.");
    if (init.colourSpace === "grayscale") throw new TypeError("VideoFX colour frames require an RGB working colour space.");
    this.colourSpace = init.colourSpace;
    const planar = this.pixelFormat === "i420" || this.pixelFormat === "nv12";
    const alpha = init.alpha ?? (planar ? "opaque" : "straight");
    if (!["straight", "premultiplied", "opaque"].includes(alpha)) throw new TypeError("Unsupported VideoFX alpha format.");
    if (planar && alpha !== "opaque") throw new TypeError("Portable planar VideoFX formats do not carry alpha.");
    this.alpha = alpha;
    this.yuvMatrix = planar ? "bt709-full" : null;
    this.cleanAperture = snapshotAperture(init.cleanAperture, this.codedWidth, this.codedHeight);
    this.pixelAspectRatio = snapshotAspect(init.pixelAspectRatio);

    const dimensions = planeDimensions(this.pixelFormat, this.codedWidth, this.codedHeight);
    const strides = denseStrides(init.planeStrides, dimensions.length);
    const layouts: VFXPlaneLayout[] = [];
    let offset = 0;
    dimensions.forEach((plane, index) => {
      const bytesPerRow = strides?.[index] ?? plane.rowBytes;
      if (bytesPerRow < plane.rowBytes) throw new RangeError(`Video plane ${index} stride is smaller than its active row bytes.`);
      const byteLength = bytesPerRow * plane.height;
      if (!Number.isSafeInteger(byteLength) || !Number.isSafeInteger(offset + byteLength) || offset + byteLength > maximumBytes)
        throw new RangeError("Video format exceeds the 256 MiB portable allocation limit.");
      layouts.push(Object.freeze({ index, width: plane.width, height: plane.height, offset, bytesPerRow, rowBytes: plane.rowBytes, byteLength }));
      offset += byteLength;
    });
    this.planeLayouts = Object.freeze(layouts);
    this.byteLength = offset;
    Object.freeze(this);
  }

  equals(other: VFXVideoFormat): boolean {
    return other instanceof VFXVideoFormat
      && this.codedWidth === other.codedWidth
      && this.codedHeight === other.codedHeight
      && this.pixelFormat === other.pixelFormat
      && this.colourSpace === other.colourSpace
      && this.alpha === other.alpha
      && this.cleanAperture.x === other.cleanAperture.x
      && this.cleanAperture.y === other.cleanAperture.y
      && this.cleanAperture.width === other.cleanAperture.width
      && this.cleanAperture.height === other.cleanAperture.height
      && this.pixelAspectRatio.numerator === other.pixelAspectRatio.numerator
      && this.pixelAspectRatio.denominator === other.pixelAspectRatio.denominator
      && this.planeLayouts.length === other.planeLayouts.length
      && this.planeLayouts.every((plane, index) => plane.bytesPerRow === other.planeLayouts[index]?.bytesPerRow);
  }
}
