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

import { normaliseRect, type GFXPoint, type GFXRect } from "../../GraphicsFX/GFXGeometry";
import type { GFXImage } from "../../GraphicsFX/GFXImage";
import { IFXContext } from "../IFXContext";
import { IFXImage } from "../IFXImage";
import {
  IFXPortableAnalysisBackend,
  IFXUnsupportedAnalysisError,
  type IFXAnalysisBackend,
  type IFXAnalysisCapability,
  type IFXAnalysisCapabilityName,
  type IFXAnalysisOrientation,
  type IFXAnalysisRaster,
} from "./IFXAnalysisBackend";
import type { IFXFeature, IFXFeatureKind } from "./IFXFeature";

export interface IFXDetectorOptions {
  readonly maximumPixels?: number;
  readonly backends?: readonly IFXAnalysisBackend[];
}

export interface IFXDetectionRequest {
  readonly features: readonly IFXFeatureKind[];
  readonly crop?: GFXRect;
  readonly orientation?: IFXAnalysisOrientation;
  readonly signal?: AbortSignal;
}

const allCapabilityNames: readonly IFXAnalysisCapabilityName[] = Object.freeze([
  "rectangle", "qr", "text-region", "face", "core-ml-model", "person-segmentation", "saliency-map",
]);

function maximumPixels(value: number | undefined): number {
  const selected = value ?? 1024 * 1024;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > 2 * 1024 * 1024) throw new RangeError("Invalid analysis pixel budget.");
  return selected;
}

function requestFeatures(value: readonly IFXFeatureKind[]): readonly IFXFeatureKind[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) throw new TypeError("At least one bounded feature kind is required.");
  const result: IFXFeatureKind[] = [];
  for (const feature of value) {
    if (!["rectangle", "qr", "text-region", "face"].includes(feature)) throw new TypeError("Unknown feature kind.");
    if (!result.includes(feature)) result.push(feature);
  }
  return Object.freeze(result);
}

function orientation(value: IFXAnalysisOrientation | undefined): IFXAnalysisOrientation {
  const selected = value ?? "up";
  if (!["up", "right", "down", "left"].includes(selected)) throw new TypeError("Unsupported image analysis orientation.");
  return selected;
}

function analysisRaster(image: GFXImage, sourceRect: GFXRect, value: IFXAnalysisOrientation, signal: AbortSignal): IFXAnalysisRaster {
  const width = value === "right" || value === "left" ? image.height : image.width;
  const height = value === "right" || value === "left" ? image.width : image.height;
  const luminance = new Uint8ClampedArray(width * height), rgba = new Uint8ClampedArray(width * height * 4);
  const rawPixel = (x: number, y: number) => {
    if (value === "up") return image.pixel(x, y);
    if (value === "right") return image.pixel(y, image.height - 1 - x);
    if (value === "down") return image.pixel(image.width - 1 - x, image.height - 1 - y);
    return image.pixel(image.width - 1 - y, x);
  };
  for (let y = 0; y < height; y++) {
    if ((y & 31) === 0) signal.throwIfAborted();
    for (let x = 0; x < width; x++) {
      const pixel = rawPixel(x, y);
      luminance[y * width + x] = Math.round((.2126 * pixel.r + .7152 * pixel.g + .0722 * pixel.b) * pixel.a * 255 + (1 - pixel.a) * 255);
      const offset = (y * width + x) * 4;
      rgba[offset] = Math.round(Math.max(0, Math.min(1, pixel.r)) * 255);
      rgba[offset + 1] = Math.round(Math.max(0, Math.min(1, pixel.g)) * 255);
      rgba[offset + 2] = Math.round(Math.max(0, Math.min(1, pixel.b)) * 255);
      rgba[offset + 3] = Math.round(Math.max(0, Math.min(1, pixel.a)) * 255);
    }
  }
  const mapPointToSource = (point: GFXPoint): GFXPoint => {
    let x: number, y: number;
    if (value === "up") { x = point.x; y = point.y; }
    else if (value === "right") { x = point.y; y = image.height - point.x; }
    else if (value === "down") { x = image.width - point.x; y = image.height - point.y; }
    else { x = image.width - point.y; y = point.x; }
    return Object.freeze({ x: sourceRect.x + x, y: sourceRect.y + y });
  };
  return Object.freeze({ width, height, luminance, rgba, mapPointToSource });
}

