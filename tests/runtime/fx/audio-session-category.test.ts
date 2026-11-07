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
import { BrowserAudioCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter";
import { createMountedAudioSessions } from "../../../src/SynCloudOS/AppSDK/mountedAudioSessions";

describe("AVAudioSession category", () => {
  it("reports category authorisation independently of microphone permission", async () => {
    const host = new BrowserAudioCaptureAdapter({ setSessionType: vi.fn(), getUserMedia: vi.fn(), enumerateDevices: async () => [], createRecorder: vi.fn(), isTypeSupported: () => false, now: () => 0, subscribeDeviceChange: () => () => {} });
    const owner = new AbortController(); let permissions = ["audio.session"];
    const session = createMountedAudioSessions(host, owner.signal, () => permissions).createSession();
    expect(session.authorizationStatus).toBe("granted");
    await expect(session.requestAuthorization()).resolves.toBe("granted");
    permissions = []; expect(session.authorizationStatus).toBe("denied");
    await expect(session.requestAuthorization()).resolves.toBe("denied");
    owner.abort(); expect(session.authorizationStatus).toBe("unavailable");
  });
  it("maps category to browser type without requesting a microphone", async () => {
    const setSessionType = vi.fn(), capture = vi.fn();
    const host = new BrowserAudioCaptureAdapter({ getUserMedia: capture, enumerateDevices: async () => [], createRecorder: vi.fn(), isTypeSupported: () => false, now: () => 0, subscribeDeviceChange: () => () => {}, setSessionType });
    const owner = new AbortController();
    const session = createMountedAudioSessions(host, owner.signal, () => ["audio.session"]).createSession();
    await session.setCategory("playback");
    expect(session.category).toBe("playback");
    expect(setSessionType).toHaveBeenCalledWith("playback");
    expect(capture).not.toHaveBeenCalled();
    await expect(session.requestRecordAuthorization()).rejects.toMatchObject({ name: "SecurityError" });
    owner.abort();
    expect(setSessionType).toHaveBeenLastCalledWith("auto");
  });
  it("reports unsupported session types and rejects invalid categories", async () => {
    const host = new BrowserAudioCaptureAdapter(null), owner = new AbortController();
    const session = host.createSession(owner.signal);
    expect(session.capabilities.sessionType).toBe(false);
    await expect(session.setCategory("playback")).rejects.toMatchObject({ name: "NotSupportedError" });
    await expect(session.setCategory("invalid" as any)).rejects.toBeInstanceOf(TypeError);
  });
});

it("arbitrates category owners and restores the original native type without capture", async () => {
  const native = { type: "ambient" }, navigator = { audioSession: native } as any;
  const { createBrowserAudioCapturePlatform } = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter");
  const host = new BrowserAudioCaptureAdapter(createBrowserAudioCapturePlatform(navigator, { performance: { now: () => 0 } } as any));
  const a = host.createSession(), b = host.createSession();
  expect(a.capabilities.capture).toBe(false);
  expect(a.capabilities.sessionType).toBe(true);
  await a.setCategory("playback"); await b.setCategory("record");
  a.dispose(); expect(native.type).toBe("play-and-record");
  b.dispose(); expect(native.type).toBe("ambient");
  const c = host.createSession(), d = host.createSession();
  await c.setCategory("playback"); await d.setCategory("record");
  d.dispose(); expect(native.type).toBe("playback");
  c.dispose(); expect(native.type).toBe("ambient");
});

it("shares native type arbitration across independently created browser platforms", async () => {
  const native = { type: "transient" } as any, navigator = { audioSession: native } as any;
  const { createBrowserAudioCapturePlatform } = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter");
  const window = { performance: { now: () => 0 } } as any;
  const a = new BrowserAudioCaptureAdapter(createBrowserAudioCapturePlatform(navigator, window)).createSession();
  const b = new BrowserAudioCaptureAdapter(createBrowserAudioCapturePlatform(navigator, window)).createSession();
  await a.setCategory("playback"); await b.setCategory("ambient");
  b.dispose(); expect(native.type).toBe("playback");
  a.dispose(); expect(native.type).toBe("transient");
});

it("releases caller-aborted category leases and does not overwrite an external native owner", async () => {
  const native = { type: "auto" } as any;
  const { createBrowserAudioCapturePlatform } = await import("../../../src/SynCloudOS/PlatformAdapters/BrowserAudioCaptureAdapter");
  const host = new BrowserAudioCaptureAdapter(createBrowserAudioCapturePlatform({ audioSession: native } as any, { performance: { now: () => 0 } } as any));
  const owner = new AbortController(), client = createMountedAudioSessions(host, owner.signal, () => ["audio.session"]);
  for (let i = 0; i < 12; i++) { const caller = new AbortController(); const session = client.createSession(caller.signal); await session.setCategory("playback"); caller.abort(); }
  const session = client.createSession(); await session.setCategory("playback"); native.type = "transient";
  session.dispose(); expect(native.type).toBe("transient"); owner.abort();
});
