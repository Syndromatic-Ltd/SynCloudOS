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

// Shared admission for heavy asynchronous CPU work (image graphs, index
// maintenance, PDF preparation, compositing jobs) across one runtime.
//
// This is capacity and fairness only: it never executes work, owns no worker
// and knows no clock domain. Realtime domains (audio rendering, MIDI
// scheduling, pointer input, animation frames) must not route through it.
// A lease stays charged (one slot plus its declared bytes) until the holder
// reports actual release, including after cancellation, so an aborted job
// whose worker is still running continues to count against capacity.

export type HeavyJobPriority = "user-blocking" | "user-visible" | "background";

export interface HeavyJobRequest {
  /** Owner used for fairness and diagnostics (application or subsystem ID). */
  readonly owner: string;
  /** Operation kind, e.g. "imagefx.render". */
  readonly kind: string;
  readonly priority?: HeavyJobPriority;
  /** Payload/working bytes reserved from admission until release. */
  readonly bytes?: number;
  /** A newer queued request with the same key supersedes this one while it
   * is still waiting (latest-wins previews). Admitted jobs are unaffected. */
  readonly supersedeKey?: string;
  readonly signal?: AbortSignal;
}

export interface HeavyJobLease {
  readonly id: number;
  readonly owner: string;
  readonly kind: string;
  readonly bytes: number;
  /** Time spent queued before admission. */
  readonly waitedMs: number;
  release(): void;
}

export interface HeavyJobCapacity {
  readonly concurrency: number;
  readonly maximumBytes: number;
}

export interface HeavyJobAdmissionSnapshot extends HeavyJobCapacity {
  readonly active: number;
  readonly queued: number;
  readonly activeBytes: number;
  readonly queuedBytes: number;
  readonly admitted: number;
  readonly superseded: number;
  readonly activeByKind: Readonly<Record<string, number>>;
}

/** Narrow port consumed by job producers (backends accept this, not the
 * runtime object). */
export interface HeavyJobAdmissionPort {
  /** A lease when capacity is free and nothing is waiting; otherwise null. */
  tryAdmit(request: HeavyJobRequest): HeavyJobLease | null;
  admit(request: HeavyJobRequest): Promise<HeavyJobLease>;
}

export interface HeavyJobAdmission extends HeavyJobAdmissionPort {
  snapshot(): HeavyJobAdmissionSnapshot;
  /** Adaptive policy hook; applies to waiting jobs immediately. */
  setCapacity(capacity: Partial<HeavyJobCapacity>): void;
  dispose(reason?: unknown): void;
}

export interface HeavyJobAdmissionOptions extends Partial<HeavyJobCapacity> {
  readonly maximumQueued?: number;
  /** Clock for queue-wait diagnostics; injected by the runtime. */
  readonly now?: () => number;
}

/** Conservative default concurrency from logical CPU count: half the cores,
 * at least one, at most four. Hosts and the runtime performance policy may
 * change it; four-core devices start with two heavy jobs. */
export function defaultHeavyJobConcurrency(hardwareConcurrency: number | undefined): number {
  const cores = Number.isFinite(hardwareConcurrency) && (hardwareConcurrency as number) > 0 ? Math.floor(hardwareConcurrency as number) : 2;
  return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

const priorityRank: Readonly<Record<HeavyJobPriority, number>> = Object.freeze({ "user-blocking": 0, "user-visible": 1, "background": 2 });

interface Waiter {
  readonly sequence: number;
  readonly request: Required<Pick<HeavyJobRequest, "owner" | "kind" | "priority" | "bytes">> & Pick<HeavyJobRequest, "supersedeKey" | "signal">;
  readonly enqueuedAt: number;
  readonly resolve: (lease: HeavyJobLease) => void;
  readonly reject: (error: unknown) => void;
  readonly onAbort: () => void;
}

interface OwnerState { active: number; served: number }

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Heavy job was cancelled.", "AbortError");
}

