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
import {
  AztecCodeReader,
  BarcodeFormat,
  BinaryBitmap,
  DataMatrixReader,
  DecodeHintType,
  HybridBinarizer,
  PDF417Reader,
  RGBLuminanceSource,
} from "@zxing/library";
import {
  IFXAztecCodeDescriptor,
  IFXBarcodeDescriptor,
  IFXDataMatrixCodeDescriptor,
  IFXFilterGraph,
  IFXFilterRegistry,
  IFXPDF417CodeDescriptor,
  IFXSampler,
  type IFXImage,
} from "../../../src/FX/ImageFX/public";

const registry = new IFXFilterRegistry();

type MatrixFormat = "aztec" | "pdf417" | "dataMatrix";

function decode(image: IFXImage, format: MatrixFormat): string {
  if (image.extent.kind !== "finite")
    throw new Error("Expected a finite barcode image.");
  const sourceWidth = image.extent.rect.width, sourceHeight = image.extent.rect.height;
  const border = format === "pdf417" ? 4 : 3, scale = format === "pdf417" ? 3 : 4;
  const width = (sourceWidth + border * 2) * scale, height = (sourceHeight + border * 2) * scale;
  const luminance = new Uint8ClampedArray(width * height).fill(255), sampler = new IFXSampler(image);
  for (let y = 0; y < sourceHeight; y++)
    for (let x = 0; x < sourceWidth; x++)
      if (sampler.sample({ x: x + .5, y: y + .5 }).r < .5)
        for (let dy = 0; dy < scale; dy++)
          luminance.fill(0, ((y + border) * scale + dy) * width + (x + border) * scale, ((y + border) * scale + dy) * width + (x + border + 1) * scale);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)));
  const barcodeFormat = format === "aztec" ? BarcodeFormat.AZTEC : format === "pdf417" ? BarcodeFormat.PDF_417 : BarcodeFormat.DATA_MATRIX;
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [barcodeFormat]], [DecodeHintType.PURE_BARCODE, true]]);
  const reader = format === "aztec" ? new AztecCodeReader() : format === "pdf417" ? new PDF417Reader() : new DataMatrixReader();
  return reader.decode(bitmap, hints).getText();
}

function serializedCopy(image: IFXImage): IFXImage {
  return IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(image).serialize()))).output;
}

