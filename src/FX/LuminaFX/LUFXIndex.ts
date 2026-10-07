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

import type {
  LUFXIndexBackend,
  LUFXIndexBackendMutationResult,
  LUFXIndexCheckpoint,
  LUFXIndexState,
} from "./LUFXIndexBackend";
import { LUFXSearchableItem } from "./LUFXSearchableItem";
import { LUFXQuery, type LUFXQueryDescriptor } from "./LUFXQuery";
import { LUFXQueryPlanner, type LUFXQueryExecutionOptions, type LUFXQueryResultPage } from "./LUFXQueryPlanner";
import { lufxSuggestionBounds, type LUFXSuggestionOptions, type LUFXSuggestionResult } from "./LUFXSuggestions";

export interface LUFXIndexOperationOptions { readonly signal?: AbortSignal }

export interface LUFXIndexSnapshot {
  readonly state: LUFXIndexState;
  readonly schemaVersion: number;
  readonly checkpoint: LUFXIndexCheckpoint;
  readonly items: readonly LUFXSearchableItem[];
}

export interface LUFXIndexSession {
  upsert(item: LUFXSearchableItem, mutationId: string, options?: LUFXIndexOperationOptions): Promise<LUFXIndexBackendMutationResult>;
  delete(itemId: string, mutationId: string, options?: LUFXIndexOperationOptions): Promise<LUFXIndexBackendMutationResult>;
  deleteDomain(domain: string, mutationId: string, options?: LUFXIndexOperationOptions): Promise<LUFXIndexBackendMutationResult>;
  snapshot(options?: LUFXIndexOperationOptions): Promise<LUFXIndexSnapshot>;
  query(value: LUFXQuery | LUFXQueryDescriptor, options?: LUFXQueryExecutionOptions): Promise<LUFXQueryResultPage>;
  suggest(value: LUFXQuery | LUFXQueryDescriptor, options?: LUFXSuggestionOptions & LUFXIndexOperationOptions): Promise<LUFXSuggestionResult>;
  dispose(): void;
}

export interface LUFXIndexClient {
  createIndex(signal?: AbortSignal): LUFXIndexSession;
}

interface LUFXQueryCapableBackend {
  query(value: LUFXQueryDescriptor, options?: LUFXQueryExecutionOptions): Promise<LUFXQueryResultPage>;
}

function queryCapableBackend(backend: LUFXIndexBackend): LUFXQueryCapableBackend | null {
  const candidate = backend as LUFXIndexBackend & Partial<LUFXQueryCapableBackend>;
  return typeof candidate.query === "function" ? candidate as LUFXIndexBackend & LUFXQueryCapableBackend : null;
}

/** A backend that ranks suggestions where its index lives and returns only
 * the bounded suggestion list. */
interface LUFXSuggestionCapableBackend {
  suggest(value: LUFXQueryDescriptor, options: Readonly<{ limit: number; maximumBytes: number; signal?: AbortSignal }>): Promise<LUFXSuggestionResult>;
}

function suggestionCapableBackend(backend: LUFXIndexBackend): LUFXSuggestionCapableBackend | null {
  const candidate = backend as LUFXIndexBackend & Partial<LUFXSuggestionCapableBackend>;
  return typeof candidate.suggest === "function" ? candidate as LUFXIndexBackend & LUFXSuggestionCapableBackend : null;
}

const identityPattern = /^[^\u0000-\u001f\u007f\s]+$/u;
const encoder = new TextEncoder();

function checkedIdentity(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || encoder.encode(value).byteLength > 256 || !identityPattern.test(value)) {
    throw new TypeError(`${label} must be a non-empty identifier of at most 256 bytes with no whitespace/control characters.`);
  }
  return value;
}

export class LUFXIndex implements LUFXIndexSession {
  #disposed = false;
  readonly #planner = new LUFXQueryPlanner();

