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
import { AFXLayer, AFXTransaction, AFXTransform3D, type AFXFrameScheduler } from "../../../src/FX/AnimationFX/public";
import { AFXAnimation, AFXBasicAnimation } from '../../../src/FX/AnimationFX/public';

it('advances delayed and constant animation time without resubmitting unchanged presentation', async () => {
  let now = 0;
  const pending = new Set<(time: number) => void>();
  const apply = vi.fn();
  const layer = new AFXLayer({ supportedProperties: ['opacity'], supportedContentKinds: ['image'],
    apply, attach() {}, detach() {}, setMask() {}, dispose() {},
  }, { now: () => now, reducedMotion: false, suspended: false,
    requestFrame(callback) { pending.add(callback); return () => { pending.delete(callback); }; } });
  const handle = layer.addAnimation(new AFXBasicAnimation({ targetId: 'test', keyPath: 'opacity', from: 0, to: 1,
    animation: new AFXAnimation({ delay: 1, duration: 1, fill: 'both', timing: 'linear' }) }));
  const tick = (time: number) => { now = time; const batch = [...pending]; pending.clear(); batch.forEach(callback => callback(time)); };
  const initial = apply.mock.calls.length;
  tick(.2); tick(.4); tick(.8);
  expect(apply).toHaveBeenCalledTimes(initial);
  expect(handle.progress).toBeCloseTo(.4);
  tick(1.5);
  expect(layer.presentation.opacity).toBeCloseTo(.5);
  expect(apply).toHaveBeenCalledTimes(initial + 1);
  tick(2);
  expect((await handle.finished).state).toBe('completed');
  expect(layer.presentation.opacity).toBe(1);
  expect(pending.size).toBe(0);
  layer.dispose();
});

it("coalesces concurrent JS-backed layer properties into one frame tick and one presentation apply", () => {
  let now = 0;
  const pending = new Set<(timestamp: number) => void>();
  const scheduler: AFXFrameScheduler = {
    now: () => now,
    requestFrame(callback) {
      pending.add(callback);
      return () => pending.delete(callback);
    },
    reducedMotion: false,
    suspended: false,
  };
  const applied: Array<{ opacity: number; x: number }> = [];
  const layer = new AFXLayer({
    supportedProperties: ["frame", "opacity", "transform"],
    supportedContentKinds: ["image"],
    apply(snapshot) { applied.push({ opacity: snapshot.opacity, x: snapshot.position.x }); },
    attach() {}, detach() {}, setMask() {}, dispose() {},
  }, scheduler);
  layer.actions = {
    frame: { duration: 1, timing: "linear" },
    transform: { duration: 1, timing: "linear" },
    opacity: { duration: 1, timing: "linear" },
  };

  AFXTransaction.begin();
  layer.frame = { x: 200, y: 0, width: 100, height: 100 };
  layer.transform = AFXTransform3D.rotation(Math.PI / 4, 0, 1, 0);
  layer.opacity = .25;
  AFXTransaction.commit();

  expect([...layer.animationKeys()].sort()).toEqual(["frame", "opacity", "transform"]);
  expect(pending.size).toBe(1);
  const baseline = applied.length;
  now = .1;
  const callbacks = [...pending];
  pending.clear();
  for (const callback of callbacks) callback(now);
  expect(applied).toHaveLength(baseline + 1);
  expect([...layer.animationKeys()].sort()).toEqual(["frame", "opacity", "transform"]);
  expect(pending.size).toBe(1);

  layer.dispose();
});

it("reuses a parsed sampled transform across repeated presentation reads", () => {
  let now = 0;
  const scheduler: AFXFrameScheduler = {
    now: () => now,
    requestFrame() {
      return () => {};
    },
    reducedMotion: false,
    suspended: false,
  };
  const layer = new AFXLayer({
    supportedProperties: ["transform"],
    supportedContentKinds: ["image"],
    apply() {}, attach() {}, detach() {}, setMask() {}, dispose() {},
  }, scheduler);
  layer.actions = { transform: { duration: 1, timing: "linear" } };
  layer.transform = AFXTransform3D.translation(120, 40, -30);

  now = .25;
  const fromCSS = vi.spyOn(AFXTransform3D, "fromCSS");
  void layer.presentation;
  fromCSS.mockClear();
  void layer.presentation;
  void layer.presentation;

  expect(fromCSS).not.toHaveBeenCalled();
  fromCSS.mockRestore();
  layer.dispose();
});
