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

import { GFXColourProfile, d50ReferenceWhite, d50XYZToLinearSRGB, linearSRGBToD50XYZ } from "./GFXColourProfile";
import type { GFXColourSpace } from "./colourTypes";

export interface GFXExtendedRGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface GFXCMYKComponents {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly a?: number;
}

export interface GFXLabD50Components {
  readonly l: number;
  readonly a: number;
  readonly b: number;
  readonly alpha?: number;
}

export type GFXRenderingIntent = "perceptual" | "relative-colorimetric" | "saturation" | "absolute-colorimetric";
export type GFXGamutMapping = "preserve" | "clip";
export type GFXToneMapPolicy = "none" | "clip" | "reinhard";

export class GFXColourTransformUnsupportedError extends Error {
  readonly backend: string;
  readonly disposition: string;
  constructor(backend: string, disposition: string) {
    super(`${backend} colour transform is unsupported: ${disposition}.`);
    this.name = "GFXColourTransformUnsupportedError";
    this.backend = backend;
    this.disposition = disposition;
  }
}

export interface GFXColourTransformOptions {
  readonly source: GFXColourSpace | GFXColourProfile;
  readonly destination: GFXColourSpace | GFXColourProfile;
  readonly intent?: GFXRenderingIntent;
  readonly blackPointCompensation?: boolean;
  readonly gamutMapping?: GFXGamutMapping;
  readonly toneMap?: GFXToneMapPolicy;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const finite = (value: number, name: string) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
};
const decodeSRGB = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const encodeSRGB = (value: number) => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

function multiply(matrix: readonly number[], value: readonly number[]): readonly [number, number, number] {
  return [
    matrix[0]! * value[0]! + matrix[1]! * value[1]! + matrix[2]! * value[2]!,
    matrix[3]! * value[0]! + matrix[4]! * value[1]! + matrix[5]! * value[2]!,
    matrix[6]! * value[0]! + matrix[7]! * value[1]! + matrix[8]! * value[2]!,
  ];
}

const p3ToSRGB = Object.freeze([
  1.224745266, -0.224904366, -0.000000000,
  -0.042057932, 1.042081002, -0.000000000,
  -0.019642281, -0.078654917, 1.098537198,
]);
const srgbToP3 = Object.freeze([
  0.822592870, 0.177533953, 0.000000000,
  0.033199514, 0.966783501, 0.000000000,
  0.017085348, 0.072395720, 0.910301476,
]);

function toLinearSRGB(value: GFXExtendedRGBA, space: GFXColourSpace): GFXExtendedRGBA {
  if (space === "linear-srgb") return value;
  if (space === "grayscale") {
    const white = decodeSRGB(value.r);
    return Object.freeze({ r: white, g: white, b: white, a: value.a });
  }
  const decoded = [decodeSRGB(value.r), decodeSRGB(value.g), decodeSRGB(value.b)] as const;
  const rgb = space === "display-p3" ? multiply(p3ToSRGB, decoded) : decoded;
  return Object.freeze({ r: rgb[0], g: rgb[1], b: rgb[2], a: value.a });
}

function fromLinearSRGB(value: GFXExtendedRGBA, space: GFXColourSpace): GFXExtendedRGBA {
  if (space === "linear-srgb") return value;
  if (space === "grayscale") {
    const encoded = encodeSRGB(0.2126 * value.r + 0.7152 * value.g + 0.0722 * value.b);
    return Object.freeze({ r: encoded, g: encoded, b: encoded, a: value.a });
  }
  const linear = space === "display-p3" ? multiply(srgbToP3, [value.r, value.g, value.b]) : [value.r, value.g, value.b] as const;
  return Object.freeze({ r: encodeSRGB(linear[0]), g: encodeSRGB(linear[1]), b: encodeSRGB(linear[2]), a: value.a });
}

function applyOutputPolicy(value: GFXExtendedRGBA, gamut: GFXGamutMapping, toneMap: GFXToneMapPolicy): GFXExtendedRGBA {
  const map = (channel: number) => {
    let next = channel;
    if (toneMap === "reinhard") next = next < 0 ? next / (1 - next) : next / (1 + next);
    if (toneMap === "clip" || gamut === "clip") next = clamp(next);
    return next;
  };
  return Object.freeze({ r: map(value.r), g: map(value.g), b: map(value.b), a: clamp(value.a) });
}

/** Explicit extended-range named-space transform. RGB is never clipped unless policy requests it. */
export class GFXColourTransform {
  readonly source: GFXColourSpace | GFXColourProfile;
  readonly destination: GFXColourSpace | GFXColourProfile;
  readonly intent: GFXRenderingIntent;
  readonly blackPointCompensation: boolean;
  readonly gamutMapping: GFXGamutMapping;
  readonly toneMap: GFXToneMapPolicy;

