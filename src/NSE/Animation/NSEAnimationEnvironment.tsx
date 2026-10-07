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
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import type { RuntimeAnimationService } from "../../SynCloudOS/SynCloudOS";
import type { AFXFrameScheduler } from "../../FX/AnimationFX/AFXLayer";
import type { AFXRenderer, AFXRendererOptions } from "../../FX/AnimationFX/AFXRenderer";

/** The layer capability NSE needs; host and app clients satisfy it structurally. */
interface NSEAnimationLayers {
  createRenderer(target: object, options?: Pick<AFXRendererOptions, "maximumQuads" | "onRenderError">, signal?: AbortSignal): AFXRenderer;
}

/** Where NSE views run presentation animations: an AnimationFX service and
 * the owner identity its leases carry (the shell, or the mounted app). */
export interface NSEAnimator {
  readonly animations: Pick<RuntimeAnimationService, "acquireOwner" | "animate">;
  readonly ownerAppId: string;
}

export interface NSEAnimationEnvironment {
  readonly reducedMotion: boolean;
  /** Absent outside a runtime: views then appear in their final state. */
  readonly animator: NSEAnimator | null;
  /** Scoped layer rendering and frame timing for custom NSE/shell artwork. */
  readonly layers: NSEAnimationLayers | null;
  readonly frames: AFXFrameScheduler | null;
}

export interface NSEAnimationEnvironmentProviderProps extends PropsWithChildren {
  readonly reducedMotion?: boolean;
  /** Replaces the inherited animator (e.g. with an application-owned one). */
  readonly animator?: NSEAnimator | null;
  readonly layers?: NSEAnimationLayers | null;
  readonly frames?: AFXFrameScheduler | null;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const defaultEnvironment: NSEAnimationEnvironment = Object.freeze({
  reducedMotion: false,
  animator: null,
  layers: null,
  frames: null,
});
const NSEAnimationEnvironmentContext = createContext(defaultEnvironment);

function getSystemReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotion(): boolean {
  return false;
}

function subscribeSystemReducedMotion(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  const onChange = () => listener();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }
  if (typeof media.addListener === "function") {
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }
  return () => undefined;
}

export function NSEAnimationEnvironmentProvider({
  reducedMotion: requestedReducedMotion,
  animator: requestedAnimator,
  layers: requestedLayers,
  frames: requestedFrames,
  children,
}: NSEAnimationEnvironmentProviderProps): ReactNode {
  const systemReducedMotion = useSyncExternalStore(
    subscribeSystemReducedMotion,
    getSystemReducedMotion,
    getServerReducedMotion,
  );
  const inherited = useContext(NSEAnimationEnvironmentContext);
  const environment = useMemo(
    () => Object.freeze({
      reducedMotion:
        inherited.reducedMotion ||
        (requestedReducedMotion ?? systemReducedMotion),
      animator: requestedAnimator === undefined ? inherited.animator : requestedAnimator,
      layers: requestedLayers === undefined ? inherited.layers : requestedLayers,
      frames: requestedFrames === undefined ? inherited.frames : requestedFrames,
    }),
    [inherited.reducedMotion, inherited.animator, inherited.layers, inherited.frames, requestedAnimator, requestedLayers, requestedFrames, requestedReducedMotion, systemReducedMotion],
  );
  return (
    <NSEAnimationEnvironmentContext.Provider value={environment}>
      {children}
    </NSEAnimationEnvironmentContext.Provider>
  );
}

export function useNSEAnimationEnvironment(): NSEAnimationEnvironment {
  return useContext(NSEAnimationEnvironmentContext);
}
