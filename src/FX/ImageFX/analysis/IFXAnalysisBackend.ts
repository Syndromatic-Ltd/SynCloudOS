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
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  NotFoundException,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import type { GFXPoint, GFXRect } from "../../GraphicsFX/GFXGeometry";
import type { IFXFeature, IFXFeatureKind, IFXQRCodeFeature, IFXRectangleFeature } from "./IFXFeature";

export type IFXAnalysisCapabilityName = IFXFeatureKind | "core-ml-model" | "person-segmentation" | "saliency-map";
export type IFXAnalysisOrientation = "up" | "right" | "down" | "left";

export interface IFXAnalysisCapability {
  readonly name: IFXAnalysisCapabilityName;
  readonly state: "available" | "unsupported";
  readonly version?: number;
  readonly backend?: string;
  readonly model?: Readonly<{ id: string; version: number; sha256: string }>;
  readonly reason?: string;
}

export interface IFXAnalysisRaster {
  readonly width: number;
  readonly height: number;
  readonly luminance: Uint8ClampedArray;
  readonly rgba: Uint8ClampedArray;
  readonly mapPointToSource: (point: GFXPoint) => GFXPoint;
}

export interface IFXAnalysisBackend {
  readonly id: string;
  readonly capabilities: readonly IFXAnalysisCapability[];
  detect(raster: IFXAnalysisRaster, features: readonly IFXFeatureKind[], signal: AbortSignal): Promise<readonly IFXFeature[]>;
}

export class IFXUnsupportedAnalysisError extends Error {
  readonly name = "IFXUnsupportedAnalysisError";
  constructor(readonly capability: IFXAnalysisCapabilityName) {
    super(`Image analysis capability '${capability}' is unsupported by the configured backends.`);
  }
}

export class IFXAnalysisExecutionError extends Error {
  readonly name = "IFXAnalysisExecutionError";
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

function boundsForCorners(corners: readonly GFXPoint[]): GFXRect {
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function rectangleFeatures(raster: IFXAnalysisRaster, signal: AbortSignal): readonly IFXRectangleFeature[] {
  const { width, height, luminance } = raster;
  let darkest = 255, brightest = 0;
  for (let index = 0; index < luminance.length; index++) {
    if ((index & 4095) === 0) signal.throwIfAborted();
    const value = luminance[index]!;
    darkest = Math.min(darkest, value);
    brightest = Math.max(brightest, value);
  }
  if (brightest - darkest < 24) return Object.freeze([]);
  const threshold = darkest + (brightest - darkest) * .45;
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height), features: IFXRectangleFeature[] = [];
  const dark = (index: number) => luminance[index]! <= threshold;
  for (let start = 0; start < luminance.length; start++) {
    if ((start & 2047) === 0) signal.throwIfAborted();
    if (visited[start] || !dark(start)) continue;
    let head = 0, tail = 0, count = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    while (head < tail) {
      const index = queue[head++]!, x = index % width, y = Math.floor(index / width);
      count += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if ((count & 2047) === 0) signal.throwIfAborted();
      const visit = (candidate: number) => {
        if (!visited[candidate] && dark(candidate)) { visited[candidate] = 1; queue[tail++] = candidate; }
      };
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
    const componentWidth = maxX - minX + 1, componentHeight = maxY - minY + 1;
    if (componentWidth < 3 || componentHeight < 3 || count < 9) continue;
    const density = count / (componentWidth * componentHeight);
    if (density < .72) continue;
    const analysisCorners = [
      { x: minX, y: minY },
      { x: maxX + 1, y: minY },
      { x: maxX + 1, y: maxY + 1 },
      { x: minX, y: maxY + 1 },
    ] as const;
    const corners = Object.freeze(analysisCorners.map(raster.mapPointToSource));
    features.push(Object.freeze({
      kind: "rectangle",
      bounds: boundsForCorners(corners),
      corners,
      confidence: Math.min(1, density),
      backend: "portable-analysis",
      backendVersion: 1,
    }));
  }
  features.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x || b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height);
  return Object.freeze(features);
}

function qrFeature(raster: IFXAnalysisRaster, signal: AbortSignal): IFXQRCodeFeature | null {
  signal.throwIfAborted();
  const border = 4, scale = 4, width = (raster.width + border * 2) * scale, height = (raster.height + border * 2) * scale;
  const luminance = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < raster.height; y++) {
    if ((y & 31) === 0) signal.throwIfAborted();
    for (let x = 0; x < raster.width; x++) {
      const value = raster.luminance[y * raster.width + x]!;
      for (let dy = 0; dy < scale; dy++) {
        const row = ((y + border) * scale + dy) * width + (x + border) * scale;
        luminance.fill(value, row, row + scale);
      }
    }
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)));
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
  try {
    const result = new QRCodeReader().decode(bitmap, hints), points = result.getResultPoints();
    const analysisPoints = points.map(point => Object.freeze({ x: point.getX() / scale - border, y: point.getY() / scale - border }));
    const corners = Object.freeze(analysisPoints.map(raster.mapPointToSource));
    return Object.freeze({
      kind: "qr",
      bounds: boundsForCorners(corners),
      corners,
      confidence: 1,
      backend: "portable-analysis",
      backendVersion: 1,
      payload: result.getText(),
      rawBytes: new Uint8Array(result.getRawBytes() ?? []),
    });
  } catch (error) {
    if (error instanceof NotFoundException || (error instanceof Error && error.name === "NotFoundException")) return null;
    throw new IFXAnalysisExecutionError("QR analysis failed after locating a candidate symbol.", error);
  }
}

export class IFXPortableAnalysisBackend implements IFXAnalysisBackend {
  readonly id = "portable-analysis";
  readonly capabilities = Object.freeze([
    Object.freeze({ name: "rectangle" as const, state: "available" as const, version: 1, backend: this.id }),
    Object.freeze({ name: "qr" as const, state: "available" as const, version: 1, backend: this.id }),
  ]);
  async detect(raster: IFXAnalysisRaster, features: readonly IFXFeatureKind[], signal: AbortSignal): Promise<readonly IFXFeature[]> {
    signal.throwIfAborted();
    const output: IFXFeature[] = [];
    if (features.includes("rectangle")) output.push(...rectangleFeatures(raster, signal));
    if (features.includes("qr")) {
      const qr = qrFeature(raster, signal);
      if (qr) output.push(qr);
    }
    signal.throwIfAborted();
    return Object.freeze(output);
  }
}
