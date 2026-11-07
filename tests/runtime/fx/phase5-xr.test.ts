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
import { XRFXConfiguration } from "../../../src/FX/XRFX/public";
import { BrowserXRAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserXRAdapter";
import { createMountedXRClient } from "../../../src/SynCloudOS/AppSDK/mountedXRClient";

function fixture() {
  let callback: ((time: number, frame: unknown) => void) | undefined;
  const native = Object.assign(new EventTarget(), {
    requestReferenceSpace: vi.fn(async () => ({})),
    requestAnimationFrame: vi.fn((next: typeof callback) => { callback = next; return 1; }),
    cancelAnimationFrame: vi.fn(), end: vi.fn(async () => {}),
  });
  const xr = { isSessionSupported: vi.fn(async () => true), requestSession: vi.fn(async () => native) };
  return { native, xr, adapter: new BrowserXRAdapter({ isSecureContext: true, browserNavigator: { xr } }),
    frame: () => callback?.(1200, { getViewerPose: () => ({ transform: { matrix: new Float32Array(16).fill(2) } }), trackedAnchors: new Set() }) };
}

describe("XRFX portable sessions", () => {
  it("starts only on request, snapshots frames and ends on disposal", async () => {
    const f = fixture(), session = f.adapter.createSession();
    expect(f.xr.requestSession).not.toHaveBeenCalled();
    expect(await session.isSupported(new XRFXConfiguration())).toBe(true);
    const frames: number[] = [];
    await session.run(new XRFXConfiguration(), frame => frames.push(frame.timestamp));
    f.frame();
    expect(frames).toEqual([1.2]);
    session.dispose();
    expect(f.native.end).toHaveBeenCalledOnce();
    f.frame();
    expect(frames).toEqual([1.2]);
    await expect(session.run(new XRFXConfiguration(), () => {})).rejects.toMatchObject({ name: "AbortError" });
  });
  it("ends a session whose reference-space request fails", async () => {
    const f = fixture();
    f.native.requestReferenceSpace.mockRejectedValue(new DOMException("Unsupported", "NotSupportedError"));
    await expect(f.adapter.createSession().run(new XRFXConfiguration(), () => {})).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(f.native.end).toHaveBeenCalledOnce();
  });
  it("checks manifest and policy on every start and ends sessions on mount abort", async () => {
    const f = fixture(), mount = new AbortController();
    let allowed = true;
    const session = createMountedXRClient(f.adapter, mount.signal, () => ["xr.session"], () => allowed).createSession();
    allowed = false;
    await expect(session.run(new XRFXConfiguration(), () => {})).rejects.toMatchObject({ name: "SecurityError" });
    expect(f.xr.requestSession).not.toHaveBeenCalled();
    allowed = true;
    await session.run(new XRFXConfiguration(), () => {});
    mount.abort();
    expect(f.native.end).toHaveBeenCalledOnce();
  });
  it("does not claim native tracking or immersive support based on API presence", async () => {
    const session = new BrowserXRAdapter({ isSecureContext: false }).createSession();
    expect(await session.getAuthorizationStatus()).toBe("unavailable");
    expect(await session.isSupported(new XRFXConfiguration({ mode: "immersive-ar" }))).toBe(false);
    expect(() => new XRFXConfiguration({ mode: "invalid" as "inline" })).toThrowError(TypeError);
    session.dispose();
  });

  it("releases caller leases and withdraws revoked capabilities", () => {
    const f = fixture(), mount = new AbortController();
    const client = createMountedXRClient(f.adapter, mount.signal, () => ["xr.session"], () => true);
    for (let index = 0; index < 6; index++) {
      const caller = new AbortController(), session = client.createSession(caller.signal);
      caller.abort();
      expect(session.getCapabilities().apiAvailable).toBe(false);
    }
    mount.abort();
    expect(client.getCapabilities().apiAvailable).toBe(false);
  });
});