  constructor(options: GFXColourTransformOptions) {
    if (!options || typeof options !== "object") throw new TypeError("Colour transform options required.");
    const named = (value: unknown): value is GFXColourSpace => typeof value === "string" && ["srgb", "display-p3", "grayscale", "linear-srgb"].includes(value);
    if (!(named(options.source) || options.source instanceof GFXColourProfile) || !(named(options.destination) || options.destination instanceof GFXColourProfile))
      throw new TypeError("Unsupported named colour space.");
    this.source = options.source;
    this.destination = options.destination;
    this.intent = options.intent ?? "relative-colorimetric";
    if (!["perceptual", "relative-colorimetric", "saturation", "absolute-colorimetric"].includes(this.intent)) throw new TypeError("Unsupported rendering intent.");
    this.blackPointCompensation = options.blackPointCompensation ?? false;
    if (typeof this.blackPointCompensation !== "boolean") throw new TypeError("Black-point compensation must be boolean.");
    this.gamutMapping = options.gamutMapping ?? "preserve";
    if (this.gamutMapping !== "preserve" && this.gamutMapping !== "clip") throw new TypeError("Unsupported gamut mapping policy.");
    this.toneMap = options.toneMap ?? "none";
    if (!["none", "clip", "reinhard"].includes(this.toneMap)) throw new TypeError("Unsupported tone-map policy.");
    Object.freeze(this);
  }

  apply(value: GFXExtendedRGBA): GFXExtendedRGBA {
    const source = Object.freeze({ r: finite(value.r, "red"), g: finite(value.g, "green"), b: finite(value.b, "blue"), a: finite(value.a, "alpha") });
    if (source.a < 0 || source.a > 1) throw new RangeError("Alpha must be a finite unit value.");
    const linear = this.source instanceof GFXColourProfile ? toLinearSRGB(this.source.toSRGB(source), "srgb") : toLinearSRGB(source, this.source);
    if (this.destination instanceof GFXColourProfile) {
      const encoded = applyOutputPolicy(fromLinearSRGB(linear, "srgb"), this.gamutMapping, this.toneMap);
      return Object.freeze(this.destination.fromSRGB(encoded));
    }
    const converted = fromLinearSRGB(linear, this.destination);
    return applyOutputPolicy(converted, this.gamutMapping, this.toneMap);
  }

  static fromCMYK(value: GFXCMYKComponents): GFXExtendedRGBA {
    const c = finite(value.c, "cyan"), m = finite(value.m, "magenta"), y = finite(value.y, "yellow"), k = finite(value.k, "black"), a = finite(value.a ?? 1, "alpha");
    if ([c, m, y, k, a].some(component => component < 0 || component > 1)) throw new RangeError("CMYK and alpha components must be unit values.");
    return Object.freeze({ r: (1 - c) * (1 - k), g: (1 - m) * (1 - k), b: (1 - y) * (1 - k), a });
  }

  static fromLabD50(value: GFXLabD50Components): GFXExtendedRGBA {
    const l = finite(value.l, "L*"), a = finite(value.a, "a*"), b = finite(value.b, "b*"), alpha = finite(value.alpha ?? 1, "alpha");
    if (l < 0 || l > 100 || alpha < 0 || alpha > 1) throw new RangeError("Lab lightness and alpha are out of range.");
    const fy = (l + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const delta = 6 / 29;
    const inverse = (v: number) => v > delta ? v ** 3 : 3 * delta ** 2 * (v - 4 / 29);
    const rgb = d50XYZToLinearSRGB({ x: d50ReferenceWhite.x * inverse(fx), y: d50ReferenceWhite.y * inverse(fy), z: d50ReferenceWhite.z * inverse(fz) });
    return Object.freeze({ ...rgb, a: alpha });
  }

  static toLabD50(value: GFXExtendedRGBA): Readonly<{ l: number; a: number; b: number; alpha: number }> {
    const alpha = finite(value.a, "alpha");
    if (alpha < 0 || alpha > 1) throw new RangeError("Alpha must be a unit value.");
    const xyz = linearSRGBToD50XYZ({ r: finite(value.r, "red"), g: finite(value.g, "green"), b: finite(value.b, "blue") });
    const delta = 6 / 29;
    const forward = (v: number) => v > delta ** 3 ? Math.cbrt(v) : v / (3 * delta ** 2) + 4 / 29;
    const fx = forward(xyz.x / d50ReferenceWhite.x), fy = forward(xyz.y / d50ReferenceWhite.y), fz = forward(xyz.z / d50ReferenceWhite.z);
    return Object.freeze({ l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz), alpha });
  }

  static unsupported(backend: string, disposition: string): never {
    if (!backend || !disposition) throw new TypeError("Backend and disposition are required.");
    throw new GFXColourTransformUnsupportedError(backend, disposition);
  }
}