  constructor(readonly backend: LUFXIndexBackend) {
    if (!backend || typeof backend !== "object" || typeof backend.mutate !== "function" || typeof backend.snapshot !== "function" || typeof backend.dispose !== "function") {
      throw new TypeError("Lumina index requires an LUFXIndexBackend.");
    }
  }

  async upsert(item: LUFXSearchableItem, mutationId: string, options: LUFXIndexOperationOptions = {}): Promise<LUFXIndexBackendMutationResult> {
    this.#assertActive(options.signal);
    if (!(item instanceof LUFXSearchableItem)) throw new TypeError("Lumina index upsert requires an LUFXSearchableItem.");
    return this.backend.mutate(Object.freeze({
      kind: "upsert" as const,
      mutationId: checkedIdentity(mutationId, "Lumina mutation ID"),
      item: item.toJSON(),
    }), options.signal);
  }

  async delete(itemId: string, mutationId: string, options: LUFXIndexOperationOptions = {}): Promise<LUFXIndexBackendMutationResult> {
    this.#assertActive(options.signal);
    return this.backend.mutate(Object.freeze({
      kind: "delete" as const,
      mutationId: checkedIdentity(mutationId, "Lumina mutation ID"),
      itemId: checkedIdentity(itemId, "Lumina item ID"),
    }), options.signal);
  }

  async deleteDomain(domain: string, mutationId: string, options: LUFXIndexOperationOptions = {}): Promise<LUFXIndexBackendMutationResult> {
    this.#assertActive(options.signal);
    return this.backend.mutate(Object.freeze({
      kind: "delete-domain" as const,
      mutationId: checkedIdentity(mutationId, "Lumina mutation ID"),
      domain: checkedIdentity(domain, "Lumina domain"),
    }), options.signal);
  }

  async snapshot(options: LUFXIndexOperationOptions = {}): Promise<LUFXIndexSnapshot> {
    this.#assertActive(options.signal);
    const snapshot = await this.backend.snapshot(options.signal);
    if (this.#disposed) throw new DOMException("Lumina index is disposed.", "AbortError");
    return Object.freeze({
      state: snapshot.state,
      schemaVersion: snapshot.schemaVersion,
      checkpoint: Object.freeze({ ...snapshot.checkpoint }),
      items: Object.freeze(snapshot.items.map((item) => LUFXSearchableItem.fromJSON(item))),
    });
  }

  async query(value: LUFXQuery | LUFXQueryDescriptor, options: LUFXQueryExecutionOptions = {}): Promise<LUFXQueryResultPage> {
    this.#assertActive(options.signal);
    const capable = queryCapableBackend(this.backend);
    if (capable) {
      const descriptor = value instanceof LUFXQuery ? value.toJSON() : new LUFXQuery(value).toJSON();
      const result = await capable.query(descriptor, options);
      this.#assertActive(options.signal);
      return result;
    }
    const snapshot = await this.snapshot({ signal: options.signal });
    this.#assertActive(options.signal);
    return this.#planner.execute(snapshot, value, options);
  }

  async suggest(value: LUFXQuery | LUFXQueryDescriptor, options: LUFXSuggestionOptions & LUFXIndexOperationOptions = {}): Promise<LUFXSuggestionResult> {
    this.#assertActive(options.signal);
    const capable = suggestionCapableBackend(this.backend);
    if (capable) {
      // Rank where the index lives; only the bounded list crosses back.
      const descriptor = value instanceof LUFXQuery ? value.toJSON() : new LUFXQuery(value).toJSON();
      const bounds = lufxSuggestionBounds(options);
      const result = await capable.suggest(descriptor, { ...bounds, signal: options.signal });
      this.#assertActive(options.signal);
      return result;
    }
    const snapshot = await this.snapshot({ signal: options.signal });
    this.#assertActive(options.signal);
    return this.#planner.suggest(snapshot, value, options);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.backend.dispose();
  }

  #assertActive(signal?: AbortSignal): void {
    if (this.#disposed) throw new DOMException("Lumina index is disposed.", "AbortError");
    signal?.throwIfAborted();
  }
}
