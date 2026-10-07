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

test("IndexedDB close transactions fence same-location writers across runtime instances and restore exact durable state", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const documents = await import("/src/SynCloudOS/Documents/index.ts");
    const databaseName = `selected-close-fence-${Math.random().toString(16).slice(2)}`;
    let uuid = 0;
    const environment = {
      now: () => 1_786_240_000_000 + uuid,
      randomUUID: () => `selected-close-${++uuid}`,
    };
    const deleteDatabase = () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    await deleteDatabase();
    const first = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const second = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const location = { kind: "indexed-db" as const, database: databaseName, store: "documents", key: "shared" };
    const base = await first.write({
      location,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Base", body: "acknowledged" },
      expectedVersion: null,
      idempotencyKey: "selected-close-base",
    });
    const close = await first.beginCloseTransaction(location);
    let foreignCode: string | null = null;
    try {
      await second.write({
        location,
        typeId: "tests.note",
        schemaVersion: 1,
        content: { title: "Foreign", body: "must be fenced" },
        expectedVersion: base.version,
        idempotencyKey: "selected-close-foreign",
      });
    } catch (error) {
      foreignCode = error instanceof documents.DocumentUnavailableError ? error.code : "wrong-error";
    }
    const temporary = await first.write({
      location,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Temporary", body: "close precommit" },
      expectedVersion: base.version,
      idempotencyKey: "selected-close-temporary",
      closeTransactionToken: close.token,
    });
    await close.seal();
    await close.rollback();
    const restored = await second.read(location);
    const afterRollback = await second.write({
      location,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "After", body: "admitted" },
      expectedVersion: base.version,
      idempotencyKey: "selected-close-after",
    });
    first.dispose();
    second.dispose();
    await deleteDatabase();
    return {
      foreignCode,
      base,
      temporary,
      restored,
      afterRollback,
    };
  });

  expect(result.foreignCode).toBe("document-unavailable");
  expect(result.temporary.version).not.toEqual(result.base.version);
  expect(result.restored).toEqual(result.base);
  expect(result.afterRollback.version.sequence).toBe(result.base.version.sequence + 1);
});

test("IndexedDB synchronisation keeps global FIFO and repairs idempotency through ACK, discard and disposal", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const documents = await import("/src/SynCloudOS/Documents/index.ts");
    const databaseName = `p05-sync-indexeddb-${Math.random().toString(16).slice(2)}`;
    let uuid = 0;
    let online = false;
    const environment = {
      now: () => 1_786_230_000_000,
      randomUUID: () => `p05-sync-uuid-${++uuid}`,
      setTimeout: (callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
    };
    const deleteDatabase = () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    await deleteDatabase();
    const firstLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const secondLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const remote = new documents.InMemoryDocumentAdapter(environment);
    const mapLocation = (location: any) => location.kind === "indexed-db"
      ? {
          local: location,
          remote: { kind: "memory" as const, namespace: databaseName, key: location.key! },
        }
      : null;
    const first = new documents.SynchronisingDocumentAdapter({
      local: firstLocal,
      remote,
      online: () => online,
      environment,
      mapLocation,
    });
    const second = new documents.SynchronisingDocumentAdapter({
      local: secondLocal,
      remote,
      online: () => online,
      environment,
      mapLocation,
    });
    const locationA = { kind: "indexed-db" as const, database: databaseName, store: "documents", key: "a" };
    const locationB = { kind: "indexed-db" as const, database: databaseName, store: "documents", key: "b" };
    const requestA = {
      location: locationA,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "A", body: "first" },
      expectedVersion: null,
      idempotencyKey: "p05-sync-a",
    };
    const requestB = {
      location: locationB,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "B", body: "second" },
      expectedVersion: null,
      idempotencyKey: "p05-sync-b",
    };
    const [localA] = await Promise.all([first.write(requestA), second.write(requestB)]);
    const durableBeforeFlush = await firstLocal.readSynchronisationQueue();
    online = true;
    await first.flush();
    const remoteA = await remote.read({ kind: "memory", namespace: databaseName, key: "a" });
    const retryA = await first.write(requestA);

    online = false;
    const locationDiscard = {
      kind: "indexed-db" as const,
      database: databaseName,
      store: "documents",
      key: "discard",
    };
    const discardRequest = {
      location: locationDiscard,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Discard", body: "remove me" },
      expectedVersion: null,
      idempotencyKey: "p05-sync-discard",
    };
    const discarded = await first.write(discardRequest);
    await first.discardPendingSynchronisation(locationDiscard, {
      discardedRecord: discarded,
      previousRecord: null,
    });
    const afterDiscard = await firstLocal.read(locationDiscard);
    const recreated = await firstLocal.write(discardRequest);
    const pendingAfterRetry = first.queueSnapshot().length;

    await first.dispose();
    let disposedCode: string | null = null;
    try {
      await firstLocal.read(locationA);
    } catch (error) {
      disposedCode = error instanceof documents.DocumentUnavailableError ? error.code : "wrong-error";
    }
    secondLocal.dispose();
    await deleteDatabase();
    return {
      localA: localA.version,
      orders: durableBeforeFlush.map(({ order }) => order),
      keys: durableBeforeFlush.map(({ request }) => request.location.kind === "memory" ? request.location.key : "wrong"),
      retryVersion: retryA.version,
      remoteVersion: remoteA?.version ?? null,
      pendingAfterRetry,
      afterDiscard,
      recreatedVersion: recreated.version,
      discardedVersion: discarded.version,
      disposedCode,
    };
  });

  expect(result.orders).toEqual([1, 2]);
  expect(new Set(result.orders).size).toBe(2);
  expect(result.keys).toEqual(["a", "b"]);
  expect(result.retryVersion).toEqual(result.remoteVersion);
  expect(result.retryVersion).not.toEqual(result.localA);
  expect(result.pendingAfterRetry).toBe(0);
  expect(result.afterDiscard).toBeNull();
  expect(result.recreatedVersion).not.toEqual(result.discardedVersion);
  expect(result.disposedCode).toBe("document-unavailable");
});

