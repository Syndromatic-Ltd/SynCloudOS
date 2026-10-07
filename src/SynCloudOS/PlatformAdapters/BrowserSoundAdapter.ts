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
  RuntimeAudioAdapter,
  RuntimeAudioAdapterActivationClaim,
  RuntimeAudioAdapterDiagnostics,
  RuntimeAudioAdapterFactory,
  RuntimeAudioAdapterLease,
  RuntimeAudioPlayback,
  RuntimeAudioPlaybackCallbacks,
  RuntimeAudioResource,
} from "../HostServices/PlatformAdapterRuntimePorts";

const MAX_SOUND_BYTES = 16 * 1024 * 1024;
const MAX_PENDING_ACTIVATIONS = 128;
const sliceBytes = Uint8Array.prototype.slice;

export interface BrowserSoundBytes {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface BrowserSoundElement {
  src: string;
  preload: string;
  loop: boolean;
  volume: number;
  playbackRate: number;
  currentTime: number;
  readonly duration: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error", listener: () => void): void;
  removeEventListener(type: "ended" | "error", listener: () => void): void;
  clearSource(): void;
}

export interface BrowserSoundPlatform {
  loadBytes(source: string, signal: AbortSignal): Promise<BrowserSoundBytes>;
  createObjectURL(bytes: Uint8Array, mimeType: string): string;
  revokeObjectURL(url: string): void;
  createAudioElement(): BrowserSoundElement;
  randomUUID(): string;
  isUserActive(): boolean;
  expireActivation(callback: () => void): void;
}

type ResourceRecord = {
  readonly facade: RuntimeAudioResource;
  readonly url: string;
  readonly playbacks: Set<RuntimeAudioPlayback>;
  released: boolean;
};

type ActivationRecord = { readonly ownerKey: string; active: boolean };

function abortError(message: string) { return new DOMException(message, "AbortError"); }

function validateBytes(value: BrowserSoundBytes) {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Sound bytes must be a plain data record.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(descriptors).sort().join("\0") !== "bytes\0mimeType") {
    throw new TypeError("Sound bytes have an invalid shape.");
  }
  const bytesDescriptor = descriptors.bytes;
  const mimeDescriptor = descriptors.mimeType;
  if (!bytesDescriptor || !("value" in bytesDescriptor) || !mimeDescriptor || !("value" in mimeDescriptor)) {
    throw new TypeError("Sound byte fields must be data slots.");
  }
  const bytes = bytesDescriptor.value;
  const mimeType = mimeDescriptor.value;
  if (!(bytes instanceof Uint8Array) || Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
    Object.getOwnPropertySymbols(bytes).length > 0 || ["byteLength", "byteOffset", "buffer"].some((key) => Object.prototype.hasOwnProperty.call(bytes, key)) ||
    bytes.byteLength === 0 || bytes.byteLength > MAX_SOUND_BYTES) {
    throw new RangeError("Sound bytes are empty or exceed the supported limit.");
  }
  if (typeof mimeType !== "string" || !/^audio\/[a-z0-9.+-]{1,64}$/i.test(mimeType)) {
    throw new TypeError("Sound MIME type is unsupported.");
  }
  return { bytes: sliceBytes.call(bytes) as Uint8Array, mimeType: mimeType.toLowerCase() };
}

class BrowserSoundAdapter implements RuntimeAudioAdapter {
  readonly #platform: BrowserSoundPlatform;
  readonly #runtimeSignal: AbortSignal;
  readonly #resources = new Map<string, ResourceRecord>();
  readonly #resourceIdentity = new WeakMap<object, ResourceRecord>();
  readonly #playbacks = new Set<RuntimeAudioPlayback>();
  readonly #activations = new WeakMap<object, ActivationRecord>();
  readonly #ownerActivations = new Map<string, ActivationRecord>();
  #listenerCount = 0;
  #activationCount = 0;
  #pendingActivationExpiries = 0;
  #resourceSequence = 0;
  #disposed = false;

  constructor(platform: BrowserSoundPlatform, signal: AbortSignal) {
    this.#platform = platform;
    this.#runtimeSignal = signal;
  }

  #invalidateActivation(record: ActivationRecord) {
    if (!record.active) return;
    record.active = false;
    if (this.#ownerActivations.get(record.ownerKey) === record) this.#ownerActivations.delete(record.ownerKey);
    this.#activationCount = Math.max(0, this.#activationCount - 1);
  }

