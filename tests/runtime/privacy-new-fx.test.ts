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
import { createPrivacyStore, type PrivacyApplicationPort, type PrivacyAuthorizationStatus } from "../../src/SynCloudOS/Privacy";
import { createMountedXRClient } from "../../src/SynCloudOS/AppSDK/mountedXRClient";
import { XRFXConfiguration, type XRFXFrame } from "../../src/FX/XRFX/public";

const families = ["xr"] as const;
type Family = typeof families[number];
interface Probe {
  status(): Promise<PrivacyAuthorizationStatus>;
  capabilities(): unknown;
  request(): Promise<unknown>;
  dispose(): void;
  nativeRequest: ReturnType<typeof vi.fn>;
  nativeDispose: ReturnType<typeof vi.fn>;
  nativeStatus: ReturnType<typeof vi.fn>;
  lateValue: unknown;
  received: ReturnType<typeof vi.fn>;
  emit?(): void;
  startLive?(): Promise<void>;
}
function probe(family: Family, port: PrivacyApplicationPort, signal: AbortSignal): Probe {
  const nativeDispose = vi.fn(); const nativeStatus = vi.fn(async () => "granted" as const); const received = vi.fn();
  let frame: ((value: XRFXFrame) => void) | undefined;
  const capabilities = () => ({ apiAvailable: true, worldTracking: false as const, nativeARKit: false as const });
  const nativeRequest = vi.fn(async (_configuration: XRFXConfiguration, listener: (value: XRFXFrame) => void) => { frame = listener; });
  const client = createMountedXRClient({ getCapabilities: capabilities, createSession: () => ({ getCapabilities: capabilities, getAuthorizationStatus: nativeStatus, isSupported: async () => true, run: nativeRequest, pause: async () => {}, dispose: nativeDispose }) }, signal, () => ["xr.session"], () => true, port);
  const session = client.createSession();
  return { capabilities: client.getCapabilities, status: session.getAuthorizationStatus, request: () => session.run(new XRFXConfiguration(), received), dispose: session.dispose, nativeRequest, nativeDispose, nativeStatus, lateValue: undefined, received, emit: () => frame?.({ timestamp: 1, viewerTransform: null, anchors: [] }) };
}
function fixture(family: Family) {
  const mount = new AbortController(); const store = createPrivacyStore({ runtimeId: "new-fx" });
  const scope = { userId: "user", appId: "com.example.app", service: family };
  const port = store.forApplication({ ...scope, signal: mount.signal });
  return { store, scope, mount, port, device: probe(family, port, mount.signal) };
}

describe.each(families)("shared privacy for %s", family => {
  it("does not turn origin permission or passive capability queries into app consent", async () => {
    const f = fixture(family);
    try {
      f.device.capabilities();
      expect(f.store.getSnapshot()).toEqual([]);
      expect(await f.device.status()).toBe("prompt");
      expect(f.device.nativeRequest).not.toHaveBeenCalled();
      expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "prompt", browserStatus: "granted" });
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("denies an app before active native access while retaining passive status inspection", async () => {
    const f = fixture(family);
    try {
      f.store.revoke(f.scope);
      expect(await f.device.status()).toBe("denied");
      expect(f.device.nativeStatus).toHaveBeenCalledTimes(1);
      await expect(f.device.request()).rejects.toMatchObject({ name: "NotAllowedError" });
      expect(f.device.nativeRequest).not.toHaveBeenCalled();
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("records explicit successful use, then releases live resources and suppresses callbacks on revocation", async () => {
    const f = fixture(family);
    try {
      await f.device.request(); await f.device.startLive?.();
      expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "granted" });
      expect(await f.device.status()).toBe("granted");
      f.device.emit?.();
      const delivered = f.device.received.mock.calls.length;
      f.store.revoke(f.scope);
      expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
      f.device.emit?.(); expect(f.device.received).toHaveBeenCalledTimes(delivered);
      await expect(f.device.request()).rejects.toMatchObject({ name: "AbortError" });
      f.device.dispose(); expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("keeps browser denial authoritative and revokes the live manager", async () => {
    const f = fixture(family);
    try {
      await f.device.request();
      f.device.nativeStatus.mockResolvedValueOnce("denied");
      expect(await f.device.status()).toBe("denied");
      expect(f.store.getSnapshot()[0]).toMatchObject({ decision: "granted", browserStatus: "denied", authorizationStatus: "denied" });
      expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
    } finally { f.mount.abort(); f.store.dispose(); }
  });
  it("rejects stale in-flight results immediately after revocation", async () => {
    const f = fixture(family);
    let finish!: (value: unknown) => void;
    f.device.nativeRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    try {
      const pending = f.device.request();
      await vi.waitFor(() => expect(f.device.nativeRequest).toHaveBeenCalledTimes(1));
      f.store.revoke(f.scope);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      finish(f.device.lateValue); await Promise.resolve(); await Promise.resolve();
      expect(f.store.getSnapshot()[0].decision).toBe("denied");
      expect(f.device.nativeDispose).toHaveBeenCalledTimes(1);
    } finally { f.mount.abort(); f.store.dispose(); }
  });
});
