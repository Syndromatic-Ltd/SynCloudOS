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
import {
  DocumentRecoveryVersionConflictError,
  InMemoryDocumentRecoveryStore,
  canonicalDocumentContentHash,
} from "../../src/SynCloudOS/Documents";

describe("document recovery storage", () => {
  it("uses canonical content hashes and exact conditional versions", async () => {
    expect(canonicalDocumentContentHash({ b: 2, a: 1 })).toBe(canonicalDocumentContentHash({ a: 1, b: 2 }));
    const store = new InMemoryDocumentRecoveryStore();
    const input = {
      schemaVersion: 1 as const,
      recoveryId: "stable-recovery",
      documentId: "stable-document",
      typeId: "com.syncloudos.note",
      typeSchemaVersion: 1,
      location: null,
      baseVersion: null,
      dirtyRevision: 3,
      serializedContent: { title: "Note", body: "Recovered" },
      contentHash: canonicalDocumentContentHash({ title: "Note", body: "Recovered" }),
      capturedAt: "2026-08-08T12:00:00.000Z",
    };
    const first = await store.write(input, null);
    await expect(store.write(input, null)).rejects.toBeInstanceOf(DocumentRecoveryVersionConflictError);
    const second = await store.write({ ...input, dirtyRevision: 4 }, first.recoveryVersion);
    await expect(store.remove(input.recoveryId, first.recoveryVersion))
      .rejects.toBeInstanceOf(DocumentRecoveryVersionConflictError);
    await store.remove(input.recoveryId, second.recoveryVersion);
    expect(await store.read(input.recoveryId)).toBeNull();
  });
});
