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

import { expect, it } from "vitest";
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";
import { packQuadVertices, quadVertices } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer";

const scene = { width: 100, height: 100 };
const quad = (transform: AFXTransform3D) => ({
  transform, bounds: { x: 0, y: 0, width: 100, height: 100 },
  uv: { x: 0, y: 0, width: 1, height: 1 }, opacity: 1,
});

it("clips a projected layer at the near plane while preserving valid UVs", () => {
  const crosses = new AFXTransform3D([1, 0, 0, -.02, 0, 1, 0, 0,
    0, 0, 1, 0, 0, 0, 0, 1]);
  const vertices = quadVertices(quad(crosses) as never, scene as never);
  expect(vertices.length).toBeGreaterThan(0);
  expect(vertices.length % (3 * 17)).toBe(0);
  for (let index = 0; index < vertices.length; index += 17) {
    expect(vertices[index + 3]).toBeGreaterThanOrEqual(.05 - 1e-9);
    expect(vertices[index + 4]).toBeGreaterThanOrEqual(0);
    expect(vertices[index + 4]).toBeLessThanOrEqual(1);
    expect(vertices[index + 5]).toBeGreaterThanOrEqual(0);
    expect(vertices[index + 5]).toBeLessThanOrEqual(1);
  }
  const behind = new AFXTransform3D([1, 0, 0, 0, 0, 1, 0, 0,
    0, 0, 1, 0, 0, 0, 0, -1]);
  expect(quadVertices(quad(behind) as never, scene as never)).toEqual([]);
});

it("packs ordinary and clipped quad batches without changing projected geometry", () => {
  const ordinary = quad(AFXTransform3D.translation(4, 5, 0));
  const crosses = quad(new AFXTransform3D([1, 0, 0, -.02, 0, 1, 0, 0,
    0, 0, 1, 0, 0, 0, 0, 1]));
  for (const quads of [[ordinary, ordinary], [ordinary, crosses]]) {
    const expected = new Float32Array(quads.flatMap((item) => quadVertices(item as never, scene as never)));
    expect(packQuadVertices(quads as never, scene as never)).toEqual(expected);
  }
});

it("reads each ordinary quad transform once while packing the fast path", () => {
  const matrix = AFXTransform3D.translation(4, 5, 0).values;
  let reads = 0;
  const ordinary = {
    ...quad(AFXTransform3D.translation(4, 5, 0)),
    transform: {
      get values() {
        reads += 1;
        return matrix;
      },
    },
  };

  packQuadVertices([ordinary] as never, scene as never);

  expect(reads).toBe(1);
});

it("packs a run of quads in place exactly as it packs the same run copied out", async () => {
  const { packAntialiasedQuadVertices } = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserAFXAntialiasing");
  const crosses = quad(new AFXTransform3D([1, 0, 0, -.02, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
  const quads = [quad(AFXTransform3D.translation(1, 2, 0)), crosses, quad(AFXTransform3D.translation(4, 5, 0)),
    { ...quad(AFXTransform3D.scale(.5)), edgeAntialiasingMask: 5 }, quad(AFXTransform3D.translation(9, 9, 0))];
  expect(packQuadVertices(quads as never, scene as never, undefined, 1, 4))
    .toEqual(packQuadVertices(quads.slice(1, 4) as never, scene as never));
  const aa = quads.map(item => ({ edgeAntialiasingMask: 15, ...item }));
  expect(packAntialiasedQuadVertices(aa as never, scene as never, 1, undefined, 1, 4))
    .toEqual(packAntialiasedQuadVertices(aa.slice(1, 4) as never, scene as never, 1));
  const storage = new Float32Array(3 * 9 * 17);
  expect(Array.from(packQuadVertices(quads as never, scene as never, storage, 1, 4)))
    .toEqual(Array.from(packQuadVertices(quads.slice(1, 4) as never, scene as never)));
});
