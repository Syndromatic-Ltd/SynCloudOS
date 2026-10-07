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
import { finiteExtent, unionExtent, type IFXExtent } from "../extent";
import type { IFXImage } from "../IFXImage";
import type { IFXPremultipliedSample as Sample } from "../IFXSampler";
import type { ProcessingAccess } from "../processing";
import {
  clamp,
  colour,
  colourSample,
  fields,
  finiteInput,
  integer,
  luma,
  number,
  point,
  premult,
  processor,
  rect,
  straight,
  type Definition,
} from "./common";

export const transitions: Record<string, Definition> = {};

type TransitionInputs = readonly IFXImage[];

function requiredNumber(value: unknown, min = -1e6, max = 1e6): number {
  return number(value, Number.NaN, min, max);
}

function requiredInteger(value: unknown, min: number, max: number): number {
  return integer(value, Number.NaN, min, max);
}

function requiredPoint(value: unknown): GFXPoint {
  if (value === undefined) throw new TypeError("Required transition point parameter is missing.");
  return point(value);
}

function requiredRect(value: unknown): GFXRect {
  if (value === undefined) throw new TypeError("Required transition extent parameter is missing.");
  const valueRect = rect(value);
  if (valueRect.width <= 0 || valueRect.height <= 0) throw new RangeError("Transition extent must be nonempty.");
  return valueRect;
}

function requiredColour(value: unknown): readonly number[] {
  if (value === undefined) throw new TypeError("Required transition color parameter is missing.");
  return colour(value, [0, 0, 0, 0]);
}

function requiredTime(value: unknown): number {
  return requiredNumber(value, 0, 1);
}

function finiteInputs(inputs: TransitionInputs): readonly GFXRect[] {
  return Object.freeze(inputs.map(finiteInput));
}

function outputExtent(inputs: TransitionInputs, explicit?: GFXRect): IFXExtent {
  if (explicit) return finiteExtent(explicit);
  return unionExtent(inputs[0]!.extent, inputs[1]!.extent);
}

function conservativeRegions(rects: readonly GFXRect[]): () => readonly GFXRect[] {
  return () => rects;
}

function over(foreground: Sample, background: Sample): Sample {
  const inverse = 1 - foreground.a;
  return {
    r: foreground.r + background.r * inverse,
    g: foreground.g + background.g * inverse,
    b: foreground.b + background.b * inverse,
    a: foreground.a + background.a * inverse,
  };
}

function tinted(colourValue: readonly number[], opacity: number): Sample {
  const alpha = clamp(colourValue[3]! * opacity);
  return {
    r: clamp(colourValue[0]!) * alpha,
    g: clamp(colourValue[1]!) * alpha,
    b: clamp(colourValue[2]!) * alpha,
    a: alpha,
  };
}

function projectedCoordinate(position: GFXPoint, extent: GFXRect, angle: number): Readonly<{ axis: number; cross: number; span: number }> {
  const centerX = extent.x + extent.width / 2;
  const centerY = extent.y + extent.height / 2;
  const c = Math.cos(angle), s = Math.sin(angle);
  const halfAxis = Math.abs(c) * extent.width / 2 + Math.abs(s) * extent.height / 2;
  const halfCross = Math.abs(s) * extent.width / 2 + Math.abs(c) * extent.height / 2;
  const dx = position.x - centerX, dy = position.y - centerY;
  return {
    axis: (dx * c + dy * s + halfAxis) / Math.max(1e-9, halfAxis * 2),
    cross: (-dx * s + dy * c + halfCross) / Math.max(1e-9, halfCross * 2),
    span: Math.max(1e-9, halfAxis * 2),
  };
}

function endpoint(time: number, position: GFXPoint, access: ProcessingAccess): Sample | null {
  if (time <= 0) return access.sample(0, position);
  if (time >= 1) return access.sample(1, position);
  return null;
}

