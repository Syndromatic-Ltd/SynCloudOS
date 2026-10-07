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
  VFXCaptureKind,
  VFXCaptureSession,
  VFXDecoderSession,
  VFXEncoderSession,
  VFXFrameProcessorSession,
  VFXVideoClient,
} from "../../FX/VideoFX/VFXCaptureSession";
import type { VFXPresentationCoordinator } from "../../FX/VideoFX/VFXPresentation";
import type { AudioGraphHostService, VideoCaptureService } from "../HostServices/AppSDKHostServiceTypes";
import { AVPresentationCoordinator } from "../HostServices/AppSDKHostVideoPresentation";
import { createMountedResourceScope, type MountedResourceAccounting } from "../HostServices/mountedResourceScope";
import { normalizeVFXDecoderConfig } from "../../FX/VideoFX/VFXCodecCapabilities";

export interface MountedVideoResourceLimits {
  readonly maximumDecoderSessions?: number;
  /** Sum of configured width × height × four, not a claim about native heap use. */
  readonly maximumConfiguredFrameBytes?: number;
}

export type MountedVideoCapability = "video.capture.camera" | "video.capture.display";

function capabilityFor(kind: VFXCaptureKind): MountedVideoCapability {
  return kind === "camera" ? "video.capture.camera" : "video.capture.display";
}

function securityError(message: string): DOMException {
  return new DOMException(message, "SecurityError");
}

