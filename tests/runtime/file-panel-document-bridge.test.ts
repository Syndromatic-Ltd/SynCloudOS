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
import { saveFilePanelTarget, type FilePanelDocumentSaveBinding, type FilePanelSaveTarget } from "../../src/SynCloudOS/FilePanels";
import type { DocumentVersion } from "../../src/SynCloudOS/Documents";

const expectedVersion: DocumentVersion = { id: "version:4", sequence: 4, savedAt: "2026-01-01T00:00:00.000Z", etag: "four" };

function fileTarget(exists: boolean): FilePanelSaveTarget {
  return {
    kind: "file-handle",
    exists,
    reference: {
      kind: "file-handle",
      id: "handle:copy",
      name: "memo.txt",
      issuedByRequestId: "save",
      capabilities: ["read", "write", "persistent-handle"],
      released: false,
      lifetime: "browser-permission",
      permission: "granted",
      handle: {} as never,
      release: () => undefined,
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      read: async () => new File([], "memo.txt"),
      createWritable: async () => ({ write: async () => undefined, close: async () => undefined, abort: async () => undefined }),
    },
    sink: { kind: "file-handle-export", write: vi.fn(async (payload) => ({ kind: "exported" as const, fileName: payload.fileName })) },
  };
}

describe("saveFilePanelTarget", () => {
  it("uses saveAsDocument with explicit replace(expectedVersion), never ordinary save", async () => {
    const saveAsDocument = vi.fn(async () => ({ documentId: "memo-1", previousLocation: null, location: { kind: "indexed-db" as const, database: "memo", store: "documents", key: "memo-1-copy" }, version: expectedVersion }));
    const saveDocument = vi.fn();
    const binding: FilePanelDocumentSaveBinding = {
      documentId: "memo-1",
      documentController: { saveAsDocument },
      resolveDocumentDestination: async () => ({ location: { kind: "indexed-db", database: "memo", store: "documents", key: "memo-1-copy" }, expectedVersion }),
      createExportPayload: async () => ({ fileName: "memo.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }),
      confirmConflict: async () => "replace",
    };
    const signal = new AbortController().signal;

    await saveFilePanelTarget(binding, fileTarget(true), signal);
    expect(saveAsDocument).toHaveBeenCalledWith({
      documentId: "memo-1",
      destination: { kind: "indexed-db", database: "memo", store: "documents", key: "memo-1-copy" },
      conflict: { kind: "replace", expectedVersion },
      signal,
    });
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it("uses fail-if-exists for a new real destination and explicit write-only export when no DocumentLocation exists", async () => {
    const saveAsDocument = vi.fn(async () => ({ documentId: "memo-1", previousLocation: null, location: { kind: "memory" as const, namespace: "memo", key: "copy" }, version: expectedVersion }));
    const realBinding: FilePanelDocumentSaveBinding = {
      documentId: "memo-1",
      documentController: { saveAsDocument },
      resolveDocumentDestination: async () => ({ location: { kind: "memory", namespace: "memo", key: "copy" } }),
      createExportPayload: async () => ({ fileName: "memo.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }),
      confirmConflict: async () => "cancel",
    };
    await saveFilePanelTarget(realBinding, fileTarget(false), new AbortController().signal);
    expect(saveAsDocument).toHaveBeenCalledWith(expect.objectContaining({ conflict: { kind: "fail-if-exists" } }));

    const sink = { kind: "download-export" as const, write: vi.fn(async (payload) => ({ kind: "exported" as const, fileName: payload.fileName })) };
    const exportBinding: FilePanelDocumentSaveBinding = {
      ...realBinding,
      resolveDocumentDestination: async () => null,
    };
    const exported = await saveFilePanelTarget(exportBinding, { kind: "download-export", suggestedName: "memo.txt", exists: false, sink }, new AbortController().signal);
    expect(exported).toEqual({ kind: "exported", fileName: "memo.txt" });
    expect(sink.write).toHaveBeenCalledWith(expect.objectContaining({ fileName: "memo.txt" }), expect.any(AbortSignal));
  });

  it("does not replace when conflict confirmation chooses another or the required version is unavailable", async () => {
    const saveAsDocument = vi.fn();
    const binding: FilePanelDocumentSaveBinding = {
      documentId: "memo-1",
      documentController: { saveAsDocument },
      resolveDocumentDestination: async () => ({ location: { kind: "memory", namespace: "memo", key: "copy" } }),
      createExportPayload: async () => ({ fileName: "memo.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }),
      confirmConflict: async () => "choose-another",
    };
    await expect(saveFilePanelTarget(binding, fileTarget(true), new AbortController().signal)).resolves.toEqual({ kind: "choose-another" });
    expect(saveAsDocument).not.toHaveBeenCalled();
    await expect(saveFilePanelTarget({ ...binding, confirmConflict: async () => "replace" }, fileTarget(true), new AbortController().signal)).rejects.toThrow(/version/i);
  });

  it("returns an explicit choose-another continuation without saving or exporting the rejected destination", async () => {
    const saveAsDocument = vi.fn();
    const binding: FilePanelDocumentSaveBinding = {
      documentId: "memo-1",
      documentController: { saveAsDocument },
      resolveDocumentDestination: async () => ({ location: { kind: "memory", namespace: "memo", key: "copy" }, expectedVersion }),
      createExportPayload: async () => ({ fileName: "memo.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }),
      confirmConflict: async () => "choose-another",
    };
    const target = fileTarget(true);

    await expect(saveFilePanelTarget(binding, target, new AbortController().signal)).resolves.toEqual({ kind: "choose-another" });
    expect(saveAsDocument).not.toHaveBeenCalled();
    expect(target.sink.write).not.toHaveBeenCalled();
  });

  it("returns cancellation only for an explicit conflict cancellation", async () => {
    const saveAsDocument = vi.fn();
    const binding: FilePanelDocumentSaveBinding = {
      documentId: "memo-1",
      documentController: { saveAsDocument },
      resolveDocumentDestination: async () => ({ location: { kind: "memory", namespace: "memo", key: "copy" }, expectedVersion }),
      createExportPayload: async () => ({ fileName: "memo.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }),
      confirmConflict: async () => "cancel",
    };

    await expect(saveFilePanelTarget(binding, fileTarget(true), new AbortController().signal)).resolves.toEqual({ kind: "cancelled" });
    expect(saveAsDocument).not.toHaveBeenCalled();
  });

  it("confirms an existing unmappable export sink before creating or writing payload data", async () => {
    const target = fileTarget(true);
    const createExportPayload = vi.fn(async () => ({ fileName: "memo.txt", mediaType: "text/plain", blob: new Blob(["memo"]) }));
    const confirmConflict = vi.fn(async () => "cancel" as const);
    const binding: FilePanelDocumentSaveBinding = {
      documentId: "memo-1",
      documentController: { saveAsDocument: vi.fn() },
      resolveDocumentDestination: async () => null,
      createExportPayload,
      confirmConflict,
    };

    await expect(saveFilePanelTarget(binding, target, new AbortController().signal)).resolves.toEqual({ kind: "cancelled" });
    expect(confirmConflict).toHaveBeenCalledWith(expect.objectContaining({ kind: "existing-file", target }), expect.any(AbortSignal));
    expect(createExportPayload).not.toHaveBeenCalled();
    expect(target.sink.write).not.toHaveBeenCalled();
  });
});