export function createHeavyJobAdmission(options: HeavyJobAdmissionOptions = {}): HeavyJobAdmission {
  let concurrency = positiveInteger(options.concurrency ?? defaultHeavyJobConcurrency(undefined), "Heavy job concurrency");
  let maximumBytes = positiveInteger(options.maximumBytes ?? 256 * 1024 * 1024, "Heavy job byte budget");
  const maximumQueued = positiveInteger(options.maximumQueued ?? 256, "Heavy job queue bound");
  const now = options.now ?? (() => 0);
  const queue: Waiter[] = [];
  const owners = new Map<string, OwnerState>();
  const activeByKind = new Map<string, number>();
  let active = 0, activeBytes = 0, sequence = 0, leaseId = 0, serviceCounter = 0, admitted = 0, superseded = 0;
  let disposed: { reason: unknown } | null = null;

  const normalise = (request: HeavyJobRequest): Waiter["request"] => {
    if (!request || typeof request.owner !== "string" || !request.owner || typeof request.kind !== "string" || !request.kind)
      throw new TypeError("Heavy jobs require an owner and kind.");
    const priority = request.priority ?? "user-visible";
    if (!(priority in priorityRank)) throw new TypeError("Unknown heavy job priority.");
    const bytes = request.bytes ?? 0;
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError("Heavy job bytes must be a nonnegative safe integer.");
    return { owner: request.owner, kind: request.kind, priority, bytes, supersedeKey: request.supersedeKey, signal: request.signal };
  };
  const owner = (id: string) => {
    let state = owners.get(id);
    if (!state) { state = { active: 0, served: 0 }; owners.set(id, state); }
    return state;
  };
  const fits = (bytes: number) => active < concurrency && activeBytes + bytes <= maximumBytes;

  const grant = (request: Waiter["request"], enqueuedAt: number): HeavyJobLease => {
    active += 1;
    activeBytes += request.bytes;
    activeByKind.set(request.kind, (activeByKind.get(request.kind) ?? 0) + 1);
    const state = owner(request.owner);
    state.active += 1;
    state.served = ++serviceCounter;
    admitted += 1;
    let released = false;
    return Object.freeze({
      id: ++leaseId,
      owner: request.owner,
      kind: request.kind,
      bytes: request.bytes,
      waitedMs: Math.max(0, now() - enqueuedAt),
      release() {
        if (released) return;
        released = true;
        active -= 1;
        activeBytes -= request.bytes;
        const kindCount = (activeByKind.get(request.kind) ?? 1) - 1;
        if (kindCount > 0) activeByKind.set(request.kind, kindCount); else activeByKind.delete(request.kind);
        const state = owner(request.owner);
        state.active -= 1;
        if (state.active === 0 && !queue.some((waiter) => waiter.request.owner === request.owner)) owners.delete(request.owner);
        pump();
      },
    });
  };

  /** Highest priority first; within it the owner with fewest active jobs and
   * then least recently served; then arrival order. */
  const nextWaiter = (): number => {
    let best = -1;
    for (let index = 0; index < queue.length; index++) {
      if (best < 0) { best = index; continue; }
      const candidate = queue[index]!, current = queue[best]!;
      const byPriority = priorityRank[candidate.request.priority] - priorityRank[current.request.priority];
      if (byPriority !== 0) { if (byPriority < 0) best = index; continue; }
      const candidateOwner = owner(candidate.request.owner), currentOwner = owner(current.request.owner);
      const byActive = candidateOwner.active - currentOwner.active;
      if (byActive !== 0) { if (byActive < 0) best = index; continue; }
      if (candidateOwner.served !== currentOwner.served) { if (candidateOwner.served < currentOwner.served) best = index; continue; }
      if (candidate.sequence < current.sequence) best = index;
    }
    return best;
  };

  const detach = (waiter: Waiter) => waiter.request.signal?.removeEventListener("abort", waiter.onAbort);

  function pump(): void {
    while (queue.length > 0 && !disposed) {
      const index = nextWaiter();
      const waiter = queue[index]!;
      // No skipping past the chosen job: a large job is never starved by a
      // stream of smaller ones.
      if (!fits(waiter.request.bytes)) return;
      queue.splice(index, 1);
      detach(waiter);
      waiter.resolve(grant(waiter.request, waiter.enqueuedAt));
    }
  }

  const supersede = (key: string | undefined) => {
    if (key === undefined) return;
    for (let index = queue.length - 1; index >= 0; index--) {
      const waiter = queue[index]!;
      if (waiter.request.supersedeKey !== key) continue;
      queue.splice(index, 1);
      detach(waiter);
      superseded += 1;
      waiter.reject(new DOMException("Heavy job was superseded by a newer request.", "AbortError"));
    }
  };

  return {
    tryAdmit(request) {
      const normalised = normalise(request);
      if (disposed || normalised.signal?.aborted || queue.length > 0 || !fits(normalised.bytes)) return null;
      return grant(normalised, now());
    },
    admit(request) {
      let normalised: Waiter["request"];
      try { normalised = normalise(request); } catch (error) { return Promise.reject(error); }
      if (disposed) return Promise.reject(disposed.reason);
      if (normalised.signal?.aborted) return Promise.reject(abortReason(normalised.signal));
      if (normalised.bytes > maximumBytes)
        return Promise.reject(new DOMException("Heavy job exceeds the runtime job byte budget.", "QuotaExceededError"));
      supersede(normalised.supersedeKey);
      if (queue.length === 0 && fits(normalised.bytes)) return Promise.resolve(grant(normalised, now()));
      if (queue.length >= maximumQueued)
        return Promise.reject(new DOMException("Heavy job queue is full.", "QuotaExceededError"));
      return new Promise<HeavyJobLease>((resolve, reject) => {
        const waiter: Waiter = {
          sequence: ++sequence,
          request: normalised,
          enqueuedAt: now(),
          resolve,
          reject,
          onAbort: () => {
            const index = queue.indexOf(waiter);
            if (index < 0) return;
            queue.splice(index, 1);
            reject(abortReason(normalised.signal!));
            pump();
          },
        };
        owner(normalised.owner);
        normalised.signal?.addEventListener("abort", waiter.onAbort, { once: true });
        queue.push(waiter);
      });
    },
    snapshot() {
      return Object.freeze({
        concurrency,
        maximumBytes,
        active,
        queued: queue.length,
        activeBytes,
        queuedBytes: queue.reduce((total, waiter) => total + waiter.request.bytes, 0),
        admitted,
        superseded,
        activeByKind: Object.freeze(Object.fromEntries(activeByKind)),
      });
    },
    setCapacity(capacity) {
      if (capacity.concurrency !== undefined) concurrency = positiveInteger(capacity.concurrency, "Heavy job concurrency");
      if (capacity.maximumBytes !== undefined) maximumBytes = positiveInteger(capacity.maximumBytes, "Heavy job byte budget");
      pump();
    },
    dispose(reason = new DOMException("Heavy job admission is disposed.", "AbortError")) {
      if (disposed) return;
      disposed = { reason };
      for (const waiter of queue.splice(0)) {
        detach(waiter);
        waiter.reject(reason);
      }
    },
  };
}
