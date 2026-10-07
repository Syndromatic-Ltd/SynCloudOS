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
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";

const scope = { authorizationId: "app:a", documentId: "doc:a" };
const input = () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" });

describe("document asset store", () => {
  it("copies imported/read bytes and verifies a known SHA-256 digest", async () => {
    const store = createInMemoryDocumentAssetStore();
    const data = input();
    const ref = await store.put(scope, data);
    data.bytes[0] = 99;
    expect(ref.hash).toBe("sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
    expect(ref).not.toHaveProperty("leaseId");
    expect(ref).not.toHaveProperty("url");
    const bytes = await store.read(scope, ref);
    bytes[0] = 88;
    expect(await store.read(scope, ref)).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.capabilities.durability).toBe("memory");
  });

  it("deduplicates bytes while preserving document and object authorization identity", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumTotalBytes: 3 });
    const first = await store.put(scope, input());
    const second = await store.put(scope, input());
    expect(second.assetId).not.toBe(first.assetId);
    const destination = { ...scope, documentId: "doc:b" };
    const copied = await store.copy(scope, first, destination);
    expect(copied.assetId).not.toBe(first.assetId);
    expect(copied.scope).toEqual(destination);
    expect(copied.hash).toBe(first.hash);
    await expect(store.read(destination, first)).rejects.toMatchObject({ code: "asset-unauthorized" });
    await expect(store.copy(scope, first, { ...destination, authorizationId: "app:b" })).rejects.toMatchObject({ code: "asset-unauthorized" });
    await expect(store.put({ ...scope, authorizationId: "app:b" }, input())).rejects.toMatchObject({ code: "asset-quota" });
  });

  it("rejects invalid MIME, excessive size, immutable-ID conflicts, and forged metadata", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumAssetBytes: 3 });
    await expect(store.put(scope, { ...input(), mimeType: "blob:volatile" })).rejects.toMatchObject({ code: "asset-invalid" });
    await expect(store.put(scope, { ...input(), bytes: new Uint8Array(4) })).rejects.toMatchObject({ code: "asset-quota" });
    const ref = await store.put(scope, { ...input(), assetId: "fixed" });
    await expect(store.put(scope, { ...input(), assetId: "fixed", bytes: new Uint8Array([4]) })).rejects.toMatchObject({ code: "asset-conflict" });
    await expect(store.read(scope, { ...ref, mimeType: "image/jpeg" })).rejects.toMatchObject({ code: "asset-corrupt" });
    await expect(store.read(scope, { ...ref, assetId: "missing" })).rejects.toMatchObject({ code: "asset-missing" });
  });

  it("aborts pending hashing without publishing bytes or waiting for the producer", async () => {
    let finish!: (hash: string) => void;
    const store = createInMemoryDocumentAssetStore({ hash: () => new Promise<string>(resolve => { finish = resolve; }) });
    const controller = new AbortController();
    const pending = store.put(scope, input(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "asset-aborted" });
    finish("sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });

  it("detects corrupted persisted bytes through digest verification", async () => {
    let badHash = false;
    const hash = async (bytes: Uint8Array) => badHash
      ? "sha256:" + "0".repeat(64)
      : "sha256:" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), b => b.toString(16).padStart(2, "0")).join("");
    const store = createInMemoryDocumentAssetStore({ hash });
    const ref = await store.put(scope, input());
    badHash = true;
    await expect(store.read(scope, ref)).rejects.toMatchObject({ code: "asset-corrupt" });
  });

  it("promotes a verified root atomically at full quota and fences old release handles", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumRetentionRoots: 1 });
    const ref = await store.put(scope, input());
    const source = { scope, kind: "version" as const, id: "stage" }, target = { ...source, id: "actual-version" };
    const oldToken = await store.retain(source, [ref]);
    const token = await store.promoteRetentionRoot!(source, target, [ref], oldToken);
    expect(token).toEqual(expect.any(String));
    expect(await store.listRetentionRoots(scope)).toEqual([{ root: target, references: [ref], token }]);
    expect(await store.release(source, undefined, oldToken)).toBe(false);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    expect(await store.read(scope, ref)).toEqual(input().bytes);
  });

  it("refuses a stale promotion and leaves a newer source pin untouched", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumRetentionRoots: 1 });
    const ref = await store.put(scope, input());
    const source = { scope, kind: "version" as const, id: "stage" }, target = { ...source, id: "actual-version" };
    const oldToken = await store.retain(source, [ref]), freshToken = await store.retain(source, [ref]);
    expect(await store.promoteRetentionRoot!(source, target, [ref], oldToken)).toBeUndefined();
    expect(await store.listRetentionRoots(scope)).toEqual([{ root: source, references: [ref], token: freshToken }]);
    const token = await store.promoteRetentionRoot!(source, source, [ref], freshToken);
    expect(token).not.toBe(freshToken);
    expect(await store.release(source, undefined, freshToken)).toBe(false);
    expect(await store.read(scope, ref)).toEqual(input().bytes);
  });
});
