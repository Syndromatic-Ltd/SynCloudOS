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
import { finiteExtent } from "../extent";
import { expanded, fields, finiteInput, luma, number, processor, straight, type Definition } from "./common";

export const resampling: Record<string, Definition> = {};

function requiredNumber(value: unknown, min: number, max: number): number {
  return number(value, Number.NaN, min, max);
}

function cubicWeight(value: number, b: number, c: number): number {
  const x = Math.abs(value);
  if (x < 1) return ((12 - 9 * b - 6 * c) * x ** 3 + (-18 + 12 * b + 6 * c) * x ** 2 + 6 - 2 * b) / 6;
  if (x < 2) return ((-b - 6 * c) * x ** 3 + (6 * b + 30 * c) * x ** 2 + (-12 * b - 48 * c) * x + 8 * b + 24 * c) / 6;
  return 0;
}

resampling.bicubicScaleTransform = {
  category: "geometry",
  inputs: 1,
  normalise: value => {
    const p = fields(value, ["scale", "aspectRatio", "parameterB", "parameterC"]);
    return {
      scale: requiredNumber(p.scale, 0.25, 4),
      aspectRatio: requiredNumber(p.aspectRatio, 0.25, 4),
      parameterB: requiredNumber(p.parameterB, -2, 2),
      parameterC: requiredNumber(p.parameterC, -2, 2),
    };
  },
  build: (inputs, p) => {
    const source = finiteInput(inputs[0]!);
    const sy = p.scale as number, sx = sy * (p.aspectRatio as number), b = p.parameterB as number, c = p.parameterC as number;
    const output = { x: source.x * sx, y: source.y * sy, width: source.width * sx, height: source.height * sy };
    return processor("bicubicScaleTransform", p, finiteExtent(output), (position, access) => {
      const q = { x: position.x / sx, y: position.y / sy };
      const ix = Math.floor(q.x - source.x - 0.5), iy = Math.floor(q.y - source.y - 0.5);
      let total = 0, r = 0, g = 0, blue = 0, a = 0;
      for (let oy = -1; oy <= 2; oy++) for (let ox = -1; ox <= 2; ox++) {
        const px = source.x + ix + ox + 0.5, py = source.y + iy + oy + 0.5;
        const weight = cubicWeight(q.x - px, b, c) * cubicWeight(q.y - py, b, c);
        if (weight === 0) continue;
        const sample = access.sampleWithin(0, { x: px, y: py }, source, "nearest");
        total += weight; r += sample.r * weight; g += sample.g * weight; blue += sample.b * weight; a += sample.a * weight;
      }
      if (Math.abs(total) < 1e-12) return { r: 0, g: 0, b: 0, a: 0 };
      return { r: r / total, g: g / total, b: blue / total, a: a / total };
    }, bounds => [expanded({ x: bounds.x / sx, y: bounds.y / sy, width: bounds.width / sx, height: bounds.height / sy }, 2)]);
  },
};

function mapPoint(point: GFXPoint, from: GFXRect, to: GFXRect): GFXPoint {
  return {
    x: to.x + ((point.x - from.x) / from.width) * to.width,
    y: to.y + ((point.y - from.y) / from.height) * to.height,
  };
}

function mapRect(rect: GFXRect, from: GFXRect, to: GFXRect): GFXRect {
  const p0 = mapPoint({ x: rect.x, y: rect.y }, from, to), p1 = mapPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, from, to);
  return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), width: Math.abs(p1.x - p0.x), height: Math.abs(p1.y - p0.y) };
}

resampling.edgePreserveUpsample = {
  category: "geometry",
  inputs: 2,
  normalise: value => {
    const p = fields(value, ["spatialSigma", "lumaSigma"]);
    return { spatialSigma: requiredNumber(p.spatialSigma, 0.05, 4), lumaSigma: requiredNumber(p.lumaSigma, 0.001, 2) };
  },
  build: (inputs, p) => {
    const guide = finiteInput(inputs[0]!), small = finiteInput(inputs[1]!);
    const spatialSigma = p.spatialSigma as number, lumaSigma = p.lumaSigma as number, radius = Math.min(8, Math.max(1, Math.ceil(spatialSigma * 2)));
    return processor("edgePreserveUpsample", p, finiteExtent(guide), (position, access) => {
      const target = mapPoint(position, guide, small);
      const baseX = Math.floor(target.x - small.x - 0.5), baseY = Math.floor(target.y - small.y - 0.5);
      const guideCentre = luma(straight(access.sampleWithin(0, position, guide)));
      let weightTotal = 0, r = 0, g = 0, blue = 0, a = 0;
      for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
        const smallPoint = { x: small.x + baseX + ox + 0.5, y: small.y + baseY + oy + 0.5 };
        if (smallPoint.x < small.x || smallPoint.x >= small.x + small.width || smallPoint.y < small.y || smallPoint.y >= small.y + small.height) continue;
        const guidePoint = mapPoint(smallPoint, small, guide);
        const guideNeighbour = luma(straight(access.sampleWithin(0, guidePoint, guide)));
        const ds = (smallPoint.x - target.x) ** 2 + (smallPoint.y - target.y) ** 2;
        const dl = guideNeighbour - guideCentre;
        const weight = Math.exp(-ds / (2 * spatialSigma ** 2) - dl ** 2 / (2 * lumaSigma ** 2));
        const colour = access.sampleWithin(1, smallPoint, small, "nearest");
        weightTotal += weight; r += colour.r * weight; g += colour.g * weight; blue += colour.b * weight; a += colour.a * weight;
      }
      if (weightTotal <= 1e-12) return access.sampleWithin(1, target, small, "nearest");
      return { r: r / weightTotal, g: g / weightTotal, b: blue / weightTotal, a: a / weightTotal };
    }, bounds => {
      const smallBounds = expanded(mapRect(bounds, guide, small), radius + 1);
      const guideRadiusX = (radius + 1) * guide.width / small.width, guideRadiusY = (radius + 1) * guide.height / small.height;
      return [expanded(bounds, Math.max(guideRadiusX, guideRadiusY)), smallBounds];
    });
  },
};

function normaliseCalibration(value: unknown) {
  const p = fields(value, ["focalLength", "baseline", "depthScale", "disparityScale"]);
  return {
    focalLength: requiredNumber(p.focalLength, 1e-6, 1e6),
    baseline: requiredNumber(p.baseline, 1e-9, 1e6),
    depthScale: requiredNumber(p.depthScale, 1e-9, 1e9),
    disparityScale: requiredNumber(p.disparityScale, 1e-9, 1e9),
  };
}

for (const name of ["depthToDisparity", "disparityToDepth"] as const) {
  resampling[name] = {
    category: "geometry",
    inputs: 1,
    normalise: normaliseCalibration,
    build: (inputs, p) => {
      const source = finiteInput(inputs[0]!);
      const product = (p.focalLength as number) * (p.baseline as number), depthScale = p.depthScale as number, disparityScale = p.disparityScale as number;
      return processor(name, p, finiteExtent(source), (position, access) => {
        const input = straight(access.sampleWithin(0, position, source));
        const raw = input.r;
        let output = 0;
        if (raw > 0) {
          output = name === "depthToDisparity"
            ? product / (raw * depthScale) / disparityScale
            : product / (raw * disparityScale) / depthScale;
        }
        return { r: output * input.a, g: output * input.a, b: output * input.a, a: input.a };
      }, bounds => [bounds]);
    },
  };
}