function transitionDefinition(
  name: string,
  inputCount: number,
  normalise: (value: unknown) => Readonly<Record<string, unknown>>,
  evaluate: (position: GFXPoint, access: ProcessingAccess, parameters: Readonly<Record<string, unknown>>, sourceExtent: GFXRect, output: GFXRect) => Sample,
  explicitExtent = false,
): Definition {
  return {
    category: "transition",
    inputs: inputCount,
    normalise,
    build: (inputs, parameters) => {
      const rects = finiteInputs(inputs);
      const sourceExtent = rects[0]!;
      const explicit = explicitExtent ? parameters.extent as GFXRect : undefined;
      const extent = outputExtent(inputs, explicit);
      if (extent.kind !== "finite") throw new RangeError("Transition requires finite output geometry.");
      return processor(name, parameters, extent, (position, access) => {
        const fixed = endpoint(parameters.time as number, position, access);
        return fixed ?? evaluate(position, access, parameters, sourceExtent, extent.rect);
      }, conservativeRegions(rects));
    },
  };
}

transitions.accordionFold = transitionDefinition(
  "accordionFold",
  2,
  value => {
    const p = fields(value, ["time", "bottomHeight", "foldShadowAmount", "numberOfFolds"]);
    return {
      time: requiredTime(p.time),
      bottomHeight: requiredNumber(p.bottomHeight, 0, 1e6),
      foldShadowAmount: requiredNumber(p.foldShadowAmount, 0, 1),
      numberOfFolds: requiredInteger(p.numberOfFolds, 1, 128),
    };
  },
  (position, access, p, _source, extent) => {
    const x = clamp((position.x - extent.x) / extent.width);
    const y = clamp((position.y - extent.y) / extent.height);
    const time = p.time as number, folds = p.numberOfFolds as number;
    const base = x <= time ? access.sample(1, position) : access.sample(0, position);
    const phase = Math.abs(((x * folds) % 1) * 2 - 1);
    const vertical = clamp(1 - (p.bottomHeight as number) * y / Math.max(1, extent.height));
    const shadow = (1 - phase) * (p.foldShadowAmount as number) * vertical * (1 - Math.abs(x - time));
    return over({ r: 0, g: 0, b: 0, a: clamp(shadow) }, base);
  },
);

transitions.barsSwipe = transitionDefinition(
  "barsSwipe",
  2,
  value => {
    const p = fields(value, ["time", "angle", "barOffset", "width"]);
    return {
      time: requiredTime(p.time),
      angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128),
      barOffset: requiredNumber(p.barOffset, -1e6, 1e6),
      width: requiredNumber(p.width, 1e-6, 1e6),
    };
  },
  (position, access, p, _source, extent) => {
    const projected = projectedCoordinate(position, extent, p.angle as number);
    const bar = Math.floor(projected.cross * extent.height / (p.width as number));
    const phase = ((bar % 2) + 2) % 2 === 0 ? 0 : (p.barOffset as number) / projected.span;
    return projected.axis <= (p.time as number) + phase ? access.sample(1, position) : access.sample(0, position);
  },
);

transitions.copyMachine = transitionDefinition(
  "copyMachine",
  2,
  value => {
    const p = fields(value, ["time", "angle", "color", "extent", "opacity", "width"]);
    return {
      time: requiredTime(p.time),
      angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128),
      color: requiredColour(p.color),
      extent: requiredRect(p.extent),
      opacity: requiredNumber(p.opacity, 0, 1),
      width: requiredNumber(p.width, 1e-6, 1e6),
    };
  },
  (position, access, p, _source, extent) => {
    const projected = projectedCoordinate(position, extent, p.angle as number);
    const time = p.time as number;
    const base = projected.axis <= time ? access.sample(1, position) : access.sample(0, position);
    const distance = Math.abs(projected.axis - time) * projected.span;
    const highlight = clamp(1 - distance / (p.width as number)) * (p.opacity as number);
    return over(tinted(p.color as readonly number[], highlight), base);
  },
  true,
);

