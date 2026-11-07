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
  MIFXAccess,
  MIFXAuthorizationRequest,
  MIFXAuthorizationResult,
  MIFXAuthorizationState,
  MIFXCapabilities,
  MIFXClient,
  MIFXEndpointListener,
  MIFXEndpointSnapshot,
  MIFXInputListener,
} from "../../FX/MIDIFX/MIFXAccess";
import type { MIDIService, PrivacyApplicationPort, PrivacyAuthorizationStatus } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export type MountedMIDICapability = "midi.access" | "midi.sysex";
const emptyEndpoints = Object.freeze([]) as readonly MIFXEndpointSnapshot[];
function result(state: Exclude<MIFXAuthorizationState, "unknown">, sysex: boolean): MIFXAuthorizationResult {
  return Object.freeze({ state, sysex });
}
function mergedState(native: MIFXAuthorizationState, privacy?: PrivacyApplicationPort): MIFXAuthorizationState {
  if (!privacy || native === "policy-denied" || native === "unavailable") return native;
  const state = privacy.authorizationStatus(native === "granted" ? "granted" : native === "denied" ? "denied" : "unknown");
  return state === "granted" || state === "denied" || state === "unavailable" ? state : "unknown";
}
function requestedState(native: MIFXAuthorizationState): PrivacyAuthorizationStatus {
  return native === "granted" || native === "denied" || native === "unavailable" ? native : "prompt";
}

