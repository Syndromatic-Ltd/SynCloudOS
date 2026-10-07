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

import { describe, expect, it, vi } from "vitest";
import {
  DocumentUnavailableError,
  DocumentVersionConflictError,
  InMemoryDocumentAdapter,
  SynchronisingDocumentAdapter,
} from "../../src/SynCloudOS/Documents";
import { createTestRuntimeEnvironment } from "./helpers";

describe("SynchronisingDocumentAdapter", () => {
  it("keeps an offline write locally and exposes its queued status", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => false, environment });
    const record = await adapter.write({
      location: { kind: "memory", namespace: "sync", key: "note-1" },
      typeId: "com.syncloudos.note",
      schemaVersion: 1,
      content: { body: "offline" },
      expectedVersion: null,
      idempotencyKey: "offline-note-1",
    });
    expect(record.content).toEqual({ body: "offline" });
    expect(adapter.queueSnapshot()).toMatchObject([
      { idempotencyKey: "offline-note-1", state: "queued", attemptCount: 0 },
    ]);
    expect((await adapter.flush()).outcome).toBe("offline");
  });

  it("flushes in FIFO order and reuses the original idempotency keys", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const write = vi.spyOn(remote, "write");
    let online = false;
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => online, environment });
    const location = (key: string) => ({ kind: "memory", namespace: "sync", key } as const);
    await adapter.write({ location: location("a"), typeId: "com.syncloudos.note", schemaVersion: 1, content: "a", expectedVersion: null, idempotencyKey: "a" });
    await adapter.write({ location: location("b"), typeId: "com.syncloudos.note", schemaVersion: 1, content: "b", expectedVersion: null, idempotencyKey: "b" });
    online = true;
    await expect(adapter.flush()).resolves.toMatchObject({ outcome: "completed", sent: 2 });
    expect(write.mock.calls.map(([entry]) => entry.idempotencyKey)).toEqual(["a", "b"]);
    expect(adapter.queueSnapshot()).toEqual([]);
  });

  it("adopts the successful remote version in the local mirror", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment });
    const location = { kind: "memory", namespace: "sync", key: "mirrored" } as const;
    await adapter.write({
      location,
      typeId: "com.syncloudos.note",
      schemaVersion: 1,
      content: { body: "mirrored" },
      expectedVersion: null,
      idempotencyKey: "mirrored",
    });

    await expect(adapter.flush()).resolves.toMatchObject({ outcome: "completed", sent: 1 });
    const remoteRecord = await remote.read(location);
    const localRecord = await local.read(location);
    expect(localRecord).toEqual(remoteRecord);
  });

  it("marks conflicts without retry and backs off unavailable work deterministically", async () => {
    const environment = createTestRuntimeEnvironment();
    const local = new InMemoryDocumentAdapter(environment);
    const remote = new InMemoryDocumentAdapter(environment);
    const adapter = new SynchronisingDocumentAdapter({ local, remote, online: () => true, environment });
    const location = { kind: "memory", namespace: "sync", key: "conflict" } as const;
    await remote.write({ location, typeId: "com.syncloudos.note", schemaVersion: 1, content: "remote", expectedVersion: null, idempotencyKey: "seed" });
    await adapter.write({ location, typeId: "com.syncloudos.note", schemaVersion: 1, content: "local", expectedVersion: null, idempotencyKey: "local" });
    await adapter.flush();
    expect(adapter.queueSnapshot()[0]).toMatchObject({ state: "conflicted", attemptCount: 1 });

    const unavailableRemote = new InMemoryDocumentAdapter(environment);
    vi.spyOn(unavailableRemote, "write").mockRejectedValue(new DocumentUnavailableError());
    const retrying = new SynchronisingDocumentAdapter({ local: new InMemoryDocumentAdapter(environment), remote: unavailableRemote, online: () => true, environment });
    await retrying.write({ location: { ...location, key: "retry" }, typeId: "com.syncloudos.note", schemaVersion: 1, content: "retry", expectedVersion: null, idempotencyKey: "retry" });
    await retrying.flush();
    expect(retrying.queueSnapshot()[0]).toMatchObject({ state: "queued", attemptCount: 1, nextAttemptAt: expect.any(String) });
  });
});
