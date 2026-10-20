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

import { afterEach, describe, expect, it } from "vitest";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import { createDocumentAssetSaveCoordinator } from "../../src/SynCloudOS/Documents/DocumentAssetSaveCoordinator";
import type { ApplicationDocument } from "../../src/SynCloudOS/Documents/ApplicationDocument";
import { reconcileDocumentAssetVersions, releaseEvictedDocumentAssetVersions } from "../../src/SynCloudOS/Documents/DocumentAssetVersionRetention";
import type { DocumentAssetReference } from "../../src/SynCloudOS/Documents/documentAssetTypes";
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

// Retained integrated asset regressions from independent review.
// Assertions describe the desired contract; failures are retained as evidence.
interface Model { title: string; assets: readonly DocumentAssetReference[] }
const type: DocumentType<Model> = {
  id: "review.asset-integrated", displayName: "Integrated review", schemaVersion: 1, extensions: [], mimeTypes: [], autosave: "disabled",
  capabilities: { versions: true, conflicts: true }, create: () => ({ title: "New", assets: [] }), read: value => value, write: value => ({ ...value }),
  validate: (value): value is Model => !!value && typeof value === "object" && typeof (value as Model).title === "string" && Array.isArray((value as Model).assets),
};
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const scope = { authorizationId: "com.example.review-owner", documentId: "review-document" };
const location = { kind: "memory" as const, namespace: "review-integrated", key: "a" };
const observe = (name: string, facts: unknown) => console.info("REVIEW-PROBE", name, JSON.stringify(facts));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(finish => { resolve = finish; });
  return { promise, resolve };
}

async function fixture() {
  let pause: (() => Promise<void>) | undefined;
  const hash = async (bytes: Uint8Array) => {
    const result = "sha256:" + Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), byte => byte.toString(16).padStart(2, "0")).join("");
    await pause?.();
    return result;
  };
  const store = createInMemoryDocumentAssetStore({ hash });
  cleanups.push(() => store.dispose());
  const runtime = createTestRuntime({ environment: createTestRuntimeEnvironment(), applicationDocuments: {
    initialTypes: [type], assetBacking: { store, scopeForDocument: id => ({ ...scope, documentId: id }),
      manifest: { scopeForLocation: () => scope, enumerateReferences: content => (content as Model).assets } },
  } });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("review"); });
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: scope.authorizationId, version: "1.0.0", displayName: "Review", routes: [{ path: "/review", primary: true }], documentTypes: [{ id: type.id, displayName: type.displayName }] });
  const mounted = mountTestSynWareRuntime(runtime, scope.authorizationId);
  cleanups.push(() => mounted.dispose("review"));
  const app = createSynWareContextValue(mounted.runtime).documents;
  const document = await app.workspaceDocuments.newDocument<Model>({ documentId: scope.documentId, typeId: type.id });
  const canonical = runtime.documents.getDocument(document.id)! as ApplicationDocument<Model, unknown>;
  const put = (byte = 1) => store.put(scope, { bytes: new Uint8Array([byte]), mimeType: "image/png" });
  const block = () => {
    const entered = deferred(), gate = deferred();
    pause = () => { entered.resolve(); return gate.promise; };
    return { entered: entered.promise, finish() { pause = undefined; gate.resolve(); } };
  };
  return { store, runtime, mounted, app, document, canonical, put, block };
}

