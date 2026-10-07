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

import type {
  VFXCameraCaptureRequest,
  VFXCaptureCapabilities,
  VFXCaptureDevice,
  VFXCaptureKind,
  VFXCaptureSession,
  VFXCaptureSettings,
  VFXCaptureState,
  VFXDisplayCaptureRequest,
} from "../../FX/VideoFX/VFXCaptureSession";

export interface BrowserVideoCapturePlatform {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia?(constraints: DisplayMediaStreamOptions): Promise<MediaStream>;
  enumerateDevices(): Promise<readonly {
    readonly deviceId: string;
    readonly groupId: string;
    readonly kind: string;
    readonly label: string;
  }[]>;
  getPermissionState?(kind: VFXCaptureKind): Promise<PermissionState>;
  subscribePermissionChange?(kind: VFXCaptureKind, listener: (state: PermissionState) => void): () => void;
  subscribeDeviceChange(listener: () => void): () => void;
}

function abortError(message = "Video capture operation cancelled."): DOMException {
  return new DOMException(message, "AbortError");
}

function unsupported(message: string): DOMException {
  return new DOMException(message, "NotSupportedError");
}

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

function finitePositive(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a finite positive number.`);
  return value;
}

function cleanIdentifier(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  const candidate = value.trim();
  if (!candidate || candidate.length > 1024 || /[\u0000-\u001f]/u.test(candidate))
    throw new TypeError(`${label} is invalid.`);
  return candidate;
}

function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* Continue releasing every acquired track. */ }
  }
}

function projectSettings(kind: VFXCaptureKind, track: MediaStreamTrack): VFXCaptureSettings {
  const settings = track.getSettings();
  const finiteOrNull = (value: number | undefined) => Number.isFinite(value) ? value! : null;
  return Object.freeze({
    kind,
    deviceId: typeof settings.deviceId === "string" && settings.deviceId ? settings.deviceId : null,
    groupId: typeof settings.groupId === "string" && settings.groupId ? settings.groupId : null,
    width: finiteOrNull(settings.width),
    height: finiteOrNull(settings.height),
    frameRate: finiteOrNull(settings.frameRate),
    aspectRatio: finiteOrNull(settings.aspectRatio),
    facingMode: typeof settings.facingMode === "string" && settings.facingMode ? settings.facingMode : null,
    displaySurface: typeof settings.displaySurface === "string" && settings.displaySurface ? settings.displaySurface : null,
  });
}

function cameraConstraints(request: VFXCameraCaptureRequest): MediaStreamConstraints {
  const deviceId = cleanIdentifier(request.deviceId, "Video device ID");
  const width = finitePositive(request.width, "Video width");
  const height = finitePositive(request.height, "Video height");
  const frameRate = finitePositive(request.frameRate, "Video frame rate");
  if (deviceId === undefined && width === undefined && height === undefined && frameRate === undefined)
    return { audio: false, video: true };
  return {
    audio: false,
    video: {
      ...(deviceId === undefined ? {} : { deviceId: { exact: deviceId } }),
      ...(width === undefined ? {} : { width: { ideal: width } }),
      ...(height === undefined ? {} : { height: { ideal: height } }),
      ...(frameRate === undefined ? {} : { frameRate: { ideal: frameRate } }),
    },
  };
}

function displayConstraints(request: VFXDisplayCaptureRequest): DisplayMediaStreamOptions {
  const width = finitePositive(request.width, "Display width");
  const height = finitePositive(request.height, "Display height");
  const frameRate = finitePositive(request.frameRate, "Display frame rate");
  const video = width === undefined && height === undefined && frameRate === undefined
    ? true
    : {
        ...(width === undefined ? {} : { width: { ideal: width } }),
        ...(height === undefined ? {} : { height: { ideal: height } }),
        ...(frameRate === undefined ? {} : { frameRate: { ideal: frameRate } }),
      };
  return { audio: false, video };
}

class BrowserVFXCaptureSession implements VFXCaptureSession {
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Set<AbortController>();
  readonly #platform: BrowserVideoCapturePlatform | null;
  #removeOwnerAbort: (() => void) | null = null;
  #removeDeviceChange: (() => void) | null = null;
  #removePermissionChange: (() => void) | null = null;
  #trackRemovers: (() => void)[] = [];
  #stream: MediaStream | null = null;
  #state: VFXCaptureState;
  #kind: VFXCaptureKind | null = null;
  #settings: VFXCaptureSettings | null = null;
  #generation = 0;
  #resumeEnabled = new Map<MediaStreamTrack, boolean>();

  constructor(platform: BrowserVideoCapturePlatform | null, ownerSignal?: AbortSignal) {
    this.#platform = platform;
    this.#state = platform ? "idle" : "unavailable";
    if (ownerSignal?.aborted) {
      this.#state = "disposed";
      return;
    }
    if (ownerSignal) {
      const abort = () => this.dispose();
      ownerSignal.addEventListener("abort", abort, { once: true });
      this.#removeOwnerAbort = () => ownerSignal.removeEventListener("abort", abort);
    }
    this.#removeDeviceChange = platform?.subscribeDeviceChange(() => {
      if (this.#state !== "active" && this.#state !== "suspended") return;
      if (this.#kind !== "camera" || !this.#settings?.deviceId) return;
      const generation = this.#generation;
      void platform.enumerateDevices().then((devices) => {
        if (generation !== this.#generation || this.state === "disposed") return;
        if (!devices.some((device) => device.kind === "videoinput" && device.deviceId === this.#settings?.deviceId))
          this.interrupt("The selected video device was removed.");
      }).catch(() => undefined);
    }) ?? null;
  }

  get state(): VFXCaptureState { return this.#state; }
  get kind(): VFXCaptureKind | null { return this.#kind; }
  get settings(): VFXCaptureSettings | null { return this.#settings; }
  get capabilities(): VFXCaptureCapabilities {
    return Object.freeze({
      camera: this.#platform !== null && this.#state !== "disposed",
      display: !!this.#platform?.getDisplayMedia && this.#state !== "disposed",
      deviceEnumeration: this.#platform !== null && this.#state !== "disposed",
    });
  }

  subscribe(listener: () => void): () => void {
    if (this.#state === "disposed") throw invalidState("Video capture session is disposed.");
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch { /* Observer failure cannot retain capture authority. */ }
    }
  }

  async enumerateDevices(): Promise<readonly VFXCaptureDevice[]> {
    if (this.#state === "disposed") throw invalidState("Video capture session is disposed.");
    if (!this.#platform) throw unsupported("Video capture is unavailable on this host.");
    const devices = await this.#platform.enumerateDevices();
    if (this.state === "disposed") throw abortError();
    return Object.freeze(devices
      .filter((device) => device.kind === "videoinput")
      .map((device) => Object.freeze({
        id: device.deviceId,
        groupId: device.groupId || null,
        kind: "camera" as const,
        label: device.label || null,
      })));
  }

  requestCamera(request: VFXCameraCaptureRequest = {}): Promise<VFXCaptureSettings> {
    return this.#acquire("camera", request.signal, () => {
      if (!this.#platform) throw unsupported("Camera capture is unavailable on this host.");
      return this.#platform.getUserMedia(cameraConstraints(request));
    });
  }

  requestDisplay(request: VFXDisplayCaptureRequest = {}): Promise<VFXCaptureSettings> {
    return this.#acquire("display", request.signal, () => {
      const getDisplayMedia = this.#platform?.getDisplayMedia;
      if (!getDisplayMedia) throw unsupported("Display capture is unavailable on this host.");
      return getDisplayMedia(displayConstraints(request));
    });
  }

  async #acquire(kind: VFXCaptureKind, callerSignal: AbortSignal | undefined, acquire: () => Promise<MediaStream>): Promise<VFXCaptureSettings> {
    if (this.#state === "disposed") throw invalidState("Video capture session is disposed.");
    if (!this.#platform) throw unsupported("Video capture is unavailable on this host.");
    callerSignal?.throwIfAborted();
    if (this.#state === "requesting" || this.#state === "active" || this.#state === "suspended")
      throw invalidState("Video capture session already owns a capture resource.");

    const generation = ++this.#generation;
    for (const pending of this.#pending) pending.abort(abortError("Video capture request superseded."));
    const controller = new AbortController();
    this.#pending.add(controller);
    const abortCaller = () => controller.abort(callerSignal?.reason ?? abortError());
    callerSignal?.addEventListener("abort", abortCaller, { once: true });
    this.#state = "requesting";
    this.#kind = kind;
    this.#settings = null;
    this.#notify();

    let incoming: MediaStream | null = null;
    let adopted = false;
    try {
      incoming = await new Promise<MediaStream>((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          reject(controller.signal.reason instanceof Error ? controller.signal.reason : abortError());
        };
        controller.signal.addEventListener("abort", onAbort, { once: true });
        let operation: Promise<MediaStream>;
        try { operation = acquire(); }
        catch (error) {
          controller.signal.removeEventListener("abort", onAbort);
          settled = true;
          reject(error);
          return;
        }
        operation.then((stream) => {
          controller.signal.removeEventListener("abort", onAbort);
          if (settled || controller.signal.aborted || generation !== this.#generation || this.state === "disposed") {
            stopStream(stream);
            if (!settled) reject(abortError());
            return;
          }
          settled = true;
          resolve(stream);
        }, (error) => {
          controller.signal.removeEventListener("abort", onAbort);
          if (settled) return;
          settled = true;
          reject(error);
        });
      });

      if (controller.signal.aborted || generation !== this.#generation || this.state === "disposed") {
        stopStream(incoming);
        throw abortError();
      }

      const tracks = incoming.getVideoTracks();
      const selected = tracks[0];
      if (!selected) {
        stopStream(incoming);
        incoming = null;
        throw new DOMException("Video capture produced no video track.", "NotFoundError");
      }
      const settings = projectSettings(kind, selected);
      this.#stream = incoming;
      adopted = true;
      this.#settings = settings;
      this.#resumeEnabled.clear();
      for (const track of tracks) {
        const ended = () => this.interrupt("Video capture track ended.");
        track.addEventListener("ended", ended, { once: true });
        this.#trackRemovers.push(() => track.removeEventListener("ended", ended));
        this.#resumeEnabled.set(track, track.enabled !== false);
      }
      this.#removePermissionChange?.();
      this.#removePermissionChange = this.#platform.subscribePermissionChange?.(kind, (state) => {
        if (state === "denied") this.interrupt("Video capture permission was revoked.");
      }) ?? null;
      this.#state = "active";
      this.#notify();
      return settings;
    } catch (error) {
      if (!adopted && incoming) stopStream(incoming);
      if (generation === this.#generation && this.state !== "disposed" && this.state !== "interrupted") {
        const name = error instanceof DOMException ? error.name : "";
        this.#state = name === "NotAllowedError" || name === "SecurityError" ? "denied"
          : name === "AbortError" ? "idle"
          : "failed";
        this.#kind = null;
        this.#settings = null;
        this.#notify();
      }
      throw error;
    } finally {
      callerSignal?.removeEventListener("abort", abortCaller);
      this.#pending.delete(controller);
    }
  }

  suspend(): void {
    if (this.#state !== "active" || !this.#stream) return;
    for (const track of this.#stream.getVideoTracks()) {
      this.#resumeEnabled.set(track, track.enabled !== false);
      try { track.enabled = false; } catch { /* Track state remains host-authoritative. */ }
    }
    this.#state = "suspended";
    this.#notify();
  }

  async resume(): Promise<void> {
    if (this.#state !== "suspended" || !this.#stream || !this.#kind) return;
    const permission = await this.#platform?.getPermissionState?.(this.#kind);
    if (permission === "denied") {
      this.interrupt("Video capture permission was revoked.");
      return;
    }
    if (this.#state !== "suspended") return;
    for (const track of this.#stream.getVideoTracks()) {
      try { track.enabled = this.#resumeEnabled.get(track) ?? true; } catch { /* Continue restoring sibling tracks. */ }
    }
    this.#state = "active";
    this.#notify();
  }

  private releaseCapture(): void {
    this.#removePermissionChange?.();
    this.#removePermissionChange = null;
    for (const remove of this.#trackRemovers.splice(0)) {
      try { remove(); } catch { /* Continue listener cleanup. */ }
    }
    const stream = this.#stream;
    this.#stream = null;
    this.#settings = null;
    this.#kind = null;
    this.#resumeEnabled.clear();
    stopStream(stream);
  }

  private interrupt(_reason: string): void {
    if (this.#state === "disposed" || this.#state === "interrupted") return;
    ++this.#generation;
    for (const pending of this.#pending) pending.abort(abortError("Video capture was interrupted."));
    this.releaseCapture();
    this.#state = "interrupted";
    this.#notify();
  }

  dispose(): void {
    if (this.#state === "disposed") return;
    ++this.#generation;
    for (const pending of this.#pending) pending.abort(abortError("Video capture session was disposed."));
    this.#pending.clear();
    this.releaseCapture();
    this.#removeDeviceChange?.();
    this.#removeDeviceChange = null;
    this.#removeOwnerAbort?.();
    this.#removeOwnerAbort = null;
    this.#listeners.clear();
    this.#state = "disposed";
  }
}

export class BrowserVideoCaptureAdapter {
  constructor(private readonly platform: BrowserVideoCapturePlatform | null) {}

  createSession(signal?: AbortSignal): VFXCaptureSession {
    return new BrowserVFXCaptureSession(this.platform, signal);
  }
}

function permissionName(kind: VFXCaptureKind): PermissionName | null {
  if (kind === "camera") return "camera" as PermissionName;
  return null;
}

export function createBrowserVideoCapturePlatform(
  browserNavigator: Navigator,
): BrowserVideoCapturePlatform | null {
  const mediaDevices = browserNavigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") return null;
  return {
    getUserMedia: (constraints) => mediaDevices.getUserMedia(constraints),
    ...(typeof mediaDevices.getDisplayMedia === "function"
      ? { getDisplayMedia: (constraints: DisplayMediaStreamOptions) => mediaDevices.getDisplayMedia(constraints) }
      : {}),
    enumerateDevices: () => mediaDevices.enumerateDevices(),
    subscribeDeviceChange(listener) {
      mediaDevices.addEventListener("devicechange", listener);
      return () => mediaDevices.removeEventListener("devicechange", listener);
    },
    async getPermissionState(kind) {
      const name = permissionName(kind);
      if (!name || !browserNavigator.permissions?.query) return "prompt";
      try {
        const status = await browserNavigator.permissions.query({ name } as PermissionDescriptor);
        return status.state;
      } catch {
        return "prompt";
      }
    },
    subscribePermissionChange(kind, listener) {
      const name = permissionName(kind);
      if (!name || !browserNavigator.permissions?.query) return () => undefined;
      let active = true;
      let status: PermissionStatus | null = null;
      const changed = () => { if (active && status) listener(status.state); };
      void browserNavigator.permissions.query({ name } as PermissionDescriptor).then((next) => {
        if (!active) return;
        status = next;
        status.addEventListener("change", changed);
      }).catch(() => undefined);
      return () => {
        active = false;
        status?.removeEventListener("change", changed);
        status = null;
      };
    },
  };
}