test("IndexedDB discard tombstones an active cross-runtime send and intermediate ACK retries stay authoritative", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const documents = await import("/src/SynCloudOS/Documents/index.ts");
    const databaseName = `ack-rebase-indexeddb-${Math.random().toString(16).slice(2)}`;
    let uuid = 0;
    const environment = {
      now: () => 1_786_273_200_000,
      randomUUID: () => `ack-rebase-uuid-${++uuid}`,
      setTimeout: (callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
    };
    const deleteDatabase = () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    const tick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    await deleteDatabase();
    const firstLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const secondLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const remoteBacking = new documents.InMemoryDocumentAdapter(environment);
    let authoritativeIntermediateVersion: any = null;
    let heldWriteResolve!: () => void;
    let heldWriteStartedResolve!: () => void;
    const heldWrite = new Promise<void>((resolve) => { heldWriteResolve = resolve; });
    const heldWriteStarted = new Promise<void>((resolve) => { heldWriteStartedResolve = resolve; });
    let holdNextWrite = true;
    let skewNextAcknowledgement = false;
    const remote = {
      id: "held-idb-remote",
      capabilities: remoteBacking.capabilities,
      supports: (location: any) => remoteBacking.supports(location),
      read: (location: any, options?: any) => remoteBacking.read(location, options),
      write: async (request: any) => {
        if (holdNextWrite) {
          holdNextWrite = false;
          heldWriteStartedResolve();
          await heldWrite;
        }
        const record = await remoteBacking.write(request);
        if (!skewNextAcknowledgement) return record;
        skewNextAcknowledgement = false;
        const authoritative = {
          ...record,
          version: { ...record.version, sequence: record.version.sequence + 100 },
        };
        await remoteBacking.adoptSynchronisedRecord(authoritative, record.version);
        authoritativeIntermediateVersion = authoritative.version;
        return authoritative;
      },
      remove: (location: any, version: any, options?: any) => remoteBacking.remove(location, version, options),
      list: (query: any) => remoteBacking.list(query),
      listVersions: (location: any, options?: any) => remoteBacking.listVersions(location, options),
      readVersion: (location: any, version: any, options?: any) => remoteBacking.readVersion(location, version, options),
    };
    const mapLocation = (location: any) => location.kind === "indexed-db"
      ? {
          local: location,
          remote: { kind: "memory" as const, namespace: databaseName, key: location.key! },
        }
      : null;
    const first = new documents.SynchronisingDocumentAdapter({
      local: firstLocal,
      remote,
      online: () => true,
      environment,
      mapLocation,
    });
    const second = new documents.SynchronisingDocumentAdapter({
      local: secondLocal,
      remote,
      online: () => true,
      environment,
      mapLocation,
    });
    let nonAtomicIntermediateAdoptions = 0;
    const adoptIntermediate = secondLocal.adoptIntermediateSynchronisedRecord.bind(secondLocal);
    secondLocal.adoptIntermediateSynchronisedRecord = async (...args: any[]) => {
      nonAtomicIntermediateAdoptions += 1;
      return adoptIntermediate(...args as Parameters<typeof adoptIntermediate>);
    };
    const discardedLocation = {
      kind: "indexed-db" as const,
      database: databaseName,
      store: "documents",
      key: "held-discard",
    };
    const discarded = await first.write({
      location: discardedLocation,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Held", body: "must disappear" },
      expectedVersion: null,
      idempotencyKey: "held-discard",
    });
    const flushing = first.flush();
    await heldWriteStarted;
    let discardSettled = false;
    const discarding = second.discardPendingSynchronisation(discardedLocation, {
      discardedRecord: discarded,
      previousRecord: null,
    }).then(() => { discardSettled = true; });
    // Release the remote acknowledgement only once the second runtime's discard is durable.
    while (!(await secondLocal.readSynchronisationQueue()).some((item) => item.state === "discarded")) await tick();
    const settledBeforeRemote = discardSettled;
    heldWriteResolve();
    await Promise.all([flushing, discarding]);
    const durableAfterDiscard = await secondLocal.readSynchronisationQueue();
    const localAfterDiscard = await secondLocal.read(discardedLocation);
    const remoteAfterDiscard = await remoteBacking.read({
      kind: "memory",
      namespace: databaseName,
      key: "held-discard",
    });

    const orderingLocation = {
      kind: "indexed-db" as const,
      database: databaseName,
      store: "documents",
      key: "ack-ordering",
    };
    const requestA = {
      location: orderingLocation,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Ordering", body: "A" },
      expectedVersion: null,
      idempotencyKey: "idb-intermediate-a",
    };
    const localA = await second.write(requestA);
    await first.write({
      ...requestA,
      content: { title: "Ordering", body: "B" },
      expectedVersion: localA.version,
      idempotencyKey: "idb-intermediate-b",
    });
    skewNextAcknowledgement = true;
    await second.flush();
    const orderingRemoteLocation = { kind: "memory" as const, namespace: databaseName, key: "ack-ordering" };
    const remoteVersions = await remoteBacking.listVersions(orderingRemoteLocation);
    const remoteA = remoteVersions[0] ?? null;
    const retryA = await first.write(requestA);
    const queueAfterRetry = await firstLocal.readSynchronisationQueue();
    const remoteOrdering = await remoteBacking.read({
      kind: "memory",
      namespace: databaseName,
      key: "ack-ordering",
    });
    await Promise.all([first.dispose(), second.dispose()]);
    await deleteDatabase();
    return {
      settledBeforeRemote,
      durableAfterDiscard: durableAfterDiscard.length,
      localAfterDiscard,
      remoteAfterDiscard,
      localAVersion: localA.version,
      retryAVersion: retryA.version,
      remoteAVersion: authoritativeIntermediateVersion ?? remoteA,
      nonAtomicIntermediateAdoptions,
      queueAfterRetry: queueAfterRetry.length,
      remoteOrderingBody: (remoteOrdering?.content as { body?: string } | undefined)?.body ?? null,
    };
  });

  expect(result.settledBeforeRemote).toBe(false);
  expect(result.durableAfterDiscard).toBe(0);
  expect(result.localAfterDiscard).toBeNull();
  expect(result.remoteAfterDiscard).toBeNull();
  expect(result.retryAVersion).toEqual(result.remoteAVersion);
  expect(result.retryAVersion).not.toEqual(result.localAVersion);
  expect(result.nonAtomicIntermediateAdoptions).toBe(0);
  expect(result.queueAfterRetry).toBe(0);
  expect(result.remoteOrderingBody).toBe("B");
});

