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

import { AUFXAudioSession } from "../../FX/AudioFX/AUFXAudioSession";
import type { AUFXAudioRecorder } from "../../FX/AudioFX/AUFXAudioRecorder";
import type { MountedSettlementPort } from "./mountedSettlementPort";

function observeRecorder(
  recorder: AUFXAudioRecorder,
  label: string,
  settlement: MountedSettlementPort,
): AUFXAudioRecorder {
  const record = recorder.record.bind(recorder);
  const stop = recorder.stop.bind(recorder);
  const cancel = recorder.cancel.bind(recorder);
  const dispose = recorder.dispose.bind(recorder);
  let live: ReturnType<MountedSettlementPort["exclude"]> | null = null;
  let resultObserved = false;
  const releaseLive = () => {
    live?.release();
    live = null;
  };
  const observeResult = () => {
    if (resultObserved) return;
    resultObserved = true;
    void recorder.result.then(releaseLive, releaseLive);
  };
  Object.defineProperty(recorder, "record", {
    configurable: true,
    value: (signal?: AbortSignal) => {
      const value = record(signal);
      if (recorder.state === "recording" || recorder.state === "paused") {
        releaseLive();
        live = settlement.exclude({ owner: "audio", kind: "recording", label });
        observeResult();
      }
      return value;
    },
  });
  Object.defineProperty(recorder, "stop", {
    configurable: true,
    value: () => {
      releaseLive();
      const receipt = stop();
      return settlement.track(receipt, { owner: "audio", kind: "stop", label });
    },
  });
  Object.defineProperty(recorder, "cancel", {
    configurable: true,
    value: (reason?: unknown) => {
      releaseLive();
      return cancel(reason);
    },
  });
  Object.defineProperty(recorder, "dispose", {
    configurable: true,
    value: () => {
      releaseLive();
      return dispose();
    },
  });
  return recorder;
}

export function createAudioSessionFacade(
  session: AUFXAudioSession,
  release: () => void,
  appId?: string,
  settlement?: MountedSettlementPort,
): AUFXAudioSession {
  const label = appId ?? "mounted-audio-recording";
  const facade = new AUFXAudioSession({
          get state() { return session.state; },
          get route() { return session.route; },
          get capabilities() { return session.capabilities; },
          requestRecordAuthorization: signal => session.requestRecordAuthorization(signal),
          enumerateDevices: signal => session.enumerateDevices(signal),
          setPreferredInput: (id, signal) => session.setPreferredInput(id, signal),
          setPreferredOutput: (id, signal) => session.setPreferredOutput(id, signal),
          createRecorder: options => {
            const recorder = session.createRecorder(options);
            return settlement ? observeRecorder(recorder, label, settlement) : recorder;
          },
          createInputNode: format => session.createInputNode(format),
          subscribe: listener => session.subscribe(listener),
          dispose: () => { try { session.dispose(); } finally { release(); } },
        });
  Object.freeze(facade);
  return facade;
}
