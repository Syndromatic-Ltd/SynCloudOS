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
import { CNFXContactStore, CNFXError } from "../../../FX/ContactsFX/public";
import { contactsSessionBindings, contactStores } from "../../../FX/ContactsFX/internal/contactsSessionBindings";
/** A real component-owned CNContactStore; native selection uses an NSE-presented picker. */
export function useContacts(): CNFXContactStore {
  const context = useSynWareContext();
  if (!context) throw new CNFXError("communicationError", "useContacts requires a mounted application.");
  const store = useMemo(() => {
    const sessions = scosSessionsForApp(context.appId).filter(candidate => candidate.context === context
      || (candidate.context.signal === context.signal && candidate.context.runtimeInfo.id === context.runtimeInfo.id));
    if (sessions.length !== 1) throw new CNFXError("communicationError", `Contacts application session is ${sessions.length ? "ambiguous" : "notRunning"}.`);
    const session = sessions[0]!;
    const Bound = bindFXFamily({ CNFXContactStore }, context.appId).CNFXContactStore;
    class ContextStore extends Bound {}
    let ended = false;
    contactsSessionBindings.set(ContextStore, { resolve() {
      if (context.signal.aborted || !scosSessionsForApp(context.appId).includes(session)) ended = true;
      if (ended) throw new CNFXError("communicationError", "Contacts application session is ended.");
      return session;
    } });
    return new ContextStore();
  }, [context]);
  useInsertionEffect(() => () => contactStores.get(store)!.dispose(), [store]);
  return store;
}
