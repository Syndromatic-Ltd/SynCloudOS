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

import { canonicalNSETextData } from "./textValidation";
import { textRun } from "./attributedContent";
import type { NSEAttributedTextAttributes } from "./textTypes";

/** Pixel-valued v1 shadow intent; no resolved font or backend object. */
export interface NSETextShadow { readonly colour: string; readonly blur: number; readonly offsetX: number; readonly offsetY: number }

export function normaliseTextShadow(value: unknown): NSETextShadow {
  const data = canonicalNSETextData(value, "Text shadow") as Record<string, unknown>;
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(key => !["colour", "blur", "offsetX", "offsetY"].includes(key))) throw new TypeError("Invalid text shadow properties.");
  if (typeof data.colour !== "string" || !/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(data.colour)) throw new TypeError("Invalid shadow colour.");
  for (const [key, min] of [["blur",0],["offsetX",-64],["offsetY",-64]] as const) if (typeof data[key] !== "number" || !Number.isFinite(data[key]) || (data[key] as number) < min || (data[key] as number) > 64) throw new TypeError(`Invalid shadow ${key}.`);
  return Object.freeze({colour:data.colour.toLowerCase(),blur:data.blur as number,offsetX:data.offsetX as number,offsetY:data.offsetY as number});
}

export function normaliseNSETextAttributes(value: unknown): NSEAttributedTextAttributes {
  return textRun("", value as NSEAttributedTextAttributes).attributes ?? Object.freeze({});
}
