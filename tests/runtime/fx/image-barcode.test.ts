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

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BarcodeFormat, BinaryBitmap, Code128Reader, DecodeHintType, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { IFXBarcodeDescriptor, IFXContext, IFXFilterGraph, IFXFilterRegistry, IFXQRCodeDescriptor, IFXSampler, type IFXImage } from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();

function byteModeCodewords(text: string, version: number, capacity: number): readonly number[] {
  const bytes = [...new TextEncoder().encode(text)], bits: number[] = [0, 1, 0, 0];
  const append = (value: number, count: number) => {
    for (let shift = count - 1; shift >= 0; shift--)
      bits.push(value >>> shift & 1);
  };
  append(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes)
    append(byte, 8);
  for (let i = 0; i < Math.min(4, capacity * 8 - bits.length); i++)
    bits.push(0);
  while (bits.length % 8)
    bits.push(0);
  const result: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8)
    result.push(bits.slice(offset, offset + 8).reduce((value, bit) => value << 1 | bit, 0));
  for (let pad = 0xec; result.length < capacity; pad ^= 0xfd)
    result.push(pad);
  return result;
}

function matrixBits(image: IFXImage): string {
  if (image.extent.kind !== "finite")
    throw new Error("Expected a finite barcode image.");
  const sampler = new IFXSampler(image), { width, height } = image.extent.rect;
  let bits = "";
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      bits += sampler.sample({ x: x + .5, y: y + .5 }).r < .5 ? "1" : "0";
  return bits;
}

function decode(image: IFXImage, format: "qr" | "code128"): string {
  if (image.extent.kind !== "finite")
    throw new Error("Expected a finite barcode image.");
  const sourceWidth = image.extent.rect.width, sourceHeight = image.extent.rect.height;
  const border = format === "qr" ? 4 : 0, scaleX = format === "qr" ? 4 : 2, scaleY = format === "qr" ? 4 : 1;
  const width = (sourceWidth + border * 2) * scaleX, height = (sourceHeight + border * 2) * scaleY;
  const luminance = new Uint8ClampedArray(width * height).fill(255), sampler = new IFXSampler(image);
  for (let y = 0; y < sourceHeight; y++)
    for (let x = 0; x < sourceWidth; x++)
      if (sampler.sample({ x: x + .5, y: y + .5 }).r < .5)
        for (let dy = 0; dy < scaleY; dy++)
          luminance.fill(0, ((y + border) * scaleY + dy) * width + (x + border) * scaleX, ((y + border) * scaleY + dy) * width + (x + border + 1) * scaleX);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)));
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [format === "qr" ? BarcodeFormat.QR_CODE : BarcodeFormat.CODE_128]]]);
  return (format === "qr" ? new QRCodeReader() : new Code128Reader()).decode(bitmap, hints).getText();
}