export function createMountedVideoClient(
  service: VideoCaptureService,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: MountedVideoCapability) => boolean,
  appId?: string,
  capability: object = Object.freeze({}),
  audioGraphs?: AudioGraphHostService,
  audioCapability?: object,
  limits: MountedVideoResourceLimits = {},
  accounting?: MountedResourceAccounting,
): VFXVideoClient {
  // Host admission accounts for configured pixel workload independently of
  // stream count. Many small previews must not cost the same as as many 4K
  // streams. Consumers still own and bound their retained output windows.
  const decoderScope = createMountedResourceScope(mountSignal, {
    maxResources: limits.maximumDecoderSessions ?? 256,
    budgets: { sessions: limits.maximumDecoderSessions ?? 256,
      bytes: limits.maximumConfiguredFrameBytes ?? 192 * 1024 * 1024 },
  });
  // Configured decoder pixel workload is also the mount's active
  // video-frame residency in runtime.resources; it is never reclaimable.
  const configuredDecoders = new Set<{ bytes: number }>();
  if (accounting && !mountSignal.aborted) {
    const unregister = accounting.register({
      id: `mount:${accounting.owner}:video-decoders`,
      kind: "video-frame",
      owner: accounting.owner,
      *measure() {
        for (const decoder of configuredDecoders)
          if (decoder.bytes > 0) yield { key: decoder, bytes: decoder.bytes, state: "active" as const };
      },
    });
    mountSignal.addEventListener("abort", unregister, { once: true });
  }
  const scope = createMountedResourceScope(mountSignal, {
    maxResources: 4,
    budgets: { sessions: 4 },
  });
  // Keep the existing four A/V session limit. Media-only presentation has its
  // own matching coordinator budget so independently clocked video streams can
  // coexist with the decoder budget without consuming decoder leases.
  const mediaPresentationScope = createMountedResourceScope(mountSignal, {
    maxResources: 4,
    budgets: { sessions: 4 },
  });
  const allowed = (kind: VFXCaptureKind): boolean => {
    const required = capabilityFor(kind);
    return permissions().includes(required) && authorise(required);
  };
  const requireCapability = (kind: VFXCaptureKind) => {
    const required = capabilityFor(kind);
    if (!permissions().includes(required))
      throw securityError(`SynWare capability ${required} must be declared.`);
    if (!authorise(required))
      throw securityError(`PolicyKit denied SynWare capability ${required}.`);
  };

  return Object.freeze({
    queryDecoder(
      input: Parameters<VFXVideoClient["queryDecoder"]>[0],
      signal: Parameters<VFXVideoClient["queryDecoder"]>[1],
    ) {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      return service.queryDecoder(input, signal);
    },
    createDecoder(
      options: Parameters<VFXVideoClient["createDecoder"]>[0],
      signal: Parameters<VFXVideoClient["createDecoder"]>[1],
    ): VFXDecoderSession {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      return decoderScope.acquire(signal, (lease, release) => {
        const pixelReservation = decoderScope.reserve();
        const decoder = service.createDecoder(options, { signal: lease, appId });
        let disposed = false;
        let configuredBytes = 0;
        const residency = { bytes: 0 };
        configuredDecoders.add(residency);
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          configuredDecoders.delete(residency);
          try { decoder.dispose(); } finally { pixelReservation.release(); release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<VFXDecoderSession>({
          get state() { return decoder.state; },
          get generation() { return decoder.generation; },
          get pendingOutputCount() { return decoder.pendingOutputCount; },
          configure(input) {
            lease.throwIfAborted();
            const config = normalizeVFXDecoderConfig(input);
            const bytes = config.codedWidth * config.codedHeight * 4;
            pixelReservation.resize({ bytes });
            try { decoder.configure(config); configuredBytes = bytes; residency.bytes = bytes; }
            catch (error) { pixelReservation.resize({ bytes: configuredBytes }); throw error; }
          },
          decode: (chunk) => decoder.decode(chunk),
          flush: () => decoder.flush(),
          reset() {
            decoder.reset();
            pixelReservation.resize({ bytes: 0 });
            configuredBytes = 0;
            residency.bytes = 0;
          },
          dispose,
        });
      }, (decoder) => decoder.dispose(), { sessions: 1 });
    },
    queryEncoder(
      input: Parameters<VFXVideoClient["queryEncoder"]>[0],
      signal: Parameters<VFXVideoClient["queryEncoder"]>[1],
    ) {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      return service.queryEncoder(input, signal);
    },
    createEncoder(
      options: Parameters<VFXVideoClient["createEncoder"]>[0],
      signal: Parameters<VFXVideoClient["createEncoder"]>[1],
    ): VFXEncoderSession {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      return scope.acquire(signal, (lease, release) => {
        const encoder = service.createEncoder(options, { signal: lease, appId });
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try { encoder.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<VFXEncoderSession>({
          get state() { return encoder.state; },
          get generation() { return encoder.generation; },
          get pendingOutputCount() { return encoder.pendingOutputCount; },
          configure: (input) => encoder.configure(input),
          encode: (frame, frameOptions) => encoder.encode(frame, frameOptions),
          flush: () => encoder.flush(),
          reset: () => encoder.reset(),
          dispose,
        });
      }, (encoder) => encoder.dispose(), { sessions: 1 });
    },
    createFrameProcessor(
      options: Parameters<VFXVideoClient["createFrameProcessor"]>[0],
      signal: Parameters<VFXVideoClient["createFrameProcessor"]>[1],
    ): VFXFrameProcessorSession {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      return scope.acquire(signal, (lease, release) => {
        const processor = service.createFrameProcessor(options, { signal: lease, appId });
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try { processor.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<VFXFrameProcessorSession>({
          process: (frame, graph, processOptions) => processor.process(frame, graph, processOptions),
          processTiled: (frame, graph, processOptions) => processor.processTiled(frame, graph, processOptions),
          draw: (frame, draw, drawOptions) => processor.draw(frame, draw, drawOptions),
          drawText: (frame, line, textOptions) => processor.drawText(frame, line, textOptions),
          dispose,
        });
      }, processor => processor.dispose(), { sessions: 1 });
    },
    createPresentationCoordinator(
      options: Parameters<VFXVideoClient["createPresentationCoordinator"]>[0],
      signal: Parameters<VFXVideoClient["createPresentationCoordinator"]>[1],
    ): VFXPresentationCoordinator {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      if (options.mode === "media") {
        return mediaPresentationScope.acquire(signal, (lease, release) => {
          const coordinator = new AVPresentationCoordinator({
            mode: "media", timebase: options.timebase,
            toleranceSeconds: options.toleranceSeconds,
            maximumQueuedFrames: options.maximumQueuedFrames,
            present: options.present,
          });
          const rawDispose = coordinator.dispose.bind(coordinator);
          let disposed = false;
          const dispose = () => {
            if (disposed) return;
            disposed = true;
            try { rawDispose(); } finally { release(); }
          };
          Object.defineProperty(coordinator, "dispose", { configurable: true, value: dispose });
          lease.addEventListener("abort", dispose, { once: true });
          return coordinator;
        }, coordinator => coordinator.dispose(), { sessions: 1 });
      }
      if (!audioGraphs) throw new DOMException("A/V synchronization host is unavailable.", "NotSupportedError");
      if (!audioCapability) throw new DOMException("The mounted audio timeline capability is unavailable.", "NotSupportedError");
      return scope.acquire(signal, (lease, release) => {
        const transport = audioGraphs.createTimelineTransport(options.audioEngine, { capability: audioCapability, appId, players: options.audioPlayers, signal: lease });
        let bridge: ReturnType<AudioGraphHostService["createMediaClockBridge"]>;
        let coordinator: AVPresentationCoordinator;
        try {
          bridge = audioGraphs.createMediaClockBridge(options.audioEngine, options.timebase);
          try { coordinator = new AVPresentationCoordinator({
            timebase: options.timebase,
            audioBridge: bridge,
            audioTransport: transport,
            toleranceSeconds: options.toleranceSeconds,
            maximumQueuedFrames: options.maximumQueuedFrames,
            present: options.present,
          }); } catch (error) { bridge.dispose(); throw error; }
        } catch (error) { transport.dispose(); throw error; }
        const rawDispose = coordinator.dispose.bind(coordinator);
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try { rawDispose(); } finally { try { bridge.dispose(); } finally { release(); } }
        };
        Object.defineProperty(coordinator, "dispose", { configurable: true, value: dispose });
        lease.addEventListener("abort", dispose, { once: true });
        return coordinator;
      }, coordinator => coordinator.dispose(), { sessions: 1 });
    },

    createCaptureSession(signal?: AbortSignal): VFXCaptureSession {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      return scope.acquire(signal, (lease, release) => {
        const session = service.createSession({
          signal: lease,
          appId,
          capability,
          reauthorise: allowed,
        });
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try { session.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<VFXCaptureSession>({
          get state() { return session.state; },
          get kind() { return session.kind; },
          get settings() { return session.settings; },
          get capabilities() { return session.capabilities; },
          enumerateDevices: () => session.enumerateDevices(),
          async requestCamera(request) {
            requireCapability("camera");
            return session.requestCamera(request);
          },
          async requestDisplay(request) {
            requireCapability("display");
            return session.requestDisplay(request);
          },
          suspend: () => session.suspend(),
          resume: async () => {
            const kind = session.kind;
            if (kind) requireCapability(kind);
            await session.resume();
          },
          subscribe: (listener) => session.subscribe(listener),
          dispose,
        });
      }, (session) => session.dispose(), { sessions: 1 });
    },
  });
}
