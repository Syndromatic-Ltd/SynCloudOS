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

import { AFXTransform3D, type AFXPoint3D } from "../../FX/AnimationFX/AFXTransform3D";
import { NSEUUID } from "../../Foundation/NSEUUID";
import { XRFXError } from "../../FX/XRFX/XRFXError";
import type { XRFXAnchor } from "../../FX/XRFX/XRFXAnchor";
import type { XRFXRaycastResult } from "../../FX/XRFX/XRFXRaycastResult";
import type { XRAdapter, XRConfiguration, XRCallbacks, XRRun } from "../../FX/XRFX/internal/xrPort";
import { makeXRAnchor, makeXRCamera, makeXRFrame, makeXRRaycastResult } from "../../FX/XRFX/internal/xrObjects";
import { browserDeviceOperation, browserDeviceOwner } from "./BrowserDeviceOperation";
interface TransformPort { readonly matrix: ArrayLike<number> }
interface AnchorPort { readonly anchorSpace: unknown; delete(): void; }
interface HitSource { cancel(): void; }
interface FramePort {
  getViewerPose(space: unknown): { readonly transform: TransformPort; readonly views: readonly { readonly projectionMatrix: ArrayLike<number> }[] } | null;
  readonly trackedAnchors?: ReadonlySet<AnchorPort>;
  getPose?(space: unknown, reference: unknown): { readonly transform: TransformPort } | null;
  createAnchor?(transform: unknown, space: unknown): Promise<AnchorPort>;
  getHitTestResults?(source: HitSource): readonly { getPose(space: unknown): { readonly transform: TransformPort } | null }[];
}
export interface BrowserXRSession extends EventTarget {
  requestReferenceSpace(type: string): Promise<unknown>;
  requestAnimationFrame(callback: (time: number, frame: FramePort) => void): number;
  cancelAnimationFrame(handle: number): void;
  end(): Promise<void>;
  updateRenderState(state: { baseLayer: unknown }): void;
  requestHitTestSource?(options: { space: unknown; offsetRay: unknown; entityTypes: readonly string[] }): Promise<HitSource>;
  readonly visibilityState?: string;
}
interface XRPort {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, options: { readonly requiredFeatures: readonly string[]; readonly optionalFeatures: readonly string[] }): Promise<BrowserXRSession>;
}
export interface BrowserXRRenderingLayer { readonly layer: unknown; dispose(): void }
export interface BrowserXROptions {
  readonly isSecureContext: boolean;
  readonly browserNavigator?: { readonly xr?: XRPort } | null;
  readonly createRenderingLayer?: (session: BrowserXRSession, kind: XRConfiguration["kind"]) => Promise<BrowserXRRenderingLayer>;
  readonly createRay?: (origin: AFXPoint3D, direction: AFXPoint3D) => unknown;
  readonly createTransform?: (matrix: readonly number[]) => unknown;
}
/** A detached, owner-scoped WebGL layer enables real native frame delivery. */
export function createBrowserXRRenderingLayerFactory(browserWindow: Window & {
  readonly XRWebGLLayer?: new(session: BrowserXRSession, context: WebGLRenderingContext | WebGL2RenderingContext) => unknown;
}): BrowserXROptions["createRenderingLayer"] {
  const Layer = browserWindow.XRWebGLLayer;
  if (!Layer) return undefined;
  return async (session, kind) => {
    const canvas = browserWindow.document.createElement("canvas");
    const context = canvas.getContext("webgl2", { alpha: true }) ?? canvas.getContext("webgl", { alpha: true });
    if (!context) throw new DOMException("A compatible WebGL context is unavailable.", "NotSupportedError");
    const dispose = () => { context.getExtension("WEBGL_lose_context")?.loseContext(); canvas.width = canvas.height = 1; };
    try {
      const xrContext = context as typeof context & { makeXRCompatible?: () => Promise<void> };
      if (kind === "world") { if (!xrContext.makeXRCompatible) throw new DOMException("WebGL cannot become XR compatible.", "NotSupportedError"); await xrContext.makeXRCompatible(); }
      return { layer: new Layer(session, context), dispose };
    } catch (error) { dispose(); throw error; }
  };
}
/** Convert a rigid column-major transform to the native translation/quaternion representation. */
export function createBrowserXRTransformFactory(Transform?: new(position: AFXPoint3D, orientation: { x: number; y: number; z: number; w: number }) => unknown): BrowserXROptions["createTransform"] {
  if (!Transform) return undefined;
  return m => {
    const dot = (a: number, b: number) => m[a]! * m[b]! + m[a + 1]! * m[b + 1]! + m[a + 2]! * m[b + 2]!;
    if ([dot(0,0)-1,dot(4,4)-1,dot(8,8)-1,dot(0,4),dot(0,8),dot(4,8),m[3]!,m[7]!,m[11]!,m[15]!-1].some(v => Math.abs(v) > 1e-5)) throw new XRFXError("unsupportedConfiguration", "Native anchors require a rigid transform.");
    const determinant = m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
    if (Math.abs(determinant - 1) > 1e-5) throw new XRFXError("unsupportedConfiguration", "Native anchors cannot reflect coordinates.");
    let x: number, y: number, z: number, w: number; const trace = m[0]! + m[5]! + m[10]!;
    if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; w = s / 4; x = (m[6]! - m[9]!) / s; y = (m[8]! - m[2]!) / s; z = (m[1]! - m[4]!) / s; }
    else if (m[0]! > m[5]! && m[0]! > m[10]!) { const s = Math.sqrt(1 + m[0]! - m[5]! - m[10]!) * 2; w = (m[6]! - m[9]!) / s; x = s / 4; y = (m[4]! + m[1]!) / s; z = (m[8]! + m[2]!) / s; }
    else if (m[5]! > m[10]!) { const s = Math.sqrt(1 + m[5]! - m[0]! - m[10]!) * 2; w = (m[8]! - m[2]!) / s; x = (m[4]! + m[1]!) / s; y = s / 4; z = (m[9]! + m[6]!) / s; }
    else { const s = Math.sqrt(1 + m[10]! - m[0]! - m[5]!) * 2; w = (m[1]! - m[4]!) / s; x = (m[8]! + m[2]!) / s; y = (m[9]! + m[6]!) / s; z = s / 4; }
    return new Transform({ x: m[12]!, y: m[13]!, z: m[14]! }, { x, y, z, w });
  };
}
/** Native browser resources never leave this private transport. */
export class BrowserXRAdapter implements XRAdapter {
  constructor(private readonly options: BrowserXROptions) {}
  async isSupported(kind: XRConfiguration["kind"]): Promise<boolean> {
    if (!this.options.isSecureContext || !this.options.browserNavigator?.xr) return false;
    return this.options.browserNavigator.xr.isSessionSupported(kind === "world" ? "immersive-ar" : "inline");
  }
  async start(configuration: XRConfiguration, parent: AbortSignal, callbacks: XRCallbacks): Promise<XRRun> {
    const port = this.options.isSecureContext ? this.options.browserNavigator?.xr : undefined;
    if (!port || !this.options.createRenderingLayer) throw new XRFXError("sensorUnavailable", "Native XR or its rendering layer is unavailable.");
    if (configuration.worldAlignment === "gravityAndHeading" || configuration.isLightEstimationEnabled || (configuration.options & 8)) throw new XRFXError("unsupportedConfiguration", "Compass alignment, light estimation and scene reconstruction are unavailable.");
    const owner = browserDeviceOwner(parent), signal = owner.signal;
    let native: BrowserXRSession | undefined, layer: BrowserXRRenderingLayer | undefined, space: unknown, frameHandle: number | undefined, stopped = false, closing: Promise<void> | undefined;
    const nativeAnchors = new Map<string, AnchorPort>(), anchors = new WeakMap<AnchorPort, { identifier: NSEUUID; name: string | null }>();
    const additions = new Map<string, { anchor: XRFXAnchor; started?: boolean; resolve(): void; reject(error: unknown): void }>();
    const hits = new Map<HitSource, { resolve(value: readonly XRFXRaycastResult[]): void; reject(error: unknown): void }>();
    const aborted = () => new DOMException("The XR session ended.", "AbortError");
    const check = () => { signal.throwIfAborted(); if (stopped) throw aborted(); };
    const ended = () => { if (stopped) return; void stop(false).catch(() => {}); callbacks.ended(); };
    const visibility = () => { if (stopped || signal.aborted) return; if (native?.visibilityState === "visible") callbacks.interruptionEnded(); else callbacks.interrupted(); };
    const stop = (endNative: boolean): Promise<void> => {
      if (closing) return closing;
      stopped = true;
      let done!: () => void, fail!: (error: unknown) => void; closing = new Promise<void>((resolve,reject) => { done = resolve; fail = reject; });
      signal.removeEventListener("abort", abort);
      native?.removeEventListener("end", ended); native?.removeEventListener("visibilitychange", visibility);
      let cleanupError: unknown;
      const remember = (error: unknown) => { if (!cleanupError || (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name))) cleanupError = error; };
      try { if (frameHandle !== undefined) native?.cancelAnimationFrame(frameHandle); } catch (error) { remember(error); }
      for (const pending of additions.values()) pending.reject(aborted()); additions.clear();
      for (const [source,pending] of hits) { try { source.cancel(); } catch (error) { remember(error); } finally { pending.reject(aborted()); } } hits.clear();
      owner.dispose();
      const previousLayer = layer; layer = undefined;
      const finish = () => {
        try { previousLayer?.dispose(); } catch (error) { remember(error); }
        // Natural-end finalization is synchronous. Classify its refusal while
        // this run still owns authority; ended retires that authority next.
        if (cleanupError && !endNative) {
          try { callbacks.failed(cleanupError); } catch (error) { remember(error); }
        }
        if (cleanupError) fail(cleanupError); else done();
      };
      if (endNative) {
        void (async () => { try { await native?.end(); } catch (error) { remember(error); } finish(); })();
      } else finish();
      return closing;
    };
    const abort = () => { void stop(true).catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      check();
      const acquiredSession = await browserDeviceOperation(signal, () => port.requestSession(configuration.kind === "world" ? "immersive-ar" : "inline", { requiredFeatures: configuration.worldAlignment === "gravity" ? ["local"] : [], optionalFeatures: ["anchors", "hit-test"] }), value => { void value.end().catch(() => {}); });
      if (stopped || signal.aborted) { await acquiredSession.end().catch(() => {}); throw aborted(); }
      native = acquiredSession;
      check(); native.addEventListener("end", ended, { once: true }); native.addEventListener("visibilitychange", visibility);
      const acquiredLayer = await browserDeviceOperation(signal, () => this.options.createRenderingLayer!(native!, configuration.kind), value => value.dispose());
      if (stopped || signal.aborted) { acquiredLayer.dispose(); throw aborted(); }
      layer = acquiredLayer;
      check(); native.updateRenderState({ baseLayer: layer.layer });
      space = await browserDeviceOperation(signal, () => native!.requestReferenceSpace(configuration.worldAlignment === "camera" ? "viewer" : "local")); check();
      const frame = (time: number, value: FramePort) => {
        if (stopped || signal.aborted) return;
        try {
          for (const [identifier,pending] of [...additions]) {
            if (pending.started) continue;
            pending.started = true;
            if (!value.createAnchor || !this.options.createTransform) { additions.delete(identifier); pending.reject(new XRFXError("unsupportedConfiguration", "Native anchor creation is unavailable.")); continue; }
            let transform: unknown;
            try { transform = this.options.createTransform(pending.anchor.transform.values); } catch (error) { additions.delete(identifier); pending.reject(error); continue; }
            void browserDeviceOperation(signal, () => value.createAnchor!(transform, space), anchor => anchor.delete()).then(anchor => {
              if (stopped || signal.aborted || additions.get(identifier) !== pending) { anchor.delete(); pending.reject(aborted()); return; }
              additions.delete(identifier);
              nativeAnchors.set(identifier,anchor); anchors.set(anchor,{ identifier: pending.anchor.identifier, name: pending.anchor.name }); pending.resolve();
            }, error => { if (additions.get(identifier) === pending) additions.delete(identifier); pending.reject(error); });
          }
          for (const [source,pending] of [...hits]) {
            hits.delete(source);
            let cancelled = false;
            try {
              if (!value.getHitTestResults) throw new XRFXError("unsupportedConfiguration", "Native raycasting is unavailable.");
              const results = value.getHitTestResults(source).flatMap(hit => { const pose = hit.getPose(space); return pose ? [makeXRRaycastResult(new AFXTransform3D(Array.from(pose.transform.matrix)), "estimatedPlane", "any", null)] : []; });
              cancelled = true; source.cancel();
              pending.resolve(Object.freeze(results));
            } catch (error) {
              if (!cancelled) { try { source.cancel(); } catch (cancelError) { pending.reject(cancelError); continue; } }
              pending.reject(error);
            }
          }
          const pose = value.getViewerPose(space), projection = pose?.views[0]?.projectionMatrix;
          if (pose && projection) {
            const snapshots = [...(value.trackedAnchors ?? [])].flatMap(anchor => {
              const pose = value.getPose?.(anchor.anchorSpace,space); if (!pose) return [];
              let identity = anchors.get(anchor); if (!identity) { identity = { identifier: new NSEUUID(), name: null }; anchors.set(anchor,identity); }
              nativeAnchors.set(identity.identifier.uuidString, anchor);
              return [makeXRAnchor(identity.identifier,new AFXTransform3D(Array.from(pose.transform.matrix)),identity.name)];
            });
            callbacks.frame(makeXRFrame(time / 1000,makeXRCamera(new AFXTransform3D(Array.from(pose.transform.matrix)),new AFXTransform3D(Array.from(projection)),"notAvailable"),snapshots));
          }
        } catch (error) { callbacks.failed(error); }
        if (!stopped && !signal.aborted) frameHandle = native!.requestAnimationFrame(frame);
      };
      frameHandle = native.requestAnimationFrame(frame);
    } catch (error) { await stop(true).catch(() => {}); throw error; }
    return Object.freeze<XRRun>({
      add: anchor => {
        check(); const identifier = anchor.identifier.uuidString;
        if (nativeAnchors.has(identifier)) return Promise.resolve();
        if (additions.has(identifier)) return Promise.reject(new XRFXError("requestFailed", "Anchor creation is already pending."));
        return new Promise<void>((resolve,reject) => additions.set(identifier,{anchor,resolve,reject}));
      },
      async remove(anchor) {
        check(); const identifier = anchor.identifier.uuidString;
        const pending = additions.get(identifier); if (pending) { additions.delete(identifier); pending.reject(aborted()); }
        const previous = nativeAnchors.get(identifier); if (previous) { previous.delete(); nativeAnchors.delete(identifier); }
      },
      raycast: async query => {
        check();
        if (query.target !== "estimatedPlane" || query.targetAlignment !== "any" || !native?.requestHitTestSource || !this.options.createRay) throw new XRFXError("unsupportedConfiguration", "Only estimated surfaces with unspecified alignment are available.");
        const source = await browserDeviceOperation(signal, () => native!.requestHitTestSource!({ space, offsetRay: this.options.createRay!(query.origin,query.direction), entityTypes: ["plane"] }), value => value.cancel());
        try { check(); } catch (error) { source.cancel(); throw error; }
        return new Promise<readonly XRFXRaycastResult[]>((resolve,reject) => hits.set(source,{resolve,reject}));
      },
      pause: () => stop(true),
    });
  }
}
