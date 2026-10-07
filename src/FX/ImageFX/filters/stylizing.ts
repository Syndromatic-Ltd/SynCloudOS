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
import { GFXColourTransform } from "../../GraphicsFX/GFXColourTransform";
import { GFXPath } from "../../GraphicsFX/GFXPath";
import type { GFXPathCommand } from "../../GraphicsFX/graphicsTypes";
import { finiteExtent, pixelRect } from "../extent";
import type { IFXPremultipliedSample as Sample } from "../IFXSampler";
import type { ProcessingAccess, ProcessingPreparationAccess } from "../processing";
import {
  clamp, colour, expanded, expandedExtent, fields, finiteInput, integer, luma,
  number, point, premult, processor, rect, straight, tuple, type Definition,
} from "./common";

export const stylizing: Record<string, Definition> = {};

const signed = (value: number) => Math.max(-1, Math.min(1, value));
const requiredNumber = (value: unknown, min = -1e6, max = 1e6) => number(value, Number.NaN, min, max);
const requiredInteger = (value: unknown, min: number, max: number) => integer(value, Number.NaN, min, max);
function requiredPoint(value: unknown): GFXPoint {
  if (value === undefined) throw new TypeError("Required procedural point parameter is missing.");
  return point(value);
}
function requiredRect(value: unknown): GFXRect {
  if (value === undefined) throw new TypeError("Required procedural extent parameter is missing.");
  const result = rect(value);
  if (result.width <= 0 || result.height <= 0) throw new RangeError("Procedural extent must be nonempty.");
  return result;
}
function requiredColour(value: unknown): readonly number[] {
  if (value === undefined) throw new TypeError("Required procedural color parameter is missing.");
  return colour(value, [0, 0, 0, 0]);
}
function requiredSeed(value: unknown): number {
  if (value === undefined) throw new TypeError("A deterministic seed is required.");
  return integer(value, Number.NaN, -0x7fffffff, 0x7fffffff);
}
function tinted(value: readonly number[], alpha: number): Sample {
  const a = clamp(value[3]! * alpha);
  return { r: clamp(value[0]!) * a, g: clamp(value[1]!) * a, b: clamp(value[2]!) * a, a };
}
const fract = (value: number) => value - Math.floor(value);
const noise = (x: number, y: number, seed: number) => fract(Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453123);
function distanceToSegment(p: GFXPoint, a: GFXPoint, b: GFXPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length2);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
function localMean(access: ProcessingAccess, position: GFXPoint, radius: number): Sample {
  if (radius <= 0) return access.sample(0, position);
  const result = { r: 0, g: 0, b: 0, a: 0 };
  for (const y of [-1, 0, 1]) for (const x of [-1, 0, 1]) {
    const value = access.sample(0, { x: position.x + x * radius, y: position.y + y * radius });
    result.r += value.r / 9; result.g += value.g / 9; result.b += value.b / 9; result.a += value.a / 9;
  }
  return result;
}
function gradient(access: ProcessingAccess, position: GFXPoint, radius = 1) {
  const left = luma(straight(access.sample(0, { x: position.x - radius, y: position.y })));
  const right = luma(straight(access.sample(0, { x: position.x + radius, y: position.y })));
  const up = luma(straight(access.sample(0, { x: position.x, y: position.y - radius })));
  const down = luma(straight(access.sample(0, { x: position.x, y: position.y + radius })));
  const x = (right - left) / 2, y = (down - up) / 2;
  return { x, y, magnitude: Math.hypot(x, y) };
}

stylizing.blurredRectangle = {
  category: "generator", inputs: 0,
  normalise: value => {
    const p = fields(value, ["color", "extent", "sigma"]);
    return { color: requiredColour(p.color), extent: requiredRect(p.extent), sigma: requiredNumber(p.sigma, 0, 1e3) };
  },
  build: (_inputs, p) => {
    const box = p.extent as GFXRect, sigma = p.sigma as number, margin = Math.ceil(3 * sigma);
    const output = { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 };
    return processor("blurredRectangle", p, finiteExtent(output), position => {
      const dx = Math.max(box.x - position.x, 0, position.x - (box.x + box.width));
      const dy = Math.max(box.y - position.y, 0, position.y - (box.y + box.height));
      const distance = Math.hypot(dx, dy);
      const alpha = sigma === 0 ? (distance === 0 ? 1 : 0) : Math.exp(-(distance * distance) / (2 * sigma * sigma));
      return tinted(p.color as readonly number[], alpha);
    }, () => []);
  },
};

