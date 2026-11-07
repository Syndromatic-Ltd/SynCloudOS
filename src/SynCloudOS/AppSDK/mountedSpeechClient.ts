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

import type { SPFXCapabilities, SPFXSpeechClient, SPFXSpeechRecognizer } from "../../FX/SpeechFX/public";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

const unavailable: SPFXCapabilities = Object.freeze({ recognition: false, onDeviceRecognition: false });

/** Mounted speech authority. Creating a recognizer never requests microphone access. */
export function createMountedSpeechClient(
  adapter: SPFXSpeechClient | undefined,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: string) => boolean,
): SPFXSpeechClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const requireAccess = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!permissions().includes("speech.recognize")) throw new DOMException("SynWare capability speech.recognize must be declared.", "SecurityError");
    if (!authorise("speech.recognize")) throw new DOMException("Policy denied SynWare capability speech.recognize.", "SecurityError");
    if (!adapter) throw new DOMException("Speech recognition is unavailable.", "NotSupportedError");
  };
  return Object.freeze({
    getCapabilities: () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable,
    createRecognizer(signal?: AbortSignal): SPFXSpeechRecognizer {
      return scope.acquire(signal, (lease, release) => {
        const recognizer = adapter?.createRecognizer(lease);
        const capabilities = () => lease.aborted ? unavailable : recognizer?.getCapabilities() ?? unavailable;
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          lease.removeEventListener("abort", dispose);
          try { recognizer?.dispose(); } finally { release(); }
        };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<SPFXSpeechRecognizer>({
          getCapabilities: capabilities,
          async getAuthorizationStatus() {
            if (lease.aborted || !recognizer) return "unavailable";
            if (!permissions().includes("speech.recognize") || !authorise("speech.recognize")) return "denied";
            const status = await recognizer.getAuthorizationStatus();
            if (lease.aborted) return "unavailable";
            return status;
          },
          async requestAuthorization(requestSignal) {
            requireAccess(lease);
            const status = await recognizer!.requestAuthorization(requestSignal);
            requireAccess(lease);
            return status;
          },
          recognitionTask(request, listener) {
            requireAccess(lease);
            const task = recognizer!.recognitionTask(request, listener ? result => { requireAccess(lease); listener(result); } : undefined);
            const result = task.result.then(value => { requireAccess(lease); return value; });
            void result.catch(() => {});
            return Object.freeze({
              result,
              // Stopping microphone work must remain possible after access is revoked.
              finish: () => task.finish(),
              cancel: () => task.cancel(),
            });
          },
          dispose,
        });
      }, recognizer => recognizer.dispose(), { sessions: 1 });
    },
  });
}
