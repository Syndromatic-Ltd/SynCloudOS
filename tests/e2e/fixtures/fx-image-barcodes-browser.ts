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
  IFXFilterGraph,
  IFXFilterRegistry,
  IFXSampler,
  type IFXImage,
} from "../../../src/FX/ImageFX/public";

type MatrixFormat = "aztec" | "pdf417" | "dataMatrix";

function decode(image: IFXImage, format: MatrixFormat): string {
  if (image.extent.kind !== "finite")
    throw new Error("Expected finite barcode output.");
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
  if (format === "aztec")
    return new AztecCodeReader().decode(bitmap, hints).getText();
  if (format === "pdf417")
    return new PDF417Reader().decode(bitmap, hints).getText();
  return new DataMatrixReader().decode(bitmap, hints).getText();
}

export function runBarcodeBrowserSpecimen() {
  const registry = new IFXFilterRegistry();
  const aztecDescriptor = new IFXAztecCodeDescriptor(
    Array.from(new TextEncoder().encode("SynCloudOS browser Aztec")),
    { correctionLevel: 23, layers: 3, compactStyle: true, quietSpace: 2 },
  );
  const aztec = registry.create("barcodeGenerator", { barcodeDescriptor: aztecDescriptor.toData() }).apply();
  const restoredAztec = IFXFilterGraph.deserialize(JSON.parse(JSON.stringify(new IFXFilterGraph(aztec).serialize()))).output;
  const pdf417 = registry.create("pdf417BarcodeGenerator", {
    message: Array.from(new TextEncoder().encode("SynCloudOS browser PDF417")),
    correctionLevel: 2,
    dataColumns: 4,
    rows: 8,
    compactStyle: false,
    quietSpace: 2,
  }).apply();
  const dataMatrix = registry.create("dataMatrixCodeGenerator", {
    message: Array.from(new TextEncoder().encode("SynCloudOS DM")),
    rows: 18,
    columns: 18,
    quietSpace: 2,
  }).apply();
  return {
    registryCount: registry.names().length,
    registryNames: registry.names(),
    aztec: decode(restoredAztec, "aztec"),
    pdf417: decode(pdf417, "pdf417"),
    dataMatrix: decode(dataMatrix, "dataMatrix"),
    aztecExtent: aztec.extent,
    pdf417Extent: pdf417.extent,
    dataMatrixExtent: dataMatrix.extent,
    descriptor: aztecDescriptor.toData(),
  };
}
