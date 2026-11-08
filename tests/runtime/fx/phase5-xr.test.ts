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

import { expect, it, vi } from "vitest";
import { BrowserXRAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserXRAdapter";
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";
import { XRFXAnchor, XRFXRaycastQuery } from "../../../src/FX/XRFX/public";
const configuration = { kind: "world", worldAlignment: "gravity", isLightEstimationEnabled: false, options: 0 } as const;
const ticks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  let callback: ((time: number, frame: any) => void) | undefined;
  const hitSource = { cancel: vi.fn() };
  const native = Object.assign(new EventTarget(), {
    requestReferenceSpace: vi.fn(async () => ({})), requestAnimationFrame: vi.fn((next: typeof callback) => { callback = next; return 1; }),
    cancelAnimationFrame: vi.fn(), end: vi.fn(async () => {}), updateRenderState: vi.fn(), requestHitTestSource: vi.fn(async () => hitSource), visibilityState: "visible",
  });
  const xr = { isSessionSupported: vi.fn(async () => true), requestSession: vi.fn(async () => native) };
  const layer = { layer: {}, dispose: vi.fn() }, createRenderingLayer = vi.fn(async () => layer);
  const adapter = new BrowserXRAdapter({ isSecureContext: true, browserNavigator: { xr }, createRenderingLayer, createRay: (origin, direction) => ({ origin, direction }), createTransform: matrix => ({ matrix }) });
  const frame = vi.fn(), failed = vi.fn(), interrupted = vi.fn(), interruptionEnded = vi.fn(), owner = new AbortController();
  const tracked = new Set<any>(), anchor = { anchorSpace: {}, delete: vi.fn() }, createAnchor = vi.fn(async () => anchor);
  const transform = [0,1,0,0,-1,0,0,0,0,0,1,0,10,20,30,1], projection = [2,0,0,0,0,3,0,0,0,0,-1,-1,0,0,-2,0];
  const emit = () => {
    let active = true; const check = () => { if (!active) throw new Error("Native frame expired"); };
    callback?.(1200, { getViewerPose() { check(); return { transform: { matrix: transform }, views: [{ projectionMatrix: projection }] }; }, trackedAnchors: tracked,
      getPose() { check(); return { transform: { matrix: transform } }; }, createAnchor,
      getHitTestResults() { check(); return [{ getPose() { check(); return { transform: { matrix: transform } }; } }]; } });
    active = false;
  };
  return { adapter, xr, native, layer, createRenderingLayer, hitSource, owner, frame, failed, interrupted, interruptionEnded, tracked, anchor, createAnchor, transform, projection, emit,
    start: () => adapter.start(configuration, owner.signal, { frame, failed, interrupted, interruptionEnded, ended() {} }) };
}
it("maps AR configurations internally and independently converts translation, rotation and projection", async () => {
  const f = fixture(); expect(f.xr.requestSession).not.toHaveBeenCalled(); const run = await f.start(); f.emit();
  expect(f.xr.requestSession).toHaveBeenCalledWith("immersive-ar", expect.any(Object)); expect(f.native.requestReferenceSpace).toHaveBeenCalledWith("local");
  const frame = f.frame.mock.calls[0]![0]; expect(frame.timestamp).toBe(1.2); expect(frame.camera.transform).toBeInstanceOf(AFXTransform3D);
  expect(frame.camera.transform.transformPoint({ x: 2, y: 3, z: 4 })).toEqual({ x: 7, y: 22, z: 34 });
  expect(frame.camera.projectionMatrix.transformPoint({ x: 2, y: 4, z: -2 })).toEqual({ x: 2, y: 6, z: 0 }); expect(frame.camera.trackingState).toBe("notAvailable");
  f.transform[12] = 999; f.projection[0] = 999; expect(frame.camera.transform.values[12]).toBe(10); expect(frame.camera.projectionMatrix.values[0]).toBe(2); expect(Object.isFrozen(frame)).toBe(true);
  await run.pause(); expect(f.native.end).toHaveBeenCalledOnce(); expect(f.layer.dispose).toHaveBeenCalledOnce(); f.emit(); expect(f.frame).toHaveBeenCalledOnce();
});
it("creates and removes actual native anchors and snapshots raycast hits before frame expiry", async () => {
  const f = fixture(), run = await f.start(), anchor = new XRFXAnchor(AFXTransform3D.translation(1,2,3)); const added = run.add(anchor); f.emit(); await added;
  f.tracked.add(f.anchor); f.emit(); expect(f.frame.mock.calls.at(-1)![0].anchors[0].identifier.isEqual(anchor.identifier)).toBe(true);
  const pending = run.raycast(new XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"estimatedPlane","any")); await ticks(); f.emit(); const results = await pending;
  expect(results[0]!.worldTransform.transformPoint({x:1,y:2,z:3})).toEqual({x:8,y:21,z:33}); expect(results[0]!.targetAlignment).toBe("any"); expect(results[0]!.anchor).toBeNull(); expect(f.hitSource.cancel).toHaveBeenCalledOnce();
  await run.remove(anchor); expect(f.anchor.delete).toHaveBeenCalledOnce(); await run.pause();
});
it.each(["reference", "render", "update"])("ends the native session after %s setup failure", async boundary => {
  const f = fixture(), error = new DOMException("Unavailable", "NotSupportedError");
  if (boundary === "reference") f.native.requestReferenceSpace.mockRejectedValueOnce(error); if (boundary === "render") f.createRenderingLayer.mockRejectedValueOnce(error); if (boundary === "update") f.native.updateRenderState.mockImplementationOnce(() => { throw error; });
  await expect(f.start()).rejects.toBe(error); expect(f.native.end).toHaveBeenCalledOnce(); if (boundary !== "render") expect(f.layer.dispose).toHaveBeenCalledOnce();
});
it("releases a late native session without ending its replacement", async () => {
  const f = fixture(); let release!: (value: typeof f.native) => void; f.xr.requestSession.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.start().catch(error => error); f.owner.abort(); const replacement = Object.assign(new EventTarget(), { ...f.native, end: vi.fn(async () => {}) }); f.xr.requestSession.mockResolvedValueOnce(replacement); const owner = new AbortController();
  const run = await f.adapter.start(configuration, owner.signal, { frame: vi.fn(), failed: vi.fn(), interrupted() {}, interruptionEnded() {}, ended() {} }); release(f.native); await pending; await ticks(); expect(f.native.end).toHaveBeenCalledOnce(); expect(replacement.end).not.toHaveBeenCalled(); await run.pause();
});
it("releases a late rendering layer and hit source and deletes a late-created anchor", async () => {
  const f = fixture(); let layer!: (value: typeof f.layer) => void; f.createRenderingLayer.mockImplementationOnce(() => new Promise(resolve => { layer = resolve; })); const pending = f.start().catch(error => error); await ticks(); f.owner.abort(); layer(f.layer); await pending; await ticks(); expect(f.layer.dispose).toHaveBeenCalledOnce(); expect(f.native.end).toHaveBeenCalledOnce();
  const a = fixture(), run = await a.start(); let finish!: (value: typeof a.anchor) => void; a.createAnchor.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const adding = run.add(new XRFXAnchor(new AFXTransform3D())).catch(error => error); a.emit(); a.owner.abort(); finish(a.anchor); await adding; await ticks(); expect(a.anchor.delete).toHaveBeenCalledOnce();
  const h = fixture(), hitRun = await h.start(); let hit!: (value: typeof h.hitSource) => void; h.native.requestHitTestSource.mockImplementationOnce(() => new Promise(resolve => { hit = resolve; })); const hitting = hitRun.raycast(new XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"estimatedPlane","any")).catch(error => error); h.owner.abort(); hit(h.hitSource); await hitting; await ticks(); expect(h.hitSource.cancel).toHaveBeenCalledOnce();
});
it("reports visibility interruptions and does not invent planes, quality or unsupported options", async () => {
  const f = fixture(), run = await f.start(); f.native.visibilityState = "hidden"; f.native.dispatchEvent(new Event("visibilitychange")); expect(f.interrupted).toHaveBeenCalledOnce(); f.native.visibilityState = "visible"; f.native.dispatchEvent(new Event("visibilitychange")); expect(f.interruptionEnded).toHaveBeenCalledOnce();
  await expect(run.raycast(new XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"existingPlaneGeometry","horizontal"))).rejects.toMatchObject({code:"unsupportedConfiguration"}); await run.pause();
  for (const update of [{isLightEstimationEnabled:true},{worldAlignment:"gravityAndHeading"},{options:8}]) await expect(f.adapter.start({...configuration,...update} as any,new AbortController().signal,{frame(){},failed(){},interrupted(){},interruptionEnded(){},ended(){}})).rejects.toMatchObject({code:"unsupportedConfiguration"});
  expect(await new BrowserXRAdapter({isSecureContext:false}).isSupported("world")).toBe(false);
});

