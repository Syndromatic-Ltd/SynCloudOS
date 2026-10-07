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

import { GFXImage } from "../GraphicsFX/GFXImage";
import { VFXVideoFormat, type VFXPixelFormat } from "./VFXVideoFormat";

interface VFXPixelBacking {
  readonly format: VFXVideoFormat;
  readonly bytes: Uint8Array;
  refs: number;
  onZero?: (backing: VFXPixelBacking) => void;
}

const pixelBufferState = new WeakMap<VFXPixelBuffer, VFXPixelBacking | null>();

function closedError(): DOMException {
  return new DOMException("Video pixel buffer is closed.", "InvalidStateError");
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function yuvFromRGB(r: number, g: number, b: number): readonly [number, number, number] {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const u = -0.114572 * r - 0.385428 * g + 0.5 * b + 0.5;
  const v = 0.5 * r - 0.454153 * g - 0.045847 * b + 0.5;
  return [y, u, v];
}

function rgbFromYUV(y: number, u: number, v: number): readonly [number, number, number] {
  const cb = u - 0.5, cr = v - 0.5;
  return [
    Math.max(0, Math.min(1, y + 1.5748 * cr)),
    Math.max(0, Math.min(1, y - 0.187324 * cb - 0.468124 * cr)),
    Math.max(0, Math.min(1, y + 1.8556 * cb)),
  ];
}

export class VFXPixelBuffer {
  constructor(format: VFXVideoFormat, data?: Uint8Array) {
    if (!(format instanceof VFXVideoFormat)) throw new TypeError("Video pixel buffer requires a VFXVideoFormat.");
    if (data !== undefined && !(data instanceof Uint8Array)) throw new TypeError("Video pixel storage must be Uint8Array.");
    if (data && data.byteLength !== format.byteLength) throw new RangeError("Video pixel storage length must match the format plane layout.");
    const bytes = data ? data.slice() : new Uint8Array(format.byteLength);
    pixelBufferState.set(this, { format, bytes, refs: 1 });
    Object.freeze(this);
  }

  static fromBacking(backing: VFXPixelBacking, increment = true): VFXPixelBuffer {
    const value = Object.create(VFXPixelBuffer.prototype) as VFXPixelBuffer;
    if (increment) backing.refs += 1;
    pixelBufferState.set(value, backing);
    Object.freeze(value);
    return value;
  }

  static fromGFXImage(image: GFXImage, options: Readonly<{ pixelFormat?: VFXPixelFormat }> = {}): VFXPixelBuffer {
    if (!(image instanceof GFXImage)) throw new TypeError("Video conversion requires a GFXImage.");
    const pixelFormat = options.pixelFormat ?? (image.pixelFormat === "bgra8" ? "bgra8" : "rgba8");
    const format = new VFXVideoFormat({
      codedWidth: image.width,
      codedHeight: image.height,
      pixelFormat,
      colourSpace: image.colourSpace === "grayscale" ? "srgb" : image.colourSpace,
      alpha: pixelFormat === "i420" || pixelFormat === "nv12" ? "opaque" : image.alpha,
    });
    const bytes = new Uint8Array(format.byteLength);
    if (pixelFormat === "rgba8" || pixelFormat === "bgra8") {
      const plane = format.planeLayouts[0]!;
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const pixel = image.pixel(x, y);
          const offset = plane.offset + y * plane.bytesPerRow + x * 4;
          const r = byte(pixel.r), g = byte(pixel.g), b = byte(pixel.b), a = format.alpha === "opaque" ? 255 : byte(pixel.a);
          if (pixelFormat === "rgba8") bytes.set([r, g, b, a], offset);
          else bytes.set([b, g, r, a], offset);
        }
      }
    } else {
      const yPlane = format.planeLayouts[0]!;
      for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
        const pixel = image.pixel(x, y);
        const [luma] = yuvFromRGB(pixel.r, pixel.g, pixel.b);
        bytes[yPlane.offset + y * yPlane.bytesPerRow + x] = byte(luma);
      }
      const chromaHeight = Math.ceil(image.height / 2), chromaWidth = Math.ceil(image.width / 2);
      for (let cy = 0; cy < chromaHeight; cy += 1) for (let cx = 0; cx < chromaWidth; cx += 1) {
        let u = 0, v = 0, count = 0;
        for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
          const x = cx * 2 + dx, y = cy * 2 + dy;
          if (x >= image.width || y >= image.height) continue;
          const pixel = image.pixel(x, y), converted = yuvFromRGB(pixel.r, pixel.g, pixel.b);
          u += converted[1]; v += converted[2]; count += 1;
        }
        if (pixelFormat === "i420") {
          const uPlane = format.planeLayouts[1]!, vPlane = format.planeLayouts[2]!;
          bytes[uPlane.offset + cy * uPlane.bytesPerRow + cx] = byte(u / count);
          bytes[vPlane.offset + cy * vPlane.bytesPerRow + cx] = byte(v / count);
        } else {
          const uvPlane = format.planeLayouts[1]!, offset = uvPlane.offset + cy * uvPlane.bytesPerRow + cx * 2;
          bytes[offset] = byte(u / count); bytes[offset + 1] = byte(v / count);
        }
      }
    }
    return new VFXPixelBuffer(format, bytes);
  }

  get closed(): boolean { return pixelBufferState.get(this) === null; }
  get format(): VFXVideoFormat { return this.assertLive().format; }
  get byteLength(): number { return this.assertLive().bytes.byteLength; }

  clone(): VFXPixelBuffer {
    return VFXPixelBuffer.fromBacking(this.assertLive());
  }

  transfer(): VFXPixelBuffer {
    const backing = this.assertLive();
    pixelBufferState.set(this, null);
    return VFXPixelBuffer.fromBacking(backing, false);
  }

  copyData(): Uint8Array {
    return this.assertLive().bytes.slice();
  }

  copyPlane(index: number): Uint8Array {
    const backing = this.assertLive();
    if (!Number.isSafeInteger(index) || index < 0 || index >= backing.format.planeLayouts.length) throw new RangeError("Video plane index is outside the format.");
    const plane = backing.format.planeLayouts[index]!;
    return backing.bytes.slice(plane.offset, plane.offset + plane.byteLength);
  }

  toGFXImage(): GFXImage {
    const backing = this.assertLive(), format = backing.format;
    const output = new Uint8Array(format.codedWidth * format.codedHeight * 4);
    if (format.pixelFormat === "rgba8" || format.pixelFormat === "bgra8") {
      const plane = format.planeLayouts[0]!;
      for (let y = 0; y < format.codedHeight; y += 1) for (let x = 0; x < format.codedWidth; x += 1) {
        const source = plane.offset + y * plane.bytesPerRow + x * 4, target = (y * format.codedWidth + x) * 4;
        const r = format.pixelFormat === "rgba8" ? backing.bytes[source]! : backing.bytes[source + 2]!;
        const b = format.pixelFormat === "rgba8" ? backing.bytes[source + 2]! : backing.bytes[source]!;
        output.set([r, backing.bytes[source + 1]!, b, format.alpha === "opaque" ? 255 : backing.bytes[source + 3]!], target);
      }
    } else {
      const yPlane = format.planeLayouts[0]!;
      for (let y = 0; y < format.codedHeight; y += 1) for (let x = 0; x < format.codedWidth; x += 1) {
        const luma = backing.bytes[yPlane.offset + y * yPlane.bytesPerRow + x]! / 255;
        const cx = Math.floor(x / 2), cy = Math.floor(y / 2);
        let u: number, v: number;
        if (format.pixelFormat === "i420") {
          const up = format.planeLayouts[1]!, vp = format.planeLayouts[2]!;
          u = backing.bytes[up.offset + cy * up.bytesPerRow + cx]! / 255;
          v = backing.bytes[vp.offset + cy * vp.bytesPerRow + cx]! / 255;
        } else {
          const uv = format.planeLayouts[1]!, offset = uv.offset + cy * uv.bytesPerRow + cx * 2;
          u = backing.bytes[offset]! / 255; v = backing.bytes[offset + 1]! / 255;
        }
        const [r, g, b] = rgbFromYUV(luma, u, v), target = (y * format.codedWidth + x) * 4;
        output.set([byte(r), byte(g), byte(b), 255], target);
      }
    }
    return new GFXImage({ width: format.codedWidth, height: format.codedHeight, pixelFormat: "rgba8", alpha: format.alpha, colourSpace: format.colourSpace, data: output });
  }

  close(): void {
    const backing = pixelBufferState.get(this);
    if (!backing) return;
    pixelBufferState.set(this, null);
    backing.refs -= 1;
    if (backing.refs === 0) backing.onZero?.(backing);
  }

  private assertLive(): VFXPixelBacking {
    const backing = pixelBufferState.get(this);
    if (!backing) throw closedError();
    return backing;
  }
}