test("IndexedDB compensates a discard tombstone that wins after ACK hydration but before adoption CAS", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const documents = await import("/src/SynCloudOS/Documents/index.ts");
    const databaseName = `discard-adoption-cas-${Math.random().toString(16).slice(2)}`;
    let uuid = 0;
    const environment = {
      now: () => 1_786_276_800_000,
      randomUUID: () => `discard-adoption-cas-${++uuid}`,
      setTimeout: (callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
    };
    const deleteDatabase = () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    const tick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    await deleteDatabase();
    const firstLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const secondLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const remote = new documents.InMemoryDocumentAdapter(environment);
    let adoptionStartedResolve!: () => void;
    let releaseAdoptionResolve!: () => void;
    const adoptionStarted = new Promise<void>((resolve) => { adoptionStartedResolve = resolve; });
    const releaseAdoption = new Promise<void>((resolve) => { releaseAdoptionResolve = resolve; });
    const adoptSynchronisedRecord = firstLocal.adoptSynchronisedRecord.bind(firstLocal);
    firstLocal.adoptSynchronisedRecord = async (...args: any[]) => {
      adoptionStartedResolve();
      await releaseAdoption;
      return adoptSynchronisedRecord(...args as Parameters<typeof adoptSynchronisedRecord>);
    };
    const mapLocation = (location: any) => location.kind === "indexed-db"
      ? {
          local: location,
          remote: { kind: "memory" as const, namespace: databaseName, key: location.key! },
        }
      : null;
    const first = new documents.SynchronisingDocumentAdapter({
      local: firstLocal,
      remote,
      online: () => true,
      environment,
      mapLocation,
    });
    const second = new documents.SynchronisingDocumentAdapter({
      local: secondLocal,
      remote,
      online: () => true,
      environment,
      mapLocation,
    });
    const location = {
      kind: "indexed-db" as const,
      database: databaseName,
      store: "documents",
      key: "discard-after-hydration",
    };
    const discarded = await first.write({
      location,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Discard", body: "must be compensated" },
      expectedVersion: null,
      idempotencyKey: "discard-after-hydration",
    });
    const flushing = first.flush();
    await adoptionStarted;
    const discardAbort = new AbortController();
    const discarding = second.discardPendingSynchronisation(location, {
      discardedRecord: discarded,
      previousRecord: null,
      signal: discardAbort.signal,
    });
    let tombstoneObserved = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const queue = await secondLocal.readSynchronisationQueue();
      if (queue.some((item: any) => item.state === "discarded")) {
        tombstoneObserved = true;
        break;
      }
      await tick();
    }
    releaseAdoptionResolve();
    const completion = Promise.all([flushing, discarding]).then(
      () => ({ settled: true as const, error: null as string | null }),
      (error) => ({ settled: true as const, error: error instanceof Error ? error.message : String(error) }),
    );
    const outcome = await Promise.race([
      completion,
      new Promise<{ settled: false; error: null }>((resolve) => {
        window.setTimeout(() => resolve({ settled: false, error: null }), 750);
      }),
    ]);
    if (!outcome.settled) {
      discardAbort.abort("discard-adoption-cas-timeout");
      await Promise.allSettled([flushing, discarding]);
    }
    const durable = await secondLocal.readSynchronisationQueue();
    const local = await secondLocal.read(location);
    const remoteRecord = await remote.read({
      kind: "memory",
      namespace: databaseName,
      key: "discard-after-hydration",
    });
    await Promise.all([first.dispose(), second.dispose()]);
    await deleteDatabase();
    return {
      tombstoneObserved,
      settled: outcome.settled,
      error: outcome.error,
      durableCount: durable.length,
      local,
      remoteRecord,
    };
  });

  expect(result.tombstoneObserved).toBe(true);
  expect(result.settled).toBe(true);
  expect(result.error).toBeNull();
  expect(result.durableCount).toBe(0);
  expect(result.local).toBeNull();
  expect(result.remoteRecord).toBeNull();
});

