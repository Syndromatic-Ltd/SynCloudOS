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
import { MFXAttitude } from "../../../src/FX/MotionFX/MFXAttitude";
import { MotionService } from "../../../src/SynCloudOS/MotionFX/MotionService";
import { BrowserMotionAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserMotionAdapter";
import type { MFXRawMotionSample } from "../../../src/SynCloudOS/MotionFX/motionAdapterTypes";
import { motionFixture } from "./motion-fixture";

function browserFixture(permission?: () => Promise<string>) {
  let nowMs = 1_000;
  const win = Object.assign(new EventTarget(), {
    DeviceMotionEvent: permission ? { requestPermission: permission } : {},
    DeviceOrientationEvent: permission ? { requestPermission: permission } : {},
    performance: { now: () => nowMs },
    screen: { orientation: { angle: 0 } },
    navigator: { userActivation: { isActive: true } },
  });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const adapter = new BrowserMotionAdapter(
    win as unknown as Window,
    doc as unknown as Document,
  );
  const emit = (type: string, props: object, timestampSeconds: number) => {
    nowMs = timestampSeconds * 1_000;
    const event = new Event(type);
    Object.assign(event, props);
    Object.defineProperty(event, "timeStamp", {
      configurable: true,
      value: nowMs,
    });
    win.dispatchEvent(event);
  };
  return { win, doc, adapter, emit };
}

describe("MotionFX acceptance conformance", () => {
  it("normalizes finite quaternions, rejects invalid input and keeps the ±π wrap sign-continuous", () => {
    const normalized = new MFXAttitude({ x: 2, y: -3, z: 4, w: 5 });
    const norm = Math.hypot(
      normalized.quaternion.x,
      normalized.quaternion.y,
      normalized.quaternion.z,
      normalized.quaternion.w,
    );
    expect(Math.abs(norm - 1)).toBeLessThanOrEqual(1e-9);

    const before = MFXAttitude.fromEuler(0, 0, Math.PI - 1e-6);
    const after = MFXAttitude.fromEuler(0, 0, -Math.PI + 1e-6).continuousWith(before);
    const dot =
      before.quaternion.x * after.quaternion.x +
      before.quaternion.y * after.quaternion.y +
      before.quaternion.z * after.quaternion.z +
      before.quaternion.w * after.quaternion.w;
    expect(dot).toBeGreaterThan(0.999999999);
    expect(after.yaw).toBeCloseTo(-Math.PI + 1e-6, 9);

    expect(() => new MFXAttitude({ x: 0, y: 0, z: 0, w: 0 })).toThrow(
      /finite nonzero quaternion/,
    );
    expect(() => new MFXAttitude({ x: Number.NaN, y: 0, z: 0, w: 1 })).toThrow(
      /finite nonzero quaternion/,
    );
  });

  it("normalizes portrait/landscape orientation by exactly π/2 and preserves nullable channels", () => {
    const fixture = browserFixture();
    const samples: MFXRawMotionSample[] = [];
    const stop = fixture.adapter.subscribe((sample) => samples.push(sample));

    fixture.emit(
      "deviceorientation",
      { alpha: 180, beta: 0, gamma: 0 },
      1,
    );
    fixture.win.screen.orientation.angle = 90;
    fixture.emit(
      "deviceorientation",
      { alpha: 180, beta: 0, gamma: 0 },
      2,
    );

    expect(samples).toHaveLength(2);
    const portraitYaw = samples[0].attitude?.yaw;
    const landscapeYaw = samples[1].attitude?.yaw;
    expect(portraitYaw).not.toBeNull();
    expect(landscapeYaw).not.toBeNull();
    expect(Math.abs((portraitYaw ?? 0) - (landscapeYaw ?? 0))).toBeCloseTo(
      Math.PI / 2,
      9,
    );
    expect(samples[1].rotationRate).toBeNull();
    expect(samples[1].gravity).toBeNull();
    expect(samples[1].userAcceleration).toBeNull();

    fixture.emit(
      "devicemotion",
      {
        acceleration: { x: null, y: 0, z: 0 },
        accelerationIncludingGravity: null,
        rotationRate: null,
      },
      3,
    );
    expect(samples[2].userAcceleration).toBeNull();
    expect(samples[2].accelerationIncludingGravity).toBeNull();
    stop();
  });

  it("keeps interleaved sources, cadence and reference resets isolated across clients", () => {
    const fixture = motionFixture();
    const service = new MotionService(fixture.adapter);
    const first = service.createManager();
    const second = service.createManager();
    const firstSamples: number[] = [];
    const secondSamples: number[] = [];
    first.setDeviceMotionUpdateInterval(1);
    first.startDeviceMotionUpdates({ referenceFrame: "relative" }, (sample) =>
      firstSamples.push(sample.timestamp),
    );
    second.startDeviceMotionUpdates({ referenceFrame: "relative" }, (sample) =>
      secondSamples.push(sample.timestamp),
    );

    fixture.emit(10, MFXAttitude.fromEuler(0, 0, 0));
    fixture.emit(10.25, MFXAttitude.fromEuler(0.1, 0, 0));
    first.resetReferenceFrame();
    fixture.emit(11.1, MFXAttitude.fromEuler(0.2, 0, 0));

    expect(firstSamples).toEqual([10, 11.1]);
    expect(first.observedUpdateInterval).toBeCloseTo(1.1, 9);
    expect(first.deviceMotion?.attitude?.roll).toBeCloseTo(0.1, 9);
    expect(second.deviceMotion?.attitude?.roll).toBeCloseTo(0.2, 9);
    expect(secondSamples).toEqual([10, 10.25, 11.1]);

    first.dispose();
    expect(fixture.listeners.size).toBe(1);
    fixture.emit(12, MFXAttitude.fromEuler(0.3, 0, 0));
    expect(second.deviceMotion?.attitude?.roll).toBeCloseTo(0.3, 9);
    second.dispose();
    expect(fixture.listeners.size).toBe(0);
  });

  it("uses one browser hub listener set, suspends while hidden and resumes cleanly", () => {
    const fixture = browserFixture();
    const add = vi.spyOn(fixture.win, "addEventListener");
    const remove = vi.spyOn(fixture.win, "removeEventListener");
    const secondAdapter = new BrowserMotionAdapter(
      fixture.win as unknown as Window,
      fixture.doc as unknown as Document,
    );
    const firstStop = fixture.adapter.subscribe(() => {});
    const secondStop = secondAdapter.subscribe(() => {});

    expect(add).toHaveBeenCalledTimes(2);
    fixture.doc.hidden = true;
    fixture.doc.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.adapter.capabilities.deviceMotion.state).toBe("suspended");
    expect(remove).toHaveBeenCalledTimes(2);

    fixture.doc.hidden = false;
    fixture.doc.dispatchEvent(new Event("visibilitychange"));
    expect(add).toHaveBeenCalledTimes(4);
    firstStop();
    expect(remove).toHaveBeenCalledTimes(2);
    secondStop();
    expect(remove).toHaveBeenCalledTimes(4);
  });

  it("does not let late authorization resurrect a revoked owner and tears recorder history down", async () => {
    const fixture = motionFixture();
    let resolvePermission!: (value: "available") => void;
    fixture.adapter.requestAuthorization = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );
    const owner = new AbortController();
    const manager = new MotionService(fixture.adapter).createManager({
      signal: owner.signal,
      canRequestAuthorization: true,
    });
    const recorder = manager.createRecorder();
    fixture.emit(1);
    expect(recorder.samples).toHaveLength(1);

    const permission = manager.requestAuthorization();
    owner.abort();
    expect(recorder.samples).toEqual([]);
    expect(fixture.listeners.size).toBe(0);
    resolvePermission("available");
    expect(await permission).toBe("disposed");
    expect(manager.capabilities.deviceMotion.state).toBe("disposed");
  });
});
