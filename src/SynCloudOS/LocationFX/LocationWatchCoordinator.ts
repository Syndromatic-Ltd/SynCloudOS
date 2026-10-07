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

import type { LFXAccuracy, LFXAuthorizationStatus } from "../../FX/LocationFX/LFXCapabilities";
import type { LFXLocation } from "../../FX/LocationFX/LFXLocation";
import type {
  LFXLocationWatch,
  LFXLocationWatchOptions,
} from "../../FX/LocationFX/LFXLocationManager";

export interface LFXLocationHostWatchRequest {
  readonly accuracy: LFXAccuracy;
  readonly signal: AbortSignal;
}

export interface LFXLocationHostWatch {
  dispose(): void;
}

export interface LFXLocationWatchHost {
  getAuthorizationStatus(signal?: AbortSignal): Promise<LFXAuthorizationStatus>;
  watch(
    request: LFXLocationHostWatchRequest,
    listener: (location: LFXLocation) => void,
    onError?: (error: unknown) => void,
  ): LFXLocationHostWatch;
  nowMonotonicSeconds?(): number;
}

export interface LocationWatchCoordinatorSubscriptionOptions extends LFXLocationWatchOptions {
  readonly ownerKey: string;
}

type Subscriber = {
  readonly id: number;
  readonly ownerKey: string;
  readonly accuracy: LFXAccuracy;
  readonly maximumAgeSeconds: number;
  readonly minimumIntervalSeconds: number;
  readonly listener: (location: LFXLocation) => void;
  readonly signal?: AbortSignal;
  onAbort: () => void;
  lastDeliveredMonotonicSeconds: number | null;
  disposed: boolean;
};

type HostWatchRecord = {
  readonly generation: number;
  readonly accuracy: LFXAccuracy;
  readonly controller: AbortController;
  readonly watch: LFXLocationHostWatch;
  stopped: boolean;
};

const DEFAULT_MAXIMUM_AGE_SECONDS = 0;
const DEFAULT_MINIMUM_INTERVAL_SECONDS = 0;

function finiteNonnegative(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0)
    throw new RangeError(`${name} must be finite and nonnegative.`);
  return resolved;
}

