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
import type { DocumentAssetReference } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

interface Model { title: string; assets: readonly DocumentAssetReference[] }
const type: DocumentType<Model> = {
  id: "sdk.asset-preparation", displayName: "Asset preparation", schemaVersion: 1, extensions: [], mimeTypes: [], autosave: "disabled",
  capabilities: { versions: true, conflicts: true }, create: () => ({ title: "New", assets: [] }), read: (value) => value, write: (value) => ({ ...value }),
  validate: (value): value is Model => !!value && typeof value === "object" && typeof (value as Model).title === "string" && Array.isArray((value as Model).assets),
};
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const bytes = new Uint8Array([1, 2, 3]);

async function fixture(backed = true) {
  let pauseHash: (() => Promise<void>) | undefined;
  const hash = async (value: Uint8Array) => {
    const digest = "sha256:" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value.slice().buffer)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await pauseHash?.();
    return digest;
  };
  const store = { ...createInMemoryDocumentAssetStore({ hash }) };
  cleanups.push(() => store.dispose());
  const scopeForDocument = (documentId: string) => ({ authorizationId: "com.example.prepared-owner", documentId });
  const runtime = createTestRuntime({ environment: createTestRuntimeEnvironment(), applicationDocuments: {
    initialTypes: [type], ...(backed ? { assetBacking: { store, scopeForDocument, manifest: {
      scopeForLocation: () => scopeForDocument("prepared-document"), enumerateReferences: (content: unknown) => (content as Model).assets,
    } } } : {}),
  } });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("test"); });
  const mount = (id: string) => {
    registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: id, version: "1.0.0", displayName: id, routes: [{ path: `/${id.split(".").at(-1)}`, primary: true }], documentTypes: [{ id: type.id, displayName: type.displayName }] });
    const mounted = mountTestSynWareRuntime(runtime, id);
    cleanups.push(() => mounted.dispose("test"));
    return { mounted, ...createSynWareContextValue(mounted.runtime).documents };
  };
  const app = mount("com.example.prepared-owner"), foreign = mount("com.example.prepared-foreign");
  const document = await app.workspaceDocuments.newDocument<Model>({ documentId: "prepared-document", typeId: type.id });
  const canonical = runtime.documents.getDocument(document.id)!;
  const persist = async () => {
    const descriptor = await app.documentResources.acquire(document.id, new Blob([bytes], { type: "image/png" }));
    const reference = await app.documentResources.persist(document.id, descriptor);
    app.documentResources.release(document.id, descriptor);
    return reference;
  };
  const blockHash = () => {
    let entered!: () => void, finish!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    pauseHash = () => { entered(); return gate; };
    return { started, finish: () => { pauseHash = undefined; finish(); } };
  };
  return { runtime, store, scope: scopeForDocument(document.id), app, foreign, document, canonical, persist, blockHash };
}

