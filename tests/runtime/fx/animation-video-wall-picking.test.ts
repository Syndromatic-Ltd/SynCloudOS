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
import { AFXTransform3D, AFXRenderer } from "../../../src/FX/AnimationFX/public";
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

it("matches depth writing and draw order when transparent and opaque quads overlap", () => {
  const content = atlas();
  const wall = new AFXRenderer({ scheduler, target: { render() {}, dispose() {} }, width: 100, height: 100,  });
  const translucent = wall.makeLayer(); translucent.frame = { x: 0, y: 0, width: 100, height: 100 };
  translucent.contents = content; translucent.zPosition = 10; translucent.opacity = .5;
  const opaque = wall.makeLayer(); opaque.frame = { x: 0, y: 0, width: 100, height: 100 }; opaque.contents = content;
  wall.setPickable(translucent, true); wall.setPickable(opaque, true);
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(opaque);
  translucent.opacity = 1;
  wall.render();
  expect(wall.hitTest({ x: 50, y: 50 })).toBe(translucent);
  wall.dispose(); content.close();
});
