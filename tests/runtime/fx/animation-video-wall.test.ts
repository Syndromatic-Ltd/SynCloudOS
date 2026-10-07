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
import { AFXAnimation, AFXBasicAnimation, AFXRenderer } from "../../../src/FX/AnimationFX/public";
import type { AFXRendererScene } from "../../../src/FX/AnimationFX/host";
import { MEFXSampleTimingInfo, MEFXTime } from "../../../src/FX/MediaFX/public";
import { VFXFrame, VFXPixelBuffer, VFXVideoFormat } from "../../../src/FX/VideoFX/public";

const scheduler = {
  now: () => 0,
  requestFrame: () => () => {},
  reducedMotion: false,
  suspended: false,
};

function frame(index: number): VFXFrame {
  const pixels = new VFXPixelBuffer(new VFXVideoFormat({ codedWidth: 4, codedHeight: 4, pixelFormat: "rgba8", colourSpace: "srgb" }), new Uint8Array(64));
  const result = new VFXFrame({ pixels, timing: new MEFXSampleTimingInfo({ presentationTime: MEFXTime.finite(BigInt(index), 30) }) });
  pixels.close();
  return result;
}

it("shares one timed frame across independent contentsRect quads without per-layer pixel copies", () => {
  const scenes: AFXRendererScene[] = [];
  const wall = new AFXRenderer({ scheduler, width: 200, height: 100, target: { render(scene) { scenes.push(scene); }, dispose() {} } });
  const left = wall.makeLayer();
  const right = wall.makeLayer();
  left.frame = { x: 0, y: 0, width: 100, height: 100 };
  right.frame = { x: 100, y: 0, width: 100, height: 100 };
  const decoded = frame(12);
  left.contents = decoded;
  right.contents = decoded;
  left.contentsRect = { x: 0, y: 0, width: 0.5, height: 1 };
  right.contentsRect = { x: 0.5, y: 0, width: 0.5, height: 1 };
  wall.render();
  expect(scenes).toHaveLength(1);
  expect(scenes[0]?.quads).toHaveLength(2);
  expect(scenes[0]?.quads.map((quad) => quad.uv)).toEqual([
    { x: 0, y: 0, width: 0.5, height: 1 },
    { x: 0.5, y: 0, width: 0.5, height: 1 },
  ]);
  expect(scenes[0]?.quads[0]?.content).toBe(scenes[0]?.quads[1]?.content);
  expect(decoded.closed).toBe(false);
  left.contentsGravity = "resize-aspect";
  expect(() => wall.render()).toThrow(/gravity/i);
  left.contentsGravity = "resize";
  left.clipsToBounds = true;
  expect(() => wall.render()).toThrow(/clip/i);
  wall.dispose();
  decoded.close();
});

it("redraws changed video revisions and animated presentation layers through the owned frame scheduler", () => {
  let now = 0;
  const pending = new Set<(time: number) => void>();
  const dynamicScheduler = {
    now: () => now,
    requestFrame(callback: (time: number) => void) { pending.add(callback); return () => { pending.delete(callback); }; },
    reducedMotion: false,
    suspended: false,
  };
  const tick = (time: number) => {
    now = time;
    const callbacks = [...pending];
    pending.clear();
    callbacks.forEach((callback) => callback(time));
  };
  const submitted: Array<{ frame: VFXFrame | null; opacity: number }> = [];
  const wall = new AFXRenderer({ scheduler: dynamicScheduler, width: 100, height: 100,
    target: { render(scene) { submitted.push({ frame: scene.quads[0]?.content as VFXFrame ?? null, opacity: scene.quads[0]?.opacity ?? -1 }); }, dispose() {} } });
  const layer = wall.makeLayer();
  layer.frame = { x: 0, y: 0, width: 100, height: 100 };
  const first = frame(1), second = frame(2);
  layer.contents = first;
  tick(0);
  expect(submitted.at(-1)?.frame).toBe(first);
  layer.contents = second;
  tick(0.1);
  expect(submitted.at(-1)?.frame).toBe(second);
  layer.addAnimation(new AFXBasicAnimation({ targetId: "wall", keyPath: "opacity", from: 1, to: 0,
    animation: new AFXAnimation({ duration: 1, timing: "linear" }) }));
  tick(0.6);
  tick(0.6);
  expect(submitted.at(-1)?.opacity).toBeCloseTo(0.5);
  wall.dispose();
  const rendersAtDispose = submitted.length;
  tick(0.8);
  expect(submitted).toHaveLength(rendersAtDispose);
  first.close(); second.close();
});
