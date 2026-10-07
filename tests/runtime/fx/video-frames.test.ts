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

import { expect, it } from "vitest";
import { GFXImage } from "../../../src/FX/GraphicsFX/public";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import {
  VFXFrame,
  VFXPixelBuffer,
  VFXPixelBufferPool,
  VFXVideoFormat,
} from "../../../src/FX/VideoFX/public";

it("derives exact packed and odd-sized planar layouts with bounded explicit strides", () => {
  const rgba = new VFXVideoFormat({ codedWidth: 5, codedHeight: 3, pixelFormat: "rgba8", colourSpace: "srgb" });
  expect(rgba.planeLayouts).toEqual([
    { index: 0, width: 5, height: 3, offset: 0, bytesPerRow: 20, rowBytes: 20, byteLength: 60 },
  ]);
  expect(rgba.byteLength).toBe(60);

  const i420 = new VFXVideoFormat({
    codedWidth: 5,
    codedHeight: 3,
    pixelFormat: "i420",
    colourSpace: "srgb",
    planeStrides: [8, 4, 5],
    cleanAperture: { x: 1, y: 0, width: 4, height: 3 },
    pixelAspectRatio: { numerator: 4, denominator: 3 },
  });
  expect(i420.planeLayouts).toEqual([
    { index: 0, width: 5, height: 3, offset: 0, bytesPerRow: 8, rowBytes: 5, byteLength: 24 },
    { index: 1, width: 3, height: 2, offset: 24, bytesPerRow: 4, rowBytes: 3, byteLength: 8 },
    { index: 2, width: 3, height: 2, offset: 32, bytesPerRow: 5, rowBytes: 3, byteLength: 10 },
  ]);
  expect(i420.byteLength).toBe(42);
  expect(i420.cleanAperture).toEqual({ x: 1, y: 0, width: 4, height: 3 });
  expect(i420.pixelAspectRatio).toEqual({ numerator: 4, denominator: 3 });
  expect(() => new VFXVideoFormat({ codedWidth: 5, codedHeight: 3, pixelFormat: "nv12", colourSpace: "srgb", planeStrides: [4, 6] })).toThrow(/stride/i);
});

it("keeps clones alive independently and transfers one handle without copying ownership", () => {
  const format = new VFXVideoFormat({ codedWidth: 2, codedHeight: 1, pixelFormat: "rgba8", colourSpace: "srgb" });
  const source = new VFXPixelBuffer(format, new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]));
  const clone = source.clone();
  source.close();
  expect(source.closed).toBe(true);
  expect(() => source.copyData()).toThrow(/closed/i);
  expect([...clone.copyData()]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);

  const receiver = clone.transfer();
  expect(clone.closed).toBe(true);
  expect([...receiver.copyData()]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  receiver.close();
  expect(() => receiver.copyPlane(0)).toThrow(/closed/i);
  expect(() => receiver.close()).not.toThrow();
});

it("does not recycle pooled storage while a clone retains it and fails quota before allocation", () => {
  const format = new VFXVideoFormat({ codedWidth: 2, codedHeight: 2, pixelFormat: "rgba8", colourSpace: "srgb" });
  const pool = new VFXPixelBufferPool({ maximumBuffers: 2, maximumBytes: 32 });
  const first = pool.acquire(format, new Uint8Array(16).fill(1));
  const clone = first.clone();
  first.close();
  expect(pool.diagnostics()).toMatchObject({ allocatedBuffers: 1, availableBuffers: 0, liveHandles: 1, retainedBytes: 16 });

  const second = pool.acquire(format, new Uint8Array(16).fill(2));
  expect(pool.diagnostics()).toMatchObject({ allocatedBuffers: 2, availableBuffers: 0, liveHandles: 2, retainedBytes: 32 });
  expect(() => pool.acquire(format)).toThrowError(DOMException);
  expect(pool.diagnostics().allocationCount).toBe(2);

  clone.close();
  expect(pool.diagnostics().availableBuffers).toBe(1);
  const reused = pool.acquire(format, new Uint8Array(16).fill(3));
  expect(pool.diagnostics().allocationCount).toBe(2);
  expect([...reused.copyData()].every((value) => value === 3)).toBe(true);
  reused.close();
  second.close();
  pool.dispose();
  expect(pool.diagnostics()).toMatchObject({ allocatedBuffers: 0, retainedBytes: 0, disposed: true });
});

it("converts advertised planar formats through an explicit GFX copy bridge", () => {
  const image = new GFXImage({
    width: 3,
    height: 3,
    pixelFormat: "rgba8",
    alpha: "opaque",
    colourSpace: "srgb",
    data: new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
      64, 64, 64, 255, 128, 128, 128, 255, 224, 224, 224, 255,
    ]),
  });
  for (const pixelFormat of ["i420", "nv12"] as const) {
    const video = VFXPixelBuffer.fromGFXImage(image, { pixelFormat });
    expect(video.format.pixelFormat).toBe(pixelFormat);
    const roundTrip = video.toGFXImage();
    expect(roundTrip.width).toBe(3);
    expect(roundTrip.height).toBe(3);
    expect(roundTrip.alpha).toBe("opaque");
    const originalLuma = image.pixel(1, 2);
    const actualLuma = roundTrip.pixel(1, 2);
    expect(Math.abs(actualLuma.r - originalLuma.r)).toBeLessThan(0.08);
    expect(Math.abs(actualLuma.g - originalLuma.g)).toBeLessThan(0.08);
    expect(Math.abs(actualLuma.b - originalLuma.b)).toBeLessThan(0.08);
    video.close();
  }
});

it("frames preserve exact MediaFX timing while clone and transfer retain pixel ownership", () => {
  const format = new VFXVideoFormat({ codedWidth: 1, codedHeight: 1, pixelFormat: "bgra8", colourSpace: "display-p3" });
  const pixels = new VFXPixelBuffer(format, new Uint8Array([30, 20, 10, 255]));
  const timing = new MEFXSampleTimingInfo({
    presentationTime: MEFXTime.finite(3n, 30),
    duration: MEFXTime.finite(1n, 30),
  });
  const frame = new VFXFrame({ pixels, timing });
  pixels.close();
  const clone = frame.clone();
  frame.close();
  expect(clone.timing).toBe(timing);
  expect([...clone.copyPixelBuffer().copyData()]).toEqual([30, 20, 10, 255]);
  const moved = clone.transfer();
  expect(clone.closed).toBe(true);
  expect(moved.timing).toBe(timing);
  expect(moved.toGFXImage().colourSpace).toBe("display-p3");
  moved.close();
});

it("retains a decoded surface across independent handles without copying its pixels", () => {
  let closes = 0;
  let copies = 0;
  const surface = {
    codedWidth: 16,
    codedHeight: 8,
    clone() { return { ...this }; },
    close() { closes += 1; },
    copyTo() { copies += 1; throw new Error("eager pixel copy"); },
  } as unknown as VideoFrame;
  const timing = new MEFXSampleTimingInfo({
    presentationTime: MEFXTime.finite(42n, 30),
    duration: MEFXTime.finite(1n, 30),
  });
  const frame = VFXFrame.fromVideoFrame(surface, timing);
  const second = frame.clone();
  frame.close();
  expect(second.storageKind).toBe("video-surface");
  expect(second.withVideoFrame((borrowed) => borrowed.codedWidth)).toBe(16);
  expect(second.timing).toBe(timing);
  expect(copies).toBe(0);
  second.close();
  expect(closes).toBe(2);
});