/** Mounted MIDI authority. Construction and inspection never request browser access. */
export function createMountedMIDIClient(
  service: MIDIService,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: MountedMIDICapability) => boolean,
  privacyForSysex?: (sysex: boolean) => PrivacyApplicationPort,
): MIFXClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const declared = (capability: MountedMIDICapability): boolean => permissions().includes(capability);
  const authorised = (capability: MountedMIDICapability): boolean => declared(capability) && authorise(capability);
  return Object.freeze({
    createAccess(signal?: AbortSignal): MIFXAccess {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      const normalDeclared = declared("midi.access");
      const sysexDeclared = normalDeclared && declared("midi.sysex");
      return scope.acquire(signal, (lease, release) => {
        const access = service.createAccess({ signal: lease, canRequestAuthorization: normalDeclared, canRequestSysEx: sysexDeclared });
        const normalPrivacy = privacyForSysex?.(false);
        const sysexPrivacy = privacyForSysex?.(true);
        const bindings = new Map<PrivacyApplicationPort, () => void>();
        const endpointListeners = new Set<MIFXEndpointListener>();
        let disposed = false, privacyRevoked = false;
        let nativeCapabilities = access.getCapabilities();
        const requireNormal = () => authorised("midi.access");
        const requireSysEx = () => requireNormal() && authorised("midi.sysex");
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try { access.dispose(); } finally {
            for (const unbind of bindings.values()) unbind();
            bindings.clear();
            endpointListeners.clear();
            release();
          }
        };
        const bindPrivacy = (privacy?: PrivacyApplicationPort) => {
          if (!privacy || bindings.has(privacy)) return;
          bindings.set(privacy, privacy.bindResource(() => { privacyRevoked = true; dispose(); }));
        };
        const capabilities = (): MIFXCapabilities => {
          // A privacy withdrawal closes resources but remains inspectable as a denial.
          if (!privacyRevoked) nativeCapabilities = access.getCapabilities();
          if (!normalPrivacy) return nativeCapabilities;
          const authorization = nativeCapabilities.apiAvailable ? mergedState(nativeCapabilities.authorization, normalPrivacy) : "unavailable";
          const additional = mergedState(nativeCapabilities.sysexAuthorization, sysexPrivacy);
          const sysexAuthorization = authorization === "denied" || authorization === "unavailable" || authorization === "policy-denied"
            ? authorization : authorization !== "granted" && additional === "granted" ? "unknown" : additional;
          return Object.freeze({ ...nativeCapabilities, authorization, sysexAuthorization, connectedEndpointCount: authorization === "granted" && !privacyRevoked ? nativeCapabilities.connectedEndpointCount : 0 });
        };
        const endpoints = () => {
          if (privacyRevoked || (normalPrivacy && capabilities().authorization !== "granted")) return emptyEndpoints;
          return access.getEndpoints();
        };
        const assertGranted = () => {
          lease.throwIfAborted();
          if (disposed) throw new DOMException("MIDI access was disposed.", "AbortError");
          if (!requireNormal()) throw new DOMException("The MIDI access capability is not admitted.", "SecurityError");
          if (normalPrivacy) {
            const status = capabilities();
            if (status.authorization !== "granted" || (nativeCapabilities.sysexAuthorization === "granted" && status.sysexAuthorization !== "granted")) throw new DOMException("MIDI access requires this application's privacy authorisation.", "NotAllowedError");
          }
        };
        const requestOne = async (sysex: boolean, request: MIFXAuthorizationRequest): Promise<MIFXAuthorizationResult> => {
          const privacy = sysex ? sysexPrivacy : normalPrivacy;
          if (!privacy) return access.requestAuthorization({ ...request, sysex });
          lease.throwIfAborted();
          if (disposed) throw new DOMException("MIDI access was disposed.", "AbortError");
          const local = privacy.authorizationStatus();
          if (local === "denied" || local === "unavailable") return result(local, sysex);
          bindPrivacy(normalPrivacy);
          bindPrivacy(privacy);
          let native: MIFXAuthorizationResult | undefined;
          const requestSignal = request.signal ? AbortSignal.any([lease, request.signal]) : lease;
          const status = await privacy.requestAuthorization(async nextSignal => {
            native = await access.requestAuthorization({ ...request, sysex, signal: nextSignal });
            nativeCapabilities = access.getCapabilities();
            return requestedState(native.state);
          }, { signal: requestSignal });
          if (status === "granted" || status === "denied" || status === "unavailable") return result(status, sysex);
          return native ?? result("unavailable", sysex);
        };
        const mounted: MIFXAccess = {
          get authorizationStatus() { return capabilities().authorization; },
          getCapabilities: capabilities,
          getEndpoints: endpoints,
          async requestAuthorization(request: MIFXAuthorizationRequest = {}) {
            const sysex = request.sysex === true;
            if (sysex ? !sysexDeclared : !normalDeclared) return result("policy-denied", sysex);
            if (sysex ? !requireSysEx() : !requireNormal()) return result("policy-denied", sysex);
            // SysEx is additional authority. It never implicitly grants the normal app gate.
            if (sysex && normalPrivacy && capabilities().authorization !== "granted") {
              const normal = await requestOne(false, request);
              if (normal.state !== "granted") return result(normal.state, true);
            }
            const granted = await requestOne(sysex, request);
            if (normalPrivacy && granted.state === "granted" && !disposed) {
              const snapshot = endpoints();
              for (const listener of [...endpointListeners]) { try { listener(snapshot); } catch { /* One observer cannot block another. */ } }
            }
            return granted;
          },
          subscribeEndpoints(listener) {
            if (!requireNormal()) throw new DOMException("The MIDI access capability is not admitted.", "SecurityError");
            endpointListeners.add(listener);
            let subscription;
            try {
              subscription = access.subscribeEndpoints(snapshot => {
                if (!disposed && !lease.aborted) listener(normalPrivacy && capabilities().authorization !== "granted" ? emptyEndpoints : snapshot);
              });
            } catch (error) { endpointListeners.delete(listener); throw error; }
            return Object.freeze({ dispose() { endpointListeners.delete(listener); subscription.dispose(); } });
          },
          subscribeInput(endpoint: MIFXEndpointSnapshot, listener: MIFXInputListener) {
            try { assertGranted(); } catch (error) { return Promise.reject(error); }
            return access.subscribeInput(endpoint, packet => {
              if (disposed || lease.aborted) return;
              try { assertGranted(); } catch { return; }
              listener(packet);
            });
          },
          async acquireOutput(endpoint: MIFXEndpointSnapshot) {
            assertGranted();
            const output = await access.acquireOutput(endpoint);
            try { assertGranted(); } catch (error) { output.dispose(); throw error; }
            return Object.freeze({ ...output, send(...args: Parameters<typeof output.send>) { assertGranted(); output.send(...args); } });
          },
          dispose,
        };
        return Object.freeze(mounted);
      }, access => access.dispose(), { sessions: 1 });
    },
  });
}
