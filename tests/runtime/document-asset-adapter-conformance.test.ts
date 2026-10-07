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
import { runDocumentAdapterConformance } from "../../src/SynCloudOS/Documents/Adapters/runDocumentAdapterConformance";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { createIndexedDBDocumentAssetStore } from "../../src/SynCloudOS/Documents/IndexedDBDocumentAssetStore";
import { createDocumentAssetStorageAdapter } from "../../src/SynCloudOS/Documents/DocumentAssetSaveCoordinator";
import { validateDocumentAssetReference, validateDocumentExternalAssetReference } from "../../src/SynCloudOS/Documents/documentAssetValidation";

const scope = { authorizationId: "app:a", documentId: "doc:a" };
describe("asset adapter capability conformance", () => {
  runDocumentAdapterConformance("asset-wrapped-memory", () => createDocumentAssetStorageAdapter({
    adapter: new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() }), store: createInMemoryDocumentAssetStore(),
    scopeForLocation: () => scope, enumerateReferences: () => [], nativeDurability: "memory",
  }));
  it("does not add an asset capability to an unwrapped asset-free adapter", () => {
    const adapter = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    expect(adapter).not.toHaveProperty("assets");
    expect(() => createIndexedDBDocumentAssetStore()).toThrow(expect.objectContaining({ code: "asset-unsupported" }));
  });
  it("rejects live descriptors, unknown fields and getter-bearing stable references", () => {
    const ref = { kind: "document-asset", scope, assetId: "a", hash: "sha256:" + "0".repeat(64), mimeType: "image/png", byteLength: 1 };
    expect(() => validateDocumentAssetReference({ ...ref, leaseId: "lease:a" })).toThrow();
    let called = false;
    const getter = { ...ref, get hash() { called = true; return ref.hash; } };
    expect(() => validateDocumentAssetReference(getter)).toThrow();
    expect(called).toBe(false);
  });
  it("distinguishes explicit external provider identity from volatile URLs", () => {
    const external = { kind: "external-document-asset", scope, assetId: "a", providerId: "provider", resourceId: "immutable:1", hash: "sha256:" + "0".repeat(64), mimeType: "image/png", byteLength: 1 };
    expect(validateDocumentExternalAssetReference({ ...external, url: "https://provider.example/immutable/1" }).providerId).toBe("provider");
    for (const url of ["blob:live", "data:image/png;base64,AA==", "http://volatile.example/image"]) expect(() => validateDocumentExternalAssetReference({ ...external, url })).toThrow();
    expect(() => validateDocumentAssetReference(external)).toThrow();
  });
});