function roundedRectDistance(position: GFXPoint, box: GFXRect, radius: number): number {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const halfX = Math.max(0, box.width / 2 - radius), halfY = Math.max(0, box.height / 2 - radius);
  const qx = Math.abs(position.x - cx) - halfX, qy = Math.abs(position.y - cy) - halfY;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
stylizing.roundedRectangleStroke = {
  category: "generator", inputs: 0,
  normalise: value => {
    const p = fields(value, ["color", "extent", "radius", "width", "smoothness"]);
    return {
      color: requiredColour(p.color), extent: requiredRect(p.extent), radius: requiredNumber(p.radius, 0, 1e4),
      width: requiredNumber(p.width, 1e-6, 1e4), smoothness: requiredNumber(p.smoothness, 0, 1e3),
    };
  },
  build: (_inputs, p) => {
    const box = p.extent as GFXRect, width = p.width as number, smoothness = p.smoothness as number, margin = width / 2 + smoothness;
    const output = { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin };
    return processor("roundedRectangleStroke", p, finiteExtent(output), position => {
      const distance = Math.abs(roundedRectDistance(position, box, p.radius as number));
      const alpha = smoothness === 0 ? Number(distance <= width / 2) : clamp((width / 2 + smoothness - distance) / smoothness);
      return tinted(p.color as readonly number[], alpha);
    }, () => []);
  },
};

function meshPoints(value: unknown): readonly GFXPoint[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 2 || value.length > 256 || value.length % 2 !== 0)
    throw new TypeError("Mesh must be a bounded plain array of point pairs.");
  return Object.freeze(value.map(requiredPoint));
}
stylizing.mesh = {
  category: "generator", inputs: 0,
  normalise: value => {
    const p = fields(value, ["color", "mesh", "width"]);
    return { color: requiredColour(p.color), mesh: meshPoints(p.mesh), width: requiredNumber(p.width, 1e-6, 1e4) };
  },
  build: (_inputs, p) => {
    const points = p.mesh as readonly GFXPoint[], width = p.width as number, xs = points.map(v => v.x), ys = points.map(v => v.y), margin = width / 2;
    const bounds = { x: Math.min(...xs) - margin, y: Math.min(...ys) - margin, width: Math.max(...xs) - Math.min(...xs) + width, height: Math.max(...ys) - Math.min(...ys) + width };
    return processor("mesh", p, finiteExtent(bounds), position => {
      let distance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < points.length; index += 2) distance = Math.min(distance, distanceToSegment(position, points[index]!, points[index + 1]!));
      return tinted(p.color as readonly number[], clamp(1 - distance / Math.max(width / 2, 1e-9)));
    }, () => []);
  },
};

stylizing.lenticularHalo = {
  category: "generator", inputs: 0,
  normalise: value => {
    const p = fields(value, ["center", "color", "haloOverlap", "haloRadius", "haloWidth", "striationContrast", "striationStrength", "time"]);
    return {
      center: requiredPoint(p.center), color: requiredColour(p.color), haloOverlap: requiredNumber(p.haloOverlap, 0, 1),
      haloRadius: requiredNumber(p.haloRadius, 1e-6, 1e4), haloWidth: requiredNumber(p.haloWidth, 1e-6, 1e4),
      striationContrast: requiredNumber(p.striationContrast, 0, 1e3), striationStrength: requiredNumber(p.striationStrength, 0, 1),
      time: requiredNumber(p.time, 0, 1),
    };
  },
  build: (_inputs, p) => {
    const center = p.center as GFXPoint, radius = p.haloRadius as number, width = p.haloWidth as number, bound = radius + width * 2;
    return processor("lenticularHalo", p, finiteExtent({ x: center.x - bound, y: center.y - bound, width: bound * 2, height: bound * 2 }), position => {
      const dx = position.x - center.x, dy = position.y - center.y, distance = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
      const ring = clamp(1 - Math.abs(distance - radius) / width);
      const stripes = clamp(.5 + .5 * Math.cos(angle * 24 + (p.time as number) * Math.PI * 2) * (p.striationContrast as number));
      const overlap = 1 - (p.haloOverlap as number) + (p.haloOverlap as number) * clamp(1 - distance / radius);
      return tinted(p.color as readonly number[], ring * overlap * (1 - (p.striationStrength as number) + (p.striationStrength as number) * stripes));
    }, () => []);
  },
};

