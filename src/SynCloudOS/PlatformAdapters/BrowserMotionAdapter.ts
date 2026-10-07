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

import { MFXAttitude, type MFXVector3 } from "../../FX/MotionFX/MFXAttitude";
import {
  MFXSensors,
  type MFXAvailability,
  type MFXMotionCapabilities,
  type MFXSensor,
} from "../../FX/MotionFX/MFXMotionCapabilities";
import type {
  MFXMotionAdapter,
  MFXRawMotionSample,
} from "../HostServices/PlatformAdapterRuntimePorts";

type PermissionConstructor = { requestPermission?: () => Promise<string> };
type MotionWindow = Window & {
  DeviceMotionEvent?: PermissionConstructor;
  DeviceOrientationEvent?: PermissionConstructor;
};
const radians = Math.PI / 180;
const hubs = new WeakMap<Window, BrowserMotionHub>();
function vector(
  x: number | null | undefined,
  y: number | null | undefined,
  z: number | null | undefined,
): MFXVector3 | null {
  return typeof x === "number" &&
    Number.isFinite(x) &&
    typeof y === "number" &&
    Number.isFinite(y) &&
    typeof z === "number" &&
    Number.isFinite(z)
    ? Object.freeze({ x, y, z })
    : null;
}

/** One ref-counted browser listener set per Window, shared across runtime adapters. */
export class BrowserMotionAdapter implements MFXMotionAdapter {
  private readonly hub: BrowserMotionHub;
  constructor(browserWindow: Window, browserDocument: Document) {
    let hub = hubs.get(browserWindow);
    if (!hub) {
      hub = new BrowserMotionHub(
        browserWindow as MotionWindow,
        browserDocument,
      );
      hubs.set(browserWindow, hub);
    }
    this.hub = hub;
  }
  get capabilities(): MFXMotionCapabilities {
    return this.hub.capabilities;
  }
  subscribe(handler: (sample: MFXRawMotionSample) => void): () => void {
    return this.hub.subscribe(handler);
  }
  requestAuthorization(): Promise<MFXAvailability> {
    return this.hub.requestAuthorization();
  }
}
class BrowserMotionHub {
  private readonly consumers = new Set<(sample: MFXRawMotionSample) => void>();
  private attached = false;
  private motionPermission: MFXAvailability;
  private orientationPermission: MFXAvailability;
  private observed = new Map<MFXSensor, number>();
  private pending: Promise<MFXAvailability> | null = null;
  constructor(
    private readonly browserWindow: MotionWindow,
    private readonly browserDocument: Document,
  ) {
    this.motionPermission = this.initial(browserWindow.DeviceMotionEvent);
    this.orientationPermission = this.initial(
      browserWindow.DeviceOrientationEvent,
    );
  }
  private initial(
    constructor: PermissionConstructor | undefined,
  ): MFXAvailability {
    return constructor
      ? constructor.requestPermission
        ? "permission-required"
        : "available"
      : "unavailable";
  }
  private now(): number {
    return this.browserWindow.performance.now() / 1000;
  }
  get capabilities(): MFXMotionCapabilities {
    const now = this.now();
    return Object.freeze(
      Object.fromEntries(
        MFXSensors.map((sensor) => {
          const state =
            sensor === "deviceMotion"
              ? this.combined()
              : sensor === "accelerometer" || sensor === "gyroscope"
                ? this.motionPermission
                : "unavailable";
          const apiPresent =
            sensor === "deviceMotion"
              ? !!(
                  this.browserWindow.DeviceMotionEvent ||
                  this.browserWindow.DeviceOrientationEvent
                )
              : sensor === "accelerometer" || sensor === "gyroscope"
                ? !!this.browserWindow.DeviceMotionEvent
                : false;
          const last = this.observed.get(sensor);
          return [
            sensor,
            Object.freeze({
              state:
                state === "available" &&
                this.consumers.size > 0 &&
                this.browserDocument.hidden
                  ? "suspended"
                  : state,
              apiPresent,
              samples:
                last === undefined
                  ? "no-samples"
                  : now - last > 1
                    ? "stale"
                    : "active",
              reason:
                state === "unavailable"
                  ? "No real browser adapter for this sensor."
                  : state === "denied"
                    ? "Host permission was denied."
                    : state === "permission-required"
                      ? "Explicit user-gesture authorization is required."
                      : last === undefined
                        ? "API presence does not prove sensor samples are available."
                        : null,
            }),
          ];
        }),
      ),
    ) as MFXMotionCapabilities;
  }
  private combined(): MFXAvailability {
    const states = [this.motionPermission, this.orientationPermission];
    return states.includes("available")
      ? "available"
      : states.includes("permission-required")
        ? "permission-required"
        : states.includes("denied")
          ? "denied"
          : "unavailable";
  }
  subscribe(handler: (sample: MFXRawMotionSample) => void): () => void {
    this.consumers.add(handler);
    if (this.consumers.size === 1) {
      this.browserDocument.addEventListener(
        "visibilitychange",
        this.visibility,
      );
      this.visibility();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.consumers.delete(handler);
      if (!this.consumers.size) {
        this.unlisten();
        this.browserDocument.removeEventListener(
          "visibilitychange",
          this.visibility,
        );
        this.observed.clear();
      }
    };
  }
  private visibility = (): void => {
    if (this.browserDocument.hidden || !this.consumers.size) {
      this.unlisten();
      this.observed.clear();
      return;
    }
    if (this.attached) return;
    this.attached = true;
    this.browserWindow.addEventListener("devicemotion", this.motion);
    this.browserWindow.addEventListener("deviceorientation", this.orientation);
  };
  private unlisten(): void {
    if (!this.attached) return;
    this.attached = false;
    this.browserWindow.removeEventListener("devicemotion", this.motion);
    this.browserWindow.removeEventListener(
      "deviceorientation",
      this.orientation,
    );
  }
  private emit(sample: MFXRawMotionSample): void {
    if (this.browserDocument.hidden) return;
    const stamp = this.now();
    if (
      sample.attitude ||
      sample.rotationRate ||
      sample.gravity ||
      sample.userAcceleration ||
      sample.accelerationIncludingGravity
    )
      this.observed.set("deviceMotion", stamp);
    if (sample.accelerationIncludingGravity || sample.userAcceleration)
      this.observed.set("accelerometer", stamp);
    if (sample.rotationRate) this.observed.set("gyroscope", stamp);
    for (const handler of [...this.consumers]) {
      if (!this.consumers.has(handler)) continue;
      try {
        handler(Object.freeze(sample));
      } catch {
        /* A client cannot prevent another runtime receiving its sample. */
      }
    }
  }
  private motion = (event: DeviceMotionEvent): void => {
    if (this.motionPermission !== "available") return;
    const a = event.acceleration,
      g = event.accelerationIncludingGravity,
      r = event.rotationRate;
    const userAcceleration = vector(a?.x, a?.y, a?.z),
      accelerationIncludingGravity = vector(g?.x, g?.y, g?.z);
    const rotation = vector(r?.beta, r?.gamma, r?.alpha);
    const rotationRate = rotation
      ? vector(rotation.x * radians, rotation.y * radians, rotation.z * radians)
      : null;
    // Gravity is only derived when both contemporaneous acceleration channels exist.
    const gravity =
      userAcceleration && accelerationIncludingGravity
        ? vector(
            accelerationIncludingGravity.x - userAcceleration.x,
            accelerationIncludingGravity.y - userAcceleration.y,
            accelerationIncludingGravity.z - userAcceleration.z,
          )
        : null;
    this.emit({
      timestamp: event.timeStamp / 1000,
      attitude: null,
      rotationRate,
      gravity,
      userAcceleration,
      accelerationIncludingGravity,
    });
  };
  private orientation = (event: DeviceOrientationEvent): void => {
    if (this.orientationPermission !== "available") return;
    const angles = vector(event.alpha, event.beta, event.gamma);
    if (!angles) return;
    // Device Orientation intrinsic Z-X-Y; transform device axes into the current screen axes.
    const z = MFXAttitude.fromEuler(0, 0, angles.x * radians),
      x = MFXAttitude.fromEuler(angles.y * radians, 0, 0),
      y = MFXAttitude.fromEuler(0, angles.z * radians, 0);
    const screenAngle = this.browserWindow.screen.orientation?.angle ?? 0;
    const attitude = z
      .multiply(x)
      .multiply(y)
      .multiply(MFXAttitude.fromEuler(0, 0, -screenAngle * radians));
    this.emit({
      timestamp: event.timeStamp / 1000,
      attitude,
      rotationRate: null,
      gravity: null,
      userAcceleration: null,
      accelerationIncludingGravity: null,
    });
  };
  requestAuthorization(): Promise<MFXAvailability> {
    if (this.pending) return this.pending;
    if (
      this.browserWindow.navigator.userActivation &&
      !this.browserWindow.navigator.userActivation.isActive
    )
      return Promise.reject(
        new Error("Motion authorization requires an active user gesture."),
      );
    const request = (
      constructor: PermissionConstructor | undefined,
      current: MFXAvailability,
    ): Promise<MFXAvailability> => {
      if (!constructor?.requestPermission) return Promise.resolve(current);
      try {
        return constructor.requestPermission().then(
          (value) => (value === "granted" ? "available" : "denied"),
          () => "denied",
        );
      } catch {
        return Promise.resolve("denied");
      }
    };
    // Invoke both host methods synchronously while transient activation is still live.
    const motion = request(
      this.browserWindow.DeviceMotionEvent,
      this.motionPermission,
    );
    const orientation = request(
      this.browserWindow.DeviceOrientationEvent,
      this.orientationPermission,
    );
    this.pending = Promise.all([motion, orientation])
      .then(([m, o]) => {
        this.motionPermission = m;
        this.orientationPermission = o;
        return this.combined();
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
