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
import { createDocumentAssetSaveCoordinator, createDocumentAssetStorageAdapter } from "../../src/SynCloudOS/Documents/DocumentAssetSaveCoordinator";
import type { DocumentAssetReference, DocumentAssetStore } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import type { DocumentStorageAdapter, DocumentWriteRequest } from "../../src/SynCloudOS/Documents/Adapters/documentAdapterTypes";

const scope = { authorizationId: "app:a", documentId: "doc:a" };
const location = { kind: "memory" as const, namespace: "assets", key: "doc:a" };
const capture = { revision: 5, contentIdentity: "native:a" };
const input = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };
const enumerateReferences = (value: unknown) => (value as { attachments?: DocumentAssetReference[] }).attachments ?? [];
function adapter() { return new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() }); }
function setup(base: DocumentStorageAdapter = adapter(), store: DocumentAssetStore = createInMemoryDocumentAssetStore()) {
  const options = { adapter: base, store, scopeForLocation: () => scope, enumerateReferences };
  return { base, store, coordinator: createDocumentAssetSaveCoordinator(options), wrapper: () => createDocumentAssetStorageAdapter(options) };
}
const request = (references: DocumentAssetReference[] = [], key = "save:a"): DocumentWriteRequest<{ title: string; attachments: DocumentAssetReference[]; privateExtension: unknown }> => ({
  location, typeId: "app.private.native", schemaVersion: 7, expectedVersion: null, idempotencyKey: key,
  content: { title: "Original", attachments: references, privateExtension: { pages: [1, 2], unknown: "preserved" } }, metadata: { displayName: "Untouched native grammar" },
});