stylizing.starShine = {
  category: "generator", inputs: 0,
  normalise: value => {
    const p = fields(value, ["center", "color", "crossAngle", "crossOpacity", "crossScale", "crossWidth", "epsilon", "radius"]);
    return {
      center: requiredPoint(p.center), color: requiredColour(p.color), crossAngle: requiredNumber(p.crossAngle, -1e4, 1e4),
      crossOpacity: requiredNumber(p.crossOpacity, 0, 1), crossScale: requiredNumber(p.crossScale, 0, 1e4),
      crossWidth: requiredNumber(p.crossWidth, 1e-6, 1e4), epsilon: requiredNumber(p.epsilon, 1e-9, 1),
      radius: requiredNumber(p.radius, 1e-6, 1e4),
    };
  },
  build: (_inputs, p) => {
    const center = p.center as GFXPoint, radius = p.radius as number, bound = radius * Math.max(1, p.crossScale as number);
    return processor("starShine", p, finiteExtent({ x: center.x - bound, y: center.y - bound, width: bound * 2, height: bound * 2 }), position => {
      const dx = position.x - center.x, dy = position.y - center.y, distance = Math.hypot(dx, dy);
      const core = clamp(1 - distance / radius), c = Math.cos(p.crossAngle as number), s = Math.sin(p.crossAngle as number);
      const u = dx * c + dy * s, v = -dx * s + dy * c, width = p.crossWidth as number;
      const cross = Math.max(Math.exp(-Math.abs(v) / width), Math.exp(-Math.abs(u) / width)) * clamp(1 - distance / bound) * (p.crossOpacity as number);
      return tinted(p.color as readonly number[], clamp((core + cross) / Math.max(p.epsilon as number, 1)));
    }, () => []);
  },
};

stylizing.sunbeams = {
  category: "generator", inputs: 0,
  normalise: value => {
    const p = fields(value, ["center", "color", "maxStriationRadius", "striationContrast", "striationStrength", "sunRadius", "time"]);
    return {
      center: requiredPoint(p.center), color: requiredColour(p.color), maxStriationRadius: requiredNumber(p.maxStriationRadius, 1e-6, 1e4),
      striationContrast: requiredNumber(p.striationContrast, 0, 1e3), striationStrength: requiredNumber(p.striationStrength, 0, 1),
      sunRadius: requiredNumber(p.sunRadius, 1e-6, 1e4), time: requiredNumber(p.time, 0, 1),
    };
  },
  build: (_inputs, p) => {
    const center = p.center as GFXPoint, radius = Math.max(p.maxStriationRadius as number, p.sunRadius as number);
    return processor("sunbeams", p, finiteExtent({ x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2 }), position => {
      const dx = position.x - center.x, dy = position.y - center.y, distance = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
      const sun = clamp(1 - distance / (p.sunRadius as number));
      const beamEnvelope = clamp(1 - distance / (p.maxStriationRadius as number));
      const stripe = clamp(.5 + .5 * Math.sin(angle * 32 + (p.time as number) * Math.PI * 2) * (p.striationContrast as number));
      return tinted(p.color as readonly number[], clamp(sun + beamEnvelope * stripe * (p.striationStrength as number)));
    }, () => []);
  },
};

function textValue(value: unknown, label: string, maximum = 65_536): string {
  if (typeof value !== "string" || value.length > maximum) throw new RangeError(`${label} exceeds its bounded text limit.`);
  return value;
}
function textSnapshotPaths(value: unknown): readonly (readonly GFXPathCommand[])[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("Text glyph paths must be a plain dense array.");
  if (value.length > 10_000) throw new RangeError("Text glyph snapshot exceeds its glyph limit.");
  const descriptor = Object.getOwnPropertyDescriptors(value);
  let commands = 0;
  const paths = Array.from({ length: value.length }, (_, index) => {
    const slot = descriptor[String(index)];
    if (!slot || !("value" in slot) || !Array.isArray(slot.value) || Object.getPrototypeOf(slot.value) !== Array.prototype) throw new TypeError("Text glyph paths must contain plain command arrays.");
    const path = new GFXPath(slot.value as readonly GFXPathCommand[]);
    commands += path.commands.length;
    if (commands > 100_000) throw new RangeError("Text glyph snapshot exceeds its path-command work limit.");
    return Object.freeze([...path.commands]);
  });
  return Object.freeze(paths);
}
function textImageDefinition(name: "textImage" | "attributedTextImage"): Definition {
  const plain = name === "textImage";
  return {
    category: "generator", inputs: 0,
    normalise: value => {
      const allowed = plain
        ? ["text", "fontName", "fontSize", "scaleFactor", "padding", "extent", "paths"]
        : ["text", "scaleFactor", "padding", "extent", "paths"];
      const p = fields(value, allowed);
      const common = {
        text: textValue(p.text, "Text image source"),
        scaleFactor: requiredNumber(p.scaleFactor, 1 / 64, 64),
        padding: requiredNumber(p.padding, 0, 4096),
        extent: requiredRect(p.extent),
        paths: textSnapshotPaths(p.paths),
      };
      return plain ? {
        ...common,
        fontName: textValue(p.fontName, "Text image font name", 256),
        fontSize: requiredNumber(p.fontSize, 1 / 64, 4096),
      } : common;
    },
    build: (_inputs, p) => {
      const extent = p.extent as GFXRect;
      if (extent.x !== 0 || extent.y !== 0 || extent.width > 16_384 || extent.height > 16_384 || extent.width * extent.height > 64 * 1024 * 1024) {
        throw new RangeError("Text image extent exceeds its output work limit.");
      }
      const paths = (p.paths as readonly (readonly GFXPathCommand[])[]).map(commands => {
        const path = new GFXPath(commands), bounds = path.bounds;
        return Object.freeze({ path, bounds });
      });
      return processor(name, p, finiteExtent(extent), position => {
        let hits = 0;
        for (const offset of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]] as const) {
          const candidate = { x: position.x + offset[0], y: position.y + offset[1] };
          const inside = paths.some(({ path, bounds }) => candidate.x >= bounds.x && candidate.y >= bounds.y && candidate.x <= bounds.x + bounds.width && candidate.y <= bounds.y + bounds.height && path.contains(candidate));
          if (inside) hits += 1;
        }
        const alpha = hits / 4;
        return { r: alpha, g: alpha, b: alpha, a: alpha };
      }, () => []);
    },
  };
}
stylizing.textImage = textImageDefinition("textImage");
stylizing.attributedTextImage = textImageDefinition("attributedTextImage");

