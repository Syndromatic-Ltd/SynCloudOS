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
import type { NSETextPosition, NSETextSnapshot, NSETextRange, NSETextAffinity, NSETextGravity } from "./textTypes";

export function isNSEUTF16Boundary(text: string, offset: number): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) return false;
  if (!offset || offset === text.length) return true;
  const left = text.charCodeAt(offset - 1), right = text.charCodeAt(offset);
  return !(left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff);
}
export function validateNSETextRange(text: string, input: NSETextRange): NSETextRange {
  const range = canonicalNSETextData(input, "Text range") as NSETextRange;
  if (!range || Object.keys(range).some(key => !["location", "length"].includes(key)) || !Number.isSafeInteger(range.location) || !Number.isSafeInteger(range.length) || range.location < 0 || range.length < 0 || range.location + range.length > text.length) throw new RangeError("Invalid UTF-16 text range.");
  if (!isNSEUTF16Boundary(text, range.location) || !isNSEUTF16Boundary(text, range.location + range.length)) throw new RangeError("Text range must not split a surrogate pair boundary.");
  return range;
}
export function createNSETextPosition(snapshot: NSETextSnapshot, offset: number, options: {readonly affinity?: NSETextAffinity; readonly gravity?: NSETextGravity} = {}): NSETextPosition {
  if (!isNSEUTF16Boundary(snapshot.text, offset)) throw new RangeError("Invalid UTF-16 position boundary.");
  const affinity = options.affinity ?? "downstream", gravity = options.gravity ?? "after";
  if (!["upstream", "downstream"].includes(affinity) || !["before", "after"].includes(gravity)) throw new TypeError("Invalid text position affinity or gravity.");
  return Object.freeze({flowId:snapshot.flowId,revision:snapshot.revision,ownerGeneration:snapshot.ownerGeneration,offset,affinity,gravity});
}
export function nseGraphemeBoundaries(text: string): readonly number[] {
  const segmenter = new Intl.Segmenter(undefined, {granularity:"grapheme"});
  return Object.freeze([...segmenter.segment(text)].map(segment => segment.index).concat(text.length));
}
export function nseGraphemeDeletionRange(text: string, offset: number, direction: "backward" | "forward"): NSETextRange {
  if (!isNSEUTF16Boundary(text, offset)) throw new RangeError("Invalid grapheme position boundary.");
  if (direction !== "backward" && direction !== "forward") throw new TypeError("Invalid deletion direction.");
  const boundaries = nseGraphemeBoundaries(text);
  if (direction === "backward" && offset === 0 || direction === "forward" && offset === text.length) return Object.freeze({location:offset,length:0});
  const exact = boundaries.indexOf(offset);
  const right = exact < 0 ? boundaries.findIndex(value => value > offset) : exact;
  const start = exact < 0 || direction === "backward" ? boundaries[right - 1]! : offset;
  const end = exact < 0 || direction === "backward" ? boundaries[right]! : boundaries[right + 1]!;
  return Object.freeze({location:start,length:end-start});
}
