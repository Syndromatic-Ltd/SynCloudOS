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

import type { RuntimeResourceParticipant } from "./AppSDKHostServiceTypes";

/** Where a mount reports residency it owns (runtime.resources), as `owner`. */
export interface MountedResourceAccounting {
  readonly owner: string;
  register(participant: RuntimeResourceParticipant): () => void;
}

export type MountedResourceBudgetKind = "bytes" | "frames" | "sessions" | "workerJobs";
export type MountedResourceCharge = Readonly<Partial<Record<MountedResourceBudgetKind, number>>>;

export interface MountedResourceScopeOptions {
  readonly maxResources?: number;
  readonly budgets?: MountedResourceCharge;
}

export interface MountedResourceReservation {
  /** Replace a charge atomically; failure leaves the previous reservation intact. */
  resize(charge: MountedResourceCharge): void;
  release(): void;
}

export interface MountedResourceScopeSnapshot {
  readonly resources: number;
  readonly usage: Readonly<Record<MountedResourceBudgetKind, number>>;
}

const budgetKinds = Object.freeze(["bytes", "frames", "sessions", "workerJobs"] as const);

function checkedCount(value: number | undefined, fallback: number, label: string): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 0) throw new RangeError(`${label} must be a nonnegative safe integer.`);
  return candidate;
}

function normaliseCharge(charge: MountedResourceCharge | undefined): Record<MountedResourceBudgetKind, number> {
  return {
    bytes: checkedCount(charge?.bytes, 0, "Mounted resource byte charge"),
    frames: checkedCount(charge?.frames, 0, "Mounted resource frame charge"),
    sessions: checkedCount(charge?.sessions, 0, "Mounted resource session charge"),
    workerJobs: checkedCount(charge?.workerJobs, 0, "Mounted resource worker-job charge"),
  };
}

/** Host-only leases link caller cancellation to mount/runtime revocation while
 * keeping accounting charged until the host reports actual release. */
export function createMountedResourceScope(owner: AbortSignal, options: number | MountedResourceScopeOptions = 8) {
  const maxResources = typeof options === "number"
    ? checkedCount(options, 8, "Mounted resource limit")
    : checkedCount(options.maxResources, 8, "Mounted resource limit");
  const limits = normaliseCharge(typeof options === "number" ? undefined : options.budgets);
  for (const kind of budgetKinds) if (typeof options !== "number" && options.budgets?.[kind] === undefined) limits[kind] = Number.MAX_SAFE_INTEGER;
  const usage: Record<MountedResourceBudgetKind, number> = { bytes: 0, frames: 0, sessions: 0, workerJobs: 0 };
  const entries = new Set<{ revoke(reason?: unknown): void; release(): void }>();
  const reserve = (charge?: MountedResourceCharge): MountedResourceReservation => {
    owner.throwIfAborted();
    const reserved = normaliseCharge(charge);
    for (const kind of budgetKinds) {
      if (reserved[kind] > limits[kind] - usage[kind]) {
        throw new DOMException(`Mounted resource ${kind} budget reached.`, "QuotaExceededError");
      }
    }
    for (const kind of budgetKinds) usage[kind] += reserved[kind];
    let released = false;
    return Object.freeze({
      resize(charge: MountedResourceCharge) {
        owner.throwIfAborted();
        if (released) throw new DOMException("Mounted resource reservation was released.", "InvalidStateError");
        const next = normaliseCharge(charge);
        for (const kind of budgetKinds) {
          if (next[kind] > limits[kind] - usage[kind] + reserved[kind])
            throw new DOMException(`Mounted resource ${kind} budget reached.`, "QuotaExceededError");
        }
        for (const kind of budgetKinds) {
          usage[kind] += next[kind] - reserved[kind];
          reserved[kind] = next[kind];
        }
      },
      release() {
        if (released) return;
        released = true;
        for (const kind of budgetKinds) usage[kind] -= reserved[kind];
      },
    });
  };
  owner.addEventListener("abort", () => {
    for (const entry of [...entries]) entry.revoke(owner.reason);
  }, { once: true });
  return {
    reserve,
    snapshot(): MountedResourceScopeSnapshot {
      return Object.freeze({
        resources: entries.size,
        usage: Object.freeze({ ...usage }),
      });
    },
    acquire<T>(
      caller: AbortSignal | undefined,
      create: (signal: AbortSignal, release: () => void) => T,
      discard?: (value: T) => void,
      charge?: MountedResourceCharge,
    ): T {
      owner.throwIfAborted();
      caller?.throwIfAborted();
      if (entries.size >= maxResources) throw new DOMException("Mounted resource limit reached.", "QuotaExceededError");
      const budgetReservation = reserve(charge);
      const controller = new AbortController();
      let released = false;
      const revoke = (reason?: unknown) => {
        if (controller.signal.aborted) return;
        controller.abort(reason ?? new DOMException("Mounted resource was revoked.", "AbortError"));
      };
      const release = () => {
        if (released) return;
        released = true;
        entries.delete(entry);
        caller?.removeEventListener("abort", revokeCaller);
        budgetReservation.release();
        if (!controller.signal.aborted) controller.abort(new DOMException("Mounted resource was released.", "AbortError"));
      };
      const entry = { revoke, release };
      const revokeCaller = () => revoke(caller?.reason);
      entries.add(entry);
      caller?.addEventListener("abort", revokeCaller, { once: true });
      let retainReservation = false;
      try {
        const value = create(controller.signal, release);
        if (controller.signal.aborted) {
          if (discard) {
            try { discard(value); release(); }
            catch { retainReservation = true; }
          } else retainReservation = true;
          throw controller.signal.reason instanceof Error
            ? controller.signal.reason
            : new DOMException("Mounted resource was revoked during acquisition.", "AbortError");
        }
        return value;
      }
      catch (error) {
        if (!retainReservation) release();
        throw error;
      }
    },
  };
}
