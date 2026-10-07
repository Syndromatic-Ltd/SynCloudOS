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
import { createDocumentAssetRetention } from "../../src/SynCloudOS/Documents/DocumentAssetRetention";
import type { DocumentAssetRetentionKind } from "../../src/SynCloudOS/Documents/documentAssetTypes";

const scope = { authorizationId: "app:a", documentId: "doc:a" };
const root = (kind: DocumentAssetRetentionKind, id = kind) => ({ scope, kind, id });
const input = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };

describe("asset retention roots", () => {
  it("enumerates roots after publication failures so the coordinator can reconcile orphan pins", async () => {
    const store = createInMemoryDocumentAssetStore();
    const retention = createDocumentAssetRetention(store);
    expect(typeof store.listRetentionRoots).toBe("function");
    const ref = await store.put(scope, input);
    const handle = await retention.retain(root("version", "save:write-key:unique"), [ref]);
    expect(await store.listRetentionRoots(scope)).toEqual([{ root: handle.root, references: [ref], token: expect.any(String) }]);
    await handle.release();
    expect(await store.listRetentionRoots(scope)).toEqual([]);
  });
  it("preserves a deleted asset for undo, version, recovery and in-flight output independently", async () => {
    const store = createInMemoryDocumentAssetStore();
    const retention = createDocumentAssetRetention(store);
    const ref = await store.put(scope, input);
    const current = await retention.retain(root("committed"), [ref]);
    const holders = await Promise.all(["history", "version", "recovery", "output"].map(kind => retention.retain(root(kind as DocumentAssetRetentionKind), [ref])));
    await current.release();
    for (const holder of holders) {
      expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
      expect(await store.read(scope, ref)).toEqual(input.bytes);
      await holder.release();
    }
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 3 });
    await expect(store.read(scope, ref)).rejects.toMatchObject({ code: "asset-missing" });
  });

  it("fences stale handles after redo branch replacement", async () => {
    const store = createInMemoryDocumentAssetStore();
    const retention = createDocumentAssetRetention(store);
    const first = await store.put(scope, input);
    const next = await store.put(scope, { ...input, bytes: new Uint8Array([4]) });
    const oldHandle = await retention.retain(root("history"), [first]);
    const newHandle = await retention.retain(root("history"), [next]);
    expect(await oldHandle.release()).toBe(false);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 3 });
    expect(await store.read(scope, next)).toEqual(new Uint8Array([4]));
    expect(await newHandle.release()).toBe(true);
    expect(await newHandle.release()).toBe(false);
  });

  it("keeps the previous root when replacement references are missing or canceled", async () => {
    const store = createInMemoryDocumentAssetStore();
    const retention = createDocumentAssetRetention(store);
    const ref = await store.put(scope, input);
    await retention.replace(root("recovery"), [ref]);
    await expect(retention.replace(root("recovery"), [{ ...ref, assetId: "missing" }])).rejects.toMatchObject({ code: "asset-missing" });
    const abort = new AbortController(); abort.abort();
    await expect(retention.replace(root("recovery"), [], abort.signal)).rejects.toMatchObject({ code: "asset-aborted" });
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    expect(await retention.release(root("recovery"))).toBe(true);
  });

  it("collects only the requested document and preserves bytes used by another authorized document", async () => {
    const store = createInMemoryDocumentAssetStore();
    const retention = createDocumentAssetRetention(store);
    const ref = await store.put(scope, input);
    const other = { ...scope, documentId: "doc:b" };
    const copy = await store.copy(scope, ref, other);
    await retention.retain({ ...root("committed"), scope: other }, [copy]);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 0 });
    expect(await store.read(other, copy)).toEqual(input.bytes);
  });
});
