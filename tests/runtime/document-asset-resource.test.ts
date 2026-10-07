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
import { createDocumentResourceService } from "../../src/SynCloudOS/Documents/DocumentResourceService";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import type { RuntimeOwnerToken } from "../../src/SynCloudOS/Runtime/runtimeOwner";

const scope = { authorizationId: "app:a", documentId: "doc:a" };
const signal = () => new AbortController().signal;
function service(store?: ReturnType<typeof createInMemoryDocumentAssetStore>) {
  return createDocumentResourceService({ runtimeId: "runtime:a", ownerToken: {} as RuntimeOwnerToken, randomUUID: () => crypto.randomUUID(), signal: signal(),
    ...(store ? { assetBacking: { store, scopeForDocument: (documentId: string) => ({ ...scope, documentId }) } } : {}) });
}

describe("stable document assets and revocable resource leases", () => {
  it("maps a newly opened runtime document ID to its persistent document scope", async () => {
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const active = createDocumentResourceService({ runtimeId: "new-runtime", ownerToken: {} as RuntimeOwnerToken, signal: signal(), randomUUID: () => crypto.randomUUID(),
      assetBacking: { store, scopeForDocument: () => scope } });
    const live = await active.acquireAsset("new-open-document-id", ref, signal());
    expect(live.documentId).toBe("new-open-document-id");
    expect(active.resolve("new-open-document-id", live)).toEqual(new Uint8Array([1]));
    active.dispose();
  });
  it("interrupts a pending live acquisition immediately on service disposal", async () => {
    const active = service();
    let finish!: (bytes: ArrayBuffer) => void;
    const pending = active.acquire(scope.documentId, { size: 1, type: "image/png", arrayBuffer: () => new Promise(resolve => { finish = resolve; }) }, signal());
    active.dispose();
    const result = await Promise.race([pending.then(() => "published", error => error.name), new Promise(resolve => setTimeout(() => resolve("still-pending"), 30))]);
    finish(new Uint8Array([1]).buffer);
    await pending.catch(() => undefined);
    expect(result).toBe("AbortError");
  });
  it("reacquires a new runtime lease after the original service is disposed", async () => {
    const store = createInMemoryDocumentAssetStore();
    const first = service(store);
    expect(typeof first.persist).toBe("function");
    const live = await first.acquire(scope.documentId, { size: 3, type: "image/png", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, signal());
    const ref = await first.persist(scope.documentId, live, signal());
    first.dispose();
    const next = service(store);
    const acquired = await next.acquireAsset(scope.documentId, ref, signal());
    expect(acquired.leaseId).not.toBe(live.leaseId);
    expect(next.isActive(scope.documentId, live)).toBe(false);
    expect(next.resolve(scope.documentId, acquired)).toEqual(new Uint8Array([1, 2, 3]));
    next.release(scope.documentId, acquired);
    expect(await store.read(scope, ref)).toEqual(new Uint8Array([1, 2, 3]));
    next.dispose();
  });

  it("refuses unsupported persistence and another document's stable reference", async () => {
    const transient = service();
    expect(typeof transient.persist).toBe("function");
    const live = await transient.acquire(scope.documentId, { size: 1, type: "image/png", arrayBuffer: async () => new Uint8Array([1]).buffer }, signal());
    await expect(transient.persist(scope.documentId, live, signal())).rejects.toMatchObject({ code: "asset-unsupported" });
    const store = createInMemoryDocumentAssetStore();
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    await expect(service(store).acquireAsset("doc:b", ref, signal())).rejects.toMatchObject({ code: "asset-unauthorized" });
    transient.dispose();
  });

  it("preserves the live image MIME and 8 MiB limit independently of native storage", async () => {
    const store = createInMemoryDocumentAssetStore();
    const native = await store.put(scope, { bytes: new Uint8Array(8 * 1024 * 1024 + 1), mimeType: "image/png" });
    const active = service(store);
    expect(typeof active.acquireAsset).toBe("function");
    await expect(active.acquireAsset(scope.documentId, native, signal())).rejects.toThrow(RangeError);
    const pdf = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "application/pdf" });
    await expect(active.acquireAsset(scope.documentId, pdf, signal())).rejects.toThrow(TypeError);
    active.dispose();
  });
});
