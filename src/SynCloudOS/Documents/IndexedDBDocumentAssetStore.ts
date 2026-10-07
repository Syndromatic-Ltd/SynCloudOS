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

import { createDocumentAssetStore, type DocumentAssetStoreOptions } from "./DocumentAssetStore";
import { emptyDocumentAssetState, type DocumentAssetBackend, type DocumentAssetBackendState } from "./documentAssetBackend";
import { assertDocumentAssetNotAborted, awaitDocumentAsset, DocumentAssetError, documentAssetStorageError } from "./documentAssetErrors";
import type { DocumentAssetStore } from "./documentAssetTypes";
import { documentAssetId } from "./documentAssetValidation";
import { createBrowserDocumentAssetEnvironment } from "../PlatformAdapters/BrowserDocumentAssetEnvironment";

export interface IndexedDBDocumentAssetStoreOptions extends DocumentAssetStoreOptions {
  readonly indexedDB?: IDBFactory;
  /** Dedicated database, separate from existing native adapter schema upgrades. */
  readonly databaseName?: string;
}

export function createIndexedDBDocumentAssetStore(options: IndexedDBDocumentAssetStoreOptions = {}): DocumentAssetStore {
  const factory = options.indexedDB ?? createBrowserDocumentAssetEnvironment().indexedDB;
  if (!factory) throw new DocumentAssetError("asset-unsupported", "Durable IndexedDB asset storage is unavailable.");
  const databaseName = documentAssetId(options.databaseName ?? "syncloudos-document-assets-v1");
  const lifetime = new AbortController();
  const transactions = new Set<IDBTransaction>();
  let databasePromise: Promise<IDBDatabase> | undefined;
  const live = (signal?: AbortSignal) => { assertDocumentAssetNotAborted(signal); assertDocumentAssetNotAborted(lifetime.signal); };
  const database = (signal?: AbortSignal): Promise<IDBDatabase> => {
    live(signal);
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        let failed = false;
        const request = factory.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("asset-state")) request.result.createObjectStore("asset-state");
        };
        request.onerror = () => { failed = true; databasePromise = undefined; reject(documentAssetStorageError(request.error)); };
        request.onblocked = () => { failed = true; databasePromise = undefined; reject(new DocumentAssetError("asset-unavailable", "The asset database upgrade is blocked by another connection.")); };
        request.onsuccess = () => {
          const db = request.result;
          if (failed || lifetime.signal.aborted) { db.close(); reject(new DocumentAssetError("asset-aborted", "The asset store was disposed while opening.")); return; }
          db.onversionchange = () => { db.close(); databasePromise = undefined; };
          resolve(db);
        };
      });
    }
    return awaitDocumentAsset(awaitDocumentAsset(databasePromise, signal), lifetime.signal);
  };
  const backend: DocumentAssetBackend = {
    durability: "durable",
    async run<T>(write: boolean, operation: (state: DocumentAssetBackendState) => T, signal?: AbortSignal): Promise<T> {
      try {
        const db = await database(signal);
        live(signal);
        return await new Promise<T>((resolve, reject) => {
          const transaction = db.transaction("asset-state", write ? "readwrite" : "readonly");
          transactions.add(transaction);
          let result: T, failure: unknown;
          const cleanup = () => { transactions.delete(transaction); signal?.removeEventListener("abort", abort); lifetime.signal.removeEventListener("abort", abort); };
          const abort = () => {
            failure = new DocumentAssetError("asset-aborted", "The asset transaction was aborted.", { cause: signal?.reason ?? lifetime.signal.reason });
            try { transaction.abort(); } catch { /* transaction already committed */ }
          };
          transaction.oncomplete = () => { cleanup(); resolve(result); };
          transaction.onabort = () => { cleanup(); reject(documentAssetStorageError(failure ?? transaction.error)); };
          transaction.onerror = () => { failure ??= transaction.error; };
          signal?.addEventListener("abort", abort, { once: true });
          lifetime.signal.addEventListener("abort", abort, { once: true });
          const store = transaction.objectStore("asset-state");
          const request = store.get("state");
          request.onerror = () => { failure = request.error; };
          request.onsuccess = () => {
            try {
              live(signal);
              const state = (request.result ?? emptyDocumentAssetState()) as DocumentAssetBackendState;
              if (!state || typeof state !== "object" || !state.assets || !state.blobs || !state.roots) throw new DocumentAssetError("asset-corrupt", "The asset database envelope is corrupt.");
              result = operation(state);
              if (write) store.put(state, "state");
            } catch (error) { failure = error; try { transaction.abort(); } catch { /* transaction already failed */ } }
          };
        });
      } catch (error) { throw documentAssetStorageError(error); }
    },
    dispose() {
      lifetime.abort();
      for (const transaction of [...transactions]) { try { transaction.abort(); } catch { /* transaction already completed */ } }
      void databasePromise?.then(db => db.close(), () => undefined);
      databasePromise = undefined;
    },
  };
  return createDocumentAssetStore(backend, options);
}