describe("scoped SDK asset model preparation", () => {
  it.each(["automatic", "explicit"] as const)("pins %s insertion/deletion history, restores bytes on undo and collects only after eviction", async (retention) => {
    const { app, runtime, store, scope, document, canonical, persist } = await fixture();
    const reference = await persist();
    const release = vi.spyOn(store, "release");
    async function change(assets: readonly DocumentAssetReference[]) {
      const before = app.workspaceDocuments.getDocument<Model>(document.id)!.model;
      const after = { ...before, assets };
      const prepared = await app.documentResources.prepareEdit<Model>(document.id, before, after);
      expect(Object.keys(prepared).sort()).toEqual(["expectedRevision", "release", "retainResources"]);
      expect(Object.isFrozen(prepared)).toBe(true);
      try {
        expect(app.workspaceDocuments.transactDocument<Model>(document.id, () => after, { expectedRevision: prepared.expectedRevision, actionName: "Asset edit", ...(retention === "explicit" ? { retainResources: prepared.retainResources } : {}) }).status).toBe("committed");
        if (retention === "explicit") expect(() => prepared.retainResources(before, after)).toThrow();
      } finally { await prepared.release(); }
    }
    await change([reference]);
    await change([]);
    await runtime.documentAssets!.flush();
    expect(await store.collectGarbage(scope)).toMatchObject({ removedAssets: 0 });
    const history = app.workspaceDocuments.getUndoManager(document.id);
    await expect(history.undo()).resolves.toMatchObject({ status: "completed" });
    expect(app.workspaceDocuments.getDocument<Model>(document.id)!.model.assets).toEqual([reference]);
    const reacquired = await app.documentResources.acquireAsset(document.id, reference);
    expect(app.documentResources.resolve(document.id, reacquired)).toEqual(bytes);
    app.documentResources.release(document.id, reacquired);
    await history.redo();
    // Trusted host fixture exercises actual history eviction; no app clear/store capability is added.
    canonical.undoManager.clear();
    await canonical.flushRecovery();
    await runtime.documentAssets!.flush();
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: bytes.byteLength });
    const roots = release.mock.calls.map(([root, , token]) => JSON.stringify([root, token]));
    expect(new Set(roots).size).toBe(roots.length);
  });

  it("rejects foreign and observer model admission before accessing backing", async () => {
    const { app, foreign, runtime, store, document } = await fixture();
    const retain = vi.spyOn(store, "retain");
    expect(() => foreign.documentResources.prepareEdit(document.id, document.model, document.model)).toThrow(/owner lease|application/i);
    const responderId = "application:prepared-owner:observer";
    runtime.responders.register({ id: responderId, kind: "view", parentId: "application:com.example.prepared-owner", scopeId: responderId });
    const observer = mountTestSynWareRuntime(runtime, "com.example.prepared-owner", responderId);
    cleanups.push(() => observer.dispose("test"));
    const client = createSynWareContextValue(observer.runtime).documents;
    client.workspaceDocuments.getDocument(document.id);
    expect(() => client.documentResources.prepareEdit(document.id, document.model, document.model)).toThrow(/owner lease/i);
    expect(retain).not.toHaveBeenCalled();
    expect(app.workspaceDocuments.getDocument(document.id)).not.toBeNull();
  });

  it("reports unconfigured model backing as unsupported", async () => {
    const { app, document } = await fixture(false);
    await expect(app.documentResources.prepareEdit(document.id, document.model, document.model)).rejects.toMatchObject({ code: "asset-unsupported" });
  });

  it.each(["stale", "unmount", "caller-abort"] as const)("rejects %s after asynchronous hash verification and drops unused roots", async (ending) => {
    const { app, runtime, store, scope, document, persist, blockHash } = await fixture();
    const reference = await persist();
    const gate = blockHash();
    const caller = new AbortController();
    const pending = app.documentResources.prepareEdit<Model>(document.id, document.model, { ...document.model, assets: [reference] }, { signal: caller.signal });
    await gate.started;
    if (ending === "stale") app.workspaceDocuments.updateDocument<Model>(document.id, (model) => ({ ...model, title: "New revision" }), { actionName: "Concurrent edit" });
    if (ending === "unmount") app.mounted.dispose("asset preparation revoked");
    if (ending === "caller-abort") caller.abort("asset preparation canceled");
    gate.finish();
    await expect(pending).rejects.toBeDefined();
    await runtime.documentAssets!.flush();
    expect((await store.listRetentionRoots(scope)).filter((value) => value.references.length)).toEqual([]);
    expect(await store.collectGarbage(scope)).toMatchObject({ removedAssets: 1 });
  });

  it("captures full candidate identity and rejects a different native model with the same assets", async () => {
    const { app, runtime, store, scope, document, persist } = await fixture();
    const reference = await persist();
    const candidate = { ...document.model, assets: [reference] };
    const pending = app.documentResources.prepareEdit<Model>(document.id, document.model, candidate);
    candidate.title = "Mutated after capture";
    const prepared = await pending;
    const result = app.workspaceDocuments.transactDocument<Model>(document.id, () => candidate, { expectedRevision: prepared.expectedRevision, actionName: "Different native candidate", retainResources: prepared.retainResources });
    expect(result.status).toBe("rejected");
    expect(app.workspaceDocuments.getDocument<Model>(document.id)!.model).toEqual(document.model);
    await prepared.release();
    await runtime.documentAssets!.flush();
    expect(await store.collectGarbage(scope)).toMatchObject({ removedAssets: 1 });
  });

  it("releases an unused returned preparation once and rejects later callback use", async () => {
    const { app, runtime, document, persist, store, scope } = await fixture();
    const reference = await persist();
    const release = vi.spyOn(store, "release");
    const next = { ...document.model, assets: [reference] };
    const prepared = await app.documentResources.prepareEdit<Model>(document.id, document.model, next);
    await Promise.all([prepared.release(), prepared.release()]);
    expect(() => prepared.retainResources(document.model, next)).toThrow();
    await runtime.documentAssets!.flush();
    expect(release).toHaveBeenCalled();
    const rootKeys = release.mock.calls.map(([root]) => JSON.stringify(root));
    expect(new Set(rootKeys).size).toBe(rootKeys.length);
    expect(await store.collectGarbage(scope)).toMatchObject({ removedAssets: 1 });
  });

  it("revokes an unused returned preparation with its issuing mount and frees the roots", async () => {
    const { app, runtime, document, persist, store, scope } = await fixture();
    const reference = await persist();
    const next = { ...document.model, assets: [reference] };
    const prepared = await app.documentResources.prepareEdit<Model>(document.id, document.model, next);
    expect((await store.listRetentionRoots(scope)).some((root) => root.references.length > 0)).toBe(true);
    app.mounted.dispose("returned asset capability revoked");
    expect(() => prepared.retainResources(document.model, next)).toThrow();
    await prepared.release();
    await runtime.documentAssets!.flush();
    expect(await store.collectGarbage(scope)).toMatchObject({ removedAssets: 1 });
  });

  it("never rebinds a returned preparation to a replacement document with the same id and revision", async () => {
    const { app, runtime, document, canonical, persist, store, scope } = await fixture();
    const reference = await persist();
    const next = { ...document.model, assets: [reference] };
    const prepared = await app.documentResources.prepareEdit<Model>(document.id, document.model, next);
    await expect(app.workspaceDocuments.closeDocument(document.id)).resolves.toMatchObject({ outcome: "closed" });
    const replacement = await app.workspaceDocuments.newDocument<Model>({ documentId: document.id, typeId: type.id });
    expect(replacement.dirtyRevision).toBe(prepared.expectedRevision);
    expect(runtime.documents.getDocument(document.id)).not.toBe(canonical);
    expect(() => prepared.retainResources(replacement.model, next)).toThrow(/owner lease/i);
    expect(app.workspaceDocuments.getDocument<Model>(document.id)!.model.assets).toEqual([]);
    await prepared.release();
    await runtime.documentAssets!.flush();
    expect(await store.collectGarbage(scope)).toMatchObject({ removedAssets: 1 });
  });
});
