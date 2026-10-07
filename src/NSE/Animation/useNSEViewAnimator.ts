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

import type { AFXAnimationHandle, AFXAnimationKeyPath, AFXAnimationScalar } from "../../FX/AnimationFX/animationTypes";
import { useLayoutEffect, useMemo, useRef } from "react";
import type {
  RuntimeAnimationOwner,
  RuntimeAnimationOwnerLease,
  RuntimeAnimationService,
} from "../../SynCloudOS/SynCloudOS";
import { AFXAnimation } from "../../FX/AnimationFX/AFXAnimation";
import { AFXBasicAnimation } from "../../FX/AnimationFX/AFXBasicAnimation";

function inactiveHandle(generation: number): AFXAnimationHandle {
  return Object.freeze({
    id: `nse-animation:inactive:${generation}`,
    progress: 0,
    state: "cancelled" as const,
    finished: Promise.resolve(Object.freeze({ state: "cancelled" as const, reduced: false, reason: "animation view is not committed" })),
    cancel() {}, pause() {}, resume() {}, seek() {},
  });
}

export function useNSEViewAnimator(input: {
  readonly animations: Pick<RuntimeAnimationService, "acquireOwner" | "animate">;
  readonly owner: Omit<RuntimeAnimationOwner, "generation">;
  readonly target: object;
  readonly targetId: string;
}) {
  const committed = useRef<Readonly<{ identity: object; owner: RuntimeAnimationOwnerLease }> | null>(null);
  const identity = useMemo(() => Object.freeze({
    animations: input.animations,
    owner: Object.freeze({
      appId: input.owner.appId,
      viewId: input.owner.viewId,
      ...(input.owner.windowControllerId === undefined ? {} : { windowControllerId: input.owner.windowControllerId }),
    }),
    target: input.target,
    targetId: input.targetId,
  }), [input.animations, input.owner.appId, input.owner.viewId, input.owner.windowControllerId, input.target, input.targetId]);
  useLayoutEffect(() => {
    const lease = identity.animations.acquireOwner(identity.owner);
    const activation = Object.freeze({ identity, owner: lease });
    committed.current = activation;
    return () => {
      if (committed.current === activation) committed.current = null;
      lease.release("animation view unmounted");
    };
  }, [identity]);
  return useMemo(() => {
    let generation = 0;
    return Object.freeze({
      animate(keyPath: AFXAnimationKeyPath, from: AFXAnimationScalar, to: AFXAnimationScalar, animation: AFXAnimation) {
        generation += 1;
        const activation = committed.current;
        if (!activation || activation.identity !== identity) return inactiveHandle(generation);
        const definition = new AFXBasicAnimation({ targetId: identity.targetId, keyPath, from, to, animation });
        return identity.animations.animate(identity.target, definition.toRuntime(), activation.owner, generation);
      },
    });
  }, [identity]);
}
