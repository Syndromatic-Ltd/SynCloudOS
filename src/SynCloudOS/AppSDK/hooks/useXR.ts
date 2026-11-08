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
import { XRFXSession, XRFXError } from "../../../FX/XRFX/public";
import { xrBindings, xrSessions, deferredXRTypes } from "../../../FX/XRFX/internal/xrBindings";
import { useSynWareContext } from "../SynWareContext";
import { bindFXFamily } from "../fx/bindFXFamily";
import { scosSessionsForApp } from "../scos/scosSessionRegistry";
/** A real component-owned ARSession. Native access begins only when run is called. */
export function useXR(): XRFXSession {
  const context = useSynWareContext();
  if (!context) throw new XRFXError("requestFailed", "useXR requires a mounted application.");
  const session = useMemo(() => {
    const sessions = scosSessionsForApp(context.appId).filter(candidate => candidate.context === context || (candidate.context.signal === context.signal && candidate.context.runtimeInfo.id === context.runtimeInfo.id));
    if (sessions.length !== 1) throw new XRFXError("requestFailed", `XR application session is ${sessions.length ? "ambiguous" : "notRunning"}.`);
    const selected = sessions[0]!;
    const Bound = bindFXFamily({ XRFXSession }, context.appId).XRFXSession;
    class ContextSession extends Bound {}
    let ended = false;
    xrBindings.set(ContextSession, { resolve() {
      if (context.signal.aborted || !scosSessionsForApp(context.appId).includes(selected)) ended = true;
      if (ended) throw new XRFXError("requestFailed", "XR application session is ended.");
      return selected;
    } });
    deferredXRTypes.add(ContextSession);
    return new ContextSession();
  }, [context]);
  useInsertionEffect(() => { xrSessions.get(session)!.activate(); return () => xrSessions.get(session)!.dispose(); }, [session]);
  return session;
}