function singleInputLocal(
  name: string,
  category: Definition["category"],
  normalise: (value: unknown) => Readonly<Record<string, unknown>>,
  radius: (parameters: Readonly<Record<string, unknown>>) => number,
  evaluate: (position: GFXPoint, access: ProcessingAccess, parameters: Readonly<Record<string, unknown>>) => Sample,
): Definition {
  return {
    category, inputs: 1, normalise,
    build: (inputs, p) => {
      const support = radius(p);
      return processor(name, p, expandedExtent(inputs[0]!.extent, support), (position, access) => evaluate(position, access, p), bounds => [expanded(bounds, support + 1)]);
    },
  };
}

stylizing.bloom = singleInputLocal("bloom", "stylize", value => {
  const p = fields(value, ["intensity", "radius"]);
  return { intensity: requiredNumber(p.intensity, 0, 4), radius: requiredNumber(p.radius, 0, 1e3) };
}, p => p.radius as number, (position, access, p) => {
  const source = access.sample(0, position), glow = localMean(access, position, p.radius as number), amount = p.intensity as number;
  return { r: source.r + glow.r * amount, g: source.g + glow.g * amount, b: source.b + glow.b * amount, a: Math.max(source.a, glow.a) };
});

stylizing.gloom = singleInputLocal("gloom", "stylize", value => {
  const p = fields(value, ["intensity", "radius"]);
  return { intensity: requiredNumber(p.intensity, 0, 4), radius: requiredNumber(p.radius, 0, 1e3) };
}, p => p.radius as number, (position, access, p) => {
  const source = straight(access.sample(0, position)), local = straight(localMean(access, position, p.radius as number)), amount = p.intensity as number;
  const shade = clamp(luma(local) * amount);
  return premult({ r: source.r * (1 - shade), g: source.g * (1 - shade), b: source.b * (1 - shade), a: source.a });
});

stylizing.comicEffect = singleInputLocal("comicEffect", "stylize", value => fields(value, []), () => 1, (position, access) => {
  const source = straight(access.sample(0, position)), edge = clamp(gradient(access, position).magnitude * 4), levels = 5;
  const quantise = (v: number) => Math.round(clamp(v) * (levels - 1)) / (levels - 1) * (1 - edge);
  return premult({ r: quantise(source.r), g: quantise(source.g), b: quantise(source.b), a: source.a });
});

function cellSample(position: GFXPoint, center: GFXPoint, radius: number, seed: number, hexagonal: boolean): GFXPoint {
  const qx = (position.x - center.x) / radius, qy = (position.y - center.y) / radius;
  const row = Math.round(qy / (hexagonal ? .8660254037844386 : 1));
  const offset = hexagonal && Math.abs(row) % 2 === 1 ? .5 : 0;
  const column = Math.round(qx - offset);
  const jitterX = (noise(column, row, seed) - .5) * .55;
  const jitterY = (noise(column, row, seed + 1) - .5) * .55;
  return { x: center.x + (column + offset + jitterX) * radius, y: center.y + (row * (hexagonal ? .8660254037844386 : 1) + jitterY) * radius };
}

for (const name of ["crystallize", "pointillize"] as const) {
  stylizing[name] = {
    category: "stylize", inputs: 1,
    normalise: value => {
      const p = fields(value, ["center", "radius", "seed"]);
      return { center: requiredPoint(p.center), radius: requiredNumber(p.radius, 1e-6, 1e4), seed: requiredSeed(p.seed) };
    },
    build: (inputs, p) => processor(name, p, inputs[0]!.extent, (position, access) => {
      const mapped = cellSample(position, p.center as GFXPoint, p.radius as number, p.seed as number, name === "pointillize");
      const source = access.sample(0, mapped, "nearest");
      if (name === "crystallize") return source;
      const radius = p.radius as number, distance = Math.hypot(position.x - mapped.x, position.y - mapped.y);
      const coverage = clamp(1 - distance / (radius * .55));
      return { r: source.r * coverage, g: source.g * coverage, b: source.b * coverage, a: source.a * coverage };
    }, bounds => [expanded(bounds, (p.radius as number) * 2)]),
  };
}

