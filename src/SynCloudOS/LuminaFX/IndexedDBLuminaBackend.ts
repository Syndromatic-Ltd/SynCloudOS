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
  LUFXIndexCheckpoint,
  LUFXIndexState,
} from "../../FX/LuminaFX/LUFXIndexBackend";
import { LUFXSearchableItem, type LUFXSearchableItemJSON } from "../../FX/LuminaFX/LUFXSearchableItem";
import { LUFX_TOKENIZER_VERSION } from "../../FX/LuminaFX/LUFXTokenizer";
import type {
  LuminaIndexMaintenanceBackend,
  LuminaIndexMaintenanceDiagnostics,
  LuminaIndexReplacementMetadata,
} from "./LuminaIndexMaintenance";

export interface IndexedDBLuminaBackendOptions {
  readonly indexedDB: IDBFactory;
  readonly databaseName: string;
  readonly ownerKey: string;
}

interface StoredUpsert extends LUFXSearchableItemJSON {
  readonly ownerKey: string;
  readonly overlayKind?: "upsert";
}

interface StoredDeletion {
  readonly ownerKey: string;
  readonly id: string;
  readonly overlayKind: "delete";
}

type StoredItem = StoredUpsert | StoredDeletion;

interface StoredMutation {
  readonly ownerKey: string;
  readonly mutationId: string;
  readonly fingerprint: string;
  readonly checkpoint: LUFXIndexCheckpoint;
}

interface StoredMeta {
  readonly ownerKey: string;
  readonly schemaVersion: number;
  readonly tokenizerVersion?: string;
  readonly generation: number;
  readonly revision: number;
  readonly state: LUFXIndexState | "erased";
  readonly storageLayout?: "items" | "snapshot-overlay";
  readonly snapshotGeneration?: number;
  readonly clearedDomains?: readonly string[];
}

interface StoredGenerationSnapshot {
  readonly ownerKey: string;
  readonly generation: number;
  readonly items: readonly LUFXSearchableItemJSON[];
}

const SCHEMA_VERSION = 1;
const textEncoder = new TextEncoder();

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Lumina IndexedDB request failed."));
  });
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason instanceof Error ? signal.reason : new DOMException("Lumina index operation was aborted.", "AbortError");
}

function transactionComplete(transaction: IDBTransaction, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let cancelled: unknown = null;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      cancelled = abortReason(signal);
      try { transaction.abort(); } catch { /* transaction may already have committed */ }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    transaction.oncomplete = () => finish(resolve);
    transaction.onabort = () => finish(() => reject(cancelled ?? transaction.error ?? new DOMException("Lumina transaction aborted.", "AbortError")));
    transaction.onerror = () => {
      // IndexedDB normally follows with abort; retain transaction.error there.
    };
  });
}

function mutationFingerprint(mutation: LUFXIndexBackendMutation): string {
  return JSON.stringify(mutation);
}

function defaultMeta(ownerKey: string): StoredMeta {
  return {
    ownerKey,
    schemaVersion: SCHEMA_VERSION,
    tokenizerVersion: LUFX_TOKENIZER_VERSION,
    generation: 0,
    revision: 0,
    state: "ready",
    storageLayout: "items",
  };
}

function snapshotKey(ownerKey: string): string { return ownerKey + String.fromCharCode(0) + "snapshot"; }

function publicItem(stored: StoredUpsert): LUFXSearchableItemJSON {
  const { ownerKey: _ownerKey, overlayKind: _overlayKind, ...item } = stored;
  return LUFXSearchableItem.fromJSON(item).toJSON();
}

function isDeletion(stored: StoredItem): stored is StoredDeletion { return stored.overlayKind === "delete"; }

