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
import { infiniteExtent } from "../extent";
import { fields, finiteInput, number, point, processor, transparent, type Definition } from "./common";

export const tiling: Record<string, Definition> = {};

const epsilon = 1e-10;
type Quad = readonly [GFXPoint, GFXPoint, GFXPoint, GFXPoint];
type Homography = Readonly<{ a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number }>;

function requiredNumber(value: unknown, min = -1e6, max = 1e6): number {
  return number(value, Number.NaN, min, max);
}

function requiredPoint(value: unknown): GFXPoint {
  if (value === undefined) throw new TypeError("Required tile point parameter is missing.");
  return point(value);
}

function positiveWidth(value: unknown): number {
  return requiredNumber(value, 1e-6, 1e6);
}

function wrap01(value: number): number {
  const wrapped = value - Math.floor(value);
  return wrapped >= 1 ? 0 : wrapped;
}

function mirror01(value: number): number {
  const period = value - Math.floor(value / 2) * 2;
  return period <= 1 ? period : 2 - period;
}

function mapUnitToSource(source: GFXRect, u: number, v: number): GFXPoint {
  const x = source.x + wrap01(u) * source.width;
  const y = source.y + wrap01(v) * source.height;
  return {
    x: Math.min(source.x + source.width - 1e-9, Math.max(source.x, x)),
    y: Math.min(source.y + source.height - 1e-9, Math.max(source.y, y)),
  };
}

function local(position: GFXPoint, center: GFXPoint, angle: number, width: number): GFXPoint {
  const dx = position.x - center.x, dy = position.y - center.y, c = Math.cos(angle), s = Math.sin(angle);
  return { x: (dx * c + dy * s) / width, y: (-dx * s + dy * c) / width };
}

function sampleMapped(source: GFXRect, u: number, v: number, access: import("../processing").ProcessingAccess) {
  return access.sampleWithin(0, mapUnitToSource(source, u, v), source, "nearest");
}

function ordinaryTile(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
  inputs: readonly import("../IFXImage").IFXImage[],
  map: (position: GFXPoint) => Readonly<{ u: number; v: number }>,
) {
  const source = finiteInput(inputs[0]!);
  return processor(name, parameters, infiniteExtent, (position, access) => {
    const mapped = map(position);
    return sampleMapped(source, mapped.u, mapped.v, access);
  }, () => [source]);
}

function reflectedSector(position: GFXPoint, center: GFXPoint, angle: number, width: number, count: number, reflected: boolean) {
  const dx = position.x - center.x, dy = position.y - center.y, radius = Math.hypot(dx, dy) / width;
  const sector = Math.PI * 2 / count;
  let theta = Math.atan2(dy, dx) - angle;
  theta = ((theta % sector) + sector) % sector;
  if (reflected && theta > sector / 2) theta = sector - theta;
  return { u: radius * Math.cos(theta), v: radius * Math.sin(theta) };
}

function sharedAngularParameters(value: unknown, acute = false) {
  const p = fields(value, acute ? ["acuteAngle", "angle", "center", "width"] : ["angle", "center", "width"]);
  const result: Record<string, unknown> = {
    angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128),
    center: requiredPoint(p.center),
    width: positiveWidth(p.width),
  };
  if (acute) {
    const acuteAngle = requiredNumber(p.acuteAngle, 1e-4, Math.PI - 1e-4);
    if (Math.abs(Math.sin(acuteAngle)) <= 1e-6) throw new RangeError("Tile acute angle is singular.");
    result.acuteAngle = acuteAngle;
  }
  return result;
}

for (const [name, count, reflected] of [
  ["eightfoldReflectedTile", 8, true],
  ["sixfoldReflectedTile", 6, true],
  ["sixfoldRotatedTile", 6, false],
  ["twelvefoldReflectedTile", 12, true],
] as const) {
  tiling[name] = {
    category: "tile",
    inputs: 1,
    normalise: value => sharedAngularParameters(value),
    build: (inputs, p) => ordinaryTile(name, p, inputs, position => reflectedSector(position, p.center as GFXPoint, p.angle as number, p.width as number, count, reflected)),
  };
}

tiling.fourfoldReflectedTile = {
  category: "tile",
  inputs: 1,
  normalise: value => sharedAngularParameters(value, true),
  build: (inputs, p) => ordinaryTile("fourfoldReflectedTile", p, inputs, position => {
    const q = local(position, p.center as GFXPoint, p.angle as number, p.width as number);
    const shear = Math.cos(p.acuteAngle as number) / Math.sin(p.acuteAngle as number);
    return { u: mirror01(q.x - q.y * shear), v: mirror01(q.y / Math.sin(p.acuteAngle as number)) };
  }),
};

