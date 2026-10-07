/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  VFXCameraCaptureRequest,
  VFXCaptureSession,
  VFXCaptureSettings,
  VFXDisplayCaptureRequest,
} from "../../../FX/VideoFX/public";
import type { VideoCaptureSessionHost } from "../../HostServices/AppSDKHostServiceTypes";
import type {
  SynWareFakeCall,
  SynWareFakeMode,
  SynWareFakeVideo,
  SynWareFakeVideoOperation,
} from "./testHostTypes";

export interface FakeVideoCaptureBundle {
  readonly host: VideoCaptureSessionHost;
  readonly control: SynWareFakeVideo;
}

function defaultSettings(kind: "camera" | "display"): VFXCaptureSettings {
  return Object.freeze({
    kind,
    deviceId: kind === "camera" ? "fake-camera" : null,
    groupId: kind === "camera" ? "fake-group" : null,
    width: kind === "camera" ? 1280 : 1920,
    height: kind === "camera" ? 720 : 1080,
    frameRate: 30,
    aspectRatio: 16 / 9,
    facingMode: kind === "camera" ? "user" : null,
    displaySurface: kind === "display" ? "monitor" : null,
  });
}

export function createFakeVideoCapture(now: () => number): FakeVideoCaptureBundle {
  let mode: SynWareFakeMode = "deny";
  let denialReason = "This sensitive fake capability requires an explicit test allow().";
  let failure: Error = new Error("The deterministic video capture fake failed.");
  const calls: SynWareFakeCall<SynWareFakeVideoOperation>[] = [];
  let cameraSettings = defaultSettings("camera");
  let displaySettings = defaultSettings("display");

  const run = async <T>(operation: SynWareFakeVideoOperation, signal: AbortSignal | undefined, action: () => T): Promise<T> => {
    signal?.throwIfAborted();
    calls.push(Object.freeze({ operation, at: now() }));
    if (mode === "deny") throw new DOMException(denialReason, "SecurityError");
    if (mode === "fail") throw failure;
    if (mode === "interrupt") throw new DOMException("The deterministic video capture fake was interrupted.", "AbortError");
    return action();
  };

  const control: SynWareFakeVideo = Object.freeze({
    get mode() { return mode; },
    allow() { mode = "allow"; },
    deny(reason = "The deterministic video capture fake denied this operation.") {
      mode = "deny";
      denialReason = reason;
    },
    fail(error = new Error("The deterministic video capture fake failed.")) {
      mode = "fail";
      failure = error;
    },
    interrupt() { mode = "interrupt"; },
    calls: () => Object.freeze([...calls]),
    reset() {
      mode = "deny";
      denialReason = "This sensitive fake capability requires an explicit test allow().";
      failure = new Error("The deterministic video capture fake failed.");
      calls.length = 0;
      cameraSettings = defaultSettings("camera");
      displaySettings = defaultSettings("display");
    },
    setCameraSettings(settings: VFXCaptureSettings) {
      if (settings.kind !== "camera") throw new TypeError("Fake camera settings must describe camera capture.");
      cameraSettings = Object.freeze({ ...settings });
    },
    setDisplaySettings(settings: VFXCaptureSettings) {
      if (settings.kind !== "display") throw new TypeError("Fake display settings must describe display capture.");
      displaySettings = Object.freeze({ ...settings });
    },
  });

  const host: VideoCaptureSessionHost = Object.freeze({
    createSession(signal?: AbortSignal): VFXCaptureSession {
      let state: VFXCaptureSession["state"] = signal?.aborted ? "disposed" : "idle";
      let kind: VFXCaptureSession["kind"] = null;
      let settings: VFXCaptureSettings | null = null;
      const listeners = new Set<() => void>();
      const notify = () => { for (const listener of [...listeners]) listener(); };
      const disposeState = () => {
        state = "disposed";
        kind = null;
        settings = null;
        listeners.clear();
      };
      const abort = () => disposeState();
      signal?.addEventListener("abort", abort, { once: true });

      return Object.freeze({
        get state() { return state; },
        get kind() { return kind; },
        get settings() { return settings; },
        capabilities: Object.freeze({ camera: true, display: true, deviceEnumeration: true }),
        enumerateDevices: () => run("video.enumerate", signal, () => Object.freeze([Object.freeze({
          id: cameraSettings.deviceId ?? "fake-camera",
          groupId: cameraSettings.groupId,
          kind: "camera" as const,
          label: "Deterministic camera",
        })])),
        async requestCamera(request: VFXCameraCaptureRequest = {}) {
          const selected = await run("video.camera", request.signal ?? signal, () => cameraSettings);
          state = "active";
          kind = "camera";
          settings = selected;
          notify();
          return selected;
        },
        async requestDisplay(request: VFXDisplayCaptureRequest = {}) {
          const selected = await run("video.display", request.signal ?? signal, () => displaySettings);
          state = "active";
          kind = "display";
          settings = selected;
          notify();
          return selected;
        },
        suspend() {
          if (state !== "active") return;
          state = "suspended";
          notify();
        },
        async resume() {
          if (state !== "suspended") return;
          state = "active";
          notify();
        },
        subscribe(listener: () => void) {
          if (state === "disposed") throw new DOMException("The deterministic video capture session is disposed.", "AbortError");
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        dispose() {
          signal?.removeEventListener("abort", abort);
          disposeState();
        },
      });
    },
  });

  return Object.freeze({ host, control });
}
