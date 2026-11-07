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

// Load the runtime graph before publishing assetFixture. Loading it inside runtimeSave
// discovers browser dependencies after Vite's initial crawl and can reload mid-save.
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createIndexedDBDocumentAssetStore } from "../../../src/SynCloudOS/Documents/IndexedDBDocumentAssetStore";
import { createDocumentAssetStorageAdapter } from "../../../src/SynCloudOS/Documents/DocumentAssetSaveCoordinator";
import { createDocumentResourceService } from "../../../src/SynCloudOS/Documents/DocumentResourceService";
import { IndexedDBDocumentAdapter } from "../../../src/SynCloudOS/Documents/Adapters/IndexedDBDocumentAdapter";
import type { DocumentAssetReference } from "../../../src/SynCloudOS/Documents/documentAssetTypes";
import type { RuntimeOwnerToken } from "../../../src/SynCloudOS/Runtime/runtimeOwner";
import type { DocumentType } from "../../../src/SynCloudOS/Documents/documentTypes";

// A generated PNG with valid chunks/CRC, accepted by all three browser decoders.
const imageBytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
const scope = { authorizationId: "fixture:assets", documentId: "fixture:document" };
const abort = () => new AbortController().signal;
const prefix = new URL(location.href).searchParams.get("database") ?? "document-assets-browser-fixture";
const assetOptions = { indexedDB, databaseName: `${prefix}:assets` };
const locationValue = { kind: "indexed-db" as const, database: `${prefix}:native`, store: "records", key: scope.documentId };
function backing() {
  const store = createIndexedDBDocumentAssetStore(assetOptions);
  const adapter = new IndexedDBDocumentAdapter({ indexedDB, databaseName: locationValue.database, environment: { now: () => Date.now(), randomUUID: () => crypto.randomUUID() } });
  const wrapper = createDocumentAssetStorageAdapter({ adapter, store, nativeDurability: "durable", scopeForLocation: () => scope,
    enumerateReferences: value => (value as { assets?: DocumentAssetReference[] }).assets ?? [] });
  const service = createDocumentResourceService({ runtimeId: `fixture:${crypto.randomUUID()}`, ownerToken: {} as RuntimeOwnerToken,
    randomUUID: () => crypto.randomUUID(), signal: abort(), assetBacking: { store, scopeForDocument: () => scope } });
  return { store, adapter, wrapper, service };
}
async function display(bytes: Uint8Array) {
  const img = document.querySelector<HTMLImageElement>("#asset-image")!;
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "image/png" }));
  try {
    img.src = url; await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}
