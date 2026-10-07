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
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type { LFXAuthorizationStatus } from "../../FX/LocationFX/LFXCapabilities";
import type { LFXLocation } from "../../FX/LocationFX/LFXLocation";
import type {
  LFXLocationManager,
  LFXLocationRequestOptions,
  LFXLocationWatchOptions,
} from "../../FX/LocationFX/LFXLocationManager";
import {
  LocationWatchCoordinator,
  type LFXLocationHostWatchRequest,
  type LFXLocationWatchHost,
} from "./LocationWatchCoordinator";

export interface LFXLocationAdapterRequest extends LFXLocationRequestOptions {
  readonly signal: AbortSignal;
}

/** Private host seam. Public apps receive only mounted LFXLocationManager projections. */
export interface LFXLocationAdapter extends LFXLocationWatchHost {
  current(options: LFXLocationAdapterRequest): Promise<LFXLocation>;
}

const unavailableAdapter: LFXLocationAdapter = Object.freeze({
  async getAuthorizationStatus(): Promise<LFXAuthorizationStatus> {
    return "unavailable";
  },
  async current({ signal }: LFXLocationAdapterRequest): Promise<LFXLocation> {
    signal.throwIfAborted();
    throw new DOMException("No location adapter is installed.", "NotFoundError");
  },
  watch({ signal }: LFXLocationHostWatchRequest) {
    signal.throwIfAborted();
    throw new DOMException("No location adapter is installed.", "NotFoundError");
  },
});

function linkedSignal(owner: AbortSignal, caller?: AbortSignal): Readonly<{ signal: AbortSignal; dispose(): void }> {
  owner.throwIfAborted();
  caller?.throwIfAborted();
  const controller = new AbortController();
  const relay = (signal: AbortSignal) => {
    if (!controller.signal.aborted)
      controller.abort(signal.reason ?? new DOMException("Location request was aborted.", "AbortError"));
  };
  const ownerAbort = () => relay(owner);
  const callerAbort = () => caller && relay(caller);
  owner.addEventListener("abort", ownerAbort, { once: true });
  caller?.addEventListener("abort", callerAbort, { once: true });
  const dispose = () => {
    owner.removeEventListener("abort", ownerAbort);
    caller?.removeEventListener("abort", callerAbort);
  };
  controller.signal.addEventListener("abort", dispose, { once: true });
  return Object.freeze({ signal: controller.signal, dispose });
}

export class LocationService {
  readonly #watchCoordinator: LocationWatchCoordinator;
  readonly #managers = new Set<{
    readonly appId: string | null;
    readonly reauthorise?: () => boolean | Promise<boolean>;
    dispose(): void;
  }>();
  readonly #closedOwners = new Set<string>();
  #managerSequence = 0;
  #disposed = false;

  constructor(private readonly adapter: LFXLocationAdapter = unavailableAdapter) {
    this.#watchCoordinator = new LocationWatchCoordinator(adapter);
  }

  createManager(options: Readonly<{
    signal?: AbortSignal;
    appId?: string;
    reauthorise?: () => boolean | Promise<boolean>;
  }> = {}): LFXLocationManager {
    if (this.#disposed) throw new Error("Location service is disposed.");
    options.signal?.throwIfAborted();
    if (options.appId && this.#closedOwners.has(options.appId))
      throw new DOMException("Location owner is closed.", "AbortError");
    const owner = new AbortController();
    const adapter = this.adapter;
    const ownerKey = options.appId ?? `manager:${++this.#managerSequence}`;
    const revoke = () => owner.abort(options.signal?.reason ?? new DOMException("Location owner was revoked.", "AbortError"));
    options.signal?.addEventListener("abort", revoke, { once: true });
    let released = false;
    let managerRecord!: {
      readonly appId: string | null;
      readonly reauthorise?: () => boolean | Promise<boolean>;
      dispose(): void;
    };
    const dispose = () => {
      if (released) return;
      released = true;
      options.signal?.removeEventListener("abort", revoke);
      owner.abort(new DOMException("Location manager was disposed.", "AbortError"));
      this.#managers.delete(managerRecord);
    };
    const manager = Object.freeze<LFXLocationManager>({
      async getAuthorizationStatus() {
        owner.signal.throwIfAborted();
        const status = await adapter.getAuthorizationStatus(owner.signal);
        owner.signal.throwIfAborted();
        return status;
      },
      async current(request: LFXLocationRequestOptions = {}) {
        owner.signal.throwIfAborted();
        const linked = linkedSignal(owner.signal, request.signal);
        try {
          const location = await adapter.current({ ...request, signal: linked.signal });
          linked.signal.throwIfAborted();
          return location;
        } finally {
          linked.dispose();
        }
      },
      watch(request: LFXLocationWatchOptions, listener: (location: LFXLocation) => void) {
        owner.signal.throwIfAborted();
        const linked = linkedSignal(owner.signal, request.signal);
        let subscription;
        try {
          subscription = thisService.#watchCoordinator.subscribe(
            { ...request, ownerKey, signal: linked.signal },
            listener,
          );
        } catch (error) {
          linked.dispose();
          throw error;
        }
        let disposed = false;
        return Object.freeze({
          dispose() {
            if (disposed) return;
            disposed = true;
            try { subscription.dispose(); } finally { linked.dispose(); }
          },
        });
      },
      dispose,
    });
    const thisService = this;
    managerRecord = {
      appId: options.appId ?? null,
      reauthorise: options.reauthorise,
      dispose,
    };
    this.#managers.add(managerRecord);
    return manager;
  }

  suspendOwner(appId: string): void {
    if (this.#disposed) return;
    this.#watchCoordinator.suspendOwner(appId);
  }

  async resumeOwner(appId: string): Promise<void> {
    if (this.#disposed) return;
    this.#closedOwners.delete(appId);
    const authorisers = [...this.#managers]
      .filter(manager => manager.appId === appId && manager.reauthorise)
      .map(manager => manager.reauthorise!);
    await this.#watchCoordinator.resumeOwner(appId, async () => {
      for (const authorise of authorisers)
        if (!(await authorise())) return false;
      return true;
    });
  }

  closeOwner(appId: string): void {
    if (this.#disposed) return;
    this.#closedOwners.add(appId);
    for (const manager of [...this.#managers])
      if (manager.appId === appId) manager.dispose();
    this.#watchCoordinator.closeOwner(appId);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const manager of [...this.#managers]) manager.dispose();
    this.#managers.clear();
    this.#watchCoordinator.dispose();
    this.#closedOwners.clear();
  }
}