it("invalidates an in-flight anchor addition before removal and does not remove its replacement", async () => {
  const f = fixture(), run = await f.start(), anchor = new XRFXAnchor(new AFXTransform3D()); let resolve!: (value: typeof f.anchor) => void;
  f.createAnchor.mockImplementationOnce(() => new Promise(done => { resolve = done; })); const old = run.add(anchor).catch(error => error); f.emit(); await run.remove(anchor);
  const replacement = { anchorSpace: {}, delete: vi.fn() }; f.createAnchor.mockResolvedValueOnce(replacement); const next = run.add(anchor); f.emit(); await next;
  resolve(f.anchor); await old; await ticks(); expect(f.anchor.delete).toHaveBeenCalledOnce(); expect(replacement.delete).not.toHaveBeenCalled(); await run.remove(anchor); expect(replacement.delete).toHaveBeenCalledOnce(); await run.pause();
});
it("preserves raw hit-source cancellation denial before resolving a raycast", async () => {
  const f = fixture(), run = await f.start(); const denial = new DOMException("Refused cancellation", "SecurityError"); f.hitSource.cancel.mockImplementationOnce(() => { throw denial; });
  const pending = run.raycast(new XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"estimatedPlane","any")); await ticks(); f.emit(); await expect(pending).rejects.toBe(denial); await run.pause();
});