export class IFXDetector {
  readonly #maximumPixels: number;
  readonly #backends: readonly IFXAnalysisBackend[];
  constructor(options: IFXDetectorOptions = {}) {
    if (!options || typeof options !== "object") throw new TypeError("IFXDetector options must be an object.");
    this.#maximumPixels = maximumPixels(options.maximumPixels);
    const extra = options.backends ?? [];
    if (!Array.isArray(extra) || extra.some(backend => !backend || typeof backend !== "object" || typeof backend.detect !== "function")) throw new TypeError("Analysis backends must implement IFXAnalysisBackend.");
    this.#backends = Object.freeze([new IFXPortableAnalysisBackend(), ...extra]);
  }

  capability(name: IFXAnalysisCapabilityName): IFXAnalysisCapability {
    if (!allCapabilityNames.includes(name)) throw new TypeError("Unknown image analysis capability.");
    for (const backend of this.#backends) {
      const capability = backend.capabilities.find(candidate => candidate.name === name && candidate.state === "available");
      if (capability) return capability;
    }
    return Object.freeze({ name, state: "unsupported", reason: "No reviewed backend is configured for this capability." });
  }

  async detect(image: IFXImage, request: IFXDetectionRequest): Promise<readonly IFXFeature[]> {
    if (!(image instanceof IFXImage)) throw new TypeError("Authentic IFXImage required.");
    if (!request || typeof request !== "object") throw new TypeError("Detection request required.");
    const features = requestFeatures(request.features), selectedOrientation = orientation(request.orientation);
    const signal = request.signal ?? new AbortController().signal;
    if (!(signal instanceof AbortSignal)) throw new TypeError("AbortSignal required.");
    signal.throwIfAborted();
    const selectedBackends = new Map<IFXAnalysisBackend, IFXFeatureKind[]>();
    for (const feature of features) {
      const backend = this.#backends.find(candidate => candidate.capabilities.some(capability => capability.name === feature && capability.state === "available"));
      if (!backend) throw new IFXUnsupportedAnalysisError(feature);
      const list = selectedBackends.get(backend) ?? [];
      list.push(feature);
      selectedBackends.set(backend, list);
    }
    if (image.extent.kind !== "finite" || image.extent.rect.width <= 0 || image.extent.rect.height <= 0) throw new RangeError("Feature analysis requires a nonempty finite image.");
    let target = image, sourceRect = image.extent.rect;
    if (request.crop !== undefined) {
      const crop = normaliseRect(request.crop);
      target = image.cropped(crop);
      if (target.extent.kind !== "finite" || target.extent.rect.width <= 0 || target.extent.rect.height <= 0) return Object.freeze([]);
      sourceRect = target.extent.rect;
    }
    const pixels = Math.ceil(sourceRect.width) * Math.ceil(sourceRect.height);
    if (!Number.isSafeInteger(pixels) || pixels > this.#maximumPixels) throw new RangeError("Image analysis pixel budget exceeded.");
    const sampleBudget = Math.min(2 * 1024 * 1024, Math.max(1, pixels * 8));
    const context = new IFXContext("srgb", sampleBudget, { outputBytes: pixels * 4, work: Math.max(32, sampleBudget * 32) });
    try {
      const rendered = await context.render(target, undefined, { signal, interpolation: "nearest" });
      signal.throwIfAborted();
      const raster = analysisRaster(rendered.image, sourceRect, selectedOrientation, signal), output: IFXFeature[] = [];
      for (const [backend, kinds] of selectedBackends) {
        signal.throwIfAborted();
        output.push(...await backend.detect(raster, Object.freeze(kinds), signal));
      }
      signal.throwIfAborted();
      return Object.freeze(output);
    } finally {
      context.dispose();
    }
  }
}
