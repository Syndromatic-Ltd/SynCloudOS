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
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import { InMemoryDocumentRecoveryStore } from "../../src/SynCloudOS/Documents/DocumentRecoveryStore";
import type { DocumentAssetReference } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";
const scope = { authorizationId: "app:a", documentId: "doc:a" };
const signal = () => new AbortController().signal;
const input = { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" };
interface Model { title: string; assets: DocumentAssetReference[] }
const type: DocumentType<Model> = { id: "app.asset-document", displayName: "Asset document", schemaVersion: 1, extensions: ["assets"], mimeTypes: ["application/x-asset-test"],
  capabilities: { versions: true, conflicts: true }, autosave: "disabled", create: () => ({ title: "New", assets: [] }), read: v => v, write: v => ({ ...v }),
  validate: (v): v is Model => !!v && typeof v === "object" && Array.isArray((v as Model).assets) && typeof (v as Model).title === "string" };
const manifest = { scopeForLocation: () => scope, enumerateReferences: (content: unknown) => (content as Model).assets, nativeDurability: "memory" as const };
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) { runtime.documents.registerCloseReviewer({ review: async () => "discard" }); await runtime.dispose("assets test cleanup"); } });
function fixture(store = createInMemoryDocumentAssetStore(), factory = false, initialNative = true) {
  const environment = createTestRuntimeEnvironment();
  const base = new InMemoryDocumentAdapter(environment);
  const recovery = new InMemoryDocumentRecoveryStore();
  const dispose = vi.fn(store.dispose);
  const observed = Object.freeze({ ...store, dispose });
  const createStore = vi.fn(() => observed);
  const runtime = createTestRuntime({ environment, applicationDocuments: { initialAdapters: initialNative ? [base] : [], initialTypes: [type as DocumentType<unknown>], recoveryStore: recovery,
    assetBacking: { ...(factory ? { createStore } : { store: observed }), scopeForDocument: () => scope, manifest } } });
  runtimes.push(runtime);
  return { runtime, store, dispose, createStore, base, recovery };
}
describe("runtime document asset integration", () => {
  it("wraps a dynamically registered native adapter and verifies assets before admitting its document", async () => {
    const f = fixture(createInMemoryDocumentAssetStore(), false, false);
    const base = new InMemoryDocumentAdapter(f.runtime.environment);
    const dynamic = new Proxy(base, { get(target, property) { if (property === "id") return "dynamic-assets";
      const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; } });
    f.runtime.documents.registerAdapter(dynamic);
    const ref = await f.store.put(scope, input);
    const location = { kind: "memory" as const, namespace: "dynamic-assets", key: "a" };
    await base.write({ location, typeId: type.id, schemaVersion: 1, content: { title: "Incomplete", assets: [ref] }, expectedVersion: null, idempotencyKey: "unwrapped" });
    await expect(f.runtime.documents.openDocument({ documentId: "dynamic-incomplete", typeId: type.id, location })).rejects.toMatchObject({ code: "asset-missing" });
    expect(f.runtime.documents.getDocument("dynamic-incomplete")).toBeNull();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    const prepared = await f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, { ...doc.model, assets: [ref] });
    expect(doc.transact(m => ({ ...m, assets: [ref] }), { expectedRevision: prepared.expectedRevision, actionName: "Insert" })).toMatchObject({ status: "committed" });
    await prepared.release();
    const destination = { ...location, key: "verified" };
    await f.runtime.documents.saveAsDocument({ documentId: doc.id, destination });
    expect((await base.read(destination))?.metadata).toHaveProperty("syncloudos.document.assets.v1");
    expect((await f.store.listRetentionRoots(scope)).some(value => value.root.kind === "version")).toBe(true);
  });
  it("rejects an unprepared asset-bearing canonical edit before content or history publication", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    await f.runtime.documentAssets!.whenReady(doc.id);
    const ref = await f.store.put(scope, input);
    const revision = doc.dirtyRevision;
    const result = doc.transact(m => ({ ...m, assets: [ref] }), { expectedRevision: revision, actionName: "Unprepared insert" });
    expect(result).toMatchObject({ status: "rejected" });
    expect(doc.dirtyRevision).toBe(revision);
    expect(doc.model.assets).toEqual([]);
    expect(doc.undoManager.canUndo).toBe(false);
  });
  it("automatically retains canonical history after async preflight without caller retention", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    await f.runtime.documentAssets!.whenReady(doc.id);
    const ref = await f.store.put(scope, input);
    async function change(assets: DocumentAssetReference[]) {
      const next = { ...doc.model, assets };
      const prepared = await f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, next);
      try { expect(doc.transact(() => next, { expectedRevision: prepared.expectedRevision, actionName: "Image" })).toMatchObject({ status: "committed" }); }
      finally { await prepared.release(); }
    }
    await change([ref]); await change([]);
    await f.runtime.documentAssets!.flush();
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    await doc.undoManager.undo();
    expect(doc.model.assets).toEqual([ref]);
    doc.undoManager.clear(); await f.runtime.documentAssets!.flush();
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });
  it("switches committed ownership before non-history adoption clears previous roots", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    await f.runtime.documentAssets!.whenReady(doc.id);
    const ref = await f.store.put(scope, input);
    const next = { ...doc.model, assets: [ref] };
    const prepared = await f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, next);
    try { doc.update(() => next, { actionName: "Adopt image", recordUndo: false }); }
    finally { await prepared.release(); }
    expect(doc.model.assets).toEqual([ref]);
    expect(doc.undoManager.canUndo).toBe(false);
    await f.runtime.documentAssets!.flush();
    expect((await f.store.listRetentionRoots(scope)).filter(entry => entry.root.kind === "committed")).toHaveLength(1);
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
  });
  it("fences a newer canonical edit that occurs while resource preflight is hashing", async () => {
    const digest = "sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
    let stall = false, finish: ((value: string) => void) | undefined;
    const store = createInMemoryDocumentAssetStore({ hash: () => {
      if (stall) { stall = false; return new Promise<string>(resolve => { finish = resolve; }); }
      return Promise.resolve(digest);
    } });
    const f = fixture(store);
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    await f.runtime.documentAssets!.whenReady(doc.id);
    const ref = await store.put(scope, input);
    stall = true;
    const pending = f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, { ...doc.model, assets: [ref] });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    doc.update(m => ({ ...m, title: "New canonical revision" }), { actionName: "Title" });
    finish!(digest);
    await expect(pending).rejects.toMatchObject({ code: "asset-conflict" });
    await f.runtime.documentAssets!.flush();
    expect(doc.model.assets).toEqual([]);
    expect((await store.listRetentionRoots(scope)).filter(entry => ["committed", "history"].includes(entry.root.kind))).toEqual([]);
  });
  it("forwards configured capabilities through the admitted SDK without exposing the store", async () => {
    const f = fixture();
    registerTestSynWare(f.runtime, { schemaVersion: 1, id: "asset-app", title: "Asset app", version: "1.0.0", routes: [{ path: "/assets", primary: true }], documentTypes: [{ id: type.id, displayName: type.displayName }] });
    const mounted = mountTestSynWareRuntime(f.runtime, "asset-app");
    try {
      const context = createSynWareContextValue(mounted.runtime);
      const document = await context.documents.workspaceDocuments.newDocument({ typeId: type.id });
      const resources = context.documents.documentResources;
      expect(resources.assetCapabilities).toMatchObject({ durability: "memory" });
      expect(resources).not.toHaveProperty("store");
      expect(resources).not.toHaveProperty("resourceBacking");
      const live = await resources.acquire(document.id, new Blob([input.bytes], { type: "image/png" }));
      const reference = await resources.persist(document.id, live);
      expect(reference.scope).toEqual(scope);
      const next = await resources.acquireAsset(document.id, reference);
      expect(resources.resolve(document.id, next)).toEqual(input.bytes);
      f.runtime.documents.registerCloseReviewer({ review: async () => "discard" });
      expect(await context.documents.workspaceDocuments.closeDocument(document.id)).toMatchObject({ outcome: "closed" });
      expect(f.runtime.documentResources.isActive(document.id, next)).toBe(false);
    } finally { mounted.dispose("runtime SDK asset test"); }
  });
  it("releases unused and stale prepared reservations without changing canonical content", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    await f.runtime.documentAssets!.whenReady(doc.id);
    const ref = await f.store.put(scope, input);
    const first = await f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, { ...doc.model, assets: [ref] });
    await first.release();
    await f.runtime.documentAssets!.flush();
    expect(await f.store.listRetentionRoots(scope)).toEqual([]);
    const stale = await f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, { ...doc.model, assets: [ref] });
    doc.update(m => ({ ...m, title: "New revision" }), { actionName: "Title" });
    expect(doc.transact(m => ({ ...m, assets: [ref] }), { expectedRevision: stale.expectedRevision, actionName: "Stale insert", retainResources: stale.retainResources })).toMatchObject({ status: "rejected", reason: "stale" });
    await stale.release();
    expect(doc.model.assets).toEqual([]);
    await f.runtime.documentAssets!.flush();
    expect((await f.store.listRetentionRoots(scope)).filter(entry => ["committed", "history"].includes(entry.root.kind))).toEqual([]);
  });
  it("retains output snapshots independently and abort-cleans the output root", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    const ref = await f.store.put(scope, input);
    const abort = new AbortController();
    const output = await f.runtime.documentAssets!.retain(doc.id, "output", [ref], abort.signal);
    expect(output.root.kind).toBe("output");
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    abort.abort(); await f.runtime.documentAssets!.flush();
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 3 });
    expect(await output.release()).toBe(false);
  });
  it("injects capability values and respects host/factory store ownership", async () => {
    const host = fixture();
    expect(host.runtime.documentResources.assetCapabilities).toEqual(host.store.capabilities);
    expect(host.runtime.documentAssets).toBeDefined();
    await host.runtime.dispose("host store stays owned by host");
    expect(host.dispose).not.toHaveBeenCalled();
    await expect(host.store.put(scope, input)).resolves.toMatchObject({ scope });
    const owned = fixture(createInMemoryDocumentAssetStore(), true);
    expect(owned.createStore).toHaveBeenCalledOnce();
    await owned.runtime.dispose("owned store cleanup");
    expect(owned.dispose).toHaveBeenCalledOnce();
  });
  it("preserves factory backing on canceled runtime disposal", async () => {
    const f = fixture(createInMemoryDocumentAssetStore(), true);
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    doc.update(m => ({ ...m, title: "Dirty" }), { actionName: "Title" });
    f.runtime.documents.registerCloseReviewer({ review: async () => "cancel" });
    expect(await f.runtime.dispose("cancel" )).toMatchObject({ status: "cancelled" });
    expect(f.dispose).not.toHaveBeenCalled();
    expect(f.runtime.documentResources.assetCapabilities).toBeDefined();
  });
  it("wraps configured native adapters and recovery without altering private content", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    const ref = await f.store.put(scope, input);
    expect(f.runtime.documentAssets).toBeDefined();
    await f.runtime.documentAssets!.whenReady(doc.id);
    const next = { ...doc.model, assets: [ref] };
    const prepared = await f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, next);
    expect(doc.transact(() => next, { expectedRevision: prepared.expectedRevision, actionName: "Insert", retainResources: prepared.retainResources })).toMatchObject({ status: "committed" });
    await prepared.release();
    await doc.flushRecovery();
    const recovery = await f.recovery.read(doc.recoveryRecord!.recoveryId);
    expect(recovery?.serializedContent).toEqual(next);
    expect(recovery).toHaveProperty("assetManifest.assets", [ref]);
    await f.runtime.documents.saveAsDocument({ documentId: doc.id, destination: { kind: "memory", namespace: "runtime-assets", key: "a" } });
    const record = await f.base.read<{ assets: DocumentAssetReference[] }>({ kind: "memory", namespace: "runtime-assets", key: "a" });
    expect(record?.content.assets).toEqual([ref]);
    expect(record?.metadata).toHaveProperty("syncloudos.document.assets.v1");
  });
  it("holds current and history assets independently across undo, redo and history eviction", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    const ref = await f.store.put(scope, input);
    expect(f.runtime.documentAssets).toBeDefined();
    await f.runtime.documentAssets!.whenReady(doc.id);
    async function change(assets: DocumentAssetReference[]) {
      const next = { ...doc.model, assets };
      const prepared = await f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, next);
      const result = doc.transact(() => next, { expectedRevision: prepared.expectedRevision, actionName: "Image", retainResources: prepared.retainResources });
      await prepared.release(); expect(result).toMatchObject({ status: "committed" });
    }
    await change([ref]); await change([]);
    await doc.undoManager.undo();
    doc.undoManager.clear();
    await f.runtime.documentAssets!.flush();
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    expect(doc.model.assets).toEqual([ref]);
    // This removes current content; history is then explicitly evicted.
    await change([]); doc.undoManager.clear();
    await f.runtime.documentAssets!.flush();
    // Recovery can independently retain committed snapshots; remove it before collection.
    await doc.flushRecovery();
    await f.recovery.remove(doc.recoveryRecord!.recoveryId, doc.recoveryRecord!.recoveryVersion);
    // Direct host removal bypasses wrapper; the corresponding root is explicitly evicted here.
    for (const entry of await f.store.listRetentionRoots(scope)) if (entry.root.kind === "recovery") await f.store.release(entry.root);
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 3 });
  });
  it("rejects canceled/stale preflight and releases document leases on close", async () => {
    const f = fixture();
    const doc = await f.runtime.documents.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
    const live = await f.runtime.documentResources.acquire(doc.id, { size: 3, type: "image/png", arrayBuffer: async () => input.bytes.slice().buffer }, signal());
    expect(f.runtime.documentResources.assetCapabilities).toBeDefined();
    const ref = await f.runtime.documentResources.persist(doc.id, live, signal());
    const abort = new AbortController(); abort.abort();
    await expect(f.runtime.documentAssets!.prepareEdit(doc.id, doc.model, { ...doc.model, assets: [ref] }, abort.signal)).rejects.toMatchObject({ code: "asset-aborted" });
    f.runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    await f.runtime.documents.closeDocument(doc.id);
    expect(f.runtime.documentResources.isActive(doc.id, live)).toBe(false);
    expect(f.runtime.documentResources.resolve(doc.id, live)).toBeNull();
    await f.runtime.documentAssets!.flush();
    expect(await f.store.listRetentionRoots(scope)).toEqual([]);
  });
});
