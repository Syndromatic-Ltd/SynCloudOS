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
  LUFXIndexBackendMutation,
  LUFXIndexBackendMutationResult,
  LUFXIndexBackendSnapshot,
} from "../../FX/LuminaFX/LUFXIndexBackend";
import { LUFXSearchableItem, type LUFXSearchableItemJSON } from "../../FX/LuminaFX/LUFXSearchableItem";
import type { LUFXQueryDescriptor } from "../../FX/LuminaFX/LUFXQuery";
import type { LUFXQueryExecutionOptions, LUFXQueryResultPage } from "../../FX/LuminaFX/LUFXQueryPlanner";
import type { LUFXSuggestionResult } from "../../FX/LuminaFX/LUFXSuggestions";
import type {
  LuminaIndexBackendFactory,
  LuminaIndexMaintenanceBackend,
  LuminaIndexMaintenanceDiagnostics,
  LuminaIndexReplacementMetadata,
  LuminaWorkerQueryResultPage,
  LuminaWorkerRequest,
  LuminaWorkerResponse,
  LuminaWorkerValue,
} from "../HostServices/PlatformAdapterRuntimePorts";
import { IndexedDBLuminaBackend, type LuminaEligibilityRestriction } from "../LuminaFX/platformAdapterIndexBackend";
import luminaWorkerURL from "./lumina-index.worker.ts?worker&url";
import { createExclusiveLuminaWorkerChannel, LuminaWorkerConnection, type LuminaWorkerChannel } from "./LuminaWorkerConnection";

interface PendingRequest<T extends LuminaWorkerValue> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

function remoteError(error: Readonly<{ name: string; message: string }>): Error {
  if (typeof DOMException === "function") return new DOMException(error.message, error.name);
  const result = new Error(error.message);
  result.name = error.name;
  return result;
}

export class WorkerLuminaIndexBackend implements LUFXIndexBackend, LuminaIndexMaintenanceBackend {
  readonly #channel: LuminaWorkerChannel;
  readonly #unsubscribe: () => void;
  readonly #databaseName: string;
  readonly #ownerKey: string;
  readonly #pending = new Map<number, PendingRequest<LuminaWorkerValue>>();
  #disposed = false;
  #failure: Error | null = null;

  /** A Worker is owned by this session alone; a channel may share one. */
  constructor(worker: Worker | LuminaWorkerChannel, databaseName: string, ownerKey: string, ownerSignal?: AbortSignal) {
    this.#channel = "nextId" in worker ? worker : createExclusiveLuminaWorkerChannel(worker);
    this.#databaseName = databaseName;
    this.#ownerKey = ownerKey;
    this.#unsubscribe = this.#channel.subscribe(this.#onMessage, this.#onError);
    ownerSignal?.addEventListener("abort", () => this.dispose(), { once: true });
    if (ownerSignal?.aborted) this.dispose();
  }