transitions.disintegrateWithMask = transitionDefinition(
  "disintegrateWithMask",
  3,
  value => {
    const p = fields(value, ["time", "shadowDensity", "shadowOffset", "shadowRadius"]);
    return {
      time: requiredTime(p.time),
      shadowDensity: requiredNumber(p.shadowDensity, 0, 1),
      shadowOffset: requiredPoint(p.shadowOffset),
      shadowRadius: requiredNumber(p.shadowRadius, 1e-6, 1e6),
    };
  },
  (position, access, p) => {
    const maskValue = luma(straight(access.sample(2, position)));
    const time = p.time as number;
    const base = maskValue <= time ? access.sample(1, position) : access.sample(0, position);
    const offset = p.shadowOffset as GFXPoint;
    const shifted = luma(straight(access.sample(2, { x: position.x - offset.x, y: position.y - offset.y })));
    const shadow = clamp(1 - Math.abs(shifted - time) / (p.shadowRadius as number)) * (p.shadowDensity as number);
    return over({ r: 0, g: 0, b: 0, a: shadow }, base);
  },
);

transitions.flash = transitionDefinition(
  "flash",
  2,
  value => {
    const p = fields(value, ["time", "center", "color", "extent", "fadeThreshold", "maxStriationRadius", "striationContrast", "striationStrength"]);
    return {
      time: requiredTime(p.time),
      center: requiredPoint(p.center),
      color: requiredColour(p.color),
      extent: requiredRect(p.extent),
      fadeThreshold: requiredNumber(p.fadeThreshold, 0, 1),
      maxStriationRadius: requiredNumber(p.maxStriationRadius, 1e-6, 1e6),
      striationContrast: requiredNumber(p.striationContrast, 0, 1e3),
      striationStrength: requiredNumber(p.striationStrength, 0, 1),
    };
  },
  (position, access, p, _source, extent) => {
    const center = p.center as GFXPoint;
    const distance = Math.hypot(position.x - center.x, position.y - center.y);
    const maximum = Math.hypot(extent.width, extent.height) / 2;
    const front = (p.time as number) * maximum;
    const base = distance <= front ? access.sample(1, position) : access.sample(0, position);
    const radius = p.maxStriationRadius as number;
    const ring = clamp(1 - Math.abs(distance - front) / radius);
    const oscillation = .5 + .5 * Math.cos(distance / radius * Math.PI * 2);
    const striation = clamp((.5 + (oscillation - .5) * (p.striationContrast as number)) * (p.striationStrength as number));
    const fadeThreshold = p.fadeThreshold as number;
    const fade = (p.time as number) <= fadeThreshold ? 1 : clamp((1 - (p.time as number)) / Math.max(1e-9, 1 - fadeThreshold));
    return over(tinted(p.color as readonly number[], ring * striation * fade), base);
  },
  true,
);

transitions.mod = transitionDefinition(
  "mod",
  2,
  value => {
    const p = fields(value, ["time", "angle", "center", "compression", "radius"]);
    return {
      time: requiredTime(p.time),
      angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128),
      center: requiredPoint(p.center),
      compression: requiredNumber(p.compression, 1e-6, 1e6),
      radius: requiredNumber(p.radius, 1e-6, 1e6),
    };
  },
  (position, access, p) => {
    const center = p.center as GFXPoint;
    const dx = position.x - center.x, dy = position.y - center.y;
    const radial = Math.hypot(dx, dy) / (p.radius as number);
    const angular = Math.atan2(dy, dx) + (p.angle as number);
    const wave = Math.sin((radial * (p.compression as number) + angular / (Math.PI * 2)) * Math.PI * 2);
    const threshold = (p.time as number) + wave * .12 * Math.sin(Math.PI * (p.time as number));
    return radial <= threshold ? access.sample(1, position) : access.sample(0, position);
  },
);

