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

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  createBrowserFilePanelAdapter,
  createDownloadFilePanelAdapter,
  createFilePanelService,
  createFileSystemAccessPanelAdapter,
  FilePanelReferenceError,
  mapFilePanelBrowserException,
  normalizeFilePanelAcceptTypes,
  type FilePanelAdapter,
  type FilePanelFileHandle,
  type FilePanelReference,
} from "../../src/SynCloudOS/FilePanels";

function testFile(name: string, type = "image/png"): File {
  return Object.assign(new Blob(["file"], { type }), { name, lastModified: 42 }) as File;
}

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

function selectedReference(id: string, requestId: string): FilePanelReference & { readonly release: ReturnType<typeof vi.fn> } {
  let released = false;
  const release = vi.fn(() => { released = true; });
  return {
    kind: "ephemeral-file",
    id,
    name: `${id}.txt`,
    issuedByRequestId: requestId,
    capabilities: ["read"],
    get released() { return released; },
    release,
    file: testFile(`${id}.txt`, "text/plain"),
    mediaType: "text/plain",
    size: 4,
    lastModified: 1,
    lifetime: "runtime-memory",
    permission: "granted",
    read: async () => testFile(`${id}.txt`, "text/plain"),
  };
}

const readOpenRequest = (id: string, validateContent?: NonNullable<import("../../src/SynCloudOS/FilePanels").OpenPanelRequest["validateContent"]>) => ({
  id,
  accepts: [],
  selection: "single-file" as const,
  access: "read" as const,
  requires: [],
  validateContent,
});

function fileHandle(name: string) {
  let permission: "prompt" | "granted" | "denied" = "prompt";
  const writable = {
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  const handle: FilePanelFileHandle = {
    kind: "file",
    name,
    getFile: vi.fn(async () => testFile(name, "text/plain")),
    createWritable: vi.fn(async () => writable),
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => {
      permission = "granted";
      return permission;
    }),
  };
  return {
    handle,
    writable,
    revoke() { permission = "denied"; },
  };
}

const imageAccepts = [{
  description: " Images ",
  mimeTypes: ["IMAGE/PNG", "image/png", "image/*"],
  extensions: [".PNG", ".png", ".JPG"],
}] as const;

