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
  NSEFeedbackProvider,
  NSEMaterialLighting,
  NSEMaterialLightingProvider,
} from "../NSE/hostComposition";
import { NSEAnimationEnvironmentProvider, type NSEAnimator } from "../NSE/Animation";
import {
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";
import { createMountedAnimationLayers } from "../SynCloudOS/HostServices/mountedAnimationLayers";
import type { AFXFrameScheduler } from "../FX/AnimationFX/AFXLayer";
import { createRuntimeAnimationState, createScopedAnimationFrames } from "../SynCloudOS/AnimationFX/scopedAnimationFrames";
import { ResponderHierarchyContext } from "./responderHierarchy";
import {
  SynWareRuntimeContext,
  SynCloudOSRuntimeContext,
} from "./runtimeContext";

export {
  SynWareRuntimeContext,
  SynCloudOSRuntimeContext,
  useKernelSynCloudOS,
} from "./runtimeContext";

export function SynCloudOSProvider({
  runtime,
  children,
}: PropsWithChildren<{ runtime: SynCloudOSRuntime }>) {
  const animationState = useMemo(
    () => createRuntimeAnimationState(runtime),
    [runtime],
  );
  const reducedMotion = useSyncExternalStore(
    animationState.subscribe,
    animationState.getReducedMotion,
    animationState.getReducedMotion,
  );
  // Shell NSE presentations (system alerts, dialogs) animate through the
  // runtime's AnimationFX service as the system; mounted apps replace this
  // with their own application-owned animator.
  const shellAnimator = useMemo<NSEAnimator>(
    () => Object.freeze({ animations: runtime.animations, ownerAppId: "syncloudos.system" }),
    [runtime],
  );
  const shellLayers = useMemo(() => createMountedAnimationLayers(
    runtime.environment.animationLayers, runtime.signal,
    () => runtime.signal.throwIfAborted(),
    { owner: "syncloudos.system", register: participant => runtime.resources.register(participant) },
  ), [runtime]);
  const shellFrames = useMemo<AFXFrameScheduler | null>(() => {
    const frames = runtime.environment.animationFrames;
    if (!frames) return null;
    return createScopedAnimationFrames(runtime.signal, animationState, frames);
  }, [runtime, animationState]);
  const lighting = useMemo(() => {
    if (!shellFrames) return null;
    return new NSEMaterialLighting(
      () =>
        runtime.motion.createManager({
          signal: runtime.signal,
          canRequestAuthorization: false,
        }),
      shellFrames,
    );
  }, [runtime, shellFrames]);
  return (
    <SynCloudOSRuntimeContext.Provider value={runtime}>
      <NSEAnimationEnvironmentProvider reducedMotion={reducedMotion} animator={shellAnimator} layers={shellLayers} frames={shellFrames}>
        <ResponderHierarchyContext.Provider
          value={{ runtimeId: runtime.runtimeId, responderId: null }}
        >
          <NSEFeedbackProvider value={runtime.haptics}>
            <NSEMaterialLightingProvider value={lighting}>
              {children}
            </NSEMaterialLightingProvider>
          </NSEFeedbackProvider>
        </ResponderHierarchyContext.Provider>
      </NSEAnimationEnvironmentProvider>
    </SynCloudOSRuntimeContext.Provider>
  );
}