export interface VFXPixelBufferPoolOptions {
  readonly maximumBuffers?: number;
  readonly maximumBytes?: number;
}

export interface VFXPixelBufferPoolDiagnostics {
  readonly allocatedBuffers: number;
  readonly availableBuffers: number;
  readonly liveHandles: number;
  readonly retainedBytes: number;
  readonly allocationCount: number;
  readonly reuseCount: number;
  readonly disposed: boolean;
}

export class VFXPixelBufferPool {
  readonly #maximumBuffers: number;
  readonly #maximumBytes: number;
  readonly #backings = new Set<VFXPixelBacking>();
  readonly #available: VFXPixelBacking[] = [];
  #allocationCount = 0;
  #reuseCount = 0;
  #disposed = false;

  constructor(options: VFXPixelBufferPoolOptions = {}) {
    const maximumBuffers = options.maximumBuffers ?? 16, maximumBytes = options.maximumBytes ?? 64 * 1024 * 1024;
    if (!Number.isSafeInteger(maximumBuffers) || maximumBuffers < 1 || maximumBuffers > 4096) throw new RangeError("Video pool maximumBuffers must be between 1 and 4096.");
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 512 * 1024 * 1024) throw new RangeError("Video pool maximumBytes must be between 1 byte and 512 MiB.");
    this.#maximumBuffers = maximumBuffers;
    this.#maximumBytes = maximumBytes;
  }

  acquire(format: VFXVideoFormat, data?: Uint8Array): VFXPixelBuffer {
    if (this.#disposed) throw new DOMException("Video pixel pool is disposed.", "InvalidStateError");
    if (!(format instanceof VFXVideoFormat)) throw new TypeError("Video pool requires a VFXVideoFormat.");
    if (data !== undefined && (!(data instanceof Uint8Array) || data.byteLength !== format.byteLength)) throw new RangeError("Video pool input must match the requested format byte length.");
    const candidateIndex = this.#available.findIndex((candidate) => candidate.format.equals(format));
    let backing: VFXPixelBacking;
    if (candidateIndex >= 0) {
      backing = this.#available.splice(candidateIndex, 1)[0]!;
      backing.refs = 1;
      this.#reuseCount += 1;
    } else {
      const retainedBytes = [...this.#backings].reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
      if (this.#backings.size >= this.#maximumBuffers || format.byteLength > this.#maximumBytes - retainedBytes)
        throw new DOMException("Video pixel pool quota reached.", "QuotaExceededError");
      backing = { format, bytes: new Uint8Array(format.byteLength), refs: 1 };
      backing.onZero = (released) => this.#releaseBacking(released);
      this.#backings.add(backing);
      this.#allocationCount += 1;
    }
    backing.bytes.fill(0);
    if (data) backing.bytes.set(data);
    return VFXPixelBuffer.fromBacking(backing, false);
  }

  diagnostics(): VFXPixelBufferPoolDiagnostics {
    return Object.freeze({
      allocatedBuffers: this.#backings.size,
      availableBuffers: this.#available.length,
      liveHandles: [...this.#backings].reduce((sum, entry) => sum + entry.refs, 0),
      retainedBytes: [...this.#backings].reduce((sum, entry) => sum + entry.bytes.byteLength, 0),
      allocationCount: this.#allocationCount,
      reuseCount: this.#reuseCount,
      disposed: this.#disposed,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const backing of [...this.#available]) this.#backings.delete(backing);
    this.#available.length = 0;
    for (const backing of [...this.#backings]) if (backing.refs === 0) this.#backings.delete(backing);
  }

  #releaseBacking(backing: VFXPixelBacking): void {
    if (!this.#backings.has(backing)) return;
    if (this.#disposed) {
      this.#backings.delete(backing);
      return;
    }
    this.#available.push(backing);
  }
}
