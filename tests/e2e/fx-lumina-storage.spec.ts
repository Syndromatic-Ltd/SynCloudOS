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

import { expect, test } from "playwright/test";

test("Lumina IndexedDB mutations are atomic, idempotent and generation-scoped across reopen and concurrent writers", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const backendModule = await import("/src/SynCloudOS/LuminaFX/IndexedDBLuminaBackend.ts");
    const databaseName = `lumina-storage-${Math.random().toString(16).slice(2)}`;
    const ownerKey = "com.syndromatic.fixture";
    const removeDatabase = () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Lumina database deletion blocked."));
    });
    await removeDatabase();
    const makeItem = (id: string, domain: string, revision: string) => new lumina.LUFXSearchableItem({
      id,
      domain,
      contentType: "note",
      title: `Title ${id}`,
      activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id } },
      revision,
    });

    const firstBackend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const secondBackend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const first = new lumina.LUFXIndex(firstBackend);
    const second = new lumina.LUFXIndex(secondBackend);
    const committed = await first.upsert(makeItem("one", "notes", "r1"), "mutation-one");
    const replayed = await second.upsert(makeItem("one", "notes", "r1"), "mutation-one");
    const concurrent = await Promise.all([
      first.upsert(makeItem("two", "notes", "r1"), "mutation-two"),
      second.upsert(makeItem("three", "archive", "r1"), "mutation-three"),
    ]);
    await second.deleteDomain("archive", "mutation-four");
    const beforeClose = await first.snapshot();
    first.dispose();
    second.dispose();

    const reopenedBackend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const reopened = new lumina.LUFXIndex(reopenedBackend);
    const afterReopen = await reopened.snapshot();
    let conflictingReplay = "none";
    try {
      await reopened.upsert(makeItem("one", "notes", "r2"), "mutation-one");
    } catch (error) {
      conflictingReplay = error instanceof DOMException ? error.name : "wrong-error";
    }
    reopened.dispose();
    await removeDatabase();
    return {
      committed,
      replayed,
      concurrent,
      beforeClose: { checkpoint: beforeClose.checkpoint, ids: beforeClose.items.map((entry) => entry.id) },
      afterReopen: { checkpoint: afterReopen.checkpoint, ids: afterReopen.items.map((entry) => entry.id) },
      conflictingReplay,
    };
  });

  expect(result.committed).toEqual({ mutationId: "mutation-one", checkpoint: { generation: 1, revision: 1 }, replayed: false });
  expect(result.replayed).toEqual({ mutationId: "mutation-one", checkpoint: { generation: 1, revision: 1 }, replayed: true });
  expect(result.concurrent.map((entry) => entry.checkpoint.revision).sort((a, b) => a - b)).toEqual([2, 3]);
  expect(result.beforeClose).toEqual({ checkpoint: { generation: 4, revision: 4 }, ids: ["one", "two"] });
  expect(result.afterReopen).toEqual(result.beforeClose);
  expect(result.conflictingReplay).toBe("InvalidStateError");
});

test("Lumina abort before commit preserves the prior generation", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const backendModule = await import("/src/SynCloudOS/LuminaFX/IndexedDBLuminaBackend.ts");
    const databaseName = `lumina-abort-${Math.random().toString(16).slice(2)}`;
    const backend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey: "fixture" });
    const index = new lumina.LUFXIndex(backend);
    const base = new lumina.LUFXSearchableItem({
      id: "one", domain: "notes", contentType: "note", title: "Base",
      activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id: "one" } }, revision: "r1",
    });
    await index.upsert(base, "base");
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled before commit", "AbortError"));
    let abortName = "none";
    try {
      await index.delete("one", "cancelled", { signal: controller.signal });
    } catch (error) {
      abortName = error instanceof DOMException ? error.name : "wrong-error";
    }
    const snapshot = await index.snapshot();
    index.dispose();
    return { abortName, checkpoint: snapshot.checkpoint, ids: snapshot.items.map((entry) => entry.id) };
  });
  expect(result).toEqual({ abortName: "AbortError", checkpoint: { generation: 1, revision: 1 }, ids: ["one"] });
});

