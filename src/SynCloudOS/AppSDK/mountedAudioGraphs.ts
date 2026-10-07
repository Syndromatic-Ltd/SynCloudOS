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

import type { AUFXAudioFormat } from "../../FX/AudioFX/AUFXAudioFormat";
import type { AudioGraphHostService } from "../HostServices/AppSDKHostServiceTypes";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";
import type { MountedSettlementPort } from "./mountedSettlementPort";

export function createMountedAudioGraphs(
  host: AudioGraphHostService,
  owner: AbortSignal,
  permissions: () => readonly string[],
  appId?: string,
  capability: object = Object.freeze({}),
  settlement?: MountedSettlementPort,
) {
  const scope = createMountedResourceScope(owner);
  return Object.freeze({
    createEngine(format: AUFXAudioFormat, signal?: AbortSignal) {
      owner.throwIfAborted();
      if (!permissions().includes("audio.play")) throw new DOMException("SynWare capability audio.play must be declared.", "SecurityError");
      return scope.acquire(signal, (lease, release) => {
        const engine = host.createEngine(format, lease, appId, capability);
        const dispose = engine.dispose.bind(engine);
        let revokeSettlement = () => {};
        if (settlement) {
          const start = engine.start.bind(engine);
          const stop = engine.stop.bind(engine);
          const label = appId ?? "mounted-audio";
          let startGeneration = 0;
          let live: ReturnType<MountedSettlementPort["exclude"]> | null = null;
          const releaseLive = () => {
            live?.release();
            live = null;
          };
          revokeSettlement = () => { ++startGeneration; releaseLive(); };
          Object.defineProperty(engine, "start", {
            configurable: true,
            value: (startSignal?: AbortSignal) => {
              const generation = ++startGeneration;
              const receipt = start(startSignal);
              const observed = settlement.track(receipt, { owner: "audio", kind: "start", label });
              return observed.then((value) => {
                if (generation === startGeneration && !lease.aborted) {
                  releaseLive();
                  live = settlement.exclude({ owner: "audio", kind: "stream", label });
                }
                return value;
              });
            },
          });
          Object.defineProperty(engine, "stop", {
            configurable: true,
            value: () => {
              revokeSettlement();
              return stop();
            },
          });
          lease.addEventListener("abort", releaseLive, { once: true });
        }
        Object.defineProperty(engine, "dispose", {
          configurable: true,
          value: () => {
            revokeSettlement();
            try { dispose(); } finally { release(); }
          },
        });
        return engine;
      }, (engine) => engine.dispose());
    },
  });
}
