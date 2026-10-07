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
import { InMemoryDocumentAdapter, type DocumentType } from "../../src/SynCloudOS/Documents";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const appId = "mounted-admission-owner";
const typeId = "tests.mounted-admission";
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
const noteType: DocumentType<{ value: string }> = {
  id: typeId, displayName: "Admission note", schemaVersion: 1, extensions: [], mimeTypes: [],
  creatingApplicationId: appId, openingApplicationIds: [appId],
  capabilities: { versions: true, conflicts: true }, autosave: "disabled",
  create: () => ({ value: "new" }), read: (value) => structuredClone(value), write: (value) => structuredClone(value),
  validate: (value): value is { value: string } => Boolean(
    value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string",
  ),
};

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose("mounted admission cleanup");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function fixture() {
  const environment = createTestRuntimeEnvironment();
  const adapter = new InMemoryDocumentAdapter(environment);
  const runtime = createTestRuntime({ environment, applicationDocuments: { initialAdapters: [adapter] }, initialBundles: [createTestBundle({ id: appId, route: `/${appId}` })] });
  runtimes.push(runtime);
  runtime.documents.registerType(noteType);
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  const responderId = `application:${appId}`;
  runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
  const mount = (name: string) => {
    const childId = `${responderId}:${name}`;
    runtime.responders.register({ id: childId, kind: "control", parentId: responderId, scopeId: childId });
    return createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp(appId)!, responderId: childId });
  };
  return { runtime, adapter, first: mount("first"), replacement: mount("replacement"), other: mount("other") };
}

type Fixture = ReturnType<typeof fixture>;
const paths = ["new", "open", "projection", "duplicate"] as const;
type Path = typeof paths[number];
const location = (key: string) => ({ kind: "memory" as const, namespace: "mounted-admission", key });

async function admission(f: Fixture, path: Path, callerSignal?: AbortSignal) {
  const id = `admission-${path}`;
  const request = { documentId: id, typeId, initialModel: { value: "initial" }, signal: callerSignal };
  if (path === "open") {
    await f.runtime.documents.newDocument({ ...request, applicationId: appId, location: location(id) });
    await f.runtime.documents.saveDocument(id);
    await f.runtime.documents.closeDocument(id, "user");
  }
  if (path === "duplicate") {
    const source = await f.runtime.documents.newDocument({ ...request, documentId: "source", applicationId: appId });
    f.first.runtime.workspaceDocuments.retainDocument(source.id);
    f.replacement.runtime.workspaceDocuments.retainDocument(source.id);
  }
  return {
    published: () => path === "duplicate"
      ? f.runtime.documents.openDocuments.find((document) => document.id !== "source")
      : f.runtime.documents.getDocument(id),
    invoke: () => {
      switch (path) {
        case "new": return f.first.runtime.workspaceDocuments.newDocument(request);
        case "open": return f.first.runtime.workspaceDocuments.openDocument({ ...request, location: location(id) });
        case "projection": return f.first.runtime.workspaceDocuments.newProjectionDocument(request);
        case "duplicate": return f.first.runtime.workspaceDocuments.duplicateDocument("source", location(id));
      }
    },
  };
}