stylizing.depthOfField = singleInputLocal("depthOfField", "stylize", value => {
  const p = fields(value, ["point0", "point1", "radius", "saturation", "unsharpMaskIntensity", "unsharpMaskRadius"]);
  return {
    point0: requiredPoint(p.point0), point1: requiredPoint(p.point1), radius: requiredNumber(p.radius, 0, 1e3), saturation: requiredNumber(p.saturation, 0, 4),
    unsharpMaskIntensity: requiredNumber(p.unsharpMaskIntensity, 0, 4), unsharpMaskRadius: requiredNumber(p.unsharpMaskRadius, 0, 1e3),
  };
}, p => Math.max(p.radius as number, p.unsharpMaskRadius as number), (position, access, p) => {
  const distance = distanceToSegment(position, p.point0 as GFXPoint, p.point1 as GFXPoint), radius = p.radius as number;
  const blurAmount = radius === 0 ? 0 : clamp(distance / radius), source = straight(access.sample(0, position));
  const blurred = straight(localMean(access, position, radius * blurAmount)), sharp = straight(localMean(access, position, p.unsharpMaskRadius as number));
  const mixed = { r: source.r + (blurred.r - source.r) * blurAmount, g: source.g + (blurred.g - source.g) * blurAmount, b: source.b + (blurred.b - source.b) * blurAmount };
  const unsharp = p.unsharpMaskIntensity as number;
  mixed.r += (source.r - sharp.r) * unsharp * (1 - blurAmount); mixed.g += (source.g - sharp.g) * unsharp * (1 - blurAmount); mixed.b += (source.b - sharp.b) * unsharp * (1 - blurAmount);
  const gray = .2126 * mixed.r + .7152 * mixed.g + .0722 * mixed.b, saturation = p.saturation as number;
  return premult({ r: gray + (mixed.r - gray) * saturation, g: gray + (mixed.g - gray) * saturation, b: gray + (mixed.b - gray) * saturation, a: source.a });
});

stylizing.edgeWork = singleInputLocal("edgeWork", "stylize", value => {
  const p = fields(value, ["radius"]); return { radius: requiredNumber(p.radius, 1e-6, 1e3) };
}, p => p.radius as number, (position, access, p) => {
  const value = clamp(gradient(access, position, p.radius as number).magnitude * 2);
  const alpha = access.sample(0, position).a;
  return { r: value * alpha, g: value * alpha, b: value * alpha, a: alpha };
});

stylizing.gaborGradients = singleInputLocal("gaborGradients", "stylize", value => fields(value, []), () => 1, (position, access) => {
  const g = gradient(access, position);
  const alpha = access.sample(0, position).a;
  return premult({ r: clamp(.5 + g.x), g: clamp(.5 + g.y), b: clamp(g.magnitude), a: alpha });
});

stylizing.heightFieldFromMask = singleInputLocal("heightFieldFromMask", "stylize", value => {
  const p = fields(value, ["radius"]); return { radius: requiredNumber(p.radius, 1e-6, 1e3) };
}, p => p.radius as number, (position, access, p) => {
  const source = straight(access.sample(0, position)), local = straight(localMean(access, position, p.radius as number));
  const height = clamp(.5 + (luma(source) - luma(local)) * 2);
  return { r: height, g: height, b: height, a: source.a };
});

stylizing.hexagonalPixellate = {
  category: "stylize", inputs: 1,
  normalise: value => { const p = fields(value, ["center", "scale"]); return { center: requiredPoint(p.center), scale: requiredNumber(p.scale, 1e-6, 1e4) }; },
  build: (inputs, p) => processor("hexagonalPixellate", p, inputs[0]!.extent, (position, access) => access.sample(0, cellSample(position, p.center as GFXPoint, p.scale as number, 0, true), "nearest"), bounds => [expanded(bounds, p.scale as number)]),
};

