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
  MIFXClient,
  MIFXEndpointSnapshot,
  MIFXInputListener,
} from "../../FX/MIDIFX/MIFXAccess";
import type { MIDIService } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export type MountedMIDICapability = "midi.access" | "midi.sysex";

function policyDenied(sysex: boolean): MIFXAuthorizationResult {
  return Object.freeze({ state: "policy-denied", sysex });
}

/** Mounted MIDI authority. Creating/inspecting an access object is passive;
 * browser authorization is reached only from requestAuthorization(). */
export function createMountedMIDIClient(
  service: MIDIService,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: MountedMIDICapability) => boolean,
): MIFXClient {
  const scope = createMountedResourceScope(mountSignal, {
    maxResources: 8,
    budgets: { sessions: 8 },
  });

  const declared = (capability: MountedMIDICapability): boolean =>
    permissions().includes(capability);

  const authorised = (capability: MountedMIDICapability): boolean =>
    declared(capability) && authorise(capability);

  return Object.freeze({
    createAccess(signal?: AbortSignal): MIFXAccess {
      mountSignal.throwIfAborted();
      signal?.throwIfAborted();
      const normalDeclared = declared("midi.access");
      const sysexDeclared = normalDeclared && declared("midi.sysex");
      return scope.acquire(signal, (lease, release) => {
        const access = service.createAccess({
          signal: lease,
          canRequestAuthorization: normalDeclared,
          canRequestSysEx: sysexDeclared,
        });
        let disposed = false;
        const requireNormal = () => authorised("midi.access");
        const requireSysEx = () => requireNormal() && authorised("midi.sysex");
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          try {
            access.dispose();
          } finally {
            release();
          }
        };
        const mounted: MIFXAccess = {
          getCapabilities: () => access.getCapabilities(),
          getEndpoints: () => access.getEndpoints(),
          requestAuthorization(request: MIFXAuthorizationRequest = {}) {
            const sysex = request.sysex === true;
            if (sysex ? !sysexDeclared : !normalDeclared)
              return Promise.resolve(policyDenied(sysex));
            if (sysex ? !requireSysEx() : !requireNormal())
              return Promise.resolve(policyDenied(sysex));
            return access.requestAuthorization(request);
          },
          subscribeEndpoints(listener) {
            if (!requireNormal())
              throw new DOMException("PolicyKit denied SynWare capability midi.access.", "SecurityError");
            return access.subscribeEndpoints(listener);
          },
          subscribeInput(endpoint: MIFXEndpointSnapshot, listener: MIFXInputListener) {
            if (!requireNormal())
              return Promise.reject(new DOMException("PolicyKit denied SynWare capability midi.access.", "SecurityError"));
            return access.subscribeInput(endpoint, listener);
          },
          acquireOutput(endpoint: MIFXEndpointSnapshot) {
            if (!requireNormal())
              return Promise.reject(new DOMException("PolicyKit denied SynWare capability midi.access.", "SecurityError"));
            return access.acquireOutput(endpoint);
          },
          dispose,
        };
        return Object.freeze(mounted);
      }, (access) => access.dispose(), { sessions: 1 });
    },
  });
}
