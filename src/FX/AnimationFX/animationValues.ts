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

import type { AFXAnimationScalar, AFXAnimationTiming } from "./animationTypes";
import { GFXGradient } from "../GraphicsFX/GFXGradient";
import { GFXPath } from "../GraphicsFX/GFXPath";

export function afxAnimationDataRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain data record.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new TypeError(`${label} may not contain symbols.`);
  const copy: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor))
      throw new TypeError(`${label}.${key} may not be an accessor.`);
    copy[key] = descriptor.value;
  }
  return copy;
}

export function afxAnimationNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(`${label} is outside its supported bounds.`);
  }
  return value;
}

export function afxAnimationScalar(
  value: unknown,
  label: string,
): AFXAnimationScalar {
  if (value instanceof GFXPath || value instanceof GFXGradient) return value;
  if (typeof value === "number")
    return afxAnimationNumber(
      value,
      label,
      -Number.MAX_VALUE,
      Number.MAX_VALUE,
    );
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).byteLength > 16_384)
      throw new RangeError(`${label} is too large.`);
    return value;
  }
  const record = afxAnimationDataRecord(value, label);
  if (Object.keys(record).length > 8)
    throw new RangeError(`${label} has too many fields.`);
  const clone: Record<string, number | string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "number")
      clone[key] = afxAnimationNumber(
        item,
        `${label}.${key}`,
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      );
    else if (typeof item === "string" && item.length <= 512) clone[key] = item;
    else
      throw new TypeError(
        `${label}.${key} must be a finite number or bounded string.`,
      );
  }
  return Object.freeze(clone);
}

export function afxAnimationTiming(value: unknown): AFXAnimationTiming {
  if (
    ["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(
      value as string,
    )
  )
    return value as AFXAnimationTiming;
  const record = afxAnimationDataRecord(value, "AFXAnimation timing");
  if (record.kind === "cubic-bezier")
    return Object.freeze({
      kind: "cubic-bezier" as const,
      x1: afxAnimationNumber(record.x1, "timing.x1", 0, 1),
      y1: afxAnimationNumber(
        record.y1,
        "timing.y1",
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
      x2: afxAnimationNumber(record.x2, "timing.x2", 0, 1),
      y2: afxAnimationNumber(
        record.y2,
        "timing.y2",
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      ),
    });
  if (record.kind === "spring")
    return Object.freeze({
      kind: "spring" as const,
      stiffness: afxAnimationNumber(
        record.stiffness,
        "timing.stiffness",
        0.01,
        10_000,
      ),
      damping: afxAnimationNumber(
        record.damping,
        "timing.damping",
        0.01,
        10_000,
      ),
      mass: afxAnimationNumber(record.mass, "timing.mass", 0.01, 100),
    });
  throw new TypeError("AFXAnimation timing is unsupported.");
}
