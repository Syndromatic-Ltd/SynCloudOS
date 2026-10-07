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

import type { SynCloudOSRuntimeEnvironment } from "../Runtime/runtimeInstanceTypes";
import {
  DocumentRecoveryUnavailableError,
  DocumentRecoveryVersionConflictError,
} from "./DocumentErrors";
import type { DocumentRecoveryRecord, DocumentRecoveryStore } from "./DocumentRecoveryStore";
import { throwIfDocumentAborted } from "./Adapters/InMemoryDocumentAdapter";

export interface IndexedDBDocumentRecoveryStoreOptions {
  readonly indexedDB: IDBFactory;
  readonly persistenceNamespace: string;
  readonly environment: Pick<SynCloudOSRuntimeEnvironment, "now">;
  readonly databaseName?: string;
}

interface StoredRecoveryRecord extends DocumentRecoveryRecord {
  readonly persistenceNamespace: string;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB recovery request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB recovery transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB recovery transaction failed."));
  });
}

function mapRecoveryError(error: unknown): unknown {
  if (error instanceof DocumentRecoveryVersionConflictError || error instanceof DocumentRecoveryUnavailableError) return error;
  if (error instanceof DOMException) {
    return new DocumentRecoveryUnavailableError(`IndexedDB recovery failed: ${error.message}`, { cause: error });
  }
  return error;
}

function cloneRecord(record: DocumentRecoveryRecord): DocumentRecoveryRecord {
  return Object.freeze(structuredClone(record));
}

export class IndexedDBDocumentRecoveryStore implements DocumentRecoveryStore {
  readonly #indexedDB: IDBFactory;
  readonly #persistenceNamespace: string;
  readonly #databaseName: string;
  #databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDBDocumentRecoveryStoreOptions) {
    if (!options.persistenceNamespace.trim()) throw new TypeError("Recovery persistence namespaces must not be empty.");
    this.#indexedDB = options.indexedDB;
    this.#persistenceNamespace = options.persistenceNamespace;
    this.#databaseName = options.databaseName ?? "syncloudos-document-recovery";
    if (typeof options.environment.now !== "function") throw new TypeError("Recovery storage requires an injected clock port.");
  }

  async write(
    record: Omit<DocumentRecoveryRecord, "recoveryVersion">,
    expectedRecoveryVersion: number | null,
    signal?: AbortSignal,
  ): Promise<DocumentRecoveryRecord> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = database.transaction("recovery", "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("recovery");
      const key = [this.#persistenceNamespace, record.recoveryId];
      const current = await requestResult(store.get(key)) as StoredRecoveryRecord | undefined;
      if ((current?.recoveryVersion ?? null) !== expectedRecoveryVersion) {
        throw new DocumentRecoveryVersionConflictError(
          record.recoveryId,
          expectedRecoveryVersion,
          current?.recoveryVersion ?? null,
        );
      }
      const next: StoredRecoveryRecord = {
        ...structuredClone(record),
        recoveryVersion: (current?.recoveryVersion ?? 0) + 1,
        persistenceNamespace: this.#persistenceNamespace,
      };
      await requestResult(store.put(next));
      await completed;
      const { persistenceNamespace: _namespace, ...publicRecord } = next;
      return cloneRecord(publicRecord);
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      throw mapRecoveryError(error);
    }
  }

  async read(recoveryId: string, signal?: AbortSignal): Promise<DocumentRecoveryRecord | null> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = database.transaction("recovery", "readonly");
    const stored = await requestResult(transaction.objectStore("recovery").get([
      this.#persistenceNamespace,
      recoveryId,
    ])) as StoredRecoveryRecord | undefined;
    await transactionComplete(transaction);
    throwIfDocumentAborted(signal);
    if (!stored) return null;
    const { persistenceNamespace: _namespace, ...record } = stored;
    return cloneRecord(record);
  }

  async remove(recoveryId: string, expectedRecoveryVersion: number, signal?: AbortSignal): Promise<void> {
    throwIfDocumentAborted(signal);
    const database = await this.#database(signal);
    const transaction = database.transaction("recovery", "readwrite");
    const completed = transactionComplete(transaction);
    try {
      const store = transaction.objectStore("recovery");
      const key = [this.#persistenceNamespace, recoveryId];
      const current = await requestResult(store.get(key)) as StoredRecoveryRecord | undefined;
      if (current?.recoveryVersion !== expectedRecoveryVersion) {
        throw new DocumentRecoveryVersionConflictError(
          recoveryId,
          expectedRecoveryVersion,
          current?.recoveryVersion ?? null,
        );
      }
      await requestResult(store.delete(key));
      await completed;
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already settled */ }
      await completed.catch(() => undefined);
      throw mapRecoveryError(error);
    }
  }

  close(): void {
    const pending = this.#databasePromise;
    this.#databasePromise = null;
    void pending?.then((database) => database.close(), () => undefined);
  }

  dispose(): void { this.close(); }

  async #database(signal?: AbortSignal): Promise<IDBDatabase> {
    throwIfDocumentAborted(signal);
    if (!this.#databasePromise) {
      this.#databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        let settled = false;
        const request = this.#indexedDB.open(this.#databaseName, 1);
        const fail = (error: unknown) => {
          if (settled) return;
          settled = true;
          reject(mapRecoveryError(error));
        };
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("recovery")) {
            database.createObjectStore("recovery", { keyPath: ["persistenceNamespace", "recoveryId"] });
          }
        };
        request.onblocked = () => fail(new DocumentRecoveryUnavailableError("IndexedDB recovery upgrade was blocked."));
        request.onerror = () => fail(request.error ?? new Error("IndexedDB recovery open failed."));
        request.onsuccess = () => {
          if (settled) { request.result.close(); return; }
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
    throwIfDocumentAborted(signal);
    return database;
  }
}
