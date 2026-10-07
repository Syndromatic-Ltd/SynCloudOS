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

import { AFXLayer, type AFXFrameScheduler } from "../../FX/AnimationFX/AFXLayer";
import { AFXShapeLayer } from "../../FX/AnimationFX/AFXShapeLayer";
import { AFXGradientLayer } from "../../FX/AnimationFX/AFXGradientLayer";
import { AFXTextLayer } from "../../FX/AnimationFX/AFXTextLayer";
import { AFXReplicatorLayer } from "../../FX/AnimationFX/AFXReplicatorLayer";
import { AFXEmitterLayer } from "../../FX/AnimationFX/AFXEmitterLayer";
import { AFXTiledLayer } from "../../FX/AnimationFX/AFXTiledLayer";
import type { AnimationLayerHost, AnimationLayerKinds } from "../HostServices/PlatformAdapterRuntimePorts";
import { BrowserAnimationLayerSurface } from "./BrowserAnimationAdapter";
import { BrowserAFXCanvasRenderer } from "./BrowserAFXCanvasRenderer";
import { AFXRenderer } from "../../FX/AnimationFX/AFXRenderer";
import { registerRenderedCanvasCapture } from "../HostServices/PlatformAdapterRuntimeServices";

const boundElements = new WeakSet<object>();
export function createBrowserAnimationLayerHost(document: Document, scheduler: AFXFrameScheduler): AnimationLayerHost {
  return Object.freeze({
    createRenderer(target: object, options: Parameters<AnimationLayerHost["createRenderer"]>[1], signal: AbortSignal,
      residency?: Parameters<AnimationLayerHost["createRenderer"]>[3]): AFXRenderer {
      signal.throwIfAborted();
      const CanvasClass = document.defaultView?.HTMLCanvasElement;
      if (!CanvasClass || !(target instanceof CanvasClass) || target.ownerDocument !== document)
        throw new TypeError("Layer renderer target must be a canvas from the owning browser document.");
      if (boundElements.has(target)) throw new DOMException("Canvas already has a live layer binding.", "InvalidStateError");
      boundElements.add(target);
      let renderer: BrowserAFXCanvasRenderer | null = null;
      try {
        renderer = new BrowserAFXCanvasRenderer(target);
        const layerRenderer = new AFXRenderer({
          target: renderer, scheduler, width: target.width, height: target.height,
          ...options, signal,
        });
        const dispose = layerRenderer.dispose.bind(layerRenderer);
        const canvasRenderer = renderer;
        const releaseCapture = registerRenderedCanvasCapture(target, () => {
          if (!canvasRenderer.available) return false;
          layerRenderer.render();
          return canvasRenderer.available;
        });
        signal.addEventListener("abort", releaseCapture, { once: true });
        Object.defineProperty(layerRenderer, "dispose", { configurable: true, value: () => {
          try { dispose(); } finally {
            signal.removeEventListener("abort", releaseCapture);
            releaseCapture(); boundElements.delete(target);
          }
        } });
        try {
          residency?.({ measure: () => canvasRenderer.measureResidency(), releaseIdle: (bytes) => canvasRenderer.releaseIdle(bytes) });
        } catch (error) { layerRenderer.dispose(); throw error; }
        return layerRenderer;
      } catch (error) {
        renderer?.dispose();
        boundElements.delete(target);
        throw error;
      }
    },
    bind<K extends keyof AnimationLayerKinds>(kind: K, target: object, signal: AbortSignal): AnimationLayerKinds[K] {
      signal.throwIfAborted();
      const HTMLElementClass = document.defaultView?.HTMLElement;
      if (!HTMLElementClass || !(target instanceof HTMLElementClass) || target.ownerDocument !== document) throw new TypeError("Layer target must be an element from the owning browser document.");
      if (boundElements.has(target)) throw new DOMException("Element already has a live layer binding.", "InvalidStateError");
      const constructors = { layer: AFXLayer, shape: AFXShapeLayer, gradient: AFXGradientLayer, text: AFXTextLayer, replicator: AFXReplicatorLayer, emitter: AFXEmitterLayer, tiled: AFXTiledLayer };
      if (!Object.hasOwn(constructors, kind)) throw new TypeError("Unknown layer kind.");
      const surface = new BrowserAnimationLayerSurface(target);
      boundElements.add(target);
      let layer: AFXLayer | undefined;
      try {
        layer = new constructors[kind](surface, scheduler, { signal });
        signal.throwIfAborted();
      }
      catch (error) {
        try { if (layer) layer.dispose(); else surface.dispose(); }
        finally { boundElements.delete(target); }
        throw error;
      }
      const dispose = layer.dispose.bind(layer);
      let disposed = false;
      const release = () => {
        if (disposed) return;
        disposed = true;
        signal.removeEventListener("abort", release);
        try { dispose(); }
        finally { boundElements.delete(target); }
      };
      signal.addEventListener("abort", release, { once: true });
      Object.defineProperty(layer, "dispose", { configurable: true, value: release });
      return layer as AnimationLayerKinds[K];
    },
  });
}