tiling.fourfoldRotatedTile = {
  category: "tile",
  inputs: 1,
  normalise: value => sharedAngularParameters(value),
  build: (inputs, p) => ordinaryTile("fourfoldRotatedTile", p, inputs, position => {
    const q = local(position, p.center as GFXPoint, p.angle as number, p.width as number);
    const cx = Math.floor(q.x), cy = Math.floor(q.y), turn = ((cx + cy) % 4 + 4) % 4;
    let u = wrap01(q.x), v = wrap01(q.y);
    for (let i = 0; i < turn; i++) [u, v] = [1 - v, u];
    return { u, v };
  }),
};

tiling.fourfoldTranslatedTile = {
  category: "tile",
  inputs: 1,
  normalise: value => sharedAngularParameters(value, true),
  build: (inputs, p) => ordinaryTile("fourfoldTranslatedTile", p, inputs, position => {
    const q = local(position, p.center as GFXPoint, p.angle as number, p.width as number);
    const s = Math.sin(p.acuteAngle as number), shear = Math.cos(p.acuteAngle as number) / s;
    const row = Math.floor(q.y / s), v = q.y / s;
    return { u: q.x - q.y * shear + row * .5, v };
  }),
};

tiling.glideReflectedTile = {
  category: "tile",
  inputs: 1,
  normalise: value => sharedAngularParameters(value),
  build: (inputs, p) => ordinaryTile("glideReflectedTile", p, inputs, position => {
    const q = local(position, p.center as GFXPoint, p.angle as number, p.width as number), row = Math.floor(q.y);
    const u = wrap01(q.x + row * .5), v = wrap01(q.y);
    return { u: Math.abs(row) % 2 === 1 ? 1 - u : u, v };
  }),
};

tiling.parallelogramTile = {
  category: "tile",
  inputs: 1,
  normalise: value => sharedAngularParameters(value, true),
  build: (inputs, p) => ordinaryTile("parallelogramTile", p, inputs, position => {
    const q = local(position, p.center as GFXPoint, p.angle as number, p.width as number);
    const s = Math.sin(p.acuteAngle as number), shear = Math.cos(p.acuteAngle as number) / s;
    return { u: q.x - q.y * shear, v: q.y / s };
  }),
};

tiling.kaleidoscope = {
  category: "tile",
  inputs: 1,
  normalise: value => {
    const p = fields(value, ["angle", "center", "count"]), count = requiredNumber(p.count, 1, 128);
    if (!Number.isInteger(count)) throw new RangeError("Kaleidoscope count must be integral.");
    return { angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128), center: requiredPoint(p.center), count };
  },
  build: (inputs, p) => {
    const source = finiteInput(inputs[0]!), width = Math.max(source.width, source.height);
    return ordinaryTile("kaleidoscope", p, inputs, position => reflectedSector(position, p.center as GFXPoint, p.angle as number, width, p.count as number, true));
  },
};

tiling.opTile = {
  category: "tile",
  inputs: 1,
  normalise: value => {
    const p = fields(value, ["angle", "center", "scale", "width"]);
    return { angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128), center: requiredPoint(p.center), scale: requiredNumber(p.scale, -16, 16), width: positiveWidth(p.width) };
  },
  build: (inputs, p) => ordinaryTile("opTile", p, inputs, position => {
    const q = local(position, p.center as GFXPoint, p.angle as number, p.width as number), scale = p.scale as number;
    return { u: q.x + Math.sin(Math.PI * 2 * q.y) * scale, v: q.y + Math.sin(Math.PI * 2 * q.x) * scale };
  }),
};

tiling.triangleTile = {
  category: "tile",
  inputs: 1,
  normalise: value => sharedAngularParameters(value),
  build: (inputs, p) => ordinaryTile("triangleTile", p, inputs, position => {
    const q = local(position, p.center as GFXPoint, p.angle as number, p.width as number);
    let u = wrap01(q.x), v = wrap01(q.y);
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    return { u, v };
  }),
};

