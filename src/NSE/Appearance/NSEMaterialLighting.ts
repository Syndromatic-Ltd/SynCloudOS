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
          const x = Math.sin(sample.attitude.pitch),
            y = Math.sin(sample.attitude.roll);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          this.#target = {
            x: Math.max(-1, Math.min(1, x)),
            y: Math.max(-1, Math.min(1, y)),
          };
          this.#received = this.#scheduler.now();
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
    this.#publish(
      Object.freeze({
        offset,
        angle: offset.x * 0.16 + offset.y * 0.08,
        active: true,
      }),
    );
    this.#cancelFrame = this.#scheduler.requestFrame(this.#tick);
  };
}
