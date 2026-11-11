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

import { describe, expect, it, vi } from "vitest";
import { createPrivacyStore } from "../../src/SynCloudOS/Privacy";
import { createMountedXRPort } from "../../src/SynCloudOS/AppSDK/mountedXRPort";
import { XRFXError, XRFXRaycastQuery } from "../../src/FX/XRFX/public";
import type { XRCallbacks } from "../../src/FX/XRFX/internal/xrPort";
const configuration = { kind: "world", worldAlignment: "gravity", isLightEstimationEnabled: false, options: 0 } as const;
function fixture() {
  const mount = new AbortController(), store = createPrivacyStore({ runtimeId: "xr-privacy" });
  const scope = { userId: "user", appId: "com.example.xr-privacy", service: "xr" }; let callbacks: XRCallbacks | undefined;
  const run = { pause: vi.fn(async () => {}), add: vi.fn(async () => {}), remove: vi.fn(async () => {}), raycast: vi.fn(async () => []) };
  const adapter = { isSupported: vi.fn(async () => true), start: vi.fn(async (_config: unknown, _signal: AbortSignal, values: XRCallbacks) => { callbacks = values; return run; }) };
  const port = createMountedXRPort(adapter, mount.signal, () => ["xr.session"], () => true, store.forApplication({ ...scope, signal: mount.signal }), listener => store.subscribe(listener));
  const received = vi.fn(); const begin = () => port.start(configuration, new AbortController().signal, { frame: received, failed: received, interrupted: received, interruptionEnded: received, ended() {} });
  return { mount, store, scope, port, adapter, run, received, begin, emit: () => callbacks?.interrupted(), dispose() { mount.abort(); store.dispose(); } };
}
describe("shared privacy for attributed XR", () => {
  it("does not turn passive support inspection into application consent", async () => {
    const f = fixture(); try { expect(await f.port.isSupported("world")).toBe(true); expect(f.store.getSnapshot()).toEqual([]); expect(f.adapter.start).not.toHaveBeenCalled(); } finally { f.dispose(); }
  });
  it("denies active native access while retaining passive support inspection", async () => {
    const f = fixture(); try { f.store.revoke(f.scope); expect(await f.port.isSupported("world")).toBe(true); await expect(f.begin()).rejects.toMatchObject({ code: "cameraUnauthorized" }); expect(f.adapter.start).not.toHaveBeenCalled(); } finally { f.dispose(); }
  });
  it("records successful use and stops live delivery on withdrawal even after regrant", async () => {
    const f = fixture(); try { await f.begin(); expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "granted" }); f.emit(); expect(f.received).toHaveBeenCalledOnce(); const generation = f.port.generation; f.store.revoke(f.scope); f.store.setAuthorization(f.scope, "granted"); f.emit(); expect(f.received).toHaveBeenCalledOnce(); expect(f.run.pause).toHaveBeenCalledOnce(); expect(() => f.port.assertAccess(generation)).toThrow(XRFXError); } finally { f.dispose(); }
  });
  it("keeps a raw browser refusal authoritative despite saved consent", async () => {
    const f = fixture(); try { const run = await f.begin(); f.run.raycast.mockRejectedValueOnce(new DOMException("Refused", "NotAllowedError")); await expect(run.raycast(new XRFXRaycastQuery({x:0,y:0,z:0},{x:0,y:0,z:-1},"estimatedPlane","any"))).rejects.toMatchObject({code:"cameraUnauthorized"}); expect(f.store.getSnapshot()[0]).toMatchObject({browserStatus:"denied",authorizationStatus:"denied"}); expect(f.run.pause).toHaveBeenCalledOnce(); } finally { f.dispose(); }
  });
  it("rejects pending acquisition promptly and releases its late handle after replacement", async () => {
    const f = fixture(); let finish!: (value: typeof f.run) => void; f.adapter.start.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    try { const pending = f.begin(); f.store.revoke(f.scope); await expect(pending).rejects.toBeInstanceOf(XRFXError); f.store.setAuthorization(f.scope,"granted"); const fresh = {...f.run,pause:vi.fn(async()=>{})}; f.adapter.start.mockResolvedValueOnce(fresh); await f.begin(); finish(f.run); for(let i=0;i<30;i++)await Promise.resolve(); expect(f.run.pause).toHaveBeenCalledOnce(); expect(fresh.pause).not.toHaveBeenCalled(); expect(f.store.getSnapshot()[0]!.authorizationStatus).toBe("granted"); } finally { f.dispose(); }
  });
});
