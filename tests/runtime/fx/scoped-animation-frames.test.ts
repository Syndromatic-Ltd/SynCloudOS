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

import { afterEach, expect, it, vi } from "vitest";
import { createRuntimeAnimationState, createScopedAnimationFrames } from "../../../src/SynCloudOS/AnimationFX/scopedAnimationFrames";
import { createTestRuntime } from "../helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose("frame adapter cleanup"); });
function scope(owner = new AbortController()) {
  const runtime = createTestRuntime(); runtimes.push(runtime);
  return { runtime, owner, state: createRuntimeAnimationState(runtime, owner.signal) };
}

it("allocates no subscriptions merely by constructing a frame adapter", () => {
  const { runtime, owner, state } = scope();
  const subscribeSettings = vi.spyOn(runtime.settings, "subscribe");
  const subscribeStore = vi.spyOn(runtime.store, "subscribe");
  const add = vi.spyOn(owner.signal, "addEventListener");
  const request = vi.fn(() => () => {});
  createScopedAnimationFrames(owner.signal, state, { now: () => 0, requestFrame: request });
  expect(add).not.toHaveBeenCalled();
  expect(subscribeSettings).not.toHaveBeenCalled();
  expect(subscribeStore).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it("cancels a handle allocated after synchronous owner revocation", () => {
  const { owner, state } = scope();
  const cancel = vi.fn(), callback = vi.fn();
  const frames = createScopedAnimationFrames(owner.signal, state, {
    now: () => 0,
    requestFrame(deliver) { owner.abort(); deliver(16); return cancel; },
  });
  const release = frames.requestFrame(callback);
  release(); release();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(callback).not.toHaveBeenCalled();
  expect(frames.suspended).toBe(true);
});

it("fences a failed host allocation and lets a subsequent synchronous frame complete", () => {
  const { owner, state } = scope();
  const cancel = vi.fn(), failedCallback = vi.fn(), completedCallback = vi.fn();
  let late: ((time: number) => void) | undefined;
  const request = vi.fn<(callback: (time: number) => void) => () => void>()
    .mockImplementationOnce(deliver => { late = deliver; throw new Error("allocation failed"); })
    .mockImplementationOnce(deliver => { deliver(32); return cancel; });
  const frames = createScopedAnimationFrames(owner.signal, state, { now: () => 0, requestFrame: request });
  expect(() => frames.requestFrame(failedCallback)).toThrow("allocation failed");
  late!(16);
  expect(failedCallback).not.toHaveBeenCalled();
  const release = frames.requestFrame(completedCallback);
  release(); owner.abort();
  expect(completedCallback).toHaveBeenCalledExactlyOnceWith(32);
  expect(cancel).not.toHaveBeenCalled();
});

it("does not contact host timing or state sources for an already revoked owner", () => {
  const owner = new AbortController(); owner.abort();
  const { state } = scope(owner);
  const request = vi.fn(() => () => {}), changed = vi.fn();
  const frames = createScopedAnimationFrames(owner.signal, state, { now: () => 0, requestFrame: request });
  const release = frames.subscribeState!(changed);
  frames.requestFrame(() => {})(); release();
  expect(request).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(frames.suspended).toBe(true);
});
