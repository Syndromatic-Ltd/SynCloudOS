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
import { NWFXPathMonitor, NWFXError } from "../../../FX/NetworkFX/public";
import { networkSessionBindings } from "../../../FX/NetworkFX/internal/networkSessionBindings";
/** A real, passive monitor owned by this component's actual insertion lifetime.
 * Set pathUpdateHandler and start in an effect. StrictMode layout replay does not cancel it. */
export function useNetwork(): NWFXPathMonitor {
  const context = useSynWareContext();
  if (!context) throw NWFXError.posix(6, "useNetwork requires a mounted application.");
  const monitor = useMemo(() => {
    const session = scosSessionsForApp(context.appId).find(candidate => candidate.context === context);
    if (!session) throw NWFXError.posix(6, "Network application session is notRunning.");
    const Bound = bindFXFamily({ NWFXPathMonitor }, context.appId).NWFXPathMonitor;
    class ContextMonitor extends Bound {}
    let ended = false;
    networkSessionBindings.set(ContextMonitor, { resolve() {
      if (context.signal.aborted || !scosSessionsForApp(context.appId).includes(session)) ended = true;
      if (ended) throw NWFXError.posix(89, "Network application session is ended.");
      return session;
    } });
    return new ContextMonitor();
  }, [context]);
  useInsertionEffect(() => () => monitor.cancel(), [monitor]);
  return monitor;
}
