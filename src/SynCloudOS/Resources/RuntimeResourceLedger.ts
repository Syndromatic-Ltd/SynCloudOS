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

// Aggregate resource accounting and pressure relief for one runtime.
//
// Existing owners (decoded image and font caches, image leases, per-mount
// text attachments, heavy-job reservations, diagnostic logs...) keep their own
// ownership and release rules. They register as participants that report the
// backings they hold and, optionally, how to give back cache-only or idle
// content. The ledger never frees anything itself and never touches active
// work: it asks participants to reclaim, cheapest-to-rebuild residency first.
//
// Bytes are estimates for admission and relative attribution, not a heap or
// process measurement. A backing reported by several participants (a decoded
// image that is both cached and leased) is counted once, in its most pinned
// state.

export type RuntimeResourceState = "active" | "cache" | "idle";
export type RuntimeResourceKind =
  | "decoded-image" | "decoded-audio" | "font" | "text-layout" | "text-attachment"
  | "pixel-pool" | "video-frame" | "gpu" | "worker-jobs" | "diagnostics" | "cache" | "other";

export interface RuntimeResourceBacking {
  /** Identity of the underlying backing; equal keys are one resource. */
  readonly key: unknown;
  readonly bytes: number;
  /** active: pinned by current work; cache: retained only for reuse and
   * rebuildable; idle: reusable storage held by a pool. */
  readonly state: RuntimeResourceState;
}

export type RuntimeResourceReclaimLevel = "cache" | "idle";

export interface RuntimeResourceReclaimRequest {
  readonly level: RuntimeResourceReclaimLevel;
  readonly targetBytes: number;
  readonly reason: string;
}

export interface RuntimeResourceParticipant {
  readonly id: string;
  readonly kind: RuntimeResourceKind;
  /** "runtime" or the owning application ID. */
  readonly owner: string;
  measure(): Iterable<RuntimeResourceBacking>;
  /** Gives back up to `targetBytes` of content in `level`; returns the bytes
   * released. Must not release active content. */
  reclaim?(request: RuntimeResourceReclaimRequest): number;
}

export interface RuntimeResourceTotals {
  readonly activeBytes: number;
  readonly cacheBytes: number;
  readonly idleBytes: number;
  readonly reclaimableBytes: number;
  /** Unique backing bytes across participants. */
  readonly estimatedBytes: number;
  /** Backings reported by more than one participant. */
  readonly sharedBackings: number;
}

export interface RuntimeResourceParticipantReport {
  readonly id: string;
  readonly kind: RuntimeResourceKind;
  readonly owner: string;
  readonly activeBytes: number;
  readonly cacheBytes: number;
  readonly idleBytes: number;
  readonly backings: number;
  readonly error?: string;
}

export interface RuntimeResourceSnapshot {
  readonly totals: RuntimeResourceTotals;
  readonly byKind: Readonly<Record<string, RuntimeResourceTotals>>;
  readonly byOwner: Readonly<Record<string, RuntimeResourceTotals>>;
  readonly participants: readonly RuntimeResourceParticipantReport[];
  readonly softBudgetBytes: number | null;
}

export interface RuntimeResourceReliefRequest {
  readonly reason: string;
  /** Bytes to release; all reclaimable content in scope when omitted. */
  readonly targetBytes?: number;
  /** Limit relief to one owner (for example a suspended application). */
  readonly owner?: string;
}

export interface RuntimeResourceRelief {
  readonly reason: string;
  readonly reclaimedBytes: number;
  readonly steps: readonly Readonly<{ participant: string; level: RuntimeResourceReclaimLevel; bytes: number }>[];
}

export interface RuntimeResourceLedger {
  register(participant: RuntimeResourceParticipant): () => void;
  snapshot(): RuntimeResourceSnapshot;
  relieve(request: RuntimeResourceReliefRequest): RuntimeResourceRelief;
  /** Relieves reclaimable content above the soft budget, if one is set. */
  enforceBudget(reason?: string): RuntimeResourceRelief;
  setSoftBudget(bytes: number | null): void;
  dispose(): void;
}

const stateRank: Readonly<Record<RuntimeResourceState, number>> = Object.freeze({ active: 0, cache: 1, idle: 2 });
const reclaimLevels: readonly RuntimeResourceReclaimLevel[] = Object.freeze(["cache", "idle"]);

interface MutableTotals { activeBytes: number; cacheBytes: number; idleBytes: number; sharedBackings: number }

function emptyTotals(): MutableTotals {
  return { activeBytes: 0, cacheBytes: 0, idleBytes: 0, sharedBackings: 0 };
}

function freezeTotals(totals: MutableTotals): RuntimeResourceTotals {
  return Object.freeze({
    activeBytes: totals.activeBytes,
    cacheBytes: totals.cacheBytes,
    idleBytes: totals.idleBytes,
    reclaimableBytes: totals.cacheBytes + totals.idleBytes,
    estimatedBytes: totals.activeBytes + totals.cacheBytes + totals.idleBytes,
    sharedBackings: totals.sharedBackings,
  });
}

function add(totals: MutableTotals, state: RuntimeResourceState, bytes: number) {
  if (state === "active") totals.activeBytes += bytes;
  else if (state === "cache") totals.cacheBytes += bytes;
  else totals.idleBytes += bytes;
}