test("Lumina browser backend executes durable mutations inside the emitted worker", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const browser = await import("/src/SynCloudOS/PlatformAdapters/WorkerLuminaIndexBackend.ts");
    const factory = browser.createBrowserLuminaIndexBackendFactory(`lumina-worker-${Math.random().toString(16).slice(2)}`);
    if (!factory) return { unavailable: true };
    const owner = new AbortController();
    const index = new lumina.LUFXIndex(factory.create("worker-owner", owner.signal));
    const item = new lumina.LUFXSearchableItem({
      id: "worker-item", domain: "notes", contentType: "note", title: "Worker Item",
      activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id: "worker-item" } }, revision: "r1",
    });
    const committed = await index.upsert(item, "worker-mutation");
    const snapshot = await index.snapshot();
    owner.abort(new DOMException("owner closed", "AbortError"));
    let afterAbort = "none";
    try { await index.snapshot(); } catch (error) { afterAbort = error instanceof DOMException ? error.name : "wrong-error"; }
    return { unavailable: false, committed, ids: snapshot.items.map((entry) => entry.id), afterAbort };
  });
  expect(result).toEqual({
    unavailable: false,
    committed: { mutationId: "worker-mutation", checkpoint: { generation: 1, revision: 1 }, replayed: false },
    ids: ["worker-item"],
    afterAbort: "AbortError",
  });
});

test("Lumina quota failure rolls back the item and preserves the previous generation", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const backendModule = await import("/src/SynCloudOS/LuminaFX/IndexedDBLuminaBackend.ts");
    const databaseName = `lumina-quota-${Math.random().toString(16).slice(2)}`;
    const ownerKey = "quota-owner";
    const backend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const index = new lumina.LUFXIndex(backend);
    const makeItem = (id: string) => new lumina.LUFXSearchableItem({
      id, domain: "notes", contentType: "note", title: id,
      activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id } }, revision: "r1",
    });
    await index.upsert(makeItem("base"), "base-mutation");

    const originalPut = IDBObjectStore.prototype.put;
    Object.defineProperty(IDBObjectStore.prototype, "put", {
      configurable: true,
      writable: true,
      value: function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        const candidate = value as { ownerKey?: string; generation?: number } | null;
        if (candidate?.ownerKey === ownerKey && candidate.generation === 2) {
          throw new DOMException("simulated quota exhaustion", "QuotaExceededError");
        }
        return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
      },
    });
    let errorName = "none";
    try {
      await index.upsert(makeItem("must-rollback"), "quota-mutation");
    } catch (error) {
      errorName = error instanceof DOMException ? error.name : "wrong-error";
    } finally {
      Object.defineProperty(IDBObjectStore.prototype, "put", { configurable: true, writable: true, value: originalPut });
    }
    const snapshot = await index.snapshot();
    index.dispose();
    return { errorName, checkpoint: snapshot.checkpoint, ids: snapshot.items.map((entry) => entry.id) };
  });

  expect(result).toEqual({ errorName: "QuotaExceededError", checkpoint: { generation: 1, revision: 1 }, ids: ["base"] });
});

