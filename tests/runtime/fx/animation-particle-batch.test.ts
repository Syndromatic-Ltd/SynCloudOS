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

import { expect, it } from 'vitest';
import { AFXRenderer, AFXTransform3D } from '../../../src/FX/AnimationFX/public';
import { GFXColour, GFXImage } from '../../../src/FX/GraphicsFX/public';
import type { AFXRendererScene } from '../../../src/FX/AnimationFX/AFXRenderer';

function fixture(maximumQuads = 4096, supportsParticleBatches = false) {
  const scenes: AFXRendererScene[] = [];
  const renderer = new AFXRenderer({ width: 1280, height: 720, maximumQuads,
    scheduler: { now: () => 0, reducedMotion: false, suspended: false, requestFrame: () => () => {} },
    target: { supportsParticleBatches, render(scene) { scenes.push(scene); }, dispose() {} } });
  const image = new GFXImage({ width: 4, height: 2, data: new Uint8Array(32).fill(255),
    alpha: 'straight', colourSpace: 'srgb' });
  return { renderer, scenes, image };
}

it('submits independent particles through one AFX layer with inherited transforms and opacity', () => {
  const { renderer, scenes, image } = fixture();
  const parent = renderer.makeLayer(); parent.transform = AFXTransform3D.translation(100, 50); parent.opacity = .5;
  const layer = renderer.makeParticleLayer(parent);
  const particles = [{ id: 1, contents: image, position: { x: 20, y: 30 }, zPosition: 7,
    renderOrder: 0, colour: GFXColour.rgba(.2, .4, .6, .8), scale: 2, rotation: Math.PI / 2 }];
  layer.setParticles(particles);
  particles[0].position.x = 900; // Publication owns its geometry, borrows only the image.
  renderer.render();
  const q = scenes.at(-1)!.quads[0];
  expect(q.content).toBe(image);
  expect(q.transform.transformPoint({ x: 0, y: 0, z: 0 })).toEqual({ x: 120, y: 80, z: 7 });
  expect(q.opacity).toBe(.4);
  expect(q.bounds).toEqual({ x: -2, y: -1, width: 4, height: 2 });
  expect(q.colourModulation?.scale.r).toBeCloseTo(.2);
  layer.setParticles([]); renderer.render(); expect(scenes.at(-1)!.quads).toHaveLength(0);
  renderer.dispose(); expect(() => layer.setParticles([])).toThrow(expect.objectContaining({ code: "AFX_LAYER_DISPOSED" }));
});

it('preserves interleaved layer order, transforms, masks and the shared budget in compact submissions', () => {
  const { renderer, scenes, image } = fixture(3, true);
  const before = renderer.makeLayer(); before.contents = image; before.frame = { x: 0, y: 0, width: 4, height: 2 };
  const layer = renderer.makeParticleLayer(); layer.opacity = .4; layer.transform = AFXTransform3D.translation(20, 30);
  const mask = renderer.makeLayer(null); mask.contents = image; mask.frame = before.frame; layer.setMask(mask);
  const particle = { id: 1, contents: image, position: { x: 3, y: 5 }, zPosition: 0, renderOrder: 0,
    colour: GFXColour.rgba(.5, .6, .7, .8), scale: 2, rotation: .2 };
  layer.setParticles([particle]);
  const after = renderer.makeLayer(); after.contents = image; after.frame = before.frame;
  renderer.render();
  const scene = scenes.at(-1)!;
  expect(scene.quads.map(q => q.layer)).toEqual([before, after]);
  expect(scene.particleBatches).toHaveLength(1);
  const batch = scene.particleBatches![0];
  expect(batch.beforeQuad).toBe(1); expect(batch.opacity).toBe(.4);
  expect(batch.transform.transformPoint({ x: 0, y: 0, z: 0 })).toEqual({ x: 20, y: 30, z: 0 });
  expect(batch.mask?.content).toBe(image); expect(batch.particles[0]).toEqual(particle);
  layer.setParticles([particle, { ...particle, id: 2 }]); expect(() => renderer.render()).toThrow(/budget/);
  renderer.dispose();
});

it('rejects invalid particle batches atomically and respects the renderer quad budget', () => {
  const { renderer, scenes, image } = fixture(1);
  const layer = renderer.makeParticleLayer();
  const p = { id: 1, contents: image, position: { x: 0, y: 0 }, zPosition: 0, renderOrder: 0,
    colour: GFXColour.rgba(1,1,1,1), scale: 1, rotation: 0 };
  layer.setParticles([p]);
  expect(() => layer.setParticles([{ ...p, scale: NaN }])).toThrow();
  expect(() => layer.setParticles([p, p])).toThrow(/unique/);
  renderer.render(); expect(scenes.at(-1)!.quads).toHaveLength(1);
  layer.setParticles([p, { ...p, id: 2 }]); expect(() => renderer.render()).toThrow(/budget/);
  renderer.dispose();
});