it("still ends native resources when hit cancellation refuses during pause", async () => {
  const f = fixture(), run = await f.start(); const denial = new DOMException("Refused cancellation", "SecurityError"); f.hitSource.cancel.mockImplementationOnce(() => { throw denial; });
  const pending = run.raycast(new XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"estimatedPlane","any")).catch(error => error); await ticks();
  await expect(run.pause()).rejects.toBe(denial); await pending; expect(f.native.end).toHaveBeenCalledOnce(); expect(f.layer.dispose).toHaveBeenCalledOnce();
});

it("releases a native session when abort falls after helper resolution but before assignment", async () => {
  const f = fixture(); let resolve!: (value: typeof f.native) => void; f.xr.requestSession.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = f.start().catch(error => error); resolve(f.native); queueMicrotask(() => f.owner.abort()); await pending; await ticks(); expect(f.native.end).toHaveBeenCalledOnce();
});
it("releases a layer when abort falls after helper resolution but before assignment", async () => {
  const f = fixture(); let resolve!: (value: typeof f.layer) => void; f.createRenderingLayer.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = f.start().catch(error => error); await ticks(); resolve(f.layer); queueMicrotask(() => f.owner.abort()); await pending; await ticks(); expect(f.layer.dispose).toHaveBeenCalledOnce(); expect(f.native.end).toHaveBeenCalledOnce();
});
it("reports spontaneous native end once, invalidates pending work and releases its rendering layer", async () => {
  const f = fixture(), ended = vi.fn(); const run = await f.adapter.start(configuration, f.owner.signal, { frame: f.frame, failed: f.failed, interrupted: f.interrupted, interruptionEnded: f.interruptionEnded, ended });
  const query = run.raycast(new XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"estimatedPlane","any")).catch(error => error); await ticks();
  f.native.dispatchEvent(new Event("end")); f.native.dispatchEvent(new Event("end")); await ticks(); expect(ended).toHaveBeenCalledOnce(); expect(await query).toMatchObject({name:"AbortError"}); expect(f.layer.dispose).toHaveBeenCalledOnce(); expect(f.native.end).not.toHaveBeenCalled(); f.emit(); expect(f.frame).not.toHaveBeenCalled();
});
it("releases a late startup layer when native end interrupts the startup handoff", async () => {
  const f = fixture(), ended = vi.fn(); let resolve!: (value: typeof f.layer) => void; f.createRenderingLayer.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = f.adapter.start(configuration,f.owner.signal,{frame:f.frame,failed:f.failed,interrupted:f.interrupted,interruptionEnded:f.interruptionEnded,ended}).catch(error=>error); await ticks(); f.native.dispatchEvent(new Event("end")); resolve(f.layer); await pending; await ticks(); expect(ended).toHaveBeenCalledOnce(); expect(f.layer.dispose).toHaveBeenCalledOnce(); expect(f.native.end).not.toHaveBeenCalled();
});