test("Lumina maintenance atomically replaces generations, detects tokenizer drift, erases owners and rolls back quota failure", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const tokenizer = await import("/src/FX/LuminaFX/LUFXTokenizer.ts");
    const backendModule = await import("/src/SynCloudOS/LuminaFX/IndexedDBLuminaBackend.ts");
    const databaseName = `lumina-maintenance-${Math.random().toString(16).slice(2)}`;
    const ownerKey = "maintenance-owner";
    const makeItem = (id: string, revision = "r1") => new lumina.LUFXSearchableItem({
      id, domain: "notes", contentType: "note", title: `Title ${id}`,
      activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id } }, revision,
    });
    const serialized = (ids: readonly string[]) => ids.map((id) => makeItem(id).toJSON());
    const backend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const index = new lumina.LUFXIndex(backend);
    await index.upsert(makeItem("old"), "seed-old");

    const firstReplacement = await backend.replaceAll(
      serialized(["new-a", "new-b"]),
      { tokenizerVersion: tokenizer.LUFX_TOKENIZER_VERSION },
    );
    const afterReplacement = await index.snapshot();

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const materializedItemCount = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction("items", "readonly");
      const request = transaction.objectStore("items").index("owner").count(ownerKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("meta", "readwrite");
      const store = transaction.objectStore("meta");
      const get = store.get(ownerKey);
      get.onsuccess = () => {
        store.put({ ...get.result, tokenizerVersion: "stale-tokenizer-v0" });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    const tokenizerDrift = await backend.diagnostics();
    const driftSnapshot = await index.snapshot();
    const restored = await backend.replaceAll(
      serialized(["new-a", "new-b"]),
      { tokenizerVersion: tokenizer.LUFX_TOKENIZER_VERSION },
    );

    const originalPut = IDBObjectStore.prototype.put;
    Object.defineProperty(IDBObjectStore.prototype, "put", {
      configurable: true,
      writable: true,
      value: function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        const candidate = value as { ownerKey?: string; generation?: number } | null;
        if (candidate?.ownerKey === ownerKey && candidate.generation === restored.checkpoint.generation + 1) {
          throw new DOMException("simulated maintenance quota exhaustion", "QuotaExceededError");
        }
        return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
      },
    });
    let quotaError = "none";
    try {
      await backend.replaceAll(serialized(["must-not-commit"]), { tokenizerVersion: tokenizer.LUFX_TOKENIZER_VERSION });
    } catch (error) {
      quotaError = error instanceof DOMException ? error.name : "wrong-error";
    } finally {
      Object.defineProperty(IDBObjectStore.prototype, "put", { configurable: true, writable: true, value: originalPut });
    }
    const afterQuotaFailure = await backend.snapshot();

    const erased = await backend.eraseOwner();
    const afterErase = await backend.snapshot();
    const diagnosticsAfterErase = await backend.diagnostics();
    backend.dispose();

    return {
      firstReplacement,
      materializedItemCount,
      afterReplacement: { state: afterReplacement.state, checkpoint: afterReplacement.checkpoint, ids: afterReplacement.items.map((entry) => entry.id) },
      tokenizerDrift,
      driftSnapshot: { state: driftSnapshot.state, ids: driftSnapshot.items.map((entry) => entry.id) },
      restored,
      quotaError,
      afterQuotaFailure: { checkpoint: afterQuotaFailure.checkpoint, ids: afterQuotaFailure.items.map((entry) => entry.id) },
      erased,
      afterErase: { state: afterErase.state, checkpoint: afterErase.checkpoint, ids: afterErase.items.map((entry) => entry.id) },
      diagnosticsAfterErase,
    };
  });

  expect(result.firstReplacement).toMatchObject({ state: "ready", tokenizerVersion: "lufx-tokenizer-v1", itemCount: 2 });
  expect(result.materializedItemCount).toBe(0);
  expect(result.afterReplacement.ids).toEqual(["new-a", "new-b"]);
  expect(result.tokenizerDrift.state).toBe("rebuild-required");
  expect(result.driftSnapshot).toEqual({ state: "rebuild-required", ids: [] });
  expect(result.restored).toMatchObject({ state: "ready", tokenizerVersion: "lufx-tokenizer-v1", itemCount: 2 });
  expect(result.quotaError).toBe("QuotaExceededError");
  expect(result.afterQuotaFailure.ids).toEqual(["new-a", "new-b"]);
  expect(result.erased).toMatchObject({ state: "erased", itemCount: 0, approximateBytes: 0 });
  expect(result.afterErase).toMatchObject({ state: "rebuild-required", ids: [] });
  expect(result.diagnosticsAfterErase).toMatchObject({ state: "erased", itemCount: 0, approximateBytes: 0 });
});

test("Lumina rejects a stale generation replacement after another owner backend erases the partition", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const tokenizer = await import("/src/FX/LuminaFX/LUFXTokenizer.ts");
    const backendModule = await import("/src/SynCloudOS/LuminaFX/IndexedDBLuminaBackend.ts");
    const databaseName = `lumina-stale-replacement-${Math.random().toString(16).slice(2)}`;
    const ownerKey = "stale-owner";
    const first = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const second = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const makeItem = (id: string) => new lumina.LUFXSearchableItem({
      id, domain: "notes", contentType: "note", title: id,
      activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id } }, revision: "r1",
    }).toJSON();
    await first.replaceAll([makeItem("before")], { tokenizerVersion: tokenizer.LUFX_TOKENIZER_VERSION });
    const baseline = await first.diagnostics();
    await second.eraseOwner();
    let staleError = "none";
    try {
      await first.replaceAll([makeItem("must-not-return")], {
        tokenizerVersion: tokenizer.LUFX_TOKENIZER_VERSION,
        expectedCheckpoint: baseline.checkpoint,
        expectedState: baseline.state,
      } as never);
    } catch (error) {
      staleError = error instanceof DOMException ? error.name : "wrong-error";
    }
    const snapshot = await first.snapshot();
    first.dispose();
    second.dispose();
    return { staleError, state: snapshot.state, ids: snapshot.items.map((entry) => entry.id) };
  });

  expect(result).toEqual({ staleError: "InvalidStateError", state: "rebuild-required", ids: [] });
});

