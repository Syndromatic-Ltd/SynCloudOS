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

import type { LUFXSearchableItem } from "../../FX/LuminaFX/LUFXSearchableItem";
import type { LuminaIndexService } from "./LuminaIndexService";
import type { LuminaEligibilityRegistry } from "./LuminaEligibility";

export interface LuminaDonationSourceRecord<TValue = unknown> {
  readonly id: string;
  readonly revision: string;
  readonly sequence: number;
  readonly value: TValue;
}

export interface LuminaDonationProjection {
  readonly item: LUFXSearchableItem;
  readonly eligibility: Readonly<{
    readonly eligible: boolean;
    readonly notBeforeMs?: number;
    readonly notAfterMs?: number;
  }>;
}

export interface LuminaDonationCheckpointEntry {
  readonly revision: string;
  readonly sequence: number;
  readonly deleted: boolean;
  readonly eligible: boolean;
  readonly notBeforeMs?: number;
  readonly notAfterMs?: number;
}

export interface LuminaDonationCheckpoint {
  readonly version: 1;
  readonly ownerAppId: string;
  readonly domain: string;
  readonly items: Readonly<Record<string, LuminaDonationCheckpointEntry>>;
}

export interface LuminaDonationCheckpointStore {
  load(): LuminaDonationCheckpoint | null | Promise<LuminaDonationCheckpoint | null>;
  save(checkpoint: LuminaDonationCheckpoint): void | Promise<void>;
  clear?(): void | Promise<void>;
}

export interface LuminaDonationScheduler {
  schedule(callback: () => void | Promise<void>, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface LuminaDonationReconcileReceipt {
  readonly upserted: number;
  readonly deleted: number;
  readonly unchanged: number;
  readonly stale: number;
  readonly sourceCount: number;
  readonly checkpoint: LuminaDonationCheckpoint;
}

export interface LuminaDonationCoordinatorOptions<TValue> {
  readonly ownerAppId: string;
  readonly domain: string;
  readonly indexes: LuminaIndexService;
  readonly eligibility: LuminaEligibilityRegistry;
  readonly checkpointStore: LuminaDonationCheckpointStore;
  readonly readSource: (signal: AbortSignal) => Promise<readonly LuminaDonationSourceRecord<TValue>[]>;
  readonly project: (record: LuminaDonationSourceRecord<TValue>, nowMs: number) => LuminaDonationProjection;
  readonly now: () => number;
  readonly scheduler?: LuminaDonationScheduler;
}

const textEncoder = new TextEncoder();

function checkedIdentity(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || textEncoder.encode(value).byteLength > 256 || /[\u0000-\u001f\u007f\s]/u.test(value)) {
    throw new TypeError(`${label} must be a non-empty identifier of at most 256 bytes with no whitespace/control characters.`);
  }
  return value;
}

function checkedSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Lumina donation source sequence must be a non-negative safe integer.");
  return value;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mutationId(parts: readonly unknown[]): string {
  return `lumina-donation-${stableHash(JSON.stringify(parts))}`;
}

function sameProjection(
  checkpoint: LuminaDonationCheckpointEntry | undefined,
  record: LuminaDonationSourceRecord,
  projection: LuminaDonationProjection,
): boolean {
  return Boolean(
    checkpoint
    && !checkpoint.deleted
    && checkpoint.sequence === record.sequence
    && checkpoint.revision === record.revision
    && checkpoint.eligible === projection.eligibility.eligible
    && checkpoint.notBeforeMs === projection.eligibility.notBeforeMs
    && checkpoint.notAfterMs === projection.eligibility.notAfterMs,
  );
}

export class LuminaDonationCoordinator<TValue = unknown> {
  readonly #options: LuminaDonationCoordinatorOptions<TValue>;
  readonly #lifetime = new AbortController();
  #tail: Promise<void> = Promise.resolve();
  #scheduledHandle: unknown = null;
  #ownerErasure: Promise<void> | null = null;
  #disposed = false;