it.each([false, true])("records natural-end cancellation refusal before authority retires and isolates replacement %s", async replace => {
  const { createMountedXRPort } = await import("../../../src/SynCloudOS/AppSDK/mountedXRPort");
  const { createPrivacyStore } = await import("../../../src/SynCloudOS/Privacy");
  const f = fixture(), store = createPrivacyStore({ runtimeId: "native-end-refusal" });
  const scope = { userId: "u", appId: "com.example.native-end-refusal", service: "xr" }, mount = new AbortController();
  const privacy = store.forApplication({ ...scope, signal: mount.signal });
  const port = createMountedXRPort(f.adapter, mount.signal, () => ["xr.session"], () => true, privacy, listener => store.subscribe(listener));
  const callbacks = { frame() {}, failed() {}, interrupted() {}, interruptionEnded() {}, ended() {} };
  try {
    const run = await port.start(configuration, new AbortController().signal, callbacks); store.setAuthorization(scope, "granted");
    const pending = run.raycast(new XRFXRaycastQuery({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any")).catch(error => error); await ticks();
    f.hitSource.cancel.mockImplementationOnce(() => { throw new DOMException("Native cancellation refused", "SecurityError"); });
    f.native.dispatchEvent(new Event("end"));
    expect(store.getSnapshot()[0]).toMatchObject({ browserStatus: "denied", authorizationStatus: "denied" });
    expect(f.layer.dispose).toHaveBeenCalledOnce(); expect(f.native.end).not.toHaveBeenCalled();
    if (replace) {
      // A fresh native grant and app consent precede replacement before old cleanup microtasks drain.
      privacy.observe("granted"); store.setAuthorization(scope, "granted");
      const native = Object.assign(new EventTarget(), { ...f.native, end: vi.fn(async () => {}) }); const layer = { layer: {}, dispose: vi.fn() };
      f.xr.requestSession.mockResolvedValueOnce(native); f.createRenderingLayer.mockResolvedValueOnce(layer);
      const replacement = await port.start(configuration, new AbortController().signal, callbacks); await pending; await ticks();
      expect(store.getSnapshot()[0]!.authorizationStatus).toBe("granted"); expect(native.end).not.toHaveBeenCalled(); expect(layer.dispose).not.toHaveBeenCalled(); await replacement.pause();
    } else await pending;
  } finally { mount.abort(); store.dispose(); }
});
