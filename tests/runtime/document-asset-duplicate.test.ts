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
import { createDocumentAssetManifest } from "../../src/SynCloudOS/Documents/documentAssetManifest";
import { copyDocumentAssetManifest } from "../../src/SynCloudOS/Documents/documentAssetCopy";
const scope = { authorizationId: "app:a", documentId: "doc:a" };
const input = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };
describe("duplicate and save-as asset authority", () => {
  it("returns native-reference remapping with distinct semantic identity and shared authorized bytes", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumTotalBytes: 3 });
    const references = await Promise.all([store.put(scope, input), store.put(scope, input)]);
    const destination = { ...scope, documentId: "doc:b" };
    const copied = await copyDocumentAssetManifest(store, createDocumentAssetManifest(scope, references), destination);
    expect(copied.mapping).toHaveLength(2);
    expect(new Set(copied.manifest.assets.map(ref => ref.assetId)).size).toBe(2);
    for (const pair of copied.mapping) {
      expect(pair.source.scope).toEqual(scope);
      expect(pair.destination.assetId).not.toBe(pair.source.assetId);
      expect(pair.destination.scope).toEqual(destination);
      expect(await store.read(destination, pair.destination)).toEqual(input.bytes);
      expect(pair.destination).not.toHaveProperty("leaseId");
    }
    await store.retain({ scope: destination, kind: "committed", id: "new-document" }, copied.manifest.assets);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 2, removedBytes: 0 });
  });
  it("refuses cross-provider authority transfer and missing source content", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, input);
    const manifest = createDocumentAssetManifest(scope, [ref]);
    await expect(copyDocumentAssetManifest(store, manifest, { ...scope, documentId: "doc:b", authorizationId: "app:b" })).rejects.toMatchObject({ code: "asset-unauthorized" });
    await store.collectGarbage(scope);
    await expect(copyDocumentAssetManifest(store, manifest, { ...scope, documentId: "doc:b" })).rejects.toMatchObject({ code: "asset-missing" });
  });
  it("aborts copying without altering source ownership", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, input);
    const abort = new AbortController(); abort.abort();
    await expect(copyDocumentAssetManifest(store, createDocumentAssetManifest(scope, [ref]), { ...scope, documentId: "doc:b" }, abort.signal)).rejects.toMatchObject({ code: "asset-aborted" });
    expect(await store.read(scope, ref)).toEqual(input.bytes);
  });
});
