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

export type NSETextGeometryUnits = "points" | "css-pixels" | "device-pixels";
/** Names are supplied by the owner (for example container:body, canvas, css-client or screen). */
export interface NSETextCoordinateSpace { readonly name: string; readonly units: NSETextGeometryUnits }
export function snapshotNSETextCoordinateSpace(space: NSETextCoordinateSpace): NSETextCoordinateSpace {
  if (!space || typeof space.name !== "string" || !space.name.trim() || space.name.length > 256 || !["points", "css-pixels", "device-pixels"].includes(space.units)) throw new TypeError("A named text coordinate space with explicit units is required.");
  return Object.freeze({ name: space.name, units: space.units });
}
export function sameNSETextCoordinateSpace(a: NSETextCoordinateSpace, b: NSETextCoordinateSpace): boolean { return a.name === b.name && a.units === b.units; }
