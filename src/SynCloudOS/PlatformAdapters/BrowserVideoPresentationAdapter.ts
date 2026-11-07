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

import type { VFXPictureInPictureController, VFXVideoPresentationCapabilities, VFXPresentationAuthorizationStatus } from "../../FX/VideoFX/VFXPictureInPictureController";
import type { VFXRouteDetector, VFXRouteConnectionState } from "../../FX/VideoFX/VFXRouteDetector";
import type { VFXContentFilter } from "../../FX/VideoFX/VFXContentFilter";
export interface BrowserVideoPresentationDocument {
  readonly pictureInPictureEnabled?: boolean;
  readonly pictureInPictureElement?: Element | null;
  exitPictureInPicture?(): Promise<void>;
}
export interface BrowserElementCapturePlatform {
  readonly RestrictionTarget?: { fromElement(element: Element): Promise<unknown> };
  readonly CropTarget?: { fromElement(element: Element): Promise<unknown> };
}
export interface BrowserElementCaptureTrack {
  readonly readyState: string;
  restrictTo?(target: unknown | null): Promise<void>;
  cropTo?(target: unknown | null): Promise<void>;
}
const unsupported = () => new DOMException("Video presentation API is unavailable.", "NotSupportedError");
const invalid = () => new DOMException("Video presentation owner is no longer active.", "InvalidStateError");
const denied = () => new DOMException("Video presentation is not authorised.", "SecurityError");
export class BrowserVideoPresentationAdapter {
  readonly #pipOwners = new WeakMap<HTMLVideoElement, object>();
  constructor(private readonly document: BrowserVideoPresentationDocument | null, private readonly elementCapture: BrowserElementCapturePlatform = {}) {}
  capabilities(target: HTMLVideoElement): VFXVideoPresentationCapabilities {
    return Object.freeze({ pictureInPicture: !!this.document?.pictureInPictureEnabled && !!this.document.exitPictureInPicture && typeof target.requestPictureInPicture === "function" && !target.disablePictureInPicture,
      remotePlayback: !!target.remote && !target.disableRemotePlayback && typeof target.remote.watchAvailability === "function" && typeof target.remote.prompt === "function" });
  }
  createPictureInPictureController(target: HTMLVideoElement, signal: AbortSignal, authorise: () => boolean, onDispose?: () => void): VFXPictureInPictureController {
    let disposed = false;
    let pending = false;
    const token = {};
    const listeners = new Set<() => void>();
    const allowed = () => !disposed && !signal.aborted && authorise();
    const authorizationStatus = (): VFXPresentationAuthorizationStatus => !allowed() ? "denied" : this.capabilities(target).pictureInPicture ? "granted" : "unavailable";
    const requireAccess = () => { signal.throwIfAborted(); if (disposed) throw invalid(); if (!authorise()) { dispose(); throw denied(); } };
    const stop = async () => {
      if (this.#pipOwners.get(target) !== token) return;
      if (this.document?.pictureInPictureElement === target) await this.document.exitPictureInPicture?.();
      if (!pending && this.#pipOwners.get(target) === token) this.#pipOwners.delete(target);
    };
    const notify = () => { if (!allowed()) { dispose(); return; } for (const listener of listeners) listener(); };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      signal.removeEventListener("abort", dispose);
      target.removeEventListener("enterpictureinpicture", notify);
      target.removeEventListener("leavepictureinpicture", notify);
      listeners.clear();
      void stop().catch(() => undefined);
      onDispose?.();
    };
    signal.addEventListener("abort", dispose, { once: true });
    target.addEventListener("enterpictureinpicture", notify);
    target.addEventListener("leavepictureinpicture", notify);
    if (signal.aborted) dispose();
    const adapter = this;
    return Object.freeze({
      get capabilities() { return Object.freeze({ pictureInPicture: allowed() && adapter.capabilities(target).pictureInPicture }); },
      get isPictureInPictureActive() { return allowed() && adapter.#pipOwners.get(target) === token && adapter.document?.pictureInPictureElement === target; },
      authorizationStatus, requestAuthorization: authorizationStatus,
      async startPictureInPicture() {
        requireAccess();
        if (!adapter.capabilities(target).pictureInPicture) throw unsupported();
        if (pending || (adapter.#pipOwners.has(target) && adapter.#pipOwners.get(target) !== token)) throw invalid();
        if (adapter.document?.pictureInPictureElement === target && adapter.#pipOwners.get(target) !== token) throw invalid();
        adapter.#pipOwners.set(target, token);
        pending = true;
        try {
          await target.requestPictureInPicture();
          pending = false;
          if (!allowed()) { await stop(); requireAccess(); }
          notify();
        } catch (error) {
          pending = false;
          if (adapter.document?.pictureInPictureElement !== target && adapter.#pipOwners.get(target) === token) adapter.#pipOwners.delete(target);
          throw error;
        }
      },
      stopPictureInPicture: stop,
      subscribe(listener: () => void) { requireAccess(); listeners.add(listener); return () => { listeners.delete(listener); }; },
      dispose,
    });
  }
  createRouteDetector(target: HTMLVideoElement, signal: AbortSignal, authorise: () => boolean, onDispose?: () => void): VFXRouteDetector {
    let disposed = false;
    let generation = 0;
    let watching = false;
    let watchId: number | undefined;
    let available: boolean | null = null;
    let state: VFXRouteConnectionState = "unknown";
    const listeners = new Set<() => void>();
    const remote = target.remote;
    const allowed = () => !disposed && !signal.aborted && authorise();
    const requireAccess = () => { signal.throwIfAborted(); if (disposed) throw invalid(); if (!authorise()) { dispose(); throw denied(); } };
    const publish = () => {
      for (const listener of [...listeners]) {
        try { listener(); } catch { /* An observer cannot retain browser resources. */ }
      }
    };
    const notify = () => { if (!allowed()) { dispose(); return; } publish(); };
    const stopDiscovery = () => {
      generation++; watching = false;
      if (watchId !== undefined) { void remote.cancelWatchAvailability(watchId).catch(() => undefined); watchId = undefined; }
      available = null; state = "unknown";
      remote?.removeEventListener("connecting", update);
      remote?.removeEventListener("connect", update);
      remote?.removeEventListener("disconnect", update);
      publish();
    };
    const update = () => { if (!allowed()) { dispose(); return; } state = remote.state; notify(); };
    const dispose = () => { if (disposed) return; disposed = true; stopDiscovery(); listeners.clear(); signal.removeEventListener("abort", dispose); onDispose?.(); };
    const authorizationStatus = (): VFXPresentationAuthorizationStatus => !allowed() ? "denied" : this.capabilities(target).remotePlayback ? "granted" : "unavailable";
    signal.addEventListener("abort", dispose, { once: true });
    if (signal.aborted) dispose();
    const adapter = this;
    return Object.freeze({
      get capabilities() { return Object.freeze({ remotePlayback: allowed() && adapter.capabilities(target).remotePlayback }); },
      get areRoutesAvailable() { return allowed() ? available : null; },
      get connectionState() { return allowed() ? state : "unknown"; },
      authorizationStatus, requestAuthorization: authorizationStatus,
      async startDiscovery() {
        requireAccess();
        if (!adapter.capabilities(target).remotePlayback) throw unsupported();
        if (watching) return;
        watching = true;
        const current = ++generation;
        remote.addEventListener("connecting", update);
        remote.addEventListener("connect", update);
        remote.addEventListener("disconnect", update);
        try {
          const id = await remote.watchAvailability(value => {
            if (current !== generation) return;
            if (!allowed()) { dispose(); return; }
            available = value; state = remote.state; notify();
          });
          if (current !== generation || !allowed()) {
            await remote.cancelWatchAvailability(id);
            requireAccess(); throw invalid();
          }
          watchId = id;
        } catch (error) { if (current === generation) stopDiscovery(); throw error; }
      },
      stopDiscovery,
      async prompt() { requireAccess(); if (!adapter.capabilities(target).remotePlayback) throw unsupported(); await remote.prompt(); requireAccess(); },
      subscribe(listener: () => void) { requireAccess(); listeners.add(listener); return () => { listeners.delete(listener); }; },
      dispose,
    });
  }
  /** Before a display grant this reports target factories only, never track compatibility. */
  elementCaptureCapabilities(track?: BrowserElementCaptureTrack): Readonly<{ restriction: boolean; crop: boolean }> {
    return Object.freeze({
      restriction: typeof this.elementCapture.RestrictionTarget?.fromElement === "function" && (!track || (track.readyState === "live" && typeof track.restrictTo === "function")),
      crop: typeof this.elementCapture.CropTarget?.fromElement === "function" && (!track || (track.readyState === "live" && typeof track.cropTo === "function")),
    });
  }
  /** Host only: caller supplies the private session-owned display track. */
  async applyContentFilter(track: BrowserElementCaptureTrack, filter: VFXContentFilter | null, signal: AbortSignal, reauthorise: () => boolean = () => true): Promise<void> {
    signal.throwIfAborted();
    if (!reauthorise()) throw denied();
    if (track.readyState !== "live") throw invalid();
    if (filter === null) {
      if (!track.restrictTo && !track.cropTo) throw unsupported();
      if (track.restrictTo) await track.restrictTo(null);
      if (track.cropTo) await track.cropTo(null);
    } else {
      const factory = filter.mode === "restrict" ? this.elementCapture.RestrictionTarget : this.elementCapture.CropTarget;
      const apply = filter.mode === "restrict" ? track.restrictTo : track.cropTo;
      if (!factory || !apply) throw unsupported();
      const target = await factory.fromElement(filter.element);
      signal.throwIfAborted(); if (!reauthorise()) throw denied(); if (track.readyState !== "live") throw invalid();
      await apply.call(track, target);
    }
    signal.throwIfAborted(); if (!reauthorise()) throw denied();
  }
}
