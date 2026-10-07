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

import type { GFXRect } from "../../FX/GraphicsFX/GFXGeometry";
import type { NSETextCoordinateSpace } from "./textCoordinateSpaces";
export interface NSETextGeometryRevision {
  readonly modelRevision: number;
  readonly layoutGeneration: number;
  readonly fontGeneration: number;
  readonly resourceGeneration: number;
  readonly containerGeneration: number;
  readonly ownerGeneration: number;
}
export interface NSETextGeometryQuery { readonly flowId: string; readonly revision: NSETextGeometryRevision }
export interface NSETextGeometryPosition extends NSETextGeometryQuery { readonly offset: number; readonly affinity: "upstream" | "downstream" }
export interface NSETextGeometryRange extends NSETextGeometryQuery { readonly location: number; readonly length: number }
export interface NSETextSpatialPoint { readonly x: number; readonly y: number; readonly space: NSETextCoordinateSpace; readonly transformRevision: number }
export interface NSETextSpatialRect { readonly rect: GFXRect; readonly space: NSETextCoordinateSpace; readonly transformRevision: number }
export interface NSETextGeometryPoint extends NSETextGeometryQuery, NSETextSpatialPoint { readonly outside?: "reject" | "nearest" }
export interface NSETextGeometrySnapshot extends NSETextGeometryQuery {
  readonly kind: "logical-dom" | "shaped";
  readonly complete: boolean;
  readonly current: boolean;
  readonly textLength: number;
  readonly units: "points" | "css-pixels";
}
export interface NSETextCaretGeometry extends NSETextGeometryPosition {
  readonly containerId: string;
  readonly primary: NSETextSpatialRect;
  readonly secondary: NSETextSpatialRect | null;
  readonly visibility: "visible";
}
export interface NSETextSelectionGeometry extends NSETextGeometryRange, NSETextSpatialRect { readonly containerId: string }
export interface NSETextGeometryProvider {
  snapshot(): NSETextGeometrySnapshot;
  caret(position: NSETextGeometryPosition): NSETextCaretGeometry | null;
  selection(range: NSETextGeometryRange): readonly NSETextSelectionGeometry[];
  positionAt(point: NSETextGeometryPoint): NSETextGeometryPosition | null;
}
export function snapshotNSETextGeometryRevision(revision: NSETextGeometryRevision): NSETextGeometryRevision {
  const keys = ["modelRevision", "layoutGeneration", "fontGeneration", "resourceGeneration", "containerGeneration", "ownerGeneration"] as const;
  if (!revision || keys.some(key => !Number.isSafeInteger(revision[key]) || revision[key] < 0)) throw new RangeError("Text geometry generations must be non-negative safe integers.");
  return Object.freeze(Object.fromEntries(keys.map(key => [key, revision[key]]))) as unknown as NSETextGeometryRevision;
}
export function sameNSETextGeometryRevision(a: NSETextGeometryRevision, b: NSETextGeometryRevision): boolean {
  return !!a && !!b && a.modelRevision === b.modelRevision && a.layoutGeneration === b.layoutGeneration && a.fontGeneration === b.fontGeneration && a.resourceGeneration === b.resourceGeneration && a.containerGeneration === b.containerGeneration && a.ownerGeneration === b.ownerGeneration;
}
