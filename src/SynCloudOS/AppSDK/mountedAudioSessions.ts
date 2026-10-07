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

import { createAudioSessionFacade } from "./audioSessionFacade";
import { AUFXAudioSession } from "../../FX/AudioFX/AUFXAudioSession";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";
import type { MountedSettlementPort } from "./mountedSettlementPort";

export interface MountedAudioSessionFactory {
  createSession(signal?: AbortSignal): AUFXAudioSession;
}
type MountedAudioSessionHost = { createSession(signal?: AbortSignal, capability?: object): AUFXAudioSession };

export function createMountedAudioSessions(
  host: MountedAudioSessionHost | undefined,
  owner: AbortSignal,
  permissions: () => readonly string[],
  capability: object = Object.freeze({}),
  appId?: string,
  settlement?: MountedSettlementPort,
): MountedAudioSessionFactory {
  const scope = createMountedResourceScope(owner);
  return Object.freeze({
    createSession(signal?: AbortSignal) {
      owner.throwIfAborted();
      if (!permissions().includes("audio.record")) throw new DOMException("SynWare capability audio.record must be declared.", "SecurityError");
      if (!host) throw new DOMException("Audio recording is unavailable on this host.", "NotSupportedError");
      return scope.acquire(signal, (lease, release) => {
        const session = host.createSession(lease, capability);
        return createAudioSessionFacade(session, release, appId, settlement);
      }, (session) => session.dispose());
    },
  });
}
