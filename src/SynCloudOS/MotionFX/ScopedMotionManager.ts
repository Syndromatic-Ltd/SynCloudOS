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

import { SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "../fxRuntimeContracts";

import { ScopedMotionRecorder } from "./ScopedMotionRecorder";
import {
  MFXAttitude,
  type MFXAttitudeReferenceFrame,
  type MFXVector3,
} from "../../FX/MotionFX/MFXAttitude";
import {
  MFXSensors,
  type MFXAvailability,
  type MFXMotionCapabilities,
} from "../../FX/MotionFX/MFXMotionCapabilities";
import type {
  MFXAccelerometerData,
  MFXDeviceMotion,
  MFXGyroData,
  MFXMotionSubscription,
} from "../../FX/MotionFX/MFXDeviceMotion";
import type { MFXMotionRecorder } from "../../FX/MotionFX/MFXMotionRecorder";
import type {
  MFXMotionAdapter,
  MFXRawMotionSample,
} from "./motionAdapterTypes";

type Stream = "deviceMotion" | "accelerometer" | "gyroscope";
function immutableVector(value: MFXVector3 | null): MFXVector3 | null {
  return value && [value.x, value.y, value.z].every(Number.isFinite)
    ? Object.freeze({ x: value.x, y: value.y, z: value.z })
    : null;
}
interface Consumer {
  readonly stream: Stream;
  readonly deliver: (sample: MFXRawMotionSample) => void;
  dispose(): void;
}
export interface MFXMotionManagerOptions {
  readonly signal?: AbortSignal;
  readonly canRequestAuthorization?: boolean;
  readonly onDispose?: () => void;
}

/** A revocable, session-owned sensor client. Construction and subscriptions are passive. */
export class ScopedMotionManager {
  readonly #lifecycle = new SynCloudOSLifecycleRecord({ kind: "ScopedMotionManager" });
  #disposed = false;
  #consumers = new Set<Consumer>();
  #recorders = new Set<ScopedMotionRecorder>();
  #detach: (() => void) | null = null;
  #attaching = false;
  #reference: MFXAttitude | null = null;
  #rawAttitude: MFXAttitude | null = null;
  #latest: MFXDeviceMotion | null = null;
  #previousTimestamp: number | null = null;
  #cadence: number | null = null;
  #interval = 1 / 60;
  #accelerometerInterval = 1 / 60;
  #gyroInterval = 1 / 60;
  #accelerometerData: MFXAccelerometerData | null = null;
  #gyroData: MFXGyroData | null = null;
  #lastRawTimestamp: number | null = null;
  #abortListener: (() => void) | null = null;
  readonly #adapter: MFXMotionAdapter;
  readonly #options: MFXMotionManagerOptions;
  constructor(
    adapter: MFXMotionAdapter,
    options: MFXMotionManagerOptions = {},
  ) {
    this.#adapter = adapter;
    this.#options = options;
    this.#abortListener = () => this.dispose();
    if (options.signal?.aborted) this.dispose();
    else
      options.signal?.addEventListener("abort", this.#abortListener, {
        once: true,
      });
  }
  get capabilities(): MFXMotionCapabilities {
    const caps = this.#adapter.capabilities;
    return Object.freeze(
      Object.fromEntries(
        MFXSensors.map((key) => [
          key,
          Object.freeze({
            ...caps[key],
            ...(this.#disposed
              ? {
                  state: "disposed" as const,
                  reason: "Motion owner has been disposed.",
                }
              : {}),
          }),
        ]),
      ),
    ) as MFXMotionCapabilities;
  }
  get deviceMotion(): MFXDeviceMotion | null {
    return this.#latest;
  }
  get accelerometerData(): MFXAccelerometerData | null {
    return this.#accelerometerData;
  }
  get gyroData(): MFXGyroData | null {
    return this.#gyroData;
  }
  get accelerometerUpdateInterval(): number {
    return this.#accelerometerInterval;
  }
  get gyroUpdateInterval(): number {
    return this.#gyroInterval;
  }
  setAccelerometerUpdateInterval(seconds: number): void {
    this.#assertLive("setAccelerometerUpdateInterval");
    this.#validateInterval(seconds);
    this.#accelerometerInterval = seconds;
  }
  setGyroUpdateInterval(seconds: number): void {
    this.#assertLive("setGyroUpdateInterval");
    this.#validateInterval(seconds);
    this.#gyroInterval = seconds;
  }
  get deviceMotionUpdateInterval(): number {
    return this.#interval;
  }
  /** Actual delivered device-motion interval in seconds; null until two observations. */
  get observedUpdateInterval(): number | null {
    return this.#cadence;
  }
  setDeviceMotionUpdateInterval(seconds: number): void {
    this.#assertLive("setDeviceMotionUpdateInterval");
    this.#validateInterval(seconds);
    this.#interval = seconds;
  }
  #validateInterval(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600)
      throw new RangeError(
        "Motion cadence must be finite and positive, at most one hour.",
      );
  }
  #assertLive(operation: string): void {
    if (this.#disposed) throw this.#lifecycle.error({ code: "MFX_MOTION_MANAGER_DISPOSED", operation: operation });
  }
  #subscribe(
    operation: string,
    stream: Stream,
    deliver: Consumer["deliver"],
    signal?: AbortSignal,
  ): MFXMotionSubscription {
    this.#assertLive(operation);
    if (signal?.aborted) return Object.freeze({ dispose() {} });
    if (this.#consumers.size >= 128)
      throw new RangeError("Motion subscription limit reached.");
    let released = false;
    const consumer: Consumer = {
      stream,
      deliver,
      dispose: () => {
        if (released) return;
        released = true;
        signal?.removeEventListener("abort", consumer.dispose);
        this.#consumers.delete(consumer);
        if (
          ![...this.#consumers].some((item) => item.stream === "accelerometer")
        )
          this.#accelerometerData = null;
        if (![...this.#consumers].some((item) => item.stream === "gyroscope"))
          this.#gyroData = null;
        if (![...this.#consumers].some((item) => item.stream === "deviceMotion")) {
          this.#latest = null;
          this.#rawAttitude = null;
          this.#reference = null;
          this.#previousTimestamp = null;
          this.#cadence = null;
        }
        if (!this.#consumers.size) {
          this.#detach?.();
          this.#detach = null;
          this.#latest = null;
          this.#rawAttitude = null;
          this.#reference = null;
          this.#previousTimestamp = null;
          this.#cadence = null;
          this.#lastRawTimestamp = null;
        }
      },
    };
    this.#consumers.add(consumer);
    signal?.addEventListener("abort", consumer.dispose, { once: true });
    if (!this.#detach && !this.#attaching) {
      this.#attaching = true;
      try {
        const detach = this.#adapter.subscribe((sample) => {
          if (
            this.#disposed ||
            !Number.isFinite(sample.timestamp) ||
            sample.timestamp < 0 ||
            (this.#lastRawTimestamp !== null &&
              sample.timestamp < this.#lastRawTimestamp)
          )
            return;
          this.#lastRawTimestamp = sample.timestamp;
          if (sample.attitude && [...this.#consumers].some(item => item.stream === "deviceMotion"))
            this.#rawAttitude = new MFXAttitude(
              sample.attitude.quaternion,
            ).continuousWith(this.#rawAttitude);
          const owned = Object.freeze({
            timestamp: sample.timestamp,
            attitude: sample.attitude ? this.#rawAttitude : null,
            rotationRate: immutableVector(sample.rotationRate),
            gravity: immutableVector(sample.gravity),
            userAcceleration: immutableVector(sample.userAcceleration),
            accelerationIncludingGravity: immutableVector(
              sample.accelerationIncludingGravity,
            ),
          });
          for (const target of [...this.#consumers]) {
            if (!this.#consumers.has(target)) continue;
            try {
              target.deliver(owned);
            } catch {
              /* One consumer must not break other scoped subscribers. */
            }
          }
        });
        if (this.#disposed || !this.#consumers.size) detach();
        else this.#detach = detach;
      } catch (error) {
        // Reentrant subscriptions joined this same acquisition and must roll back too.
        for (const pending of [...this.#consumers]) pending.dispose();
        throw error;
      } finally {
        this.#attaching = false;
      }
    }
    return Object.freeze({ dispose: consumer.dispose });
  }
  startDeviceMotionUpdates(
    options: Readonly<{
      referenceFrame: MFXAttitudeReferenceFrame;
      signal?: AbortSignal;
    }>,
    handler: (sample: MFXDeviceMotion) => void,
  ): MFXMotionSubscription {
    this.#assertLive("startDeviceMotionUpdates");
    if (options.referenceFrame !== "relative")
      throw new Error(
        `Unsupported attitude reference frame: ${options.referenceFrame}.`,
      );
    let lastAttitude: number | null = null,
      lastMotion: number | null = null,
      prior: MFXAttitude | null = null;
    return this.#subscribe(
      "startDeviceMotionUpdates",
      "deviceMotion",
      (raw) => {
        // Browser orientation and motion are independent event sources. One must not
        // consume the other's cadence slot; keep each event's actual nullable channels.
        const hasAttitude = raw.attitude !== null;
        const hasMotion = !!(raw.rotationRate || raw.gravity || raw.userAcceleration || raw.accelerationIncludingGravity);
        const attitudeDue = hasAttitude && (lastAttitude === null || raw.timestamp - lastAttitude >= this.#interval - 1e-9);
        const motionDue = hasMotion && (lastMotion === null || raw.timestamp - lastMotion >= this.#interval - 1e-9);
        if (!attitudeDue && !motionDue) return;
        let attitude = raw.attitude;
        if (attitude && this.#reference)
          attitude = this.#reference.inverse().multiply(attitude);
        attitude = attitude?.continuousWith(prior) ?? null;
        prior = attitude;
        const sample: MFXDeviceMotion = Object.freeze({
          timestamp: raw.timestamp,
          attitude,
          rotationRate: raw.rotationRate,
          gravity: raw.gravity,
          userAcceleration: raw.userAcceleration,
          referenceFrame: options.referenceFrame,
        });
        if (
          this.#previousTimestamp !== null &&
          raw.timestamp > this.#previousTimestamp
        )
          this.#cadence = raw.timestamp - this.#previousTimestamp;
        this.#previousTimestamp = raw.timestamp;
        this.#latest = sample;
        if (hasAttitude) lastAttitude = raw.timestamp;
        if (hasMotion) lastMotion = raw.timestamp;
        handler(sample);
      },
      options.signal,
    );
  }
  startAccelerometerUpdates(
    handler: (sample: MFXAccelerometerData) => void,
    signal?: AbortSignal,
  ): MFXMotionSubscription {
    let last: number | null = null;
    return this.#subscribe(
      "startAccelerometerUpdates",
      "accelerometer",
      (sample) => {
        if (
          last !== null &&
          sample.timestamp - last < this.#accelerometerInterval - 1e-9
        )
          return;
        const acceleration =
          sample.accelerationIncludingGravity ?? sample.userAcceleration;
        if (acceleration) {
          last = sample.timestamp;
          this.#accelerometerData = Object.freeze({
            timestamp: sample.timestamp,
            acceleration,
            includesGravity: sample.accelerationIncludingGravity !== null,
          });
          handler(this.#accelerometerData);
        }
      },
      signal,
    );
  }
  startGyroUpdates(
    handler: (sample: MFXGyroData) => void,
    signal?: AbortSignal,
  ): MFXMotionSubscription {
    let last: number | null = null;
    return this.#subscribe(
      "startGyroUpdates",
      "gyroscope",
      (sample) => {
        if (
          last !== null &&
          sample.timestamp - last < this.#gyroInterval - 1e-9
        )
          return;
        if (sample.rotationRate) {
          last = sample.timestamp;
          this.#gyroData = Object.freeze({
            timestamp: sample.timestamp,
            rotationRate: sample.rotationRate,
          });
          handler(this.#gyroData);
        }
      },
      signal,
    );
  }
  #stop(stream: Stream): void {
    for (const item of [...this.#consumers])
      if (item.stream === stream) item.dispose();
  }
  stopDeviceMotionUpdates(): void {
    this.#stop("deviceMotion");
    for (const recorder of this.#recorders) recorder.dispose();
    this.#recorders.clear();
    this.#latest = null;
  }
  stopAccelerometerUpdates(): void {
    this.#stop("accelerometer");
    this.#accelerometerData = null;
  }
  stopGyroUpdates(): void {
    this.#stop("gyroscope");
    this.#gyroData = null;
  }
  resetReferenceFrame(): void {
    this.#assertLive("resetReferenceFrame");
    this.#reference = this.#rawAttitude;
    this.#latest = null;
  }
  createRecorder(
    options: Readonly<{
      maximumSamples?: number;
      maximumAge?: number;
      signal?: AbortSignal;
    }> = {},
  ): MFXMotionRecorder {
    this.#assertLive("createRecorder");
    const recorder = new ScopedMotionRecorder(
      options.maximumSamples,
      options.maximumAge,
    );
    // Register before a host can synchronously deliver a sample and revoke this owner.
    this.#recorders.add(recorder);
    let subscription: MFXMotionSubscription;
    try {
      subscription = this.startDeviceMotionUpdates(
        { referenceFrame: "relative", signal: options.signal },
        (sample) => recorder.record(sample),
      );
    } catch (error) {
      this.#recorders.delete(recorder);
      recorder.dispose();
      throw error;
    }
    const abort = () => recorder.dispose();
    recorder.attach({
      dispose: () => {
        subscription.dispose();
        this.#recorders.delete(recorder);
        options.signal?.removeEventListener("abort", abort);
      },
    });
    if (this.#disposed || options.signal?.aborted) recorder.dispose();
    else options.signal?.addEventListener("abort", abort, { once: true });
    const facade = Object.create(null) as MFXMotionRecorder;
    for (const key of ["samples", "maximumSamples", "maximumAge"] as const)
      Object.defineProperty(facade, key, {
        enumerable: true,
        get: () => recorder[key],
      });
    Object.defineProperties(facade, {
      clear: { value: recorder.clear.bind(recorder) },
      dispose: { value: recorder.dispose.bind(recorder) },
    });
    return Object.freeze(facade);
  }
  async requestAuthorization(): Promise<MFXAvailability> {
    this.#assertLive("requestAuthorization");
    if (!this.#options.canRequestAuthorization)
      throw new Error("Explicit motion authorization capability is required.");
    const result = await this.#adapter.requestAuthorization();
    return this.#disposed ? "disposed" : result;
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#lifecycle.markDisposed(this.#options.signal?.aborted ? synCloudOSLifecycleSignalReason(this.#options.signal) : "explicit");
    this.#disposed = true;
    if (this.#abortListener)
      this.#options.signal?.removeEventListener("abort", this.#abortListener);
    this.#abortListener = null;
    for (const recorder of this.#recorders) recorder.dispose();
    this.#recorders.clear();
    for (const item of [...this.#consumers]) item.dispose();
    this.#detach?.();
    this.#detach = null;
    this.#latest = null;
    this.#reference = null;
    this.#rawAttitude = null;
    this.#accelerometerData = null;
    this.#gyroData = null;
    this.#options.onDispose?.();
  }
}
