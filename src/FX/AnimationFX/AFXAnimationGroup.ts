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

import type {
  AFXAnimationDefinition,
  AFXAnimationHandle,
  AFXAnimationSettlement,
  AFXAnimationScalar,
} from "./animationTypes";
export interface AFXSampledAnimation {
  readonly targetId: string;
  readonly keyPath: string;
  readonly animation: Readonly<{ totalDuration: number }>;
  sample(seconds: number): AFXAnimationScalar | null;
  toRuntime(): AFXAnimationDefinition;
  retarget?(from: AFXAnimationScalar): AFXSampledAnimation;
}
export type AFXAnimationExecutor = (
  target: object,
  definition: AFXAnimationDefinition,
) => AFXAnimationHandle;

export class AFXAnimationGroup {
  readonly animations: readonly AFXSampledAnimation[];
  readonly duration: number;
  constructor(animations: readonly AFXSampledAnimation[]) {
    if (!animations.length || animations.length > 64)
      throw new RangeError("Animation groups require 1–64 children.");
    this.animations = Object.freeze([...animations]);
    this.duration = Math.max(
      ...animations.map((x) => x.animation.totalDuration),
    );
    Object.freeze(this);
  }
  sample(seconds: number): Readonly<Record<string, AFXAnimationScalar | null>> {
    if (!Number.isFinite(seconds))
      throw new RangeError("Group time must be finite.");
    return Object.freeze(
      Object.fromEntries(
        this.animations.map((x) => [
          `${x.targetId}:${x.keyPath}`,
          x.sample(seconds),
        ]),
      ),
    );
  }
  play(target: object, execute: AFXAnimationExecutor): AFXAnimationHandle {
    const handles: AFXAnimationHandle[] = [];
    try {
      for (const child of this.animations)
        handles.push(execute(target, child.toRuntime()));
    } catch (error) {
      for (const handle of handles) handle.cancel("group construction failed");
      throw error;
    }
    let state: AFXAnimationHandle["state"] = "running";
    const finished = Promise.all(handles.map((x) => x.finished)).then(
      (results) => {
        const failure = results.find((x) => x.state !== "completed");
        state =
          state === "cancelled" ? "cancelled" : (failure?.state ?? "completed");
        return Object.freeze({
          state,
          reduced: results.some((x) => x.reduced),
          ...(failure?.reason ? { reason: failure.reason } : {}),
        }) as AFXAnimationSettlement;
      },
    );
    return Object.freeze({
      id: `afx-group:${handles.map((x) => x.id).join(":")}`,
      get progress() {
        return handles.reduce((sum, x) => sum + x.progress, 0) / handles.length;
      },
      get state() {
        return state;
      },
      finished,
      cancel(reason?: string) {
        if (state === "running" || state === "paused") {
          state = "cancelled";
          for (const handle of handles) handle.cancel(reason);
        }
      },
      pause() {
        if (state === "running") {
          state = "paused";
          for (const handle of handles) handle.pause();
        }
      },
      resume() {
        if (state === "paused") {
          state = "running";
          for (const handle of handles) handle.resume();
        }
      },
      seek(seconds: number) {
        if (!Number.isFinite(seconds) || seconds < 0)
          throw new RangeError("Seek time must be finite and nonnegative.");
        for (const handle of handles) handle.seek(seconds);
      },
    });
  }
}