describe("ImageFX barcode descriptors and generators", () => {
  it("owns QR data codewords and round-trips only tagged plain graph data", () => {
    const source = new Uint8Array([0x40, 0xf5, 0x46, 0x86, 0x96, 0xe6, 0xb2, 0x04, 0x46, 0x96, 0x66, 0x66, 0x57, 0x26, 0x56, 0xe7, 0x40, 0xec, 0x11]);
    const descriptor = new IFXQRCodeDescriptor(source, 1, 4, "L");
    source.fill(0);
    const first = descriptor.errorCorrectedPayload;
    first.fill(0);
    expect(descriptor.errorCorrectedPayload[0]).toBe(0x40);
    expect(IFXBarcodeDescriptor.fromData(descriptor.toData())).toEqual(descriptor);
    expect(descriptor.toData()).toEqual({ kind: "qr", errorCorrectedPayload: [0x40, 0xf5, 0x46, 0x86, 0x96, 0xe6, 0xb2, 0x04, 0x46, 0x96, 0x66, 0x66, 0x57, 0x26, 0x56, 0xe7, 0x40, 0xec, 0x11], symbolVersion: 1, maskPattern: 4, errorCorrectionLevel: "L" });
  });

  it("reconstructs Apple's pre-RS QR descriptor payload into the fixed reference matrix", () => {
    // A Version 1-L byte-mode fixture at Apple's documented pre-RS payload stage.
    // Its data codewords and matrix were produced independently with ZXing at fixed mask 4.
    const payload = [0x40, 0xf5, 0x46, 0x86, 0x96, 0xe6, 0xb2, 0x04, 0x46, 0x96, 0x66, 0x66, 0x57, 0x26, 0x56, 0xe7, 0x40, 0xec, 0x11];
    const descriptor = new IFXQRCodeDescriptor(payload, 1, 4, "L");
    const image = registry.create("barcodeGenerator", { barcodeDescriptor: descriptor.toData() }).apply();
    expect(image.extent).toEqual({ kind: "finite", rect: { x: 0, y: 0, width: 21, height: 21 } });
    expect(matrixBits(image).match(/.{21}/g)).toEqual([
      "111111101110101111111", "100000101010101000001", "101110101001001011101", "101110101110001011101", "101110100001001011101", "100000101101101000001", "111111101010101111111", "000000000111100000000", "110011100101000101111", "111110011100010010010", "101100100010010011010", "111000010000010110000", "000111110111110100001", "000000001010001000001", "111111100110001010010", "100000101101110110011", "101110101110110000000", "101110100111001011011", "101110100110001111100", "100000101000010000000", "111111101001110010001",
    ]);
    expect(decode(image, "qr")).toBe("Think Different");
  });

  it("handles remainder modules and unequal QR block sizes", () => {
    const fixtures = [
      { text: "Remainder bits", version: 2, level: "L" as const, mask: 3, capacity: 34, hash: "f28acd4a017d7fe0e60b2e4e653450f428f5a5859fa2d8da3a5f050c7fd6c55b" },
      { text: "Unequal QR blocks", version: 5, level: "Q" as const, mask: 6, capacity: 62, hash: "9ed256b9ebc6da85702039a4c7979060869bc84e005f3e8971b8137170c09d49" },
    ];
    for (const fixture of fixtures) {
      const descriptor = new IFXQRCodeDescriptor(byteModeCodewords(fixture.text, fixture.version, fixture.capacity), fixture.version, fixture.mask, fixture.level);
      const image = registry.create("barcodeGenerator", { barcodeDescriptor: descriptor.toData() }).apply();
      expect(createHash("sha256").update(matrixBits(image)).digest("hex")).toBe(fixture.hash);
      expect(decode(image, "qr")).toBe(fixture.text);
    }
  });

  it("generates a deterministic QR image from exact bytes and survives graph serialization", async () => {
    const message = [...new TextEncoder().encode("SynCloudOS IFX-08 / 2026")];
    const image = registry.create("qrCodeGenerator", { message, correctionLevel: "H" }).apply();
    const graph = JSON.parse(JSON.stringify(new IFXFilterGraph(image).serialize()));
    const copy = IFXFilterGraph.deserialize(graph).output;
    expect(matrixBits(copy)).toBe(matrixBits(image));
    const rendered = await new IFXContext("linear-srgb", 1_048_576).render(copy);
    expect(rendered.image.width).toBeGreaterThanOrEqual(21);
    expect(decode(copy, "qr")).toBe("SynCloudOS IFX-08 / 2026");
  });

  it("encodes Code 128 bytes with exact pixel height and quiet space for an independent decoder", () => {
    const message = [...new TextEncoder().encode("AB12cd34567890")], filter = registry.create("code128BarcodeGenerator", { message, barcodeHeight: 48, quietSpace: 12 });
    message.fill(0);
    const image = filter.apply();
    expect(image.extent.kind).toBe("finite");
    if (image.extent.kind !== "finite")
      throw new Error("Expected finite Code 128 output.");
    expect(image.extent.rect.height).toBe(48);
    const bits = matrixBits(image), width = image.extent.rect.width;
    expect(bits.slice(0, 12)).toBe("0".repeat(12));
    expect(bits.slice(width - 12, width)).toBe("0".repeat(12));
    expect(decode(image, "code128")).toBe("AB12cd34567890");
    const copy = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(image).serialize()))).output;
    expect(matrixBits(copy)).toBe(bits);
    expect(decode(copy, "code128")).toBe("AB12cd34567890");
    const controls = [0, 31, 32, 65, 127];
    expect(decode(registry.create("code128BarcodeGenerator", { message: controls, barcodeHeight: 32, quietSpace: 10 }).apply(), "code128"))
      .toBe(String.fromCharCode(...controls));
  });

  it("preflights descriptor and generator inputs without executing accessors", () => {
    expect(() => new IFXQRCodeDescriptor([], 1, 0, "L")).toThrow();
    expect(() => new IFXQRCodeDescriptor(new Array(19).fill(0), 1, 0, "H")).toThrow();
    expect(() => new IFXQRCodeDescriptor(new Array(19).fill(0), 0, 0, "L")).toThrow();
    expect(() => new IFXQRCodeDescriptor(new Array(19).fill(0), 1, 8, "L")).toThrow();
    const values = new Array(19).fill(0);
    Object.defineProperty(values, "0", { get: () => { throw new Error("executed"); } });
    expect(() => new IFXQRCodeDescriptor(values, 1, 0, "L")).toThrow(TypeError);
    expect(() => registry.create("qrCodeGenerator", { message: [], correctionLevel: "M" })).toThrow();
    expect(() => registry.create("qrCodeGenerator", { message: new Array(2049).fill(65), correctionLevel: "M" })).toThrow(RangeError);
    expect(() => registry.create("code128BarcodeGenerator", { message: [0x80], barcodeHeight: 32, quietSpace: 10 })).toThrow();
    expect(() => registry.create("code128BarcodeGenerator", { message: [65], barcodeHeight: NaN, quietSpace: 10 })).toThrow();
    expect(() => registry.create("code128BarcodeGenerator", { message: new Array(256).fill(65), barcodeHeight: 1024, quietSpace: 512 })).toThrow(RangeError);
    expect(() => registry.create("code128BarcodeGenerator", { message: Array.from({ length: 256 }, (_, index) => index % 2 ? 127 : 0), barcodeHeight: 1, quietSpace: 0 })).toThrow(RangeError);
  });

  it("has no input ROI and honours render cancellation before destination work", () => {
    const image = registry.create("qrCodeGenerator", { message: [65], correctionLevel: "L" }).apply();
    expect(new IFXFilterGraph(image).regionsOfInterest({ x: 0, y: 0, width: 21, height: 21 })).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    expect(() => new IFXContext().render(image, undefined, { signal: controller.signal })).toThrow(expect.objectContaining({ name: "AbortError" }));
  });
});
