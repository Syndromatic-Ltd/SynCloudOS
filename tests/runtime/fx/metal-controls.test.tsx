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

// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEMaterialLighting } from "../../../src/NSE/Appearance/NSEMaterialLighting";
import { NSEMaterialLightingProvider } from "../../../src/NSE/Appearance/NSEMetalThumb";
import { NSESlider } from "../../../src/NSE/Controls/Values/NSESlider";
import { NSEToggleButton } from "../../../src/NSE/Controls/Fields/NSEFields";
import { MFXAttitude } from "../../../src/FX/MotionFX/MFXAttitude";
import type { MFXMotionManager } from "../../../src/FX/MotionFX/MFXMotionManager";
import type { MFXDeviceMotion } from "../../../src/FX/MotionFX/MFXDeviceMotion";
import type { AFXFrameScheduler } from "../../../src/FX/AnimationFX/AFXLayer";
afterEach(cleanup);
function harness() {
  let now = 0,
    hidden = false,
    reduced = false;
  const frames = new Set<(time: number) => void>(),
    states = new Set<() => void>(),
    samples = new Set<(sample: MFXDeviceMotion) => void>();
  const authorize = vi.fn();
  const create = vi.fn(() => {
    let own: ((sample: MFXDeviceMotion) => void) | null = null;
    return {
      setDeviceMotionUpdateInterval: vi.fn(),
      startDeviceMotionUpdates: (
        _options: unknown,
        callback: (sample: MFXDeviceMotion) => void,
      ) => {
        own = callback;
        samples.add(callback);
        return { dispose: () => samples.delete(callback) };
      },
      dispose: () => {
        if (own) samples.delete(own);
      },
      requestAuthorization: authorize,
    } as unknown as MFXMotionManager;
  });
  const scheduler: AFXFrameScheduler = {
    now: () => now,
    get suspended() {
      return hidden;
    },
    get reducedMotion() {
      return reduced;
    },
    requestFrame: (callback) => {
      frames.add(callback);
      return () => {
        frames.delete(callback);
      };
    },
    subscribeState: (callback) => {
      states.add(callback);
      return () => {
        states.delete(callback);
      };
    },
  };
  return {
    create,
    authorize,
    frames,
    states,
    samples,
    store: new NSEMaterialLighting(create, scheduler),
    sample: (roll: number, pitch: number) => {
      for (const callback of samples)
        callback({
          attitude: MFXAttitude.fromEuler(roll, pitch, 0),
          timestamp: now,
          referenceFrame: "relative",
          gravity: null,
          userAcceleration: null,
          rotationRate: null,
        });
    },
    advance: (time: number) => {
      now = time;
      const tasks = [...frames];
      frames.clear();
      for (const task of tasks) task(time);
    },
    suspend: (value: boolean) => {
      hidden = value;
      for (const callback of states) callback();
    },
    reduce: (value: boolean) => {
      reduced = value;
      for (const callback of states) callback();
    },
  };
}
describe("metal material controls", () => {
  it("keeps standard and disabled-only control trees entirely passive", () => {
    const h = harness(),
      view = render(
        <NSEMaterialLightingProvider value={h.store}>
          <NSESlider aria-label="Standard" value={20} />
          <NSESlider
            thumbMaterial="metal"
            aria-label="Disabled slider"
            value={30}
            disabled
          />
          <NSEToggleButton
            thumbMaterial="metal"
            aria-label="Disabled switch"
            checked
            disabled
          />
        </NSEMaterialLightingProvider>,
      );
    expect(h.create).not.toHaveBeenCalled();
    expect(h.states.size).toBe(0);
    expect(h.frames.size).toBe(0);
    view.unmount();
  });

  it("shares a passive manager, bounds lighting and stops stale frame work", () => {
    const h = harness();
    expect(h.create).not.toHaveBeenCalled();
    const first = h.store.subscribe(() => {}),
      second = h.store.subscribe(() => {});
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.frames.size).toBe(0);
    h.sample(1, 1);
    h.advance(0.05);
    expect(h.store.getSnapshot().active).toBe(true);
    expect(Math.abs(h.store.getSnapshot().angle)).toBeLessThanOrEqual(0.24);
    const angle = h.store.getSnapshot().angle;
    h.sample(-1, -1);
    h.advance(0.06);
    expect(Math.abs(h.store.getSnapshot().angle - angle)).toBeLessThan(0.1);
    h.advance(1);
    expect(h.store.getSnapshot().active).toBe(false);
    expect(h.frames.size).toBe(0);
    first();
    expect(h.samples.size).toBe(1);
    second();
    expect(h.samples.size).toBe(0);
    expect(h.states.size).toBe(0);
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it("suspends subscriptions for hidden and reduced states and resumes without a prompt", () => {
    const h = harness(),
      release = h.store.subscribe(() => {});
    h.sample(1, 1);
    h.advance(0.1);
    h.suspend(true);
    expect(h.samples.size).toBe(0);
    expect(h.frames.size).toBe(0);
    expect(h.store.getSnapshot().active).toBe(false);
    h.suspend(false);
    expect(h.samples.size).toBe(1);
    h.reduce(true);
    expect(h.samples.size).toBe(0);
    h.reduce(false);
    expect(h.samples.size).toBe(1);
    release();
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it("preserves control keyboard values and avoids acquiring resources for standard or disabled thumbs", () => {
    const h = harness(),
      volume = vi.fn(),
      toggle = vi.fn();
    const view = render(
      <NSEMaterialLightingProvider value={h.store}>
        <NSESlider aria-label="Standard" value={50} />
        <NSESlider
          thumbMaterial="metal"
          aria-label="Disabled"
          value={20}
          disabled
        />
        <NSESlider
          thumbMaterial="metal"
          aria-label="Volume"
          value={50}
          onValueChange={volume}
        />
        <NSEToggleButton
          thumbMaterial="metal"
          aria-label="Sound"
          checked={false}
          onCheckedChange={toggle}
        />
      </NSEMaterialLightingProvider>,
    );
    expect(h.create).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(view.getByRole("slider", { name: "Volume" }), {
      key: "ArrowRight",
    });
    expect(volume.mock.calls[0][0]).toBe(51);
    fireEvent.keyDown(view.getByRole("switch", { name: "Sound" }), {
      key: " ",
    });
    expect(toggle).toHaveBeenCalledWith(true);
    expect(
      view
        .getByRole("slider", { name: "Volume" })
        .getAttribute("thumbMaterial"),
    ).toBeNull();
    view.unmount();
    expect(h.samples.size).toBe(0);
    expect(h.frames.size).toBe(0);
  });
  it("replays StrictMode subscription lifetime without leaving a duplicate sensor listener", () => {
    const h = harness(),
      view = render(
        <StrictMode>
          <NSEMaterialLightingProvider value={h.store}>
            <NSESlider thumbMaterial="metal" aria-label="Volume" value={40} />
            <NSEToggleButton thumbMaterial="metal" aria-label="Sound" checked />
          </NSEMaterialLightingProvider>
        </StrictMode>,
      );
    expect(h.samples.size).toBe(1);
    expect(h.states.size).toBe(1);
    view.unmount();
    expect(h.samples.size).toBe(0);
    expect(h.states.size).toBe(0);
    expect(h.authorize).not.toHaveBeenCalled();
  });
});