describe("integrated asset ownership regressions", () => {
  it("keeps a second independent preparation alive when the first shared candidate caller aborts", async () => {
    const f = await fixture(), ref = await f.put();
    const after = { ...f.document.model, assets: [ref] }, firstSignal = new AbortController(), gate = f.block();
    const first = f.app.documentResources.prepareEdit<Model>(f.document.id, f.document.model, after, { signal: firstSignal.signal });
    const firstOutcome = first.then(value => ({ value }), error => ({ error }));
    await gate.entered;
    const second = f.app.documentResources.prepareEdit<Model>(f.document.id, f.document.model, after);
    const secondOutcome = second.then(value => ({ value }), error => ({ error }));
    // Both SDK requests reach the binding before the first request is canceled.
    for (let i = 0; i < 15; i++) await Promise.resolve();
    firstSignal.abort("only the first caller is canceled"); gate.finish();
    const [a, b] = await Promise.all([firstOutcome, secondOutcome]);
    if ("value" in a) await a.value.release();
    if ("value" in b) await b.value.release();
    await f.runtime.documentAssets!.flush();
    observe("independent-cancel", { first: "error" in a ? a.error.code : "prepared", second: "error" in b ? b.error.code : "prepared", revision: f.canonical.dirtyRevision, roots: (await f.store.listRetentionRoots(scope)).length });
    expect(a).toHaveProperty("error");
    expect(b).toHaveProperty("value");
  });

  it.each(["automatic", "explicit"] as const)("enforces the full captured candidate identity with %s resource admission", async admission => {
    const f = await fixture(), ref = await f.put();
    const intended = { ...f.document.model, title: "Captured", assets: [ref] };
    const prepared = await f.app.documentResources.prepareEdit<Model>(f.document.id, f.document.model, intended);
    const different = { ...intended, title: "Different native candidate" };
    const result = f.app.workspaceDocuments.transactDocument<Model>(f.document.id, () => different, {
      expectedRevision: prepared.expectedRevision, actionName: "Changed candidate",
      ...(admission === "explicit" ? { retainResources: prepared.retainResources } : {}),
    });
    await prepared.release(); await f.runtime.documentAssets!.flush();
    observe("candidate-" + admission, { status: result.status, title: f.canonical.model.title, revision: f.canonical.dirtyRevision });
    expect(result.status).toBe("rejected");
    expect(f.canonical.model.title).toBe("New");
  });

  it("restores the old current owner and collects only the new candidate after synchronous retention refusal", async () => {
    const f = await fixture(), oldRef = await f.put(1), nextRef = await f.put(2);
    const insert = { ...f.document.model, assets: [oldRef] };
    const p = await f.app.documentResources.prepareEdit<Model>(f.document.id, f.document.model, insert);
    expect(f.app.workspaceDocuments.transactDocument<Model>(f.document.id, () => insert, { expectedRevision: p.expectedRevision, actionName: "Initial image" }).status).toBe("committed");
    await p.release(); f.canonical.undoManager.clear(); await f.runtime.documentAssets!.flush();
    const revision = f.canonical.dirtyRevision, before = f.canonical.model, after = { ...before, assets: [nextRef] };
    const replacement = await f.app.documentResources.prepareEdit<Model>(f.document.id, before, after);
    const result = f.app.workspaceDocuments.transactDocument<Model>(f.document.id, () => after, { expectedRevision: replacement.expectedRevision, actionName: "Refused replacement", retainResources() { throw new Error("independent fault after automatic resource admission"); } });
    await replacement.release(); await f.runtime.documentAssets!.flush();
    const gc = await f.store.collectGarbage(scope);
    observe("reversible-refusal", { status: result.status, revision: f.canonical.dirtyRevision, gc });
    expect(result.status).toBe("rejected"); expect(f.canonical.dirtyRevision).toBe(revision);
    expect(f.canonical.model).toEqual(before); expect(f.canonical.undoManager.canUndo).toBe(false);
    expect(await f.store.read(scope, oldRef)).toEqual(new Uint8Array([1]));
    expect(gc).toEqual({ removedAssets: 1, removedBytes: 1 });
    await expect(f.store.read(scope, nextRef)).rejects.toMatchObject({ code: "asset-missing" });
  });

  it("refuses an unprepared canonical reference and a mount revoked inside model validation", async () => {
    const f = await fixture(), ref = await f.put();
    const revision = f.canonical.dirtyRevision;
    const next = { ...f.document.model, assets: [ref] };
    const direct = f.app.workspaceDocuments.transactDocument<Model>(f.document.id, () => next, { expectedRevision: f.document.dirtyRevision, actionName: "Unprepared" });
    expect(direct.status).toBe("rejected"); expect(f.canonical.dirtyRevision).toBe(revision);
    const prepared = await f.app.documentResources.prepareEdit<Model>(f.document.id, f.document.model, next);
    const revoked = f.app.workspaceDocuments.transactDocument<Model>(f.document.id, () => next, { expectedRevision: prepared.expectedRevision, actionName: "Revoke before admission", validateModel() { f.mounted.dispose("inside validation"); }, retainResources: prepared.retainResources });
    await prepared.release(); await f.runtime.documentAssets!.flush();
    expect(revoked.status).toBe("rejected"); expect(f.canonical.dirtyRevision).toBe(revision); expect(f.canonical.model.assets).toEqual([]);
    expect(await f.store.collectGarbage(scope)).toEqual({ removedAssets: 1, removedBytes: 1 });
    observe("prepublication-revocation", { unprepared: direct.status, revoked: revoked.status, revision: f.canonical.dirtyRevision });
  });

  it.each(["reconcile", "explicit"] as const)("fences %s eviction against a newer retention generation at the same native version root", async mode => {
    const store = createInMemoryDocumentAssetStore(); cleanups.push(() => store.dispose());
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    const coordinator = createDocumentAssetSaveCoordinator({ adapter: base, store, scopeForLocation: () => scope, enumerateReferences: content => (content as Model).assets });
    const initial = await base.write({ location, typeId: type.id, schemaVersion: 1, content: { title: "Before", assets: [] }, expectedVersion: null, idempotencyKey: "eviction-before" });
    const transaction = await base.beginCloseTransaction(location);
    const first = await coordinator.save({ location, typeId: type.id, schemaVersion: 1, content: { title: "Provisional", assets: [ref] }, expectedVersion: initial.version, idempotencyKey: "eviction-provisional", closeTransactionToken: transaction.token }, { revision: 1, contentIdentity: "provisional" });
    await transaction.seal(); await transaction.rollback();
    expect(await base.readVersion(location, first.record.version)).toBeNull();
    const root = first.retentionRoot!;
    const oldToken = await store.retain(root, [ref]); let newToken = "", releaseToken: string | undefined;
    const racingStore = { ...store, async release(actualRoot: typeof root, signal?: AbortSignal, token?: string) {
      if (actualRoot.id === root.id) {
        // Real provider synchronization re-admits the immutable record after
        // eviction's point-in-time queries. A fresh owner re-pins its bytes.
        await base.adoptSynchronisedRecord(first.record, initial.version);
        newToken = await store.retain(root, [ref]); releaseToken = token;
      }
      return store.release(actualRoot, signal, token);
    } };
    const options = { adapter: base, store: racingStore, scopeForLocation: () => scope };
    const count = mode === "reconcile" ? await reconcileDocumentAssetVersions(options, location) :
      await releaseEvictedDocumentAssetVersions(options, location, [first.record.version]);
    const gc = await store.collectGarbage(scope);
    observe("eviction-generation", { count, suppliedToken: releaseToken ?? null, generationChanged: oldToken !== newToken, nativeVersionPresent: !!await base.readVersion(location, first.record.version), currentVersionPresent: (await base.read(location))?.version.id === first.record.version.id, gc });
    expect(count).toBe(0); expect(gc.removedAssets).toBe(0);
    expect(await store.read(scope, ref)).toEqual(new Uint8Array([1]));
  });

  it("converges a recovered unknown sent write to its one acknowledged native version root", async () => {
    const store = createInMemoryDocumentAssetStore(); cleanups.push(() => store.dispose());
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    let loseReceipt = true;
    const adapter = new Proxy(base, { get(target, key) {
      if (key === "write") return async (...args: Parameters<typeof base.write>) => {
        const record = await base.write(...args);
        if (loseReceipt) { loseReceipt = false; throw new Error("native write committed, transport lost its acknowledgement"); }
        return record;
      };
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    const coordinator = createDocumentAssetSaveCoordinator({ adapter, store, scopeForLocation: () => scope, enumerateReferences: content => (content as Model).assets });
    const request = { location, typeId: type.id, schemaVersion: 1, content: { title: "Saved", assets: [ref] }, expectedVersion: null, idempotencyKey: "lost-and-recovered" };
    await expect(coordinator.save(request, { revision: 1, contentIdentity: "saved" })).rejects.toThrow("transport lost");
    const actual = await base.read(location); expect(actual).not.toBeNull();
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    const recovered = await coordinator.save(request, { revision: 1, contentIdentity: "saved" });
    expect(recovered.record.version).toEqual(actual!.version);
    const roots = await store.listRetentionRoots(scope);
    observe("unknown-write-recovery", { sameVersion: recovered.record.version.id === actual!.version.id, roots: roots.map(value => value.root.id) });
    expect(roots).toHaveLength(1); expect(roots[0].root).toEqual(recovered.retentionRoot);
  });

  it("does not exhaust root quota on repeated acknowledgement of one formerly unknown write", async () => {
    const store = createInMemoryDocumentAssetStore({ maximumRetentionRoots: 2 }); cleanups.push(() => store.dispose());
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() });
    let first = true;
    const adapter = new Proxy(base, { get(target, key) {
      if (key === "write") return async (...args: Parameters<typeof base.write>) => {
        const record = await base.write(...args);
        if (first) { first = false; throw new Error("lost acknowledgement"); }
        return record;
      };
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    const coordinator = createDocumentAssetSaveCoordinator({ adapter, store, scopeForLocation: () => scope, enumerateReferences: content => (content as Model).assets });
    const request = { location, typeId: type.id, schemaVersion: 1, content: { title: "One immutable native version", assets: [ref] }, expectedVersion: null, idempotencyKey: "quota-recovery" };
    await expect(coordinator.save(request, { revision: 1, contentIdentity: "one" })).rejects.toThrow("lost acknowledgement");
    const acknowledged = await coordinator.save(request, { revision: 1, contentIdentity: "one" });
    const retry = await coordinator.save(request, { revision: 1, contentIdentity: "one" }).then(value => ({ value }), error => ({ error }));
    const native = await base.read(location);
    observe("unknown-write-quota", { acknowledgedVersion: acknowledged.record.version.id, sameVersion: acknowledged.record.version.id === native!.version.id,
      retry: "error" in retry ? retry.error.code : "acknowledged", roots: (await store.listRetentionRoots(scope)).map(value => value.root.id) });
    expect(retry).toHaveProperty("value");
  });

  it("returns the actual committed receipt after cancellation and rejected postcommit pin promotion", async () => {
    const store = createInMemoryDocumentAssetStore(); cleanups.push(() => store.dispose());
    const ref = await store.put(scope, { bytes: new Uint8Array([1]), mimeType: "image/png" });
    const base = new InMemoryDocumentAdapter({ now: () => 1000, randomUUID: () => crypto.randomUUID() }), signal = new AbortController();
    const adapter = new Proxy(base, { get(target, key) {
      if (key === "write") return async (...args: Parameters<typeof base.write>) => { const record = await base.write(...args); signal.abort("after native commitment"); return record; };
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    // A supplied store without atomic promotion exercises the original fallback
    // and keeps this fault at the actual postcommit destination-pin operation.
    const faultStore = { ...store, promoteRetentionRoot: undefined, async retain(...args: Parameters<typeof store.retain>) {
      if (args[0].id.startsWith("native-version:")) throw new Error("postcommit retention failure");
      return store.retain(...args);
    } };
    const coordinator = createDocumentAssetSaveCoordinator({ adapter, store: faultStore, scopeForLocation: () => scope, enumerateReferences: content => (content as Model).assets });
    const receipt = await coordinator.save({ location, typeId: type.id, schemaVersion: 1, content: { title: "Committed", assets: [ref] }, expectedVersion: null, idempotencyKey: "postcommit-fault", signal: signal.signal }, { revision: 3, contentIdentity: "captured" });
    expect(signal.signal.aborted).toBe(true); expect(receipt.record).toEqual(await base.read(location));
    expect(receipt.revision).toBe(3); expect(receipt.durability).toBe("memory");
    expect(receipt.retentionRoot!.id).toMatch(/^save:/);
    expect((await store.listRetentionRoots(scope)).map(value => value.root)).toContainEqual(receipt.retentionRoot);
    expect(await store.collectGarbage(scope)).toEqual({ removedAssets: 0, removedBytes: 0 });
    observe("committed-receipt-truth", { nativePresent: true, abortedAfterCommit: true, pin: receipt.retentionRoot!.kind, durability: receipt.durability });
  });
});