function accuracy(value: LFXAccuracy | undefined): LFXAccuracy {
  if (value === undefined || value === "balanced") return "balanced";
  if (value === "high") return "high";
  throw new TypeError("Location watch accuracy is invalid.");
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

/**
 * Runtime-owned shared foreground watch coordinator.
 *
 * It owns the one host Geolocation watch for all active subscribers in a
 * runtime. Application identity remains a private partition key supplied by
 * mounted authority; it is never accepted from a public LFX call.
 */
export class LocationWatchCoordinator {
  readonly #subscribers = new Map<number, Subscriber>();
  readonly #cacheByOwner = new Map<string, LFXLocation>();
  readonly #suspendedOwners = new Set<string>();
  readonly #ownerEpoch = new Map<string, number>();
  #hostWatch: HostWatchRecord | null = null;
  #sequence = 0;
  #generation = 0;
  #disposed = false;

  constructor(private readonly host: LFXLocationWatchHost) {}

  subscribe(
    options: LocationWatchCoordinatorSubscriptionOptions,
    listener: (location: LFXLocation) => void,
  ): LFXLocationWatch {
    if (this.#disposed) throw abortError("Location watch coordinator is disposed.");
    if (typeof listener !== "function") throw new TypeError("Location watch listener must be a function.");
    options.signal?.throwIfAborted();
    const record: Subscriber = {
      id: ++this.#sequence,
      ownerKey: options.ownerKey,
      accuracy: accuracy(options.accuracy),
      maximumAgeSeconds: finiteNonnegative(
        options.maximumAgeSeconds,
        DEFAULT_MAXIMUM_AGE_SECONDS,
        "Maximum location watch age",
      ),
      minimumIntervalSeconds: finiteNonnegative(
        options.minimumIntervalSeconds,
        DEFAULT_MINIMUM_INTERVAL_SECONDS,
        "Minimum location watch interval",
      ),
      listener,
      signal: options.signal,
      onAbort: () => undefined,
      lastDeliveredMonotonicSeconds: null,
      disposed: false,
    };
    record.onAbort = () => this.#disposeSubscriber(record);
    this.#subscribers.set(record.id, record);
    options.signal?.addEventListener("abort", record.onAbort, { once: true });

    if (!this.#suspendedOwners.has(record.ownerKey)) {
      this.#deliverCached(record);
      this.#reconcileHostWatch();
    }

    let disposed = false;
    return Object.freeze({
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.#disposeSubscriber(record);
      },
    });
  }

  suspendOwner(ownerKey: string): void {
    if (this.#disposed) return;
    this.#bumpOwnerEpoch(ownerKey);
    this.#suspendedOwners.add(ownerKey);
    this.#cacheByOwner.delete(ownerKey);
    this.#reconcileHostWatch();
  }

  async resumeOwner(
    ownerKey: string,
    reauthorise?: () => boolean | Promise<boolean>,
  ): Promise<void> {
    if (this.#disposed) return;
    const epoch = this.#bumpOwnerEpoch(ownerKey);
    if (!this.#hasOwnerSubscribers(ownerKey)) {
      this.#suspendedOwners.delete(ownerKey);
      return;
    }
    try {
      if (reauthorise && !(await reauthorise())) return;
      const status = await this.host.getAuthorizationStatus();
      if (status === "denied" || status === "unavailable" || status === "prompt") return;
    } catch {
      return;
    }
    if (this.#disposed || this.#ownerEpoch.get(ownerKey) !== epoch) return;
    this.#suspendedOwners.delete(ownerKey);
    this.#cacheByOwner.delete(ownerKey);
    this.#reconcileHostWatch();
  }

  closeOwner(ownerKey: string): void {
    if (this.#disposed) return;
    this.#bumpOwnerEpoch(ownerKey);
    this.#suspendedOwners.add(ownerKey);
    this.#cacheByOwner.delete(ownerKey);
    for (const subscriber of [...this.#subscribers.values()])
      if (subscriber.ownerKey === ownerKey) this.#disposeSubscriber(subscriber, false);
    this.#reconcileHostWatch();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const subscriber of [...this.#subscribers.values()])
      this.#disposeSubscriber(subscriber, false);
    this.#cacheByOwner.clear();
    this.#suspendedOwners.clear();
    this.#stopHostWatch();
  }

  #hasOwnerSubscribers(ownerKey: string): boolean {
    for (const subscriber of this.#subscribers.values())
      if (!subscriber.disposed && subscriber.ownerKey === ownerKey) return true;
    return false;
  }

  #bumpOwnerEpoch(ownerKey: string): number {
    const next = (this.#ownerEpoch.get(ownerKey) ?? 0) + 1;
    this.#ownerEpoch.set(ownerKey, next);
    return next;
  }

  #disposeSubscriber(record: Subscriber, reconcile = true): void {
    if (record.disposed) return;
    record.disposed = true;
    record.signal?.removeEventListener("abort", record.onAbort);
    this.#subscribers.delete(record.id);
    if (!this.#hasOwnerSubscribers(record.ownerKey))
      this.#cacheByOwner.delete(record.ownerKey);
    if (reconcile) this.#reconcileHostWatch();
  }

  #activeSubscribers(): Subscriber[] {
    return [...this.#subscribers.values()].filter(
      record => !record.disposed && !this.#suspendedOwners.has(record.ownerKey),
    );
  }

  #requiredAccuracy(active: readonly Subscriber[]): LFXAccuracy | null {
    if (active.length === 0) return null;
    return active.some(record => record.accuracy === "high") ? "high" : "balanced";
  }

  #reconcileHostWatch(): void {
    if (this.#disposed) return;
    const active = this.#activeSubscribers();
    const required = this.#requiredAccuracy(active);
    if (!required) {
      this.#stopHostWatch();
      return;
    }
    if (this.#hostWatch?.accuracy === required) return;
    this.#stopHostWatch();
    this.#startHostWatch(required);
  }

  #startHostWatch(requiredAccuracy: LFXAccuracy): void {
    const generation = ++this.#generation;
    const controller = new AbortController();
    try {
      const watch = this.host.watch(
        { accuracy: requiredAccuracy, signal: controller.signal },
        location => {
          if (this.#disposed || this.#hostWatch?.generation !== generation) return;
          this.#publish(location);
        },
        () => {
          if (this.#disposed || this.#hostWatch?.generation !== generation) return;
          this.#stopHostWatch();
        },
      );
      this.#hostWatch = {
        generation,
        accuracy: requiredAccuracy,
        controller,
        watch,
        stopped: false,
      };
      if (controller.signal.aborted) this.#stopHostWatch();
    } catch (error) {
      controller.abort(error);
      throw error;
    }
  }

  #stopHostWatch(): void {
    const current = this.#hostWatch;
    if (!current) {
      ++this.#generation;
      return;
    }
    this.#hostWatch = null;
    ++this.#generation;
    if (current.stopped) return;
    current.stopped = true;
    if (!current.controller.signal.aborted)
      current.controller.abort(abortError("Shared location watch was reconfigured."));
  }

  #publish(location: LFXLocation): void {
    const active = this.#activeSubscribers();
    const owners = new Set(active.map(record => record.ownerKey));
    for (const ownerKey of owners) this.#cacheByOwner.set(ownerKey, location);
    for (const record of active) this.#deliver(record, location);
  }

  #deliverCached(record: Subscriber): void {
    if (record.maximumAgeSeconds <= 0) return;
    const cached = this.#cacheByOwner.get(record.ownerKey);
    if (!cached) return;
    const now = this.host.nowMonotonicSeconds?.();
    if (now === undefined || !Number.isFinite(now)) return;
    const age = Math.max(0, now - cached.receivedAtMonotonicSeconds);
    if (age > record.maximumAgeSeconds) return;
    this.#deliver(record, cached);
  }

  #deliver(record: Subscriber, location: LFXLocation): void {
    if (record.disposed || this.#suspendedOwners.has(record.ownerKey)) return;
    const previous = record.lastDeliveredMonotonicSeconds;
    if (previous !== null
      && location.receivedAtMonotonicSeconds - previous < record.minimumIntervalSeconds)
      return;
    record.lastDeliveredMonotonicSeconds = location.receivedAtMonotonicSeconds;
    try {
      record.listener(location);
    } catch {
      // A consumer callback cannot break the shared host watch or another app.
    }
  }
}
