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
  SafeAreaMeasurementProvider,
} from "../NSE/hostComposition";
import { AnimationEnvironmentProvider, type Animator } from "../NSE/Animation";
import { ViewControllerRendererProvider } from "../NSE/applicationHostInterop";
import { ViewControllerView } from "../SynCloudOS/AppHosting/runtimeEntry";
import { registerNSEHapticFeedbackEngine } from "../NSE/hostComposition";
import { ViewDrawingEnvironmentContext, type ViewDrawingEnvironment } from "../NSE/hostComposition";
import {
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";
import { createMountedAnimationLayers, observeMountedAnimationLayers } from "../SynCloudOS/HostServices/mountedAnimationLayers";
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
  const shellAnimator = useMemo<Animator>(
    () => Object.freeze({ animations: runtime.animations, ownerAppId: "syncloudos.system" }),
    [runtime],
  );
  const shellLayers = useMemo(() => createMountedAnimationLayers(
    runtime.environment.animationLayers, runtime.signal,
    () => runtime.signal.throwIfAborted(),
    { owner: "syncloudos.system", register: participant => runtime.resources.register(participant) },
    false,
  ), [runtime]);
  useInsertionEffect(() => observeMountedAnimationLayers(shellLayers), [shellLayers]);
  const shellFrames = useMemo<AFXFrameScheduler | null>(() => {
    const frames = runtime.environment.animationFrames;
    if (!frames) return null;
    return createScopedAnimationFrames(runtime.signal, animationState, frames);
  }, [runtime, animationState]);
  // NSEHapticFeedbackManager.defaultPerformer performs through this runtime's engine while it is mounted.
  useLayoutEffect(() => (runtime.haptics ? registerNSEHapticFeedbackEngine(runtime.haptics) : undefined), [runtime.haptics]);
  const drawingEnvironment = useMemo<ViewDrawingEnvironment>(() => ({
    createGraphicsIdentifierIssuer: () => runtime.images.createGraphicsIdentifierIssuer(),
    // The kernel owns the same geometry exposed to mounted apps as images.geometry.
    geometry: runtime.environment.imageGeometry,
  }), [runtime]);
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
      <AnimationEnvironmentProvider reducedMotion={reducedMotion} animator={shellAnimator} layers={shellLayers} frames={shellFrames}>
        <ResponderHierarchyContext.Provider
          value={{ runtimeId: runtime.runtimeId, responderId: null }}
        >
          <NSEFeedbackProvider value={runtime.haptics}>
            <NSEMaterialLightingProvider value={lighting}>
              <ViewDrawingEnvironmentContext.Provider value={drawingEnvironment}>
                <ViewControllerRendererProvider value={ViewControllerView}>
                  <SafeAreaMeasurementProvider>{children}</SafeAreaMeasurementProvider>
                </ViewControllerRendererProvider>
              </ViewDrawingEnvironmentContext.Provider>
            </NSEMaterialLightingProvider>
          </NSEFeedbackProvider>
        </ResponderHierarchyContext.Provider>
      </AnimationEnvironmentProvider>
    </SynCloudOSRuntimeContext.Provider>
  );
}
