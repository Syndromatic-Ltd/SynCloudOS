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
import { AUFXSpeechSynthesizer } from "../../../FX/AudioFX/AUFXSpeechSynthesizer";
import { useSCOS } from "../scos/useSCOS";

/** Stable component-owned synthesizer; mounting never starts speech. */
export function useSpeechSynthesizer(): AUFXSpeechSynthesizer {
  const client = useSCOS().speechSynthesis;
  const binding = useMemo(() => {
    let current: AUFXSpeechSynthesizer | null = null;
    const requireCurrent = () => { if (!current) throw new DOMException("Speech component is not mounted.", "InvalidStateError"); return current; };
    const facade = new AUFXSpeechSynthesizer({
      get capabilities() { return current?.capabilities ?? Object.freeze({ speechSynthesis: false, nativePermissionPrompt: false as const }); },
      get authorizationStatus() { return current?.authorizationStatus ?? "unavailable"; },
      get isSpeaking() { return current?.isSpeaking ?? false; }, get isPaused() { return current?.isPaused ?? false; },
      requestAuthorization: () => current?.requestAuthorization() ?? Promise.resolve("unavailable"),
      speechVoices: () => requireCurrent().speechVoices(), speak: value => requireCurrent().speak(value),
      pauseSpeaking: () => requireCurrent().pauseSpeaking(), continueSpeaking: () => requireCurrent().continueSpeaking(), stopSpeaking: () => current?.stopSpeaking() ?? false,
      subscribe: listener => requireCurrent().subscribe(listener), dispose: () => current?.dispose(),
    });
    return { facade, mount() { const raw = client.createSynthesizer(); current = raw; return () => { if (current === raw) current = null; raw.dispose(); }; } };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
