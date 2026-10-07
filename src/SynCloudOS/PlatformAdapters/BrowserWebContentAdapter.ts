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
  RuntimeWebContentAdapter, RuntimeWebContentAdapterFactory, RuntimeWebContentAdapterLease,
  RuntimeWebContentAdapterMessage, RuntimeWebContentAdapterPrepareRequest, RuntimeWebContentPreparedNavigation,
} from "../WebContent/webContentTypes";

const abortError = (message: string) => new DOMException(message, "AbortError");
const maximumDocumentBytes = 512 * 1024;

export interface BrowserWebContentPlatform {
  createObjectURL(document: string): string;
  revokeObjectURL(url: string): void;
  frameWindow(frame: object): object | null;
  postMessage(frame: object, message: unknown, targetOrigin: string): void;
  openExternal(url: string): boolean;
  subscribeMessages(listener: (message: RuntimeWebContentAdapterMessage) => void): () => void;
  randomUUID(): string;
}

class BrowserWebContentAdapter implements RuntimeWebContentAdapter {
  readonly #platform: BrowserWebContentPlatform;
  readonly #runtimeSignal: AbortSignal;
  readonly #navigations = new Map<string, RuntimeWebContentPreparedNavigation>();
  readonly #navigationIdentity = new WeakMap<object, RuntimeWebContentPreparedNavigation>();
  readonly #frames = new Map<string, { epoch: number; frame: object }>();
  readonly #unsubscribers = new Set<() => void>();
  #disposed = false;
  #sequence = 0;

  constructor(platform: BrowserWebContentPlatform, signal: AbortSignal) {
    this.#platform = platform; this.#runtimeSignal = signal;
  }

