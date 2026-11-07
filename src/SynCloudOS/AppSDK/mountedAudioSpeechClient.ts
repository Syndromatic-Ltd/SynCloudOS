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

import { AUFXSpeechSynthesizer, type AUFXSpeechClient, type AUFXSpeechSynthesisHost } from "../../FX/AudioFX/AUFXSpeechSynthesizer";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

export function createMountedAudioSpeechClient(host: AUFXSpeechSynthesisHost | undefined, owner: AbortSignal, permissions: () => readonly string[]): AUFXSpeechClient {
  const scope = createMountedResourceScope(owner, { maxResources: 8 });
  return Object.freeze({
    createSynthesizer(signal?: AbortSignal) {
      return scope.acquire(signal, (lease, release) => {
        const unsupported = () => { lease.throwIfAborted(); throw new DOMException("Speech synthesis is unavailable.", "NotSupportedError"); };
        const raw = host?.createSynthesizer(lease, () => !owner.aborted && permissions().includes("audio.speech")) ?? new AUFXSpeechSynthesizer({
          capabilities: Object.freeze({ speechSynthesis: false, nativePermissionPrompt: false }), authorizationStatus: "unavailable", isSpeaking: false, isPaused: false,
          requestAuthorization: async () => "unavailable", speechVoices: () => Object.freeze([]), speak: async () => unsupported(),
          pauseSpeaking: () => false, continueSpeaking: () => false, stopSpeaking: () => false,
          subscribe: () => { lease.throwIfAborted(); return () => {}; }, dispose() {},
        });
        let disposed = false;
        const dispose = () => { if (disposed) return; disposed = true; lease.removeEventListener("abort", dispose); try { raw.dispose(); } finally { release(); } };
        lease.addEventListener("abort", dispose, { once: true });
        return new AUFXSpeechSynthesizer({
          get capabilities() { return raw.capabilities; }, get authorizationStatus() { return raw.authorizationStatus; },
          get isSpeaking() { return raw.isSpeaking; }, get isPaused() { return raw.isPaused; },
          requestAuthorization: () => raw.requestAuthorization(), speechVoices: () => raw.speechVoices(), speak: value => raw.speak(value),
          pauseSpeaking: () => raw.pauseSpeaking(), continueSpeaking: () => raw.continueSpeaking(), stopSpeaking: () => raw.stopSpeaking(), subscribe: listener => raw.subscribe(listener),
          dispose,
        });
      }, synth => synth.dispose());
    },
  });
}
