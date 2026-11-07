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
import type { XRFXSession } from "../../../FX/XRFX/public";
import { useSCOS } from "../scos/useSCOS";

/** Component-scoped passive device owner; requests remain explicit user actions. */
export function useXR(): XRFXSession {
  const client = useSCOS().xr;
  const binding = useMemo(() => {
    let current: XRFXSession | null = null;
    const requireOwner = () => {
      if (!current) throw new DOMException("The component device owner is not mounted.", "AbortError");
      return current;
    };
    const facade: XRFXSession = Object.freeze<XRFXSession>({
      getCapabilities: () => current?.getCapabilities() ?? Object.freeze({ apiAvailable: false, worldTracking: false, nativeARKit: false }),
      getAuthorizationStatus: () => current?.getAuthorizationStatus() ?? Promise.resolve("unavailable"),
      isSupported: configuration => requireOwner().isSupported(configuration),
      run: (configuration, listener) => requireOwner().run(configuration, listener),
      pause: () => current?.pause() ?? Promise.resolve(),
      dispose: () => current?.dispose(),
    });
    return { facade, mount() {
      const owner = client.createSession(); current = owner;
      return () => { if (current === owner) current = null; owner.dispose(); };
    } };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
