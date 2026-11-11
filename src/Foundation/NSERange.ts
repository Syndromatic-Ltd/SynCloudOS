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

export interface NSERange { readonly location: number; readonly length: number }

export function normaliseNSERange(value: NSERange): NSERange {
  if (!Number.isSafeInteger(value.location) || value.location < 0) {
    throw new RangeError("Range location must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(value.length) || value.length < 0) {
    throw new RangeError("Range length must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(value.location + value.length)) {
    throw new RangeError("Range end exceeds the safe integer range.");
  }
  return Object.freeze({ location: value.location, length: value.length });
}

export const NSEEqualRanges = (left: NSERange, right: NSERange): boolean =>
  left.location === right.location && left.length === right.length;

export function NSEIntersectionRange(left: NSERange, right: NSERange): NSERange {
  const a = normaliseNSERange(left);
  const b = normaliseNSERange(right);
  const location = Math.max(a.location, b.location);
  const end = Math.min(a.location + a.length, b.location + b.length);
  return end <= location ? normaliseNSERange({ location: 0, length: 0 }) : normaliseNSERange({ location, length: end - location });
}