  issueToken() {
    const token = `${this.#platform.randomUUID()}${this.#platform.randomUUID()}`.replaceAll("-", "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new DOMException("Secure web content tokens are unavailable.", "NotSupportedError");
    return token;
  }

  async prepare(request: RuntimeWebContentAdapterPrepareRequest, signal: AbortSignal): Promise<RuntimeWebContentPreparedNavigation> {
    if (this.#disposed || this.#runtimeSignal.aborted || signal.aborted) throw signal.reason ?? abortError("Web content adapter is disposed.");
    let frameSource: string; let objectURL = false;
    if (request.source.kind === "html") {
      if (typeof request.sanitisedHTML !== "string" || request.sanitisedHTML.length === 0 ||
        new TextEncoder().encode(request.sanitisedHTML).byteLength > maximumDocumentBytes) {
        throw new TypeError("Sanitised web content document is invalid.");
      }
      frameSource = this.#platform.createObjectURL(request.sanitisedHTML); objectURL = true;
    } else frameSource = request.source.url;
    try {
      signal.throwIfAborted();
      if (this.#disposed || this.#runtimeSignal.aborted) throw this.#runtimeSignal.reason ?? abortError("Web content adapter is disposed.");
      const allowSameOrigin = request.sandbox.split(/\s+/).includes("allow-same-origin");
      const expectedOrigin = request.source.kind === "url" && allowSameOrigin ? new URL(request.source.url).origin : "null";
      const prepared = Object.freeze({ id: `web-navigation:${this.#platform.randomUUID()}:${++this.#sequence}`,
        sessionId: request.sessionId, navigationEpoch: request.navigationEpoch, frameSource, expectedOrigin, objectURL });
      this.#navigations.set(prepared.id, prepared); this.#navigationIdentity.set(prepared, prepared); objectURL = false;
      return prepared;
    } finally {
      if (objectURL) this.#platform.revokeObjectURL(frameSource!);
    }
  }

  releaseNavigation(value: unknown) {
    const navigation = value && typeof value === "object" ? this.#navigationIdentity.get(value) : undefined;
    if (!navigation || this.#navigations.get(navigation.id) !== navigation) return;
    this.#navigations.delete(navigation.id); this.#navigationIdentity.delete(navigation);
    if (navigation.objectURL) this.#platform.revokeObjectURL(navigation.frameSource);
    const frame = this.#frames.get(navigation.sessionId);
    if (frame?.epoch === navigation.navigationEpoch) this.#frames.delete(navigation.sessionId);
  }

  ownsNavigation(value: unknown) {
    return Boolean(value && typeof value === "object" && this.#navigationIdentity.get(value) === value &&
      this.#navigations.get((value as RuntimeWebContentPreparedNavigation).id) === value);
  }

  bindFrame(sessionId: string, navigationEpoch: number, frame: object | null) {
    if (this.#disposed) return;
    if (frame === null) { this.#frames.delete(sessionId); return; }
    if (!this.#navigationsHas(sessionId, navigationEpoch) || !this.#platform.frameWindow(frame)) throw new TypeError("Web content frame is invalid or stale.");
    this.#frames.set(sessionId, { epoch: navigationEpoch, frame });
  }

  #navigationsHas(sessionId: string, epoch: number) {
    for (const navigation of this.#navigations.values()) if (navigation.sessionId === sessionId && navigation.navigationEpoch === epoch) return true;
    return false;
  }

  ownsMessage(sessionId: string, navigationEpoch: number, source: unknown) {
    const frame = this.#frames.get(sessionId);
    return Boolean(frame && frame.epoch === navigationEpoch && source !== null && this.#platform.frameWindow(frame.frame) === source);
  }

  postMessage(sessionId: string, navigationEpoch: number, message: unknown, targetOrigin: string) {
    if (this.#disposed || targetOrigin === "*" || targetOrigin === "null") throw new DOMException("Web content message target is not authorised.", "SecurityError");
    const frame = this.#frames.get(sessionId);
    if (!frame || frame.epoch !== navigationEpoch) throw abortError("Web content frame is stale.");
    this.#platform.postMessage(frame.frame, message, targetOrigin);
  }

  openExternal(url: string) { return !this.#disposed && this.#platform.openExternal(url); }

  subscribeMessages(listener: (message: RuntimeWebContentAdapterMessage) => void) {
    if (this.#disposed) return () => undefined;
    const unsubscribe = this.#platform.subscribeMessages(listener); let active = true;
    const release = () => { if (!active) return; active = false; this.#unsubscribers.delete(release); unsubscribe(); };
    this.#unsubscribers.add(release); return release;
  }

  diagnostics() { return Object.freeze({ listenerCount: this.#unsubscribers.size,
    objectURLCount: [...this.#navigations.values()].filter((navigation) => navigation.objectURL).length,
    frameCount: this.#frames.size }); }

  dispose() {
    if (this.#disposed) return; this.#disposed = true;
    for (const unsubscribe of [...this.#unsubscribers].reverse()) unsubscribe();
    this.#frames.clear();
    for (const navigation of [...this.#navigations.values()].reverse()) this.releaseNavigation(navigation);
  }
}

export class BrowserWebContentAdapterFactory implements RuntimeWebContentAdapterFactory {
  readonly #platform: BrowserWebContentPlatform;
  readonly #leases = new Set<{ adapter: BrowserWebContentAdapter; release: () => void }>();
  constructor(platform: BrowserWebContentPlatform) { this.#platform = platform; }
  acquire(_runtimeId: string, signal: AbortSignal): RuntimeWebContentAdapterLease {
    if (signal.aborted) throw signal.reason ?? abortError("Web content adapter lease aborted.");
    const adapter = new BrowserWebContentAdapter(this.#platform, signal); let active = true;
    const abort = () => release();
    const release = () => {
      if (!active) return; active = false; signal.removeEventListener("abort", abort); adapter.dispose();
      for (const lease of this.#leases) if (lease.adapter === adapter) { this.#leases.delete(lease); break; }
    };
    const lease = { adapter, release }; this.#leases.add(lease); signal.addEventListener("abort", abort, { once: true });
    return Object.freeze(lease);
  }
}
