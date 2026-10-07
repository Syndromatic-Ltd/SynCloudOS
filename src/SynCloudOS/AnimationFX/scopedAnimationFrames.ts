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
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

interface RuntimeAnimationState {
  readonly getReducedMotion: () => boolean;
  readonly getSuspended: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

/** Internal policy shared by shell and mounted NSE presentations. */
export function createRuntimeAnimationState(
  runtime: SynCloudOSRuntime,
  owner: AbortSignal = runtime.signal,
  isSuspended: () => boolean = () => false,
): RuntimeAnimationState {
  const frames = runtime.environment.animationFrames;
  const getReducedMotion = () => {
    if (frames?.reducedMotion) return true;
    const motion = runtime.settings.get().motion;
    if (motion === "reduced") return true;
    if (motion === "standard") return false;
    return runtime.store.getSnapshot().responsive.prefersReducedMotion;
  };
  const getSuspended = () => owner.aborted || Boolean(frames?.suspended) || isSuspended();
  return Object.freeze({
    getReducedMotion,
    getSuspended,
    subscribe(listener: () => void) {
      if (owner.aborted) return () => {};
      let active = true;
      let reducedMotion = getReducedMotion(), suspended = getSuspended();
      const notify = () => {
        if (!active) return;
        const nextReducedMotion = getReducedMotion(), nextSuspended = getSuspended();
        if (nextReducedMotion === reducedMotion && nextSuspended === suspended) return;
        reducedMotion = nextReducedMotion; suspended = nextSuspended;
        listener();
      };
      const releases = [
        runtime.settings.subscribe(notify),
        runtime.store.subscribe(notify),
        frames?.subscribeState?.(notify),
      ];
      const release = () => {
        if (!active) return;
        active = false;
        owner.removeEventListener("abort", abort);
        for (const unsubscribe of releases) unsubscribe?.();
      };
      const abort = () => {
        const changed = !suspended;
        suspended = true;
        release();
        if (changed) listener();
      };
      owner.addEventListener("abort", abort, { once: true });
      if (owner.aborted) abort();
      return release;
    },
  });
}

/** No subscriptions are installed until a consumer requests work or state. */
export function createScopedAnimationFrames(
  owner: AbortSignal,
  state: RuntimeAnimationState,
  timing: Pick<AFXFrameScheduler, "now" | "requestFrame">,
): AFXFrameScheduler {
  return Object.freeze({
    now: () => timing.now(),
    get reducedMotion() { return state.getReducedMotion(); },
    get suspended() { return state.getSuspended(); },
    subscribeState: state.subscribe,
    requestFrame(callback: (time: number) => void) {
      if (owner.aborted) return () => {};
      let pending = true, cancelled = false;
      let cancelSource: (() => void) | undefined;
      const cancel = () => {
        if (!pending) return;
        pending = false; cancelled = true;
        owner.removeEventListener("abort", cancel);
        cancelSource?.();
      };
      owner.addEventListener("abort", cancel, { once: true });
      try {
        cancelSource = timing.requestFrame(time => {
          if (!pending) return;
          pending = false;
          owner.removeEventListener("abort", cancel);
          if (!owner.aborted) callback(time);
        });
        // An owner can abort synchronously while the host allocates a handle.
        if (cancelled) cancelSource();
      } catch (error) {
        cancel();
        throw error;
      }
      return cancel;
    },
  });
}