test("Lumina reports rebuild-required when compact generation storage disappears", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const tokenizer = await import("/src/FX/LuminaFX/LUFXTokenizer.ts");
    const backendModule = await import("/src/SynCloudOS/LuminaFX/IndexedDBLuminaBackend.ts");
    const databaseName = `lumina-eviction-${Math.random().toString(16).slice(2)}`;
    const ownerKey = "eviction-owner";
    const backend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const entry = new lumina.LUFXSearchableItem({
      id: "one", domain: "notes", contentType: "note", title: "One",
      activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id: "one" } }, revision: "r1",
    }).toJSON();
    await backend.replaceAll([entry], { tokenizerVersion: tokenizer.LUFX_TOKENIZER_VERSION });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("meta", "readwrite");
      transaction.objectStore("meta").delete(`${ownerKey}\u0000snapshot`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    const snapshot = await backend.snapshot();
    const diagnostics = await backend.diagnostics();
    backend.dispose();
    return { snapshotState: snapshot.state, ids: snapshot.items.map((item) => item.id), diagnosticsState: diagnostics.state };
  });

  expect(result).toEqual({ snapshotState: "rebuild-required", ids: [], diagnosticsState: "rebuild-required" });
});

test("Lumina corruption reports rebuild-required without deleting the corrupt index record", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const backendModule = await import("/src/SynCloudOS/LuminaFX/IndexedDBLuminaBackend.ts");
    const databaseName = `lumina-corrupt-${Math.random().toString(16).slice(2)}`;
    const ownerKey = "corrupt-owner";
    const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const seed = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    await seed.snapshot();
    seed.dispose();
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("items", "readwrite");
      transaction.objectStore("items").put({
        ownerKey,
        id: "corrupt",
        domain: "notes",
        contentType: "note",
        title: 42,
        activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id: "corrupt" } },
        revision: "r1",
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();

    const backend = new backendModule.IndexedDBLuminaBackend({ indexedDB, databaseName, ownerKey });
    const snapshot = await backend.snapshot();
    backend.dispose();
    const verifyDatabase = await openDatabase();
    const rawRecord = await new Promise<unknown>((resolve, reject) => {
      const request = verifyDatabase.transaction("items", "readonly").objectStore("items").get([ownerKey, "corrupt"]);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    verifyDatabase.close();
    return { state: snapshot.state, ids: snapshot.items.map((entry) => entry.id), rawRecordStillPresent: Boolean(rawRecord) };
  });

  expect(result).toEqual({ state: "rebuild-required", ids: [], rawRecordStillPresent: true });
});

test("Lumina falls back to direct IndexedDB when Worker is unavailable and disposal settles pending work", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const lumina = await import("/src/FX/LuminaFX/public.ts");
    const browser = await import("/src/SynCloudOS/PlatformAdapters/WorkerLuminaIndexBackend.ts");
    const originalWorker = globalThis.Worker;
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: undefined });
    try {
      const owner = new AbortController();
      const factory = browser.createBrowserLuminaIndexBackendFactory(`lumina-fallback-${Math.random().toString(16).slice(2)}`);
      if (!factory) return { available: false };
      const backend = factory.create("fallback-owner", owner.signal);
      const index = new lumina.LUFXIndex(backend);
      const item = new lumina.LUFXSearchableItem({
        id: "fallback-item", domain: "notes", contentType: "note", title: "Fallback",
        activation: { kind: "named-route", version: 1, routeName: "note", parameters: { id: "fallback-item" } }, revision: "r1",
      });
      const committed = await index.upsert(item, "fallback-mutation");
      const snapshot = await index.snapshot();
      owner.abort(new DOMException("owner disposed", "AbortError"));
      let afterDispose = "none";
      try { await index.snapshot(); } catch (error) { afterDispose = error instanceof DOMException ? error.name : "wrong-error"; }

      const pendingBackend = factory.create("pending-owner", new AbortController().signal);
      const pending = pendingBackend.snapshot();
      pendingBackend.dispose();
      let pendingDispose = "none";
      try { await pending; } catch (error) { pendingDispose = error instanceof DOMException ? error.name : "wrong-error"; }
      return {
        available: true,
        committed,
        ids: snapshot.items.map((entry) => entry.id),
        afterDispose,
        pendingDispose,
      };
    } finally {
      Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: originalWorker });
    }
  });

  expect(result).toEqual({
    available: true,
    committed: { mutationId: "fallback-mutation", checkpoint: { generation: 1, revision: 1 }, replayed: false },
    ids: ["fallback-item"],
    afterDispose: "AbortError",
    pendingDispose: "AbortError",
  });
});
