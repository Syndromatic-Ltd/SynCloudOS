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

import { concatenateTransforms, invertTransform, normaliseAffineTransform, normalisePoint, transformPoint, transformRect, type GFXAffineTransform, type GFXPoint } from "../../FX/GraphicsFX/GFXGeometry";
import { sameNSETextCoordinateSpace, snapshotNSETextCoordinateSpace, type NSETextCoordinateSpace } from "./textCoordinateSpaces";
import type { NSETextSpatialPoint, NSETextSpatialRect } from "./textGeometryTypes";
export interface NSETextGeometryTransform { readonly from: NSETextCoordinateSpace; readonly to: NSETextCoordinateSpace; readonly revision: number; readonly matrix: GFXAffineTransform }
export interface NSETextPresentationTransformOptions { readonly layoutSpace: NSETextCoordinateSpace; readonly revision: number; readonly zoom: number; readonly scroll: GFXPoint; readonly clientOffset: GFXPoint; readonly screenOffset: GFXPoint; readonly devicePixelRatio: number }
export function createNSETextGeometryTransform(options: NSETextGeometryTransform): NSETextGeometryTransform {
  if (!Number.isSafeInteger(options.revision) || options.revision < 0) throw new RangeError("Transform revision must be a non-negative safe integer.");
  const matrix = normaliseAffineTransform(options.matrix);
  invertTransform(matrix);
  return Object.freeze({ from: snapshotNSETextCoordinateSpace(options.from), to: snapshotNSETextCoordinateSpace(options.to), revision: options.revision, matrix });
}
export function invertNSETextGeometryTransform(transform: NSETextGeometryTransform): NSETextGeometryTransform {
  return createNSETextGeometryTransform({ from: transform.to, to: transform.from, revision: transform.revision, matrix: invertTransform(transform.matrix) });
}
function checkSpace(value: NSETextSpatialPoint | NSETextSpatialRect, transform: NSETextGeometryTransform): void {
  if (value.transformRevision !== transform.revision) throw new RangeError("Text geometry transform revision is stale.");
  if (!sameNSETextCoordinateSpace(value.space, transform.from)) throw new TypeError("Text geometry source space does not match transform.");
}
export function projectNSETextGeometryPoint(point: NSETextSpatialPoint, transform: NSETextGeometryTransform): NSETextSpatialPoint {
  checkSpace(point, transform);
  return Object.freeze({ ...transformPoint(point, transform.matrix), space: transform.to, transformRevision: transform.revision });
}
export function projectNSETextGeometryRect(rect: NSETextSpatialRect, transform: NSETextGeometryTransform): NSETextSpatialRect {
  checkSpace(rect, transform);
  return Object.freeze({ rect: transformRect(rect.rect, transform.matrix), space: transform.to, transformRevision: transform.revision });
}
export function createNSETextPresentationTransforms(options: NSETextPresentationTransformOptions): Readonly<{ client: NSETextGeometryTransform; screen: NSETextGeometryTransform; canvas: NSETextGeometryTransform }> {
  const { zoom, devicePixelRatio: dpr, revision } = options;
  if (!(Number.isFinite(zoom) && zoom > 0 && Number.isFinite(dpr) && dpr > 0)) throw new RangeError("Zoom and DPR must be finite and positive.");
  const from = snapshotNSETextCoordinateSpace(options.layoutSpace);
  if (from.units === "device-pixels") throw new TypeError("Semantic text layout must use points or CSS pixels.");
  const scroll = normalisePoint(options.scroll), clientOffset = normalisePoint(options.clientOffset), screenOffset = normalisePoint(options.screenOffset);
  const scale = zoom * (from.units === "points" ? 96 / 72 : 1);
  // Scroll is in unzoomed CSS reference pixels. Client offsets are CSS viewport pixels.
  const viewport = { a: scale, b: 0, c: 0, d: scale, tx: -scroll.x, ty: -scroll.y };
  const clientMatrix = { ...viewport, tx: viewport.tx + clientOffset.x, ty: viewport.ty + clientOffset.y };
  return Object.freeze({
    client: createNSETextGeometryTransform({ from, to: { name: "css-client", units: "css-pixels" }, revision, matrix: clientMatrix }),
    screen: createNSETextGeometryTransform({ from, to: { name: "screen", units: "css-pixels" }, revision, matrix: { ...clientMatrix, tx: clientMatrix.tx + screenOffset.x, ty: clientMatrix.ty + screenOffset.y } }),
    canvas: createNSETextGeometryTransform({ from, to: { name: "canvas", units: "device-pixels" }, revision, matrix: concatenateTransforms({ a: dpr, b: 0, c: 0, d: dpr, tx: 0, ty: 0 }, viewport) }),
  });
}
