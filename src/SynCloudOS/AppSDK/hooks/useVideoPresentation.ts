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
import { useSCOS } from "../scos/useSCOS";
import type { VFXVideoPresentationClient } from "../../../FX/VideoFX/VFXPictureInPictureController";
/** Presentation owners remain passive until start/discovery; cleanup releases them. */
export function useVideoPresentation(): VFXVideoPresentationClient {
  const client = useSCOS().videoPresentation;
  const binding = useMemo(() => {
    let lifetime: AbortController | null = null;
    const ownerSignal = (signal?: AbortSignal) => {
      if (!lifetime) throw new DOMException("Video presentation component is not mounted.", "InvalidStateError");
      return signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
    };
    const facade = Object.freeze<VFXVideoPresentationClient>({
      capabilities: target => client.capabilities(target),
      createPictureInPictureController: (target, signal) => client.createPictureInPictureController(target, ownerSignal(signal)),
      createRouteDetector: (target, signal) => client.createRouteDetector(target, ownerSignal(signal)),
    });
    return { facade, mount() {
      const owner = new AbortController();
      lifetime = owner;
      return () => { if (lifetime === owner) lifetime = null; owner.abort(); };
    } };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