  mutate(mutation: LUFXIndexBackendMutation, signal?: AbortSignal): Promise<LUFXIndexBackendMutationResult> {
    return this.#request<LUFXIndexBackendMutationResult>({
      id: this.#channel.nextId(),
      operation: "mutate",
      databaseName: this.#databaseName,
      ownerKey: this.#ownerKey,
      mutation,
    }, signal);
  }

  snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot> {
    return this.#request<LUFXIndexBackendSnapshot>({
      id: this.#channel.nextId(),
      operation: "snapshot",
      databaseName: this.#databaseName,
      ownerKey: this.#ownerKey,
    }, signal);
  }

  async query(value: LUFXQueryDescriptor, options: LUFXQueryExecutionOptions = {}): Promise<LUFXQueryResultPage> {
    return this.#query(value, undefined, options);
  }

  /** Plans a query in the worker over the items a Lumina eligibility
   * restriction admits; only the result page crosses back. */
  async queryRestricted(
    value: LUFXQueryDescriptor,
    restriction: LuminaEligibilityRestriction,
    options: LUFXQueryExecutionOptions = {},
  ): Promise<LUFXQueryResultPage> {
    return this.#query(value, restriction, options);
  }

  async #query(
    value: LUFXQueryDescriptor,
    restriction: LuminaEligibilityRestriction | undefined,
    options: LUFXQueryExecutionOptions,
  ): Promise<LUFXQueryResultPage> {
    const response = await this.#request<LuminaWorkerQueryResultPage>({
      id: this.#channel.nextId(),
      operation: "query",
      databaseName: this.#databaseName,
      ownerKey: this.#ownerKey,
      query: value,
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      ...(restriction === undefined ? {} : { restriction }),
    }, options.signal);
    return Object.freeze({
      checkpoint: Object.freeze({ ...response.checkpoint }),
      tokenizerVersion: response.tokenizerVersion as LUFXQueryResultPage["tokenizerVersion"],
      rankerVersion: response.rankerVersion as LUFXQueryResultPage["rankerVersion"],
      results: Object.freeze(response.results.map((entry) => Object.freeze({
        item: LUFXSearchableItem.fromJSON(entry.item),
        score: entry.score,
        snippet: entry.snippet,
      }))),
      ...(response.nextCursor === undefined ? {} : { nextCursor: response.nextCursor }),
    });
  }

  /** Ranks suggestions inside the worker from its hydrated index; only the
   * bounded suggestion list is returned. */
  async suggest(value: LUFXQueryDescriptor, options: Readonly<{ limit: number; maximumBytes: number; signal?: AbortSignal }>): Promise<LUFXSuggestionResult> {
    const response = await this.#request<LUFXSuggestionResult>({
      id: this.#channel.nextId(),
      operation: "suggest",
      databaseName: this.#databaseName,
      ownerKey: this.#ownerKey,
      query: value,
      limit: options.limit,
      maximumBytes: options.maximumBytes,
    }, options.signal);
    return Object.freeze({ suggestions: Object.freeze([...response.suggestions]) });
  }

  replaceAll(
    items: readonly LUFXSearchableItemJSON[],
    metadata: LuminaIndexReplacementMetadata,
    signal?: AbortSignal,
  ): Promise<LuminaIndexMaintenanceDiagnostics> {
    if (items.length > 4_096) return this.#replaceAllChunked(items, metadata, signal);
    return this.#request<LuminaIndexMaintenanceDiagnostics>({
      id: this.#channel.nextId(),
      operation: "replace-all",
      databaseName: this.#databaseName,
      ownerKey: this.#ownerKey,
      items,
      metadata,
    }, signal);
  }

  async #replaceAllChunked(
    items: readonly LUFXSearchableItemJSON[],
    metadata: LuminaIndexReplacementMetadata,
    signal?: AbortSignal,
  ): Promise<LuminaIndexMaintenanceDiagnostics> {
    if (this.#disposed) throw new DOMException("Lumina worker backend is disposed.", "AbortError");
    signal?.throwIfAborted();
    const batchId = this.#channel.nextId();
    const abortBatch = () => {
      try {
        this.#channel.post({
          id: this.#channel.nextId(),
          operation: "replace-all-abort",
          databaseName: this.#databaseName,
          ownerKey: this.#ownerKey,
          batchId,
        } satisfies LuminaWorkerRequest);
      } catch { /* worker already gone */ }
    };
    try {
      await this.#request<null>({
        id: this.#channel.nextId(),
        operation: "replace-all-begin",
        databaseName: this.#databaseName,
        ownerKey: this.#ownerKey,
        batchId,
        metadata,
      }, signal);
      const chunkSize = 2_048;
      for (let offset = 0; offset < items.length; offset += chunkSize) {
        signal?.throwIfAborted();
        await this.#request<null>({
          id: this.#channel.nextId(),
          operation: "replace-all-chunk",
          databaseName: this.#databaseName,
          ownerKey: this.#ownerKey,
          batchId,
          items: items.slice(offset, offset + chunkSize),
        }, signal);
      }
      return await this.#request<LuminaIndexMaintenanceDiagnostics>({
        id: this.#channel.nextId(),
        operation: "replace-all-commit",
        databaseName: this.#databaseName,
        ownerKey: this.#ownerKey,
        batchId,
      }, signal);
    } catch (error) {
      abortBatch();
      throw error;
    }
  }

  eraseOwner(signal?: AbortSignal): Promise<LuminaIndexMaintenanceDiagnostics> {
    return this.#request<LuminaIndexMaintenanceDiagnostics>({
      id: this.#channel.nextId(),
      operation: "erase-owner",
      databaseName: this.#databaseName,
      ownerKey: this.#ownerKey,
    }, signal);
  }

  diagnostics(signal?: AbortSignal): Promise<LuminaIndexMaintenanceDiagnostics> {
    return this.#request<LuminaIndexMaintenanceDiagnostics>({
      id: this.#channel.nextId(),
      operation: "diagnostics",
      databaseName: this.#databaseName,
      ownerKey: this.#ownerKey,
    }, signal);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const id = this.#channel.nextId();
    this.#channel.close({ id, operation: "dispose-owner", databaseName: this.#databaseName, ownerKey: this.#ownerKey } satisfies LuminaWorkerRequest);
    const error = new DOMException("Lumina worker backend was disposed.", "AbortError");
    for (const [pendingId, pending] of this.#pending) {
      pending.signal?.removeEventListener("abort", pending.onAbort!);
      pending.reject(error);
      this.#pending.delete(pendingId);
    }
    this.#unsubscribe();
  }

  #request<T extends LuminaWorkerValue>(request: Exclude<LuminaWorkerRequest, { operation: "cancel" | "dispose-owner" }>, signal?: AbortSignal): Promise<T> {
    if (this.#disposed) return Promise.reject(new DOMException("Lumina worker backend is disposed.", "AbortError"));
    if (this.#failure) return Promise.reject(this.#failure);
    try { signal?.throwIfAborted(); } catch (error) { return Promise.reject(error); }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        const pending = this.#pending.get(request.id);
        if (!pending) return;
        try { this.#channel.post({ id: request.id, operation: "cancel" } satisfies LuminaWorkerRequest); } catch { /* worker already gone */ }
        // Mutations must wait for the worker's transaction outcome. If the
        // transaction crossed its commit point before cancellation arrived,
        // the caller must receive the committed checkpoint rather than a false
        // AbortError. Read-only snapshots have no commit receipt to preserve.
        if (request.operation === "mutate" || request.operation === "replace-all" || request.operation === "replace-all-commit" || request.operation === "erase-owner") return;
        this.#pending.delete(request.id);
        reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Lumina operation was aborted.", "AbortError"));
      };
      this.#pending.set(request.id, { resolve: resolve as (value: LuminaWorkerValue) => void, reject, signal, onAbort });
      signal?.addEventListener("abort", onAbort, { once: true });
      try { this.#channel.post(request); }
      catch (error) {
        signal?.removeEventListener("abort", onAbort);
        this.#pending.delete(request.id);
        reject(error);
      }
    });
  }

  #onMessage = (event: MessageEvent<LuminaWorkerResponse>) => {
    const response = event.data;
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);
    pending.signal?.removeEventListener("abort", pending.onAbort!);
    if (response.ok) pending.resolve(response.value);
    else pending.reject(remoteError(response.error));
  };

  #onError = (event: ErrorEvent) => {
    if (this.#disposed || this.#failure) return;
    // This backend reports the failure through its scoped operations. Cancel
    // the worker event's separate global-error path so a recoverable search
    // failure cannot also tear down the containing application.
    event.preventDefault();
    const error = event.error instanceof Error ? event.error : new Error(event.message || "Lumina worker failed.");
    this.#failure = error;
    for (const [id, pending] of this.#pending) {
      pending.signal?.removeEventListener("abort", pending.onAbort!);
      pending.reject(error);
      this.#pending.delete(id);
    }
    // An uncaught worker failure ends this backend lifetime. New calls must
    // receive the same failure instead of waiting forever on a dead worker.
    // The channel owns the worker (possibly shared with other owners) and
    // terminates it; this session only stops listening.
    this.#unsubscribe();
  };
}

/** Host timers let the shared worker idle briefly between sessions instead
 * of restarting for each one. */
export interface BrowserLuminaWorkerTimers {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export function createBrowserLuminaIndexBackendFactory(databaseName = "syncloudos-lumina-index", timers?: BrowserLuminaWorkerTimers): LuminaIndexBackendFactory | null {
  if (typeof indexedDB === "undefined") return null;
  if (typeof Worker !== "function") {
    return Object.freeze({
      create(ownerKey: string, signal: AbortSignal) {
        signal.throwIfAborted();
        const backend = new IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
        signal.addEventListener("abort", () => backend.dispose(), { once: true });
        if (signal.aborted) backend.dispose();
        return backend;
      },
    });
  }
  // One worker serves every owner session this factory creates.
  const connection = new LuminaWorkerConnection({
    createWorker: () => new Worker(luminaWorkerURL, { type: "module", name: "syncloudos-lumina-index" }),
    ...(timers ? { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout } : {}),
  });
  return Object.freeze({
    create(ownerKey: string, signal: AbortSignal) {
      return new WorkerLuminaIndexBackend(connection.channel(databaseName, ownerKey), databaseName, ownerKey, signal);
    },
  });
}