function validBytes(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function budget(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Resource soft budget must be a nonnegative safe integer.");
  return value;
}

export function createRuntimeResourceLedger(options: { readonly softBudgetBytes?: number | null } = {}): RuntimeResourceLedger {
  const participants = new Set<RuntimeResourceParticipant>();
  let softBudgetBytes = budget(options.softBudgetBytes);
  let disposed = false;

  const measureParticipant = (participant: RuntimeResourceParticipant) => {
    try {
      return { backings: Array.from(participant.measure()), error: undefined as string | undefined };
    } catch (error) {
      return { backings: [] as RuntimeResourceBacking[], error: error instanceof Error ? error.message : String(error) };
    }
  };

  const snapshot = (): RuntimeResourceSnapshot => {
    const unique = new Map<unknown, { bytes: number; state: RuntimeResourceState; kind: string; owner: string; holders: number }>();
    const reports: RuntimeResourceParticipantReport[] = [];
    for (const participant of participants) {
      const measured = measureParticipant(participant);
      const own = emptyTotals();
      for (const backing of measured.backings) {
        const bytes = validBytes(backing.bytes);
        add(own, backing.state, bytes);
        const existing = unique.get(backing.key);
        if (!existing) {
          unique.set(backing.key, { bytes, state: backing.state, kind: participant.kind, owner: participant.owner, holders: 1 });
          continue;
        }
        existing.holders += 1;
        existing.bytes = Math.max(existing.bytes, bytes);
        if (stateRank[backing.state] < stateRank[existing.state]) {
          existing.state = backing.state;
          existing.kind = participant.kind;
          existing.owner = participant.owner;
        }
      }
      reports.push(Object.freeze({
        id: participant.id,
        kind: participant.kind,
        owner: participant.owner,
        activeBytes: own.activeBytes,
        cacheBytes: own.cacheBytes,
        idleBytes: own.idleBytes,
        backings: measured.backings.length,
        ...(measured.error ? { error: measured.error } : {}),
      }));
    }
    const totals = emptyTotals();
    const byKind = new Map<string, MutableTotals>();
    const byOwner = new Map<string, MutableTotals>();
    for (const entry of unique.values()) {
      add(totals, entry.state, entry.bytes);
      if (entry.holders > 1) totals.sharedBackings += 1;
      for (const [map, name] of [[byKind, entry.kind], [byOwner, entry.owner]] as const) {
        let group = map.get(name);
        if (!group) { group = emptyTotals(); map.set(name, group); }
        add(group, entry.state, entry.bytes);
      }
    }
    return Object.freeze({
      totals: freezeTotals(totals),
      byKind: Object.freeze(Object.fromEntries([...byKind].map(([name, value]) => [name, freezeTotals(value)]))),
      byOwner: Object.freeze(Object.fromEntries([...byOwner].map(([name, value]) => [name, freezeTotals(value)]))),
      participants: Object.freeze(reports),
      softBudgetBytes,
    });
  };

  const relieve = (request: RuntimeResourceReliefRequest): RuntimeResourceRelief => {
    const steps: Array<Readonly<{ participant: string; level: RuntimeResourceReclaimLevel; bytes: number }>> = [];
    let remaining = request.targetBytes === undefined ? Number.POSITIVE_INFINITY : Math.max(0, request.targetBytes);
    let reclaimedBytes = 0;
    for (const level of reclaimLevels) {
      for (const participant of [...participants]) {
        if (remaining <= 0) break;
        if (!participant.reclaim || (request.owner !== undefined && participant.owner !== request.owner)) continue;
        let available = 0;
        for (const backing of measureParticipant(participant).backings) if (backing.state === level) available += validBytes(backing.bytes);
        if (available <= 0) continue;
        let bytes = 0;
        try {
          bytes = validBytes(participant.reclaim({ level, targetBytes: Math.min(remaining, available), reason: request.reason }));
        } catch {
          bytes = 0;
        }
        if (bytes <= 0) continue;
        steps.push(Object.freeze({ participant: participant.id, level, bytes }));
        reclaimedBytes += bytes;
        remaining -= bytes;
      }
    }
    return Object.freeze({ reason: request.reason, reclaimedBytes, steps: Object.freeze(steps) });
  };

  return {
    register(participant) {
      if (disposed) return () => undefined;
      if (!participant || typeof participant.measure !== "function" || typeof participant.id !== "string")
        throw new TypeError("Resource participants require an id and measure().");
      participants.add(participant);
      return () => { participants.delete(participant); };
    },
    snapshot,
    relieve,
    enforceBudget(reason = "soft-budget") {
      if (softBudgetBytes === null) return Object.freeze({ reason, reclaimedBytes: 0, steps: Object.freeze([]) });
      const excess = snapshot().totals.estimatedBytes - softBudgetBytes;
      if (excess <= 0) return Object.freeze({ reason, reclaimedBytes: 0, steps: Object.freeze([]) });
      return relieve({ reason, targetBytes: excess });
    },
    setSoftBudget(bytes) {
      softBudgetBytes = budget(bytes);
    },
    dispose() {
      disposed = true;
      participants.clear();
    },
  };
}
