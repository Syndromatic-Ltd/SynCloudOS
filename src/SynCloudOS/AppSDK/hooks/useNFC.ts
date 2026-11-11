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

import type { DFXQueue } from "../../../FX/DispatchFX/DFXQueue";
import { useInsertionEffect, useMemo } from "react";
import { useSynWareContext } from "../SynWareContext";
import { bindFXFamily } from "../fx/bindFXFamily";
import { scosSessionsForApp } from "../scos/scosSessionRegistry";
import { NFXNDEFReaderSession, NFXReaderError, type NFXNDEFReaderSessionDelegate } from "../../../FX/NFCFX/public";
import { nfcSessionBindings, nfcSessions } from "../../../FX/NFCFX/internal/nfcSessionBindings";
/** A real component-owned NFCNDEFReaderSession, begun from a user gesture. */
export function useNFC(delegate: NFXNDEFReaderSessionDelegate, queue: DFXQueue | null = null, invalidateAfterFirstRead = true): NFXNDEFReaderSession {
  const context = useSynWareContext();
  if (!context) throw new NFXReaderError("readerTransceiveErrorSessionInvalidated", "useNFC requires a mounted application.");
  const controller = useMemo(() => {
    const sessions = scosSessionsForApp(context.appId).filter(candidate => candidate.context === context
      || (candidate.context.signal === context.signal && candidate.context.runtimeInfo.id === context.runtimeInfo.id));
    if (sessions.length !== 1) throw new NFXReaderError("readerTransceiveErrorSessionInvalidated", `NFC application session is ${sessions.length ? "ambiguous" : "notRunning"}.`);
    const session = sessions[0]!;
    const Bound = bindFXFamily({ NFXNDEFReaderSession }, context.appId).NFXNDEFReaderSession;
    class ContextController extends Bound {}
    let ended = false;
    nfcSessionBindings.set(ContextController, { resolve() {
      if (context.signal.aborted || !scosSessionsForApp(context.appId).includes(session)) ended = true;
      if (ended) throw new NFXReaderError("readerTransceiveErrorSessionInvalidated", "NFC application session is ended.");
      return session;
    } });
    return new ContextController(delegate, queue, invalidateAfterFirstRead);
  }, [context, delegate, queue, invalidateAfterFirstRead]);
  useInsertionEffect(() => () => nfcSessions.get(controller)!.dispose(), [controller]);
  return controller;
}
