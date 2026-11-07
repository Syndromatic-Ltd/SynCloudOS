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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type {
  VFXCameraCaptureRequest,
  VFXCaptureKind,
  VFXCaptureSession,
  VFXDecoderSession,
  VFXDisplayCaptureRequest,
  VFXEncoderSession,
  VFXFrameProcessorSession,
  VFXMountedDecoderOptions,
  VFXMountedEncoderOptions,
  VFXMountedFrameProcessorOptions,
  VFXVideoClient,
} from "../../FX/VideoFX/VFXCaptureSession";
import { VFXCodecCapabilities, type VFXCodecCapabilityProbe, type VFXDecoderCapability, type VFXDecoderConfigInput } from "../../FX/VideoFX/VFXCodecCapabilities";
import { VFXDecoder, type VFXDecoderBackend } from "../../FX/VideoFX/VFXDecoder";
import {
  VFXEncoder,
  VFXEncoderCapabilities,
  type VFXEncoderBackend,
  type VFXEncoderCapability,
  type VFXEncoderCapabilityProbe,
  type VFXEncoderConfigInput,
} from "../../FX/VideoFX/VFXEncoder";
import { VFXFrameProcessor } from "../../FX/VideoFX/VFXFrameProcessor";
import type { IFXRenderBackend } from "../../FX/ImageFX/IFXRenderBackend";

export interface VideoCaptureSessionHost {
  createSession(signal?: AbortSignal, capability?: object): VFXCaptureSession;
}

export interface VideoDecoderBackendHost {
  createBackend(options?: Pick<VFXMountedDecoderOptions, "outputStorage">): VFXDecoderBackend & VFXCodecCapabilityProbe;
}

export interface VideoEncoderBackendHost {
  createBackend(): VFXEncoderBackend & VFXEncoderCapabilityProbe;
}

export interface VideoFrameProcessorBackendHost {
  createBackend(ownerId: string): IFXRenderBackend | null;
}