tiling.triangleKaleidoscope = {
  category: "tile",
  inputs: 1,
  normalise: value => {
    const p = fields(value, ["decay", "point", "rotation", "size"]);
    return { decay: requiredNumber(p.decay, 0, 16), point: requiredPoint(p.point), rotation: requiredNumber(p.rotation, -Math.PI * 128, Math.PI * 128), size: positiveWidth(p.size) };
  },
  build: (inputs, p) => ordinaryTile("triangleKaleidoscope", p, inputs, position => {
    const center = p.point as GFXPoint, size = p.size as number, dx = position.x - center.x, dy = position.y - center.y;
    const radius = Math.hypot(dx, dy) / size, ring = Math.floor(radius), attenuation = Math.exp(-(p.decay as number) * ring);
    const folded = reflectedSector(position, center, p.rotation as number, size, 3, true);
    return { u: folded.u * attenuation, v: folded.v * attenuation };
  }),
};

function assertQuad(quad: Quad): void {
  let orientation = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!, b = quad[(i + 1) % 4]!, c = quad[(i + 2) % 4]!;
    const abx = b.x - a.x, aby = b.y - a.y, bcx = c.x - b.x, bcy = c.y - b.y;
    const cross = abx * bcy - aby * bcx, scale = Math.max(1, Math.hypot(abx, aby), Math.hypot(bcx, bcy));
    if (!Number.isFinite(cross) || Math.abs(cross) <= epsilon * scale * scale) throw new RangeError("Perspective tile quad must be strictly convex and nondegenerate.");
    const sign = Math.sign(cross);
    if (orientation && orientation !== sign) throw new RangeError("Perspective tile quad must be strictly convex and nondegenerate.");
    orientation = sign;
  }
}

function solveHomography(from: Quad, to: Quad): Homography {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const s = from[i]!, t = to[i]!;
    rows.push([s.x, s.y, 1, 0, 0, 0, -t.x * s.x, -t.x * s.y, t.x]);
    rows.push([0, 0, 0, s.x, s.y, 1, -t.y * s.x, -t.y * s.y, t.y]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let candidate = column + 1; candidate < 8; candidate++) if (Math.abs(rows[candidate]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = candidate;
    const value = rows[pivot]![column]!;
    if (!Number.isFinite(value) || Math.abs(value) <= epsilon) throw new RangeError("Perspective tile homography is singular.");
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    for (let j = column; j < 9; j++) rows[column]![j] = rows[column]![j]! / value;
    for (let target = 0; target < 8; target++) {
      if (target === column) continue;
      const factor = rows[target]![column]!;
      if (factor === 0) continue;
      for (let j = column; j < 9; j++) rows[target]![j] = rows[target]![j]! - factor * rows[column]![j]!;
    }
  }
  const s = rows.map(row => row[8]!);
  if (!s.every(Number.isFinite)) throw new RangeError("Perspective tile homography is nonfinite.");
  return Object.freeze({ a: s[0]!, b: s[1]!, c: s[2]!, d: s[3]!, e: s[4]!, f: s[5]!, g: s[6]!, h: s[7]! });
}

function project(mapping: Homography, position: GFXPoint): GFXPoint | null {
  const denominator = mapping.g * position.x + mapping.h * position.y + 1;
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= epsilon) return null;
  const x = (mapping.a * position.x + mapping.b * position.y + mapping.c) / denominator;
  const y = (mapping.d * position.x + mapping.e * position.y + mapping.f) / denominator;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function quadParameters(value: unknown): Readonly<Record<string, unknown>> {
  const p = fields(value, ["topLeft", "topRight", "bottomRight", "bottomLeft"]);
  const quad: Quad = Object.freeze([requiredPoint(p.topLeft), requiredPoint(p.topRight), requiredPoint(p.bottomRight), requiredPoint(p.bottomLeft)]);
  assertQuad(quad);
  solveHomography(quad, Object.freeze([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]));
  return { topLeft: quad[0], topRight: quad[1], bottomRight: quad[2], bottomLeft: quad[3] };
}

tiling.perspectiveTile = {
  category: "tile",
  inputs: 1,
  normalise: quadParameters,
  build: (inputs, p) => {
    const source = finiteInput(inputs[0]!);
    const quad: Quad = Object.freeze([p.topLeft as GFXPoint, p.topRight as GFXPoint, p.bottomRight as GFXPoint, p.bottomLeft as GFXPoint]);
    const unit: Quad = Object.freeze([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
    const mapping = solveHomography(quad, unit);
    return processor("perspectiveTile", p, infiniteExtent, (position, access) => {
      const projected = project(mapping, position);
      return projected ? sampleMapped(source, projected.x, projected.y, access) : transparent;
    }, () => [source]);
  },
};
