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
import { AFXTransform3D, AFXRenderer, type AFXLayer } from "../../../src/FX/AnimationFX/public";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import { VFXFrame, VFXPixelBuffer, VFXVideoFormat } from "../../../src/FX/VideoFX/public";

const scheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };
function atlas() {
  const pixels = new VFXPixelBuffer(new VFXVideoFormat({ codedWidth: 2, codedHeight: 2, pixelFormat: "rgba8", colourSpace: "srgb" }), new Uint8Array(16));
  const frame = new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(0n, 1) }) });
  pixels.close();
  return frame;
}

it("picks the last submitted moving overlap and ignores decorative quads", () => {
  const content = atlas();
  const wall = new AFXRenderer({ scheduler, target: { render() {}, dispose() {} }, width: 200, height: 100,  });
  const back = wall.makeLayer(); back.frame = { x: 0, y: 0, width: 100, height: 100 }; back.contents = content;
  const front = wall.makeLayer(); front.frame = { x: 0, y: 0, width: 100, height: 100 }; front.contents = content;
  const reflection = wall.makeLayer(); reflection.frame = { x: 0, y: 0, width: 100, height: 100 }; reflection.contents = content;
  wall.setPickable(back, true); wall.setPickable(front, true);
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(front);
  front.frame = { x: 110, y: 0, width: 100, height: 100 };
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(front);
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(back);
  expect(wall.hitTest({ x: 150, y: 50 })).toBe(front);
  wall.dispose(); content.close();
});

it("uses projected rotated geometry and excludes quads behind the near plane", () => {
  const content = atlas();
  const wall = new AFXRenderer({ scheduler, target: { render() {}, dispose() {} }, width: 200, height: 100,  });
  const back = wall.makeLayer(); back.frame = { x: 0, y: 0, width: 100, height: 100 }; back.contents = content;
  const turned = wall.makeLayer(); turned.frame = { x: 0, y: 0, width: 100, height: 100 }; turned.contents = content;
  turned.transform = AFXTransform3D.rotation(Math.PI / 3, 0, 1, 0);
  wall.setPickable(back, true); wall.setPickable(turned, true);
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(turned);
  expect(wall.hitTest({ x: 90, y: 50 })).toBe(back);
  turned.transform = AFXTransform3D.perspective(0.5).multiply(AFXTransform3D.translation(0, 0, 1));
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(back);
  wall.dispose(); content.close();
});

it("picks the front layer: by zPosition among flattened sublayers, by depth in a transform layer", () => {
  const content = atlas();
  const wall = new AFXRenderer({ scheduler, target: { render() {}, dispose() {} }, width: 100, height: 100,  });
  // Ordinary sublayers flatten, as CALayer's do: the greater zPosition draws, and picks, in front.
  const front = wall.makeLayer(); front.frame = { x: 0, y: 0, width: 100, height: 100 };
  front.contents = content; front.zPosition = 10; front.opacity = .5;
  const back = wall.makeLayer(); back.frame = { x: 0, y: 0, width: 100, height: 100 }; back.contents = content;
  wall.setPickable(front, true); wall.setPickable(back, true);
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(front);
  front.zPosition = -10;
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(back);
  front.hidden = true; back.hidden = true;
  // A transform layer's sublayers keep their depth, as CATransformLayer's do: a nearer opaque layer hides a
  // farther one drawn after it, and a translucent one does not.
  const place = (parent: AFXLayer) => {
    const near = wall.makeLayer(parent); near.frame = { x: 0, y: 0, width: 100, height: 100 }; near.contents = content;
    near.transform = AFXTransform3D.translation(0, 0, 10);
    const far = wall.makeLayer(parent); far.frame = { x: 0, y: 0, width: 100, height: 100 }; far.contents = content;
    wall.setPickable(near, true); wall.setPickable(far, true);
    return { near, far };
  };
  const flat = place(wall.makeLayer());
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(flat.far);
  flat.near.hidden = true; flat.far.hidden = true;
  const deep = place(wall.makeTransformLayer());
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(deep.near);
  deep.near.opacity = .5;
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(deep.far);
  wall.dispose(); content.close();
});

it("gives each transform layer and depth-preserving replicator its own depth context, and flattens other layers", () => {
  const content = atlas();
  const scenes: { quads: readonly { layer?: AFXLayer; depthContext?: number; minificationFilter?: string; magnificationFilter?: string }[] }[] = [];
  const renderer = new AFXRenderer({ scheduler, target: { render(scene) { scenes.push(scene); }, dispose() {} }, width: 100, height: 100 });
  const quad = (parent: AFXLayer, z = 0) => {
    const layer = renderer.makeLayer(parent); layer.frame = { x: 0, y: 0, width: 10, height: 10 }; layer.contents = content; layer.zPosition = z;
    return layer;
  };
  const flatRoot = renderer.makeLayer();
  const late = quad(flatRoot, -1), early = quad(flatRoot, 1);
  const space = renderer.makeTransformLayer();
  space.contents = content;
  const inSpace = quad(space), nested = quad(quad(space));
  const mirrors = renderer.makeReplicatorLayer(); mirrors.projectionMode = "projective";
  const mirrored = quad(mirrors);
  mirrored.minificationFilter = "trilinear"; mirrored.magnificationFilter = "nearest";
  renderer.render();
  const quads = scenes.at(-1)!.quads;
  const of = (layer: AFXLayer) => quads.find(entry => entry.layer === layer)!;
  // Flattened siblings draw in zPosition order, whatever order they were added in.
  expect(quads.indexOf(of(late))).toBeLessThan(quads.indexOf(of(early)));
  expect(of(late).depthContext).toBeUndefined();
  // A transform layer draws no contents of its own; its sublayers, nested ones too, share one context.
  expect(quads.some(entry => entry.layer === space)).toBe(false);
  expect(of(inSpace).depthContext).toBeGreaterThan(0);
  expect(of(nested).depthContext).toBe(of(inSpace).depthContext);
  expect(of(mirrored).depthContext).toBeGreaterThan(0);
  expect(of(mirrored).depthContext).not.toBe(of(inSpace).depthContext);
  expect(of(mirrored)).toMatchObject({ minificationFilter: "trilinear", magnificationFilter: "nearest" });
  expect(of(inSpace).minificationFilter).toBeUndefined();
  expect(() => { (inSpace as { magnificationFilter: string }).magnificationFilter = "trilinear"; }).toThrow(TypeError);
  renderer.dispose(); content.close();
});
