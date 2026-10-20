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

import type { SynWareContextValue } from "../appContextTypes";
import { scosAmbiguousSessionError, scosAppNotRunningError } from "./scosErrors";

/** One mounted app on the page. The facade resolves it at call time so a
 * timer, an awaited continuation or module-level code reaches the same app
 * the module was bound to, even after a remount replaced the session. */
export interface SCOSAppSession {
  readonly appId: string;
  readonly title: string;
  readonly version: string;
  readonly context: SynWareContextValue;
}

const sessionsByApp = new Map<string, SCOSAppSession[]>();
const titlesByApp = new Map<string, string>();

/** Publishes a mounted session until the returned disposer runs. Several
 * sessions may share an app id (tests, several runtimes); React code binds by
 * context value, module-scope code reports the ambiguity instead of guessing. */
export function registerSCOSAppSession(session: SCOSAppSession): () => void {
  const siblings = sessionsByApp.get(session.appId) ?? [];
  sessionsByApp.set(session.appId, [...siblings, session]);
  titlesByApp.set(session.appId, session.title);
  return () => {
    const remaining = (sessionsByApp.get(session.appId) ?? []).filter((candidate) => candidate !== session);
    if (remaining.length === 0) sessionsByApp.delete(session.appId);
    else sessionsByApp.set(session.appId, remaining);
  };
}

export function scosSessionsForApp(appId: string): readonly SCOSAppSession[] {
  return sessionsByApp.get(appId) ?? [];
}


export function resolveSCOSSession(appId: string, title?: string): SCOSAppSession {
  const sessions = scosSessionsForApp(appId).filter(session => !session.context.signal.aborted);
  const displayTitle = title ?? sessions[0]?.title ?? titlesByApp.get(appId);
  if (sessions.length === 0) throw scosAppNotRunningError(appId, displayTitle);
  const runtimes = new Set(sessions.map(session => session.context.runtimeInfo.id));
  if (runtimes.size > 1) throw scosAmbiguousSessionError(appId, displayTitle, runtimes.size);
  return sessions[sessions.length - 1];
}
