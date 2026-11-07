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
import { BrowserVideoCaptureAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserVideoCaptureAdapter";
import { VideoCaptureService } from "../../../src/SynCloudOS/VideoFX/VideoCaptureService";
import { createMountedVideoClient } from "../../../src/SynCloudOS/AppSDK/mountedVideoClient";

type TrackFixture = ReturnType<typeof createTrack>;

function createTrack(settings: MediaTrackSettings = {
  deviceId: "camera-actual",
  groupId: "group-actual",
  width: 640,
  height: 480,
  frameRate: 24,
  aspectRatio: 4 / 3,
  facingMode: "user",
}) {
  const listeners = new Map<string, Set<() => void>>();
  const track = {
    kind: "video",
    readyState: "live",
    enabled: true,
    muted: false,
    stop: vi.fn(() => { track.readyState = "ended"; }),
    getSettings: vi.fn(() => settings),
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
  };
  return {
    track,
    emit(type: "ended" | "mute" | "unmute") {
      listeners.get(type)?.forEach((listener) => listener());
    },
    listenerCount() {
      return [...listeners.values()].reduce((total, bucket) => total + bucket.size, 0);
    },
  };
}

function createStream(...tracks: TrackFixture[]) {
  return {
    getTracks: () => tracks.map((fixture) => fixture.track),
    getVideoTracks: () => tracks.map((fixture) => fixture.track),
  } as unknown as MediaStream;
}

function fixture() {
  const camera = createTrack();
  const display = createTrack({ width: 1920, height: 1080, frameRate: 60, displaySurface: "monitor" });
  const permissionListeners = new Map<"camera" | "display", Set<(state: PermissionState) => void>>();
  const deviceListeners = new Set<() => void>();
  const permissionState = { camera: "granted", display: "granted" } as Record<"camera" | "display", PermissionState>;
  let devices = [{ deviceId: "camera-actual", groupId: "group-actual", kind: "videoinput", label: "Camera" }];
  const platform = {
    getUserMedia: vi.fn(async () => createStream(camera)),
    getDisplayMedia: vi.fn(async () => createStream(display)),
    enumerateDevices: vi.fn(async () => devices),
    getPermissionState: vi.fn(async (kind: "camera" | "display") => permissionState[kind]),
    subscribePermissionChange(kind: "camera" | "display", listener: (state: PermissionState) => void) {
      if (!permissionListeners.has(kind)) permissionListeners.set(kind, new Set());
      permissionListeners.get(kind)!.add(listener);
      return () => permissionListeners.get(kind)?.delete(listener);
    },
    subscribeDeviceChange(listener: () => void) {
      deviceListeners.add(listener);
      return () => deviceListeners.delete(listener);
    },
  };
  return {
    camera,
    display,
    platform,
    setDevices(next: typeof devices) { devices = next; },
    emitDeviceChange() { deviceListeners.forEach((listener) => listener()); },
    emitPermission(kind: "camera" | "display", state: PermissionState) {
      permissionState[kind] = state;
      permissionListeners.get(kind)?.forEach((listener) => listener(state));
    },
  };
}

describe("scoped browser video capture", () => {
  it("is passive until explicit acquisition and reports actual selected track settings", async () => {
    const f = fixture();
    const session = new BrowserVideoCaptureAdapter(f.platform).createSession();
    expect(session.state).toBe("idle");
    expect(session.capabilities).toEqual({ camera: true, display: true, deviceEnumeration: true });
    await expect(session.enumerateDevices()).resolves.toEqual([
      { id: "camera-actual", groupId: "group-actual", kind: "camera", label: "Camera" },
    ]);
    expect(f.platform.getUserMedia).not.toHaveBeenCalled();

    const selected = await session.requestCamera({
      deviceId: "camera-requested",
      width: 1280,
      height: 720,
      frameRate: 30,
    });
    expect(f.platform.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        deviceId: { exact: "camera-requested" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
    expect(selected).toEqual({
      kind: "camera",
      deviceId: "camera-actual",
      groupId: "group-actual",
      width: 640,
      height: 480,
      frameRate: 24,
      aspectRatio: 4 / 3,
      facingMode: "user",
      displaySurface: null,
    });
    expect(session.settings).toEqual(selected);
    expect(session.state).toBe("active");
    session.dispose();
    expect(f.camera.track.stop).toHaveBeenCalledOnce();
  });

  it("stops every late track when ownership is revoked while permission is pending", async () => {
    const f = fixture();
    const first = createTrack(), second = createTrack();
    let resolve!: (stream: MediaStream) => void;
    f.platform.getUserMedia.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const owner = new AbortController();
    const session = new BrowserVideoCaptureAdapter(f.platform).createSession(owner.signal);
    const pending = session.requestCamera();
    owner.abort();
    resolve(createStream(first, second));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(first.track.stop).toHaveBeenCalledOnce();
    expect(second.track.stop).toHaveBeenCalledOnce();
    expect(session.state).toBe("disposed");
  });

  it("distinguishes unavailable, denied and constraint-failure outcomes", async () => {
    const unavailable = new BrowserVideoCaptureAdapter(null).createSession();
    expect(unavailable.state).toBe("unavailable");
    await expect(unavailable.requestCamera()).rejects.toMatchObject({ name: "NotSupportedError" });

    const denied = fixture();
    denied.platform.getUserMedia.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const deniedSession = new BrowserVideoCaptureAdapter(denied.platform).createSession();
    await expect(deniedSession.requestCamera()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(deniedSession.state).toBe("denied");

    const constrained = fixture();
    constrained.platform.getUserMedia.mockRejectedValue(new DOMException("width", "OverconstrainedError"));
    const constrainedSession = new BrowserVideoCaptureAdapter(constrained.platform).createSession();
    await expect(constrainedSession.requestCamera({ width: 8000 })).rejects.toMatchObject({ name: "OverconstrainedError" });
    expect(constrainedSession.state).toBe("failed");
  });

  it("interrupts on selected-device loss, track end, and permission loss", async () => {
    const device = fixture();
    const deviceSession = new BrowserVideoCaptureAdapter(device.platform).createSession();
    await deviceSession.requestCamera();
    device.setDevices([]);
    device.emitDeviceChange();
    await vi.waitFor(() => expect(deviceSession.state).toBe("interrupted"));
    expect(device.camera.track.stop).toHaveBeenCalledOnce();

    const ended = fixture();
    const endedSession = new BrowserVideoCaptureAdapter(ended.platform).createSession();
    await endedSession.requestCamera();
    ended.camera.emit("ended");
    expect(endedSession.state).toBe("interrupted");
    expect(ended.camera.track.stop).toHaveBeenCalledOnce();

    const revoked = fixture();
    const revokedSession = new BrowserVideoCaptureAdapter(revoked.platform).createSession();
    await revokedSession.requestCamera();
    revoked.emitPermission("camera", "denied");
    expect(revokedSession.state).toBe("interrupted");
    expect(revoked.camera.track.stop).toHaveBeenCalledOnce();
  });

  it("pauses on suspension, resumes only while permission remains granted, and keeps sibling leases isolated", async () => {
    const first = fixture(), second = fixture();
    const streams = [createStream(first.camera), createStream(second.camera)];
    const platform = { ...first.platform, getUserMedia: vi.fn(async () => streams.shift()!) };
    const service = new VideoCaptureService(new BrowserVideoCaptureAdapter(platform));
    const a = service.createSession({ appId: "com.example.app", reauthorise: () => true });
    const b = service.createSession({ appId: "com.example.app", reauthorise: () => true });
    await a.requestCamera();
    await b.requestCamera();
    a.dispose();
    expect(first.camera.track.stop).toHaveBeenCalledOnce();
    expect(second.camera.track.stop).not.toHaveBeenCalled();

    service.suspendOwner("com.example.app");
    expect(second.camera.track.enabled).toBe(false);
    expect(b.state).toBe("suspended");
    await service.resumeOwner("com.example.app");
    expect(second.camera.track.enabled).toBe(true);
    expect(b.state).toBe("active");
    service.closeOwner("com.example.app");
    expect(second.camera.track.stop).toHaveBeenCalledOnce();
    service.dispose();
  });

  it("keeps camera and display manifest/policy authority separate before browser access", async () => {
    const f = fixture();
    const service = new VideoCaptureService(new BrowserVideoCaptureAdapter(f.platform));
    const mount = new AbortController();
    let permissions: string[] = [];
    const authorised = new Set<string>(["video.capture.camera", "video.capture.display"]);
    const client = createMountedVideoClient(
      service,
      mount.signal,
      () => permissions,
      (capability) => authorised.has(capability),
      "com.example.app",
    );
    const session = client.createCaptureSession();
    await expect(session.requestCamera()).rejects.toMatchObject({ name: "SecurityError" });
    expect(f.platform.getUserMedia).not.toHaveBeenCalled();

    permissions = ["video.capture.camera"];
    await session.requestCamera();
    await expect(session.requestDisplay()).rejects.toMatchObject({ name: "SecurityError" });
    expect(f.platform.getDisplayMedia).not.toHaveBeenCalled();
    session.dispose();

    permissions = ["video.capture.display"];
    const display = client.createCaptureSession();
    authorised.delete("video.capture.display");
    await expect(display.requestDisplay()).rejects.toMatchObject({ name: "SecurityError" });
    expect(f.platform.getDisplayMedia).not.toHaveBeenCalled();
    display.dispose();
    service.dispose();
  });
});
