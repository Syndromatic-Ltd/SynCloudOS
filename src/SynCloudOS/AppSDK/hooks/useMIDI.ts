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

import { useLayoutEffect, useMemo } from "react";
import type {
  MIFXAccess,
  MIFXCapabilities,
} from "../../../FX/MIDIFX/public";
import { useSCOS } from "../scos/useSCOS"

const pendingCapabilities: MIFXCapabilities = Object.freeze({
  apiAvailable: false,
  transportProtocol: "midi1",
  authorization: "unavailable",
  sysexAuthorization: "unavailable",
  connectedEndpointCount: 0,
});
const noEndpoints = Object.freeze([]);

/** Stable component-scoped MIDI facade. Mounting creates only a passive owner;
 * browser permission is requested solely by requestAuthorization(). */
export function useMIDI(): MIFXAccess {
  const client = useSCOS().midi;
  const binding = useMemo(() => {
    let current: MIFXAccess | null = null;
    const requireAccess = () => {
      if (!current) throw new Error("The component MIDI owner is not mounted.");
      return current;
    };
    const facade = Object.freeze<MIFXAccess>({
      getCapabilities: () => current?.getCapabilities() ?? pendingCapabilities,
      getEndpoints: () => current?.getEndpoints() ?? noEndpoints,
      requestAuthorization: (request) => requireAccess().requestAuthorization(request),
      subscribeEndpoints: (listener) => requireAccess().subscribeEndpoints(listener),
      subscribeInput: (endpoint, listener) => requireAccess().subscribeInput(endpoint, listener),
      acquireOutput: (endpoint) => requireAccess().acquireOutput(endpoint),
      dispose: () => current?.dispose(),
    });
    return {
      facade,
      mount() {
        const access = client.createAccess();
        current = access;
        return () => {
          if (current === access) current = null;
          access.dispose();
        };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
