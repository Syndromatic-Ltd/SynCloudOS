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

import { describe, expect, it, vi } from "vitest";
import { createAFXLayer } from "../../../src/FX/AnimationFX/host";
import type { AFXFrameScheduler, AFXLayerSurface } from "../../../src/FX/AnimationFX/AFXLayer";
import { AFXReplicatorLayer } from "../../../src/FX/AnimationFX/AFXReplicatorLayer";
function fixture() {
  const surface: AFXLayerSurface = {
    supportedProperties: [],
    supportsReplication: true,
    apply: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    setMask: vi.fn(),
    dispose: vi.fn(),
  };
  const scheduler: AFXFrameScheduler = {
    now: () => 0,
    reducedMotion: false,
    suspended: false,
    requestFrame: () => () => {},
  };
  return { surface, scheduler };
}
describe("layer construction ownership", () => {
  it("releases the surface when initial display aborts before subclass initialization", () => {
    const { surface, scheduler } = fixture();
    const owner = new AbortController();
    surface.apply = () => owner.abort();
    scheduler.subscribeState = vi.fn(() => () => {});
    expect(
      () =>
        createAFXLayer(AFXReplicatorLayer, surface, scheduler, { signal: owner.signal }),
    ).toThrow(/aborted/);
    expect(surface.dispose).toHaveBeenCalledOnce();
    expect(scheduler.subscribeState).not.toHaveBeenCalled();
  });
  it("releases a subscription returned after synchronous cancellation", () => {
    const { surface, scheduler } = fixture();
    const owner = new AbortController();
    const release = vi.fn();
    scheduler.subscribeState = () => {
      owner.abort();
      return release;
    };
    expect(
      () => createAFXLayer(surface, scheduler, { signal: owner.signal }),
    ).toThrow(/aborted/);
    expect(release).toHaveBeenCalledOnce();
    expect(surface.dispose).toHaveBeenCalledOnce();
  });
  it("preserves setup errors while disposing the surface", () => {
    const { surface, scheduler } = fixture();
    scheduler.subscribeState = () => {
      throw new Error("setup failure");
    };
    surface.dispose = vi.fn(() => {
      throw new Error("cleanup failure");
    });
    expect(() => createAFXLayer(surface, scheduler)).toThrow("setup failure");
    expect(surface.dispose).toHaveBeenCalledOnce();
  });
});
