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

import type { GFXPoint, GFXRect } from "../../GraphicsFX/GFXGeometry";
import type { IFXFaceFeature, IFXFeature, IFXFeatureKind, IFXTextRegionFeature } from "./IFXFeature";
import type { IFXAnalysisBackend, IFXAnalysisCapability, IFXAnalysisRaster } from "./IFXAnalysisBackend";
import {
  IFXPortableModelBackend,
  normaliseIFXModelAsset,
  type IFXModelAsset,
  type IFXModelBackend,
  type IFXModelPurpose,
  type IFXModelSession,
} from "./IFXModelBackend";

export interface IFXModelFeatureConfiguration {
  readonly model: IFXModelAsset;
  readonly threshold: number;
  readonly minimumPixels: number;
}

export interface IFXModelAnalysisBackendOptions {
  readonly backend?: IFXModelBackend;
  readonly face?: IFXModelFeatureConfiguration;
  readonly textRegion?: IFXModelFeatureConfiguration;
}

type LearnedKind = "face" | "text-region";
type Configuration = Readonly<{ model: IFXModelAsset; threshold: number; minimumPixels: number }>;

function boundsForCorners(corners: readonly GFXPoint[]): GFXRect {
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

function configuration(value: unknown, purpose: IFXModelPurpose): Configuration | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length)
    throw new TypeError("Model-analysis configuration must contain plain data.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== 3 || !["model", "threshold", "minimumPixels"].every(key => descriptors[key] && "value" in descriptors[key]!))
    throw new TypeError("Model-analysis configuration is invalid.");
  const model = normaliseIFXModelAsset((descriptors.model as PropertyDescriptor & { value: unknown }).value);
  if (model.purpose !== purpose) throw new TypeError(`Model-analysis purpose must be '${purpose}'.`);
  if (model.heads.length !== 1 || model.heads[0]?.channels !== 1 || model.heads[0]?.activation !== "sigmoid")
    throw new TypeError("Feature-analysis model must expose one sigmoid mask head.");
  const threshold = (descriptors.threshold as PropertyDescriptor & { value: unknown }).value;
  const minimumPixels = (descriptors.minimumPixels as PropertyDescriptor & { value: unknown }).value;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) throw new RangeError("Model-analysis threshold must be between zero and one.");
  if (!Number.isSafeInteger(minimumPixels) || (minimumPixels as number) < 1 || (minimumPixels as number) > 2 * 1024 * 1024)
    throw new RangeError("Model-analysis minimum pixel count is invalid.");
  return Object.freeze({ model, threshold, minimumPixels: minimumPixels as number });
}

function backend(value: unknown): IFXModelBackend {
  if (value === undefined) return new IFXPortableModelBackend();
  if (!value || typeof value !== "object" || typeof (value as IFXModelBackend).id !== "string" || !Number.isSafeInteger((value as IFXModelBackend).version) || typeof (value as IFXModelBackend).load !== "function")
    throw new TypeError("Model backend must implement IFXModelBackend.");
  return value as IFXModelBackend;
}

async function checkpoint(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

async function probabilities(raster: IFXAnalysisRaster, session: IFXModelSession, signal: AbortSignal): Promise<Float32Array> {
  if (session.heads.length !== 1 || session.heads[0]?.channels !== 1) throw new TypeError("Feature-analysis session must expose one mask head.");
  const count = raster.width * raster.height, output = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    if ((index & 4095) === 0) await checkpoint(signal);
    const offset = index * 4;
    const result = session.evaluate(Object.freeze([
      raster.rgba[offset]! / 255,
      raster.rgba[offset + 1]! / 255,
      raster.rgba[offset + 2]! / 255,
      raster.rgba[offset + 3]! / 255,
    ]), 0);
    const probability = result[0];
    if (typeof probability !== "number" || !Number.isFinite(probability)) throw new TypeError("Feature-analysis model returned an invalid probability.");
    output[index] = probability;
  }
  signal.throwIfAborted();
  return output;
}

