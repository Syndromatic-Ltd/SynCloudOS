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

import { normaliseRect, rectContainsPoint, type GFXRect } from "../../FX/GraphicsFX/GFXGeometry";
import { TFXFrame, type TFXFrameLine } from "../../FX/TextFX/TFXFrame";
import { logicalDirection, positionedInlineAdvance } from "../../FX/TextFX/TFXInlineGeometry";
import { sameNSETextCoordinateSpace, snapshotNSETextCoordinateSpace, type NSETextCoordinateSpace } from "./textCoordinateSpaces";
import { sameNSETextGeometryRevision, snapshotNSETextGeometryRevision, type NSETextGeometryProvider, type NSETextGeometryQuery, type NSETextGeometryRevision, type NSETextSelectionGeometry, type NSETextGeometryPosition, type NSETextGeometryRange, type NSETextGeometryPoint } from "./textGeometryTypes";
export interface NSEShapedTextGeometryFrame { readonly frame: TFXFrame; readonly textOffset: number; readonly containerId: string; readonly space: NSETextCoordinateSpace }
export interface NSEShapedTextGeometryProviderOptions { readonly flowId: string; readonly revision: NSETextGeometryRevision; readonly textLength: number; readonly complete: boolean; readonly frames: readonly NSEShapedTextGeometryFrame[]; readonly isCurrent?: (revision: NSETextGeometryRevision) => boolean; readonly signal?: AbortSignal }
function lineRect(item: TFXFrameLine, start = 0, length = item.line.width): GFXRect {
  return normaliseRect(item.line.orientation === "vertical"
    ? { x: item.origin.x - item.line.ascent, y: item.origin.y + start, width: item.line.ascent + item.line.descent, height: length }
    : { x: item.origin.x + start, y: item.origin.y - item.line.ascent, width: length, height: item.line.ascent + item.line.descent });
}
export function createNSEShapedTextGeometryProvider(options: NSEShapedTextGeometryProviderOptions): NSETextGeometryProvider & { dispose(): void } {
  if (!options.flowId?.trim() || !Number.isSafeInteger(options.textLength) || options.textLength < 0 || typeof options.complete !== "boolean") throw new TypeError("Invalid shaped geometry identity or extent.");
  const revision = snapshotNSETextGeometryRevision(options.revision), flowId = options.flowId, textLength = options.textLength, complete = options.complete;
  const frames = Object.freeze(options.frames.map(record => {
    if (!(record.frame instanceof TFXFrame) || !record.containerId?.trim() || !Number.isSafeInteger(record.textOffset) || record.textOffset < 0 || record.textOffset + record.frame.visibleRange.end > textLength) throw new RangeError("Invalid shaped frame map.");
    const space = snapshotNSETextCoordinateSpace(record.space);
    if (space.units === "device-pixels") throw new TypeError("Shaped semantic geometry cannot use raster units.");
    return Object.freeze({ frame: record.frame, textOffset: record.textOffset, containerId: record.containerId, space });
  }));
  if (new Set(frames.map(frame => frame.space.units)).size > 1) throw new TypeError("A geometry provider must declare one semantic unit system.");
  let disposed = false;
  const current = () => !disposed && !options.signal?.aborted && (options.isCurrent?.(revision) ?? true);
  const valid = (query: NSETextGeometryQuery) => current() && query?.flowId === flowId && sameNSETextGeometryRevision(query.revision, revision);
  const integer = (offset: number) => Number.isSafeInteger(offset) && offset >= 0 && offset <= textLength;
  return Object.freeze({
    snapshot: () => Object.freeze({ flowId, revision, textLength, complete, current: current(), kind: "shaped" as const, units: frames[0]?.space.units as "points" | "css-pixels" ?? "points" }),
    caret(position: NSETextGeometryPosition) {
      if (!valid(position) || !integer(position.offset) || !["upstream", "downstream"].includes(position.affinity)) return null;
      const candidates = frames.flatMap(record => record.frame.lines.filter(item => position.offset >= record.textOffset + item.line.start && position.offset <= record.textOffset + item.line.end).map(item => ({ record, item })));
      const candidate = position.affinity === "upstream" ? candidates[0] : candidates[candidates.length - 1];
      if (!candidate) return null;
      const { record, item } = candidate, offsets = item.line.offsetForStringIndex(position.offset - record.textOffset);
      const spatial = (offset: number) => Object.freeze({ rect: lineRect(item, offset, 0), space: record.space, transformRevision: 0 });
      return Object.freeze({ flowId, revision, offset: position.offset, affinity: position.affinity, containerId: record.containerId, primary: spatial(offsets.primary), secondary: offsets.primary === offsets.secondary ? null : spatial(offsets.secondary), visibility: "visible" as const });
    },
    selection(range: NSETextGeometryRange) {
      if (!valid(range) || !integer(range.location) || !Number.isSafeInteger(range.length) || range.length < 0 || !integer(range.location + range.length) || !range.length) return Object.freeze([]);
      const result: NSETextSelectionGeometry[] = [];
      for (const record of frames) for (const item of record.frame.lines) for (const run of item.line.runs) {
        const start = Math.max(range.location - record.textOffset, run.start), end = Math.min(range.location + range.length - record.textOffset, run.end);
        if (end <= start) continue;
        const width = positionedInlineAdvance(run), rtl = logicalDirection(run.shaped.direction) === "rtl";
        const runStart = run.x, runEnd = run.x + width;
        const edge = (index: number) => {
          if (index === run.start) return rtl ? runEnd : runStart;
          if (index === run.end) return rtl ? runStart : runEnd;
          const offsets = item.line.offsetForStringIndex(index);
          return [offsets.primary, offsets.secondary].find(offset => offset >= runStart - 1e-9 && offset <= runEnd + 1e-9) ?? offsets.primary;
        };
        const a = edge(start), b = edge(end);
        result.push(Object.freeze({ flowId, revision, location: start + record.textOffset, length: end - start, containerId: record.containerId, rect: lineRect(item, Math.min(a, b), Math.abs(b - a)), space: record.space, transformRevision: 0 }));
      }
      return Object.freeze(result);
    },
    positionAt(point: NSETextGeometryPoint) {
      if (!valid(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.transformRevision !== 0 || !point.space || (point.outside !== undefined && !["reject", "nearest"].includes(point.outside))) return null;
      let closest: { record: typeof frames[number]; item: TFXFrameLine } | null = null, distance = Infinity;
      for (const record of frames) {
        if (!sameNSETextCoordinateSpace(point.space, record.space)) continue;
        for (const item of record.frame.lines) {
          const rect = lineRect(item), inside = rectContainsPoint(rect, point);
          if (!inside && point.outside !== "nearest") continue;
          const dx = Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width), dy = Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height);
          if (dx * dx + dy * dy < distance) { distance = dx * dx + dy * dy; closest = { record, item }; }
        }
      }
      if (!closest) return null;
      const { record, item } = closest, inline = item.line.orientation === "vertical" ? point.y - item.origin.y : point.x - item.origin.x;
      const offset = record.textOffset + item.line.stringIndexForPosition(inline);
      return Object.freeze({ flowId, revision, offset, affinity: "downstream" as const });
    },
    dispose() { disposed = true; },
  });
}