function materializeItems(
  meta: StoredMeta,
  stored: readonly StoredItem[],
  snapshot?: StoredGenerationSnapshot,
): LUFXSearchableItemJSON[] {
  if (meta.storageLayout !== "snapshot-overlay") {
    if (stored.some(isDeletion)) throw new TypeError("Legacy Lumina storage contains overlay tombstones.");
    return (stored as StoredUpsert[]).map(publicItem).sort((left, right) => left.id.localeCompare(right.id));
  }
  if (!snapshot || snapshot.generation !== meta.snapshotGeneration || !Array.isArray(snapshot.items)) {
    throw new TypeError("Lumina compact generation snapshot is missing or stale.");
  }
  const cleared = new Set(meta.clearedDomains ?? []);
  const items = new Map<string, LUFXSearchableItemJSON>();
  for (const candidate of snapshot.items) {
    const item = LUFXSearchableItem.fromJSON(candidate).toJSON();
    if (!cleared.has(item.domain)) items.set(item.id, item);
  }
  for (const record of stored) {
    if (isDeletion(record)) items.delete(record.id);
    else {
      const item = publicItem(record);
      items.set(item.id, item);
    }
  }
  return [...items.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function approximateItemBytes(items: readonly LUFXSearchableItemJSON[]): number {
  let total = 0;
  for (const item of items) total += textEncoder.encode(JSON.stringify(item)).byteLength;
  return total;
}

function maintenanceState(meta: StoredMeta): LuminaIndexMaintenanceDiagnostics["state"] {
  if (meta.state === "erased") return "erased";
  if (meta.schemaVersion !== SCHEMA_VERSION || meta.tokenizerVersion !== LUFX_TOKENIZER_VERSION || meta.state !== "ready") {
    return "rebuild-required";
  }
  return "ready";
}

function diagnosticsValue(meta: StoredMeta, items: readonly LUFXSearchableItemJSON[]): LuminaIndexMaintenanceDiagnostics {
  return Object.freeze({
    state: maintenanceState(meta),
    schemaVersion: meta.schemaVersion,
    tokenizerVersion: meta.tokenizerVersion ?? "unknown",
    checkpoint: Object.freeze({ generation: meta.generation, revision: meta.revision }),
    itemCount: items.length,
    approximateBytes: approximateItemBytes(items),
  });
}

async function ownerMutationKeys(store: IDBObjectStore, ownerKey: string): Promise<IDBValidKey[]> {
  const keys = await requestResult(store.getAllKeys());
  return keys.filter((key) => Array.isArray(key) && key[0] === ownerKey);
}

export class IndexedDBLuminaBackend implements LUFXIndexBackend, LuminaIndexMaintenanceBackend {
  readonly #indexedDB: IDBFactory;
  readonly #databaseName: string;
  readonly #ownerKey: string;
  readonly #disposeController = new AbortController();
  readonly #transactions = new Set<IDBTransaction>();
  #databasePromise: Promise<IDBDatabase> | null = null;
  #disposed = false;

  constructor(options: IndexedDBLuminaBackendOptions) {
    if (!options.indexedDB || typeof options.indexedDB.open !== "function") throw new TypeError("Lumina IndexedDB backend requires an IDBFactory.");
    if (!options.databaseName.trim()) throw new TypeError("Lumina IndexedDB database name must not be empty.");
    if (!options.ownerKey.trim()) throw new TypeError("Lumina IndexedDB owner identity must not be empty.");
    this.#indexedDB = options.indexedDB;
    this.#databaseName = options.databaseName;
    this.#ownerKey = options.ownerKey;
  }

  async mutate(mutation: LUFXIndexBackendMutation, signal?: AbortSignal): Promise<LUFXIndexBackendMutationResult> {
    this.#assertActive(signal);
    const database = await this.#database(signal);
    this.#assertActive(signal);
    const transaction = this.#transaction(database, ["items", "mutations", "meta"], "readwrite");
    const completed = transactionComplete(transaction, signal);
    const fingerprint = mutationFingerprint(mutation);
    try {
      const mutationStore = transaction.objectStore("mutations");
      const existing = await requestResult(mutationStore.get([this.#ownerKey, mutation.mutationId])) as StoredMutation | undefined;
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new DOMException("Lumina mutation ID was replayed with a different payload.", "InvalidStateError");
        }
        await completed;
        return Object.freeze({ mutationId: mutation.mutationId, checkpoint: Object.freeze({ ...existing.checkpoint }), replayed: true });
      }

      const metaStore = transaction.objectStore("meta");
      const currentMeta = (await requestResult(metaStore.get(this.#ownerKey)) as StoredMeta | undefined) ?? defaultMeta(this.#ownerKey);
      if (currentMeta.schemaVersion !== SCHEMA_VERSION
        || currentMeta.tokenizerVersion !== LUFX_TOKENIZER_VERSION
        || currentMeta.state !== "ready") {
        throw new DOMException("Lumina index requires rebuilding before mutation.", "InvalidStateError");
      }
      const items = transaction.objectStore("items");
      let clearedDomains = currentMeta.clearedDomains ?? [];
      if (mutation.kind === "upsert") {
        const validated = LUFXSearchableItem.fromJSON(mutation.item).toJSON();
        await requestResult(items.put({
          ...structuredClone(validated),
          ownerKey: this.#ownerKey,
          ...(currentMeta.storageLayout === "snapshot-overlay" ? { overlayKind: "upsert" as const } : {}),
        } satisfies StoredUpsert));
      } else if (mutation.kind === "delete") {
        if (currentMeta.storageLayout === "snapshot-overlay") {
          await requestResult(items.put({ ownerKey: this.#ownerKey, id: mutation.itemId, overlayKind: "delete" } satisfies StoredDeletion));
        } else {
          await requestResult(items.delete([this.#ownerKey, mutation.itemId]));
        }
      } else {
        const matches = await requestResult(items.index("ownerDomain").getAll([this.#ownerKey, mutation.domain])) as StoredItem[];
        await Promise.all(matches.map((match) => requestResult(items.delete([this.#ownerKey, match.id]))));
        if (currentMeta.storageLayout === "snapshot-overlay") {
          clearedDomains = Object.freeze([...new Set([...clearedDomains, mutation.domain])].sort());
        }
      }
      const checkpoint = Object.freeze({
        generation: currentMeta.generation + 1,
        revision: currentMeta.revision + 1,
      });
      await requestResult(metaStore.put({
        ownerKey: this.#ownerKey,
        schemaVersion: SCHEMA_VERSION,
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        generation: checkpoint.generation,
        revision: checkpoint.revision,
        state: "ready",
        storageLayout: currentMeta.storageLayout ?? "items",
        ...(currentMeta.snapshotGeneration === undefined ? {} : { snapshotGeneration: currentMeta.snapshotGeneration }),
        ...(clearedDomains.length === 0 ? {} : { clearedDomains }),
      } satisfies StoredMeta));
      await requestResult(mutationStore.put({
        ownerKey: this.#ownerKey,
        mutationId: mutation.mutationId,
        fingerprint,
        checkpoint,
      } satisfies StoredMutation));
      await completed;
      return Object.freeze({ mutationId: mutation.mutationId, checkpoint, replayed: false });
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      if (signal?.aborted) throw abortReason(signal);
      throw error;
    }
  }

  async snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot> {
    this.#assertActive(signal);
    const database = await this.#database(signal);
    this.#assertActive(signal);
    const transaction = this.#transaction(database, ["items", "meta"], "readonly");
    const completed = transactionComplete(transaction, signal);
    try {
      const metaStore = transaction.objectStore("meta");
      const [storedMeta, storedSnapshot, stored] = await Promise.all([
        requestResult(metaStore.get(this.#ownerKey)) as Promise<StoredMeta | undefined>,
        requestResult(metaStore.get(snapshotKey(this.#ownerKey))) as Promise<StoredGenerationSnapshot | undefined>,
        requestResult(transaction.objectStore("items").index("owner").getAll(this.#ownerKey)) as Promise<StoredItem[]>,
      ]);
      const meta = storedMeta ?? defaultMeta(this.#ownerKey);
      await completed;
      if (meta.schemaVersion !== SCHEMA_VERSION
        || meta.tokenizerVersion !== LUFX_TOKENIZER_VERSION
        || meta.state !== "ready") {
        return Object.freeze({
          state: "rebuild-required",
          schemaVersion: meta.schemaVersion,
          checkpoint: Object.freeze({ generation: meta.generation, revision: meta.revision }),
          items: Object.freeze([]),
        });
      }
      try {
        const items = materializeItems(meta, stored, storedSnapshot);
        return Object.freeze({
          state: "ready",
          schemaVersion: SCHEMA_VERSION,
          checkpoint: Object.freeze({ generation: meta.generation, revision: meta.revision }),
          items: Object.freeze(items),
        });
      } catch {
        return Object.freeze({
          state: "rebuild-required",
          schemaVersion: SCHEMA_VERSION,
          checkpoint: Object.freeze({ generation: meta.generation, revision: meta.revision }),
          items: Object.freeze([]),
        });
      }
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      if (signal?.aborted) throw abortReason(signal);
      throw error;
    }
  }

  async checkpoint(signal?: AbortSignal): Promise<Pick<LUFXIndexBackendSnapshot, "state" | "schemaVersion" | "checkpoint">> {
    this.#assertActive(signal);
    const database = await this.#database(signal);
    this.#assertActive(signal);
    const transaction = this.#transaction(database, ["meta"], "readonly");
    const completed = transactionComplete(transaction, signal);
    try {
      const storedMeta = await requestResult(transaction.objectStore("meta").get(this.#ownerKey)) as StoredMeta | undefined;
      await completed;
      const meta = storedMeta ?? defaultMeta(this.#ownerKey);
      const state: LUFXIndexState = meta.schemaVersion === SCHEMA_VERSION
        && meta.tokenizerVersion === LUFX_TOKENIZER_VERSION
        && meta.state === "ready"
        ? "ready"
        : "rebuild-required";
      return Object.freeze({
        state,
        schemaVersion: meta.schemaVersion,
        checkpoint: Object.freeze({ generation: meta.generation, revision: meta.revision }),
      });
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      if (signal?.aborted) throw abortReason(signal);
      throw error;
    }
  }

  async replaceAll(
    sourceItems: readonly LUFXSearchableItemJSON[],
    metadata: LuminaIndexReplacementMetadata,
    signal?: AbortSignal,
  ): Promise<LuminaIndexMaintenanceDiagnostics> {
    this.#assertActive(signal);
    if (!Array.isArray(sourceItems)) throw new TypeError("Lumina replacement items must be an array.");
    if (!metadata || metadata.tokenizerVersion !== LUFX_TOKENIZER_VERSION) {
      throw new TypeError("Lumina replacement requires the current tokenizer version.");
    }
    const validated = sourceItems.map((item) => LUFXSearchableItem.fromJSON(item).toJSON());
    validated.sort((left, right) => left.id.localeCompare(right.id));
    for (let index = 1; index < validated.length; index += 1) {
      if (validated[index - 1]?.id === validated[index]?.id) {
        throw new TypeError(`Lumina replacement contains duplicate item ID: ${validated[index]?.id}.`);
      }
    }

    const database = await this.#database(signal);
    this.#assertActive(signal);
    const transaction = this.#transaction(database, ["items", "mutations", "meta"], "readwrite");
    const completed = transactionComplete(transaction, signal);
    try {
      const itemStore = transaction.objectStore("items");
      const mutationStore = transaction.objectStore("mutations");
      const metaStore = transaction.objectStore("meta");
      const [storedMeta, existingItemKeys, existingMutationKeys] = await Promise.all([
        requestResult(metaStore.get(this.#ownerKey)) as Promise<StoredMeta | undefined>,
        requestResult(itemStore.index("owner").getAllKeys(this.#ownerKey)),
        ownerMutationKeys(mutationStore, this.#ownerKey),
      ]);
      const currentMeta = storedMeta ?? defaultMeta(this.#ownerKey);
      const expected = metadata.expectedCheckpoint;
      if (expected && (currentMeta.generation !== expected.generation || currentMeta.revision !== expected.revision)) {
        throw new DOMException("Lumina replacement generation became stale before commit.", "InvalidStateError");
      }
      if (metadata.expectedState !== undefined && maintenanceState(currentMeta) !== metadata.expectedState) {
        throw new DOMException("Lumina replacement owner state became stale before commit.", "InvalidStateError");
      }
      const checkpoint = Object.freeze({
        generation: currentMeta.generation + 1,
        revision: currentMeta.revision + 1,
      });
      await Promise.all([
        ...existingItemKeys.map((key) => requestResult(itemStore.delete(key))),
        ...existingMutationKeys.map((key) => requestResult(mutationStore.delete(key))),
        requestResult(metaStore.put({
          ownerKey: snapshotKey(this.#ownerKey),
          generation: checkpoint.generation,
          items: validated,
        } satisfies StoredGenerationSnapshot)),
      ]);
      const nextMeta = {
        ownerKey: this.#ownerKey,
        schemaVersion: SCHEMA_VERSION,
        tokenizerVersion: metadata.tokenizerVersion,
        generation: checkpoint.generation,
        revision: checkpoint.revision,
        state: "ready",
        storageLayout: "snapshot-overlay",
        snapshotGeneration: checkpoint.generation,
        clearedDomains: Object.freeze([]),
      } satisfies StoredMeta;
      await requestResult(metaStore.put(nextMeta));
      await completed;
      return diagnosticsValue(nextMeta, validated);
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      if (signal?.aborted) throw abortReason(signal);
      throw error;
    }
  }

  async eraseOwner(signal?: AbortSignal): Promise<LuminaIndexMaintenanceDiagnostics> {
    this.#assertActive(signal);
    const database = await this.#database(signal);
    this.#assertActive(signal);
    const transaction = this.#transaction(database, ["items", "mutations", "meta"], "readwrite");
    const completed = transactionComplete(transaction, signal);
    try {
      const itemStore = transaction.objectStore("items");
      const mutationStore = transaction.objectStore("mutations");
      const metaStore = transaction.objectStore("meta");
      const [storedMeta, existingItemKeys, existingMutationKeys] = await Promise.all([
        requestResult(metaStore.get(this.#ownerKey)) as Promise<StoredMeta | undefined>,
        requestResult(itemStore.index("owner").getAllKeys(this.#ownerKey)),
        ownerMutationKeys(mutationStore, this.#ownerKey),
      ]);
      const currentMeta = storedMeta ?? defaultMeta(this.#ownerKey);
      await Promise.all([
        ...existingItemKeys.map((key) => requestResult(itemStore.delete(key))),
        ...existingMutationKeys.map((key) => requestResult(mutationStore.delete(key))),
        requestResult(metaStore.delete(snapshotKey(this.#ownerKey))),
      ]);
      const checkpoint = Object.freeze({
        generation: currentMeta.generation + 1,
        revision: currentMeta.revision + 1,
      });
      const nextMeta = {
        ownerKey: this.#ownerKey,
        schemaVersion: SCHEMA_VERSION,
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        generation: checkpoint.generation,
        revision: checkpoint.revision,
        state: "erased",
        storageLayout: "snapshot-overlay",
        clearedDomains: Object.freeze([]),
      } satisfies StoredMeta;
      await requestResult(metaStore.put(nextMeta));
      await completed;
      return diagnosticsValue(nextMeta, []);
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      if (signal?.aborted) throw abortReason(signal);
      throw error;
    }
  }

  async diagnostics(signal?: AbortSignal): Promise<LuminaIndexMaintenanceDiagnostics> {
    this.#assertActive(signal);
    const database = await this.#database(signal);
    this.#assertActive(signal);
    const transaction = this.#transaction(database, ["items", "meta"], "readonly");
    const completed = transactionComplete(transaction, signal);
    try {
      const metaStore = transaction.objectStore("meta");
      const [storedMeta, storedSnapshot, stored] = await Promise.all([
        requestResult(metaStore.get(this.#ownerKey)) as Promise<StoredMeta | undefined>,
        requestResult(metaStore.get(snapshotKey(this.#ownerKey))) as Promise<StoredGenerationSnapshot | undefined>,
        requestResult(transaction.objectStore("items").index("owner").getAll(this.#ownerKey)) as Promise<StoredItem[]>,
      ]);
      const meta = storedMeta ?? defaultMeta(this.#ownerKey);
      await completed;
      if (meta.state === "erased") return diagnosticsValue(meta, []);
      try {
        return diagnosticsValue(meta, materializeItems(meta, stored, storedSnapshot));
      } catch {
        return Object.freeze({
          state: "rebuild-required",
          schemaVersion: meta.schemaVersion,
          tokenizerVersion: meta.tokenizerVersion ?? "unknown",
          checkpoint: Object.freeze({ generation: meta.generation, revision: meta.revision }),
          itemCount: stored.length,
          approximateBytes: 0,
        });
      }
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      if (signal?.aborted) throw abortReason(signal);
      throw error;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#disposeController.abort(new DOMException("Lumina IndexedDB backend was disposed.", "AbortError"));
    for (const transaction of [...this.#transactions]) {
      try { transaction.abort(); } catch { /* transaction already completed */ }
    }
    this.#transactions.clear();
    const pending = this.#databasePromise;
    this.#databasePromise = null;
    void pending?.then((database) => database.close(), () => undefined);
  }

  async #database(signal?: AbortSignal): Promise<IDBDatabase> {
    this.#assertActive(signal);
    if (!this.#databasePromise) {
      this.#databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        let settled = false;
        const request = this.#indexedDB.open(this.#databaseName, SCHEMA_VERSION);
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("items")) {
            const store = database.createObjectStore("items", { keyPath: ["ownerKey", "id"] });
            store.createIndex("owner", "ownerKey", { unique: false });
            store.createIndex("ownerDomain", ["ownerKey", "domain"], { unique: false });
          }
          if (!database.objectStoreNames.contains("mutations")) database.createObjectStore("mutations", { keyPath: ["ownerKey", "mutationId"] });
          if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "ownerKey" });
        };
        request.onblocked = () => fail(new DOMException("Lumina IndexedDB upgrade was blocked.", "InvalidStateError"));
        request.onerror = () => fail(request.error ?? new Error("Lumina IndexedDB open failed."));
        request.onsuccess = () => {
          if (settled || this.#disposed) { request.result.close(); if (!settled) fail(new DOMException("Lumina backend disposed during open.", "AbortError")); return; }
          settled = true;
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
      }).catch((error) => {
        this.#databasePromise = null;
        throw error;
      });
    }
    const database = await this.#databasePromise;
    this.#assertActive(signal);
    return database;
  }

  #transaction(database: IDBDatabase, stores: string[], mode: IDBTransactionMode): IDBTransaction {
    if (this.#disposed) throw new DOMException("Lumina IndexedDB backend is disposed.", "AbortError");
    const transaction = database.transaction(stores, mode);
    this.#transactions.add(transaction);
    const clear = () => this.#transactions.delete(transaction);
    transaction.addEventListener("complete", clear, { once: true });
    transaction.addEventListener("abort", clear, { once: true });
    transaction.addEventListener("error", clear, { once: true });
    return transaction;
  }

  #assertActive(signal?: AbortSignal): void {
    if (this.#disposed || this.#disposeController.signal.aborted) throw new DOMException("Lumina IndexedDB backend is disposed.", "AbortError");
    signal?.throwIfAborted();
  }
}
