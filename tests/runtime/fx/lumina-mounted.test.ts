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

import { expect, it, vi } from "vitest";
import type {
  LUFXIndexBackend,
  LUFXIndexBackendMutation,
  LUFXIndexBackendMutationResult,
  LUFXIndexBackendSnapshot,
} from "../../../src/FX/LuminaFX/LUFXIndexBackend";
import { LuminaIndexService, type LuminaIndexBackendFactory } from "../../../src/SynCloudOS/LuminaFX/LuminaIndexService";
import { createMountedLuminaClient } from "../../../src/SynCloudOS/AppSDK/mountedLuminaClient";

class FakeBackend implements LUFXIndexBackend {
  disposed = false;
  async mutate(mutation: LUFXIndexBackendMutation, signal?: AbortSignal): Promise<LUFXIndexBackendMutationResult> {
    signal?.throwIfAborted();
    if (this.disposed) throw new DOMException("disposed", "AbortError");
    return { mutationId: mutation.mutationId, checkpoint: { generation: 1, revision: 1 }, replayed: false };
  }
  async snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot> {
    signal?.throwIfAborted();
    if (this.disposed) throw new DOMException("disposed", "AbortError");
    return { state: "ready", schemaVersion: 1, checkpoint: { generation: 0, revision: 0 }, items: [] };
  }
  dispose(): void { this.disposed = true; }
}

it("enforces mounted Lumina capability before acquisition and binds the app owner", async () => {
  const backend = new FakeBackend();
  const create = vi.fn(() => backend);
  const service = new LuminaIndexService({ create } satisfies LuminaIndexBackendFactory);
  const mount = new AbortController();
  let permissions: string[] = [];
  let allowed = true;
  const authorise = vi.fn(() => allowed);
  const client = createMountedLuminaClient(service, mount.signal, () => permissions, authorise, "com.syndromatic.owner");

  expect(() => client.createIndex()).toThrowError(DOMException);
  expect(create).not.toHaveBeenCalled();
  permissions = ["lumina.index", "lumina.query"];
  allowed = false;
  expect(() => client.createIndex()).toThrowError(DOMException);
  expect(create).not.toHaveBeenCalled();

  allowed = true;
  const index = client.createIndex();
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]?.[0]).toBe("com.syndromatic.owner");
  expect(authorise).toHaveBeenCalledWith("lumina.index");
  expect((await index.snapshot()).state).toBe("ready");
  expect(authorise).toHaveBeenCalledWith("lumina.query");

  mount.abort(new DOMException("unmounted", "AbortError"));
  expect(backend.disposed).toBe(true);
  await expect(index.snapshot()).rejects.toMatchObject({ name: "AbortError" });
  service.dispose();
});

it("accounts mounted Lumina index sessions and worker jobs until each index is released", () => {
  const backends: FakeBackend[] = [];
  const service = new LuminaIndexService({
    create() {
      const backend = new FakeBackend();
      backends.push(backend);
      return backend;
    },
  } satisfies LuminaIndexBackendFactory);
  const mount = new AbortController();
  const client = createMountedLuminaClient(
    service,
    mount.signal,
    () => ["lumina.index"],
    () => true,
    "com.syndromatic.owner",
  );

  const first = client.createIndex();
  const second = client.createIndex();
  expect(() => client.createIndex()).toThrowError(expect.objectContaining({ name: "QuotaExceededError" }));
  expect(backends).toHaveLength(2);

  first.dispose();
  expect(backends[0]?.disposed).toBe(true);
  const replacement = client.createIndex();
  expect(backends).toHaveLength(3);

  mount.abort(new DOMException("unmounted", "AbortError"));
  expect(backends[1]?.disposed).toBe(true);
  expect(backends[2]?.disposed).toBe(true);
  second.dispose();
  replacement.dispose();
  service.dispose();
});

it("separates own-index mutation authority from own-query authority", async () => {
  const service = new LuminaIndexService({ create: () => new FakeBackend() } satisfies LuminaIndexBackendFactory);
  const mount = new AbortController();
  let permissions: readonly string[] = ["lumina.index"];
  const authorised = new Set<string>(["lumina.index", "lumina.query"]);
  const client = createMountedLuminaClient(
    service,
    mount.signal,
    () => permissions,
    (capability) => authorised.has(capability),
    "com.syndromatic.owner",
  );

  const writer = client.createIndex();
  await expect(writer.delete("one", "mutation-one")).resolves.toMatchObject({ mutationId: "mutation-one" });
  await expect(writer.snapshot()).rejects.toMatchObject({ name: "SecurityError" });
  writer.dispose();

  permissions = ["lumina.query"];
  const reader = client.createIndex();
  await expect(reader.snapshot()).resolves.toMatchObject({ state: "ready" });
  await expect(reader.delete("one", "mutation-two")).rejects.toMatchObject({ name: "SecurityError" });
  reader.dispose();

  permissions = ["lumina.index", "lumina.query"];
  authorised.delete("lumina.query");
  const policyDeniedReader = client.createIndex();
  await expect(policyDeniedReader.snapshot()).rejects.toMatchObject({ name: "SecurityError" });
  policyDeniedReader.dispose();
  service.dispose();
});
