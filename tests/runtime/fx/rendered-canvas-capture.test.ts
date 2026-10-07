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
import { prepareRenderedCanvasCapture, registerRenderedCanvasCapture } from "../../../src/SynCloudOS/AnimationFX/renderedCanvasCapture";

it("redraws a live canvas synchronously and releases only the registration it owns", () => {
  const canvas = {};
  let calls = 0;
  const releaseFirst = registerRenderedCanvasCapture(canvas, () => { calls++; });
  expect(prepareRenderedCanvasCapture(canvas)).toBe(true);
  expect(calls).toBe(1);
  const releaseNext = registerRenderedCanvasCapture(canvas, () => { calls += 10; });
  releaseFirst();
  expect(prepareRenderedCanvasCapture(canvas)).toBe(true);
  expect(calls).toBe(11);
  releaseNext();
  expect(prepareRenderedCanvasCapture(canvas)).toBe(true);
  expect(calls).toBe(11);
});

it("declines capture if the renderer cannot redraw its current frame", () => {
  const canvas = {};
  const release = registerRenderedCanvasCapture(canvas, () => { throw new Error("device lost"); });
  expect(prepareRenderedCanvasCapture(canvas)).toBe(false);
  release();
});