describe("mounted document admission", () => {
  it("permanently stales a deferred resource and old undo lease when the same document id is closed and reopened", async () => {
    const f = fixture();
    const first = await f.first.runtime.workspaceDocuments.newDocument({
      documentId: "reused-document-id", typeId, initialModel: { value: "first" },
    });
    const oldUndo = f.first.runtime.workspaceDocuments.getUndoManager(first.id);
    const bytes = deferred<ArrayBuffer>();
    const acquireDescriptor = vi.spyOn(f.runtime.documentResources, "acquire");
    const releaseDescriptor = vi.spyOn(f.runtime.documentResources, "release");
    const pendingResource = f.first.runtime.documentResources.acquire(first.id, {
      type: "image/png", size: 4, arrayBuffer: async () => bytes.promise,
    });
    const result = Promise.allSettled([pendingResource]);
    const rawAcquisition = acquireDescriptor.mock.results[0].value;

    await expect(f.first.runtime.workspaceDocuments.closeDocument(first.id, "user")).resolves.toMatchObject({ outcome: "closed" });
    const replacement = await f.first.runtime.workspaceDocuments.newDocument({
      documentId: first.id, typeId, initialModel: { value: "replacement" },
    });
    const replacementUndo = f.first.runtime.workspaceDocuments.getUndoManager(replacement.id);

    expect(() => oldUndo.canUndo).toThrow(expect.objectContaining({ name: "SecurityError" }));
    expect(replacementUndo.canUndo).toBe(false);
    bytes.resolve(new Uint8Array([137, 80, 78, 71]).buffer);
    const descriptor = await rawAcquisition;
    expect(descriptor).toMatchObject({ kind: "document-resource", documentId: first.id });
    expect((await result)[0]).toMatchObject({ status: "rejected", reason: { name: "SecurityError" } });
    expect(releaseDescriptor).toHaveBeenCalledWith(first.id, descriptor);
    expect(f.runtime.documentResources.isActive(replacement.id, descriptor)).toBe(false);
    expect(f.first.runtime.documentResources.isActive(replacement.id, descriptor)).toBe(false);

    f.first.runtime.workspaceDocuments.updateDocument(replacement.id, () => ({ value: "replacement edit" }), { actionName: "Edit replacement" });
    await expect(replacementUndo.undo()).resolves.toMatchObject({ status: "completed" });
    expect(f.runtime.documents.getDocument(replacement.id)?.model).toEqual({ value: "replacement" });
    f.first.dispose();
  });

  it.each(paths)("rejects %s revoked at publication without acquiring a late lease and compensates the orphan", async (path) => {
    const f = fixture();
    const operation = await admission(f, path);
    const acquire = vi.spyOn(f.runtime.documents, "acquireDocumentReferenceLease");
    let publishedId!: string;
    const unsubscribe = f.runtime.documents.subscribe(() => {
      const document = operation.published();
      if (!document || publishedId) return;
      publishedId = document.id;
      f.first.dispose("publication revoked the mount");
    });

    await expect(operation.invoke()).rejects.toMatchObject({ name: "AbortError" });
    unsubscribe();
    expect(publishedId).toBeTruthy();
    expect(acquire.mock.calls.filter(([id]) => id === publishedId)).toEqual([]);
    expect(f.runtime.documents.hasActiveDocumentOwnerLease(publishedId, appId)).toBe(false);
    expect(f.runtime.documents.getDocument(publishedId)).toBeNull();
  });

  it.each(paths)("preserves replacement and other owners of %s when publication revokes the old mount", async (path) => {
    const f = fixture();
    const operation = await admission(f, path);
    let publishedId!: string;
    const unsubscribe = f.runtime.documents.subscribe(() => {
      const document = operation.published();
      if (!document || publishedId) return;
      publishedId = document.id;
      f.first.dispose("old mount revoked");
      f.replacement.runtime.workspaceDocuments.retainDocument(document.id);
      f.other.runtime.workspaceDocuments.retainDocument(document.id);
    });

    await expect(operation.invoke()).rejects.toMatchObject({ name: "AbortError" });
    unsubscribe();
    expect(f.runtime.documents.hasActiveDocumentOwnerLease(publishedId, appId)).toBe(true);
    expect(f.runtime.documents.getDocument(publishedId)?.model).toEqual({ value: "initial" });
    if (path === "new") await f.replacement.runtime.workspaceDocuments.saveAsDocument({ documentId: publishedId, destination: location(publishedId) });
    await f.replacement.runtime.workspaceDocuments.releaseDocument(publishedId);
    expect(f.runtime.documents.hasActiveDocumentOwnerLease(publishedId, appId)).toBe(true);
    await f.other.runtime.workspaceDocuments.releaseDocument(publishedId);
    expect(f.runtime.documents.hasActiveDocumentOwnerLease(publishedId, appId)).toBe(false);
    expect(f.runtime.documents.getDocument(publishedId)).toBeNull();
  });

  it.each(paths)("admits and releases a current %s document normally", async (path) => {
    const f = fixture();
    const operation = await admission(f, path);
    const result = await operation.invoke();
    expect(result.model).toEqual({ value: "initial" });
    expect(f.runtime.documents.hasActiveDocumentOwnerLease(result.id, appId)).toBe(true);
    if (path === "new") await f.first.runtime.workspaceDocuments.saveAsDocument({ documentId: result.id, destination: location(result.id) });
    await f.first.runtime.workspaceDocuments.releaseDocument(result.id);
    expect(f.runtime.documents.hasActiveDocumentOwnerLease(result.id, appId)).toBe(false);
    expect(f.runtime.documents.getDocument(result.id)).toBeNull();
  });

  it.each(["new", "open", "projection"] as const)("rejects %s cancelled by its request during publication", async (path) => {
    const f = fixture();
    const caller = new AbortController();
    const operation = await admission(f, path, caller.signal);
    const acquire = vi.spyOn(f.runtime.documents, "acquireDocumentReferenceLease");
    const unsubscribe = f.runtime.documents.subscribe(() => {
      if (operation.published()) caller.abort("request withdrawn during publication");
    });

    await expect(operation.invoke()).rejects.toMatchObject({ name: "AbortError" });
    unsubscribe();
    expect(f.first.runtime.signal.aborted).toBe(false);
    expect(acquire).not.toHaveBeenCalled();
    expect(operation.published()).toBeFalsy();
  });

  it("preserves a preexisting unowned document when open activation revokes the mount", async () => {
    const f = fixture();
    const document = await f.runtime.documents.newDocument({
      documentId: "preexisting", typeId, applicationId: appId, location: location("preexisting"), initialModel: { value: "existing edits" },
    });
    const before = document.snapshot();
    const acquire = vi.spyOn(f.runtime.documents, "acquireDocumentReferenceLease");
    const unsubscribe = f.runtime.documents.subscribe(() => f.first.dispose("activation revoked mount"));
    await expect(f.first.runtime.workspaceDocuments.openDocument({ typeId, location: location("preexisting") }))
      .rejects.toMatchObject({ name: "AbortError" });
    unsubscribe();
    expect(acquire).not.toHaveBeenCalled();
    expect(f.runtime.documents.getDocument(document.id)).toBe(document);
    expect(document.snapshot()).toEqual(before);
  });

  it("does not release a preexisting mount owner when only a later open request is cancelled", async () => {
    const f = fixture();
    const document = await f.first.runtime.workspaceDocuments.newDocument({
      documentId: "owned-before-request", typeId, location: location("owned-before-request"), initialModel: { value: "retained" },
    });
    const caller = new AbortController();
    const unsubscribe = f.runtime.documents.subscribe(() => caller.abort("cancel later open"));
    await expect(f.first.runtime.workspaceDocuments.openDocument({ typeId, location: location(document.id), signal: caller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    unsubscribe();
    expect(f.runtime.documents.hasActiveDocumentOwnerLease(document.id, appId)).toBe(true);
    expect(f.first.runtime.workspaceDocuments.getDocument(document.id)?.model).toEqual({ value: "retained" });
    await f.first.runtime.workspaceDocuments.releaseDocument(document.id);
    expect(f.runtime.documents.getDocument(document.id)).toBeNull();
  });

  it("does not acquire or close a newer same-ID generation when a stale result resumes", async () => {
    const f = fixture();
    const returned = deferred<void>();
    const resume = deferred<void>();
    const original = f.runtime.documents.newDocument.bind(f.runtime.documents);
    vi.spyOn(f.runtime.documents, "newDocument").mockImplementationOnce(async (request) => {
      const document = await original(request);
      returned.resolve();
      await resume.promise;
      return document;
    });
    const pending = f.first.runtime.workspaceDocuments.newDocument({ documentId: "reused", typeId, initialModel: { value: "old" } });
    const result = Promise.allSettled([pending]);
    await returned.promise;
    f.first.dispose("old result revoked");
    await f.runtime.documents.closeDocument("reused", "user");
    const replacement = await f.runtime.documents.newDocument({ documentId: "reused", typeId, applicationId: appId, initialModel: { value: "replacement" } });
    const acquire = vi.spyOn(f.runtime.documents, "acquireDocumentReferenceLease");
    resume.resolve();
    expect((await result)[0]).toMatchObject({ status: "rejected", reason: { name: "AbortError" } });
    expect(acquire).not.toHaveBeenCalled();
    expect(f.runtime.documents.getDocument("reused")).toBe(replacement);
    expect(replacement.model).toEqual({ value: "replacement" });
  });

  it("cancels orphan compensation if a replacement owner arrives during asynchronous close review", async () => {
    const f = fixture();
    const reviewing = deferred<void>();
    const resume = deferred<"discard">();
    f.runtime.documents.registerCloseReviewer({ review: async () => { reviewing.resolve(); return resume.promise; } });
    const unsubscribe = f.runtime.documents.subscribe(() => {
      if (f.runtime.documents.getDocument("claimed-during-cleanup")) f.first.dispose("publication revoke");
    });
    const result = Promise.allSettled([f.first.runtime.workspaceDocuments.newDocument({
      documentId: "claimed-during-cleanup", typeId, initialModel: { value: "claimed" },
    })]);
    // If the baseline incorrectly succeeds, fail promptly instead of waiting
    // forever for compensation that never started.
    try {
      await Promise.race([reviewing.promise, result.then(() => expect.fail("Stale admission settled without compensation"))]);
      f.replacement.runtime.workspaceDocuments.retainDocument("claimed-during-cleanup");
      resume.resolve("discard");
      expect((await result)[0]).toMatchObject({ status: "rejected", reason: { name: "AbortError" } });
      expect(f.runtime.documents.getDocument("claimed-during-cleanup")?.model).toEqual({ value: "claimed" });
      await f.replacement.runtime.workspaceDocuments.saveAsDocument({ documentId: "claimed-during-cleanup", destination: location("claimed-during-cleanup") });
      await f.replacement.runtime.workspaceDocuments.releaseDocument("claimed-during-cleanup");
      expect(f.runtime.documents.getDocument("claimed-during-cleanup")).toBeNull();
    } finally {
      resume.resolve("discard");
      unsubscribe();
    }
  });

  it.each(["new", "open", "projection"] as const)("fences %s admission when its captured bundle generation is revoked at publication", async (path) => {
    const f = fixture();
    const operation = await admission(f, path);
    const acquire = vi.spyOn(f.runtime.documents, "acquireDocumentReferenceLease");
    let revoked = false;
    const unsubscribe = f.runtime.documents.subscribe(() => {
      if (!operation.published() || revoked) return;
      revoked = true;
      f.runtime.bundles.registerBundle(createTestBundle({ id: appId, route: `/${appId}` }), { publish: true });
    });
    await expect(operation.invoke()).rejects.toMatchObject({ name: "AbortError" });
    unsubscribe();
    expect(f.first.runtime.signal.aborted).toBe(true);
    expect(acquire).not.toHaveBeenCalled();
    expect(operation.published()).toBeFalsy();
  });

  it.each(["mount", "bundle", "application registry"] as const)("fences pending adapter I/O on %s revocation", async (revocation) => {
    const f = fixture();
    const reading = deferred<void>();
    const resume = deferred<void>();
    const original = f.adapter.read.bind(f.adapter);
    let operationSignal: AbortSignal | undefined;
    vi.spyOn(f.adapter, "read").mockImplementationOnce(async (where, options) => {
      operationSignal = options?.signal;
      reading.resolve();
      await resume.promise;
      return original(where, options);
    });
    const acquire = vi.spyOn(f.runtime.documents, "acquireDocumentReferenceLease");
    const pending = Promise.allSettled([f.first.runtime.workspaceDocuments.newDocument({
      documentId: "pending-read", typeId, location: location("pending-read"), initialModel: { value: "pending" },
    })]);
    await reading.promise;
    if (revocation === "mount") f.first.dispose("adapter read pending");
    else if (revocation === "bundle") f.runtime.bundles.registerBundle(createTestBundle({ id: appId, route: `/${appId}` }), { publish: true });
    else f.runtime.apps.registerBundle(createTestBundle({ id: appId, route: `/${appId}` }));
    const hostSignalAborted = operationSignal?.aborted;
    resume.resolve();
    expect((await pending)[0]?.status).toBe("rejected");
    expect(acquire).not.toHaveBeenCalled();
    expect(f.runtime.documents.getDocument("pending-read")).toBeNull();
    if (revocation !== "application registry") expect(hostSignalAborted).toBe(true);
  });
});
