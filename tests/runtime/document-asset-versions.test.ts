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

import { describe, expect, it } from "vitest";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { createDocumentAssetStorageAdapter } from "../../src/SynCloudOS/Documents/DocumentAssetSaveCoordinator";
import { reconcileDocumentAssetVersions } from "../../src/SynCloudOS/Documents/DocumentAssetVersionRetention";
import type { DocumentAssetReference } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import type { DocumentRecord } from "../../src/SynCloudOS/Documents/documentTypes";
const scope = { authorizationId: "app:a", documentId: "doc:a" };
const location = { kind: "memory" as const, namespace: "versions", key: "a" };
describe("saved version asset reachability", () => {
  it("keeps provider queries bound to the captured location while root identity hashing yields", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    const wrapper = createDocumentAssetStorageAdapter({ adapter: base, store, scopeForLocation: () => scope, enumerateReferences: content => (content as { assets: DocumentAssetReference[] }).assets });
    const first = await wrapper.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [ref] }, expectedVersion: null, idempotencyKey: "immutable-location" });
    let enter!: () => void, finish!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }), gate = new Promise<void>(resolve => { finish = resolve; });
    const mutable = { ...location };
    const result = reconcileDocumentAssetVersions({ adapter: base, store, scopeForLocation: () => scope, hash: async bytes => {
      const hash = "sha256:" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), byte => byte.toString(16).padStart(2, "0")).join("");
      enter(); await gate; return hash;
    } }, mutable);
    await entered; mutable.key = "a-different-provider-location"; finish();
    expect(await result).toBe(0);
    expect(await base.readVersion(location, first.version)).toEqual(first);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    expect(await store.read(scope, ref)).toEqual(new Uint8Array([1]));
  });
  it("reconciles actual native rollback eviction after the provider confirms its version is gone", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    const wrapper = createDocumentAssetStorageAdapter({ adapter: base, store, scopeForLocation: () => scope, enumerateReferences: content => (content as { assets: DocumentAssetReference[] }).assets });
    const first = await wrapper.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [] }, expectedVersion: null, idempotencyKey: "before" });
    const transaction = await wrapper.beginCloseTransaction!(location);
    const provisional = await wrapper.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [ref] }, expectedVersion: first.version,
      idempotencyKey: "close-save", closeTransactionToken: transaction.token });
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    await transaction.seal(); await transaction.rollback();
    expect(await base.readVersion(location, provisional.version)).toBeNull();
    expect(await wrapper.listVersions(location)).toEqual([first.version]);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 1 });
  });
  it("releases only genuinely evicted native versions, across wrapper recreation", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    // This host provider's actual history is this map; its current record still
    // uses the existing CAS adapter. Eviction deletes the historical record.
    const history = new Map<string, DocumentRecord<unknown>>();
    const adapter = new Proxy(base, { get(target, property) {
      if (property === "write") return async (...args: Parameters<typeof base.write>) => { const record = await base.write(...args); history.set(record.version.id, record); return record; };
      if (property === "listVersions") return async () => [...history.values()].map(record => record.version);
      if (property === "readVersion") return async (_location: unknown, version: { id: string }) => history.get(version.id) ?? null;
      const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    const createWrapper = () => createDocumentAssetStorageAdapter({ adapter, store, scopeForLocation: () => scope, enumerateReferences: content => (content as { assets: DocumentAssetReference[] }).assets });
    const first = await createWrapper().write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [ref] }, expectedVersion: null, idempotencyKey: "one" });
    const second = await createWrapper().write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [] }, expectedVersion: first.version, idempotencyKey: "two" });
    const reopened = createWrapper();
    await expect(reopened.assets.releaseEvictedVersions(location, [first.version])).rejects.toMatchObject({ code: "asset-conflict" });
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    history.delete(first.version.id);
    expect(await reopened.assets.releaseEvictedVersions(location, [first.version])).toBe(1);
    expect(await reopened.assets.releaseEvictedVersions(location, [first.version])).toBe(0);
    await expect(reopened.assets.releaseEvictedVersions(location, [second.version])).rejects.toMatchObject({ code: "asset-conflict" });
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 1 });
  });
  it("reopens a prior version after deleting its image from current content", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const wrapper = createDocumentAssetStorageAdapter({ adapter: new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() }),
      store, scopeForLocation: () => scope, enumerateReferences: content => (content as { assets: DocumentAssetReference[] }).assets });
    const first = await wrapper.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [ref] }, expectedVersion: null, idempotencyKey: "one" });
    const second = await wrapper.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [] }, expectedVersion: first.version, idempotencyKey: "two" });
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    expect(await wrapper.readVersion(location, first.version)).toEqual(first);
    expect(await wrapper.read(location)).toEqual(second);
  });
  it("rejects missing bytes in an older version instead of adopting incomplete content", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    const wrapper = createDocumentAssetStorageAdapter({ adapter: base, store, scopeForLocation: () => scope, enumerateReferences: content => (content as { assets: DocumentAssetReference[] }).assets });
    const first = await base.write({ location, typeId: "app.native", schemaVersion: 1, content: { assets: [ref] }, expectedVersion: null, idempotencyKey: "legacy-incomplete" });
    await expect(wrapper.readVersion(location, first.version)).rejects.toMatchObject({ code: "asset-missing" });
    expect((await base.readVersion(location, first.version))?.content).toEqual(first.content);
  });
});
