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

import type { AFXFrameScheduler } from "../../FX/AnimationFX/AFXLayer";
import { normalisePoint, type GFXPoint } from "../../FX/GraphicsFX/GFXGeometry";
import type { MFXMotionManager } from "../../FX/MotionFX/MFXMotionManager";
type Quaternion = { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
/** The rotation carrying `from` to `to`, as radians about the device's own x, y and z axes. */
function rotationFrom(from: Quaternion, to: Quaternion): { x: number; y: number; z: number } | null {
  const x = from.w * to.x - from.x * to.w - from.y * to.z + from.z * to.y,
    y = from.w * to.y + from.x * to.z - from.y * to.w - from.z * to.x,
    z = from.w * to.z - from.x * to.y + from.y * to.x - from.z * to.w,
    w = from.w * to.w + from.x * to.x + from.y * to.y + from.z * to.z;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || !Number.isFinite(w)) return null;
  if (length < 1e-9) return { x: 0, y: 0, z: 0 };
  const scale = (2 * Math.atan2(length, Math.abs(w)) * Math.sign(w || 1)) / length;
  return { x: x * scale, y: y * scale, z: z * scale };
}
function settle(from: Quaternion, to: Quaternion, amount: number): Quaternion {
  const side = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w < 0 ? -1 : 1;
  const x = from.x + (side * to.x - from.x) * amount,
    y = from.y + (side * to.y - from.y) * amount,
    z = from.z + (side * to.z - from.z) * amount,
    w = from.w + (side * to.w - from.w) * amount;
  const length = Math.hypot(x, y, z, w) || 1;
  return { x: x / length, y: y / length, z: z / length, w: w / length };
}
export interface NSEMaterialLight {
  readonly offset: GFXPoint;
  readonly angle: number;
  readonly active: boolean;
}
export const staticNSEMaterialLight: NSEMaterialLight = Object.freeze({
  offset: normalisePoint({ x: 0, y: 0 }),
  angle: 0,
  active: false,
});
export interface NSEMaterialLightingPort {
  getSnapshot(): NSEMaterialLight;
  subscribe(listener: () => void): () => void;
}
/** One passive device subscription and frame loop for every visible metal thumb in a provider. */
export class NSEMaterialLighting implements NSEMaterialLightingPort {
  readonly #listeners = new Set<() => void>();
  readonly #createManager: () => MFXMotionManager;
  readonly #scheduler: AFXFrameScheduler;
  #manager: MFXMotionManager | null = null;
  #releaseState: (() => void) | null = null;
  #cancelFrame: (() => void) | null = null;
  #value = staticNSEMaterialLight;
  #target = { x: 0, y: 0 };
  #spinTarget = 0;
  #spin = 0;
  #rest: Quaternion | null = null;
  #restTime = 0;
  #received = -Infinity;
  #last = 0;
  constructor(
    createManager: () => MFXMotionManager,
    scheduler: AFXFrameScheduler,
  ) {
    this.#createManager = createManager;
    this.#scheduler = scheduler;
  }
  getSnapshot = () => this.#value;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) {
      this.#releaseState =
        this.#scheduler.subscribeState?.(() => this.#syncState()) ?? null;
      this.#syncState();
    }
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      this.#listeners.delete(listener);
      if (!this.#listeners.size) {
        this.#stop();
        this.#releaseState?.();
        this.#releaseState = null;
      }
    };
  };
  #publish(value: NSEMaterialLight) {
    this.#value = value;
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        /* One view cannot retain or interrupt other material subscribers. */
      }
    }
  }
  #stop() {
    this.#cancelFrame?.();
    this.#cancelFrame = null;
    const manager = this.#manager;
    this.#manager = null;
    try {
      manager?.dispose();
    } catch {
      /* Frame and state teardown still completes. */
    }
    this.#received = -Infinity;
    this.#target = { x: 0, y: 0 };
    this.#spinTarget = this.#spin = 0;
    this.#rest = null;
    this.#publish(staticNSEMaterialLight);
  }
  #syncState() {
    if (
      !this.#listeners.size ||
      this.#scheduler.reducedMotion ||
      this.#scheduler.suspended
    ) {
      this.#stop();
      return;
    }
    if (this.#manager) return;
    try {
      const manager = this.#createManager();
      this.#manager = manager;
      manager.setDeviceMotionUpdateInterval(1 / 30);
      manager.startDeviceMotionUpdates(
        { referenceFrame: "relative" },
        (sample) => {
          if (!sample.attitude || this.#manager !== manager) return;
          const now = this.#scheduler.now();
          const pose = sample.attitude.quaternion;
          // The pose the device is held in is rest; it follows slowly, so the light answers movement, not posture.
          const rest = (this.#rest = this.#rest
            ? settle(this.#rest, pose, 1 - Math.exp(-Math.max(0, now - this.#restTime) / 5))
            : pose);
          this.#restTime = now;
          const turn = rotationFrom(rest, pose);
          if (!turn) return;
          const reach = Math.PI / 3;
          this.#target = {
            x: Math.max(-1, Math.min(1, turn.y / reach)),
            y: Math.max(-1, Math.min(1, turn.x / reach)),
          };
          this.#spinTarget = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, turn.z));
          this.#received = now;
          if (!this.#cancelFrame) {
            this.#last = this.#received;
            this.#cancelFrame = this.#scheduler.requestFrame(this.#tick);
          }
        },
      );
    } catch {
      this.#stop();
    }
  }
  #tick = (time: number) => {
    this.#cancelFrame = null;
    if (
      !this.#listeners.size ||
      this.#scheduler.reducedMotion ||
      this.#scheduler.suspended
    ) {
      this.#syncState();
      return;
    }
    if (
      !Number.isFinite(time) ||
      time < this.#last ||
      time - this.#received > 0.75
    ) {
      this.#publish(Object.freeze({ ...this.#value, active: false }));
      return;
    }
    const gain = 1 - Math.exp(-Math.min(time - this.#last, 0.1) / 0.12);
    this.#last = time;
    const offset = normalisePoint({
      x: this.#value.offset.x + (this.#target.x - this.#value.offset.x) * gain,
      y: this.#value.offset.y + (this.#target.y - this.#value.offset.y) * gain,
    });
    this.#spin += (this.#spinTarget - this.#spin) * gain;
    this.#publish(
      Object.freeze({
        offset,
        // Turning the device sideways leads; spinning it in its own plane leaves the light where it was in the room.
        angle: offset.x * 0.9 + offset.y * 0.45 - this.#spin,
        active: true,
      }),
    );
    this.#cancelFrame = this.#scheduler.requestFrame(this.#tick);
  };
}
