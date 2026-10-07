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

// @vitest-environment jsdom

import React from "react";
import { expect, it, vi } from "vitest";
import { createSynWare } from "../../../src/SynCloudOS/AppSDK";
import { createSynWareTestHost } from "../../../src/SynCloudOS/AppSDK/testing";
import { useSynWareVideo } from "../../../src/SynCloudOS/AppSDK/hooks/useSynWareVideo";
import type { VFXCaptureSession } from "../../../src/FX/VideoFX/public";
import { createMountedVideoClient } from "../../../src/SynCloudOS/AppSDK/mountedVideoClient";
import { VideoCaptureService } from "../../../src/SynCloudOS/VideoFX/VideoCaptureService";

const CameraProbe = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.video-camera-probe",
    version: "1.0.0",
    title: "Video Camera Probe",
    routes: [{ path: "/video-camera-probe", primary: true }],
    permissions: ["video.capture.camera"],
  },
  root() {
    return <div>Video camera probe</div>;
  },
});

const NoCaptureProbe = createSynWare({
  manifest: {
    schemaVersion: 1,
    id: "com.syndromatic.video-no-capability-probe",
    version: "1.0.0",
    title: "Video No Capability Probe",
    routes: [{ path: "/video-no-capability-probe", primary: true }],
  },
  root() {
    return <div>No video capability</div>;
  },
});

it("routes mounted video capture through manifest, PolicyKit, lifecycle and deterministic test authority", async () => {
  const host = createSynWareTestHost({ app: CameraProbe, document });
  await host.render();
  await host.lifecycle.launch();
  host.adapters.video.allow();
  host.adapters.permissions.allow();
  host.adapters.policy.allow();

  const session = host.appContext.video.createCaptureSession();
  expect(host.adapters.video.calls()).toEqual([]);
  const selected = await session.requestCamera({ width: 3840, height: 2160, frameRate: 120 });
  expect(selected).toMatchObject({
    kind: "camera",
    deviceId: "fake-camera",
    width: 1280,
    height: 720,
    frameRate: 30,
  });
  expect(host.adapters.video.calls().map((call) => call.operation)).toEqual(["video.camera"]);

  await host.lifecycle.suspend();
  expect(session.state).toBe("suspended");
  await host.lifecycle.activate();
  await vi.waitFor(() => expect(session.state).toBe("active"));

  await host.lifecycle.close();
  expect(session.state).toBe("disposed");
  const report = await host.dispose();
  expect(report.leaked.filter((label) => label.includes("video"))).toEqual([]);
});

it("fails closed before the test video backend when the manifest omits capture authority", async () => {
  const host = createSynWareTestHost({ app: NoCaptureProbe, document });
  await host.render();
  host.adapters.video.allow();
  host.adapters.permissions.allow();
  host.adapters.policy.allow();

  const session = host.appContext.video.createCaptureSession();
  await expect(session.requestCamera()).rejects.toMatchObject({ name: "SecurityError" });
  await expect(session.requestDisplay()).rejects.toMatchObject({ name: "SecurityError" });
  expect(host.adapters.video.calls()).toEqual([]);
  session.dispose();
  await host.dispose();
});

it("makes useSynWareVideo component-scoped and tears it down on unmount without prompting on mount", async () => {
  let facade: VFXCaptureSession | null = null;
  function Probe() {
    facade = useSynWareVideo();
    return <div>Hook probe</div>;
  }
  const HookProbe = createSynWare({
    manifest: {
      schemaVersion: 1,
      id: "com.syndromatic.video-hook-probe",
      version: "1.0.0",
      title: "Video Hook Probe",
      routes: [{ path: "/video-hook-probe", primary: true }],
      permissions: ["video.capture.camera"],
    },
    root: Probe,
  });

  const host = createSynWareTestHost({ app: HookProbe, document, strictMode: true });
  host.adapters.video.allow();
  host.adapters.permissions.allow();
  host.adapters.policy.allow();
  const rendered = await host.render();
  expect(host.adapters.video.calls()).toEqual([]);
  expect(facade?.state).toBe("idle");
  await facade!.requestCamera();
  expect(host.adapters.video.calls().map((call) => call.operation)).toEqual(["video.camera"]);
  rendered.unmount();
  expect(facade?.state).toBe("unavailable");
  await host.dispose();
});

it("releases an aborted capture lease's host record and quota once without closing its owner", () => {
  const hostDispose = vi.fn();
  const hostSuspend = vi.fn();
  const service = new VideoCaptureService({
    createSession: () => ({
      state: "idle",
      kind: null,
      settings: null,
      capabilities: { camera: false, display: false, deviceEnumeration: false },
      enumerateDevices: async () => [],
      requestCamera: async () => { throw new Error("unused"); },
      requestDisplay: async () => { throw new Error("unused"); },
      suspend: hostSuspend,
      resume: async () => {},
      subscribe: () => () => {},
      dispose: hostDispose,
    }),
  });
  const mount = new AbortController();
  const caller = new AbortController();
  const client = createMountedVideoClient(service, mount.signal, () => [], () => false, "app");
  const first = client.createCaptureSession(caller.signal);
  const siblings = Array.from({ length: 3 }, () => client.createCaptureSession());
  expect(() => client.createCaptureSession()).toThrowError("Mounted resource limit reached.");

  caller.abort(new DOMException("caller cancelled", "AbortError"));
  expect(mount.signal.aborted).toBe(false);
  expect(hostDispose).toHaveBeenCalledTimes(1);
  service.suspendOwner("app");
  expect(hostSuspend).toHaveBeenCalledTimes(3);

  const replacement = client.createCaptureSession();
  expect(() => client.createCaptureSession()).toThrowError("Mounted resource limit reached.");
  first.dispose();
  expect(hostDispose).toHaveBeenCalledTimes(1);

  mount.abort(new DOMException("mount closed", "AbortError"));
  expect(hostDispose).toHaveBeenCalledTimes(5);
  replacement.dispose();
  siblings.forEach((session) => session.dispose());
  expect(hostDispose).toHaveBeenCalledTimes(5);
  service.dispose();
});
