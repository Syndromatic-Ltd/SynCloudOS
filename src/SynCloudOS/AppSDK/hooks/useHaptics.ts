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
import type { HFXHapticSession } from "../../../FX/HapticsFX/HFXHapticSession";
import { useSCOS } from "../scos/useSCOS"

/** Component-owned engine; acquisition happens after commit and never requests permission. */
export function useHaptics(): HFXHapticSession {
  const client = useSCOS().haptics;
  const binding = useMemo(() => {
    let current: HFXHapticSession | null = null;
    const requireEngine = () => {
      if (!current) throw new Error("The component haptic owner is not mounted.");
      return current;
    };
    const facade = Object.freeze<HFXHapticSession>({
      get currentTime() { return current?.currentTime ?? 0; },
      get isSupported() { return current?.isSupported ?? false; },
      get capabilities() {
        return current?.capabilities ?? Object.freeze({
          state: "unavailable", timing: false, amplitude: false, sharpness: false, audio: false, audioState: "unavailable", dynamicParameters: false,
          fidelity: Object.freeze({ timing: "unavailable", amplitude: "unavailable", sharpness: "unavailable", audio: "unavailable", dynamicParameters: "unavailable" }),
          reason: "The component haptic owner is not mounted.",
        });
      },
      observe: listener => requireEngine().observe(listener),
      configurePlayback: configuration => requireEngine().configurePlayback(configuration),
      start: () => requireEngine().start(),
      stop: () => current?.stop(),
      reset: () => requireEngine().reset(),
      trigger: (request, options) => requireEngine().trigger(request, options),
      registerAudioResource: (buffer, signal) => requireEngine().registerAudioResource(buffer, signal),
      unregisterAudioResource: resource => requireEngine().unregisterAudioResource(resource),
      makePlayer: pattern => requireEngine().makePlayer(pattern),
      makeAdvancedPlayer: pattern => requireEngine().makeAdvancedPlayer(pattern),
      dispose: () => current?.dispose(),
    });
    return {
      facade,
      mount() {
        const engine = client.createEngine();
        current = engine;
        return () => { if (current === engine) current = null; engine.dispose(); };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
