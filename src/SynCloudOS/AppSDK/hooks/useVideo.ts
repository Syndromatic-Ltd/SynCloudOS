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
  VFXCaptureCapabilities,
  VFXCaptureSession,
  VFXCaptureSettings,
  VFXCaptureState,
} from "../../../FX/VideoFX/public";
import { useSCOS } from "../scos/useSCOS"

const unavailableCapabilities: VFXCaptureCapabilities = Object.freeze({
  camera: false,
  display: false,
  deviceEnumeration: false,
});

/** Stable component-scoped video capture facade. Mounting is passive; camera
 * and display prompts occur only from their explicit request methods. */
export function useVideo(): VFXCaptureSession {
  const client = useSCOS().video;
  const binding = useMemo(() => {
    let current: VFXCaptureSession | null = null;
    const requireSession = () => {
      if (!current) throw new Error("The component video capture owner is not mounted.");
      return current;
    };
    const facade = Object.freeze<VFXCaptureSession>({
      get state(): VFXCaptureState { return current?.state ?? "unavailable"; },
      get kind() { return current?.kind ?? null; },
      get settings(): VFXCaptureSettings | null { return current?.settings ?? null; },
      get capabilities() { return current?.capabilities ?? unavailableCapabilities; },
      enumerateDevices: () => requireSession().enumerateDevices(),
      requestCamera: (request) => requireSession().requestCamera(request),
      requestDisplay: (request) => requireSession().requestDisplay(request),
      suspend: () => requireSession().suspend(),
      resume: () => requireSession().resume(),
      subscribe: (listener) => requireSession().subscribe(listener),
      dispose: () => current?.dispose(),
    });
    return {
      facade,
      mount() {
        const session = client.createCaptureSession();
        current = session;
        return () => {
          if (current === session) current = null;
          session.dispose();
        };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
