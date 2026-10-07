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
  DocumentAbortError,
  DocumentDeletedError,
  DocumentReadOnlyError,
  DocumentWriteOutcomeUnknownError,
  RemoteDocumentAdapter,
  type DocumentRemoteTransport,
} from "../../src/SynCloudOS/Documents";

const location = { kind: "remote", url: "https://documents.example/note-1" } as const;
const request = {
  location,
  typeId: "com.syncloudos.note",
  schemaVersion: 1,
  content: { body: "local" },
  expectedVersion: { id: "v2", sequence: 2, savedAt: "2026-07-29T11:00:00.000Z", etag: '"v2"' },
  idempotencyKey: "save-note-1",
} as const;

describe("RemoteDocumentAdapter", () => {
  it("maps expected versions to If-Match and 412 to a document conflict", async () => {
    const transport: DocumentRemoteTransport = {
      request: vi.fn().mockResolvedValue({
        status: 412,
        headers: { etag: '"v3"' },
        body: {
          typeId: "com.syncloudos.note",
          schemaVersion: 1,
          content: { body: "remote" },
          version: { id: "v3", sequence: 3, savedAt: "2026-07-29T12:00:00.000Z", etag: '"v3"' },
        },
      }),
    };
    const adapter = new RemoteDocumentAdapter(transport);
    await expect(adapter.write(request)).rejects.toMatchObject({
      code: "document-version-conflict",
      currentRecord: { content: { body: "remote" }, version: { sequence: 3 } },
    });
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        "If-Match": '"v2"',
        "Idempotency-Key": "save-note-1",
      }),
    }));
  });

  it.each([
    [200, DocumentWriteOutcomeUnknownError, { malformed: true }],
    [401, DocumentReadOnlyError, null],
    [403, DocumentReadOnlyError, null],
    [404, DocumentDeletedError, null],
    [408, DocumentWriteOutcomeUnknownError, null],
    [429, DocumentWriteOutcomeUnknownError, null],
    [503, DocumentWriteOutcomeUnknownError, null],
  ])("maps write status %s to its typed failure and retains an indeterminate write key", async (status, Failure, body) => {
    const adapter = new RemoteDocumentAdapter({ request: async () => ({ status, headers: {}, body }) });
    const write = adapter.write(request);
    await expect(write).rejects.toBeInstanceOf(Failure);
    if (Failure === DocumentWriteOutcomeUnknownError) {
      await expect(write).rejects.toMatchObject({ idempotencyKey: request.idempotencyKey });
    }
  });

  it.each([
    "matching record",
    "missing record",
    "wrong key",
    "wrong type",
    "wrong schema",
    "wrong content",
    "wrong metadata",
  ])("recovers a sent write only with its exact key and outbound bytes: %s", async (scenario) => {
    const write = { ...request, metadata: { owner: "original" } };
    const body = {
      typeId: scenario === "wrong type" ? "com.syncloudos.other" : write.typeId,
      schemaVersion: scenario === "wrong schema" ? 2 : write.schemaVersion,
      content: scenario === "wrong content" ? { body: "different" } : write.content,
      version: request.expectedVersion,
      metadata: scenario === "wrong metadata" ? { owner: "different" } : write.metadata,
    };
    const transport: DocumentRemoteTransport = {
      request: vi.fn(async () => ({
        status: scenario === "missing record" ? 404 : 200,
        headers: { "Idempotency-Key": scenario === "wrong key" ? "another-write" : write.idempotencyKey },
        body: scenario === "missing record" ? null : body,
      })),
    };
    const adapter = new RemoteDocumentAdapter(transport);
    const recovered = await adapter.recoverWriteByIdempotencyKey(write);
    if (scenario === "matching record") {
      expect(recovered).toMatchObject({ typeId: write.typeId, schemaVersion: write.schemaVersion, content: write.content, metadata: write.metadata });
    } else {
      expect(recovered).toBeNull();
    }
  });

  it("maps an aborting transport and never reads ambient fetch", async () => {
    const adapter = new RemoteDocumentAdapter({
      request: async () => { throw new DOMException("stopped", "AbortError"); },
    });
    await expect(adapter.read(location)).rejects.toBeInstanceOf(DocumentAbortError);
  });
});
