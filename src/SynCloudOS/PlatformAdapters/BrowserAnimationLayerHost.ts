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
import { createAFXLayer } from "../../FX/AnimationFX/host";
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
        const { layout, ...rendererOptions } = options;
        renderer = new BrowserAFXCanvasRenderer(target, { layout });
        const layerRenderer = new AFXRenderer({
          target: renderer, scheduler, width: target.width, height: target.height,
          ...rendererOptions, signal,
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
    bind<K extends keyof AnimationLayerKinds>(kind: K, target: object, signal: AbortSignal,
      options?: Parameters<AnimationLayerHost["bind"]>[3]): AnimationLayerKinds[K] {
      signal.throwIfAborted();
      const HTMLElementClass = document.defaultView?.HTMLElement;
      if (!HTMLElementClass || !(target instanceof HTMLElementClass) || target.ownerDocument !== document) throw new TypeError("Layer target must be an element from the owning browser document.");
      if (boundElements.has(target)) throw new DOMException("Element already has a live layer binding.", "InvalidStateError");
      const constructors = { layer: AFXLayer, shape: AFXShapeLayer, gradient: AFXGradientLayer, text: AFXTextLayer, replicator: AFXReplicatorLayer, emitter: AFXEmitterLayer, tiled: AFXTiledLayer };
      if (!Object.hasOwn(constructors, kind)) throw new TypeError("Unknown layer kind.");
      // Read the view's authored style before the surface starts writing layer state.
      const authored = options?.layout === "css" ? readAuthoredLayerStyle(target) : null;
      const surface = new BrowserAnimationLayerSurface(target, options?.layout);
      boundElements.add(target);
      let layer: AFXLayer | undefined;
      let resizeObserver: { observe(target: Element): void; disconnect(): void } | undefined;
      let disposed = false;
      try {
        layer = createAFXLayer(constructors[kind], surface, scheduler, { signal });
        if (options?.layout === "css") {
          const backingLayer = layer;
          // A view gaining a backing layer keeps its geometry and clipping, as a
          // layer-backed NSView does: the authored transform-origin becomes the
          // anchor point and clipping overflow becomes clipsToBounds. The
          // surface writes both back as layer state from here on.
          if (authored?.anchorPoint) backingLayer.anchorPoint = authored.anchorPoint;
          if (authored?.clipsToBounds) backingLayer.clipsToBounds = true;
          const measure = () => {
            if (disposed || signal.aborted) return;
            const width = target.offsetWidth;
            const height = target.offsetHeight;
            if (backingLayer.bounds.width !== width || backingLayer.bounds.height !== height)
              backingLayer.frame = { x: 0, y: 0, width, height };
          };
          measure();
          const Observer = document.defaultView?.ResizeObserver;
          if (Observer) {
            resizeObserver = new Observer(measure);
            resizeObserver.observe(target);
          }
        }
        signal.throwIfAborted();
      }
      catch (error) {
        resizeObserver?.disconnect();
        try { if (layer) layer.dispose(); else surface.dispose(); }
        finally { boundElements.delete(target); }
        throw error;
      }
      const dispose = layer.dispose.bind(layer);
      const release = () => {
        if (disposed) return;
        disposed = true;
        resizeObserver?.disconnect();
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

/** The anchor point and clipping a view's stylesheet gives it, for its backing layer. */
function readAuthoredLayerStyle(element: HTMLElement): { anchorPoint?: { x: number; y: number }; clipsToBounds: boolean } {
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!computed) return { clipsToBounds: false };
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  // Browsers resolve the origin to pixels; percentages are accepted as well.
  const [x, y] = computed.transformOrigin.split(" ").map((part, axis) =>
    part.endsWith("%") ? Number.parseFloat(part) / 100 : Number.parseFloat(part) / (axis === 0 ? width : height));
  const clips = [computed.overflowX, computed.overflowY, computed.overflow].some(value => value === "hidden" || value === "clip");
  // Origins outside the box have no anchor-point equivalent; those keep the centre.
  const inside = width > 0 && height > 0 && Number.isFinite(x) && Number.isFinite(y) && x! >= 0 && x! <= 1 && y! >= 0 && y! <= 1;
  return { ...(inside ? { anchorPoint: { x: x!, y: y! } } : {}), clipsToBounds: clips };
}