  claimActivation(ownerKey: string): RuntimeAudioAdapterActivationClaim | null {
    if (this.#disposed || this.#runtimeSignal.aborted || typeof ownerKey !== "string" || ownerKey.length === 0 || ownerKey.length > 1_024) return null;
    const previous = this.#ownerActivations.get(ownerKey);
    try {
      if (!this.#platform.isUserActive()) { if (previous) this.#invalidateActivation(previous); return null; }
    } catch { if (previous) this.#invalidateActivation(previous); return null; }
    if (this.#pendingActivationExpiries >= MAX_PENDING_ACTIVATIONS || (!previous && this.#activationCount >= MAX_PENDING_ACTIVATIONS)) return null;
    if (previous) this.#invalidateActivation(previous);
    const claim = Object.freeze({}) as RuntimeAudioAdapterActivationClaim;
    const record: ActivationRecord = { ownerKey, active: true };
    this.#activations.set(claim, record);
    this.#ownerActivations.set(ownerKey, record);
    this.#activationCount += 1;
    this.#pendingActivationExpiries += 1;
    try {
      this.#platform.expireActivation(() => {
        this.#pendingActivationExpiries = Math.max(0, this.#pendingActivationExpiries - 1);
        this.#invalidateActivation(record);
      });
    } catch {
      this.#pendingActivationExpiries = Math.max(0, this.#pendingActivationExpiries - 1);
      this.#invalidateActivation(record); return null;
    }
    return claim;
  }

  #consumeActivation(claim: RuntimeAudioAdapterActivationClaim | null) {
    if (!claim || typeof claim !== "object") return false;
    const record = this.#activations.get(claim);
    if (!record?.active || this.#ownerActivations.get(record.ownerKey) !== record) return false;
    this.#invalidateActivation(record);
    return true;
  }

  async loadResource(source: string, signal: AbortSignal): Promise<RuntimeAudioResource> {
    if (this.#disposed || this.#runtimeSignal.aborted || signal.aborted) throw signal.reason ?? abortError("Sound adapter disposed.");
    const loaded = validateBytes(await this.#platform.loadBytes(source, signal));
    if (this.#disposed || this.#runtimeSignal.aborted || signal.aborted) throw signal.reason ?? abortError("Sound load aborted.");
    let url: string | null = null;
    try {
      url = this.#platform.createObjectURL(loaded.bytes, loaded.mimeType);
      if (typeof url !== "string" || !url.startsWith("blob:")) throw new TypeError("Sound object URL authority returned an invalid URL.");
      if (this.#disposed || this.#runtimeSignal.aborted || signal.aborted) throw signal.reason ?? abortError("Sound load aborted.");
      const facade = Object.freeze({
        id: `sound-resource:${this.#platform.randomUUID()}:${++this.#resourceSequence}`,
        source,
        byteLength: loaded.bytes.byteLength,
        mimeType: loaded.mimeType,
      });
      const record: ResourceRecord = { facade, url, playbacks: new Set(), released: false };
      this.#resources.set(facade.id, record);
      this.#resourceIdentity.set(facade, record);
      url = null;
      return facade;
    } finally {
      if (url) this.#platform.revokeObjectURL(url);
    }
  }

  releaseResource(resource: RuntimeAudioResource) {
    const record = resource && typeof resource === "object" ? this.#resourceIdentity.get(resource) : undefined;
    if (!record || record.released) return;
    record.released = true;
    for (const playback of [...record.playbacks]) playback.dispose();
    this.#resources.delete(record.facade.id);
    this.#resourceIdentity.delete(resource);
    this.#platform.revokeObjectURL(record.url);
  }

  createPlayback(resource: RuntimeAudioResource, callbacks: RuntimeAudioPlaybackCallbacks): RuntimeAudioPlayback {
    if (this.#disposed || this.#runtimeSignal.aborted) throw abortError("Sound adapter disposed.");
    const record = resource && typeof resource === "object" ? this.#resourceIdentity.get(resource) : undefined;
    if (!record || record.released) throw new TypeError("Sound resource is not owned by this adapter.");
    const element = this.#platform.createAudioElement();
    let disposed = false;
    const thisAdapter = this;
    let activated = false;
    let activeSession: { readonly epoch: number; readonly ended: () => void; readonly error: () => void; endedInstalled: boolean; errorInstalled: boolean; settled: boolean } | null = null;
    let playback!: RuntimeAudioPlayback;
    const detachSession = (session = activeSession) => {
      if (!session) return;
      if (session.endedInstalled) { try { element.removeEventListener("ended", session.ended); } finally { session.endedInstalled = false; this.#listenerCount -= 1; } }
      if (session.errorInstalled) { try { element.removeEventListener("error", session.error); } finally { session.errorInstalled = false; this.#listenerCount -= 1; } }
      if (activeSession === session) activeSession = null;
    };
    const installSession = (epoch: number) => {
      detachSession();
      const session: NonNullable<typeof activeSession> = {
        epoch,
        ended: () => {
          if (disposed || record.released || session.settled) return;
          session.settled = true;
          if (activeSession === session) detachSession(session);
          callbacks.onEnded(epoch);
        },
        error: () => {
          if (disposed || record.released || session.settled) return;
          session.settled = true;
          if (activeSession === session) detachSession(session);
          callbacks.onError(epoch, new Error("Sound playback failed."));
        },
        endedInstalled: false,
        errorInstalled: false,
        settled: false,
      };
      activeSession = session;
      try {
        element.addEventListener("ended", session.ended); session.endedInstalled = true; this.#listenerCount += 1;
        element.addEventListener("error", session.error); session.errorInstalled = true; this.#listenerCount += 1;
        return session;
      } catch (error) {
        detachSession(session);
        throw error;
      }
    };
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      detachSession();
      try { element.pause(); } catch { /* terminal cleanup */ }
      try { element.clearSource(); } catch { /* terminal cleanup */ }
      record.playbacks.delete(playback);
      this.#playbacks.delete(playback);
    };
    try {
      element.preload = "auto";
      element.src = record.url;
      playback = Object.freeze({
        play(claim: RuntimeAudioAdapterActivationClaim | null, epoch: number) {
          if (disposed || record.released) return Promise.reject(abortError("Sound playback released."));
          if (!Number.isSafeInteger(epoch) || epoch < 1) return Promise.reject(new TypeError("Sound play epoch is invalid."));
          if (claim) {
            if (!thisAdapter.#consumeActivation(claim)) return Promise.reject(new DOMException("Sound activation expired.", "NotAllowedError"));
            activated = true;
          } else if (!activated) return Promise.reject(new DOMException("Sound activation is required.", "NotAllowedError"));
          const session = installSession(epoch);
          // This invocation must remain synchronous with the service call.
          try {
            return Promise.resolve(element.play()).catch((error) => { if (activeSession === session) detachSession(session); throw error; });
          } catch (error) {
            detachSession(session);
            throw error;
          }
        },
        pause() { if (!disposed) { detachSession(); element.pause(); } },
        stop() { if (!disposed) { detachSession(); element.pause(); element.currentTime = 0; } },
        setLoop(loop: boolean) { if (!disposed) element.loop = loop; },
        setVolume(volume: number) { if (!disposed) element.volume = volume; },
        setRate(rate: number) { if (!disposed) element.playbackRate = rate; },
        setCurrentTime(time: number) { if (!disposed) element.currentTime = time; },
        duration() { return !disposed && Number.isFinite(element.duration) && element.duration >= 0 ? element.duration : null; },
        currentTime() { return !disposed && Number.isFinite(element.currentTime) && element.currentTime >= 0 ? element.currentTime : 0; },
        dispose: cleanup,
      });
      record.playbacks.add(playback);
      this.#playbacks.add(playback);
      return playback;
    } catch (cause) {
      cleanup();
      throw cause;
    }
  }

  diagnostics(): RuntimeAudioAdapterDiagnostics {
    return Object.freeze({
      resourceCount: this.#resources.size,
      objectURLCount: this.#resources.size,
      playbackCount: this.#playbacks.size,
      listenerCount: this.#listenerCount,
      activationCount: this.#activationCount,
    });
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const activation of this.#ownerActivations.values()) this.#invalidateActivation(activation);
    this.#ownerActivations.clear();
    this.#pendingActivationExpiries = 0;
    for (const record of [...this.#resources.values()]) this.releaseResource(record.facade);
    for (const playback of [...this.#playbacks]) playback.dispose();
  }
}

export class BrowserSoundAdapterFactory implements RuntimeAudioAdapterFactory {
  readonly #platform: BrowserSoundPlatform;
  readonly #leases = new Set<{ adapter: BrowserSoundAdapter; released: boolean; abort: () => void }>();

  constructor(platform: BrowserSoundPlatform) { this.#platform = platform; }

  acquire(_runtimeId: string, signal: AbortSignal): RuntimeAudioAdapterLease {
    if (signal.aborted) throw signal.reason ?? abortError("Sound adapter lease aborted.");
    const adapter = new BrowserSoundAdapter(this.#platform, signal);
    const record = { adapter, released: false, abort: () => release() };
    const release = () => {
      if (record.released) return;
      record.released = true;
      signal.removeEventListener("abort", record.abort);
      adapter.dispose();
      this.#leases.delete(record);
    };
    this.#leases.add(record);
    signal.addEventListener("abort", record.abort, { once: true });
    return Object.freeze({ adapter, release });
  }
}

