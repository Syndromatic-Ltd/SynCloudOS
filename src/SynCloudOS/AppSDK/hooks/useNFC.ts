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
import type { NFXNFCClient } from "../../../FX/NFCFX/public";
import { useSCOS } from "../scos/useSCOS";

/** Passive client with sessions revoked when the component unmounts. */
export function useNFC(): NFXNFCClient {
  const client = useSCOS().nfc;
  const binding = useMemo(() => {
    let owner: AbortController | undefined;
    return {
      client: Object.freeze<NFXNFCClient>({
        getCapabilities: () => client.getCapabilities(),
        createReaderSession(signal) {
          if (!owner) throw new Error("The component NFC owner is not mounted.");
          return client.createReaderSession(signal ? AbortSignal.any([owner.signal, signal]) : owner.signal);
        },
      }),
      mount() {
        const current = new AbortController(); owner = current;
        return () => { if (owner === current) owner = undefined; current.abort(); };
      },
    };
  }, [client]);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding.client;
}
