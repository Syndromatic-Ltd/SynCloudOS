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
import type {
  MEFXBufferQueueOptions,
  MEFXTimebaseOptions,
} from "../../../FX/MediaFX/public";
import type { MEFXMediaClient } from "../../../FX/MediaFX/MEFXMediaClient";
import { useSynWare } from "../SynWareContext";

function narrowedSignal(owner: AbortSignal, caller?: AbortSignal): AbortSignal {
  return caller ? AbortSignal.any([owner, caller]) : owner;
}

/** Component-scoped MediaFX facade. Constructing the hook requests no device
 * permission; resources are acquired only by explicit method calls. */
export function useSynWareMedia(): MEFXMediaClient {
  const client = useSynWare().media;
  const binding = useMemo(() => {
    let owner: AbortController | null = null;
    const requireOwner = () => {
      if (!owner) throw new Error("The component media owner is not mounted.");
      return owner.signal;
    };
    const facade = Object.freeze<MEFXMediaClient>({
      copyBlock(bytes: Uint8Array, signal?: AbortSignal) {
        return client.copyBlock(bytes, narrowedSignal(requireOwner(), signal));
      },
      createQueue<T>(options: MEFXBufferQueueOptions<T>, signal?: AbortSignal) {
        return client.createQueue(options, narrowedSignal(requireOwner(), signal));
      },
      observeClock(signal?: AbortSignal) {
        return client.observeClock(narrowedSignal(requireOwner(), signal));
      },
      createTimebase(options?: MEFXTimebaseOptions, signal?: AbortSignal) {
        return client.createTimebase(options, narrowedSignal(requireOwner(), signal));
      },
    });
    return {
      facade,
      mount() {
        const controller = new AbortController();
        owner = controller;
        return () => {
          if (owner === controller) owner = null;
          controller.abort(new DOMException("The component media owner was unmounted.", "AbortError"));
        };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.facade;
}
