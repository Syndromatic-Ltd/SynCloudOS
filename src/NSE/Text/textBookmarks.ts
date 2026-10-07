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

import { createNSETextPosition, validateNSETextRange } from "./textPositions";
import type { NSETextChangeMap } from "./textChanges";
import type { NSETextPosition, NSETextRange, NSETextSnapshot } from "./textTypes";

export interface NSETextBookmark { readonly start: NSETextPosition; readonly end: NSETextPosition }
export function createNSETextBookmark(snapshot: NSETextSnapshot, range: NSETextRange): NSETextBookmark {
  validateNSETextRange(snapshot.text,range);
  return Object.freeze({start:createNSETextPosition(snapshot,range.location),end:createNSETextPosition(snapshot,range.location+range.length,{gravity:range.length ? "before" : "after"})});
}
export function mapNSETextBookmark(bookmark: NSETextBookmark, map: NSETextChangeMap): NSETextBookmark | null {
  const start=map.map(bookmark.start),end=map.map(bookmark.end);
  return !start || !end || end.offset < start.offset || bookmark.end.offset>bookmark.start.offset && end.offset===start.offset ? null : Object.freeze({start,end});
}
