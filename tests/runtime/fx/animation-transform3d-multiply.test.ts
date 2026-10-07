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
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";

const referenceMultiply = (left: readonly number[], right: readonly number[]) =>
  Array.from({ length: 16 }, (_, index) => {
    const column = Math.floor(index / 4);
    const row = index % 4;
    let sum = 0;
    for (let k = 0; k < 4; k++)
      sum += left[k * 4 + row]! * right[column * 4 + k]!;
    return sum;
  });

it("multiplies arbitrary 4x4 transforms without zero-fill work in the hot path", () => {
  const leftValues = [
    1.2, -.3, .4, .01,
    .5, .8, -.6, .02,
    -.7, .9, 1.1, -.03,
    120, -45, 33, 1,
  ];
  const rightValues = [
    .75, .2, -.1, .04,
    -.25, 1.4, .3, -.02,
    .6, -.5, .9, .01,
    -18, 72, 11, 1,
  ];
  const expected = referenceMultiply(leftValues, rightValues);
  const left = new AFXTransform3D(leftValues);
  const right = new AFXTransform3D(rightValues);

  const fill = vi.spyOn(Array.prototype, "fill");
  const result = left.multiply(right);
  const fillCalls = fill.mock.calls.length;
  fill.mockRestore();

  expect(result.values).toEqual(expected);
  expect(fillCalls).toBe(0);
});

it("adopts its own product without a per-component validation callback", () => {
  const left = AFXTransform3D.rotation(.4, 0, 1, 0).multiply(AFXTransform3D.translation(3, 4, 5));
  const right = AFXTransform3D.scale(2, 3, 4);
  const every = vi.spyOn(Array.prototype, "every");
  const result = left.multiply(right);
  const calls = every.mock.calls.length;
  every.mockRestore();
  expect(calls).toBe(0);
  expect(result.values).toEqual(referenceMultiply(left.values, right.values));
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.values)).toBe(true);
  expect(result).toBeInstanceOf(AFXTransform3D);
});

it("still rejects a product that overflows, and still copies caller-owned components", () => {
  const huge = AFXTransform3D.scale(1e200, 1e200, 1);
  expect(() => huge.multiply(huge)).toThrow(RangeError);
  const components = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1];
  const transform = new AFXTransform3D(components);
  components[12] = 99;
  expect(transform.values[12]).toBe(7);
  expect(() => new AFXTransform3D(new Array(16) as number[])).toThrow(RangeError);
  expect(() => new AFXTransform3D([1, 2, 3])).toThrow(RangeError);
});
