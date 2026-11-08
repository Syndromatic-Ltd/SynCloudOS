import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as XR from "../../../src/FX/XRFX/public";
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";
import { bindFXFamily } from "../../../src/SynCloudOS/AppSDK/fx/bindFXFamily";
import { registerSCOSAppSession, scosSessionsForApp } from "../../../src/SynCloudOS/AppSDK/scos/scosSessionRegistry";
import type { SynWareContextValue } from "../../../src/SynCloudOS/AppSDK/appContextTypes";
import { createPrivacyStore } from "../../../src/SynCloudOS/Privacy";
import { dispatchQueueForSession } from "../../../src/FX/DispatchFX/internal/sessionBinding";
const cleanups: (() => void)[] = [], jobs: (() => void)[] = [];
const ticks = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const flush = () => { while (jobs.length) jobs.shift()!(); };
async function fixture() {
  expect(Reflect.get(XR, "XRFXSession")).toBeTypeOf("function");
  const { associateXRPort } = await import("../../../src/FX/XRFX/internal/xrPort");
  const { createMountedXRPort } = await import("../../../src/SynCloudOS/AppSDK/mountedXRPort");
  const { makeXRFrame, makeXRCamera, makeXRRaycastResult } = await import("../../../src/FX/XRFX/internal/xrObjects");
  const owner = new AbortController(), privacy = createPrivacyStore({ runtimeId: "xr" });
  const scope = { userId: "u", appId: "com.example.xr", service: "xr" }; let allowed = true, entitlements = ["xr.session"];
  const listeners = new Set<() => void>(); const callbacks: import("../../../src/FX/XRFX/internal/xrPort").XRCallbacks[] = [];
  const run = { add: vi.fn(async (_anchor: XR.XRFXAnchor) => {}), remove: vi.fn(async (_anchor: XR.XRFXAnchor) => {}), raycast: vi.fn(async (_query: XR.XRFXRaycastQuery) => [makeXRRaycastResult(AFXTransform3D.translation(1, 2, 3), "estimatedPlane", "any", null)]), pause: vi.fn(async () => {}) };
  const start = vi.fn(async (_config: unknown, _signal: AbortSignal, callback: import("../../../src/FX/XRFX/internal/xrPort").XRCallbacks) => { callbacks.push(callback); return run; });
  const supported = vi.fn(async () => true);
  const port = createMountedXRPort({ isSupported: supported, start }, owner.signal, () => entitlements, () => allowed, privacy.forApplication({ ...scope, signal: owner.signal }), listener => { listeners.add(listener); const release = privacy.subscribe(listener); return () => { listeners.delete(listener); release(); }; });
  const context = { appId: scope.appId, runtimeInfo: { id: "xr" }, signal: owner.signal } as SynWareContextValue; associateXRPort(context, port);
  const unregister = registerSCOSAppSession({ appId: scope.appId, displayName: "XR", version: "1", context });
  cleanups.push(() => { owner.abort(); unregister(); privacy.dispose(); });
  const App = bindFXFamily(XR, scope.appId); const session = new App.XRFXSession();
  const frame = vi.fn(), added = vi.fn(), updated = vi.fn(), removed = vi.fn(), failed = vi.fn(), interrupted = vi.fn(), resumed = vi.fn();
  session.delegate = { sessionDidUpdateFrame: frame, sessionDidAddAnchors: added, sessionDidUpdateAnchors: updated, sessionDidRemoveAnchors: removed, sessionDidFailWithError: failed, sessionWasInterrupted: interrupted, sessionInterruptionEnded: resumed };
  const configuration = new App.XRFXWorldTrackingConfiguration(); configuration.isLightEstimationEnabled = false;
  const emit = (anchors: readonly XR.XRFXAnchor[] = [], index = callbacks.length - 1) => { const value = makeXRFrame(1.25, makeXRCamera(AFXTransform3D.translation(3, 4, 5), new AFXTransform3D(), "notAvailable"), anchors); callbacks[index]?.frame(value); return value; };
  const begin = async () => { expect(session.run(configuration)).toBeUndefined(); await ticks(); };
  return { App, session, configuration, port, context, owner, privacy, scope, unregister, run, start, supported, callbacks, emit, begin, frame, added, updated, removed, failed, interrupted, resumed,
    access(value: boolean) { allowed = value; listeners.forEach(listener => listener()); }, entitlements(value: string[]) { entitlements = value; listeners.forEach(listener => listener()); } };
}
beforeEach(() => vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }));
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); flush(); vi.unstubAllGlobals(); });
it("runs the attributed configuration/frame/camera/anchor/raycast/delegate flow on Dispatch", async () => {
  const f = await fixture(); expect(f.privacy.getSnapshot()).toEqual([]); expect(f.session.currentFrame).toBeNull(); expect(f.session.delegateQueue).toBeNull();
  expect(await f.App.XRFXWorldTrackingConfiguration.isSupported).toBe(true); expect(f.privacy.getSnapshot()).toEqual([]);
  await f.begin(); expect(f.session.configuration).toBeInstanceOf(XR.XRFXWorldTrackingConfiguration);
  const anchor = new XR.XRFXAnchor(AFXTransform3D.translation(2, 3, 4)); f.session.add(anchor); await ticks(); expect(f.run.add).toHaveBeenCalledWith(anchor);
  const value = f.emit([anchor]); expect(f.session.currentFrame).toBe(value); expect(f.frame).not.toHaveBeenCalled(); flush();
  expect(f.frame).toHaveBeenCalledWith(f.session, value); expect(f.added).toHaveBeenCalledWith(f.session, [anchor]); expect(value.camera).toBeInstanceOf(XR.XRFXCamera);
  f.emit([anchor]); flush(); expect(f.updated).toHaveBeenCalledWith(f.session, [anchor]);
  const results = await f.session.raycast(new XR.XRFXRaycastQuery({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any"));
  expect(results[0]).toBeInstanceOf(XR.XRFXRaycastResult); expect(results[0]!.worldTransform.transformPoint({ x: 0, y: 0, z: 0 })).toEqual({ x: 1, y: 2, z: 3 });
  f.session.remove(anchor); await ticks(); f.emit(); flush(); expect(f.removed).toHaveBeenCalledWith(f.session, [anchor]);
  f.callbacks[0]!.interrupted(); f.callbacks[0]!.interruptionEnded(); flush(); expect(f.interrupted).toHaveBeenCalledWith(f.session); expect(f.resumed).toHaveBeenCalledWith(f.session);
  f.session.pause(); await ticks(); expect(f.run.pause).toHaveBeenCalledOnce(); f.emit(); flush(); expect(f.frame).toHaveBeenCalledTimes(3);
});
it.each(["revoke", "policy", "entitlement", "unregister", "teardown"])("keeps the instance terminal after %s before first native use", async reason => {
  const f = await fixture(); if (reason === "revoke") { f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); } else if (reason === "policy") { f.access(false); f.access(true); } else if (reason === "entitlement") { f.entitlements([]); f.entitlements(["xr.session"]); } else if (reason === "unregister") f.unregister(); else f.owner.abort();
  expect(() => f.session.run(f.configuration)).toThrow(XR.XRFXError); expect(f.start).not.toHaveBeenCalled();
});
it("observes denied construction before a grant then a withdrawal", async () => {
  const f = await fixture(); f.privacy.revoke(f.scope); const denied = new f.App.XRFXSession();
  f.privacy.setAuthorization(f.scope, "granted"); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted");
  expect(() => denied.run(f.configuration)).toThrow(XR.XRFXError); expect(f.start).not.toHaveBeenCalled();
});
it("drops queued frames and errors after revoke/regrant and replacement", async () => {
  const f = await fixture(); await f.begin(); f.emit(); f.callbacks[0]!.failed(new Error("sensor"));
  f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); const next = new f.App.XRFXSession(); next.run(f.configuration); await ticks(); flush();
  expect(f.frame).not.toHaveBeenCalled(); expect(f.failed).not.toHaveBeenCalled(); expect(f.session.currentFrame).toBeNull();
});
it("uses the selected main queue after ambiguity and an explicit suspended queue", async () => {
  const f = await fixture(); const Queue = dispatchQueueForSession(scosSessionsForApp(f.scope.appId)[0]!); const queue = new Queue("xr-explicit"); queue.suspend();
  f.session.delegateQueue = queue; await f.begin(); await fixture(); f.emit(); flush(); expect(f.frame).not.toHaveBeenCalled(); queue.resume(); flush(); expect(f.frame).toHaveBeenCalledOnce();
  f.session.delegateQueue = null; f.emit(); flush(); expect(f.frame).toHaveBeenCalledTimes(2);
});
it.each(["start", "add", "remove", "raycast", "pause", "frame"])("records raw native %s denial despite saved consent", async boundary => {
  const f = await fixture(); await f.begin(); f.privacy.setAuthorization(f.scope, "granted"); const denial = new DOMException("Denied", "SecurityError"); const anchor = new XR.XRFXAnchor(new AFXTransform3D());
  if (boundary === "start") { f.start.mockRejectedValueOnce(denial); f.session.run(f.configuration, XR.XRFXSessionRunOptions.resetTracking); }
  else if (boundary === "frame") f.callbacks[0]!.failed(denial);
  else { f.run[boundary].mockRejectedValueOnce(denial); if (boundary === "raycast") await expect(f.session.raycast(new XR.XRFXRaycastQuery({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any"))).rejects.toBeInstanceOf(XR.XRFXError); else if (boundary === "pause") f.session.pause(); else f.session[boundary](anchor); }
  await ticks(); flush(); expect(f.privacy.getSnapshot()[0]).toMatchObject({ browserStatus: "denied", authorizationStatus: "denied" }); expect(() => f.session.run(f.configuration)).toThrow(XR.XRFXError);
});
it.each(["start", "add", "remove", "raycast", "pause"].flatMap(boundary => ["resolve", "reject"].map(outcome => ({ boundary, outcome }))))("isolates late $boundary $outcome from a replacement after revoke/regrant", async ({ boundary, outcome }) => {
  const f = await fixture(); await f.begin(); let finish!: (value: unknown) => void, reject!: (error: unknown) => void;
  const pending = () => new Promise<never>((done, fail) => { finish = value => done(value as never); reject = fail; }); const late = { ...f.run, pause: vi.fn(async () => {}) };
  let result: Promise<unknown> | undefined;
  if (boundary === "start") { f.start.mockImplementationOnce(pending); f.session.run(f.configuration, XR.XRFXSessionRunOptions.resetTracking); }
  else { f.run[boundary as keyof typeof f.run].mockImplementationOnce(pending); if (boundary === "raycast") result = f.session.raycast(new XR.XRFXRaycastQuery({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any")).catch(error => error); else if (boundary === "pause") f.session.pause(); else f.session[boundary as "add" | "remove"](new XR.XRFXAnchor(new AFXTransform3D())); }
  await ticks(); f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); const replacement = { ...f.run, pause: vi.fn(async () => {}) }; f.start.mockResolvedValueOnce(replacement); const next = new f.App.XRFXSession(); next.run(f.configuration); await ticks();
  if (outcome === "reject") reject(new DOMException("Old refusal", "NotAllowedError")); else finish(boundary === "start" ? late : boundary === "raycast" ? [] : undefined);
  await ticks(); await result; flush(); expect(f.privacy.getSnapshot()[0]!.authorizationStatus).toBe("granted"); expect(replacement.pause).not.toHaveBeenCalled(); if (boundary === "start" && outcome === "resolve") expect(late.pause).toHaveBeenCalledOnce(); expect(f.failed).not.toHaveBeenCalled();
});
it("never silently resets tracking or drops anchors when run options request preservation", async () => {
  const f = await fixture(); await f.begin(); f.session.run(f.configuration); await ticks(); expect(f.start).toHaveBeenCalledOnce();
  const changed = new f.App.XRFXOrientationTrackingConfiguration(); changed.isLightEstimationEnabled = false;
  expect(() => f.session.run(changed)).toThrow(expect.objectContaining({ code: "unsupportedConfiguration" }));
  const anchor = new XR.XRFXAnchor(new AFXTransform3D()); f.emit([anchor]);
  expect(() => f.session.run(changed, XR.XRFXSessionRunOptions.resetTracking)).toThrow(expect.objectContaining({ code: "unsupportedConfiguration" }));
  f.session.run(changed, XR.XRFXSessionRunOptions.resetTracking | XR.XRFXSessionRunOptions.removeExistingAnchors); await ticks(); expect(f.start).toHaveBeenCalledTimes(2);
  f.session.pause(); await ticks(); expect(() => f.session.run(changed)).toThrow(expect.objectContaining({ code: "unsupportedConfiguration" }));
});
it("owns each observer once and releases the selected session/access observers once", async () => {
  const f = await fixture(); const { associateXRPort } = await import("../../../src/FX/XRFX/internal/xrPort"); const { xrSessions } = await import("../../../src/FX/XRFX/internal/xrBindings");
  const releases: ReturnType<typeof vi.fn>[] = []; associateXRPort(f.context, { ...f.port, observeAccessLoss(listener) { const release = vi.fn(f.port.observeAccessLoss(listener)); releases.push(release); return release; } });
  const session = new f.App.XRFXSession(); session.run(f.configuration); await ticks(); expect(releases).toHaveLength(1); f.unregister(); expect(releases[0]).toHaveBeenCalledOnce(); xrSessions.get(session)!.dispose(); f.owner.abort(); expect(releases[0]).toHaveBeenCalledOnce();
});
it("rejects a support-query completion after the selected session is unregistered", async () => {
  const f = await fixture(); let resolve!: (value: boolean) => void; f.supported.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = f.App.XRFXWorldTrackingConfiguration.isSupported; f.unregister(); resolve(true); await expect(pending).rejects.toBeInstanceOf(XR.XRFXError);
});
it("drops a queued unsupported completion before any native session exists after revoke/regrant", async () => {
  const f = await fixture(); f.start.mockRejectedValueOnce(new XR.XRFXError("unsupportedConfiguration")); f.session.run(f.configuration); await ticks();
  f.privacy.revoke(f.scope); f.privacy.setAuthorization(f.scope, "granted"); const next = new f.App.XRFXSession(); next.run(f.configuration); await ticks(); flush(); expect(f.failed).not.toHaveBeenCalled(); expect(() => f.session.run(f.configuration)).toThrow(XR.XRFXError);
});
it("treats current support refusal as native denial but isolates a stale query's refusal", async () => {
  const f = await fixture(); f.privacy.setAuthorization(f.scope, "granted"); f.supported.mockRejectedValueOnce(new DOMException("Refused", "SecurityError"));
  await expect(f.App.XRFXWorldTrackingConfiguration.isSupported).rejects.toBeInstanceOf(XR.XRFXError); expect(f.privacy.getSnapshot()[0]!.authorizationStatus).toBe("denied");
  f.unregister(); const fresh = await fixture(); fresh.privacy.setAuthorization(fresh.scope, "granted"); let reject!: (error: unknown) => void; fresh.supported.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; })); const pending = fresh.App.XRFXWorldTrackingConfiguration.isSupported;
  fresh.privacy.revoke(fresh.scope); fresh.privacy.setAuthorization(fresh.scope, "granted"); reject(new DOMException("Old refusal", "NotAllowedError")); await expect(pending).rejects.toBeInstanceOf(XR.XRFXError); expect(fresh.privacy.getSnapshot()[0]!.authorizationStatus).toBe("granted");
});
it("can retry after unsupported acquisition without silently keeping a dead pending run", async () => {
  const f = await fixture(); f.start.mockRejectedValueOnce(new XR.XRFXError("unsupportedConfiguration")); f.session.run(f.configuration); await ticks(); flush(); expect(f.failed).toHaveBeenCalledOnce();
  f.session.run(f.configuration); await ticks(); expect(f.start).toHaveBeenCalledTimes(2); f.emit(); flush(); expect(f.frame).toHaveBeenCalledOnce();
});

it("releases native-ended mounted slots, clears the public run and restarts beyond the session limit", async () => {
  const f = await fixture();
  for (let index = 0; index < 3; index++) {
    f.session.run(f.configuration, index ? 1 : 0); await ticks(); expect(f.start).toHaveBeenCalledTimes(index + 1); const value = f.emit(); expect(f.session.currentFrame).toBe(value);
    expect(f.callbacks[index]!.ended).toBeTypeOf("function"); f.callbacks[index]!.ended(); flush(); expect(f.session.currentFrame).toBeNull(); expect(f.frame).not.toHaveBeenCalled();
  }
  expect(f.failed).not.toHaveBeenCalled(); expect(f.run.pause).not.toHaveBeenCalled();
});
it("isolates pending old native-end results and callbacks from the replacement run", async () => {
  const f = await fixture(); await f.begin(); let resolve!: (values: readonly XR.XRFXRaycastResult[]) => void; f.run.raycast.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = f.session.raycast(new XR.XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"estimatedPlane","any")).catch(error => error);
  expect(f.callbacks[0]!.ended).toBeTypeOf("function"); f.callbacks[0]!.ended(); f.session.run(f.configuration, 1); await ticks(); f.callbacks[0]!.failed(new DOMException("Old denial", "NotAllowedError")); f.callbacks[0]!.ended(); f.emit([],0); resolve([]); await pending; f.emit([],1); flush(); expect(f.frame).toHaveBeenCalledOnce(); expect(f.failed).not.toHaveBeenCalled(); expect(f.run.pause).not.toHaveBeenCalled(); expect(f.privacy.getSnapshot()[0]!.authorizationStatus).toBe("granted");
});
it("releases a run that ends while its start promise is handing off", async () => {
  const f = await fixture(); let resolve!: (run: typeof f.run) => void; f.start.mockImplementationOnce((_configuration,_signal,callbacks) => { f.callbacks.push(callbacks); return new Promise(done => { resolve = done; }); });
  f.session.run(f.configuration); await ticks(); expect(f.callbacks[0]!.ended).toBeTypeOf("function"); f.callbacks[0]!.ended(); const fresh = {...f.run,pause:vi.fn(async()=>{})}; f.start.mockResolvedValueOnce(fresh); f.session.run(f.configuration,1); await ticks(); resolve(f.run); await ticks(); f.emit(); flush(); expect(fresh.pause).not.toHaveBeenCalled(); expect(f.failed).not.toHaveBeenCalled();
});
