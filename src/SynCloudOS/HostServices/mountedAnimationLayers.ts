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

import type { AnimationLayerHost, AnimationLayerKinds } from "./AppSDKHostServiceTypes";
import { createMountedResourceScope, type MountedResourceAccounting } from "./mountedResourceScope";
import type { AFXRendererOptions } from "../../FX/AnimationFX/AFXRenderer";
export function createMountedAnimationLayers(host: AnimationLayerHost | undefined, owner: AbortSignal, assertLive: () => void,
  accounting?: MountedResourceAccounting) {
  let rendererSerial = 0;
  const scope = createMountedResourceScope(owner, 64);
  const bind = <K extends keyof AnimationLayerKinds>(kind: K, target: object, signal?: AbortSignal): AnimationLayerKinds[K] => {
    assertLive();
    if (!host) throw new DOMException("Animation layer rendering is unavailable.", "NotSupportedError");
    return scope.acquire(signal, (lease, release) => {
      const layer = host.bind(kind, target, lease);
      const dispose = layer.dispose.bind(layer);
      Object.defineProperty(layer, "dispose", { configurable: true, value: () => { try { dispose(); } finally { release(); } } });
      return layer;
    }, (layer) => layer.dispose());
  };
  return Object.freeze({
    createRenderer: (target: object, options: Pick<AFXRendererOptions, "maximumQuads" | "onRenderError"> = {}, signal?: AbortSignal) => {
      assertLive();
      if (!host) throw new DOMException("Animation layer rendering is unavailable.", "NotSupportedError");
      return scope.acquire(signal, (lease, release) => {
        // Renderer textures, pool and stage are app-owned GPU residency for
        // exactly the renderer's lifetime; only pooled storage is reclaimable.
        let unregister: (() => void) | null = null;
        const id = `afx-renderer:${accounting?.owner ?? "app"}:${++rendererSerial}`;
        let renderer;
        try {
          renderer = host.createRenderer(target, options, lease, accounting ? (report) => {
            unregister = accounting.register({
              id, kind: "gpu", owner: accounting.owner,
              measure: () => report.measure(),
              reclaim: (request) => request.level === "idle" ? report.releaseIdle(request.targetBytes) : 0,
            });
          } : undefined);
        } catch (error) {
          (unregister as (() => void) | null)?.();
          throw error;
        }
        const dispose = renderer.dispose.bind(renderer);
        Object.defineProperty(renderer, "dispose", { configurable: true, value: () => {
          try { dispose(); } finally {
            const release_ = unregister; unregister = null;
            try { release_?.(); } finally { release(); }
          }
        } });
        return renderer;
      }, (renderer) => renderer.dispose());
    },
    bindLayer: (target: object, signal?: AbortSignal) => bind("layer", target, signal),
    bindShapeLayer: (target: object, signal?: AbortSignal) => bind("shape", target, signal),
    bindGradientLayer: (target: object, signal?: AbortSignal) => bind("gradient", target, signal),
    bindTextLayer: (target: object, signal?: AbortSignal) => bind("text", target, signal),
    bindReplicatorLayer: (target: object, signal?: AbortSignal) => bind("replicator", target, signal),
    bindEmitterLayer: (target: object, signal?: AbortSignal) => bind("emitter", target, signal),
    bindTiledLayer: (target: object, signal?: AbortSignal) => bind("tiled", target, signal),
  });
}
