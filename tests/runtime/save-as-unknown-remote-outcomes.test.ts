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
import {
  DocumentController,
  DocumentWriteOutcomeUnknownError,
  RemoteDocumentAdapter,
  type DocumentLocation,
  type DocumentRecord,
  type DocumentRemoteRequest,
  type DocumentStorageAdapter,
  type DocumentWriteRequest,
} from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function remoteLocation(key: string): Extract<DocumentLocation, { readonly kind: "remote" }> {
  return { kind: "remote", url: `https://p10-recovery.invalid/${key}` };
}

function remoteRecord(
  location: DocumentLocation,
  content: NoteDocumentModel,
  sequence = 1,
): DocumentRecord<NoteDocumentModel> {
  return {
    location: structuredClone(location),
    typeId: noteType.id,
    schemaVersion: noteType.schemaVersion,
    content: structuredClone(content),
    version: {
      id: `remote-${sequence}`,
      sequence,
      savedAt: new Date(sequence * 1_000).toISOString(),
      etag: `\"remote-${sequence}\"`,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(sequence * 1_000).toISOString(),
    metadata: {},
  };
}

function configuredController(adapter: DocumentStorageAdapter) {
  const dependencies = createDocumentTestDependencies();
  cleanups.push(dependencies.cleanup);
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  const registration = controller.registerAdapter(adapter);
  return { controller, registration };
}

function committedThenRejectedAdapter(id: string) {
  let committed: DocumentRecord<unknown> | null = null;
  let recoveryOverride: DocumentRecord<unknown> | null | undefined;
  let writes = 0;
  const remove = vi.fn(async () => undefined);
  const adapter: DocumentStorageAdapter = {
    id,
    capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
    supports: (location) => location.kind === "remote",
    read: async () => null,
    write: async <TSerialized,>(request: DocumentWriteRequest<TSerialized>): Promise<DocumentRecord<TSerialized>> => {
      writes += 1;
      committed = remoteRecord(request.location, request.content as NoteDocumentModel) as DocumentRecord<unknown>;
      throw new DocumentWriteOutcomeUnknownError(request.location, request.idempotencyKey, "response lost after commit");
    },
    recoverWriteByIdempotencyKey: async () => recoveryOverride === undefined ? committed : recoveryOverride,
    remove,
    list: async () => [],
    listVersions: async () => [],
    readVersion: async () => null,
  };
  return {
    adapter,
    writes: () => writes,
    setRecovery: (value: DocumentRecord<unknown> | null | undefined) => { recoveryOverride = value; },
    remove,
  };
}

describe("Save As unknown remote outcomes", () => {
  it("does not adopt or delete a conflicting record returned by a recovery protocol", async () => {
    const fixture = committedThenRejectedAdapter("p10-save-as-conflict");
    const { controller } = configuredController(fixture.adapter);
    const document = await controller.newDocument({ documentId: "p10-save-as-conflict", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "captured" }), { actionName: "Edit" });
    const destination = remoteLocation("conflict");

    fixture.setRecovery(remoteRecord(destination, { title: "external", body: "other writer" }, 2));
    await expect(controller.saveAsDocument({ documentId: document.id, destination })).rejects.toMatchObject({
      code: "document-write-outcome-unknown",
    });

    expect(document.location).toBeNull();
    expect(document.state).toBe("dirty");
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it("retains an unresolved sent write for recovery without issuing a second write, then safely adopts it", async () => {
    const fixture = committedThenRejectedAdapter("p10-save-as-retry");
    fixture.setRecovery(null);
    const { controller } = configuredController(fixture.adapter);
    const document = await controller.newDocument({ documentId: "p10-save-as-retry", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "draft" }), { actionName: "Edit" });
    const destination = remoteLocation("retry");

    await expect(controller.saveAsDocument({ documentId: document.id, destination })).rejects.toMatchObject({
      code: "document-write-outcome-unknown",
    });
    expect(fixture.writes()).toBe(1);
    await expect(controller.saveAsDocument({ documentId: document.id, destination })).rejects.toMatchObject({
      code: "document-write-outcome-unknown",
    });
    expect(fixture.writes()).toBe(1);

    fixture.setRecovery(remoteRecord(destination, { title: "Untitled", body: "draft" }));
    await expect(controller.saveAsDocument({ documentId: document.id, destination })).resolves.toMatchObject({
      documentId: document.id,
      location: destination,
    });
    expect(fixture.writes()).toBe(1);
    expect(document.location).toEqual(destination);
  });

  it("keeps cancellation truthful after a confirmed recovery and compensates only the proven write", async () => {
    const fixture = committedThenRejectedAdapter("p10-save-as-cancel");
    const abort = new AbortController();
    const originalRecover = fixture.adapter.recoverWriteByIdempotencyKey!;
    fixture.adapter.recoverWriteByIdempotencyKey = async (request) => {
      const record = await originalRecover(request);
      abort.abort("user cancelled after send");
      return record;
    };
    const { controller } = configuredController(fixture.adapter);
    const document = await controller.newDocument({ documentId: "p10-save-as-cancel", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "draft" }), { actionName: "Edit" });
    const destination = remoteLocation("cancel");

    await expect(controller.saveAsDocument({ documentId: document.id, destination, signal: abort.signal })).rejects.toMatchObject({
      code: "document-aborted",
    });
    expect(document.location).toBeNull();
    expect(document.state).toBe("dirty");
    expect(fixture.remove).toHaveBeenCalledTimes(1);
  });

  it("does not reuse an indeterminate write through a replaced adapter generation", async () => {
    const first = committedThenRejectedAdapter("p10-save-as-replacement");
    first.setRecovery(null);
    const { controller, registration } = configuredController(first.adapter);
    const document = await controller.newDocument({ documentId: "p10-save-as-replacement", typeId: noteType.id });
    const destination = remoteLocation("replacement");
    await expect(controller.saveAsDocument({ documentId: document.id, destination })).rejects.toMatchObject({
      code: "document-write-outcome-unknown",
    });
    registration.dispose();
    const replacement = committedThenRejectedAdapter("p10-save-as-replacement");
    controller.registerAdapter(replacement.adapter);

    await expect(controller.saveAsDocument({ documentId: document.id, destination })).rejects.toMatchObject({
      code: "document-write-outcome-unknown",
    });
    expect(replacement.writes()).toBe(0);
    expect(document.location).toBeNull();
  });

  it("recovers a PUT which committed before its response was lost, even when the original caller signal is aborted", async () => {
    const destination = remoteLocation("transport");
    let committed: DocumentRecord<NoteDocumentModel> | null = null;
    const requests: DocumentRemoteRequest[] = [];
    const adapter = new RemoteDocumentAdapter({
      request: async (request) => {
        requests.push(request);
        if (request.method === "PUT") {
          const body = request.body as { readonly typeId: string; readonly schemaVersion: number; readonly content: NoteDocumentModel; readonly metadata: Record<string, string> };
          committed = remoteRecord(destination, body.content);
          throw new Error("connection reset after remote commit");
        }
        if (request.method === "GET") {
          return { status: committed ? 200 : 404, headers: { "Idempotency-Key": request.headers["Idempotency-Key"] ?? "" }, body: committed };
        }
        throw new Error("unexpected transport request");
      },
    });
    const abort = new AbortController();
    const request = {
      location: destination,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: "Untitled", body: "transport" },
      expectedVersion: null,
      idempotencyKey: "p10-commit-then-reject",
      signal: abort.signal,
    } as const;

    await expect(adapter.write(request)).rejects.toMatchObject({ code: "document-write-outcome-unknown" });
    abort.abort("caller gave up");
    await expect(adapter.recoverWriteByIdempotencyKey(request)).resolves.toMatchObject({ content: { body: "transport" } });
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1]!.url).searchParams.get("idempotencyKey")).toBe(request.idempotencyKey);
    expect(requests[1]!.headers["Idempotency-Key"]).toBe(request.idempotencyKey);
    expect(requests[1]!.signal).toBeUndefined();
  });

  it("does not recover a byte-identical record unless the provider attributes it to the idempotency key", async () => {
    const destination = remoteLocation("transport-unattributed");
    const adapter = new RemoteDocumentAdapter({
      request: async (request) => {
        if (request.method === "PUT") throw new Error("connection reset after remote commit");
        if (request.method === "GET") {
          return {
            status: 200,
            headers: {},
            body: remoteRecord(destination, { title: "Untitled", body: "identical" }),
          };
        }
        throw new Error("unexpected transport request");
      },
    });
    const request = {
      location: destination,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: "Untitled", body: "identical" },
      expectedVersion: null,
      idempotencyKey: "p10-unattributed-identical",
    } as const;

    await expect(adapter.write(request)).rejects.toMatchObject({ code: "document-write-outcome-unknown" });
    await expect(adapter.recoverWriteByIdempotencyKey(request)).resolves.toBeNull();
  });

  it.each([408, 503])("keeps a post-send %i Save As indeterminate until idempotency recovery proves the destination", async (status) => {
    const destination = remoteLocation(`transport-${status}`);
    let committed: DocumentRecord<NoteDocumentModel> | null = null;
    let recoveryAvailable = false;
    let writes = 0;
    const adapter = new RemoteDocumentAdapter({
      request: async (request) => {
        if (request.method === "PUT") {
          writes += 1;
          const body = request.body as { readonly content: NoteDocumentModel };
          committed = remoteRecord(destination, body.content);
          return { status, headers: {}, body: null };
        }
        if (request.method === "GET") {
          const recovering = new URL(request.url).searchParams.has("idempotencyKey");
          return recovering && recoveryAvailable && committed
            ? { status: 200, headers: { "Idempotency-Key": request.headers["Idempotency-Key"] ?? "" }, body: committed }
            : { status: 404, headers: {}, body: null };
        }
        throw new Error("unexpected transport request");
      },
    });
    const { controller } = configuredController(adapter);
    const document = await controller.newDocument({ documentId: `p10-save-as-${status}`, typeId: noteType.id });
    document.update((model) => ({ ...model, body: `committed behind ${status}` }), { actionName: "Edit" });

    await expect(controller.saveAsDocument({ documentId: document.id, destination })).rejects.toMatchObject({
      code: "document-write-outcome-unknown",
    });
    expect(document.location).toBeNull();
    expect(writes).toBe(1);

    recoveryAvailable = true;
    await expect(controller.saveAsDocument({ documentId: document.id, destination })).resolves.toMatchObject({ location: destination });
    expect(writes).toBe(1);
  });

  it("does not mistake a conflicting external replacement for an idempotent remote recovery", async () => {
    const destination = remoteLocation("transport-conflict");
    const adapter = new RemoteDocumentAdapter({
      request: async (request) => {
        if (request.method === "PUT") throw new Error("connection reset after remote commit");
        if (request.method === "GET") {
          return {
            status: 200,
            headers: {},
            body: remoteRecord(destination, { title: "External", body: "other writer" }, 2),
          };
        }
        throw new Error("unexpected transport request");
      },
    });
    const request = {
      location: destination,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: "Untitled", body: "expected" },
      expectedVersion: null,
      idempotencyKey: "p10-external-replacement",
    } as const;

    await expect(adapter.write(request)).rejects.toMatchObject({ code: "document-write-outcome-unknown" });
    await expect(adapter.recoverWriteByIdempotencyKey(request)).resolves.toBeNull();
  });
});
