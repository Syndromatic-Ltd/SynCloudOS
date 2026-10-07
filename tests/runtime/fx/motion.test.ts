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

import { motionFixture } from "./motion-fixture";
import { describe, expect, it, vi } from "vitest";
import { MFXAttitude } from "../../../src/FX/MotionFX/public";
import { MotionService } from "../../../src/SynCloudOS/MotionFX/MotionService";
import type { MFXRawMotionSample } from "../../../src/SynCloudOS/MotionFX/motionAdapterTypes";

const sample = (timestamp: number, attitude: boolean): MFXRawMotionSample => ({ timestamp, attitude: attitude ? MFXAttitude.fromEuler(0, 0, 0) : null, rotationRate: attitude ? null : { x: 1, y: 2, z: 3 }, gravity: null, userAcceleration: null, accelerationIncludingGravity: null });

describe("MotionFX portable values and streams", () => {
  it("preserves interleaved orientation updates instead of starving them behind motion cadence", () => {
    const fixture = motionFixture(), manager = new MotionService(fixture.adapter).createManager(), delivered: MFXRawMotionSample[] = [];
    manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, value => delivered.push({ ...value, accelerationIncludingGravity: null }));
    for (let index = 0; index < 5; index++) {
      for (const listener of fixture.listeners) listener(sample(index * 0.02, false));
      for (const listener of fixture.listeners) listener(sample(index * 0.02 + 0.001, true));
    }
    expect(delivered.filter(value => value.attitude)).toHaveLength(5);
    expect(delivered.filter(value => value.rotationRate)).toHaveLength(5);
    expect(delivered.every(value => value.attitude === null || value.rotationRate === null)).toBe(true);
    manager.dispose();
  });

  it("clears device-motion state when its last subscription releases while gyro stays active", () => {
    const fixture = motionFixture(), manager = new MotionService(fixture.adapter).createManager(), gyro = vi.fn();
    const subscription = manager.startDeviceMotionUpdates({ referenceFrame: "relative" }, () => {});
    manager.startGyroUpdates(gyro); fixture.emit(0); fixture.emit(0.02);
    expect(manager.deviceMotion).not.toBeNull(); expect(manager.observedUpdateInterval).toBeCloseTo(0.02);
    subscription.dispose(); expect(manager.deviceMotion).toBeNull(); expect(manager.observedUpdateInterval).toBeNull();
    for (const listener of fixture.listeners) listener(sample(0.04, false));
    expect(gyro).toHaveBeenCalledOnce(); expect(fixture.listeners.size).toBe(1); manager.dispose(); expect(fixture.listeners.size).toBe(0);
  });

  it('owns sensor vectors, applies independent cadence and clears current values on stop',()=>{
    const fixture=motionFixture(), manager=new MotionService(fixture.adapter).createManager();
    manager.setAccelerometerUpdateInterval(.1);manager.setGyroUpdateInterval(.2);
    const accelerometer:number[]=[],gyro:number[]=[];
    manager.startAccelerometerUpdates(sample=>accelerometer.push(sample.timestamp));manager.startGyroUpdates(sample=>gyro.push(sample.timestamp));
    const mutable={x:1,y:2,z:3};
    for(const timestamp of [0,.1,.2]) for(const callback of fixture.listeners) callback({timestamp,attitude:null,rotationRate:mutable,gravity:null,userAcceleration:mutable,accelerationIncludingGravity:null});
    mutable.x=900;
    expect(accelerometer).toEqual([0,.1,.2]);expect(gyro).toEqual([0,.2]);expect(manager.gyroData?.rotationRate.x).toBe(1);expect(manager.accelerometerData?.includesGravity).toBe(false);
    manager.stopAccelerometerUpdates();expect(manager.accelerometerData).toBeNull();expect(fixture.listeners.size).toBe(1);manager.stopGyroUpdates();expect(manager.gyroData).toBeNull();expect(fixture.listeners.size).toBe(0);
  });
  it("normalizes quaternions and round trips Euler angles with immutable matrices", () => {
    const attitude = MFXAttitude.fromEuler(0.2, -0.4, 0.7);
    expect(attitude.roll).toBeCloseTo(0.2);
    expect(attitude.pitch).toBeCloseTo(-0.4);
    expect(attitude.yaw).toBeCloseTo(0.7);
    expect(Math.hypot(...Object.values(attitude.quaternion))).toBeCloseTo(1);
    expect(attitude.multiplyByInverseOf(attitude).quaternion.w).toBeCloseTo(1);
    expect(Object.isFrozen(attitude.rotationMatrix)).toBe(true);
    expect(
      MFXAttitude.fromRotationMatrix(attitude.rotationMatrix).roll,
    ).toBeCloseTo(0.2);
    for (const euler of [
      [Math.PI, 0, 0],
      [0, Math.PI, 0],
      [0, 0, Math.PI],
    ] as const) {
      const original = MFXAttitude.fromEuler(...euler);
      const converted = MFXAttitude.fromRotationMatrix(original.rotationMatrix);
      converted.rotationMatrix.forEach((value, index) =>
        expect(value).toBeCloseTo(original.rotationMatrix[index]),
      );
    }
    expect(() =>
      MFXAttitude.fromRotationMatrix([1, 0, 0, 0, 1, 0, 0, 0, -1]),
    ).toThrow(/right-handed/);
    expect(() => new MFXAttitude({ x: 0, y: 0, z: 0, w: 0 })).toThrow();
  });
  it("keeps wraparound quaternion signs continuous", () => {
    const a = MFXAttitude.fromEuler(0, 0, Math.PI - 0.01),
      b = MFXAttitude.fromEuler(0, 0, -Math.PI + 0.01).continuousWith(a);
    expect(
      a.quaternion.z * b.quaternion.z + a.quaternion.w * b.quaternion.w,
    ).toBeGreaterThan(0.99);
  });
  it("uses advisory cadence, observed seconds, missing channels and bounded session history", () => {
    const f = motionFixture(),
      manager = new MotionService(f.adapter).createManager();
    manager.setDeviceMotionUpdateInterval(0.1);
    const recorder = manager.createRecorder({
      maximumSamples: 2,
      maximumAge: 0.25,
    });
    f.emit(0);
    f.emit(0.02);
    f.emit(0.1);
    f.emit(0.2);
    f.emit(0.5);
    expect(recorder.samples.map((x) => x.timestamp)).toEqual([0.5]);
    expect(manager.observedUpdateInterval).toBeCloseTo(0.3);
    expect(manager.deviceMotion?.gravity).toBeNull();
    expect(Object.isFrozen(manager.deviceMotion)).toBe(true);
    expect(() => manager.setDeviceMotionUpdateInterval(NaN)).toThrow();
    recorder.dispose();
    expect(recorder.samples).toEqual([]);
    expect(f.listeners.size).toBe(0);
  });
  it("keeps reference resets and stopping isolated across managers", () => {
    const f = motionFixture(),
      service = new MotionService(f.adapter),
      a = service.createManager(),
      b = service.createManager();
    a.startDeviceMotionUpdates({ referenceFrame: "relative" }, () => {});
    b.startDeviceMotionUpdates({ referenceFrame: "relative" }, () => {});
    f.emit(0, MFXAttitude.fromEuler(0.2, 0, 0));
    a.resetReferenceFrame();
    f.emit(1, MFXAttitude.fromEuler(0.3, 0, 0));
    expect(a.deviceMotion?.attitude?.roll).toBeCloseTo(0.1);
    expect(b.deviceMotion?.attitude?.roll).toBeCloseTo(0.3);
    a.stopDeviceMotionUpdates();
    expect(f.listeners.size).toBe(1);
    service.dispose();
    expect(f.listeners.size).toBe(0);
  });
  it("rejects unsupported reference frames instead of inventing heading", () => {
    const manager = new MotionService().createManager();
    expect(() =>
      manager.startDeviceMotionUpdates(
        { referenceFrame: "magnetic-north" },
        () => {},
      ),
    ).toThrow(/Unsupported/);
    expect(manager.capabilities.magnetometer.state).toBe("unavailable");
  });
});