describe("ImageFX deep barcode descriptors and symbol backends", () => {
  it("owns and round-trips versioned message descriptors for Aztec, PDF417 and Data Matrix", () => {
    const source = new Uint8Array([83, 121, 110]);
    const descriptors = [
      new IFXAztecCodeDescriptor(source, { correctionLevel: 23, layers: 2, compactStyle: true, quietSpace: 2 }),
      new IFXPDF417CodeDescriptor(source, { correctionLevel: 2, dataColumns: 3, rows: 8, compactStyle: false, quietSpace: 2 }),
      new IFXDataMatrixCodeDescriptor(source, { rows: 12, columns: 12, quietSpace: 2 }),
    ] as const;
    source.fill(0);

    for (const descriptor of descriptors) {
      expect(descriptor.payloadKind).toBe("message");
      expect(descriptor.message).toEqual(new Uint8Array([83, 121, 110]));
      const leaked = descriptor.message;
      leaked.fill(0);
      expect(descriptor.message).toEqual(new Uint8Array([83, 121, 110]));
      expect(IFXBarcodeDescriptor.fromData(JSON.parse(JSON.stringify(descriptor.toData())))).toEqual(descriptor);
      expect(descriptor.toData()).toMatchObject({ schemaVersion: 1 });
    }
  });

  it("renders each descriptor through barcodeGenerator and independently decodes its exact payload", () => {
    const fixtures = [
      { format: "aztec" as const, descriptor: new IFXAztecCodeDescriptor([65, 90, 45, 49], { correctionLevel: 23, layers: 2, compactStyle: true, quietSpace: 2 }), expected: "AZ-1" },
      { format: "pdf417" as const, descriptor: new IFXPDF417CodeDescriptor([80, 68, 70, 45, 52, 49, 55], { correctionLevel: 2, dataColumns: 3, rows: 8, compactStyle: false, quietSpace: 2 }), expected: "PDF-417" },
      { format: "dataMatrix" as const, descriptor: new IFXDataMatrixCodeDescriptor([68, 77, 45, 49], { rows: 12, columns: 12, quietSpace: 2 }), expected: "DM-1" },
    ];
    for (const fixture of fixtures) {
      const image = registry.create("barcodeGenerator", { barcodeDescriptor: fixture.descriptor.toData() }).apply();
      expect(decode(image, fixture.format)).toBe(fixture.expected);
      expect(decode(serializedCopy(image), fixture.format)).toBe(fixture.expected);
    }
  });

  it("generates Aztec, PDF417 and Data Matrix from explicit byte contracts without native-default inference", () => {
    const aztec = registry.create("aztecCodeGenerator", {
      message: [83, 121, 110, 45, 65, 122, 116, 101, 99],
      correctionLevel: 23,
      layers: 2,
      compactStyle: true,
      quietSpace: 2,
    }).apply();
    const pdf417 = registry.create("pdf417BarcodeGenerator", {
      message: [83, 121, 110, 45, 80, 68, 70],
      correctionLevel: 2,
      dataColumns: 3,
      rows: 8,
      compactStyle: false,
      quietSpace: 2,
    }).apply();
    const dataMatrix = registry.create("dataMatrixCodeGenerator", {
      message: [83, 121, 110, 45, 68, 77],
      rows: 14,
      columns: 14,
      quietSpace: 2,
    }).apply();

    expect(decode(aztec, "aztec")).toBe("Syn-Aztec");
    expect(decode(pdf417, "pdf417")).toBe("Syn-PDF");
    expect(decode(dataMatrix, "dataMatrix")).toBe("Syn-DM");
  });

  it("uses an explicit binary-byte policy and never retains caller-owned message storage", () => {
    const bytes = [0, 65, 127, 128, 200, 255];
    const descriptor = new IFXDataMatrixCodeDescriptor(bytes, { rows: 18, columns: 18, quietSpace: 2 });
    bytes.fill(32);
    expect([...descriptor.message]).toEqual([0, 65, 127, 128, 200, 255]);
    const data = descriptor.toData();
    expect(data).toMatchObject({ kind: "dataMatrix", schemaVersion: 1, encoding: "binary-bytes" });
    expect(data.message).toEqual([0, 65, 127, 128, 200, 255]);
  });

  it("rejects malformed fields and impossible work before accepting a descriptor or generator", () => {
    expect(() => new IFXAztecCodeDescriptor([65], { correctionLevel: 0, layers: 2, compactStyle: true, quietSpace: 2 })).toThrow(RangeError);
    expect(() => new IFXAztecCodeDescriptor([65], { correctionLevel: 23, layers: 5, compactStyle: true, quietSpace: 2 })).toThrow(RangeError);
    expect(() => new IFXPDF417CodeDescriptor([65], { correctionLevel: 9, dataColumns: 3, rows: 8, compactStyle: false, quietSpace: 2 })).toThrow(RangeError);
    expect(() => new IFXPDF417CodeDescriptor([65], { correctionLevel: 2, dataColumns: 31, rows: 8, compactStyle: false, quietSpace: 2 })).toThrow(RangeError);
    expect(() => new IFXDataMatrixCodeDescriptor([65], { rows: 13, columns: 13, quietSpace: 2 })).toThrow(RangeError);
    expect(() => new IFXDataMatrixCodeDescriptor(new Array(4097).fill(65), { rows: 144, columns: 144, quietSpace: 2 })).toThrow(RangeError);
    expect(() => registry.create("pdf417BarcodeGenerator", {
      message: new Array(4097).fill(65), correctionLevel: 2, dataColumns: 30, rows: 90, compactStyle: false, quietSpace: 64,
    })).toThrow(RangeError);
    expect(() => IFXBarcodeDescriptor.fromData({ kind: "aztec", schemaVersion: 2, encoding: "binary-bytes", message: [65], correctionLevel: 23, layers: 2, compactStyle: true, quietSpace: 2 })).toThrow();

    const hostile: Record<string, unknown> = { kind: "dataMatrix", schemaVersion: 1, encoding: "binary-bytes", rows: 12, columns: 12, quietSpace: 2 };
    Object.defineProperty(hostile, "message", { enumerable: true, get: () => { throw new Error("executed"); } });
    expect(() => IFXBarcodeDescriptor.fromData(hostile)).toThrow(TypeError);
  });
});
