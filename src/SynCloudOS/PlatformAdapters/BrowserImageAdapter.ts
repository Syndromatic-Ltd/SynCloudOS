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

import { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import type { RuntimeDecodedImageLease, RuntimeImageAdapter, RuntimeImageAdapterFactory, RuntimeImageDecodeRequest, SynCloudOSRuntimeId } from "../SynCloudOS";
import type { BrowserImagePlatform } from "./browserImageAdapterTypes";
import { inspectImageBinaryMetadata } from "./imageBinaryMetadata";

const intrinsicUint8ArraySlice = Uint8Array.prototype.slice;

function inspectDecodeRequest(value: Parameters<RuntimeImageAdapter["decode"]>[0]): RuntimeImageDecodeRequest {
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError("Image decode request must be a plain record.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== 3 || ["cacheKey", "source", "signal"].some((key) => !descriptors[key] || !Object.prototype.hasOwnProperty.call(descriptors[key]!, "value"))) throw new TypeError("Image decode request fields must be data.");
  const cacheKey = descriptors.cacheKey!.value; const source = descriptors.source!.value; const signal = descriptors.signal!.value;
  if (typeof cacheKey !== "string" || cacheKey.length === 0 || cacheKey.length > 8192 || !(signal instanceof AbortSignal) || !source || typeof source !== "object" || (Object.getPrototypeOf(source) !== Object.prototype && Object.getPrototypeOf(source) !== null)) throw new TypeError("Image decode request is invalid.");
  const sourceDescriptors = Object.getOwnPropertyDescriptors(source);
  const read = (key: string) => { const descriptor = sourceDescriptors[key]; if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new TypeError("Image source fields must be data."); return descriptor.value; };
  const kind = read("kind");
  if (kind === "url") {
    if (Object.keys(sourceDescriptors).length !== 3) throw new TypeError("URL image source has an invalid shape.");
    const url = read("url"); const cors = read("cors");
    if (typeof url !== "string" || (cors !== "none" && cors !== "anonymous" && cors !== "use-credentials")) throw new TypeError("URL image source is invalid.");
    return Object.freeze({ cacheKey, source: Object.freeze({ kind: "url", url, cors }), signal });
  }
  if (kind === "bytes") {
    if (Object.keys(sourceDescriptors).length !== 3) throw new TypeError("Binary image source has an invalid shape.");
    const mimeType = read("mimeType"); const bytes = read("bytes");
    if (typeof mimeType !== "string" || !(bytes instanceof Uint8Array) || Object.getPrototypeOf(bytes) !== Uint8Array.prototype || !["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"].includes(mimeType)) throw new TypeError("Binary image source is invalid.");
    return Object.freeze({ cacheKey, source: Object.freeze({ kind: "bytes", mimeType: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml", bytes: intrinsicUint8ArraySlice.call(bytes) as Uint8Array }), signal });
  }
  throw new TypeError("Image source kind is unsupported.");
}

function inspectDecoded(value: unknown) {
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length) throw new TypeError("Decoded browser image must be a plain record.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = ["src", "intrinsicSize", "density", "byteLength", "corsClean", "revoke", ...(Object.prototype.hasOwnProperty.call(descriptors, "sourceOrientation") ? ["sourceOrientation"] : []), ...(Object.prototype.hasOwnProperty.call(descriptors, "sourceICCProfile") ? ["sourceICCProfile"] : [])];
  if (Object.keys(descriptors).length !== keys.length || keys.some((key) => !descriptors[key] || !Object.prototype.hasOwnProperty.call(descriptors[key]!, "value"))) throw new TypeError("Decoded browser image has an invalid shape.");
  const raw = Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value]));
  const sizeDescriptors = raw.intrinsicSize && typeof raw.intrinsicSize === "object" ? Object.getOwnPropertyDescriptors(raw.intrinsicSize) : {};
  if (!sizeDescriptors.width || !sizeDescriptors.height || !Object.prototype.hasOwnProperty.call(sizeDescriptors.width, "value") || !Object.prototype.hasOwnProperty.call(sizeDescriptors.height, "value")) throw new TypeError("Decoded browser image size is invalid.");
  const width = sizeDescriptors.width.value; const height = sizeDescriptors.height.value;
  if (typeof raw.src !== "string" || typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0 || width * height > 64 * 1024 * 1024 || typeof raw.density !== "number" || !Number.isFinite(raw.density) || raw.density < 0.125 || raw.density > 8 || !Number.isSafeInteger(raw.byteLength) || (raw.byteLength as number) < 0 || (raw.byteLength as number) > 8 * 1024 * 1024 || typeof raw.corsClean !== "boolean" || typeof raw.revoke !== "boolean") throw new TypeError("Decoded browser image metadata is invalid.");
  if ("sourceOrientation" in raw && (!Number.isSafeInteger(raw.sourceOrientation) || (raw.sourceOrientation as number) < 1 || (raw.sourceOrientation as number) > 8)) throw new TypeError("Decoded browser source orientation is invalid.");
  if ("sourceICCProfile" in raw) {
    const profile = raw.sourceICCProfile;
    // PNG iCCP is compressed: its bounded decoded profile may exceed the entire encoded file.
    if (!(profile instanceof Uint8Array) || Object.getPrototypeOf(profile) !== Uint8Array.prototype || profile.byteLength < 132 || profile.byteLength > 4 * 1024 * 1024) throw new TypeError("Decoded browser source ICC profile exceeds the bounded size.");
    const view = new DataView(profile.buffer, profile.byteOffset, profile.byteLength);
    if (view.getUint32(0) !== profile.byteLength || profile[36] !== 97 || profile[37] !== 99 || profile[38] !== 115 || profile[39] !== 112) throw new TypeError("Decoded browser source ICC header is invalid.");
  }
  return Object.freeze({ ...raw, intrinsicSize: Object.freeze({ width, height }), ...(raw.sourceICCProfile === undefined ? {} : { sourceICCProfile: intrinsicUint8ArraySlice.call(raw.sourceICCProfile) as Uint8Array }) }) as unknown as Awaited<ReturnType<BrowserImagePlatform["decode"]>>;
}

export class BrowserImageAdapter implements RuntimeImageAdapter {
  readonly #platform: BrowserImagePlatform;
  readonly #active = new Set<RuntimeDecodedImageLease>();
  #disposed = false;
  constructor(platform: BrowserImagePlatform) { this.#platform = platform; }

  async decode(request: Parameters<RuntimeImageAdapter["decode"]>[0]) {
    const input = inspectDecodeRequest(request);
    input.signal.throwIfAborted();
    if (this.#disposed) throw new DOMException("Image adapter disposed.", "AbortError");
    if (input.source.kind === "bytes" && input.source.mimeType !== "image/svg+xml") inspectImageBinaryMetadata(input.source.mimeType, input.source.bytes);
    const candidate = await this.#platform.decode(input.source, input.signal);
    let transferred = false;
    try {
      const decoded = inspectDecoded(candidate);
      input.signal.throwIfAborted();
      if (this.#disposed) throw new DOMException("Image adapter disposed.", "AbortError");
      let released = false;
      const lease: RuntimeDecodedImageLease = Object.freeze({
        src: decoded.src,
        intrinsicSize: Object.freeze({ ...decoded.intrinsicSize }),
        density: decoded.density,
        ...(decoded.sourceOrientation === undefined ? {} : { sourceOrientation: decoded.sourceOrientation }),
        ...(decoded.sourceICCProfile === undefined ? {} : { sourceICCProfile: intrinsicUint8ArraySlice.call(decoded.sourceICCProfile) as Uint8Array }),
        byteLength: decoded.byteLength,
        corsClean: decoded.corsClean,
        release: () => {
          if (released) return;
          released = true;
          this.#active.delete(lease);
          if (decoded.revoke) this.#platform.revokeObjectURL(decoded.src);
        },
      });
      this.#active.add(lease);
      transferred = true;
      return lease;
    } finally {
      if (!transferred && candidate && typeof candidate === "object") {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        if (descriptors.revoke?.value === true && typeof descriptors.src?.value === "string") this.#platform.revokeObjectURL(descriptors.src.value);
      }
    }
  }

  async readPixels(lease: RuntimeDecodedImageLease, signal: AbortSignal): Promise<GFXImage> {
    signal.throwIfAborted();
    if (this.#disposed || !this.#active.has(lease)) throw new DOMException("Image lease is inactive.", "AbortError");
    if (!lease.corsClean) throw new DOMException("Image pixels are not CORS-clean.", "SecurityError");
    if (!this.#platform.readPixels) throw new DOMException("Browser pixel access is unavailable.", "NotSupportedError");
    const pixels = await this.#platform.readPixels(lease.src, lease.intrinsicSize, signal);
    signal.throwIfAborted();
    if (this.#disposed || !this.#active.has(lease)) throw new DOMException("Image lease was released during pixel access.", "AbortError");
    if (!(pixels instanceof GFXImage) || pixels.width !== lease.intrinsicSize.width || pixels.height !== lease.intrinsicSize.height) throw new TypeError("Browser pixel dimensions do not match decoded lease.");
    return pixels;
  }

  async export(lease: RuntimeDecodedImageLease, format: "image/png" | "image/webp", signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.#disposed || !this.#active.has(lease)) return Promise.reject(new DOMException("Image lease is inactive.", "AbortError"));
    if (!lease.corsClean) return Promise.reject(new DOMException("Image pixels are not CORS-clean.", "SecurityError"));
    const bytes = await this.#platform.export(lease.src, lease.intrinsicSize, format, signal);
    signal.throwIfAborted();
    if (this.#disposed || !this.#active.has(lease)) throw new DOMException("Image lease was released during export.", "AbortError");
    return bytes;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const lease of [...this.#active]) lease.release();
  }
}

export class BrowserImageAdapterFactory implements RuntimeImageAdapterFactory {
  constructor(readonly platform: BrowserImagePlatform) {}
  acquire(_runtimeId: SynCloudOSRuntimeId, signal: AbortSignal) {
    signal.throwIfAborted();
    const adapter = new BrowserImageAdapter(this.platform);
    let released = false;
    return Object.freeze({ adapter, release() { if (!released) { released = true; adapter.dispose(); } } });
  }
}