async function kernel() {
  const environment = createBrowserRuntimeEnvironment();
  const nativeLocation = { ...locationValue, database: `${prefix}:runtime-native` };
  const adapter = new IndexedDBDocumentAdapter({ indexedDB, databaseName: nativeLocation.database, environment });
  interface Native { assets: DocumentAssetReference[]; private: { preserved: boolean } }
  const type: DocumentType<Native> = { id: "fixture.runtime-native", displayName: "Runtime assets", schemaVersion: 1, extensions: ["fixture"], mimeTypes: ["application/x-runtime-assets"],
    capabilities: { versions: true, conflicts: true }, autosave: "disabled", create: () => ({ assets: [], private: { preserved: true } }), read: value => value, write: value => ({ ...value }),
    validate: (value): value is Native => !!value && typeof value === "object" && Array.isArray((value as Native).assets) && !!(value as Native).private };
  let disposals = 0;
  const runtime = createSynCloudOS({ id: `fixture-kernel:${crypto.randomUUID()}`, environment, persistenceNamespace: `${prefix}:kernel`,
    applicationDocuments: { initialAdapters: [adapter], initialTypes: [type as DocumentType<unknown>], assetBacking: {
      createStore: () => {
        const store = createIndexedDBDocumentAssetStore({ indexedDB, databaseName: `${prefix}:runtime-assets` });
        return Object.freeze({ ...store, dispose() { disposals += 1; store.dispose(); } });
      },
      scopeForDocument: () => scope,
      manifest: { enumerateReferences: value => (value as Native).assets, scopeForLocation: () => scope, nativeDurability: "durable" },
    } } });
  return { runtime, type, nativeLocation, disposals: () => disposals };
}
const fixture = {
  async runtimeSave() {
    const { runtime, type, nativeLocation, disposals } = await kernel();
    const document = await runtime.documents.newDocument({ documentId: "first-runtime-document", typeId: type.id });
    try {
      await runtime.documentAssets!.whenReady(document.id);
      const live = await runtime.documentResources.acquire(document.id, { type: "image/png", size: imageBytes.length, arrayBuffer: async () => imageBytes.slice().buffer }, abort());
      const reference = await runtime.documentResources.persist(document.id, live, abort());
      const next = { assets: [reference], private: { preserved: true } };
      const prepared = await runtime.documentAssets!.prepareEdit(document.id, document.model, next);
      const result = document.transact(() => next, { expectedRevision: prepared.expectedRevision, actionName: "Insert fixture image", retainResources: prepared.retainResources });
      await prepared.release();
      if (result.status !== "committed") throw new Error("Runtime asset admission failed.");
      await runtime.documents.saveAsDocument({ documentId: document.id, destination: nativeLocation });
      const geometry = await display(runtime.documentResources.resolve(document.id, live)!);
      const version = document.currentVersion;
      const disposition = await runtime.dispose("fresh asset runtime fixture saved");
      return { reference, leaseId: live.leaseId, version, geometry, disposition: disposition.status, disposals: disposals(), durable: runtime.documentResources.assetCapabilities!.durability };
    } finally {
      runtime.documents.registerCloseReviewer({ review: async () => "discard" });
      await runtime.dispose("runtime save fixture cleanup");
    }
  },
  async runtimeReopen() {
    const { runtime, type, nativeLocation, disposals } = await kernel();
    try {
      const document = await runtime.documents.openDocument({ documentId: "fresh-runtime-document", typeId: type.id, location: nativeLocation });
      await runtime.documentAssets!.whenReady(document.id);
      const reference = (document.model as { assets: DocumentAssetReference[] }).assets[0];
      const live = await runtime.documentResources.acquireAsset(document.id, reference, abort());
      const bytes = runtime.documentResources.resolve(document.id, live)!;
      const geometry = await display(bytes);
      const version = document.currentVersion;
      const disposition = await runtime.dispose("fresh asset runtime fixture reopened");
      return { reference, leaseId: live.leaseId, version, bytes: Array.from(bytes), geometry, disposition: disposition.status, disposals: disposals() };
    } finally {
      runtime.documents.registerCloseReviewer({ review: async () => "discard" });
      await runtime.dispose("runtime reopen fixture cleanup");
    }
  },
  async save() {
    const { store, adapter, wrapper, service } = backing();
    try {
      const live = await service.acquire(scope.documentId, { type: "image/png", size: imageBytes.length, arrayBuffer: async () => imageBytes.slice().buffer }, abort());
      const reference = await service.persist(scope.documentId, live, abort());
      const written = await wrapper.write({ location: locationValue, typeId: "fixture.native", schemaVersion: 1, content: { assets: [reference], private: { retained: true } }, expectedVersion: null, idempotencyKey: "first-save" });
      const geometry = await display(service.resolve(scope.documentId, live)!);
      return { reference, leaseId: live.leaseId, version: written.version, geometry };
    } finally { service.dispose(); store.dispose(); adapter.dispose(); }
  },
  async reopen() {
    const { store, adapter, wrapper, service } = backing();
    try {
      const record = await wrapper.read<{ assets: DocumentAssetReference[] }>(locationValue);
      if (!record) throw new Error("Saved native record is missing.");
      const reference = record.content.assets[0];
      const live = await service.acquireAsset(scope.documentId, reference, abort());
      const bytes = service.resolve(scope.documentId, live)!;
      const geometry = await display(bytes);
      return { reference, leaseId: live.leaseId, version: record.version, bytes: Array.from(bytes), geometry, collection: await store.collectGarbage(scope) };
    } finally { service.dispose(); store.dispose(); adapter.dispose(); }
  },
  async concurrentWriters() {
    const concurrentScope = { ...scope, authorizationId: "fixture:concurrent" };
    const first = createIndexedDBDocumentAssetStore({ indexedDB, databaseName: `${prefix}:concurrent`, maximumTotalBytes: 3 });
    const second = createIndexedDBDocumentAssetStore({ indexedDB, databaseName: `${prefix}:concurrent`, maximumTotalBytes: 3 });
    try {
      // An independent database isolates quota from the previously saved image.
      const results = await Promise.allSettled([first.put(concurrentScope, { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" }),
        second.put(concurrentScope, { bytes: new Uint8Array([4, 5, 6]), mimeType: "image/png" })]);
      return results.map(result => result.status === "fulfilled" ? "saved" : result.reason.code);
    } finally { first.dispose(); second.dispose(); }
  },
  async corrupt() {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(assetOptions.databaseName, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("asset-state", "readwrite");
        const objectStore = transaction.objectStore("asset-state");
        const request = objectStore.get("state");
        request.onsuccess = () => { const state = request.result; const key = Object.keys(state.blobs)[0]; state.blobs[key][0] ^= 1; objectStore.put(state, "state"); };
        transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
    try { await fixture.reopen(); return "incorrect-success"; } catch (error) { return (error as { code: string }).code; }
  },
};
Object.assign(window, { assetFixture: fixture });
