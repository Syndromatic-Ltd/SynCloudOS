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

import { expect, it, vi } from "vitest";
import { AFXLayer, AFXTransaction, AFXTransform3D } from "../../../src/FX/AnimationFX/public";

function makeLayer(applied: Array<{ opacity: number; x: number }>) {
  return new AFXLayer({
    supportedProperties: ["frame", "opacity", "transform", "sublayerTransform"],
    supportedContentKinds: ["image"],
    apply(presentation) { applied.push({ opacity: presentation.opacity, x: presentation.position.x }); },
    attach() {}, detach() {}, setMask() {}, dispose() {},
  }, { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false });
}

it("batches model changes across multiple layers until the outer transaction commits", () => {
  const firstApplied: Array<{ opacity: number; x: number }> = [];
  const secondApplied: Array<{ opacity: number; x: number }> = [];
  const first = makeLayer(firstApplied), second = makeLayer(secondApplied);
  const firstBaseline = firstApplied.length, secondBaseline = secondApplied.length;
  AFXTransaction.begin();
  AFXTransaction.setDisableActions(true);
  first.opacity = .4;
  first.frame = { x: 10, y: 0, width: 20, height: 20 };
  AFXTransaction.begin();
  second.opacity = .6;
  AFXTransaction.commit();
  expect(first.model.opacity).toBe(.4);
  expect(firstApplied).toHaveLength(firstBaseline);
  expect(secondApplied).toHaveLength(secondBaseline);
  AFXTransaction.commit();
  expect(firstApplied).toHaveLength(firstBaseline + 1);
  expect(secondApplied).toHaveLength(secondBaseline + 1);
  expect(firstApplied.at(-1)).toMatchObject({ opacity: .4, x: 20 });
  expect(secondApplied.at(-1)?.opacity).toBe(.6);
  first.dispose(); second.dispose();
});

it("exposes scoped duration and disabled-actions settings", () => {
  AFXTransaction.begin();
  AFXTransaction.setAnimationDuration(.7);
  AFXTransaction.setDisableActions(true);
  expect(AFXTransaction.animationDuration()).toBe(.7);
  expect(AFXTransaction.disableActions()).toBe(true);
  AFXTransaction.begin();
  expect(AFXTransaction.animationDuration()).toBe(.7);
  AFXTransaction.setAnimationDuration(.2);
  AFXTransaction.commit();
  expect(AFXTransaction.animationDuration()).toBe(.7);
  AFXTransaction.commit();
  expect(() => AFXTransaction.commit()).toThrow(/active/i);
});

it("flushes pending layer projection once and keeps the transaction open", () => {
  const applied: Array<{ opacity: number; x: number }> = [];
  const layer = makeLayer(applied);
  const baseline = applied.length;
  AFXTransaction.begin();
  layer.opacity = .5;
  AFXTransaction.flush();
  expect(applied).toHaveLength(baseline + 1);
  layer.opacity = .8;
  AFXTransaction.commit();
  expect(applied).toHaveLength(baseline + 2);
  expect(applied.at(-1)?.opacity).toBe(.8);
  layer.dispose();
});

it("runs its completion block only after implicit animations settle", async () => {
  const layer = makeLayer([]);
  layer.actions = { opacity: { duration: 1, timing: "linear" } };
  const completed = vi.fn();
  AFXTransaction.begin();
  AFXTransaction.setCompletionBlock(completed);
  layer.opacity = .25;
  expect(layer.animationForKey("opacity")).toBeNull();
  AFXTransaction.commit();
  expect(completed).not.toHaveBeenCalled();
  const handle = layer.animationForKey("opacity");
  expect(handle).not.toBeNull();
  handle?.cancel();
  await handle?.finished;
  await Promise.resolve();
  expect(completed).toHaveBeenCalledOnce();
  layer.dispose();
});

it("animates sublayerTransform as a shared child-camera transform", () => {
  const parent = makeLayer([]);
  const child = makeLayer([]);
  parent.addSublayer(child);
  parent.actions = { sublayerTransform: { duration: 1, timing: "linear" } };

  parent.sublayerTransform = AFXTransform3D.translation(100, 0, 0);
  const handle = parent.animationForKey("sublayerTransform");
  expect(handle).not.toBeNull();
  handle?.pause();
  handle?.seek(.5);

  expect(parent.presentation.sublayerTransform.transformPoint({ x: 0, y: 0, z: 0 }).x).toBeCloseTo(50);
  expect(child.presentation.inheritedTransform.transformPoint({ x: 0, y: 0, z: 0 }).x).toBeCloseTo(50);

  parent.dispose();
  child.dispose();
});
