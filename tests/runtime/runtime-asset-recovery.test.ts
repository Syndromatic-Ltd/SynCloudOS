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
import { createDocumentAssetRecoveryStore } from "../../src/SynCloudOS/Documents/DocumentAssetRecoveryStore";
import { InMemoryDocumentRecoveryStore, canonicalDocumentContentHash } from "../../src/SynCloudOS/Documents/DocumentRecoveryStore";
import type { DocumentAssetReference } from "../../src/SynCloudOS/Documents/documentAssetTypes";
const scope = { authorizationId: "app:a", documentId: "doc:a" };
const input = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };
function fixture() {
  const store = createInMemoryDocumentAssetStore();
  const base = new InMemoryDocumentRecoveryStore();
  const wrapped = createDocumentAssetRecoveryStore({ recovery: base, store, scopeForDocument: () => scope, enumerateReferences: content => (content as { assets: DocumentAssetReference[] }).assets,
    randomUUID: () => crypto.randomUUID() });
  const record = (assets: DocumentAssetReference[]) => ({ schemaVersion: 1 as const, recoveryId: "recovery:a", documentId: scope.documentId, typeId: "app:a", typeSchemaVersion: 1,
    location: null, baseVersion: null, dirtyRevision: 1, serializedContent: { assets, private: { preserved: true } }, contentHash: canonicalDocumentContentHash({ assets, private: { preserved: true } }), capturedAt: new Date(1000).toISOString() });
  return { store, base, wrapped, record };
}
describe("runtime recovery manifest cooperation", () => {
  it("preserves the prior envelope/pin on conflicts and removes only the exact replaced root", async () => {
    const f = fixture();
    const ref = await f.store.put(scope, input);
    const first = await f.wrapped.write(f.record([ref]), null);
    await expect(f.wrapped.write(f.record([]), null)).rejects.toMatchObject({ code: "document-recovery-version-conflict" });
    expect(await f.wrapped.read(first.recoveryId)).toEqual(first);
    expect((await f.store.listRetentionRoots(scope)).filter(e => e.root.kind === "recovery")).toHaveLength(1);
    await expect(f.wrapped.remove(first.recoveryId, 99)).rejects.toMatchObject({ code: "document-recovery-version-conflict" });
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    await f.wrapped.write(f.record([]), first.recoveryVersion);
    expect(await f.store.listRetentionRoots(scope)).toEqual([]);
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 3 });
  });
  it("refuses canceled, missing and corrupt recovery dependencies without replacing the prior record", async () => {
    const f = fixture();
    const ref = await f.store.put(scope, input);
    const first = await f.wrapped.write(f.record([ref]), null);
    const abort = new AbortController(); abort.abort();
    await expect(f.wrapped.write(f.record([]), first.recoveryVersion, abort.signal)).rejects.toMatchObject({ code: "document-aborted" });
    await expect(f.wrapped.write(f.record([{ ...ref, assetId: "missing" }]), first.recoveryVersion)).rejects.toMatchObject({ code: "asset-missing" });
    expect(await f.wrapped.read(first.recoveryId)).toEqual(first);
    const corrupt = { ...first, assetManifest: { version: 99, scope, assets: [ref] } };
    await f.base.write(corrupt, first.recoveryVersion);
    await expect(f.wrapped.read(first.recoveryId)).rejects.toMatchObject({ code: "asset-corrupt" });
  });
});
