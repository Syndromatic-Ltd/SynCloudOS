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
import { DocumentAbortError, DocumentVersionConflictError } from "../DocumentErrors";
import type { DocumentLocation } from "../documentTypes";
import type { DocumentStorageAdapter } from "./documentAdapterTypes";

export function runDocumentAdapterConformance(
  name: string,
  createAdapter: () => DocumentStorageAdapter,
  options: { readonly location?: DocumentLocation } = {},
): void {
  const location = options.location ?? { kind: "memory", namespace: `conformance:${name}`, key: "note" };
  const create = (adapter: DocumentStorageAdapter, body = "One", idempotencyKey = "create") => adapter.write({
    location,
    typeId: "com.syncloudos.note",
    schemaVersion: 1,
    content: { schemaVersion: 1, body },
    expectedVersion: null,
    idempotencyKey,
    metadata: { fixture: name },
  });

  describe(name, () => {
    it("creates, reads and round-trips its canonical location", async () => {
      const adapter = createAdapter();
      const saved = await create(adapter);
      expect(saved).toMatchObject({ location, version: { sequence: 1 }, content: { body: "One" } });
      expect(await adapter.read(location)).toEqual(saved);
      expect((await adapter.list({ typeId: "com.syncloudos.note" }))).toEqual([saved]);
    });

    it("updates conditionally and rejects a stale writer without mutation", async () => {
      const adapter = createAdapter();
      const first = await create(adapter);
      const second = await adapter.write({
        location,
        typeId: first.typeId,
        schemaVersion: first.schemaVersion,
        content: { schemaVersion: 1, body: "Two" },
        expectedVersion: first.version,
        idempotencyKey: "update",
      });
      await expect(adapter.write({
        location,
        typeId: first.typeId,
        schemaVersion: first.schemaVersion,
        content: { schemaVersion: 1, body: "Stale" },
        expectedVersion: first.version,
        idempotencyKey: "stale",
      })).rejects.toBeInstanceOf(DocumentVersionConflictError);
      expect(await adapter.read(location)).toEqual(second);
    });

    it("replays only the exact idempotent operation", async () => {
      const adapter = createAdapter();
      const first = await create(adapter);
      expect(await create(adapter)).toEqual(first);
      await expect(create(adapter, "Different")).rejects.toBeTruthy();
      expect(await adapter.listVersions(location)).toHaveLength(1);
    });

    it("keeps ordered immutable historical records after delete", async () => {
      const adapter = createAdapter();
      const first = await create(adapter);
      const second = await adapter.write({
        location,
        typeId: first.typeId,
        schemaVersion: first.schemaVersion,
        content: { schemaVersion: 1, body: "Two" },
        expectedVersion: first.version,
        idempotencyKey: "update",
      });
      expect((await adapter.listVersions(location)).map(({ sequence }) => sequence)).toEqual([1, 2]);
      const historical = await adapter.readVersion<{ schemaVersion: number; body: string }>(location, first.version);
      expect(historical?.content.body).toBe("One");
      if (historical) historical.content.body = "mutated";
      expect((await adapter.readVersion<{ body: string }>(location, first.version))?.content.body).toBe("One");
      await adapter.remove(location, second.version);
      expect(await adapter.read(location)).toBeNull();
      expect(await adapter.listVersions(location)).toHaveLength(2);
    });

    it("observes abort before adapter I/O", async () => {
      const adapter = createAdapter();
      const abort = new AbortController();
      abort.abort("test");
      await expect(adapter.read(location, { signal: abort.signal })).rejects.toBeInstanceOf(DocumentAbortError);
      expect(await adapter.read(location)).toBeNull();
    });
  });
}
