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

import { useInsertionEffect, useMemo } from "react";
import { useSynWareContext } from "../SynWareContext";
import { bindFXFamily } from "../fx/bindFXFamily";
import { scosSessionsForApp } from "../scos/scosSessionRegistry";
import { SPFXSpeechRecognizer, SPFXError } from "../../../FX/SpeechFX/public";
import { speechSessionBindings, speechRecognizers } from "../../../FX/SpeechFX/internal/speechSessionBindings";
/** A real, passive recognizer. Insertion lifetime survives StrictMode effect replay. */
export function useSpeech(): SPFXSpeechRecognizer {
  const context = useSynWareContext();
  if (!context) throw new SPFXError("kAFAssistantErrorDomain", 1101, "useSpeech requires a mounted application.");
  const recognizer = useMemo(() => {
    const sessions = scosSessionsForApp(context.appId).filter(candidate => candidate.context === context
      || (candidate.context.signal === context.signal && candidate.context.runtimeInfo.id === context.runtimeInfo.id));
    if (sessions.length !== 1) throw new SPFXError("kAFAssistantErrorDomain", 1101, `Speech application session is ${sessions.length ? "ambiguous" : "notRunning"}.`);
    const session = sessions[0]!;
    const Bound = bindFXFamily({ SPFXSpeechRecognizer }, context.appId).SPFXSpeechRecognizer;
    class ContextRecognizer extends Bound {}
    let ended = false;
    speechSessionBindings.set(ContextRecognizer, { resolve() {
      if (context.signal.aborted || !scosSessionsForApp(context.appId).includes(session)) ended = true;
      if (ended) throw new SPFXError("kAFAssistantErrorDomain", 216, "Speech application session is ended.");
      return session;
    } });
    return new ContextRecognizer();
  }, [context]);
  useInsertionEffect(() => () => speechRecognizers.get(recognizer)!.dispose(), [recognizer]);
  return recognizer;
}
