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
import { AFXRenderer, AFXTransform3D, type AFXRendererScene } from "../../../src/FX/AnimationFX/public";
import { GFXImage } from "../../../src/FX/GraphicsFX/public";

function harness() {
  const scenes: AFXRendererScene[] = [];
  const renderer = new AFXRenderer({
    scheduler: { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false },
    target: { render(scene) { scenes.push(scene); }, dispose() {} }, width: 200, height: 200,
  });
  return { renderer, scenes };
}
const pixel = (value: number) => new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb",
  data: new Uint8Array([value, 0, 0, 255]) });

it("returns one frozen sublayer list until the children change", () => {
  const { renderer } = harness();
  const parent = renderer.makeLayer();
  const first = renderer.makeLayer(parent);
  const listed = parent.sublayers;
  expect(parent.sublayers).toBe(listed);
  expect(Object.isFrozen(listed)).toBe(true);
  const second = renderer.makeLayer(parent);
  expect(parent.sublayers).not.toBe(listed);
  expect(listed).toEqual([first]);
  expect(parent.sublayers).toEqual([first, second]);
  const withBoth = parent.sublayers;
  parent.insertSublayer(second, 0);
  expect(parent.sublayers).toEqual([second, first]);
  expect(withBoth).toEqual([first, second]);
  const other = renderer.makeLayer();
  const beforeMove = parent.sublayers;
  other.addSublayer(first);
  expect(parent.sublayers).toEqual([second]);
  expect(other.sublayers).toEqual([first]);
  expect(beforeMove).toEqual([second, first]);
  second.removeFromSuperlayer();
  expect(parent.sublayers).toEqual([]);
  renderer.dispose();
});

it("retains an unchanged layer's quad and mask across submissions and replaces only what changed", () => {
  const { renderer, scenes } = harness();
  const [still, moving] = [renderer.makeLayer(), renderer.makeLayer()];
  for (const [index, layer] of [still, moving].entries()) {
    layer.frame = { x: 10 + index * 50, y: 10, width: 40, height: 40 };
    layer.contents = pixel(index);
  }
  const mask = renderer.makeLayer(null);
  mask.frame = { x: 0, y: 0, width: 40, height: 40 };
  mask.contents = pixel(255);
  still.setMask(mask);
  renderer.setPickable(still, true);
  renderer.render();
  renderer.render();
  const [first, second] = scenes.slice(-2) as [AFXRendererScene, AFXRendererScene];
  expect(second).not.toBe(first);
  expect(second.quads[0]).toBe(first.quads[0]);
  expect(second.quads[0]!.mask).toBe(first.quads[0]!.mask);
  expect(second.quads[1]).toBe(first.quads[1]);

  moving.opacity = .5;
  renderer.render();
  const third = scenes.at(-1)!;
  expect(third.quads[0]).toBe(first.quads[0]);
  expect(third.quads[1]).not.toBe(first.quads[1]);
  expect(third.quads[1]!.opacity).toBe(.5);

  renderer.setPickable(still, false);
  renderer.render();
  expect(scenes.at(-1)!.quads[0]!.pickable).toBe(false);
  expect(first.quads[0]!.pickable).toBe(true);

  const parentMoves = renderer.makeLayer();
  const child = renderer.makeLayer(parentMoves);
  child.frame = { x: 0, y: 0, width: 10, height: 10 };
  child.contents = pixel(9);
  renderer.render();
  const before = scenes.at(-1)!.quads.at(-1)!;
  parentMoves.transform = AFXTransform3D.translation(5, 0);
  renderer.render();
  const after = scenes.at(-1)!.quads.at(-1)!;
  expect(after).not.toBe(before);
  expect(after.transform.values[12]).toBe(before.transform.values[12] + 5);
  renderer.dispose();
});

it("shares frozen model values between snapshots until an animation or model write changes them", async () => {
  const { AFXBasicAnimation } = await import("../../../src/FX/AnimationFX/AFXBasicAnimation");
  const { AFXAnimation } = await import("../../../src/FX/AnimationFX/AFXAnimation");
  let time = 0;
  const pending = new Set<(timestamp: number) => void>();
  const renderer = new AFXRenderer({
    scheduler: { now: () => time, reducedMotion: false, suspended: false,
      requestFrame(callback) { pending.add(callback); return () => pending.delete(callback); } },
    target: { render() {}, dispose() {} }, width: 100, height: 100,
  });
  const layer = renderer.makeLayer();
  layer.frame = { x: 0, y: 0, width: 10, height: 10 };
  const idle = layer.presentation.values;
  expect(layer.presentation.values).toBe(idle);
  expect(layer.model.values).toBe(idle);
  expect(Object.isFrozen(idle)).toBe(true);
  layer.addAnimation(new AFXBasicAnimation({ targetId: "values", keyPath: "opacity", from: 0, to: 1,
    animation: new AFXAnimation({ duration: 1, timing: "linear" }) }));
  time = .5;
  for (const callback of [...pending]) { pending.delete(callback); callback(time); }
  const animated = layer.presentation.values;
  expect(animated).not.toBe(idle);
  expect(animated.opacity).toBeCloseTo(.5);
  expect(layer.model.values.opacity).toBe(1);
  time = 2;
  for (let frame = 0; frame < 3 && pending.size; frame++)
    for (const callback of [...pending]) { pending.delete(callback); callback(time); }
  expect(layer.presentation.values).toBe(layer.presentation.values);
  expect(layer.presentation.opacity).toBe(1);
  renderer.dispose();
});
