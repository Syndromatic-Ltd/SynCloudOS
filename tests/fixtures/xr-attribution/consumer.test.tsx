import { expect, it, vi } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { XRFXSession as BaseSession, XRFXFrame, XRFXCamera, XRFXRaycastResult } from "@syndromatic/syncloudos/fx/xr";
import { AFXTransform3D } from "@syndromatic/syncloudos/fx/animation";
import { NSEUUID } from "@syndromatic/syncloudos/foundation";
import Application, { afterAwait, afterTimer, thirdParty, XRFXSession, XRFXWorldTrackingConfiguration, XRFXAnchor, XRFXRaycastQuery, XRFXError } from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
const ticks = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
it("constructs after await, timer and callback in a real compiled app and runs the ARKit flow", async () => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (work: () => void) => { jobs.push(work); return Promise.resolve(); } }); const flush = () => { while (jobs.length) jobs.shift()!(); };
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try {
    expect(() => new BaseSession()).toThrow(/application bundle/); expect(() => new XRFXSession()).toThrow(XRFXError);
    await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); expect(host.adapters.xr).toBeDefined(); host.adapters.xr.allow(); expect("xr" in host.appContext).toBe(false);
    const frame = vi.fn(), added = vi.fn(), removed = vi.fn(); const delegate = { sessionDidUpdateFrame: frame, sessionDidAddAnchors: added, sessionDidRemoveAnchors: removed };
    const first = await afterAwait(delegate), second = await afterTimer(delegate); let third!: XRFXSession;
    await new Promise<void>(done => queueMicrotask(() => thirdParty(delegate, create => { third = create(); done(); })));
    const configuration = new XRFXWorldTrackingConfiguration(); configuration.isLightEstimationEnabled = false; expect(await XRFXWorldTrackingConfiguration.isSupported).toBe(true);
    for (const session of [first, second, third]) {
      expect(session).toBeInstanceOf(BaseSession); expect(session).toBeInstanceOf(XRFXSession); session.run(configuration); await ticks();
      const anchor = new XRFXAnchor("marker", AFXTransform3D.translation(1, 2, 3)); expect(anchor.identifier).toBeInstanceOf(NSEUUID); session.add(anchor); await ticks(); host.adapters.xr.emitFrame(); flush();
      expect(frame).toHaveBeenCalledWith(session, expect.any(XRFXFrame)); expect(session.currentFrame?.camera).toBeInstanceOf(XRFXCamera); expect(added).toHaveBeenCalledWith(session, [anchor]);
      const results = await session.raycast(new XRFXRaycastQuery({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any")); expect(results[0]).toBeInstanceOf(XRFXRaycastResult);
      session.remove(anchor); await ticks(); host.adapters.xr.emitFrame(); flush(); expect(removed).toHaveBeenCalledWith(session, [anchor]); session.pause(); await ticks(); expect(host.adapters.xr.activeSessionCount()).toBe(0);
    }
    const naturallyEnding = await afterAwait(delegate);
    for (let index = 0; index < 3; index++) {
      naturallyEnding.run(configuration, index ? 1 : 0); await ticks(); host.adapters.xr.emitFrame(); host.adapters.xr.endSessions(); await ticks(); flush();
      expect(host.adapters.xr.activeSessionCount()).toBe(0); expect(naturallyEnding.currentFrame).toBeNull();
    }
    const stale = await afterAwait(delegate); stale.run(configuration); await ticks(); frame.mockClear(); host.adapters.xr.emitFrame(); host.adapters.permissions.deny(); host.adapters.permissions.allow(); flush(); expect(frame).not.toHaveBeenCalled(); expect(() => stale.run(configuration)).toThrow(XRFXError);
    const ending = await afterAwait(delegate); await host.dispose(); flush(); expect(() => ending.run(configuration)).toThrow(XRFXError);
  } finally { await host.dispose(); flush(); vi.unstubAllGlobals(); }
});
it.each(["raycast", "pause"])("native %s denial overrides saved consent through the actual app entry", async boundary => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (work: () => void) => { jobs.push(work); return Promise.resolve(); } }); const flush = () => { while (jobs.length) jobs.shift()!(); };
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try {
    await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); expect(host.adapters.xr).toBeDefined(); host.adapters.xr.allow();
    const failed = vi.fn(); const session = await afterAwait({ sessionDidFailWithError: failed }); const configuration = new XRFXWorldTrackingConfiguration(); configuration.isLightEstimationEnabled = false; session.run(configuration); await ticks(); host.adapters.xr.deny();
    if (boundary === "raycast") await expect(session.raycast(new XRFXRaycastQuery({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any"))).rejects.toBeInstanceOf(XRFXError); else session.pause();
    await ticks(); host.adapters.xr.allow(); flush(); expect(failed).not.toHaveBeenCalled(); expect(() => session.run(configuration)).toThrow(XRFXError); expect(host.adapters.xr.activeSessionCount()).toBe(0);
  } finally { await host.dispose(); flush(); vi.unstubAllGlobals(); }
});