function curlSample(position: GFXPoint, access: ProcessingAccess, p: Readonly<Record<string, unknown>>, extent: GFXRect, backsideIndex: number, shadingIndex?: number): Sample {
  const projected = projectedCoordinate(position, extent, p.angle as number);
  const front = 1 - (p.time as number);
  const halfBand = Math.min(.45, (p.radius as number) / projected.span);
  if (projected.axis < front - halfBand) return access.sample(0, position);
  if (projected.axis > front + halfBand) return access.sample(1, position);
  const back = access.sample(backsideIndex, position);
  if (shadingIndex === undefined) return back;
  const shade = luma(straight(access.sample(shadingIndex, position)));
  const factor = .55 + .45 * clamp(shade);
  return { r: back.r * factor, g: back.g * factor, b: back.b * factor, a: back.a };
}

transitions.pageCurl = transitionDefinition(
  "pageCurl",
  4,
  value => {
    const p = fields(value, ["time", "angle", "extent", "radius"]);
    return {
      time: requiredTime(p.time),
      angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128),
      extent: requiredRect(p.extent),
      radius: requiredNumber(p.radius, 1e-6, 1e6),
    };
  },
  (position, access, p, _source, extent) => curlSample(position, access, p, extent, 2, 3),
  true,
);

transitions.pageCurlWithShadow = transitionDefinition(
  "pageCurlWithShadow",
  3,
  value => {
    const p = fields(value, ["time", "angle", "extent", "radius", "shadowAmount", "shadowExtent", "shadowSize"]);
    return {
      time: requiredTime(p.time),
      angle: requiredNumber(p.angle, -Math.PI * 128, Math.PI * 128),
      extent: requiredRect(p.extent),
      radius: requiredNumber(p.radius, 1e-6, 1e6),
      shadowAmount: requiredNumber(p.shadowAmount, 0, 1),
      shadowExtent: requiredRect(p.shadowExtent),
      shadowSize: requiredNumber(p.shadowSize, 1e-6, 1e6),
    };
  },
  (position, access, p, _source, extent) => {
    const base = curlSample(position, access, p, extent, 2);
    const projected = projectedCoordinate(position, extent, p.angle as number);
    const front = 1 - (p.time as number);
    const distance = Math.abs(projected.axis - front) * projected.span;
    const shadowExtent = p.shadowExtent as GFXRect;
    const insideShadow = position.x >= shadowExtent.x && position.x < shadowExtent.x + shadowExtent.width && position.y >= shadowExtent.y && position.y < shadowExtent.y + shadowExtent.height;
    const shadow = insideShadow ? clamp(1 - distance / (p.shadowSize as number)) * (p.shadowAmount as number) : 0;
    return over({ r: 0, g: 0, b: 0, a: shadow }, base);
  },
  true,
);

transitions.ripple = transitionDefinition(
  "ripple",
  3,
  value => {
    const p = fields(value, ["time", "center", "extent", "scale", "width"]);
    return {
      time: requiredTime(p.time),
      center: requiredPoint(p.center),
      extent: requiredRect(p.extent),
      scale: requiredNumber(p.scale, -1e6, 1e6),
      width: requiredNumber(p.width, 1e-6, 1e6),
    };
  },
  (position, access, p, _source, extent) => {
    const center = p.center as GFXPoint;
    const dx = position.x - center.x, dy = position.y - center.y;
    const distance = Math.hypot(dx, dy);
    const maximum = Math.hypot(extent.width, extent.height) / 2;
    const front = (p.time as number) * maximum;
    const width = p.width as number, delta = distance - front;
    if (delta < -width) return access.sample(1, position);
    if (delta > width) return access.sample(0, position);
    const phase = delta / width;
    const displacement = Math.sin(phase * Math.PI) * (p.scale as number);
    const inv = distance > 1e-9 ? 1 / distance : 0;
    const warped = access.sample(0, { x: position.x + dx * inv * displacement, y: position.y + dy * inv * displacement });
    const shade = luma(straight(access.sample(2, position)));
    const brightness = .75 + .5 * (shade - .5) * (1 - Math.abs(phase));
    return premult({ ...straight(warped), r: straight(warped).r * brightness, g: straight(warped).g * brightness, b: straight(warped).b * brightness });
  },
  true,
);
