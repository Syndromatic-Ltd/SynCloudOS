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

export interface NSEShapedTextWindow { readonly start: number; readonly end: number; readonly text: string }
export class NSEUnsupportedShapedTextError extends Error {
  constructor(readonly feature: string) { super(`Shaped text does not support ${feature}.`); this.name = "NSEUnsupportedShapedTextError"; }
}
export function createNSEShapedTextWindows(text: string, maximumUnits = 65536): readonly NSEShapedTextWindow[] {
  if (typeof text !== "string" || !Number.isSafeInteger(maximumUnits) || maximumUnits < 1 || maximumUnits > 65536) throw new RangeError("Shaping window limit must be within 1..65536 UTF-16 units.");
  const windows: NSEShapedTextWindow[] = [];
  let paragraphStart = 0, windowStart = 0, windowEnd = 0;
  const append = (end: number) => {
    if (end - paragraphStart > maximumUnits) throw new NSEUnsupportedShapedTextError("oversize-individual-paragraph");
    if (end - windowStart > maximumUnits) {
      windows.push(Object.freeze({ start: windowStart, end: windowEnd, text: text.slice(windowStart, windowEnd) }));
      windowStart = paragraphStart;
    }
    windowEnd = end; paragraphStart = end;
  };
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\r" && text[index + 1] === "\n") { index++; append(index + 1); }
    else if (/[\r\n\u2029]/u.test(text[index]!)) append(index + 1);
  }
  if (paragraphStart < text.length) append(text.length);
  windows.push(Object.freeze({ start: windowStart, end: windowEnd, text: text.slice(windowStart, windowEnd) }));
  return Object.freeze(windows);
}