stylizing.highlightShadowAdjust = singleInputLocal("highlightShadowAdjust", "stylize", value => {
  const p = fields(value, ["highlightAmount", "radius", "shadowAmount"]);
  return { highlightAmount: requiredNumber(p.highlightAmount, 0, 1), radius: requiredNumber(p.radius, 0, 1e3), shadowAmount: requiredNumber(p.shadowAmount, 0, 1) };
}, p => p.radius as number, (position, access, p) => {
  const source = straight(access.sample(0, position)), local = luma(straight(localMean(access, position, p.radius as number))), value = luma(source);
  const shadowLift = (1 - local) * (p.shadowAmount as number) * (1 - value), highlight = local * (p.highlightAmount as number) * value;
  const factor = 1 + shadowLift - highlight * .5;
  return premult({ r: source.r * factor, g: source.g * factor, b: source.b * factor, a: source.a });
});

stylizing.lineOverlay = singleInputLocal("lineOverlay", "stylize", value => {
  const p = fields(value, ["nrNoiseLevel", "nrSharpness", "contrast", "edgeIntensity", "threshold"]);
  return {
    nrNoiseLevel: requiredNumber(p.nrNoiseLevel, 0, 1), nrSharpness: requiredNumber(p.nrSharpness, 0, 4), contrast: requiredNumber(p.contrast, 0, 4),
    edgeIntensity: requiredNumber(p.edgeIntensity, 0, 4), threshold: requiredNumber(p.threshold, 0, 1),
  };
}, () => 1, (position, access, p) => {
  const source = straight(access.sample(0, position)), edge = gradient(access, position).magnitude * (p.edgeIntensity as number);
  const denoised = edge < (p.nrNoiseLevel as number) ? edge * (1 - (p.nrSharpness as number) * .25) : edge;
  const line = denoised >= (p.threshold as number) ? 0 : 1;
  const tone = clamp(.5 + (luma(source) - .5) * (p.contrast as number));
  const value = line * tone;
  return premult({ r: value, g: value, b: value, a: source.a });
});

stylizing.mix = {
  category: "stylize", inputs: 2,
  normalise: value => { const p = fields(value, ["amount"]); return { amount: requiredNumber(p.amount, 0, 1) }; },
  build: (inputs, p) => processor("mix", p, inputs[0]!.extent, (position, access) => {
    const first = access.sample(0, position), background = access.sample(1, position), amount = p.amount as number;
    return { r: background.r + (first.r - background.r) * amount, g: background.g + (first.g - background.g) * amount, b: background.b + (first.b - background.b) * amount, a: background.a + (first.a - background.a) * amount };
  }, bounds => [bounds, bounds]),
};

stylizing.shadedMaterial = {
  category: "stylize", inputs: 2,
  normalise: value => { const p = fields(value, ["scale"]); return { scale: requiredNumber(p.scale, 0, 16) }; },
  build: (inputs, p) => processor("shadedMaterial", p, inputs[0]!.extent, (position, access) => {
    const source = straight(access.sample(0, position)), shade = luma(straight(access.sample(1, position))), factor = clamp(.5 + (shade - .5) * (p.scale as number));
    return premult({ r: source.r * factor * 2, g: source.g * factor * 2, b: source.b * factor * 2, a: source.a });
  }, bounds => [bounds, bounds]),
};

function colourDistance(a: Readonly<{r:number;g:number;b:number}>, b: readonly number[]): number {
  return Math.sqrt((a.r - b[0]!) ** 2 + (a.g - b[1]!) ** 2 + (a.b - b[2]!) ** 2);
}
stylizing.spotColor = {
  category: "stylize", inputs: 1,
  normalise: value => {
    const keys = ["centerColor1","centerColor2","centerColor3","closeness1","closeness2","closeness3","contrast1","contrast2","contrast3","replacementColor1","replacementColor2","replacementColor3"] as const;
    const p = fields(value, keys);
    return {
      centerColor1: requiredColour(p.centerColor1), centerColor2: requiredColour(p.centerColor2), centerColor3: requiredColour(p.centerColor3),
      closeness1: requiredNumber(p.closeness1, 1e-6, 2), closeness2: requiredNumber(p.closeness2, 1e-6, 2), closeness3: requiredNumber(p.closeness3, 1e-6, 2),
      contrast1: requiredNumber(p.contrast1, .01, 16), contrast2: requiredNumber(p.contrast2, .01, 16), contrast3: requiredNumber(p.contrast3, .01, 16),
      replacementColor1: requiredColour(p.replacementColor1), replacementColor2: requiredColour(p.replacementColor2), replacementColor3: requiredColour(p.replacementColor3),
    };
  },
  build: (inputs, p) => processor("spotColor", p, inputs[0]!.extent, (position, access) => {
    const source = straight(access.sample(0, position));
    let best = { weight: 0, replacement: [source.r, source.g, source.b, source.a] as readonly number[] };
    for (let index = 1; index <= 3; index++) {
      const center = p[`centerColor${index}`] as readonly number[], closeness = p[`closeness${index}`] as number, contrast = p[`contrast${index}`] as number;
      const weight = clamp(1 - colourDistance(source, center) / closeness) ** contrast;
      if (weight > best.weight) best = { weight, replacement: p[`replacementColor${index}`] as readonly number[] };
    }
    return premult({ r: source.r + (best.replacement[0]! - source.r) * best.weight, g: source.g + (best.replacement[1]! - source.g) * best.weight, b: source.b + (best.replacement[2]! - source.b) * best.weight, a: source.a });
  }, bounds => [bounds]),
};