describe("FilePanelService", () => {
  it("rejects accessor-backed and invalid request shapes before adapter code observes them", async () => {
    const adapter: FilePanelAdapter = {
      id: "must-not-run",
      capabilities: new Set(["read"]),
      supports: vi.fn(() => true),
      open: vi.fn(),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);
    let getterReads = 0;
    const hostile = {
      accepts: [],
      selection: "not-a-selection",
      access: "read",
      requires: [],
    } as Record<string, unknown>;
    Object.defineProperty(hostile, "id", {
      enumerable: true,
      get() { getterReads += 1; return "hostile"; },
    });

    await expect(service.open(hostile as never)).resolves.toMatchObject({ kind: "error" });
    expect(getterReads).toBe(0);
    expect(adapter.supports).not.toHaveBeenCalled();
    expect(adapter.open).not.toHaveBeenCalled();
  });

  it("recursively rejects nested accessors, sparse arrays, and invalid requirements without executing them", async () => {
    const adapter: FilePanelAdapter = {
      id: "must-not-run-recursive",
      capabilities: new Set(["read"]),
      supports: vi.fn(() => true),
      open: vi.fn(),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);
    let getterReads = 0;
    const hostileAccept = Object.create(null) as Record<string, unknown>;
    for (const key of ["description", "mimeTypes", "extensions"]) {
      Object.defineProperty(hostileAccept, key, {
        enumerable: true,
        get() { getterReads += 1; return key === "description" ? "Images" : []; },
      });
    }
    const hostileRequires: unknown[] = [];
    Object.defineProperty(hostileRequires, "0", {
      enumerable: true,
      configurable: true,
      get() { getterReads += 1; return "read"; },
    });
    hostileRequires.length = 1;

    await expect(service.open({ ...readOpenRequest("nested-acceptor"), accepts: [hostileAccept] } as never)).resolves.toMatchObject({ kind: "error" });
    await expect(service.open({ ...readOpenRequest("nested-requires"), requires: hostileRequires } as never)).resolves.toMatchObject({ kind: "error" });
    await expect(service.open({ ...readOpenRequest("sparse-accepts"), accepts: new Array(1) } as never)).resolves.toMatchObject({ kind: "error" });
    await expect(service.open({ ...readOpenRequest("invalid-requires"), requires: ["ambient-superuser"] } as never)).resolves.toMatchObject({ kind: "error" });

    expect(getterReads).toBe(0);
    expect(adapter.supports).not.toHaveBeenCalled();
    expect(adapter.open).not.toHaveBeenCalled();
  });

  it("maps browser exceptions through one redacted result helper", () => {
    expect(mapFilePanelBrowserException(Object.assign(new Error("user denied a local handle"), { name: "NotAllowedError" }))).toEqual({
      kind: "denied",
      reason: "permission",
      message: "The browser did not grant file access.",
    });
    expect(mapFilePanelBrowserException(Object.assign(new Error("insecure origin"), { name: "SecurityError" }))).toEqual({
      kind: "unavailable",
      missingCapabilities: [],
      message: "The browser file capability is unavailable in this context.",
    });
    expect(mapFilePanelBrowserException(new Error("C:\\private\\path\\secret.txt"))).toEqual({
      kind: "error",
      message: "The file-panel operation could not be completed.",
    });
  });

  it("normalizes accepts and returns explicit ephemeral runtime-memory references for browser input", async () => {
    expect(normalizeFilePanelAcceptTypes(imageAccepts)).toEqual([{
      description: "Images",
      mimeTypes: ["image/png", "image/*"],
      extensions: [".png", ".jpg"],
    }]);
    expect(() => normalizeFilePanelAcceptTypes([{ description: "Bad", mimeTypes: ["*/png"], extensions: [".png"] }])).toThrow(/wildcard/i);

    const browser = createBrowserFilePanelAdapter({
      id: "browser-input",
      pickFiles: vi.fn(async () => ({ kind: "accepted" as const, files: [testFile("cover.png"), testFile("poster.png")], cleanup: () => undefined })),
    });
    const service = createFilePanelService([browser]);
    const result = await service.open({
      id: "open-images",
      accepts: imageAccepts,
      selection: "multiple-files",
      access: "read",
      requires: [],
    });

    expect(result).toEqual({
      kind: "accepted",
      values: [
        expect.objectContaining({ kind: "ephemeral-file", name: "cover.png", lifetime: "runtime-memory", permission: "granted", capabilities: ["read", "multiple-selection"] }),
        expect.objectContaining({ kind: "ephemeral-file", name: "poster.png", lifetime: "runtime-memory", permission: "granted", capabilities: ["read", "multiple-selection"] }),
      ],
    });
    if (result.kind !== "accepted") throw new Error("expected file selection");
    const reference = result.values[0]!;
    service.release(reference, "test-complete");
    await expect(reference.read()).rejects.toMatchObject({ code: "reference-released" });
  });

  it("requires a secure, user-activated File System Access picker and maps a revoked formerly-granted wrapper", async () => {
    const selected = fileHandle("editable.txt");
    const port = {
      isSecureContext: () => true,
      hasTransientUserActivation: () => true,
      openFiles: vi.fn(async () => [selected.handle]),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    };
    const service = createFilePanelService([createFileSystemAccessPanelAdapter(port)]);
    const result = await service.open({
      id: "open-editable",
      accepts: [{ description: "Text", mimeTypes: ["text/plain"], extensions: [".txt"] }],
      selection: "single-file",
      access: "readwrite",
      requires: ["persistent-handle"],
    });

    if (result.kind !== "accepted") throw new Error("expected persistent file handle");
    const reference = result.values[0]!;
    expect(reference.kind).toBe("file-handle");
    if (reference.kind !== "file-handle") throw new Error("expected file handle");
    expect(await reference.queryPermission()).toBe("prompt");
    expect(await reference.requestPermission()).toBe("granted");
    expect(await reference.read()).toMatchObject({ name: "editable.txt" });
    selected.revoke();
    expect(await reference.queryPermission()).toBe("revoked");
    await expect(reference.read()).rejects.toMatchObject({ code: "permission-revoked" });

    const insecure = createFilePanelService([createFileSystemAccessPanelAdapter({
      ...port,
      isSecureContext: () => false,
    })]);
    await expect(insecure.open({
      id: "insecure",
      accepts: [],
      selection: "single-file",
      access: "readwrite",
      requires: ["persistent-handle"],
    })).resolves.toMatchObject({ kind: "unavailable" });
    expect(port.openFiles).toHaveBeenCalledTimes(1);
  });

  it("keeps a read-only File System Access reference read-only without permission escalation or writable authority", async () => {
    const selected = fileHandle("read-only.txt");
    const service = createFilePanelService([createFileSystemAccessPanelAdapter({
      isSecureContext: () => true,
      hasTransientUserActivation: () => true,
      openFiles: vi.fn(async () => [selected.handle]),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    })]);

    const result = await service.open(readOpenRequest("read-only"));
    if (result.kind !== "accepted" || result.values[0]?.kind !== "file-handle") throw new Error("expected read-only handle");
    const reference = result.values[0];
    expect(reference.capabilities).toEqual(["read", "persistent-handle"]);
    expect("createWritable" in reference).toBe(false);
    await reference.queryPermission();
    await reference.requestPermission();
    expect(selected.handle.queryPermission).toHaveBeenCalledWith({ mode: "read" });
    expect(selected.handle.requestPermission).toHaveBeenCalledWith({ mode: "read" });
    expect(selected.handle.createWritable).not.toHaveBeenCalled();
  });

  it("does not turn a selected handle's permission request into a background prompt", async () => {
    const selected = fileHandle("needs-activation.txt");
    let active = true;
    const service = createFilePanelService([createFileSystemAccessPanelAdapter({
      isSecureContext: () => true,
      hasTransientUserActivation: () => active,
      openFiles: vi.fn(async () => [selected.handle]),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    })]);
    const result = await service.open({
      id: "permission-activation",
      accepts: [],
      selection: "single-file",
      access: "readwrite",
      requires: ["persistent-handle"],
    });
    if (result.kind !== "accepted" || result.values[0]?.kind !== "file-handle") throw new Error("expected persistent file handle");

    active = false;
    await expect(result.values[0].requestPermission()).rejects.toMatchObject({ code: "permission-required" });
    expect(selected.handle.requestPermission).not.toHaveBeenCalled();

    active = true;
    await expect(result.values[0].requestPermission()).resolves.toBe("granted");
    expect(selected.handle.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("does not route directory/write requests through browser input and uses a write-only download export fallback", async () => {
    const browser = createBrowserFilePanelAdapter({
      id: "browser-input",
      pickFiles: vi.fn(),
    });
    const download = createDownloadFilePanelAdapter({
      id: "download",
      export: vi.fn(async (payload) => ({ kind: "exported" as const, fileName: payload.fileName })),
    });
    const service = createFilePanelService([browser, download]);
    await expect(service.open({
      id: "directory",
      accepts: [],
      selection: "single-directory",
      access: "read",
      requires: [],
    })).resolves.toMatchObject({ kind: "unavailable", missingCapabilities: expect.arrayContaining(["directory"]) });
    expect(browser.id).toBe("browser-input");

    const save = await service.save({
      id: "download-copy",
      accepts: [{ description: "Text", mimeTypes: ["text/plain"], extensions: [".txt"] }],
      suggestedName: "copy.txt",
      destination: "handle-or-download",
      conflictPolicy: "fail-if-exists",
    });
    if (save.kind !== "accepted") throw new Error("expected download destination");
    const target = save.values[0]!;
    expect(target).toMatchObject({ kind: "download-export", exists: false, suggestedName: "copy.txt" });
    await expect(target.sink.write({ fileName: "copy.txt", mediaType: "text/plain", blob: new Blob(["copy"]) })).resolves.toEqual({ kind: "exported", fileName: "copy.txt" });
  });

  it("rejects content by the supplied validator rather than selected name or MIME metadata", async () => {
    const browser = createBrowserFilePanelAdapter({
      pickFiles: vi.fn(async () => ({ kind: "accepted" as const, files: [testFile("pretends-to-be-image.png", "image/png")], cleanup: () => undefined })),
    });
    const service = createFilePanelService([browser]);
    const result = await service.open({
      id: "validated-open",
      accepts: imageAccepts,
      selection: "single-file",
      access: "read",
      requires: [],
      validateContent: async () => ({ ok: false as const, message: "The bytes do not contain a supported image." }),
    });
    expect(result).toEqual({ kind: "denied", reason: "policy", message: "The bytes do not contain a supported image." });
  });

  it("does not prompt or open a File System Access picker outside transient activation", async () => {
    const port = {
      isSecureContext: () => true,
      hasTransientUserActivation: () => false,
      openFiles: vi.fn(),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    };
    const service = createFilePanelService([createFileSystemAccessPanelAdapter(port)]);
    await expect(service.open({
      id: "background-open",
      accepts: [],
      selection: "single-file",
      access: "read",
      requires: ["persistent-handle"],
    })).resolves.toMatchObject({ kind: "denied", reason: "policy" });
    expect(port.openFiles).not.toHaveBeenCalled();
    expect(port.openDirectory).not.toHaveBeenCalled();
  });

  it("requires an explicit replace decision before accepting an existing save target", async () => {
    const sink = { kind: "file-handle-export" as const, write: vi.fn() };
    const target = { kind: "file-handle" as const, exists: true, reference: { name: "existing.txt" } as never, sink };
    const confirmConflict = vi.fn(async () => "choose-another" as const);
    const service = createFilePanelService([]);
    const result = await service.save({
      id: "existing-save",
      accepts: [],
      suggestedName: "existing.txt",
      destination: "persistent-handle-required",
      existingTarget: target,
      conflictPolicy: "confirm-replace",
      confirmConflict,
    });
    expect(result).toEqual({ kind: "choose-another" });
    expect(confirmConflict).toHaveBeenCalledWith(expect.objectContaining({ kind: "existing-file", displayName: "existing.txt" }), expect.any(AbortSignal));
    expect(sink.write).not.toHaveBeenCalled();
  });

  it("maps adapter permission errors and releases retained wrappers exactly once on disposal", async () => {
    const permissionError = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    const deniedAdapter: FilePanelAdapter = {
      id: "denied",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: vi.fn(async () => { throw permissionError; }),
      save: vi.fn(),
    };
    const denied = createFilePanelService([deniedAdapter]);
    await expect(denied.open({ id: "denied-open", accepts: [], selection: "single-file", access: "read", requires: [] })).resolves.toMatchObject({ kind: "denied", reason: "permission" });

    const release = vi.fn();
    const retained: FilePanelReference = {
      kind: "ephemeral-file",
      id: "retained:0",
      name: "retained.txt",
      issuedByRequestId: "retained-open",
      capabilities: ["read"],
      released: false,
      release,
      file: testFile("retained.txt", "text/plain"),
      mediaType: "text/plain",
      size: 4,
      lastModified: 1,
      lifetime: "runtime-memory",
      permission: "granted",
      read: async () => testFile("retained.txt", "text/plain"),
    };
    const retainedAdapter: FilePanelAdapter = {
      id: "retained",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: vi.fn(async () => ({ kind: "accepted" as const, values: [retained] })),
      save: vi.fn(),
    };
    const retainedService = createFilePanelService([retainedAdapter]);
    await retainedService.open({ id: "retained-open", accepts: [], selection: "single-file", access: "read", requires: [] });
    retainedService.dispose();
    retainedService.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("runtime-disposed");
  });

  it("aborts and releases a replaced request and fences its late accepted result", async () => {
    const resolvers: Array<(result: { readonly kind: "accepted"; readonly values: readonly FilePanelReference[] }) => void> = [];
    const lateReference = {
      id: "late:0",
      name: "late.txt",
      issuedByRequestId: "replaced",
      capabilities: ["read"] as const,
      get released() { return false; },
      release: vi.fn(),
      kind: "ephemeral-file" as const,
      file: testFile("late.txt", "text/plain"),
      mediaType: "text/plain",
      size: 4,
      lastModified: 1,
      lifetime: "runtime-memory" as const,
      permission: "granted" as const,
      read: vi.fn(async () => testFile("late.txt", "text/plain")),
    } satisfies FilePanelReference;
    const adapter: FilePanelAdapter = {
      id: "delayed",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: vi.fn((_request, _signal) => new Promise((resolve) => { resolvers.push(resolve); })),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);
    const first = service.open({ id: "replaced", accepts: [], selection: "single-file", access: "read", requires: [] });
    const second = service.open({ id: "replaced", accepts: [], selection: "single-file", access: "read", requires: [] });
    resolvers[0]!({ kind: "accepted", values: [lateReference] });
    await expect(first).resolves.toMatchObject({ kind: "interrupted" });
    expect(lateReference.release).toHaveBeenCalledWith("request-replaced");
    resolvers[1]!({ kind: "accepted", values: [] });
    await expect(second).resolves.toMatchObject({ kind: "accepted" });
  });

  it("releases every accepted wrapper if content validation throws", async () => {
    const reference = selectedReference("validator-throws:0", "validator-throws");
    const adapter: FilePanelAdapter = {
      id: "validator-throws",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: async () => ({ kind: "accepted", values: [reference] }),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);

    await expect(service.open(readOpenRequest("validator-throws", async () => {
      throw new Error("validator exploded");
    }))).resolves.toEqual({ kind: "error", message: "The file-panel operation could not be completed." });
    expect(reference.release).toHaveBeenCalledTimes(1);
    expect(reference.release).toHaveBeenCalledWith("caller-finished");
  });

  it("releases accepted wrappers when a noncooperative validator completes after caller abort", async () => {
    const validationStarted = deferred<void>();
    const validation = deferred<{ readonly ok: true }>();
    const reference = selectedReference("caller-abort:0", "caller-abort");
    const adapter: FilePanelAdapter = {
      id: "caller-abort",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: async () => ({ kind: "accepted", values: [reference] }),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);
    const controller = new AbortController();
    const pending = service.open(readOpenRequest("caller-abort", async () => {
      validationStarted.resolve();
      return validation.promise;
    }), controller.signal);

    await validationStarted.promise;
    controller.abort();
    validation.resolve({ ok: true });
    await expect(pending).resolves.toEqual({ kind: "interrupted", message: "The file-panel request was interrupted." });
    expect(reference.release).toHaveBeenCalledTimes(1);
    expect(reference.release).toHaveBeenCalledWith("caller-finished");
  });

  it("releases accepted wrappers with request-replaced when validation resolves after a replacement", async () => {
    const validationStarted = deferred<void>();
    const validation = deferred<{ readonly ok: true }>();
    const firstReference = selectedReference("replacement-validation:0", "replacement-validation");
    let openCount = 0;
    const adapter: FilePanelAdapter = {
      id: "replacement-validation",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: vi.fn(async () => ({
        kind: "accepted" as const,
        values: ++openCount === 1 ? [firstReference] : [],
      })),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);
    const first = service.open(readOpenRequest("replacement-validation", async () => {
      validationStarted.resolve();
      return validation.promise;
    }));
    await validationStarted.promise;
    const second = service.open(readOpenRequest("replacement-validation"));
    validation.resolve({ ok: true });

    await expect(first).resolves.toEqual({ kind: "interrupted", message: "The file-panel request was replaced." });
    await expect(second).resolves.toEqual({ kind: "accepted", values: [] });
    expect(firstReference.release).toHaveBeenCalledTimes(1);
    expect(firstReference.release).toHaveBeenCalledWith("request-replaced");
  });

  it("releases accepted wrappers with runtime-disposed when validation completes after disposal", async () => {
    const validationStarted = deferred<void>();
    const validation = deferred<{ readonly ok: true }>();
    const reference = selectedReference("dispose-validation:0", "dispose-validation");
    const adapter: FilePanelAdapter = {
      id: "dispose-validation",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: async () => ({ kind: "accepted", values: [reference] }),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);
    const pending = service.open(readOpenRequest("dispose-validation", async () => {
      validationStarted.resolve();
      return validation.promise;
    }));

    await validationStarted.promise;
    service.dispose();
    validation.resolve({ ok: true });
    await expect(pending).resolves.toEqual({ kind: "interrupted", message: "The file-panel request was interrupted." });
    expect(reference.release).toHaveBeenCalledTimes(1);
    expect(reference.release).toHaveBeenCalledWith("runtime-disposed");
  });

  it("continues in configured adapter order when an insecure File System Access open is unavailable", async () => {
    const fsaPort = {
      isSecureContext: () => false,
      hasTransientUserActivation: () => true,
      openFiles: vi.fn(),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    };
    const browserPick = vi.fn(async () => ({ kind: "accepted" as const, files: [testFile("fallback.txt", "text/plain")], cleanup: () => undefined }));
    const service = createFilePanelService([
      createFileSystemAccessPanelAdapter(fsaPort),
      createBrowserFilePanelAdapter({ pickFiles: browserPick }),
    ]);

    await expect(service.open(readOpenRequest("insecure-fallback"))).resolves.toMatchObject({
      kind: "accepted",
      values: [expect.objectContaining({ kind: "ephemeral-file", name: "fallback.txt" })],
    });
    expect(browserPick).toHaveBeenCalledTimes(1);
  });

  it("continues from an unavailable File System Access save to the explicit download export", async () => {
    const fsaPort = {
      isSecureContext: () => false,
      hasTransientUserActivation: () => true,
      openFiles: vi.fn(),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    };
    const downloadExport = vi.fn(async (payload: { readonly fileName: string }) => ({ kind: "exported" as const, fileName: payload.fileName }));
    const service = createFilePanelService([
      createFileSystemAccessPanelAdapter(fsaPort),
      createDownloadFilePanelAdapter({ export: downloadExport }),
    ]);

    await expect(service.save({
      id: "insecure-save-fallback",
      accepts: [],
      suggestedName: "copy.txt",
      destination: "handle-or-download",
      conflictPolicy: "fail-if-exists",
    })).resolves.toMatchObject({ kind: "accepted", values: [expect.objectContaining({ kind: "download-export" })] });
    expect(fsaPort.saveFile).not.toHaveBeenCalled();
  });

  it("continues after a feature-unavailable File System Access adapter but never after a policy denial", async () => {
    const browserPick = vi.fn(async () => ({ kind: "accepted" as const, files: [testFile("feature-fallback.txt", "text/plain")], cleanup: () => undefined }));
    const unavailablePort = {
      isSecureContext: () => true,
      isAvailable: () => false,
      hasTransientUserActivation: () => true,
      openFiles: vi.fn(async () => []),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    };
    const unavailableService = createFilePanelService([
      createFileSystemAccessPanelAdapter(unavailablePort),
      createBrowserFilePanelAdapter({ pickFiles: browserPick }),
    ]);
    await expect(unavailableService.open(readOpenRequest("feature-fallback"))).resolves.toMatchObject({ kind: "accepted" });
    expect(browserPick).toHaveBeenCalledTimes(1);

    const deniedPick = vi.fn(async () => ({ kind: "accepted" as const, files: [testFile("must-not-open.txt", "text/plain")], cleanup: () => undefined }));
    const deniedService = createFilePanelService([
      createFileSystemAccessPanelAdapter({
        isSecureContext: () => true,
        hasTransientUserActivation: () => false,
        openFiles: vi.fn(),
        openDirectory: vi.fn(),
        saveFile: vi.fn(),
      }),
      createBrowserFilePanelAdapter({ pickFiles: deniedPick }),
    ]);
    await expect(deniedService.open(readOpenRequest("policy-denied-no-fallback"))).resolves.toMatchObject({ kind: "denied", reason: "policy" });
    expect(deniedPick).not.toHaveBeenCalled();
  });

  it("maps a revoked reference raised by content validation to its typed redacted result", async () => {
    const reference = selectedReference("revoked-validation:0", "revoked-validation");
    const adapter: FilePanelAdapter = {
      id: "revoked-validation",
      capabilities: new Set(["read"]),
      supports: () => true,
      open: async () => ({ kind: "accepted", values: [reference] }),
      save: vi.fn(),
    };
    const service = createFilePanelService([adapter]);

    await expect(service.open(readOpenRequest("revoked-validation", async () => {
      throw new FilePanelReferenceError("permission-revoked", "C:\\private\\unredacted.txt");
    }))).resolves.toEqual({
      kind: "revoked",
      referenceId: "revoked-validation:0",
      message: "File permission was revoked.",
    });
    expect(reference.release).toHaveBeenCalledWith("caller-finished");
  });

  it("returns a typed choose-another continuation without retaining the rejected target", async () => {
    const reference = selectedReference("choose-another:0", "choose-another");
    const target = {
      kind: "file-handle" as const,
      reference: { ...reference, kind: "file-handle" as const, lifetime: "browser-permission" as const, handle: {} as never, queryPermission: async () => "granted" as const, requestPermission: async () => "granted" as const, createWritable: async () => ({ write: async () => undefined, close: async () => undefined, abort: async () => undefined }) } as Extract<import("../../src/SynCloudOS/FilePanels").FilePanelReference, { readonly kind: "file-handle" }>,
      sink: { kind: "file-handle-export" as const, write: vi.fn() },
      exists: true,
    };
    const adapter: FilePanelAdapter = {
      id: "choose-another",
      capabilities: new Set(["write", "persistent-handle"]),
      supports: () => true,
      open: vi.fn(),
      save: vi.fn(async () => ({ kind: "accepted" as const, values: [target] })),
    };
    const service = createFilePanelService([adapter]);

    await expect(service.save({
      id: "choose-another",
      accepts: [],
      suggestedName: "existing.txt",
      destination: "persistent-handle-required",
      conflictPolicy: "confirm-replace",
      confirmConflict: async () => "choose-another",
    })).resolves.toEqual({ kind: "choose-another" });
    expect(target.reference.release).toHaveBeenCalledTimes(1);
    expect(target.reference.release).toHaveBeenCalledWith("caller-finished");
    expect(target.sink.write).not.toHaveBeenCalled();
  });

  it("returns committed success when abort arrives only after backend close commits", async () => {
    const controller = new AbortController();
    const selected = fileHandle("close-race.txt");
    await selected.handle.requestPermission({ mode: "readwrite" });
    const abort = vi.fn(async () => { throw new Error("secondary cleanup failure"); });
    selected.handle.createWritable = vi.fn(async () => ({
      write: async () => undefined,
      close: async () => { controller.abort(); },
      abort,
    }));
    const service = createFilePanelService([createFileSystemAccessPanelAdapter({
      isSecureContext: () => true,
      hasTransientUserActivation: () => true,
      openFiles: vi.fn(),
      openDirectory: vi.fn(),
      saveFile: vi.fn(async () => ({ handle: selected.handle, exists: false })),
    })]);
    const selectedTarget = await service.save({
      id: "close-race",
      accepts: [],
      suggestedName: "close-race.txt",
      destination: "persistent-handle-required",
      conflictPolicy: "fail-if-exists",
    });
    if (selectedTarget.kind !== "accepted") throw new Error("expected selected target");

    await expect(selectedTarget.values[0]!.sink.write({ fileName: "close-race.txt", mediaType: "text/plain", blob: new Blob(["copy"]) }, controller.signal)).resolves.toEqual({ kind: "exported", fileName: "close-race.txt" });
    expect(abort).not.toHaveBeenCalled();
  });

  it("does not let a writable rollback failure replace an abort immediately after backend creation", async () => {
    const controller = new AbortController();
    const selected = fileHandle("create-race.txt");
    await selected.handle.requestPermission({ mode: "readwrite" });
    const abort = vi.fn(async () => { throw new Error("secondary rollback failure"); });
    selected.handle.createWritable = vi.fn(async () => {
      controller.abort();
      return { write: async () => undefined, close: async () => undefined, abort };
    });
    const service = createFilePanelService([createFileSystemAccessPanelAdapter({
      isSecureContext: () => true,
      hasTransientUserActivation: () => true,
      openFiles: vi.fn(async () => [selected.handle]),
      openDirectory: vi.fn(),
      saveFile: vi.fn(),
    })]);
    const opened = await service.open({
      id: "create-race",
      accepts: [],
      selection: "single-file",
      access: "readwrite",
      requires: ["persistent-handle"],
    });
    if (opened.kind !== "accepted" || opened.values[0]?.kind !== "file-handle") throw new Error("expected selected handle");

    await expect(opened.values[0].createWritable(controller.signal)).rejects.toMatchObject({ code: "operation-aborted" });
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("settles the injected detached-input contract for accepted, cancelled, aborted, replaced, and disposed requests", async () => {
    interface PickerSession {
      readonly input: HTMLInputElement;
      accept(file: File): void;
      cancel(): void;
    }
    const sessions: PickerSession[] = [];
    const pickerPort = {
      pickFiles: vi.fn((_request, signal) => new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.dataset.filePanelDetachedInput = "true";
        document.body.append(input);
        let settled = false;
        const cleanup = () => input.remove();
        const settle = (selection: { readonly kind: "accepted"; readonly files: readonly File[] } | { readonly kind: "cancelled" }) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          const index = sessions.indexOf(session);
          if (index >= 0) sessions.splice(index, 1);
          resolve({ ...selection, cleanup });
        };
        const onAbort = () => {
          cleanup();
          settle({ kind: "cancelled" });
        };
        signal.addEventListener("abort", onAbort, { once: true });
        const session: PickerSession = {
          input,
          accept: (file) => settle({ kind: "accepted", files: [file] }),
          cancel: () => settle({ kind: "cancelled" }),
        };
        sessions.push(session);
      })),
    };
    const objectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    const expectNoDetachedInput = () => expect(document.querySelectorAll("input[data-file-panel-detached-input]")).toHaveLength(0);
    try {
      const acceptedService = createFilePanelService([createBrowserFilePanelAdapter(pickerPort)]);
      const accepted = acceptedService.open(readOpenRequest("detached-accepted"));
      sessions.shift()!.accept(testFile("accepted.txt", "text/plain"));
      const acceptedResult = await accepted;
      expectNoDetachedInput();
      if (acceptedResult.kind !== "accepted") throw new Error("expected accepted ephemeral wrapper");
      acceptedService.dispose();
      expect(acceptedResult.values[0]!.released).toBe(true);

      const cancelledService = createFilePanelService([createBrowserFilePanelAdapter(pickerPort)]);
      const cancelled = cancelledService.open(readOpenRequest("detached-cancelled"));
      sessions.shift()!.cancel();
      await expect(cancelled).resolves.toEqual({ kind: "cancelled" });
      expectNoDetachedInput();

      const abortService = createFilePanelService([createBrowserFilePanelAdapter(pickerPort)]);
      const abortController = new AbortController();
      const aborted = abortService.open(readOpenRequest("detached-aborted"), abortController.signal);
      abortController.abort();
      await expect(aborted).resolves.toMatchObject({ kind: "interrupted" });
      expectNoDetachedInput();

      const replacementService = createFilePanelService([createBrowserFilePanelAdapter(pickerPort)]);
      const first = replacementService.open(readOpenRequest("detached-replaced"));
      const second = replacementService.open(readOpenRequest("detached-replaced"));
      await expect(first).resolves.toMatchObject({ kind: "interrupted" });
      sessions.shift()!.cancel();
      await expect(second).resolves.toEqual({ kind: "cancelled" });
      expectNoDetachedInput();

      const disposableService = createFilePanelService([createBrowserFilePanelAdapter(pickerPort)]);
      const disposable = disposableService.open(readOpenRequest("detached-disposed"));
      disposableService.dispose();
      await expect(disposable).resolves.toMatchObject({ kind: "interrupted" });
      expectNoDetachedInput();
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      if (objectUrlDescriptor) Object.defineProperty(URL, "createObjectURL", objectUrlDescriptor);
      else delete (URL as { createObjectURL?: unknown }).createObjectURL;
      document.body.replaceChildren();
    }
  });
});
