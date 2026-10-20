/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { AppTrustedDiagnosticsClient } from "../AppSDK/appTrustedClientTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

/** Internal host authority, never exported by either SDK entry point. Each
 * issued client is tied to one provision, rather than a mutable provider slot. */
export interface HostDiagnosticsGrant {
  readonly client: AppTrustedDiagnosticsClient;
  readonly signal: AbortSignal;
}

interface HostDiagnosticsProvision {
  readonly current: HostDiagnosticsGrant | undefined;
  subscribe(listener: () => void): () => void;
}

const provisions = new WeakMap<SynCloudOSRuntime, HostDiagnosticsProvision>();

export function getHostDiagnosticsProvision(runtime: SynCloudOSRuntime): HostDiagnosticsProvision | undefined {
  return provisions.get(runtime);
}

/** Installing even an empty provision makes absence/revocation fail closed:
 * the facade must not fall back to the production inspector for this host. */
export function installHostDiagnosticsProvision(runtime: SynCloudOSRuntime, initial?: AppTrustedDiagnosticsClient) {
  if (provisions.has(runtime)) throw new Error("The host diagnostics provision is already installed.");
  const listeners = new Set<() => void>();
  let controller = initial ? new AbortController() : undefined;
  let current: HostDiagnosticsGrant | undefined = initial
    ? Object.freeze({ client: initial, signal: controller!.signal })
    : undefined;
  let disposed = false;
  provisions.set(runtime, Object.freeze({
    get current() { return current; },
    subscribe(listener: () => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  }));
  const replace = (client: AppTrustedDiagnosticsClient | undefined) => {
    if (disposed || runtime.signal.aborted) throw new DOMException("The host diagnostics provision was disposed.", "AbortError");
    const previous = controller;
    controller = client ? new AbortController() : undefined;
    current = client ? Object.freeze({ client, signal: controller!.signal }) : undefined;
    previous?.abort(new DOMException("The host diagnostics provider was revoked or replaced.", "AbortError"));
    for (const listener of [...listeners]) listener();
  };
  return Object.freeze({
    replace(client: AppTrustedDiagnosticsClient) { replace(client); },
    revoke() { replace(undefined); },
    dispose() {
      if (disposed) return;
      replace(undefined);
      disposed = true;
      listeners.clear();
    },
  });
}
