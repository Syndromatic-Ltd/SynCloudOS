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

import type { XRFXAuthorizationStatus, XRFXCapabilities, XRFXClient, XRFXConfiguration, XRFXFrame, XRFXSession } from "../../FX/XRFX/public";
import { browserDeviceOperation, browserDeviceOwner } from "./BrowserDeviceOperation";

interface TransformPort { readonly matrix: ArrayLike<number> }
interface AnchorPort { readonly anchorSpace: unknown }
interface FramePort {
  getViewerPose(space: unknown): { readonly transform: TransformPort } | null;
  readonly trackedAnchors?: ReadonlySet<AnchorPort>;
  getPose?(space: unknown, reference: unknown): { readonly transform: TransformPort } | null;
}
export interface BrowserXRSession extends EventTarget {
  requestReferenceSpace(type: string): Promise<unknown>;
  requestAnimationFrame(callback: (time: number, frame: FramePort) => void): number;
  cancelAnimationFrame(handle: number): void;
  end(): Promise<void>;
  updateRenderState(state: { baseLayer: unknown }): void;
}
interface XRPort {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, options: { readonly requiredFeatures: readonly string[]; readonly optionalFeatures: readonly string[] }): Promise<BrowserXRSession>;
}
export interface BrowserXRRenderingLayer { readonly layer: unknown; dispose(): void }
export interface BrowserXROptions {
  readonly isSecureContext: boolean;
  readonly browserNavigator?: { readonly xr?: XRPort } | null;
  readonly createRenderingLayer?: (session: BrowserXRSession, configuration: XRFXConfiguration) => Promise<BrowserXRRenderingLayer>;
}

/** A detached, owner-scoped WebGL layer enables real WebXR frame delivery. */
export function createBrowserXRRenderingLayerFactory(browserWindow: Window & {
  readonly XRWebGLLayer?: new(session: BrowserXRSession, context: WebGLRenderingContext | WebGL2RenderingContext) => unknown;
}): BrowserXROptions["createRenderingLayer"] {
  const Layer = browserWindow.XRWebGLLayer;
  if (!Layer) return undefined;
  return async (session, configuration) => {
    const canvas = browserWindow.document.createElement("canvas");
    const context = canvas.getContext("webgl2", { alpha: true }) ?? canvas.getContext("webgl", { alpha: true });
    if (!context) throw new DOMException("A WebXR compatible WebGL context is unavailable.", "NotSupportedError");
    const dispose = () => { context.getExtension("WEBGL_lose_context")?.loseContext(); canvas.width = canvas.height = 1; };
    try {
      const xrContext = context as typeof context & { makeXRCompatible?: () => Promise<void> };
      if (configuration.mode !== "inline") {
        if (!xrContext.makeXRCompatible) throw new DOMException("WebGL cannot become XR compatible.", "NotSupportedError");
        await xrContext.makeXRCompatible();
      }
      return { layer: new Layer(session, context), dispose };
    } catch (error) { dispose(); throw error; }
  };
}