const unavailableVideoCaptureHost: VideoCaptureSessionHost = Object.freeze({
  createSession(signal?: AbortSignal): VFXCaptureSession {
    let disposed = signal?.aborted === true;
    const listeners = new Set<() => void>();
    const onAbort = () => { disposed = true; listeners.clear(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const unsupported = () => Promise.reject(new DOMException("Video capture is unavailable on this host.", "NotSupportedError"));
    return Object.freeze({
      get state() { return disposed ? "disposed" as const : "unavailable" as const; },
      kind: null,
      settings: null,
      capabilities: Object.freeze({ camera: false, display: false, deviceEnumeration: false }),
      enumerateDevices: async () => Object.freeze([]),
      requestCamera: unsupported,
      requestDisplay: unsupported,
      suspend() {},
      async resume() {},
      subscribe(listener: () => void) {
        if (disposed) throw new DOMException("Video capture session is disposed.", "InvalidStateError");
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        signal?.removeEventListener("abort", onAbort);
        listeners.clear();
      },
    });
  },
});

export interface VideoCaptureServiceSessionOptions {
  readonly signal?: AbortSignal;
  readonly appId?: string;
  readonly capability?: object;
  readonly reauthorise?: (kind: VFXCaptureKind) => boolean | Promise<boolean>;
}

interface OwnedCapture {
  readonly appId: string | null;
  readonly reauthorise?: (kind: VFXCaptureKind) => boolean | Promise<boolean>;
  readonly session: VFXCaptureSession;
  readonly dispose: () => void;
}

interface OwnedDecoder {
  readonly appId: string | null;
  readonly decoder: VFXDecoderSession;
  readonly dispose: () => void;
}

interface OwnedEncoder {
  readonly appId: string | null;
  readonly encoder: VFXEncoderSession;
  readonly dispose: () => void;
}

interface OwnedFrameProcessor {
  readonly appId: string | null;
  readonly processor: VFXFrameProcessorSession;
  readonly dispose: () => void;
}

export class VideoCaptureService {
  readonly #sessions = new Set<OwnedCapture>();
  readonly #decoders = new Set<OwnedDecoder>();
  readonly #encoders = new Set<OwnedEncoder>();
  readonly #processors = new Set<OwnedFrameProcessor>();
  readonly #closedOwners = new Set<string>();
  #disposed = false;

  constructor(
    private readonly host: VideoCaptureSessionHost = unavailableVideoCaptureHost,
    private readonly decoderHost?: VideoDecoderBackendHost,
    private readonly encoderHost?: VideoEncoderBackendHost,
    private readonly processorHost?: VideoFrameProcessorBackendHost,
  ) {}

  async queryDecoder(input: VFXDecoderConfigInput, signal?: AbortSignal): Promise<VFXDecoderCapability> {
    if (this.#disposed) throw new Error("Video capture service is disposed.");
    signal?.throwIfAborted();
    const backend = this.decoderHost?.createBackend();
    if (!backend) {
      return VFXCodecCapabilities.queryDecoder(input, {
        async queryDecoder(config) { return { supported: false, config, reason: "video-decoder-unavailable" }; },
      });
    }
    try {
      const result = await VFXCodecCapabilities.queryDecoder(input, backend);
      signal?.throwIfAborted();
      return result;
    } finally {
      backend.dispose();
    }
  }

  async queryEncoder(input: VFXEncoderConfigInput, signal?: AbortSignal): Promise<VFXEncoderCapability> {
    if (this.#disposed) throw new Error("Video capture service is disposed.");
    signal?.throwIfAborted();
    const backend = this.encoderHost?.createBackend();
    if (!backend) {
      return VFXEncoderCapabilities.queryEncoder(input, {
        async queryEncoder(config) {
          return { supported: false, config, reason: "video-encoder-unavailable" };
        },
      });
    }
    try {
      const result = await VFXEncoderCapabilities.queryEncoder(input, backend);
      signal?.throwIfAborted();
      return result;
    } finally {
      backend.dispose();
    }
  }

  createDecoder(
    options: VFXMountedDecoderOptions,
    ownership: Readonly<{ signal?: AbortSignal; appId?: string }> = {},
  ): VFXDecoderSession {
    if (this.#disposed) throw new Error("Video capture service is disposed.");
    ownership.signal?.throwIfAborted();
    if (ownership.appId && this.#closedOwners.has(normalizeBundleIdentifier(ownership.appId)))
      throw new DOMException("Video decoder owner is closed.", "AbortError");
    const backend = this.decoderHost?.createBackend({ outputStorage: options.outputStorage });
    if (!backend) throw new DOMException("Video decoding is unavailable on this host.", "NotSupportedError");
    const raw = new VFXDecoder({ backend, ...options });
    let disposed = false;
    let record!: OwnedDecoder;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      ownership.signal?.removeEventListener("abort", dispose);
      try { raw.dispose(); } finally { this.#decoders.delete(record); }
    };
    ownership.signal?.addEventListener("abort", dispose, { once: true });
    const decoder = Object.freeze<VFXDecoderSession>({
      get state() { return raw.state; },
      get generation() { return raw.generation; },
      get pendingOutputCount() { return raw.pendingOutputCount; },
      configure: (input) => raw.configure(input),
      decode: (chunk) => raw.decode(chunk),
      flush: () => raw.flush(),
      reset: () => raw.reset(),
      dispose,
    });
    record = { appId: ownership.appId ?? null, decoder, dispose };
    this.#decoders.add(record);
    return decoder;
  }

  createEncoder(
    options: VFXMountedEncoderOptions,
    ownership: Readonly<{ signal?: AbortSignal; appId?: string }> = {},
  ): VFXEncoderSession {
    if (this.#disposed) throw new Error("Video capture service is disposed.");
    ownership.signal?.throwIfAborted();
    if (ownership.appId && this.#closedOwners.has(normalizeBundleIdentifier(ownership.appId)))
      throw new DOMException("Video encoder owner is closed.", "AbortError");
    const backend = this.encoderHost?.createBackend();
    if (!backend) throw new DOMException("Video encoding is unavailable on this host.", "NotSupportedError");
    const raw = new VFXEncoder({ backend, ...options });
    let disposed = false;
    let record!: OwnedEncoder;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      ownership.signal?.removeEventListener("abort", dispose);
      try { raw.dispose(); } finally { this.#encoders.delete(record); }
    };
    ownership.signal?.addEventListener("abort", dispose, { once: true });
    const encoder = Object.freeze<VFXEncoderSession>({
      get state() { return raw.state; },
      get generation() { return raw.generation; },
      get pendingOutputCount() { return raw.pendingOutputCount; },
      configure: (input) => raw.configure(input),
      encode: (frame, frameOptions) => raw.encode(frame, frameOptions),
      flush: () => raw.flush(),
      reset: () => raw.reset(),
      dispose,
    });
    record = { appId: ownership.appId ?? null, encoder, dispose };
    this.#encoders.add(record);
    return encoder;
  }

  createFrameProcessor(
    options: VFXMountedFrameProcessorOptions = {},
    ownership: Readonly<{ signal?: AbortSignal; appId?: string }> = {},
  ): VFXFrameProcessorSession {
    if (this.#disposed) throw new Error("Video capture service is disposed.");
    ownership.signal?.throwIfAborted();
    if (ownership.appId && this.#closedOwners.has(normalizeBundleIdentifier(ownership.appId)))
      throw new DOMException("Video frame processor owner is closed.", "AbortError");
    const backend = this.processorHost?.createBackend(ownership.appId ? normalizeBundleIdentifier(ownership.appId) : "video:anonymous") ?? null;
    const raw = new VFXFrameProcessor({ ...options, backend });
    let disposed = false;
    let record!: OwnedFrameProcessor;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      ownership.signal?.removeEventListener("abort", dispose);
      try { raw.dispose(); } finally { this.#processors.delete(record); }
    };
    ownership.signal?.addEventListener("abort", dispose, { once: true });
    const processor = Object.freeze<VFXFrameProcessorSession>({
      process: (frame, graph, processOptions) => raw.process(frame, graph, processOptions),
      processTiled: (frame, graph, processOptions) => raw.processTiled(frame, graph, processOptions),
      draw: (frame, draw, drawOptions) => raw.draw(frame, draw, drawOptions),
      drawText: (frame, line, textOptions) => raw.drawText(frame, line, textOptions),
      dispose,
    });
    record = { appId: ownership.appId ?? null, processor, dispose };
    this.#processors.add(record);
    return processor;
  }

  createSession(options: VideoCaptureServiceSessionOptions = {}): VFXCaptureSession {
    if (this.#disposed) throw new Error("Video capture service is disposed.");
    options.signal?.throwIfAborted();
    if (options.appId && this.#closedOwners.has(normalizeBundleIdentifier(options.appId)))
      throw new DOMException("Video capture owner is closed.", "AbortError");

    const owner = new AbortController();
    const revoke = () => owner.abort(options.signal?.reason ?? new DOMException("Video capture owner was revoked.", "AbortError"));
    options.signal?.addEventListener("abort", revoke, { once: true });
    const underlying = this.host.createSession(owner.signal, options.capability);
    let disposed = false;
    let record!: OwnedCapture;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      options.signal?.removeEventListener("abort", revoke);
      owner.abort(new DOMException("Video capture session was disposed.", "AbortError"));
      try { underlying.dispose(); } finally { this.#sessions.delete(record); }
    };
    const session: VFXCaptureSession = Object.freeze({
      get state() { return underlying.state; },
      get kind() { return underlying.kind; },
      get settings() { return underlying.settings; },
      get capabilities() { return underlying.capabilities; },
      enumerateDevices: () => underlying.enumerateDevices(),
      requestCamera: (request: VFXCameraCaptureRequest) => underlying.requestCamera(request),
      requestDisplay: (request: VFXDisplayCaptureRequest) => underlying.requestDisplay(request),
      suspend: () => underlying.suspend(),
      resume: () => underlying.resume(),
      subscribe: (listener: () => void) => underlying.subscribe(listener),
      dispose,
    });
    record = {
      appId: options.appId ?? null,
      reauthorise: options.reauthorise,
      session,
      dispose,
    };
    this.#sessions.add(record);
    return session;
  }

  suspendOwner(appId: string): void {
    if (this.#disposed) return;
    for (const record of this.#sessions)
      if (normalizeBundleIdentifier(record.appId) === normalizeBundleIdentifier(appId)) record.session.suspend();
  }

  async resumeOwner(appId: string): Promise<void> {
    if (this.#disposed) return;
    this.#closedOwners.delete(normalizeBundleIdentifier(appId));
    for (const record of [...this.#sessions]) {
      if (normalizeBundleIdentifier(record.appId) !== normalizeBundleIdentifier(appId) || record.session.state !== "suspended") continue;
      const kind = record.session.kind;
      if (kind && record.reauthorise && !(await record.reauthorise(kind))) {
        record.dispose();
        continue;
      }
      await record.session.resume();
    }
  }

  closeOwner(appId: string): void {
    if (this.#disposed) return;
    this.#closedOwners.add(normalizeBundleIdentifier(appId));
    for (const record of [...this.#sessions])
      if (normalizeBundleIdentifier(record.appId) === normalizeBundleIdentifier(appId)) record.dispose();
    for (const record of [...this.#decoders])
      if (normalizeBundleIdentifier(record.appId) === normalizeBundleIdentifier(appId)) record.dispose();
    for (const record of [...this.#encoders])
      if (normalizeBundleIdentifier(record.appId) === normalizeBundleIdentifier(appId)) record.dispose();
    for (const record of [...this.#processors])
      if (normalizeBundleIdentifier(record.appId) === normalizeBundleIdentifier(appId)) record.dispose();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const record of [...this.#sessions]) record.dispose();
    this.#sessions.clear();
    for (const record of [...this.#decoders]) record.dispose();
    this.#decoders.clear();
    for (const record of [...this.#encoders]) record.dispose();
    this.#encoders.clear();
    for (const record of [...this.#processors]) record.dispose();
    this.#processors.clear();
    this.#closedOwners.clear();
  }
}

export function createVideoCaptureClient(
  service: VideoCaptureService,
  options: VideoCaptureServiceSessionOptions = {},
): Omit<VFXVideoClient, "createPresentationCoordinator"> {
  return Object.freeze({
    createCaptureSession(signal?: AbortSignal) {
      return service.createSession({ ...options, signal });
    },
    queryDecoder(
      input: Parameters<VFXVideoClient["queryDecoder"]>[0],
      signal: Parameters<VFXVideoClient["queryDecoder"]>[1],
    ) {
      return service.queryDecoder(input, signal);
    },
    createDecoder(
      decoderOptions: Parameters<VFXVideoClient["createDecoder"]>[0],
      signal: Parameters<VFXVideoClient["createDecoder"]>[1],
    ) {
      return service.createDecoder(decoderOptions, { signal, appId: options.appId });
    },
    queryEncoder(
      input: Parameters<VFXVideoClient["queryEncoder"]>[0],
      signal: Parameters<VFXVideoClient["queryEncoder"]>[1],
    ) {
      return service.queryEncoder(input, signal);
    },
    createEncoder(
      encoderOptions: Parameters<VFXVideoClient["createEncoder"]>[0],
      signal: Parameters<VFXVideoClient["createEncoder"]>[1],
    ) {
      return service.createEncoder(encoderOptions, { signal, appId: options.appId });
    },
    createFrameProcessor(
      processorOptions: Parameters<VFXVideoClient["createFrameProcessor"]>[0],
      signal: Parameters<VFXVideoClient["createFrameProcessor"]>[1],
    ) {
      return service.createFrameProcessor(processorOptions, { signal, appId: options.appId });
    },
  });
}
