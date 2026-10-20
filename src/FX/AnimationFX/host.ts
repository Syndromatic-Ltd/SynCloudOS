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

/** Host adapter types for custom AnimationFX surfaces. Mounted apps use /fx/animation. */
import { AFXLayer, type AFXFrameScheduler, type AFXLayerSurface } from "./AFXLayer";
import { afxAdoptLayerPorts } from "./layerAdoption";

export type { AFXFrameScheduler, AFXLayerPorts, AFXLayerSurface } from "./AFXLayer";
export type { AFXRendererScene, AFXRendererQuad, AFXRendererTarget, AFXRendererOptions } from "./AFXRenderer";

/**
 * Builds the root layer of a host's surface tree. Application code constructs
 * layers with `new AFXLayer()` and adds them to a parent; the host owns the
 * surface, so it is the only caller that supplies one. Layers added below the
 * root take their surface from `surface.createSublayerSurface()`.
 *
 * Pass a layer class first to build a subclass (`AFXShapeLayer`, ...). A layer
 * that cannot attach is disposed together with `surface`.
 */
export function createAFXLayer(
  surface: AFXLayerSurface,
  scheduler: AFXFrameScheduler,
  options?: Readonly<{ signal?: AbortSignal }>,
): AFXLayer;
export function createAFXLayer<Layer extends AFXLayer>(
  LayerClass: new () => Layer,
  surface: AFXLayerSurface,
  scheduler: AFXFrameScheduler,
  options?: Readonly<{ signal?: AbortSignal }>,
): Layer;
export function createAFXLayer(
  first: AFXLayerSurface | (new () => AFXLayer),
  second: AFXFrameScheduler | AFXLayerSurface,
  third?: AFXFrameScheduler | Readonly<{ signal?: AbortSignal }>,
  fourth?: Readonly<{ signal?: AbortSignal }>,
): AFXLayer {
  const [LayerClass, surface, scheduler, options] =
    typeof first === "function"
      ? [first, second as AFXLayerSurface, third as AFXFrameScheduler, fourth]
      : [AFXLayer, first, second as AFXFrameScheduler, third as Readonly<{ signal?: AbortSignal }> | undefined];
  const layer = new LayerClass();
  try {
    layer[afxAdoptLayerPorts]({ surface, scheduler, ...(options?.signal ? { signal: options.signal } : {}) });
  } catch (error) {
    // Once attached, the layer owns the surface and releases it on disposal.
    try {
      if (!layer.isAttached) surface?.dispose?.();
      layer.dispose();
    } catch {
      /* Preserve the attach error. */
    }
    throw error;
  }
  return layer;
}