test("IndexedDB preserves an identical-content external version that wins before discard compensation", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const documents = await import("/src/SynCloudOS/Documents/index.ts");
    const databaseName = `discard-external-version-${Math.random().toString(16).slice(2)}`;
    let uuid = 0;
    const environment = {
      now: () => 1_786_276_800_000,
      randomUUID: () => `discard-external-version-${++uuid}`,
      setTimeout: (callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
    };
    const deleteDatabase = () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    const tick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    await deleteDatabase();
    const firstLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const secondLocal = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const remote = new documents.InMemoryDocumentAdapter(environment);
    let adoptionStartedResolve!: () => void;
    let releaseAdoptionResolve!: () => void;
    const adoptionStarted = new Promise<void>((resolve) => { adoptionStartedResolve = resolve; });
    const releaseAdoption = new Promise<void>((resolve) => { releaseAdoptionResolve = resolve; });
    const adoptSynchronisedRecord = firstLocal.adoptSynchronisedRecord.bind(firstLocal);
    firstLocal.adoptSynchronisedRecord = async (...args: any[]) => {
      adoptionStartedResolve();
      await releaseAdoption;
      return adoptSynchronisedRecord(...args as Parameters<typeof adoptSynchronisedRecord>);
    };
    const mapLocation = (location: any) => location.kind === "indexed-db"
      ? {
          local: location,
          remote: { kind: "memory" as const, namespace: databaseName, key: location.key! },
        }
      : null;
    const first = new documents.SynchronisingDocumentAdapter({
      local: firstLocal,
      remote,
      online: () => true,
      environment,
      mapLocation,
    });
    const second = new documents.SynchronisingDocumentAdapter({
      local: secondLocal,
      remote,
      online: () => true,
      environment,
      mapLocation,
    });
    const location = {
      kind: "indexed-db" as const,
      database: databaseName,
      store: "documents",
      key: "discard-external-version",
    };
    const remoteLocation = {
      kind: "memory" as const,
      namespace: databaseName,
      key: "discard-external-version",
    };
    const discarded = await first.write({
      location,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Discard", body: "identical body" },
      expectedVersion: null,
      idempotencyKey: "discard-external-version",
      metadata: { owner: "sender" },
    });
    const flushing = first.flush();
    await adoptionStarted;
    const senderAcknowledgement = (await remote.read(remoteLocation))!;
    const discardAbort = new AbortController();
    const discarding = second.discardPendingSynchronisation(location, {
      discardedRecord: discarded,
      previousRecord: null,
      signal: discardAbort.signal,
    });
    let tombstoneObserved = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const queue = await secondLocal.readSynchronisationQueue();
      if (queue.some((item: any) => item.state === "discarded")) {
        tombstoneObserved = true;
        break;
      }
      await tick();
    }
    const external = await remote.write({
      location: remoteLocation,
      typeId: senderAcknowledgement.typeId,
      schemaVersion: senderAcknowledgement.schemaVersion,
      content: senderAcknowledgement.content,
      expectedVersion: senderAcknowledgement.version,
      idempotencyKey: "external-identical-content",
      metadata: { owner: "external" },
    });
    releaseAdoptionResolve();
    const completion = Promise.allSettled([flushing, discarding]).then(([flush, discard]) => ({
      settled: true as const,
      flushStatus: flush.status,
      flushOutcome: flush.status === "fulfilled" ? flush.value.outcome : null,
      flushError: flush.status === "rejected" ? String(flush.reason) : null,
      discardStatus: discard.status,
      discardError: discard.status === "rejected" ? String(discard.reason) : null,
    }));
    const outcome = await Promise.race([
      completion,
      new Promise<{
        settled: false;
        flushStatus: null;
        flushOutcome: null;
        flushError: null;
        discardStatus: null;
        discardError: null;
      }>((resolve) => {
        window.setTimeout(() => resolve({
          settled: false,
          flushStatus: null,
          flushOutcome: null,
          flushError: null,
          discardStatus: null,
          discardError: null,
        }), 750);
      }),
    ]);
    if (!outcome.settled) {
      discardAbort.abort("discard-external-version-timeout");
      await Promise.allSettled([flushing, discarding]);
    }
    const durable = await secondLocal.readSynchronisationQueue();
    const remoteAfter = await remote.read(remoteLocation);
    await Promise.all([first.dispose(), second.dispose()]);
    await deleteDatabase();
    return {
      tombstoneObserved,
      external,
      outcome,
      durable,
      remoteAfter,
    };
  });

  expect(result.tombstoneObserved).toBe(true);
  expect(result.outcome.settled).toBe(true);
  expect(result.remoteAfter?.version).toEqual(result.external.version);
  expect(result.remoteAfter?.metadata).toEqual({ owner: "external" });
  expect(result.durable).toHaveLength(1);
  expect(result.durable[0]?.state).toBe("conflicted");
  expect(result.outcome.flushStatus).toBe("rejected");
  expect(result.outcome.flushError).toContain("changed before the conditional write completed");
  expect(result.outcome.discardStatus).toBe("rejected");
  expect(result.outcome.discardError).toContain("changed state before remote compensation");
});

