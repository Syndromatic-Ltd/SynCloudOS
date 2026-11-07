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
import type { SPFXSpeechRecognizer } from "../../../FX/SpeechFX/public";
import { useSCOS } from "../scos/useSCOS";

/** A component-owned recognizer. Mounting and status queries never start recording. */
export function useSpeech(): SPFXSpeechRecognizer {
  const client = useSCOS().speech;
  const binding = useMemo(() => {
    let current: SPFXSpeechRecognizer | null = null;
    const requireRecognizer = () => {
      if (!current) throw new DOMException("The component speech owner is not mounted.", "InvalidStateError");
      return current;
    };
    const facade = Object.freeze<SPFXSpeechRecognizer>({
      getCapabilities: () => current?.getCapabilities() ?? Object.freeze({ recognition: false, onDeviceRecognition: false }),
      getAuthorizationStatus: () => current?.getAuthorizationStatus() ?? Promise.resolve("unavailable"),
      requestAuthorization: signal => requireRecognizer().requestAuthorization(signal),
      recognitionTask: (request, listener) => requireRecognizer().recognitionTask(request, listener),
      dispose: () => current?.dispose(),
    });
    return {
      facade,
      mount() {
        const owner = new AbortController();
        const recognizer = client.createRecognizer(owner.signal);
        current = recognizer;
        return () => {
          if (current === recognizer) current = null;
          owner.abort();
          recognizer.dispose();
        };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
