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

import type { AppServiceClient, AppServiceResult, AppWindowClient, AppWindowSnapshot } from "../appClientTypes";
import { isAuthenticSynWareServiceToken, SynWareServiceAcquisitionError, type SynWareServiceToken } from "../serviceToken";

/** A standalone no-privilege service fake for component tests. It satisfies
 * the public client interface while always returning an explicit denial. */
export function createDeniedFakeServiceClient(message = "The fake host did not expose this service.") {
  const client = Object.freeze({
    optional<TClient>(_token: SynWareServiceToken<TClient>): AppServiceResult<TClient> {
      return Object.freeze({
        available: false,
        client: null,
        denial: Object.freeze({ code: "unavailable" as const, message }),
      });
    },
    require(token: SynWareServiceToken<unknown>): never {
      throw new SynWareServiceAcquisitionError(isAuthenticSynWareServiceToken(token) ? token.id : "invalid-token", Object.freeze({ code: "unavailable", message }));
    },
    subscribe(_token: SynWareServiceToken<unknown>, _listener: () => void) { return () => undefined; },
  } satisfies AppServiceClient);
  return client;
}

export interface FakeWindowClientControl {
  readonly client: AppWindowClient;
  setState(state: AppWindowSnapshot["state"]): void;
}

/** A component-test-only presentation client with no WindowManager escape. */
export function createFakeWindowClient(appId = "test-app", sessionId = "test-session"): FakeWindowClientControl {
  let snapshot: AppWindowSnapshot = Object.freeze({
    appId,
    sessionId,
    state: "open",
    current: null,
    owned: Object.freeze([]),
  });
  const listeners = new Set<() => void>();
  const client = Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openDocumentWindow: () => Promise.reject(new DOMException("The fake window host exposes no document windows.", "SecurityError")),
    focus: () => { throw new DOMException("The fake window host exposes no owned windows.", "SecurityError"); },
    minimise: () => { throw new DOMException("The fake window host exposes no owned windows.", "SecurityError"); },
    zoom: () => { throw new DOMException("The fake window host exposes no owned windows.", "SecurityError"); },
    setTitle: () => { throw new DOMException("The fake window host exposes no owned windows.", "SecurityError"); },
    close: () => Promise.reject(new DOMException("The fake window host exposes no owned windows.", "SecurityError")),
  } satisfies AppWindowClient);
  return Object.freeze({
    client,
    setState(state: AppWindowSnapshot["state"]) {
      if (snapshot.state === state) return;
      snapshot = Object.freeze({ appId, sessionId, state, current: null, owned: Object.freeze([]) });
      for (const listener of listeners) listener();
    },
  });
}
