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
  normaliseAffineTransform,
  type GFXAffineTransform,
} from "../GraphicsFX/GFXGeometry";
export class AFXSingularTransformError extends RangeError {
  constructor() {
    super("The transform cannot be inverted.");
    this.name = "AFXSingularTransformError";
  }
}
export interface AFXPoint3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
/** Column-major 4 by 4 transform, using the same affine convention as GFX. */
export class AFXTransform3D {
  readonly values: readonly number[];
  /** Set only while adopting an array this module has just computed. */
  static #adopting = false;
  constructor(
    values: readonly number[] = [
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ],
  ) {
    // An indexed loop, not every(): every() skips holes and boxes each
    // double for its callback, which dominated renderer allocation.
    if (values.length !== 16)
      throw new RangeError("A transform requires 16 finite components.");
    for (let index = 0; index < 16; index++)
      if (!Number.isFinite(values[index]))
        throw new RangeError("A transform requires 16 finite components.");
    this.values = Object.freeze(
      AFXTransform3D.#adopting ? values as number[] : [...values],
    );
    Object.freeze(this);
  }
  /** Takes ownership of a fresh array no caller can reach, skipping the copy. */
  static #adopt(values: number[]): AFXTransform3D {
    AFXTransform3D.#adopting = true;
    try {
      return new AFXTransform3D(values);
    } finally {
      AFXTransform3D.#adopting = false;
    }
  }
  static fromCSS(
    css: string,
    size: Readonly<{ width: number; height: number }> = { width: 0, height: 0 },
  ): AFXTransform3D {
    if (css.trim() === "none") return new AFXTransform3D();
    const operations = [...css.matchAll(/([a-zA-Z0-9]+)\(([^()]*)\)/g)];
    if (
      !operations.length ||
      css.replace(/([a-zA-Z0-9]+)\(([^()]*)\)/g, "").trim()
    )
      throw new TypeError("Unsupported transform expression.");
    let result = new AFXTransform3D();
    for (const operation of operations) {
      const name = operation[1],
        args = operation[2]
          .trim()
          .split(/\s*,\s*|\s+/)
          .filter(Boolean);
      const arities: Record<string, readonly number[]> = {
        matrix3d: [16],
        matrix: [6],
        translate: [1, 2],
        translate3d: [3],
        translateX: [1],
        translateY: [1],
        translateZ: [1],
        scale: [1, 2],
        scale3d: [3],
        scaleX: [1],
        scaleY: [1],
        scaleZ: [1],
        rotate: [1],
        rotateZ: [1],
        rotateX: [1],
        rotateY: [1],
        rotate3d: [4],
        perspective: [1],
      };
      if (!arities[name]?.includes(args.length))
        throw new TypeError(
          "Unsupported transform function or argument count.",
        );
      const number = (
        index: number,
        kind: "x" | "y" | "z" | "angle" | "unit" = "unit",
        fallback?: number,
      ): number => {
        if (args[index] === undefined && fallback !== undefined)
          return fallback;
        const match =
          /^([-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?)(px|deg|rad|turn|%)?$/i.exec(
            args[index] ?? "",
          );
        if (!match)
          throw new TypeError(
            "Transform components must be finite numeric values.",
          );
        let value = Number(match[1]);
        if (!Number.isFinite(value))
          throw new RangeError("Transform components must be finite.");
        const unit = match[2]?.toLowerCase();
        if (kind === "unit" && unit)
          throw new TypeError(
            "Dimensionless transform components cannot have units.",
          );
        if (kind === "angle") {
          if (unit === "deg") value *= Math.PI / 180;
          else if (unit === "turn") value *= Math.PI * 2;
          else if (unit && unit !== "rad")
            throw new TypeError("Invalid angle unit.");
        } else if (unit === "%") {
          if (kind !== "x" && kind !== "y")
            throw new TypeError("Percentage requires a planar translation.");
          value *= size[kind === "x" ? "width" : "height"] / 100;
        } else if (unit && unit !== "px")
          throw new TypeError("Invalid transform unit.");
        return value;
      };
      let next: AFXTransform3D;
      switch (name) {
        case "matrix3d":
          if (args.length !== 16)
            throw new TypeError("matrix3d requires 16 values.");
          next = new AFXTransform3D(args.map((_, i) => number(i)));
          break;
        case "matrix":
          if (args.length !== 6)
            throw new TypeError("matrix requires six values.");
          next = AFXTransform3D.fromAffine({
            a: number(0),
            b: number(1),
            c: number(2),
            d: number(3),
            tx: number(4),
            ty: number(5),
          });
          break;
        case "translate":
          if (args.length > 2)
            throw new TypeError("translate requires one or two values.");
          next = AFXTransform3D.translation(number(0, "x"), number(1, "y", 0));
          break;
        case "translate3d":
          if (args.length !== 3)
            throw new TypeError("translate3d requires three values.");
          next = AFXTransform3D.translation(
            number(0, "x"),
            number(1, "y"),
            number(2, "z"),
          );
          break;
        case "translateX":
          next = AFXTransform3D.translation(number(0, "x"), 0);
          break;
        case "translateY":
          next = AFXTransform3D.translation(0, number(0, "y"));
          break;
        case "translateZ":
          next = AFXTransform3D.translation(0, 0, number(0, "z"));
          break;
        case "scale":
          next = AFXTransform3D.scale(number(0), number(1, "unit", number(0)));
          break;
        case "scale3d":
          if (args.length !== 3)
            throw new TypeError("scale3d requires three values.");
          next = AFXTransform3D.scale(number(0), number(1), number(2));
          break;
        case "scaleX":
          next = AFXTransform3D.scale(number(0), 1, 1);
          break;
        case "scaleY":
          next = AFXTransform3D.scale(1, number(0), 1);
          break;
        case "scaleZ":
          next = AFXTransform3D.scale(1, 1, number(0));
          break;
        case "rotate":
        case "rotateZ":
          next = AFXTransform3D.rotation(number(0, "angle"));
          break;
        case "rotateX":
          next = AFXTransform3D.rotation(number(0, "angle"), 1, 0, 0);
          break;
        case "rotateY":
          next = AFXTransform3D.rotation(number(0, "angle"), 0, 1, 0);
          break;
        case "rotate3d":
          if (args.length !== 4)
            throw new TypeError("rotate3d requires four values.");
          next = AFXTransform3D.rotation(
            number(3, "angle"),
            number(0),
            number(1),
            number(2),
          );
          break;
        case "perspective":
          next = AFXTransform3D.perspective(number(0, "z"));
          break;
        default:
          throw new TypeError(`Unsupported transform function: ${name}.`);
      }
      result = result.multiply(next);
    }
    return result;
  }
  static fromAffine(value: GFXAffineTransform): AFXTransform3D {
    const t = normaliseAffineTransform(value);
    return AFXTransform3D.#adopt([
      t.a,
      t.b,
      0,
      0,
      t.c,
      t.d,
      0,
      0,
      0,
      0,
      1,
      0,
      t.tx,
      t.ty,
      0,
      1,
    ]);
  }
  toAffine(): GFXAffineTransform {
    const m = this.values;
    if (
      m[2] ||
      m[3] ||
      m[6] ||
      m[7] ||
      m[8] ||
      m[9] ||
      m[11] ||
      m[14] ||
      m[10] !== 1 ||
      m[15] !== 1
    )
      throw new RangeError("Transform is not affine.");
    return normaliseAffineTransform({
      a: m[0],
      b: m[1],
      c: m[4],
      d: m[5],
      tx: m[12],
      ty: m[13],
    });
  }
  static translation(x: number, y: number, z = 0) {
    return AFXTransform3D.#adopt([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  }
  static scale(x: number, y = x, z = 1) {
    return AFXTransform3D.#adopt([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
  }
  static rotation(radians: number, x = 0, y = 0, z = 1) {
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(radians) || !Number.isFinite(length) || !length)
      throw new RangeError(
        "Rotation requires a finite angle and nonzero axis.",
      );
    x /= length;
    y /= length;
    z /= length;
    const c = Math.cos(radians),
      s = Math.sin(radians),
      t = 1 - c;
    return AFXTransform3D.#adopt([
      t * x * x + c,
      t * x * y + s * z,
      t * x * z - s * y,
      0,
      t * x * y - s * z,
      t * y * y + c,
      t * y * z + s * x,
      0,
      t * x * z + s * y,
      t * y * z - s * x,
      t * z * z + c,
      0,
      0,
      0,
      0,
      1,
    ]);
  }
  static perspective(distance: number) {
    if (!Number.isFinite(distance) || distance <= 0)
      throw new RangeError("Perspective distance must be positive.");
    return AFXTransform3D.#adopt([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      -1 / distance,
      0,
      0,
      0,
      1,
    ]);
  }
  multiply(right: AFXTransform3D): AFXTransform3D {
    const a = this.values;
    const b = right.values;
    const a0 = a[0]!, a1 = a[1]!, a2 = a[2]!, a3 = a[3]!;
    const a4 = a[4]!, a5 = a[5]!, a6 = a[6]!, a7 = a[7]!;
    const a8 = a[8]!, a9 = a[9]!, a10 = a[10]!, a11 = a[11]!;
    const a12 = a[12]!, a13 = a[13]!, a14 = a[14]!, a15 = a[15]!;
    const b0 = b[0]!, b1 = b[1]!, b2 = b[2]!, b3 = b[3]!;
    const b4 = b[4]!, b5 = b[5]!, b6 = b[6]!, b7 = b[7]!;
    const b8 = b[8]!, b9 = b[9]!, b10 = b[10]!, b11 = b[11]!;
    const b12 = b[12]!, b13 = b[13]!, b14 = b[14]!, b15 = b[15]!;
    // A packed literal: one allocation, adopted without a defensive copy.
    return AFXTransform3D.#adopt([
      a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3,
      a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3,
      a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3,
      a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3,
      a0 * b4 + a4 * b5 + a8 * b6 + a12 * b7,
      a1 * b4 + a5 * b5 + a9 * b6 + a13 * b7,
      a2 * b4 + a6 * b5 + a10 * b6 + a14 * b7,
      a3 * b4 + a7 * b5 + a11 * b6 + a15 * b7,
      a0 * b8 + a4 * b9 + a8 * b10 + a12 * b11,
      a1 * b8 + a5 * b9 + a9 * b10 + a13 * b11,
      a2 * b8 + a6 * b9 + a10 * b10 + a14 * b11,
      a3 * b8 + a7 * b9 + a11 * b10 + a15 * b11,
      a0 * b12 + a4 * b13 + a8 * b14 + a12 * b15,
      a1 * b12 + a5 * b13 + a9 * b14 + a13 * b15,
      a2 * b12 + a6 * b13 + a10 * b14 + a14 * b15,
      a3 * b12 + a7 * b13 + a11 * b14 + a15 * b15,
    ]);
  }
  inverse(): AFXTransform3D {
    const rows = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 8 }, (_, column) =>
        column < 4 ? this.values[column * 4 + row] : column - 4 === row ? 1 : 0,
      ),
    );
    for (let column = 0; column < 4; column++) {
      let pivot = column;
      for (let row = column + 1; row < 4; row++)
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column]))
          pivot = row;
      if (Math.abs(rows[pivot][column]) < Number.EPSILON)
        throw new AFXSingularTransformError();
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column];
      rows[column] = rows[column].map((x) => x / divisor);
      for (let row = 0; row < 4; row++)
        if (row !== column) {
          const scale = rows[row][column];
          rows[row] = rows[row].map((x, i) => x - scale * rows[column][i]);
        }
    }
    const result = Array.from(
      { length: 16 },
      (_, i) => rows[i % 4][4 + Math.floor(i / 4)],
    );
    if (!result.every(Number.isFinite)) throw new AFXSingularTransformError();
    return AFXTransform3D.#adopt(result);
  }
  transformPoint(point: AFXPoint3D): AFXPoint3D {
    if (![point.x, point.y, point.z].every(Number.isFinite))
      throw new RangeError("Point must be finite.");
    const m = this.values,
      p = [point.x, point.y, point.z, 1];
    const out = Array.from({ length: 4 }, (_, row) =>
      p.reduce((sum, v, column) => sum + v * m[column * 4 + row], 0),
    );
    if (!Number.isFinite(out[3]) || Math.abs(out[3]) < Number.EPSILON)
      throw new AFXSingularTransformError();
    const result = {
      x: out[0] / out[3],
      y: out[1] / out[3],
      z: out[2] / out[3],
    };
    if (!Object.values(result).every(Number.isFinite))
      throw new RangeError("Projected point is not finite.");
    return Object.freeze(result);
  }
  toCSS(): string {
    return `matrix3d(${this.values.join(",")})`;
  }
}
