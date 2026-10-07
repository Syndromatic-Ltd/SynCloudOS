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

import { describe, expect, it } from "vitest";
import { IFXRAWDecodeError, IFXRAWFilter, IFXRAWUnsupportedError } from "../../../src/FX/ImageFX/public";

import { syntheticSensorDNG } from "../../fixtures/fx/synthetic-sensor-dng";

function entryOffset(bytes: Uint8Array, ifdOffset: number, wantedTag: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(ifdOffset, true);
  for (let index = 0; index < count; index++) {
    const offset = ifdOffset + 2 + index * 12;
    if (view.getUint16(offset, true) === wantedTag) return offset;
  }
  throw new Error(`missing test tag ${wantedTag}`);
}

function setInlineShort(bytes: Uint8Array, ifdOffset: number, tag: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(entryOffset(bytes, ifdOffset, tag) + 8, value, true);
}

function setInlineLong(bytes: Uint8Array, ifdOffset: number, tag: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(entryOffset(bytes, ifdOffset, tag) + 8, value, true);
}

describe("FX-15 sensor RAW development", () => {
  it("develops the Bayer sensor plane with DNG metadata instead of the embedded preview", async () => {
    const filter = new IFXRAWFilter(syntheticSensorDNG());
    expect(filter.metadata).toMatchObject({
      format: "dng",
      cameraModel: "SynCloudOS Synthetic Bayer DNG",
      sourceWidth: 4,
      sourceHeight: 2,
      bitsPerSample: 16,
      cfaPattern: "rggb",
      blackLevel: 64,
      whiteLevel: 1023,
      orientation: 6,
      workingColourSpace: "linear-srgb",
    });

    const baseline = await filter.develop();
    const plusOne = await filter.develop({ exposureEV: 1 });

    expect(baseline.provenance).toMatchObject({
      source: "sensor-plane",
      embeddedPreviewUsed: false,
      sensorIFDOffset: 256,
      demosaic: "bilinear-bayer",
      orientationApplied: true,
    });
    expect(baseline.image.descriptor).toMatchObject({
      width: 2,
      height: 4,
      sampleFormat: "float32",
      alpha: "opaque",
      colourSpace: "linear-srgb",
    });

    const expectedCameraValue = 192 / 959;
    const expected = {
      r: expectedCameraValue * 3.2404542 + expectedCameraValue * -1.5371385 + expectedCameraValue * -0.4985314,
      g: expectedCameraValue * -0.969266 + expectedCameraValue * 1.8760108 + expectedCameraValue * 0.041556,
      b: expectedCameraValue * 0.0556434 + expectedCameraValue * -0.2040259 + expectedCameraValue * 1.0572252,
    };
    const pixel = baseline.image.pixel(0, 0);
    const brighter = plusOne.image.pixel(0, 0);
    expect(pixel.r).toBeCloseTo(expected.r, 5);
    expect(pixel.g).toBeCloseTo(expected.g, 5);
    expect(pixel.b).toBeCloseTo(expected.b, 5);
    expect(brighter.r).toBeCloseTo(pixel.r * 2, 5);
    expect(brighter.g).toBeCloseTo(pixel.g * 2, 5);
    expect(brighter.b).toBeCloseTo(pixel.b * 2, 5);
  });

  it("defaults missing TIFF orientation to unrotated exactly once", async () => {
    const filter = new IFXRAWFilter(syntheticSensorDNG({ orientation: null }));
    expect(filter.metadata.orientation).toBe(1);
    const result = await filter.develop();
    expect(result.image.descriptor).toMatchObject({ width: 4, height: 2 });
    expect(result.provenance.orientationApplied).toBe(true);
  });

  it("applies an explicit DNG linearization table before black/white normalization", async () => {
    const filter = new IFXRAWFilter(syntheticSensorDNG({ linearization: true }));
    expect(filter.metadata.hasLinearizationTable).toBe(true);
    expect(filter.metadata.blackLevel).toBe(128);
    expect(filter.metadata.whiteLevel).toBe(2046);
    const pixel = (await filter.develop()).image.pixel(0, 0);
    const reference = (await new IFXRAWFilter(syntheticSensorDNG()).develop()).image.pixel(0, 0);
    expect(pixel.r).toBeCloseTo(reference.r, 6);
    expect(pixel.g).toBeCloseTo(reference.g, 6);
    expect(pixel.b).toBeCloseTo(reference.b, 6);
  });

  it("owns the encoded source bytes instead of observing caller mutation", async () => {
    const bytes = syntheticSensorDNG();
    const filter = new IFXRAWFilter(bytes);
    bytes.fill(0);
    const result = await filter.develop();
    expect(result.metadata.cameraModel).toBe("SynCloudOS Synthetic Bayer DNG");
    expect(result.provenance.source).toBe("sensor-plane");
  });

  it("reports unsupported compression, camera opcode requirements and strip layouts as typed limitations", () => {
    const compressed = syntheticSensorDNG();
    setInlineShort(compressed, 256, 259, 7);
    expect(() => new IFXRAWFilter(compressed)).toThrow(expect.objectContaining({ name: "IFXRAWUnsupportedError", reason: "compression" }));

    const cameraOpcode = syntheticSensorDNG();
    const opcodeEntry = entryOffset(cameraOpcode, 256, 284);
    new DataView(cameraOpcode.buffer).setUint16(opcodeEntry, 51009, true);
    expect(() => new IFXRAWFilter(cameraOpcode)).toThrow(expect.objectContaining({
      name: "IFXRAWUnsupportedError",
      reason: "camera-opcodes",
      cameraModel: "SynCloudOS Synthetic Bayer DNG",
    }));

    const splitStrips = syntheticSensorDNG();
    setInlineLong(splitStrips, 256, 278, 1);
    expect(() => new IFXRAWFilter(splitStrips)).toThrow(expect.objectContaining({ name: "IFXRAWUnsupportedError", reason: "layout" }));
  });

  it("rejects corrupt and huge metadata before any development allocation", () => {
    const hugeDimensions = syntheticSensorDNG();
    setInlineLong(hugeDimensions, 256, 256, 0xffff_ffff);
    expect(() => new IFXRAWFilter(hugeDimensions)).toThrow(expect.objectContaining({ name: "IFXRAWDecodeError", code: "bounds" }));

    const hostileCount = syntheticSensorDNG();
    const matrixEntry = entryOffset(hostileCount, 256, 50721);
    new DataView(hostileCount.buffer).setUint32(matrixEntry + 4, 0xffff_ffff, true);
    expect(() => new IFXRAWFilter(hostileCount)).toThrow(expect.objectContaining({ name: "IFXRAWDecodeError", code: "bounds" }));

    const truncated = syntheticSensorDNG();
    setInlineLong(truncated, 256, 273, truncated.byteLength - 4);
    expect(() => new IFXRAWFilter(truncated)).toThrow(IFXRAWDecodeError);
  });

  it("fences development when cancellation wins before pixel work publishes", async () => {
    const filter = new IFXRAWFilter(syntheticSensorDNG());
    const controller = new AbortController();
    const pending = filter.develop({ signal: controller.signal });
    controller.abort(new DOMException("cancel raw", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("publishes the narrow portable backend capability contract", () => {
    const filter = new IFXRAWFilter(syntheticSensorDNG());
    expect(filter.capabilities).toMatchObject({
      backend: "portable-dng",
      formats: ["dng"],
      byteOrders: ["little-endian"],
      compressions: ["uncompressed"],
      bitsPerSample: [16],
      cfaPatterns: ["rggb", "bggr", "grbg", "gbrg"],
      orientations: [1, 3, 6, 8],
      outputColourSpaces: ["linear-srgb"],
      outputSampleFormats: ["float32"],
      embeddedPreviewDevelopment: false,
    });
    expect(filter.capabilities.maximumOutputBytes).toBe(32 * 1024 * 1024);
    expect(IFXRAWUnsupportedError).toBeTypeOf("function");
  });
});
