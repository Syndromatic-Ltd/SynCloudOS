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

import { describe, it, expect, vi } from "vitest";
import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import { IFXImageResource, IFXContext } from "../../../src/FX/ImageFX/public";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare, mountTestSynWareRuntime } from "../helpers";
import { createSynWareContextValue } from "../../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { BrowserImageAdapter, BrowserImageAdapterFactory } from "../../../src/SynCloudOS/PlatformAdapters/BrowserImageAdapter";
import { createBrowserImagePlatform } from "../../../src/SynCloudOS/PlatformAdapters/BrowserImagePlatform";
const pixels = () => new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 255, 0, 255]) });
const pngWithICC = (profile: Uint8Array) => {
    const source = pixels().toPNG();
    const payload = new Uint8Array([115, 82, 71, 66, 0, 0, ...deflateSync(profile)]);
    const chunk = new Uint8Array(payload.length + 12);
    new DataView(chunk.buffer).setUint32(0, payload.length);
    chunk.set(new TextEncoder().encode("iCCP"), 4);
    chunk.set(payload, 8);
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, chunk.length - 4)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    new DataView(chunk.buffer).setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
    return new Uint8Array([...source.subarray(0, 33), ...chunk, ...source.subarray(33)]);
};
const request = { subject: { appId: "app:images", capability: "image.decode" as const }, source: { kind: "url" as const, url: "https://example.test/image.png", cors: "anonymous" as const }, accessibleLabel: "Green", capInsets: { top: 0, right: 0, bottom: 0, left: 0 } };
function setup(readPixels = vi.fn(async () => pixels()), corsClean = true, allowExport = true, exportImage = vi.fn(async () => new Uint8Array([1]))) {
    const environment = createTestRuntimeEnvironment();
    const decode = vi.fn(async () => Object.freeze({ src: "blob:owned", intrinsicSize: { width: 1, height: 1 }, density: 2, byteLength: 4, corsClean, release: vi.fn() }));
    const adapter = { decode, readPixels, export: exportImage, dispose: vi.fn() };
    Object.defineProperty(environment, "images", { value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } });
    const authorise = vi.fn(async (input: {
        operation: string;
    }) => input.operation === "decode" || allowExport);
    const runtime = createTestRuntime({ id: "runtime:ifx-test", environment, imageAuthorisation: { authorise } });
    return { runtime, decode, readPixels, authorise, exportImage };
}
describe("ImageFX existing decoded lease integration", () => {
    it("passes the exact browser-issued lease through runtime pixel authentication", async () => {
        const profile = new Uint8Array(132);
        new DataView(profile.buffer).setUint32(0, profile.length);
        profile.set([97, 99, 115, 112], 36);
        const browser = {
            decode: vi.fn(async () => Object.freeze({ src: "blob:runtime-owned", intrinsicSize: Object.freeze({ width: 1, height: 1 }), density: 1, byteLength: 100, corsClean: true, revoke: true, sourceOrientation: 6, sourceICCProfile: profile })),
            readPixels: vi.fn(async () => pixels()),
            export: vi.fn(async () => new Uint8Array([1])),
            revokeObjectURL: vi.fn(),
        };
        const environment = createTestRuntimeEnvironment();
        Object.defineProperty(environment, "images", { value: new BrowserImageAdapterFactory(browser) });
        const runtime = createTestRuntime({ id: "runtime:browser-image-identity", environment, imageAuthorisation: { authorise: async () => true } });
        try {
            const resource = runtime.images.load(request);
            await resource.ready;
            expect(new IFXImageResource({ resource, readPixels: signal => runtime.images.readPixels(resource, signal), export: (format, signal) => runtime.images.export(resource, format, signal) }).sourceOrientation).toBe(6);
            const publicProfile = new IFXImageResource({ resource, readPixels: signal => runtime.images.readPixels(resource, signal), export: (format, signal) => runtime.images.export(resource, format, signal) }).sourceICCProfile;
            expect(publicProfile).toEqual(profile);
            publicProfile![0] = 255;
            expect(resource.sourceICCProfile).toEqual(profile);
            expect((await runtime.images.readPixels(resource)).pixel(0, 0).g).toBe(1);
            await expect(runtime.images.export(resource, "image/png")).resolves.toEqual(new Uint8Array([1]));
            expect(browser.readPixels).toHaveBeenCalledWith("blob:runtime-owned", { width: 1, height: 1 }, expect.any(AbortSignal));
            expect(browser.export).toHaveBeenCalledWith("blob:runtime-owned", { width: 1, height: 1 }, "image/png", expect.any(AbortSignal));
            resource.release();
            expect(resource.sourceOrientation).toBeNull();
            expect(resource.sourceICCProfile).toBeNull();
        } finally {
            await runtime.dispose("test");
        }
        expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:runtime-owned");
    });
    it("keeps a detached React store subscription bound and supports unsubscribe", async () => {
        const { runtime } = setup();
        try {
            const handle = runtime.images.load(request);
            const resource = new IFXImageResource({ resource: handle, readPixels: signal => runtime.images.readPixels(handle, signal), export: (format, signal) => runtime.images.export(handle, format, signal) });
            await resource.ready;
            const subscribe = resource.subscribe;
            const listener = vi.fn();
            const removedListener = vi.fn();
            const unsubscribe = subscribe(listener);
            subscribe(removedListener)();
            resource.release();
            expect(listener).toHaveBeenCalled();
            expect(removedListener).not.toHaveBeenCalled();
            unsubscribe();
        } finally { await runtime.dispose("test"); }
    });
    it("projects the canonical pixel resource through the mounted SDK and revokes it with its mount", async () => {
        const { runtime, authorise, decode } = setup();
        const profile = new Uint8Array(132);
        new DataView(profile.buffer).setUint32(0, 132);
        profile.set([97, 99, 115, 112], 36);
        decode.mockResolvedValueOnce(Object.freeze({ src: "blob:mounted-metadata", intrinsicSize: { width: 1, height: 1 }, density: 1, byteLength: 132, corsClean: true, sourceOrientation: 6, sourceICCProfile: profile, release: vi.fn() }));
        const app = registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.image-consumer", version: "1.0.0", displayName: "Images" });
        const mount = mountTestSynWareRuntime(runtime, app.bundleIdentifier);
        try {
            const client = createSynWareContextValue(mount.runtime);
            const resource = client.images.load({ source: request.source, accessibleLabel: "Green" });
            expect(resource).toBeInstanceOf(IFXImageResource);
            await resource.ready;
            expect(resource.sourceOrientation).toBe(6);
            expect(resource.sourceICCProfile).toEqual(profile);
            expect((await new IFXContext().render(await resource.image())).image.pixel(0, 0).g).toBe(1);
            expect(authorise.mock.calls.map(call => call[0].operation)).toEqual(["decode", "export"]);
            mount.dispose();
            expect(resource.sourceOrientation).toBeNull();
            expect(resource.sourceICCProfile).toBeNull();
            await expect(resource.image()).rejects.toThrow();
        } finally { mount.dispose(); await runtime.dispose("test"); }
    });
    it("uses the export policy on the existing decode and preserves projected metadata", async () => {
        const { runtime, decode, authorise } = setup();
        try {
            const handle = runtime.images.load(request);
            const resource = new IFXImageResource({ resource: handle, readPixels: signal => runtime.images.readPixels(handle, signal), export: (format, signal) => runtime.images.export(handle, format, signal) });
            const image = await resource.image();
            expect((await new IFXContext().render(image)).image.pixel(0, 0).g).toBe(1);
            expect(resource.density).toBe(2);
            expect(resource.accessibleLabel).toBe("Green");
            expect(resource.capInsets).toEqual(request.capInsets);
            expect(decode).toHaveBeenCalledTimes(1);
            expect(authorise.mock.calls.map(call => call[0].operation)).toEqual(["decode", "export"]);
            resource.release();
            await expect(resource.image()).rejects.toMatchObject({ name: "AbortError" });
        }
        finally {
            await runtime.dispose("test");
        }
    });
    it("exports a mounted image through the canonical policy and revokes export with its mount", async () => {
        const { runtime, authorise } = setup();
        const app = registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.image-export-consumer", version: "1.0.0", displayName: "Image export" });
        const mount = mountTestSynWareRuntime(runtime, app.bundleIdentifier);
        try {
            const resource = createSynWareContextValue(mount.runtime).images.load({ source: request.source, accessibleLabel: "Green" });
            await resource.ready;
            await expect(resource.export("image/webp")).resolves.toEqual(new Uint8Array([1]));
            expect(authorise.mock.calls.map(call => call[0].operation)).toEqual(["decode", "export"]);
            mount.dispose();
            await expect(resource.export("image/webp")).rejects.toMatchObject({ name: "AbortError" });
        } finally { mount.dispose(); await runtime.dispose("test"); }
    });
    it("denies mounted export before calling the encoder", async () => {
        const encoder = vi.fn(async () => new Uint8Array([1]));
        const { runtime } = setup(undefined, true, false, encoder);
        const app = registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.image-export-denied", version: "1.0.0", displayName: "Image export denied" });
        const mount = mountTestSynWareRuntime(runtime, app.bundleIdentifier);
        try {
            const resource = createSynWareContextValue(mount.runtime).images.load({ source: request.source, accessibleLabel: "Green" });
            await resource.ready;
            await expect(resource.export("image/png")).rejects.toMatchObject({ name: "SecurityError" });
            expect(encoder).not.toHaveBeenCalled();
        } finally { mount.dispose(); await runtime.dispose("test"); }
    });
    it("rejects late encoder completion after mounted export is revoked", async () => {
        let finish!: (bytes: Uint8Array) => void;
        const encoder = vi.fn(() => new Promise<Uint8Array>(resolve => { finish = resolve; }));
        const { runtime } = setup(undefined, true, true, encoder);
        const app = registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.image-export-late", version: "1.0.0", displayName: "Image export late" });
        const mount = mountTestSynWareRuntime(runtime, app.bundleIdentifier);
        try {
            const resource = createSynWareContextValue(mount.runtime).images.load({ source: request.source, accessibleLabel: "Green" });
            await resource.ready;
            const pending = resource.export("image/png");
            await vi.waitFor(() => expect(encoder).toHaveBeenCalledOnce());
            mount.dispose();
            finish(new Uint8Array([1]));
            await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        } finally { mount.dispose(); await runtime.dispose("test"); }
    });
    it("rejects a forged adapter profile that exceeds the decoded-profile cap", async () => {
        const profile = new Uint8Array(4 * 1024 * 1024 + 1);
        new DataView(profile.buffer).setUint32(0, profile.length);
        profile.set([97, 99, 115, 112], 36);
        const release = vi.fn();
        const { runtime, decode } = setup();
        decode.mockResolvedValueOnce(Object.freeze({ src: "blob:forged-profile", intrinsicSize: { width: 1, height: 1 }, density: 1, byteLength: 4, corsClean: true, sourceICCProfile: profile, release }));
        try {
            const resource = runtime.images.load(request);
            await expect(resource.ready).rejects.toThrow(/ICC|profile|budget/i);
            expect(release).toHaveBeenCalledTimes(1);
        } finally { await runtime.dispose("test"); }
    });
    it("denies CORS-unclean and denied-export pixel reads before adapter access", async () => {
        for (const config of [[false, true], [true, false]]) {
            const { runtime, readPixels } = setup(undefined, config[0], config[1]);
            try {
                const handle = runtime.images.load(request);
                await handle.ready;
                await expect(runtime.images.readPixels(handle)).rejects.toMatchObject({ name: "SecurityError" });
                expect(readPixels).not.toHaveBeenCalled();
            }
            finally {
                await runtime.dispose("test");
            }
        }
    });
    it("rejects a released handle after an uncooperative asynchronous pixel read", async () => {
        let resolve!: (value: GFXImage) => void;
        let entered!: () => void;
        const started = new Promise<void>(r => entered = r);
        const read = vi.fn(() => {
            entered();
            return new Promise<GFXImage>(r => resolve = r);
        });
        const { runtime } = setup(read);
        try {
            const handle = runtime.images.load(request);
            await handle.ready;
            const pending = runtime.images.readPixels(handle);
            await started;
            handle.release();
            resolve(pixels());
            await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        }
        finally {
            await runtime.dispose("test");
        }
    });
    it("rejects a released handle after a shared uncooperative export completes", async () => {
        let resolve!: (value: Uint8Array) => void;
        let entered!: () => void;
        const started = new Promise<void>(r => entered = r);
        const exportImage = vi.fn(() => {
            entered();
            return new Promise<Uint8Array>(r => resolve = r);
        });
        const { runtime } = setup(undefined, true, true, exportImage);
        try {
            const first = runtime.images.load(request);
            const second = runtime.images.load(request);
            await Promise.all([first.ready, second.ready]);
            const pending = runtime.images.export(first, "image/png");
            await started;
            first.release();
            resolve(new Uint8Array([1]));
            await expect(pending).rejects.toMatchObject({ name: "AbortError" });
            expect(second.state).toBe("ready");
            expect(exportImage).toHaveBeenCalledTimes(1);
            second.release();
        }
        finally {
            await runtime.dispose("test");
        }
    });
    it("checks adapter lease liveness again after pixel access", async () => {
        let resolve!: (value: GFXImage) => void;
        const platform = { decode: async () => ({ src: "blob:owned", intrinsicSize: { width: 1, height: 1 }, density: 1, byteLength: 4, corsClean: true, revoke: true }), readPixels: () => new Promise<GFXImage>(r => resolve = r), export: async () => new Uint8Array(), revokeObjectURL: vi.fn() };
        const adapter = new BrowserImageAdapter(platform), signal = new AbortController().signal;
        const lease = await adapter.decode({ cacheKey: "owned", source: { kind: "bytes", mimeType: "image/png", bytes: pixels().toPNG() }, signal });
        const pending = adapter.readPixels(lease, signal);
        lease.release();
        resolve(pixels());
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(platform.revokeObjectURL).toHaveBeenCalledTimes(1);
    });
    it("reads and exports the retained browser image without a second decode", async () => {
        let imageCount = 0, drawCount = 0;
        const document = { createElement: (tag: string) => {
                if (tag === "img") {
                    imageCount++;
                    const img = { naturalWidth: 1, naturalHeight: 1, onload: null as null | (() => void), onerror: null, set src(_value: string) {
                            queueMicrotask(() => img.onload?.());
                        } };
                    return img;
                }
                return { width: 0, height: 0, getContext: () => ({ drawImage: () => drawCount++, getImageData: () => ({ data: new Uint8ClampedArray([0, 255, 0, 255]) }) }), toBlob: (callback: (blob: Blob) => void) => callback(new Blob([new Uint8Array([1])], { type: "image/png" })) };
            } };
        const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:retained"), revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
        });
        try {
            const platform = createBrowserImagePlatform(document as unknown as Document, {} as Window), signal = new AbortController().signal;
            const lease = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: pixels().toPNG() }, signal);
            expect((await platform.readPixels!(lease.src, lease.intrinsicSize, signal)).pixel(0, 0).g).toBe(1);
            await platform.export(lease.src, lease.intrinsicSize, "image/png", signal);
            expect(imageCount).toBe(1);
            expect(drawCount).toBe(2);
            platform.revokeObjectURL(lease.src);
            await expect(platform.readPixels!(lease.src, lease.intrinsicSize, signal)).rejects.toMatchObject({ name: "AbortError" });
        }
        finally {
            create.mockRestore();
            revoke.mockRestore();
        }
    });
    it("rejects a browser encoder that silently substitutes PNG for requested WebP", async () => {
        const document = { createElement: (tag: string) => {
            if (tag === "img") {
                const image = { naturalWidth: 1, naturalHeight: 1, onload: null as null | (() => void), onerror: null, set src(_value: string) {
                    queueMicrotask(() => image.onload?.());
                } };
                return image;
            }
            return { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }), toBlob: (callback: (blob: Blob) => void) => callback(new Blob([pixels().toPNG()], { type: "image/png" })) };
        } };
        const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:format-fallback");
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        try {
            const platform = createBrowserImagePlatform(document as unknown as Document, {} as Window);
            const signal = new AbortController().signal;
            const lease = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: pixels().toPNG() }, signal);
            await expect(platform.export(lease.src, lease.intrinsicSize, "image/webp", signal)).rejects.toMatchObject({ name: "NotSupportedError" });
            platform.revokeObjectURL(lease.src);
        } finally {
            create.mockRestore();
            revoke.mockRestore();
        }
    });
    it("retains unsupported ICC metadata but refuses an unverified sRGB pixel lease", async () => {
        const profile = new Uint8Array(132);
        new DataView(profile.buffer).setUint32(0, profile.length);
        profile.set([97, 99, 115, 112], 36);
        const document = { createElement: (tag: string) => {
            if (tag === "img") {
                const image = { naturalWidth: 1, naturalHeight: 1, onload: null as null | (() => void), onerror: null, set src(_value: string) {
                    queueMicrotask(() => image.onload?.());
                } };
                return image;
            }
            return { width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([96, 96, 96, 255]) }) }) };
        } };
        const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:unsupported-icc");
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        try {
            const platform = createBrowserImagePlatform(document as unknown as Document, {} as Window);
            const signal = new AbortController().signal;
            const decoded = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: pngWithICC(profile) }, signal);
            expect(decoded.sourceICCProfile).toEqual(profile);
            await expect(platform.readPixels!(decoded.src, decoded.intrinsicSize, signal)).rejects.toMatchObject({ name: "NotSupportedError" });
            await expect(platform.export(decoded.src, decoded.intrinsicSize, "image/png", signal)).rejects.toMatchObject({ name: "NotSupportedError" });
            platform.revokeObjectURL(decoded.src);
        } finally {
            create.mockRestore();
            revoke.mockRestore();
        }
    });
    it("rejects numeric pixels when browser ICC calibration cannot identify raw or converted channels", async () => {
        const webp = Buffer.from(JSON.parse(readFileSync(new URL("../../fixtures/linear-icc-formats.json", import.meta.url), "utf8")).webp, "base64");
        const offset = webp.indexOf(Buffer.from("ICCP"));
        expect(offset).toBeGreaterThan(0);
        const length = webp.readUInt32LE(offset + 4);
        const profile = new Uint8Array(webp.subarray(offset + 8, offset + 8 + length));
        expect(profile.byteLength).toBe(312);
        const document = { createElement: (tag: string) => {
            if (tag === "img") {
                const image = { naturalWidth: 1, naturalHeight: 1, onload: null as null | (() => void), onerror: null, set src(_value: string) {
                    queueMicrotask(() => image.onload?.());
                } };
                return image;
            }
            return { width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([96, 96, 96, 255]) }) }) };
        } };
        const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:inconclusive-icc");
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        try {
            const browser = { createImageBitmap: vi.fn().mockRejectedValue(new Error("Bitmap calibration unavailable")), setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
            const platform = createBrowserImagePlatform(document as unknown as Document, browser as unknown as Window);
            const signal = new AbortController().signal;
            const decoded = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: pngWithICC(profile) }, signal);
            expect(decoded.sourceICCProfile).toEqual(profile);
            await expect(platform.readPixels!(decoded.src, decoded.intrinsicSize, signal)).rejects.toMatchObject({ name: "NotSupportedError" });
            await expect(platform.export(decoded.src, decoded.intrinsicSize, "image/png", signal)).rejects.toMatchObject({ name: "NotSupportedError" });
            platform.revokeObjectURL(decoded.src);
        } finally {
            create.mockRestore();
            revoke.mockRestore();
        }
    });
    it("settles an aborted pixel read while the shared browser ICC probe is still waiting", async () => {
        const webp = Buffer.from(JSON.parse(readFileSync(new URL("../../fixtures/linear-icc-formats.json", import.meta.url), "utf8")).webp, "base64");
        const offset = webp.indexOf(Buffer.from("ICCP"));
        const length = webp.readUInt32LE(offset + 4);
        const profile = new Uint8Array(webp.subarray(offset + 8, offset + 8 + length));
        let releaseCalibration: (() => void) | null = null;
        const document = { createElement: (tag: string) => {
            if (tag === "img") {
                const image = { naturalWidth: 1, naturalHeight: 1, onload: null as null | (() => void), onerror: null, set src(value: string) {
                    if (value === "blob:calibration") releaseCalibration = () => image.onload?.();
                    else queueMicrotask(() => image.onload?.());
                } };
                return image;
            }
            return { width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([128, 128, 128, 255]) }) }) };
        } };
        const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:source").mockReturnValue("blob:calibration");
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        let outcome: Promise<string> | null = null;
        try {
            const browser = { createImageBitmap: vi.fn().mockRejectedValue(new Error("Bitmap calibration unavailable")), setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
            const platform = createBrowserImagePlatform(document as unknown as Document, browser as unknown as Window);
            const decoded = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: pngWithICC(profile) }, new AbortController().signal);
            const controller = new AbortController();
            outcome = platform.readPixels!(decoded.src, decoded.intrinsicSize, controller.signal).then(() => "resolved", error => (error as Error).name);
            await vi.waitFor(() => expect(releaseCalibration).not.toBeNull());
            controller.abort(new DOMException("Image owner released.", "AbortError"));
            expect(await Promise.race([outcome, new Promise<string>(resolve => setTimeout(() => resolve("still pending"), 40))])).toBe("AbortError");
            platform.revokeObjectURL(decoded.src);
        } finally {
            const release = releaseCalibration as (() => void) | null;
            release?.();
            if (outcome) await outcome;
            create.mockRestore();
            revoke.mockRestore();
        }
    });
    it("expires an unresponsive browser ICC probe and permits a later calibration retry", async () => {
        const webp = Buffer.from(JSON.parse(readFileSync(new URL("../../fixtures/linear-icc-formats.json", import.meta.url), "utf8")).webp, "base64");
        const offset = webp.indexOf(Buffer.from("ICCP"));
        const length = webp.readUInt32LE(offset + 4);
        const profile = new Uint8Array(webp.subarray(offset + 8, offset + 8 + length));
        let calibrationLoads = 0;
        const document = { createElement: (tag: string) => {
            if (tag === "img") {
                const image = { naturalWidth: 1, naturalHeight: 1, onload: null as null | (() => void), onerror: null, set src(value: string) {
                    if (value === "blob:calibration") {
                        calibrationLoads++;
                        if (calibrationLoads > 1) queueMicrotask(() => image.onload?.());
                    } else queueMicrotask(() => image.onload?.());
                } };
                return image;
            }
            return { width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([128, 128, 128, 255]) }) }) };
        } };
        const create = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:source").mockReturnValue("blob:calibration");
        const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        vi.useFakeTimers();
        try {
            const browser = { createImageBitmap: vi.fn().mockRejectedValue(new Error("Bitmap calibration unavailable")), setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
            const platform = createBrowserImagePlatform(document as unknown as Document, browser as unknown as Window);
            const signal = new AbortController().signal;
            const decoded = await platform.decode({ kind: "bytes", mimeType: "image/png", bytes: pngWithICC(profile) }, signal);
            let firstResult: string | null = null;
            const first = platform.readPixels!(decoded.src, decoded.intrinsicSize, signal).then(() => { firstResult = "resolved"; }, error => { firstResult = (error as Error).name; });
            for (let i = 0; i < 8; i++) await Promise.resolve();
            expect(calibrationLoads).toBe(1);
            await vi.advanceTimersByTimeAsync(10_001);
            expect(firstResult).toBe("NotSupportedError");
            await first;
            const second = await platform.readPixels!(decoded.src, decoded.intrinsicSize, signal);
            expect(second.pixel(0, 0).r).toBeGreaterThan(0.7);
            expect(calibrationLoads).toBe(2);
            platform.revokeObjectURL(decoded.src);
        } finally {
            vi.useRealTimers();
            create.mockRestore();
            revoke.mockRestore();
        }
    });
});