describe("asset-aware native save", () => {
  it("keeps the previous native record on quota failure or cancellation during staging", async () => {
    let finish!: (hash: string) => void;
    const store = createInMemoryDocumentAssetStore({ hash: () => new Promise<string>(resolve => { finish = resolve; }) });
    const { coordinator, base } = setup(adapter(), store);
    const prior = await coordinator.save(request(), capture);
    const ref: DocumentAssetReference = { kind: "document-asset", scope, assetId: "pending", hash: "sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81", mimeType: "image/png", byteLength: 3 };
    const abort = new AbortController();
    const pending = coordinator.save({ ...request([ref], "abort"), expectedVersion: prior.record.version, signal: abort.signal }, { ...capture, stagedAssets: [{ reference: ref, input }] });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ code: "asset-aborted" });
    finish(ref.hash);
    expect(await base.read(location)).toEqual(prior.record);
    const small = createInMemoryDocumentAssetStore({ maximumTotalBytes: 1 });
    const { coordinator: limited } = setup(base, small);
    await expect(limited.save({ ...request([ref], "quota"), expectedVersion: prior.record.version }, { ...capture, stagedAssets: [{ reference: ref, input }] })).rejects.toMatchObject({ code: "asset-quota" });
    expect(await base.read(location)).toEqual(prior.record);
  });
  it("publishes unchanged application content and a verified metadata manifest with a captured receipt", async () => {
    const { store, coordinator, base } = setup();
    const ref = await store.put(scope, input);
    const write = request([ref]);
    const receipt = await coordinator.save(write, capture);
    expect(receipt.record.content).toEqual(write.content);
    expect(receipt.record.schemaVersion).toBe(7);
    expect(receipt.record.metadata.displayName).toBe(write.metadata?.displayName);
    expect(receipt.manifest.assets).toEqual([ref]);
    expect(receipt.revision).toBe(5);
    expect(receipt.contentIdentity).toBe("native:a");
    expect(receipt.durability).toBe("memory");
    expect((await base.read(location))?.version).toEqual(receipt.record.version);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });

  it("never publishes missing bytes and preserves the preceding native manifest", async () => {
    const { store, coordinator, base } = setup();
    const ref = await store.put(scope, input);
    const previous = await coordinator.save(request([ref]), capture);
    await expect(coordinator.save({ ...request([{ ...ref, assetId: "missing" }], "next"), expectedVersion: previous.record.version }, capture)).rejects.toMatchObject({ code: "asset-missing" });
    expect(await base.read(location)).toEqual(previous.record);
    expect(await base.listVersions(location)).toHaveLength(1);
  });

  it("preserves the prior manifest after staging bytes and encountering a conditional-write conflict", async () => {
    const { store, coordinator, base } = setup();
    const ref = await store.put(scope, input);
    const previous = await coordinator.save(request([ref]), capture);
    const staged = await store.put(scope, { ...input, bytes: new Uint8Array([4]) });
    await expect(coordinator.save(request([staged], "conflicting"), capture)).rejects.toMatchObject({ code: "document-version-conflict" });
    expect(await base.read(location)).toEqual(previous.record);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 1 });
    expect(await store.read(scope, ref)).toEqual(input.bytes);
  });

  it("captures content and reference enumeration before an upload settles", async () => {
    let finish!: (hash: string) => void;
    const digest = "sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
    let pendingHash = true;
    const store = createInMemoryDocumentAssetStore({ hash: () => {
      if (pendingHash) { pendingHash = false; return new Promise<string>(resolve => { finish = resolve; }); }
      return Promise.resolve(digest);
    } });
    const { coordinator } = setup(adapter(), store);
    const ref: DocumentAssetReference = { kind: "document-asset", scope, assetId: "staged", hash: "sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81", mimeType: "image/png", byteLength: 3 };
    const write = request([ref]);
    const pending = coordinator.save(write, { ...capture, stagedAssets: [{ reference: ref, input }] });
    write.content.title = "Newer edit";
    write.content.attachments.length = 0;
    finish(ref.hash);
    const receipt = await pending;
    expect(receipt.record.content.title).toBe("Original");
    expect(receipt.manifest.assets).toEqual([ref]);
    expect(receipt.contentIdentity).toBe("native:a");
  });

  it("uses existing idempotency and refuses reuse for different native content without deleting the original pin", async () => {
    const { store, coordinator, base } = setup();
    const ref = await store.put(scope, input);
    const write = request([ref]);
    const first = await coordinator.save(write, capture);
    const repeated = await coordinator.save(write, capture);
    expect(repeated.record.version).toEqual(first.record.version);
    for (let index = 0; index < 10; index += 1) await coordinator.save(write, capture);
    expect((await store.listRetentionRoots(scope)).filter(value => value.root.kind === "version")).toHaveLength(1);
    await expect(coordinator.save({ ...write, content: { ...write.content, title: "Different" } }, capture)).rejects.toMatchObject({ code: "document-unavailable" });
    expect(await base.listVersions(location)).toHaveLength(1);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });

  it("returns the committed receipt when cancellation occurs after the adapter commits", async () => {
    const abort = new AbortController();
    const base = adapter();
    const write = base.write.bind(base);
    base.write = async <T>(value: DocumentWriteRequest<T>) => { const record = await write(value); abort.abort(); return record; };
    const { coordinator } = setup(base);
    const receipt = await coordinator.save({ ...request(), signal: abort.signal }, capture);
    expect(receipt.record.version.sequence).toBe(1);
  });

  it("retains staged bytes across an unknown post-publication failure for idempotency recovery", async () => {
    const base = adapter();
    const write = base.write.bind(base);
    base.write = async <T>(value: DocumentWriteRequest<T>) => { await write(value); throw new Error("connection dropped after write"); };
    const { store, coordinator } = setup(base);
    const ref = await store.put(scope, input);
    await expect(coordinator.save(request([ref]), capture)).rejects.toThrow("connection dropped");
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    expect((await base.read<{ attachments: DocumentAssetReference[] }>(location))?.content.attachments).toEqual([ref]);
  });

  it("forwards the existing close transaction token and exact rollback protocol", async () => {
    const { store, wrapper, base } = setup();
    const wrapped = wrapper();
    const ref = await store.put(scope, input);
    const first = await wrapped.write(request([ref]));
    const transaction = await wrapped.beginCloseTransaction!(location);
    await wrapped.write({ ...request([], "close-write"), expectedVersion: first.version, closeTransactionToken: transaction.token });
    await transaction.seal(); await transaction.rollback();
    expect(await wrapped.read(location)).toEqual(first);
    expect(await base.listVersions(location)).toHaveLength(1);
    expect(await store.read(scope, ref)).toEqual(input.bytes);
  });

  it.each([false, true])("recovers one unknown write at a full one-root quota (provider recovery: %s)", async statusRecovery => {
    const base = adapter(), store = createInMemoryDocumentAssetStore({ maximumRetentionRoots: 1 });
    const write = base.write.bind(base);
    let writes = 0, recoveredQueries = 0;
    const provider = new Proxy(base, { get(target, property) {
      if (property === "write") return async <T>(value: DocumentWriteRequest<T>) => {
        writes += 1;
        const record = await write(value);
        if (writes === 1) throw new Error("lost committed acknowledgement");
        return record;
      };
      if (property === "recoverWriteByIdempotencyKey" && statusRecovery) return async <T>(value: DocumentWriteRequest<T>) => {
        recoveredQueries += 1;
        // Exercise the real provider's exact idempotency protocol; no fake receipt.
        return write(value);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const ref = await store.put(scope, input), value = request([ref]);
    await expect(setup(provider, store).coordinator.save(value, capture)).rejects.toThrow("lost committed acknowledgement");
    const actual = await base.read(location);
    const receipt = await setup(provider, store).coordinator.save(value, capture);
    expect(receipt.record).toEqual(actual);
    expect(receipt.retentionRoot!.id).toMatch(/^native-version:/);
    expect(await store.listRetentionRoots(scope)).toHaveLength(1);
    expect(writes).toBe(statusRecovery ? 1 : 2);
    expect(recoveredQueries).toBe(statusRecovery ? 1 : 0);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });

  it("preserves unknown pins for another location using the same textual key", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumRetentionRoots: 2 });
    const ref = await store.put(scope, input);
    const first = adapter(), second = adapter();
    const original = first.write.bind(first);
    first.write = async <T>(value: DocumentWriteRequest<T>) => { await original(value); throw new Error("unresolved first location"); };
    await expect(setup(first, store).coordinator.save(request([ref], "same-text-key"), capture)).rejects.toThrow("unresolved first location");
    const unknown = (await store.listRetentionRoots(scope))[0];
    const elsewhere = { ...location, key: "another-document" };
    const saved = await setup(second, store).coordinator.save({ ...request([ref], "same-text-key"), location: elsewhere }, capture);
    expect(saved.record.location).toEqual(elsewhere);
    expect(await store.listRetentionRoots(scope)).toContainEqual(unknown);
    expect(await store.listRetentionRoots(scope)).toHaveLength(2);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });

  it("refuses an unrelated provider recovery receipt without releasing the unknown pin", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumRetentionRoots: 1 }), base = adapter();
    const write = base.write.bind(base);
    base.write = async <T>(value: DocumentWriteRequest<T>) => { await write(value); throw new Error("unknown write"); };
    const ref = await store.put(scope, input), value = request([ref]);
    await expect(setup(base, store).coordinator.save(value, capture)).rejects.toThrow("unknown write");
    const provider = new Proxy(base, { get(target, property) {
      if (property === "recoverWriteByIdempotencyKey") return async () => {
        const record = await base.read(location);
        return { ...record!, content: { ...value.content, title: "Not this captured write" } };
      };
      const result = Reflect.get(target, property, target);
      return typeof result === "function" ? result.bind(target) : result;
    } });
    await expect(setup(provider, store).coordinator.save(value, capture)).rejects.toMatchObject({ code: "asset-corrupt" });
    const roots = await store.listRetentionRoots(scope);
    expect(roots).toHaveLength(1); expect(roots[0].root.id).toMatch(/^save:/);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });
});
