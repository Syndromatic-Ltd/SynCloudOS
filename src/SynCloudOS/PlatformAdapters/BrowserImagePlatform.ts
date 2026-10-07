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
import { GFXColourProfile } from "../../FX/GraphicsFX/GFXColourProfile";
import type { BrowserImagePlatform } from "./browserImageAdapterTypes";
import { inspectImageBinaryMetadataForDecode } from "./imageBinaryMetadata";
function raceAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Image operation aborted.", "AbortError"));
    return new Promise((resolve, reject) => {
        let settled = false;
        const abort = () => {
            if (settled) return;
            settled = true;
            reject(signal.reason ?? new DOMException("Image operation aborted.", "AbortError"));
        };
        signal.addEventListener("abort", abort, { once: true });
        operation.then(value => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", abort);
            resolve(value);
        }, error => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", abort);
            reject(error);
        });
    });
}
export function createBrowserImagePlatform(browserDocument: Document, browserWindow: Window): BrowserImagePlatform {
    const decodedImages = new Map<string, { image: HTMLImageElement; blob: Blob; mimeType: string; profile: Uint8Array | null }>();
    type ProfileDecodeMode = Readonly<{ rawBitmap: boolean; rawDefault: boolean }>;
    const profileDecodeModes = new Map<string, Promise<ProfileDecodeMode>>();
    const profileCalibrationFixtures: Readonly<Record<string, string>> = {
        "image/png": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAnWlDQ1BMaW5lYXIAAHicY2BgtGBgYGBgYWBgyM0rKQpyd1KIiIxSYEACicnFBQx4wbdrDIwg+rIufnVYAVtRRGQUAwPDGQYGBpF0CPsBiJ0EYX8BsYtCgpwZGBg5GBgYBNIhbAkQOwnC1gCxEe7OX8zAYPGNgYF5IkIsaQoDw/ZWBgaJOwgxlYUMDPytDAzbriSXFpVB3cMI8gohPgBrAiXsjHbs9gAAAAlwSFlzAAAD6AAAA+gBtXtSawAAAA1JREFUeJxjaGho+A8ABYQCgIzNZiYAAAAASUVORK5CYII=",
        "image/jpeg": "/9j/4gFISUNDX1BST0ZJTEUAAQEAAAE4AAAAAAQAAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZyWFlaAAAAzAAAABRnWFlaAAAA4AAAABRiWFlaAAAA9AAAABRyVFJDAAABCAAAABBnVFJDAAABGAAAABBiVFJDAAABKAAAABBYWVogAAAAAAAAb6MAADj2AAADkVhZWiAAAAAAAABilAAAt4UAABjcWFlaIAAAAAAAACShAAAPhQAAttRjdXJ2AAAAAAAAAAEBAAAAY3VydgAAAAAAAAABAQAAAGN1cnYAAAAAAAAAAQEAAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AA//Z",
        "image/webp": "UklGRnABAABXRUJQVlA4WAoAAAAgAAAAAAAAAAAASUNDUDgBAAAAAAE4AAAAAAQAAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZyWFlaAAAAzAAAABRnWFlaAAAA4AAAABRiWFlaAAAA9AAAABRyVFJDAAABCAAAABBnVFJDAAABGAAAABBiVFJDAAABKAAAABBYWVogAAAAAAAAb6MAADj2AAADkVhZWiAAAAAAAABilAAAt4UAABjcWFlaIAAAAAAAACShAAAPhQAAttRjdXJ2AAAAAAAAAAEBAAAAY3VydgAAAAAAAAABAQAAAGN1cnYAAAAAAAAAAQEAAABWUDhMEQAAAC8AAAAAB1DAAhaw/4GI6H8AAA==",
        "image/gif": "R0lGODlhAQABAIEAAICAgAAAAAAAAAAAACH/C0lDQ1JHQkcxMDEy/wAAATgAAAAABAAAAG1udHJSR0IgWFlaIAAAAAAAAAAAAAAAAGFjc3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD21gABAAAAANMtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABnJYWVoAAADMAAAAFGdYWVoAAADgAAAAFGJYWVoAAAD0AAAAFHJUUkMAAAEIAAAAEGdUUkMAAAEYAAAAEGJUUkMAAAEoAAAAEFhZWiAAAAAAAABvowAAOPYAAAORWFlaIAAAAAAAAGKUAAC3hQAAGNxYWVogAAAAAAAAJDmhAAAPhQAAttRjdXJ2AAAAAAAAAAEBAAAAY3VydgAAAAAAAAABAQAAAGN1cnYAAAAAAAAAAQEAAAAALAAAAAABAAEAAAgEAAEEBAA7",
    };
    const waitForImage = (src: string, cors: "none" | "anonymous" | "use-credentials", signal: AbortSignal) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = browserDocument.createElement("img");
        if (cors !== "none")
            image.crossOrigin = cors;
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled)
                return;
            settled = true;
            signal.removeEventListener("abort", abort);
            image.onload = null;
            image.onerror = null;
            callback();
        };
        const abort = () => finish(() => reject(signal.reason ?? new DOMException("Image decode aborted.", "AbortError")));
        image.onload = () => finish(() => resolve(image));
        image.onerror = () => finish(() => reject(new Error("Image decode failed.")));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted)
            abort();
        else
            image.src = src;
    });
    const probeProfileDecode = async (mimeType: string): Promise<ProfileDecodeMode> => {
        const controller = new AbortController();
        const deadline = browserWindow.setTimeout(() => controller.abort(new DOMException("Browser ICC decode calibration timed out.", "NotSupportedError")), 10_000);
        try {
            // Each controlled linear-ICC fixture stores channel 128. Correct sRGB
            // is 188; no-conversion and default decode vary by engine and codec.
            const fixture = Uint8Array.from(atob(profileCalibrationFixtures[mimeType]!), character => character.charCodeAt(0));
            const blob = new Blob([fixture], { type: mimeType });
            const sample = (source: CanvasImageSource): number => {
                const canvas = browserDocument.createElement("canvas");
                canvas.width = canvas.height = 1;
                try {
                    const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
                    if (!context) return NaN;
                    context.drawImage(source, 0, 0);
                    return context.getImageData(0, 0, 1, 1).data[0]!;
                } finally { canvas.width = canvas.height = 0; }
            };
            const classify = (value: number): boolean => {
                if (value >= 127 && value <= 129) return true;
                if (value >= 184 && value <= 192) return false;
                throw new DOMException("Browser ICC decode calibration is inconclusive.", "NotSupportedError");
            };
            let rawBitmap = false;
            try {
                let acceptedBitmap = false;
                const request = browserWindow.createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
                request.then(bitmap => { if (controller.signal.aborted && !acceptedBitmap) bitmap.close(); }, () => {});
                const bitmap = await raceAbort(request, controller.signal);
                acceptedBitmap = true;
                try { rawBitmap = classify(sample(bitmap)); }
                finally { bitmap.close(); }
            } catch {
                controller.signal.throwIfAborted();
                // A browser without this bitmap option can still use its default decoder.
            }
            const url = URL.createObjectURL(blob);
            try {
                const image = await waitForImage(url, "none", controller.signal);
                return { rawBitmap, rawDefault: classify(sample(image)) };
            } finally { URL.revokeObjectURL(url); }
        } finally { browserWindow.clearTimeout(deadline); }
    };
    const platform: BrowserImagePlatform = {
        async decode(source, signal) {
            signal.throwIfAborted();
            const binary = source.kind === "bytes";
            let bytes = binary ? source.bytes.slice() : null;
            let mimeType = binary ? source.mimeType : "";
            if (!binary) {
                const target = new URL(source.url, browserWindow.location.href);
                if (source.cors === "none" && target.origin !== browserWindow.location.origin)
                    throw new DOMException("Unbounded cross-origin image loading is denied.", "SecurityError");
                const response = await browserWindow.fetch(target, {
                    signal,
                    mode: "cors",
                    credentials: source.cors === "use-credentials" ? "include" : "same-origin",
                    redirect: "follow",
                });
                if (!response.ok)
                    throw new Error(`Image request failed with status ${response.status}.`);
                const declaredLength = Number(response.headers.get("content-length") ?? "0");
                if (Number.isFinite(declaredLength) && declaredLength > 8 * 1024 * 1024)
                    throw new RangeError("Image exceeds the byte limit.");
                const blob = await response.blob();
                if (blob.size === 0 || blob.size > 8 * 1024 * 1024)
                    throw new RangeError("Image byte length is invalid.");
                if (!new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]).has(blob.type))
                    throw new TypeError("Image response MIME type is unsupported.");
                bytes = new Uint8Array(await blob.arrayBuffer());
                mimeType = blob.type;
            }
            // SVG has already been sanitised and validated by ImageService. The
            // binary-header inspector deliberately covers raster formats only.
            const metadata = mimeType === "image/svg+xml" ? null : await inspectImageBinaryMetadataForDecode(mimeType, bytes!, signal);
            const blob = new Blob([bytes!.buffer as ArrayBuffer], { type: mimeType });
            const src = URL.createObjectURL(blob);
            const cors = "none";
            try {
                const image = await waitForImage(src, cors, signal);
                signal.throwIfAborted();
                // Every supported source format has its own raw/default
                // calibration; unsupported profiles remain metadata only.
                decodedImages.set(src, { image, blob, mimeType, profile: profileCalibrationFixtures[mimeType] ? metadata?.sourceICCProfile?.slice() ?? null : null });
                return Object.freeze({
                    src,
                    intrinsicSize: Object.freeze({ width: image.naturalWidth, height: image.naturalHeight }),
                    density: 1,
                    ...(metadata?.sourceOrientation === undefined ? {} : { sourceOrientation: metadata.sourceOrientation }),
                    ...(metadata?.sourceICCProfile === undefined ? {} : { sourceICCProfile: metadata.sourceICCProfile.slice() }),
                    byteLength: bytes!.byteLength,
                    corsClean: true,
                    revoke: true,
                });
            }
            catch (error) {
                URL.revokeObjectURL(src);
                throw error;
            }
        },
        async readPixels(src, size, signal) {
            signal.throwIfAborted();
            const decoded = decodedImages.get(src);
            if (!decoded)
                throw new DOMException("Decoded image lease is inactive.", "AbortError");
            if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width * size.height > 16 * 1024 * 1024)
                throw new RangeError("Pixel read exceeds 64 MiB.");
            const canvas = browserDocument.createElement("canvas");
            canvas.width = size.width;
            canvas.height = size.height;
            let bitmap: ImageBitmap | null = null;
            try {
                const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
                if (!context)
                    throw new DOMException("Canvas pixel access unavailable.", "NotSupportedError");
                let profile: GFXColourProfile | null = null;
                if (decoded.profile) {
                    try { profile = new GFXColourProfile(decoded.profile); }
                    catch { throw new DOMException("Source ICC profile is not supported for numeric pixels.", "NotSupportedError"); }
                }
                let mode: ProfileDecodeMode | null = null;
                if (profile) {
                    let receipt = profileDecodeModes.get(decoded.mimeType);
                    if (!receipt) {
                        receipt = probeProfileDecode(decoded.mimeType).catch(() => {
                            profileDecodeModes.delete(decoded.mimeType);
                            throw new DOMException("Browser ICC decode calibration is unavailable.", "NotSupportedError");
                        });
                        profileDecodeModes.set(decoded.mimeType, receipt);
                    }
                    mode = await raceAbort(receipt, signal);
                }
                signal.throwIfAborted();
                if (decodedImages.get(src) !== decoded)
                    throw new DOMException("Decoded image lease was released.", "AbortError");
                // Keep GIF on the decoded image element instead of forcing an
                // ImageBitmap snapshot; animated frame advancement is not an
                // ImageFX resource contract and varies by browser environment.
                if (mode?.rawBitmap && decoded.mimeType !== "image/gif") {
                    try { bitmap = await browserWindow.createImageBitmap(decoded.blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" }); }
                    catch { /* This source can fall back to the measured default decoder. */ }
                }
                const source = bitmap && bitmap.width === size.width && bitmap.height === size.height ? bitmap : decoded.image;
                context.drawImage(source, 0, 0);
                const pixels = context.getImageData(0, 0, size.width, size.height);
                signal.throwIfAborted();
                if (decodedImages.get(src) !== decoded)
                    throw new DOMException("Decoded image lease was released.", "AbortError");
                if (profile && ((source === bitmap && mode?.rawBitmap) || (source === decoded.image && mode?.rawDefault))) {
                    const output = new Uint8Array(pixels.data.length);
                    const rowsPerChunk = Math.max(1, Math.floor(4 * 1024 * 1024 / size.width));
                    for (let y = 0; y < size.height; y += rowsPerChunk) {
                        signal.throwIfAborted();
                        const rows = Math.min(rowsPerChunk, size.height - y);
                        const start = y * size.width * 4, end = (y + rows) * size.width * 4;
                        const converted = profile.decodeImage({ width: size.width, height: rows, alpha: "straight", data: new Uint8Array(pixels.data.subarray(start, end)) });
                        output.set(converted.copyData(), start);
                    }
                    if (decodedImages.get(src) !== decoded)
                        throw new DOMException("Decoded image lease was released.", "AbortError");
                    return new GFXImage({ width: size.width, height: size.height, alpha: "straight", colourSpace: "srgb", data: output });
                }
                return new GFXImage({ width: size.width, height: size.height, alpha: "straight", colourSpace: "srgb", data: pixels.data });
            }
            finally {
                bitmap?.close();
                canvas.width = 0;
                canvas.height = 0;
            }
        },
        async export(src, size, format, signal) {
            signal.throwIfAborted();
            const image = decodedImages.get(src);
            if (!image)
                throw new DOMException("Decoded image lease is inactive.", "AbortError");
            const canvas = browserDocument.createElement("canvas");
            canvas.width = Math.ceil(size.width);
            canvas.height = Math.ceil(size.height);
            let sourceCanvas: HTMLCanvasElement | null = null;
            try {
                const context = canvas.getContext("2d", { colorSpace: "srgb" });
                if (!context)
                    throw new Error("Canvas image export is unavailable.");
                let source: CanvasImageSource = image.image;
                if (image.profile) {
                    const sourceSize = { width: image.image.naturalWidth, height: image.image.naturalHeight };
                    const corrected = await platform.readPixels!(src, sourceSize, signal);
                    sourceCanvas = browserDocument.createElement("canvas");
                    sourceCanvas.width = sourceSize.width;
                    sourceCanvas.height = sourceSize.height;
                    const sourceContext = sourceCanvas.getContext("2d", { colorSpace: "srgb" });
                    if (!sourceContext)
                        throw new DOMException("Canvas pixel export is unavailable.", "NotSupportedError");
                    const data = sourceContext.createImageData(sourceSize.width, sourceSize.height);
                    data.data.set(corrected.copyData());
                    sourceContext.putImageData(data, 0, 0);
                    source = sourceCanvas;
                }
                signal.throwIfAborted();
                if (decodedImages.get(src) !== image)
                    throw new DOMException("Decoded image lease was released.", "AbortError");
                context.drawImage(source, 0, 0, canvas.width, canvas.height);
                const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image export failed.")), format));
                signal.throwIfAborted();
                if (decodedImages.get(src) !== image)
                    throw new DOMException("Decoded image lease was released.", "AbortError");
                if (blob.type !== format)
                    throw new DOMException("Image encoder did not produce the requested format.", "NotSupportedError");
                if (blob.size > 8 * 1024 * 1024)
                    throw new RangeError("Image export exceeds the byte limit.");
                const bytes = new Uint8Array(await blob.arrayBuffer());
                signal.throwIfAborted();
                if (decodedImages.get(src) !== image)
                    throw new DOMException("Decoded image lease was released.", "AbortError");
                return bytes;
            } finally {
                canvas.width = canvas.height = 0;
                if (sourceCanvas) sourceCanvas.width = sourceCanvas.height = 0;
            }
        },
        revokeObjectURL: (url) => {
            decodedImages.delete(url);
            URL.revokeObjectURL(url);
        },
    };
    return platform;
}