function componentFeatures(
  kind: LearnedKind,
  raster: IFXAnalysisRaster,
  scores: Float32Array,
  threshold: number,
  minimumPixels: number,
  backendId: string,
  backendVersion: number,
  signal: AbortSignal,
): readonly (IFXFaceFeature | IFXTextRegionFeature)[] {
  const width = raster.width, height = raster.height, count = width * height;
  const visited = new Uint8Array(count), queue = new Int32Array(count);
  const output: (IFXFaceFeature | IFXTextRegionFeature)[] = [];
  for (let seed = 0; seed < count; seed++) {
    if ((seed & 4095) === 0) signal.throwIfAborted();
    if (visited[seed] || scores[seed]! < threshold) continue;
    let head = 0, tail = 0, pixels = 0, confidence = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    queue[tail++] = seed;
    visited[seed] = 1;
    while (head < tail) {
      const index = queue[head++]!, y = Math.floor(index / width), x = index - y * width;
      pixels++;
      confidence += scores[index]!;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const candidates = [index - 1, index + 1, index - width, index + width];
      for (let direction = 0; direction < 4; direction++) {
        const next = candidates[direction]!;
        if (next < 0 || next >= count || visited[next] || scores[next]! < threshold) continue;
        if (direction === 0 && x === 0 || direction === 1 && x === width - 1) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (pixels < minimumPixels) continue;
    const analysisCorners = [
      { x: minX, y: minY },
      { x: maxX + 1, y: minY },
      { x: maxX + 1, y: maxY + 1 },
      { x: minX, y: maxY + 1 },
    ] as const;
    const corners = Object.freeze(analysisCorners.map(raster.mapPointToSource));
    const feature = Object.freeze({
      kind,
      bounds: boundsForCorners(corners),
      corners,
      confidence: confidence / pixels,
      backend: backendId,
      backendVersion,
    });
    output.push(feature as IFXFaceFeature | IFXTextRegionFeature);
  }
  output.sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
  return Object.freeze(output);
}

export class IFXModelAnalysisBackend implements IFXAnalysisBackend {
  readonly id = "portable-model-analysis";
  readonly capabilities: readonly IFXAnalysisCapability[];
  readonly #backend: IFXModelBackend;
  readonly #face?: Configuration;
  readonly #textRegion?: Configuration;

  constructor(options: IFXModelAnalysisBackendOptions = {}) {
    if (!options || typeof options !== "object") throw new TypeError("Model-analysis options must be an object.");
    this.#backend = backend(options.backend);
    this.#face = configuration(options.face, "face-mask");
    this.#textRegion = configuration(options.textRegion, "text-region-mask");
    const capabilities: IFXAnalysisCapability[] = [];
    if (this.#face) capabilities.push(Object.freeze({
      name: "face",
      state: "available",
      version: 1,
      backend: this.id,
      model: Object.freeze({ id: this.#face.model.id, version: this.#face.model.version, sha256: this.#face.model.sha256 }),
    }));
    if (this.#textRegion) capabilities.push(Object.freeze({
      name: "text-region",
      state: "available",
      version: 1,
      backend: this.id,
      model: Object.freeze({ id: this.#textRegion.model.id, version: this.#textRegion.model.version, sha256: this.#textRegion.model.sha256 }),
    }));
    this.capabilities = Object.freeze(capabilities);
    Object.freeze(this);
  }

  async detect(raster: IFXAnalysisRaster, features: readonly IFXFeatureKind[], signal: AbortSignal): Promise<readonly IFXFeature[]> {
    if (!(signal instanceof AbortSignal)) throw new TypeError("AbortSignal required.");
    if (raster.rgba.length !== raster.width * raster.height * 4) throw new TypeError("Model-analysis RGBA raster is invalid.");
    const output: IFXFeature[] = [];
    const requests: readonly Readonly<{ kind: LearnedKind; configuration?: Configuration }>[] = Object.freeze([
      Object.freeze({ kind: "face", configuration: this.#face }),
      Object.freeze({ kind: "text-region", configuration: this.#textRegion }),
    ]);
    for (const request of requests) {
      if (!features.includes(request.kind) || !request.configuration) continue;
      signal.throwIfAborted();
      const session = await this.#backend.load(request.configuration.model, { checkpoint: () => checkpoint(signal) });
      signal.throwIfAborted();
      if (session.purpose !== request.configuration.model.purpose) throw new TypeError("Model backend returned a session for the wrong purpose.");
      const scores = await probabilities(raster, session, signal);
      signal.throwIfAborted();
      output.push(...componentFeatures(request.kind, raster, scores, request.configuration.threshold, request.configuration.minimumPixels, this.id, 1, signal));
    }
    signal.throwIfAborted();
    return Object.freeze(output);
  }
}
