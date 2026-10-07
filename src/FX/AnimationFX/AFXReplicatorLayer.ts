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

import {
  AFXLayer,
  type AFXLayerSurface,
  type AFXFrameScheduler,
} from "./AFXLayer";
import { AFXTransform3D } from "./AFXTransform3D";
import { GFXColour } from "../GraphicsFX/GFXColour";
import { layerColour, layerFinite } from "./AFXLayerStyle";
import type {
  AFXReplication,
  AFXReplicaPresentation,
  AFXReplicationProjectionMode,
} from "./AFXReplication";
import type { AFXSampledAnimation } from "./AFXAnimationGroup";
import type {
  AFXAnimationHandle,
  AFXAnimationSettlement,
  AFXAnimationScalar,
} from "./animationTypes";
let nextReplicaPlayback = 0;
/** Bounded visual replication; supplied instance animations use actual measured seconds. */
export class AFXReplicatorLayer extends AFXLayer {
  readonly #surface: AFXLayerSurface;
  readonly #scheduler: AFXFrameScheduler;
  #config: AFXReplication = Object.freeze({
    projectionMode: "planar",
    instanceCount: 1,
    instanceTransform: new AFXTransform3D(),
    instanceColour: GFXColour.rgba(1, 1, 1, 1),
    instanceRedOffset: 0,
    instanceGreenOffset: 0,
    instanceBlueOffset: 0,
    instanceAlphaOffset: 0,
    instanceDelay: 0,
    instances: Object.freeze([]),
  });
  #values: readonly (AFXAnimationScalar | null)[] = [];
  #property: string | null = null;
  #running: {
    finish: (state: AFXAnimationSettlement["state"]) => void;
  } | null = null;
  constructor(
    surface: AFXLayerSurface,
    scheduler: AFXFrameScheduler,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ) {
    super(surface, scheduler, options);
    this.#surface = surface;
    this.#scheduler = scheduler;
    try {
      this.setReplication(this.#config);
    } catch (error) {
      super.dispose();
      throw error;
    }
  }
  #set<K extends keyof AFXReplication>(key: K, value: AFXReplication[K]) {
    const next = Object.freeze({
      ...this.#config,
      [key]: value,
      instances: Object.freeze([]),
    });
    if (next.instanceDelay * Math.max(0, next.instanceCount - 1) > 4)
      throw new RangeError("Total replica delay must not exceed four seconds.");
    this.setReplication(next);
    this.#running?.finish("interrupted");
    this.#config = next;
    this.#values = [];
  }
  get instanceCount() {
    return this.#config.instanceCount;
  }
  set instanceCount(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 64)
      throw new RangeError("Instance count must be an integer from zero to64.");
    this.#set("instanceCount", value);
  }
  get instanceTransform() {
    return this.#config.instanceTransform;
  }
  set instanceTransform(value: AFXTransform3D) {
    if (!(value instanceof AFXTransform3D))
      throw new TypeError("Instance transform requires AFXTransform3D.");
    this.#set("instanceTransform", value);
  }
  get projectionMode() {
    return this.#config.projectionMode;
  }
  set projectionMode(value: AFXReplicationProjectionMode) {
    if (!["planar", "projective"].includes(value))
      throw new TypeError("Unsupported replication projection mode.");
    if (
      value === "projective" &&
      this.#surface.replicationCapability?.().projectiveDepth !== true
    )
      throw new Error("This replication surface does not preserve projective depth.");
    this.#set("projectionMode", value);
  }
  get instanceColour() {
    return this.#config.instanceColour;
  }
  set instanceColour(value: GFXColour) {
    if (!value) throw new TypeError("Instance colour requires GFXColour.");
    this.#set("instanceColour", layerColour(value)!);
  }
  get instanceDelay() {
    return this.#config.instanceDelay;
  }
  set instanceDelay(value: number) {
    this.#set("instanceDelay", layerFinite(value, "instance delay", 0, 4));
  }
  get instanceRedOffset() {
    return this.#config.instanceRedOffset;
  }
  set instanceRedOffset(value: number) {
    this.#set("instanceRedOffset", layerFinite(value, "red offset", -1, 1));
  }
  get instanceGreenOffset() {
    return this.#config.instanceGreenOffset;
  }
  set instanceGreenOffset(value: number) {
    this.#set("instanceGreenOffset", layerFinite(value, "green offset", -1, 1));
  }
  get instanceBlueOffset() {
    return this.#config.instanceBlueOffset;
  }
  set instanceBlueOffset(value: number) {
    this.#set("instanceBlueOffset", layerFinite(value, "blue offset", -1, 1));
  }
  get instanceAlphaOffset() {
    return this.#config.instanceAlphaOffset;
  }
  set instanceAlphaOffset(value: number) {
    this.#set("instanceAlphaOffset", layerFinite(value, "alpha offset", -1, 1));
  }
  get preservesDepth() {
    return (
      this.#config.projectionMode === "projective" &&
      this.#surface.replicationCapability?.().projectiveDepth === true
    );
  }
  /** Animates each generated instance while child presentation history remains independently delayed. */
  playInstances(input: AFXSampledAnimation): AFXAnimationHandle {
    if (!["opacity", "transform"].includes(input.keyPath))
      throw new TypeError("Instance playback supports opacity and transform.");
    const count = this.instanceCount,
      delay = this.instanceDelay;
    const variants = Array.from({ length: count }, (_, index) =>
      this.#property === input.keyPath &&
      this.#values[index] != null &&
      input.retarget
        ? input.retarget(this.#values[index]!)
        : input,
    );
    const duration = count
      ? Math.max(
          ...variants.map(
            (animation, index) =>
              animation.animation.totalDuration + index * delay,
          ),
        )
      : 0;
    const start = this.#scheduler.now();
    if (!Number.isFinite(start))
      throw new RangeError("Replica clock must be finite.");
    let elapsed = 0,
      last = start,
      state: AFXAnimationHandle["state"] = "running",
      cancelFrame: (() => void) | null = null,
      releaseState: (() => void) | null = null,
      resolve!: (value: AFXAnimationSettlement) => void;
    const finished = new Promise<AFXAnimationSettlement>((done) => {
      resolve = done;
    });
    const project = (time: number) => {
      const values = variants.map((animation, index) =>
        animation.sample(time - index * delay),
      );
      const instances: readonly AFXReplicaPresentation[] = Object.freeze(
        values.map((value) =>
          Object.freeze({
            opacity:
              input.keyPath === "opacity" && typeof value === "number"
                ? Math.max(
                    0,
                    Math.min(1, layerFinite(value, "sampled opacity")),
                  )
                : 1,
            transform:
              input.keyPath === "transform" && value !== null
                ? AFXTransform3D.fromCSS(
                    typeof value === "string"
                      ? value
                      : (() => {
                          throw new TypeError(
                            "Transform sample must be a string.",
                          );
                        })(),
                    this.bounds,
                  )
                : new AFXTransform3D(),
          }),
        ),
      );
      const config = Object.freeze({ ...this.#config, instances });
      this.setReplication(config);
      this.#config = config;
      this.#values = Object.freeze(values);
      this.#property = input.keyPath;
    };
    const finish = (result: AFXAnimationSettlement["state"]) => {
      if (state !== "running" && state !== "paused") return;
      state = result;
      try {
        cancelFrame?.();
      } catch {
        /* Complete independent teardown. */
      }
      cancelFrame = null;
      try {
        releaseState?.();
      } catch {
        /* Settlement must still resolve. */
      }
      releaseState = null;
      this.#running = null;
      resolve(
        Object.freeze({
          state: result,
          reduced: this.#scheduler.reducedMotion || this.#scheduler.suspended,
        }),
      );
    };
    const final = () => {
      try {
        elapsed = duration;
        project(duration);
        finish("completed");
      } catch {
        finish("failed");
      }
    };
    const schedule = () => {
      try {
        cancelFrame = this.#scheduler.requestFrame(tick);
      } catch {
        finish("failed");
      }
    };
    const tick = (time: number) => {
      cancelFrame = null;
      if (state !== "running") return;
      if (this.#scheduler.reducedMotion || this.#scheduler.suspended) {
        final();
        return;
      }
      if (!Number.isFinite(time) || time < last) {
        finish("failed");
        return;
      }
      elapsed = Math.min(duration, elapsed + time - last);
      last = time;
      try {
        project(elapsed);
      } catch {
        finish("failed");
        return;
      }
      if (elapsed >= duration) finish("completed");
      else schedule();
    };
    const handle: AFXAnimationHandle = Object.freeze({
      id: "afx-replica:" + ++nextReplicaPlayback,
      get state() {
        return state;
      },
      get progress() {
        return duration ? elapsed / duration : 1;
      },
      finished,
      cancel: () => finish("cancelled"),
      pause: () => {
        if (state !== "running") return;
        cancelFrame?.();
        cancelFrame = null;
        state = "paused";
      },
      resume: () => {
        if (state !== "paused") return;
        state = "running";
        last = this.#scheduler.now();
        if (this.#scheduler.reducedMotion || this.#scheduler.suspended) final();
        else schedule();
      },
      seek: (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > duration)
          throw new RangeError("Replica seek is outside its bounded timeline.");
        if (state !== "running" && state !== "paused") return;
        elapsed = seconds;
        last = this.#scheduler.now();
        try {
          project(seconds);
        } catch {
          finish("failed");
        }
      },
    });
    // Validate and project before interrupting the preceding successful playback.
    project(0);
    this.#running?.finish("interrupted");
    this.#running = { finish };
    if (
      duration === 0 ||
      this.#scheduler.reducedMotion ||
      this.#scheduler.suspended
    )
      final();
    else {
      try {
        const release =
          this.#scheduler.subscribeState?.(() => {
            if (this.#scheduler.reducedMotion || this.#scheduler.suspended)
              final();
          }) ?? null;
        if (state === "running") {
          releaseState = release;
          schedule();
        } else release?.();
      } catch {
        finish("failed");
      }
    }
    return handle;
  }
  override dispose() {
    this.#running?.finish("cancelled");
    super.dispose();
  }
}