test("an abandoned IndexedDB close lease expires and cannot fence the document forever", async ({ page }) => {
  await page.goto("/__framework-tests/documents/indexeddb");
  const result = await page.evaluate(async () => {
    const documents = await import("/src/SynCloudOS/Documents/index.ts");
    const databaseName = `selected-close-expiry-${Math.random().toString(16).slice(2)}`;
    let now = 1_786_260_000_000;
    let uuid = 0;
    const environment = {
      now: () => now,
      randomUUID: () => `selected-close-expiry-${++uuid}`,
    };
    const deleteDatabase = () => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
    await deleteDatabase();
    const first = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const second = new documents.IndexedDBDocumentAdapter({ indexedDB, databaseName, environment });
    const committedLocation = { kind: "indexed-db" as const, database: databaseName, store: "documents", key: "committed" };
    const committedBase = await first.write({
      location: committedLocation,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Committed", body: "before close commit" },
      expectedVersion: null,
      idempotencyKey: "selected-close-commit-base",
    });
    const committedClose = await first.beginCloseTransaction(committedLocation);
    await committedClose.commit();
    const immediateAfterCommit = await second.write({
      location: committedLocation,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Committed", body: "durable lease released" },
      expectedVersion: committedBase.version,
      idempotencyKey: "selected-close-commit-after",
    });
    const staleOwnerLocation = { kind: "indexed-db" as const, database: databaseName, store: "documents", key: "stale-owner" };
    const staleOwnerBase = await first.write({
      location: staleOwnerLocation,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Stale owner", body: "before expiry" },
      expectedVersion: null,
      idempotencyKey: "selected-close-stale-owner-base",
    });
    const staleOwnerClose = await first.beginCloseTransaction(staleOwnerLocation);
    now += 24 * 60 * 60 * 1_000;
    const foreignAfterExpiry = await second.write({
      location: staleOwnerLocation,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Foreign", body: "expired lease reclaimed" },
      expectedVersion: staleOwnerBase.version,
      idempotencyKey: "selected-close-stale-owner-foreign",
    });
    let staleOwnerErrorCode: string | null = null;
    try {
      await first.write({
        location: staleOwnerLocation,
        typeId: "tests.note",
        schemaVersion: 1,
        content: { title: "Stale owner", body: "must not resume" },
        expectedVersion: foreignAfterExpiry.version,
        idempotencyKey: "selected-close-stale-owner-resume",
        closeTransactionToken: staleOwnerClose.token,
      });
    } catch (error) {
      staleOwnerErrorCode = error instanceof documents.DocumentUnavailableError ? error.code : "wrong-error";
    }
    await staleOwnerClose.commit();
    const location = { kind: "indexed-db" as const, database: databaseName, store: "documents", key: "abandoned" };
    const base = await first.write({
      location,
      typeId: "tests.note",
      schemaVersion: 1,
      content: { title: "Base", body: "before abandoned close" },
      expectedVersion: null,
      idempotencyKey: "selected-close-expiry-base",
    });
    await first.beginCloseTransaction(location);
    first.dispose();
    now += 24 * 60 * 60 * 1_000;

    let errorCode: string | null = null;
    let written: { version: { sequence: number } } | null = null;
    try {
      written = await second.write({
        location,
        typeId: "tests.note",
        schemaVersion: 1,
        content: { title: "Recovered", body: "lease expired" },
        expectedVersion: base.version,
        idempotencyKey: "selected-close-expiry-recovered",
      });
    } catch (error) {
      errorCode = error instanceof documents.DocumentUnavailableError ? error.code : "wrong-error";
    }
    second.dispose();
    await deleteDatabase();
    return {
      committedBaseSequence: committedBase.version.sequence,
      immediateAfterCommitSequence: immediateAfterCommit.version.sequence,
      staleOwnerErrorCode,
      baseSequence: base.version.sequence,
      writtenSequence: written?.version.sequence ?? null,
      errorCode,
    };
  });

  expect(result.immediateAfterCommitSequence).toBe(result.committedBaseSequence + 1);
  expect(result.staleOwnerErrorCode).toBe("document-unavailable");
  expect(result.errorCode).toBeNull();
  expect(result.writtenSequence).toBe(result.baseSequence + 1);
});