function vec3(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must contain three numbers.`);
  return tuple(value, [0,0,0], 3);
}
stylizing.spotLight = {
  category: "stylize", inputs: 1,
  normalise: value => {
    const p = fields(value, ["brightness","color","concentration","lightPointsAt","lightPosition"]);
    return { brightness: requiredNumber(p.brightness, 0, 16), color: requiredColour(p.color), concentration: requiredNumber(p.concentration, 0, 1e4), lightPointsAt: vec3(p.lightPointsAt, "lightPointsAt"), lightPosition: vec3(p.lightPosition, "lightPosition") };
  },
  build: (inputs, p) => processor("spotLight", p, inputs[0]!.extent, (position, access) => {
    const source = straight(access.sample(0, position)), light = p.lightPosition as readonly number[], target = p.lightPointsAt as readonly number[];
    const lx = light[0]! - position.x, ly = light[1]! - position.y, lz = light[2]!, length = Math.max(1e-9, Math.hypot(lx, ly, lz));
    const dx = target[0]! - light[0]!, dy = target[1]! - light[1]!, dz = target[2]! - light[2]!, dlen = Math.max(1e-9, Math.hypot(dx,dy,dz));
    const alignment = clamp((lx/length * dx/dlen + ly/length * dy/dlen + lz/length * dz/dlen + 1) / 2);
    const cone = alignment ** Math.max(1, p.concentration as number), amount = cone * (p.brightness as number) / (1 + length * .05), color = p.color as readonly number[];
    return premult({ r: source.r + color[0]! * amount, g: source.g + color[1]! * amount, b: source.b + color[2]! * amount, a: source.a });
  }, bounds => [bounds]),
};

stylizing.cmykHalftone = {
  category: "halftone", inputs: 1,
  normalise: value => {
    const p = fields(value, ["angle","center","grayComponentReplacement","sharpness","underColorRemoval","width"]);
    return { angle: requiredNumber(p.angle,-1e4,1e4), center: requiredPoint(p.center), grayComponentReplacement: requiredNumber(p.grayComponentReplacement,0,1), sharpness: requiredNumber(p.sharpness,0,1), underColorRemoval: requiredNumber(p.underColorRemoval,0,1), width: requiredNumber(p.width,1e-6,1e4) };
  },
  build: (inputs, p) => processor("cmykHalftone", p, inputs[0]!.extent, (position, access) => {
    const c = straight(access.sample(0, position)), center = p.center as GFXPoint, width = p.width as number;
    const k = Math.min(1-c.r,1-c.g,1-c.b) * (p.grayComponentReplacement as number), ucr = p.underColorRemoval as number;
    const inks = [clamp(1-c.r-k*ucr), clamp(1-c.g-k*ucr), clamp(1-c.b-k*ucr), clamp(k)];
    const angles = [p.angle as number, (p.angle as number)+Math.PI/6, (p.angle as number)-Math.PI/6, (p.angle as number)+Math.PI/4];
    const dots = inks.map((ink,index) => {
      const co=Math.cos(angles[index]!), si=Math.sin(angles[index]!), x=((position.x-center.x)*co+(position.y-center.y)*si)/width, y=(-(position.x-center.x)*si+(position.y-center.y)*co)/width;
      const d=Math.hypot(fract(x)-.5,fract(y)-.5), edge=.5-Math.sqrt(ink/Math.PI); return clamp(.5+(edge-d)*8*(.25+(p.sharpness as number)));
    });
    const outR=(1-dots[0]!)*(1-dots[3]!), outG=(1-dots[1]!)*(1-dots[3]!), outB=(1-dots[2]!)*(1-dots[3]!);
    return premult({r:outR,g:outG,b:outB,a:c.a});
  }, bounds => [bounds]),
};

stylizing.hatchedScreen = {
  category: "halftone", inputs: 1,
  normalise: value => { const p=fields(value,["angle","center","sharpness","width"]); return { angle:requiredNumber(p.angle,-1e4,1e4), center:requiredPoint(p.center), sharpness:requiredNumber(p.sharpness,0,1), width:requiredNumber(p.width,1e-6,1e4) }; },
  build: (inputs,p) => processor("hatchedScreen",p,inputs[0]!.extent,(position,access)=>{
    const source=straight(access.sample(0,position)), center=p.center as GFXPoint, co=Math.cos(p.angle as number), si=Math.sin(p.angle as number), projected=((position.x-center.x)*co+(position.y-center.y)*si)/(p.width as number), coverage=1-luma(source), distance=Math.abs(fract(projected)-.5), threshold=coverage*.5;
    const ink=clamp(.5+(threshold-distance)*12*(.25+(p.sharpness as number))), value=1-ink; return premult({r:value,g:value,b:value,a:source.a});
  },bounds=>[bounds]),
};

type KMeansState = readonly Readonly<{r:number;g:number;b:number;a:number}>[];
function vector(value: Readonly<{r:number;g:number;b:number;a:number}>, perceptual:boolean): readonly number[] {
  if (!perceptual) return [value.r,value.g,value.b,value.a];
  const lab=GFXColourTransform.toLabD50(value); return [lab.l/100,lab.a/128,lab.b/128,value.a];
}
function distance(a: Readonly<{r:number;g:number;b:number;a:number}>, b: Readonly<{r:number;g:number;b:number;a:number}>, perceptual:boolean):number {
  const x=vector(a,perceptual),y=vector(b,perceptual); return x.reduce((sum,v,i)=>sum+(v-y[i]!)**2,0);
}
function *kMeansCalculation(access: ProcessingAccess, source:GFXRect, means:GFXRect, count:number, passes:number, perceptual:boolean):Generator<void,KMeansState,void>{
  let centroids=Array.from({length:count},(_,i)=>straight(access.sampleWithin(1,{x:means.x+i+.5,y:means.y+.5},means,"nearest")));
  let work=0;
  for(let pass=0;pass<passes;pass++){
    const sums=Array.from({length:count},()=>[0,0,0,0,0]);
    for(let y=0;y<source.height;y++) for(let x=0;x<source.width;x++){
      const value=straight(access.sampleWithin(0,{x:source.x+x+.5,y:source.y+y+.5},source,"nearest")); let best=0,bestDistance=Infinity;
      for(let i=0;i<count;i++){const d=distance(value,centroids[i]!,perceptual);if(d<bestDistance){best=i;bestDistance=d;}}
      const bucket=sums[best]!; bucket[0]+=value.r;bucket[1]+=value.g;bucket[2]+=value.b;bucket[3]+=value.a;bucket[4]+=1;
      if(++work%1024===0) yield;
    }
    centroids=sums.map((sum,i)=>sum[4]===0?centroids[i]!:Object.freeze({r:sum[0]!/sum[4]!,g:sum[1]!/sum[4]!,b:sum[2]!/sum[4]!,a:sum[3]!/sum[4]!}));
  }
  return Object.freeze(centroids);
}
function kMeansSync(access:ProcessingAccess, source:GFXRect, means:GFXRect,count:number,passes:number,perceptual:boolean):KMeansState{const run=kMeansCalculation(access,source,means,count,passes,perceptual);for(;;){const next=run.next();if(next.done)return next.value;}}
async function kMeansAsync(access:ProcessingPreparationAccess, source:GFXRect, means:GFXRect,count:number,passes:number,perceptual:boolean):Promise<KMeansState>{const run=kMeansCalculation(access,source,means,count,passes,perceptual);for(;;){const next=run.next();if(next.done)return next.value;await access.checkpoint();}}
stylizing.kMeans = {
  category:"reduction", inputs:2,
  normalise:value=>{const p=fields(value,["count","passes","perceptual"]);if(typeof p.perceptual!=="boolean")throw new TypeError("kMeans perceptual must be boolean.");return{count:requiredInteger(p.count,1,64),passes:requiredInteger(p.passes,1,32),perceptual:p.perceptual};},
  build:(inputs,p)=>{
    const source=pixelRect(finiteInput(inputs[0]!)),means=pixelRect(finiteInput(inputs[1]!)),count=p.count as number,passes=p.passes as number,perceptual=p.perceptual as boolean;
    if(source.width*source.height>65536)throw new RangeError("kMeans source exceeds 65,536 pixels.");
    if(means.height!==1||means.width!==count)throw new RangeError("kMeans input means must be one row matching count.");
    const token=Object.freeze({}),get=(access:ProcessingAccess)=>access.getState<KMeansState>(token)??access.setState(token,kMeansSync(access,source,means,count,passes,perceptual));
    return processor("kMeans",p,finiteExtent({x:0,y:0,width:count,height:1}),(position,access)=>premult(get(access)[Math.max(0,Math.min(count-1,Math.floor(position.x)))]!),()=>[source,means],async access=>{if(!access.getState<KMeansState>(token))access.setState(token,await kMeansAsync(access,source,means,count,passes,perceptual));},Object.freeze({scope:"global" as const,scratchBytes:count*5*Float64Array.BYTES_PER_ELEMENT,work:source.width*source.height*count*passes}));
  },
};
