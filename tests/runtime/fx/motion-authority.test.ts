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
import { MotionService } from "../../../src/SynCloudOS/MotionFX/MotionService";
import { motionFixture } from "./motion-fixture";
import { MFXAttitude } from "../../../src/FX/MotionFX/public";
import type { MFXRawMotionSample } from "../../../src/SynCloudOS/MotionFX/motionAdapterTypes";

describe("MotionFX ownership and authorization", () => {
  it("attaches once when a synchronous first sample starts another stream", () => {
    const fixture = motionFixture(), detach = vi.fn();
    let reentered = false;
    const subscribe = vi.fn((handler: (value: MFXRawMotionSample) => void) => {
      handler({ timestamp: 1, attitude: null, rotationRate: { x: 1, y: 2, z: 3 }, gravity: null, userAcceleration: null, accelerationIncludingGravity: null });
      return detach;
    });
    fixture.adapter.subscribe = subscribe;
    const manager = new MotionService(fixture.adapter).createManager();
    manager.startGyroUpdates(() => {
      if (!reentered) { reentered = true; manager.startAccelerometerUpdates(() => {}); }
    });
    expect(reentered).toBe(true);
    manager.dispose();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(detach).toHaveBeenCalledOnce();
  });

  it("clears recorder history when the owner aborts during synchronous acquisition", () => {
    const fixture = motionFixture(), owner = new AbortController(), detach = vi.fn();
    fixture.adapter.subscribe = handler => {
      handler({ timestamp: 1, attitude: MFXAttitude.fromEuler(0, 0, 0), rotationRate: null, gravity: null, userAcceleration: null, accelerationIncludingGravity: null });
      owner.abort();
      return detach;
    };
    const manager = new MotionService(fixture.adapter).createManager({ signal: owner.signal });
    const recorder = manager.createRecorder();
    expect(owner.signal.aborted).toBe(true); expect(recorder.samples).toEqual([]); expect(detach).toHaveBeenCalledOnce();
    manager.dispose(); expect(recorder.samples).toEqual([]);
  });

  it("exposes only frozen portable facades without constructors, private adapters or recorder injection", () => {
    const fixture = motionFixture(),
      manager = new MotionService(fixture.adapter).createManager();
    expect(Object.getPrototypeOf(manager)).toBeNull();
    expect(Object.isFrozen(manager)).toBe(true);
    expect("adapter" in manager).toBe(false);
    expect("constructor" in manager).toBe(false);
    const recorder = manager.createRecorder();
    expect(Object.getPrototypeOf(recorder)).toBeNull();
    expect("record" in recorder).toBe(false);
    expect("attach" in recorder).toBe(false);
    manager.dispose();
    expect(recorder.samples).toEqual([]);
  });
  it("releases synchronous adapter delivery and rolls back adapter subscription failures", () => {
    const fixture = motionFixture(),
      service = new MotionService(fixture.adapter),
      manager = service.createManager();
    const detach = vi.fn();
    fixture.adapter.subscribe = (handler) => {
      handler({
        timestamp: 1,
        attitude: null,
        rotationRate: { x: 1, y: 2, z: 3 },
        gravity: null,
        userAcceleration: null,
        accelerationIncludingGravity: null,
      });
      return detach;
    };
    manager.startGyroUpdates(() => manager.dispose());
    expect(detach).toHaveBeenCalledOnce();
    const another = service.createManager();
    fixture.adapter.subscribe = () => {
      throw new Error("host failed");
    };
    expect(() => another.startGyroUpdates(() => {})).toThrow("host failed");
    another.dispose();
    service.dispose();
  });
  it("never authorizes from passive acquisition, subscription or recorder", () => {
    const f = motionFixture(),
      service = new MotionService(f.adapter),
      manager = service.createManager();
    manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, () => {});
    manager.createRecorder();
    expect(f.adapter.requestAuthorization).not.toHaveBeenCalled();
    service.dispose();
    expect(f.listeners.size).toBe(0);
  });
  it("requires explicit authority and prevents late permission from resurrecting a revoked scope", async () => {
    const f = motionFixture(),
      service = new MotionService(f.adapter),
      denied = service.createManager();
    await expect(denied.requestAuthorization()).rejects.toThrow(/capability/);
    let finish!: (value: "available") => void;
    f.adapter.requestAuthorization = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const controller = new AbortController(),
      manager = service.createManager({
        signal: controller.signal,
        canRequestAuthorization: true,
      });
    manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, () => {});
    const pending = manager.requestAuthorization();
    controller.abort();
    finish("available");
    expect(await pending).toBe("disposed");
    expect(f.listeners.size).toBe(0);
    expect(manager.capabilities.deviceMotion.state).toBe("disposed");
    expect(() => manager.startGyroUpdates(() => {})).toThrow(expect.objectContaining({ code: "MFX_MOTION_MANAGER_DISPOSED" }));
  });
  it("aborts a single subscription and clears recorder data on revocation", () => {
    const f = motionFixture(),
      manager = new MotionService(f.adapter).createManager(),
      c = new AbortController();
    const recorder = manager.createRecorder({ signal: c.signal });
    f.emit(0);
    expect(recorder.samples).toHaveLength(1);
    c.abort();
    expect(recorder.samples).toHaveLength(0);
    expect(f.listeners.size).toBe(0);
    manager.dispose();
    manager.dispose();
  });
  it("does not create listeners for an already aborted request or leak consumer exceptions", () => {
    const f = motionFixture(),
      manager = new MotionService(f.adapter).createManager(),
      c = new AbortController();
    c.abort();
    manager.startGyroUpdates(() => {}, c.signal);
    expect(f.listeners.size).toBe(0);
    const handler = vi.fn();
    manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, () => {
      throw new Error("consumer");
    });
    manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, handler);
    f.emit(0);
    expect(handler).toHaveBeenCalledOnce();
    manager.dispose();
  });
});