  constructor(options: LuminaDonationCoordinatorOptions<TValue>) {
    this.#options = {
      ...options,
      ownerAppId: checkedIdentity(options.ownerAppId, "Lumina donation owner application ID"),
      domain: checkedIdentity(options.domain, "Lumina donation domain"),
    };
  }

  reconcile(options: { readonly signal?: AbortSignal } = {}): Promise<LuminaDonationReconcileReceipt> {
    this.#assertLive();
    const run = this.#tail.then(
      () => this.#reconcile(options.signal),
      () => this.#reconcile(options.signal),
    );
    this.#tail = run.then(() => undefined, () => undefined);
    return run;
  }

  dispose(): void {
    this.#stop("Lumina donation coordinator disposed.");
  }

  prepareForOwnerErasure(): Promise<void> {
    if (this.#ownerErasure) return this.#ownerErasure;
    this.#stop("Lumina donation owner is being erased.");
    this.#ownerErasure = this.#tail.then(async () => {
      if (this.#options.checkpointStore.clear) await this.#options.checkpointStore.clear();
      else await this.#options.checkpointStore.save(this.#checkpoint({}));
    });
    return this.#ownerErasure;
  }

  async #reconcile(externalSignal?: AbortSignal): Promise<LuminaDonationReconcileReceipt> {
    const signal = externalSignal
      ? AbortSignal.any([this.#lifetime.signal, externalSignal])
      : this.#lifetime.signal;
    signal.throwIfAborted();
    const checkpoint = await this.#loadCheckpoint();
    const source = await this.#options.readSource(signal);
    signal.throwIfAborted();
    const currentIds = new Set<string>();
    const sourceIds = new Set<string>();
    const items = { ...checkpoint.items } as Record<string, LuminaDonationCheckpointEntry>;
    let upserted = 0;
    let deleted = 0;
    let unchanged = 0;
    let stale = 0;
    const index = this.#options.indexes.createIndex(this.#options.ownerAppId, signal);
    try {
      for (const rawRecord of [...source].sort((left, right) => left.id.localeCompare(right.id))) {
        signal.throwIfAborted();
        const record = Object.freeze({
          ...rawRecord,
          id: checkedIdentity(rawRecord.id, "Lumina donation item ID"),
          revision: checkedIdentity(rawRecord.revision, "Lumina donation revision"),
          sequence: checkedSequence(rawRecord.sequence),
        });
        if (sourceIds.has(record.id)) throw new TypeError(`Lumina donation source returned duplicate item ${record.id}.`);
        sourceIds.add(record.id);
        currentIds.add(record.id);
        const prior = items[record.id];
        if (prior && record.sequence < prior.sequence) {
          stale += 1;
          continue;
        }
        if (prior?.deleted && record.sequence <= prior.sequence) {
          stale += 1;
          continue;
        }
        const projection = this.#options.project(record, this.#options.now());
        if (projection.item.id !== record.id) throw new TypeError("Lumina donation projection cannot change stable item identity.");
        if (projection.item.domain !== this.#options.domain) throw new TypeError("Lumina donation projection cannot change its registered domain.");
        if (projection.item.revision !== record.revision) throw new TypeError("Lumina donation projection revision must match the canonical source revision.");
        if (sameProjection(prior, record, projection)) {
          this.#setEligibility(record, projection);
          unchanged += 1;
          continue;
        }
        await index.upsert(
          projection.item,
          mutationId(["upsert", this.#options.ownerAppId, this.#options.domain, record.id, record.sequence, record.revision]),
          { signal },
        );
        this.#setEligibility(record, projection);
        items[record.id] = Object.freeze({
          revision: record.revision,
          sequence: record.sequence,
          deleted: false,
          eligible: projection.eligibility.eligible,
          ...(projection.eligibility.notBeforeMs === undefined ? {} : { notBeforeMs: projection.eligibility.notBeforeMs }),
          ...(projection.eligibility.notAfterMs === undefined ? {} : { notAfterMs: projection.eligibility.notAfterMs }),
        });
        await this.#saveCheckpoint(items);
        upserted += 1;
      }

      for (const [itemId, prior] of Object.entries(items)) {
        if (currentIds.has(itemId) || prior.deleted) continue;
        signal.throwIfAborted();
        await index.delete(
          itemId,
          mutationId(["delete", this.#options.ownerAppId, this.#options.domain, itemId, prior.sequence, prior.revision]),
          { signal },
        );
        this.#options.eligibility.setItem({
          ownerAppId: this.#options.ownerAppId,
          domain: this.#options.domain,
          itemId,
          revision: prior.revision,
          eligible: false,
        });
        items[itemId] = Object.freeze({ ...prior, deleted: true, eligible: false });
        await this.#saveCheckpoint(items);
        deleted += 1;
      }
    } finally {
      index.dispose();
    }
    this.#options.eligibility.refreshTemporal();
    this.#scheduleBoundary(items);
    const finalCheckpoint = this.#checkpoint(items);
    return Object.freeze({ upserted, deleted, unchanged, stale, sourceCount: source.length, checkpoint: finalCheckpoint });
  }

  #setEligibility(record: LuminaDonationSourceRecord, projection: LuminaDonationProjection): void {
    this.#options.eligibility.setItem({
      ownerAppId: this.#options.ownerAppId,
      domain: this.#options.domain,
      itemId: record.id,
      revision: record.revision,
      eligible: projection.eligibility.eligible,
      ...(projection.eligibility.notBeforeMs === undefined ? {} : { notBeforeMs: projection.eligibility.notBeforeMs }),
      ...(projection.eligibility.notAfterMs === undefined ? {} : { notAfterMs: projection.eligibility.notAfterMs }),
    });
  }

  async #loadCheckpoint(): Promise<LuminaDonationCheckpoint> {
    const loaded = await this.#options.checkpointStore.load();
    if (!loaded) return this.#checkpoint({});
    if (loaded.version !== 1 || loaded.ownerAppId !== this.#options.ownerAppId || loaded.domain !== this.#options.domain || !loaded.items || typeof loaded.items !== "object") {
      throw new DOMException("Lumina donation checkpoint belongs to a different owner/domain or version.", "InvalidStateError");
    }
    return loaded;
  }

  async #saveCheckpoint(items: Readonly<Record<string, LuminaDonationCheckpointEntry>>): Promise<void> {
    await this.#options.checkpointStore.save(this.#checkpoint(items));
  }

  #checkpoint(items: Readonly<Record<string, LuminaDonationCheckpointEntry>>): LuminaDonationCheckpoint {
    return Object.freeze({
      version: 1 as const,
      ownerAppId: this.#options.ownerAppId,
      domain: this.#options.domain,
      items: Object.freeze({ ...items }),
    });
  }

  #scheduleBoundary(items: Readonly<Record<string, LuminaDonationCheckpointEntry>>): void {
    if (this.#scheduledHandle !== null) {
      this.#options.scheduler?.cancel(this.#scheduledHandle);
      this.#scheduledHandle = null;
    }
    const scheduler = this.#options.scheduler;
    if (!scheduler) return;
    const now = this.#options.now();
    const boundaries = Object.values(items)
      .flatMap((entry) => [entry.notBeforeMs, entry.notAfterMs])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > now)
      .sort((left, right) => left - right);
    const boundary = boundaries[0];
    if (boundary === undefined) return;
    this.#scheduledHandle = scheduler.schedule(async () => {
      this.#scheduledHandle = null;
      if (this.#disposed) return;
      this.#options.eligibility.refreshTemporal();
      await this.reconcile();
    }, Math.max(0, boundary - now));
  }

  #assertLive(): void {
    if (this.#disposed || this.#lifetime.signal.aborted) throw new DOMException("Lumina donation coordinator is disposed.", "AbortError");
  }

  #stop(reason: string): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#scheduledHandle !== null) {
      this.#options.scheduler?.cancel(this.#scheduledHandle);
      this.#scheduledHandle = null;
    }
    if (!this.#lifetime.signal.aborted) this.#lifetime.abort(new DOMException(reason, "AbortError"));
  }
}
