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

import { paragraph } from "./attributedContent";
import type { NSEAttributedParagraph } from "./textTypes";
/** v1 indent/tab values are CSS pixels; line height is a unitless multiple. */
export type NSEParagraphAttributes = NonNullable<NSEAttributedParagraph["attributes"]>;
export function normaliseNSEParagraphAttributes(value: unknown): NSEParagraphAttributes {
  return paragraph([], value as NSEParagraphAttributes).attributes ?? Object.freeze({});
}
export function nseCSSPixelsToPoints(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Unit conversion requires a finite number.");
  return value * 72 / 96;
}
export function nsePointsToCSSPixels(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Unit conversion requires a finite number.");
  return value * 96 / 72;
}