/** Pose delivery only: no renderer, fabricated anchors or ARKit tracking claims. */
export class BrowserXRAdapter implements XRFXClient {
  constructor(private readonly options: BrowserXROptions) {}
  getCapabilities(): XRFXCapabilities { return Object.freeze({ apiAvailable: this.options.isSecureContext && typeof this.options.browserNavigator?.xr?.requestSession === "function", worldTracking: false, nativeARKit: false }); }
  createSession(parent?: AbortSignal): XRFXSession {
    const owner = browserDeviceOwner(parent), signal = owner.signal;
    const createRenderingLayer = this.options.createRenderingLayer;
    let native: BrowserXRSession | undefined, frameHandle: number | undefined, generation = 0, starting = false;
    let renderingLayer: BrowserXRRenderingLayer | undefined;
    let authorization: XRFXAuthorizationStatus = "unknown";
    const anchors = new WeakMap<object, string>(); let nextAnchor = 0;
    const port = () => { signal.throwIfAborted(); if (!this.getCapabilities().apiAvailable) throw new DOMException("WebXR is unavailable.", "NotSupportedError"); return this.options.browserNavigator!.xr!; };
    const releaseLayer = () => { const previous = renderingLayer; renderingLayer = undefined; previous?.dispose(); };
    const ended = () => { generation++; native = undefined; frameHandle = undefined; authorization = "unknown"; releaseLayer(); };
    const stop = (): Promise<void> => {
      const previous = native;
      const previousLayer = renderingLayer;
      renderingLayer = undefined;
      generation++; native = undefined;
      if (!previous) return Promise.resolve();
      previous.removeEventListener("end", ended);
      if (frameHandle !== undefined) previous.cancelAnimationFrame(frameHandle);
      frameHandle = undefined; authorization = "unknown";
      return previous.end().finally(() => previousLayer?.dispose());
    };
    signal.addEventListener("abort", () => { void stop().catch(() => {}); }, { once: true });
    return Object.freeze<XRFXSession>({
      getCapabilities: () => signal.aborted ? Object.freeze({ ...this.getCapabilities(), apiAvailable: false }) : this.getCapabilities(),
      getAuthorizationStatus: async () => signal.aborted || !this.getCapabilities().apiAvailable ? "unavailable" : authorization,
      isSupported: async configuration => {
        if (signal.aborted || !this.getCapabilities().apiAvailable) return false;
        return browserDeviceOperation(signal, () => port().isSessionSupported(configuration.mode));
      },
      async run(configuration, listener) {
        signal.throwIfAborted();
        if (native || starting) throw new DOMException("The XR session is already running.", "InvalidStateError");
        starting = true;
        const runGeneration = ++generation;
        try {
          const session = await browserDeviceOperation(signal, () => port().requestSession(configuration.mode, {
            requiredFeatures: configuration.requiredFeatures, optionalFeatures: configuration.optionalFeatures,
          }), session => { void session.end().catch(() => {}); });
          if (generation !== runGeneration) { await session.end(); throw new DOMException("The XR request was cancelled.", "AbortError"); }
          native = session;
          session.addEventListener("end", ended, { once: true });
          if (!createRenderingLayer) throw new DOMException("A WebXR rendering layer is unavailable.", "NotSupportedError");
          renderingLayer = await browserDeviceOperation(signal, () => createRenderingLayer(session, configuration), layer => layer.dispose());
          if (generation !== runGeneration || signal.aborted) { releaseLayer(); throw new DOMException("The XR session ended.", "AbortError"); }
          session.updateRenderState({ baseLayer: renderingLayer.layer });
          const space = await browserDeviceOperation(signal, () => session.requestReferenceSpace(configuration.referenceSpace));
          if (generation !== runGeneration || signal.aborted) throw new DOMException("The XR session ended.", "AbortError");
          authorization = "granted";
          const frame = (time: number, value: FramePort) => {
            if (signal.aborted || native !== session || generation !== runGeneration) return;
            const pose = value.getViewerPose(space);
            const anchorValues = [...(value.trackedAnchors ?? [])].map(anchor => {
              let identifier = anchors.get(anchor);
              if (!identifier) { identifier = `anchor-${++nextAnchor}`; anchors.set(anchor, identifier); }
              const pose = value.getPose?.(anchor.anchorSpace, space);
              return Object.freeze({ identifier, transform: pose ? Object.freeze(Array.from(pose.transform.matrix)) : null });
            });
            const snapshot: XRFXFrame = Object.freeze({ timestamp: time / 1000, viewerTransform: pose ? Object.freeze(Array.from(pose.transform.matrix)) : null, anchors: Object.freeze(anchorValues) });
            try { listener(snapshot); } finally {
              if (!signal.aborted && native === session && generation === runGeneration) frameHandle = session.requestAnimationFrame(frame);
            }
          };
          frameHandle = session.requestAnimationFrame(frame);
        } catch (error) {
          await stop().catch(() => {});
          if (error instanceof DOMException && error.name === "NotAllowedError") authorization = "denied";
          throw error;
        } finally { starting = false; }
      },
      pause: stop,
      dispose: owner.dispose,
    });
  }
}
