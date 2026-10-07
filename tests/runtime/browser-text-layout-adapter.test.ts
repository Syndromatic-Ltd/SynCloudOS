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

import { describe, expect, it, vi } from "vitest";

import { BrowserTextLayoutAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserTextLayoutAdapter";
import type { BrowserTextMeasurementSurface } from "../../src/SynCloudOS/PlatformAdapters/browserTextLayoutAdapterTypes";
import { createBrowserFontFaceRegistrationPort } from "../../src/SynCloudOS/PlatformAdapters/BrowserFontFaceRegistration";

const request = (signal: AbortSignal) => ({
  text: "office 👩‍👩‍👧‍👦",
  font: { families: ["Prelude"], size: 16, weight: 400, style: "normal" as const, stretch: "normal" as const },
  locale: "en-GB",
  direction: "ltr" as const,
  writingMode: "horizontal-tb" as const,
  signal,
});

describe("BrowserTextLayoutAdapter measurement-node ownership", () => {
  it("promptly cancels a pending FontFaceSet load and deletes the added face", async () => {
    const setReady = new Promise<readonly object[]>(() => undefined);
    const faces: Array<{ readonly bytes: Uint8Array; load(): Promise<object> }> = [];
    class FakeFontFace {
      readonly bytes: Uint8Array;
      constructor(_family: string, source: ArrayBuffer) {
        this.bytes = new Uint8Array(source);
        faces.push(this);
      }
      async load() { return this; }
    }
    const fontSet = { add: vi.fn(), delete: vi.fn(() => true), load: vi.fn(() => setReady) };
    const port = createBrowserFontFaceRegistrationPort(fontSet, FakeFontFace);
    const controller = new AbortController();
    const source = new Uint8Array([1, 2, 3, 4]);
    const pending = port.registerFontFace!({
      familyName: "TFX_runtime_1_1",
      bytes: source,
      descriptor: { size: 16, family: "Prelude", faceIndex: 0, variations: {} },
      signal: controller.signal,
    });
    source[0] = 9;
    await vi.waitFor(() => expect(fontSet.add).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException("mount retired", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(faces[0]?.bytes[0]).toBe(1);
    expect(fontSet.load).toHaveBeenCalledWith('16px "TFX_runtime_1_1"');
    expect(fontSet.delete).toHaveBeenCalledTimes(1);
  });

  it("promptly cancels a pending FontFace load and ignores its late completion", async () => {
    let settleFace!: () => void;
    const faceReady = new Promise<void>((resolve) => { settleFace = resolve; });
    class FakeFontFace {
      async load() {
        await faceReady;
        return this;
      }
    }
    const fontSet = { add: vi.fn(), delete: vi.fn(() => true), load: vi.fn(async () => []) };
    const port = createBrowserFontFaceRegistrationPort(fontSet, FakeFontFace);
    const controller = new AbortController();
    const pending = port.registerFontFace!({
      familyName: "TFX_runtime_1_2",
      bytes: new Uint8Array([1, 2, 3, 4]),
      descriptor: { size: 16, family: "Prelude", faceIndex: 0, variations: {} },
      signal: controller.signal,
    });
    controller.abort(new DOMException("mount retired", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    settleFace();
    await Promise.resolve();
    expect(fontSet.add).not.toHaveBeenCalled();
    expect(fontSet.delete).not.toHaveBeenCalled();
  });

  it("deletes a face when FontFaceSet.add reentrantly aborts registration", async () => {
    class FakeFontFace { async load() { return this; } }
    const controller = new AbortController();
    const fontSet = {
      add: vi.fn(() => controller.abort(new DOMException("reentrant retirement", "AbortError"))),
      delete: vi.fn(() => true),
      load: vi.fn(async () => []),
    };
    const port = createBrowserFontFaceRegistrationPort(fontSet, FakeFontFace);
    await expect(port.registerFontFace!({
      familyName: "TFX_runtime_1_3",
      bytes: new Uint8Array([1, 2, 3, 4]),
      descriptor: { size: 16, family: "Prelude", faceIndex: 0, variations: {} },
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(fontSet.delete).toHaveBeenCalledTimes(1);
    expect(fontSet.load).not.toHaveBeenCalled();
  });
  it("owns browser font-face registrations and releases them with either lease or adapter", async () => {
    const platformRelease = vi.fn();
    const registerFontFace = vi.fn(async (input: { readonly familyName: string }) => ({
      familyName: input.familyName,
      release: platformRelease,
    }));
    const adapter = new BrowserTextLayoutAdapter({
      createSegmenter: () => ({ segment: () => [] }),
      createMeasurementSurface: () => null,
      yieldToHost: () => Promise.resolve(),
      registerFontFace,
    });
    const lease = await adapter.registerFontFace!({
      familyName: "TFX runtime scope 1",
      bytes: new Uint8Array([0, 1, 2, 3]),
      descriptor: { size: 16, family: "Prelude", faceIndex: 0, variations: {} },
      signal: new AbortController().signal,
    });
    expect(lease.familyName).toBe("TFX runtime scope 1");
    lease.release();
    lease.release();
    expect(platformRelease).toHaveBeenCalledTimes(1);

    await adapter.registerFontFace!({
      familyName: "TFX runtime scope 2",
      bytes: new Uint8Array([0, 1, 2, 3]),
      descriptor: { size: 16, family: "Prelude", faceIndex: 0, variations: {} },
      signal: new AbortController().signal,
    });
    adapter.dispose();
    expect(platformRelease).toHaveBeenCalledTimes(2);
  });
  it("releases its measurement surface after success, throw and pre-abort", async () => {
    const surfaces: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
    let throwMeasure = false;
    const adapter = new BrowserTextLayoutAdapter({
      createSegmenter: () => ({ segment: () => [] }),
      createMeasurementSurface() {
        const surface = {
          measure: () => {
            if (throwMeasure) throw new Error("measurement failed");
            return { advance: 20, ascent: 8, descent: 2, baseline: 8, inkBounds: { x: 0, y: 0, width: 20, height: 10 } };
          },
          rangeRects: () => [],
          hitTest: () => ({ offset: 0, affinity: "downstream" as const }),
          dispose: vi.fn(),
        } satisfies BrowserTextMeasurementSurface;
        surfaces.push(surface);
        return surface;
      },
      yieldToHost: () => Promise.resolve(),
    });
    await expect(adapter.measure(request(new AbortController().signal))).resolves.toMatchObject({ advance: 20 });
    throwMeasure = true;
    await expect(adapter.measure(request(new AbortController().signal))).rejects.toThrow("measurement failed");
    const aborted = new AbortController();
    aborted.abort(new DOMException("cancelled", "AbortError"));
    await expect(adapter.measure(request(aborted.signal))).rejects.toMatchObject({ name: "AbortError" });
    expect(surfaces).toHaveLength(2);
    expect(surfaces.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(true);
    expect(adapter.diagnostics()).toEqual({ activeMeasurementNodeCount: 0 });
  });

  it("disposes every live surface exactly once when the adapter is disposed", async () => {
    const dispose = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const adapter = new BrowserTextLayoutAdapter({
      createSegmenter: () => ({ segment: () => [] }),
      createMeasurementSurface: () => ({
        measure: () => {
          void gate;
          adapter.dispose();
          return { advance: 1, ascent: 1, descent: 0, baseline: 1, inkBounds: { x: 0, y: 0, width: 1, height: 1 } };
        },
        rangeRects: () => [], hitTest: () => ({ offset: 0, affinity: "downstream" }), dispose,
      }),
      yieldToHost: () => Promise.resolve(),
    });
    await expect(adapter.measure(request(new AbortController().signal))).rejects.toMatchObject({ name: "AbortError" });
    release();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(adapter.diagnostics()).toEqual({ activeMeasurementNodeCount: 0 });
  });

  it("rejects unsafe bidi hit tests before creating a measurement surface", async () => {
    const createMeasurementSurface = vi.fn(() => ({
      measure: () => ({ advance: 1, ascent: 1, descent: 0, baseline: 1, inkBounds: { x: 0, y: 0, width: 1, height: 1 } }),
      rangeRects: () => [],
      hitTest: () => ({ offset: 0, affinity: "downstream" as const }),
      dispose: vi.fn(),
    } satisfies BrowserTextMeasurementSurface));
    const adapter = new BrowserTextLayoutAdapter({
      createSegmenter: () => ({ segment: () => [] }),
      createMeasurementSurface,
      yieldToHost: () => Promise.resolve(),
    });
    const signal = new AbortController().signal;
    for (const text of ["abc\u202Edef", "مرحبا 123"]) {
      await expect(adapter.hitTest({ ...request(signal), text, locale: "ar", direction: "rtl", point: { x: 1, y: 1 } }))
        .rejects.toMatchObject({ feature: "mixed-bidi-hit-testing" });
    }
    expect(createMeasurementSurface).not.toHaveBeenCalled();
    expect(adapter.diagnostics()).toEqual({ activeMeasurementNodeCount: 0 });
  });
});
