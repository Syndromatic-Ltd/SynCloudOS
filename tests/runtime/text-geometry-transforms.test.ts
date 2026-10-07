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

import { describe, expect, it } from "vitest";
import { createNSETextGeometryTransform, createNSETextPresentationTransforms, invertNSETextGeometryTransform, projectNSETextGeometryPoint, projectNSETextGeometryRect } from "../../src/NSE/TextLayout/textGeometryTransforms";
const page = { name: "container:body", units: "points" as const };
describe("named text geometry transforms", () => {
  it("keeps points, CSS client, screen and canvas raster units separate", () => {
    const transforms = createNSETextPresentationTransforms({ layoutSpace: page, revision: 7, zoom: 1.5, scroll: { x: 20, y: 30 }, clientOffset: { x: 100, y: 200 }, screenOffset: { x: 300, y: 400 }, devicePixelRatio: 2 });
    const point = { x: 72, y: 36, space: page, transformRevision: 7 };
    expect(projectNSETextGeometryPoint(point, transforms.client)).toMatchObject({ x: 224, y: 242, space: { name: "css-client", units: "css-pixels" } });
    expect(projectNSETextGeometryPoint(point, transforms.screen)).toMatchObject({ x: 524, y: 642 });
    expect(projectNSETextGeometryPoint(point, transforms.canvas)).toMatchObject({ x: 248, y: 84, space: { name: "canvas", units: "device-pixels" } });
    expect(projectNSETextGeometryPoint({ x: 224, y: 242, space: transforms.client.to, transformRevision: 7 }, invertNSETextGeometryTransform(transforms.client))).toMatchObject({ x: 72, y: 36 });
  });
  it("projects all rotated rectangle corners and rejects stale or singular transforms", () => {
    const t = createNSETextGeometryTransform({ from: page, to: { name: "rotated", units: "points" }, revision: 2, matrix: { a: 0, b: 1, c: -1, d: 0, tx: 10, ty: 20 } });
    expect(projectNSETextGeometryRect({ rect: { x: 1, y: 2, width: 3, height: 4 }, space: page, transformRevision: 2 }, t).rect).toEqual({ x: 4, y: 21, width: 4, height: 3 });
    expect(() => projectNSETextGeometryPoint({ x: 0, y: 0, space: page, transformRevision: 1 }, t)).toThrow(/stale/i);
    expect(() => createNSETextGeometryTransform({ ...t, matrix: { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 } })).toThrow(/singular/i);
    expect(() => createNSETextPresentationTransforms({ layoutSpace: page, revision: 0, zoom: 0, scroll: { x: 0, y: 0 }, clientOffset: { x: 0, y: 0 }, screenOffset: { x: 0, y: 0 }, devicePixelRatio: 2 })).toThrow();
  });
});
