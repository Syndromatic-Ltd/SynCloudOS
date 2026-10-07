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
import { createDocumentAssetManifest, encodeDocumentAssetManifest, readDocumentAssetManifest, verifyDocumentAssetManifest, documentAssetManifestMetadataKey } from "../../src/SynCloudOS/Documents/documentAssetManifest";
const scope = { authorizationId: "app:a", documentId: "doc:a" };
describe("reusable recovery asset operations", () => {
  it("keeps committed recovery bytes after the live/committed root is removed", async () => {
    const store = createInMemoryDocumentAssetStore();
    const retention = createDocumentAssetRetention(store);
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const committed = await retention.retain({ scope, kind: "committed", id: "model" }, [ref]);
    const recovery = await retention.retain({ scope, kind: "recovery", id: "recovery:a" }, [ref]);
    const metadata = { [documentAssetManifestMetadataKey]: encodeDocumentAssetManifest(createDocumentAssetManifest(scope, [ref])) };
    await committed.release();
    await store.collectGarbage(scope);
    await verifyDocumentAssetManifest(store, readDocumentAssetManifest(metadata)!);
    await recovery.release();
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 1 });
  });
  it("rejects corrupt manifests and canceled/missing restore dependencies before adoption", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    expect(() => readDocumentAssetManifest({ [documentAssetManifestMetadataKey]: '{"version":99}' })).toThrow(expect.objectContaining({ code: "asset-corrupt" }));
    const manifest = createDocumentAssetManifest(scope, [ref]);
    await expect(verifyDocumentAssetManifest(store, { ...manifest, version: 99 } as unknown as typeof manifest)).rejects.toMatchObject({ code: "asset-corrupt" });
    const abort = new AbortController(); abort.abort();
    await expect(verifyDocumentAssetManifest(store, manifest, abort.signal)).rejects.toMatchObject({ code: "asset-aborted" });
    await store.collectGarbage(scope);
    await expect(verifyDocumentAssetManifest(store, manifest)).rejects.toMatchObject({ code: "asset-missing" });
  });
});
