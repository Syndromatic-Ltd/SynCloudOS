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
import { BrowserMotionAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserMotionAdapter";
import type { MFXRawMotionSample } from "../../../src/SynCloudOS/MotionFX/motionAdapterTypes";
function browser(permission?: () => Promise<string>) {
  const win = Object.assign(new EventTarget(), {
    DeviceMotionEvent: permission ? { requestPermission: permission } : {},
    DeviceOrientationEvent: permission ? { requestPermission: permission } : {},
    performance: { now: () => 1000 },
    screen: { orientation: { angle: 0 } },
    navigator: { userActivation: { isActive: true } },
  });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const adapter = new BrowserMotionAdapter(
    win as unknown as Window,
    doc as unknown as Document,
  );
  return {
    win,
    doc,
    adapter,
    emit: (type: string, props: object) => {
      const event = new Event(type);
      Object.assign(event, props);
      Object.defineProperty(event, "timeStamp", { value: 1000 });
      win.dispatchEvent(event);
    },
  };
}
describe("BrowserMotionAdapter", () => {
  it("distinguishes API presence without samples and preserves null channels", () => {
    const f = browser(),
      samples: MFXRawMotionSample[] = [];
    expect(f.adapter.capabilities.deviceMotion.samples).toBe("no-samples");
    const stop = f.adapter.subscribe((sample) => samples.push(sample));
    f.emit("devicemotion", {
      acceleration: { x: null, y: 2, z: 3 },
      accelerationIncludingGravity: null,
      rotationRate: null,
    });
    expect(samples[0].userAcceleration).toBeNull();
    expect(f.adapter.capabilities.accelerometer.samples).toBe("no-samples");
    stop();
  });
  it("converts angular velocity and milliseconds, preserving m/s² and measured gravity difference", () => {
    const f = browser(),
      samples: MFXRawMotionSample[] = [];
    const stop = f.adapter.subscribe((x) => samples.push(x));
    f.emit("devicemotion", {
      acceleration: { x: 1, y: 2, z: 3 },
      accelerationIncludingGravity: { x: 1, y: 2, z: 12.8 },
      rotationRate: { alpha: 180, beta: 90, gamma: 0 },
    });
    expect(samples[0].timestamp).toBe(1);
    expect(samples[0].rotationRate?.z).toBeCloseTo(Math.PI);
    expect(samples[0].rotationRate?.x).toBeCloseTo(Math.PI / 2);
    expect(samples[0].gravity?.z).toBeCloseTo(9.8);
    expect(samples[0].userAcceleration?.x).toBe(1);
    stop();
  });
  it("normalizes portrait/landscape orientation and never merges stale motion channels", () => {
    const f = browser(),
      samples: MFXRawMotionSample[] = [];
    const stop = f.adapter.subscribe((x) => samples.push(x));
    f.win.screen.orientation.angle = 90;
    f.emit("deviceorientation", { alpha: 90, beta: 0, gamma: 0 });
    expect(samples[0].attitude?.yaw).toBeCloseTo(0);
    expect(samples[0].rotationRate).toBeNull();
    stop();
  });
  it("shares listeners across adapters and removes them at last unsubscribe; visibility suspends", () => {
    const f = browser(),
      add = vi.spyOn(f.win, "addEventListener"),
      remove = vi.spyOn(f.win, "removeEventListener");
    const second = new BrowserMotionAdapter(
      f.win as unknown as Window,
      f.doc as unknown as Document,
    );
    const a = f.adapter.subscribe(() => {}),
      b = second.subscribe(() => {});
    expect(add).toHaveBeenCalledTimes(2);
    a();
    expect(remove).not.toHaveBeenCalled();
    f.doc.hidden = true;
    f.doc.dispatchEvent(new Event("visibilitychange"));
    expect(f.adapter.capabilities.deviceMotion.state).toBe("suspended");
    expect(remove).toHaveBeenCalledTimes(2);
    f.doc.hidden = false;
    f.doc.dispatchEvent(new Event("visibilitychange"));
    expect(add).toHaveBeenCalledTimes(4);
    b();
    expect(remove).toHaveBeenCalledTimes(4);
  });
  it("requests permission only explicitly within a user gesture, and reports denial", async () => {
    const permission = vi.fn(async () => "denied"),
      f = browser(permission);
    const stop = f.adapter.subscribe(() => {});
    expect(permission).not.toHaveBeenCalled();
    expect(f.adapter.capabilities.deviceMotion.state).toBe(
      "permission-required",
    );
    f.win.navigator.userActivation.isActive = false;
    await expect(f.adapter.requestAuthorization()).rejects.toThrow(/gesture/);
    expect(permission).not.toHaveBeenCalled();
    f.win.navigator.userActivation.isActive = true;
    expect(await f.adapter.requestAuthorization()).toBe("denied");
    expect(permission).toHaveBeenCalledTimes(2);
    expect(f.adapter.capabilities.deviceMotion.state).toBe("denied");
    stop();
  });
});
