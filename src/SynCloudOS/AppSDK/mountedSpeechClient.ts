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

import type { SPFXCapabilities, SPFXSpeechClient, SPFXSpeechRecognizer, SPFXSpeechRecognitionTask } from "../../FX/SpeechFX/public";
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";

const unavailable: SPFXCapabilities = Object.freeze({ recognition: false, onDeviceRecognition: false });

/** Mounted speech authority. Creating a recognizer never requests microphone access. */
export function createMountedSpeechClient(
  adapter: SPFXSpeechClient | undefined,
  mountSignal: AbortSignal,
  entitlements: () => readonly string[],
  authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort,
): SPFXSpeechClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const requireAccess = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!entitlements().includes("speech.recognize")) throw new DOMException("SynWare entitlement speech.recognize must be declared.", "SecurityError");
    if (!authorise("speech.recognize")) throw new DOMException("Privacy authorisation denied speech.recognize.", "SecurityError");
    privacy?.assertRequestAllowed();
    if (!adapter) throw new DOMException("Speech recognition is unavailable.", "NotSupportedError");
  };
  return Object.freeze({
    getCapabilities: () => mountSignal.aborted ? unavailable : adapter?.getCapabilities() ?? unavailable,
    createRecognizer(signal?: AbortSignal): SPFXSpeechRecognizer {
      return scope.acquire(signal, (lease, release) => {
        const recognizer = adapter?.createRecognizer(lease);
        const capabilities = () => lease.aborted ? unavailable : recognizer?.getCapabilities() ?? unavailable;
        let disposed = false;
        let unbindPrivacy: (() => void) | undefined;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          unbindPrivacy?.(); unbindPrivacy = undefined;
          lease.removeEventListener("abort", dispose);
          try { recognizer?.dispose(); } finally { release(); }
        };
        const bindPrivacy = () => { if (privacy && !unbindPrivacy) unbindPrivacy = privacy.bindResource(dispose); };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze<SPFXSpeechRecognizer>({
          getCapabilities: capabilities,
          async getAuthorizationStatus() {
            if (lease.aborted || !recognizer) return "unavailable";
            if (!entitlements().includes("speech.recognize") || !authorise("speech.recognize")) return "denied";
            const query = async () => { const status = await recognizer.getAuthorizationStatus(); lease.throwIfAborted(); return status; };
            try { return privacy ? await privacy.getAuthorizationStatus(query) : await query(); }
            catch (error) { if (lease.aborted) return "unavailable"; throw error; }
          },
          async requestAuthorization(requestSignal) {
            requireAccess(lease);
            const operationSignal = requestSignal ? AbortSignal.any([lease, requestSignal]) : lease;
            const operation = async (signal: AbortSignal) => {
              const alreadyBound = !!unbindPrivacy;
              bindPrivacy();
              try {
                const status = await recognizer!.requestAuthorization(signal);
                requireAccess(lease); signal.throwIfAborted();
                // A completed refusal has no live capture to retain. Release this
                // request's binding before the store records denial, so its status
                // is returned rather than cancelling its own completed request.
                if (status !== "granted" && !alreadyBound) { unbindPrivacy?.(); unbindPrivacy = undefined; }
                return status;
              } catch (error) {
                if (!alreadyBound) { unbindPrivacy?.(); unbindPrivacy = undefined; }
                throw error;
              }
            };
            return privacy ? privacy.requestAuthorization(operation, { signal: operationSignal }) : operation(operationSignal);
          },
          recognitionTask(request, listener) {
            requireAccess(lease);
            const deliver = listener ? (result: Parameters<NonNullable<typeof listener>>[0]) => {
              try { requireAccess(lease); } catch { dispose(); return; }
              listener(result);
            } : undefined;
            if (!privacy) {
              const task = recognizer!.recognitionTask(request, deliver);
              const result = task.result.then(value => { requireAccess(lease); return value; });
              void result.catch(() => {});
              return Object.freeze({ result, finish: () => task.finish(), cancel: () => task.cancel() });
            }
            const taskOwner = new AbortController();
            const operationSignal = AbortSignal.any([lease, taskOwner.signal, ...(request.signal ? [request.signal] : [])]);
            let task: SPFXSpeechRecognitionTask | undefined;
            let finishRequested = false;
            const started = privacy.request(signal => {
              signal.throwIfAborted(); requireAccess(lease); bindPrivacy();
              task = recognizer!.recognitionTask({ ...request, signal: operationSignal }, deliver);
              if (finishRequested) task.finish();
              return task;
            }, { signal: operationSignal, dispose: value => value.cancel() });
            const result = started.then(value => privacy.request(async () => {
              const result = await value.result;
              requireAccess(lease); operationSignal.throwIfAborted();
              return result;
            }, { signal: operationSignal }));
            void result.catch(() => {});
            return Object.freeze({
              result,
              // Stopping microphone work remains possible after consent is withdrawn.
              finish: () => { finishRequested = true; task?.finish(); },
              cancel: () => { taskOwner.abort(new DOMException("Speech recognition was cancelled.", "AbortError")); task?.cancel(); },
            });
          },
          dispose,
        });
      }, recognizer => recognizer.dispose(), { sessions: 1 });
    },
  });
}
