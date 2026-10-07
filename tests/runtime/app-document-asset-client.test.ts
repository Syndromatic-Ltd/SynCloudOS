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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { createDocumentResourceService } from "../../src/SynCloudOS/Documents/DocumentResourceService";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function fixture(backed = true) {
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ id: "runtime:sdk-assets", environment, applicationDocuments: { initialTypes: [noteType] } });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("test"); });
  const store = { ...createInMemoryDocumentAssetStore() };
  cleanups.push(() => store.dispose());
  if (backed) {
    // Trusted test injection until the coordinator wires runtime backing config.
    // Exercise the real store/service; the mounted app receives no store.
    Object.assign(runtime.documentResources, createDocumentResourceService({ runtimeId: runtime.runtimeId, ownerToken: runtime.documentResources.ownerToken, signal: runtime.signal, randomUUID: environment.randomUUID, assetBacking: { store, scopeForDocument: (documentId) => ({ authorizationId: "asset-owner", documentId }) } }));
  }
  const mount = (id: string) => {
    registerTestSynWare(runtime, { schemaVersion: 1, id, version: "1.0.0", title: id, routes: [{ path: `/${id}`, primary: true }], documentTypes: [{ id: noteType.id, displayName: noteType.displayName }] });
    const mounted = mountTestSynWareRuntime(runtime, id);
    cleanups.push(() => mounted.dispose("test"));
    const context = createSynWareContextValue(mounted.runtime);
    return { mounted, documents: context.documents.workspaceDocuments, resources: context.documents.documentResources };
  };
  return { runtime, store, owner: mount("asset-owner"), foreign: mount("asset-foreign"), mount };
}

const image = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });

describe("admitted document asset client", () => {
  it("persists real bytes then reacquires a separate scoped runtime lease", async () => {
    const { owner } = fixture();
    const document = await owner.documents.newDocument({ typeId: noteType.id });
    expect(owner.resources.assetCapabilities).toMatchObject({ durability: "memory", deduplication: "authorization-scoped" });
    expect(Object.isFrozen(owner.resources.assetCapabilities)).toBe(true);
    const descriptor = await owner.resources.acquire(document.id, image());
    const reference = await owner.resources.persist(document.id, descriptor);
    expect(() => owner.resources.persist(document.id, { ...descriptor })).toThrow(/lease/i);
    expect(reference).toMatchObject({ kind: "document-asset", scope: { authorizationId: "asset-owner", documentId: document.id }, byteLength: 4, mimeType: "image/png" });
    expect(Object.isFrozen(reference.scope)).toBe(true);
    expect(reference).not.toHaveProperty("leaseId");
    expect(owner.resources.release(document.id, descriptor)).toBe(true);
    const reacquired = await owner.resources.acquireAsset(document.id, reference);
    expect(reacquired).not.toBe(descriptor);
    expect(owner.resources.isActive(document.id, reacquired)).toBe(true);
    expect(owner.resources.resolve(document.id, reacquired)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("refuses foreign IDs, copied or sibling descriptors, and revoked clients", async () => {
    const { owner, foreign, mount } = fixture();
    const document = await owner.documents.newDocument({ typeId: noteType.id });
    const descriptor = await owner.resources.acquire(document.id, image());
    const reference = await owner.resources.persist(document.id, descriptor);
    const sibling = mount("asset-owner");
    sibling.documents.getDocument(document.id);
    expect(() => foreign.resources.acquireAsset(document.id, reference)).toThrow(/application/i);
    expect(() => foreign.resources.persist(document.id, descriptor)).toThrow(/application/i);
    expect(() => sibling.resources.persist(document.id, descriptor)).toThrow(/lease/i);
    owner.mounted.dispose("revoke assets");
    expect(() => owner.resources.acquireAsset(document.id, reference)).toThrow();
    expect(() => owner.resources.persist(document.id, descriptor)).toThrow();
  });

  it("reports absent backing honestly without fabricated capabilities", async () => {
    const { owner } = fixture(false);
    const document = await owner.documents.newDocument({ typeId: noteType.id });
    const descriptor = await owner.resources.acquire(document.id, image());
    expect(owner.resources.assetCapabilities).toBeUndefined();
    await expect(owner.resources.persist(document.id, descriptor)).rejects.toMatchObject({ code: "asset-unsupported" });
  });

  it("honours caller cancellation for both acquisition and persistence", async () => {
    const { owner } = fixture();
    const document = await owner.documents.newDocument({ typeId: noteType.id });
    const descriptor = await owner.resources.acquire(document.id, image());
    const reference = await owner.resources.persist(document.id, descriptor);
    const controller = new AbortController();
    controller.abort(new DOMException("cancel asset operation", "AbortError"));
    await expect(owner.resources.acquireAsset(document.id, reference, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(owner.resources.persist(document.id, descriptor, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(owner.resources.isActive(document.id, descriptor)).toBe(true);
  });

  it("releases a late descriptor when a document ID was reused", async () => {
    const { owner, runtime } = fixture();
    const document = await owner.documents.newDocument({ documentId: "reused-assets", typeId: noteType.id });
    const descriptor = await owner.resources.acquire(document.id, image());
    const reference = await owner.resources.persist(document.id, descriptor);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const acquire = runtime.documentResources.acquireAsset.bind(runtime.documentResources);
    const late = vi.spyOn(runtime.documentResources, "acquireAsset").mockImplementationOnce(async (id, value, signal) => { await gate; return acquire(id, value, signal); });
    const pending = owner.resources.acquireAsset(document.id, reference);
    await vi.waitFor(() => expect(late).toHaveBeenCalledOnce());
    await owner.documents.closeDocument(document.id);
    await owner.documents.newDocument({ documentId: document.id, typeId: noteType.id });
    release();
    await expect(pending).rejects.toMatchObject({ name: "SecurityError" });
    const lateDescriptor = await late.mock.results[0]!.value;
    expect(runtime.documentResources.isActive(document.id, lateDescriptor)).toBe(false);
  });

  it("rejects persistence completion after its source lease is released", async () => {
    const { owner, store } = fixture();
    const document = await owner.documents.newDocument({ typeId: noteType.id });
    const descriptor = await owner.resources.acquire(document.id, image());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const put = store.put.bind(store);
    const write = vi.spyOn(store, "put").mockImplementationOnce(async (scope, input, signal) => { await gate; return put(scope, input, signal); });
    const pending = owner.resources.persist(document.id, descriptor);
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    owner.resources.release(document.id, descriptor);
    release();
    await expect(pending).rejects.toMatchObject({ code: "asset-aborted" });
  });
});
