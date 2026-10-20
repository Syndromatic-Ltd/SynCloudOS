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
  InMemoryDocumentAdapter,
  type DocumentStorageAdapter,
  type DocumentType,
} from "../../src/SynCloudOS/Documents";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("mounted workspace document versions cleanup")));
});

const typeId = "workspace-version-port.note";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function noteType(): DocumentType<{ value: string }> {
  return {
    id: typeId,
    displayName: "Mounted workspace note",
    schemaVersion: 1,
    extensions: [],
    mimeTypes: [],
    creatingApplicationId: "com.example.workspace-owner",
    openingApplicationIds: ["com.example.workspace-owner"],
    capabilities: { versions: true, conflicts: true },
    autosave: "disabled",
    create: () => ({ value: "new" }),
    read: (value) => structuredClone(value),
    write: (value) => structuredClone(value),
    validate: (value: unknown): value is { value: string } => Boolean(
      value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string",
    ),
  };
}

function fixture(options: {
  readonly environment?: ReturnType<typeof createTestRuntimeEnvironment>;
  readonly adapter?: DocumentStorageAdapter;
} = {}) {
  const runtime = createTestRuntime({
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.adapter ? { applicationDocuments: { initialAdapters: [options.adapter] } } : {}),
    initialBundles: [
      createTestBundle({ bundleIdentifier: "com.example.workspace-owner", route: "/workspace-owner" }),
      createTestBundle({ bundleIdentifier: "com.example.workspace-observer", route: "/workspace-observer" }),
    ],
  });
  runtimes.push(runtime);
  runtime.documents.registerType(noteType());
  const ownerApp = runtime.apps.getApp("com.example.workspace-owner")!;
  const observerApp = runtime.apps.getApp("com.example.workspace-observer")!;
  runtime.responders.register({ id: "application:com.example.workspace-owner", kind: "application", parentId: "workspace", scopeId: "application:com.example.workspace-owner" });
  runtime.responders.register({ id: "application:com.example.workspace-observer", kind: "application", parentId: "workspace", scopeId: "application:com.example.workspace-observer" });
  runtime.responders.register({ id: "application:com.example.workspace-owner:first", kind: "control", parentId: "application:com.example.workspace-owner", scopeId: "workspace-owner:first" });
  runtime.responders.register({ id: "application:com.example.workspace-owner:replacement", kind: "control", parentId: "application:com.example.workspace-owner", scopeId: "workspace-owner:replacement" });
  runtime.responders.register({ id: "application:com.example.workspace-observer:main", kind: "control", parentId: "application:com.example.workspace-observer", scopeId: "workspace-observer:main" });
  return {
    runtime,
    first: createMountedSynWareRuntime({ runtime, app: ownerApp, responderId: "application:com.example.workspace-owner:first" }),
    replacement: createMountedSynWareRuntime({ runtime, app: ownerApp, responderId: "application:com.example.workspace-owner:replacement" }),
    observer: createMountedSynWareRuntime({ runtime, app: observerApp, responderId: "application:com.example.workspace-observer:main" }),
  };
}

async function savedDocument(mount: ReturnType<typeof createMountedSynWareRuntime>, documentId = "workspace-version-port-document") {
  const document = await mount.runtime.workspaceDocuments.newDocument<{ value: string }>({
    documentId,
    typeId,
    location: { kind: "memory", namespace: "mounted-workspace-port", key: documentId },
    initialModel: { value: "initial" },
  });
  mount.runtime.workspaceDocuments.updateDocument<{ value: string }>(document.id, () => ({ value: "first" }), { actionName: "First edit" });
  await mount.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
  return document;
}

describe("mounted workspace document version and conflict port", () => {
  it("reads a saved version's content without touching the open document, as NSFileVersion does", async () => {
    const { first, observer } = fixture();
    const document = await savedDocument(first, "workspace-version-read-document");
    const [saved] = await first.runtime.workspaceDocuments.listDocumentVersions(document.id);
    first.runtime.workspaceDocuments.updateDocument<{ value: string }>(document.id, () => ({ value: "unsaved" }), { actionName: "Unsaved edit" });
    await expect(first.runtime.workspaceDocuments.readDocumentVersion<{ value: string }>(document.id, saved!)).resolves.toEqual({ value: "first" });
    expect(first.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({ model: { value: "unsaved" }, state: "dirty" });
    expect(() => observer.runtime.workspaceDocuments.readDocumentVersion(document.id, saved!)).toThrow(/owner lease|security/i);
  });

  it("uses the canonical document for versions, restore, conflict resolution, and close results", async () => {
    const { first } = fixture();
    const document = await savedDocument(first);

    const versions = await first.runtime.workspaceDocuments.listDocumentVersions(document.id);
    const firstVersion = versions.at(-1)!;
    first.runtime.workspaceDocuments.updateDocument<{ value: string }>(document.id, () => ({ value: "second" }), { actionName: "Second edit" });

    await expect(first.runtime.workspaceDocuments.restoreDocumentVersion(document.id, firstVersion)).resolves.toBeUndefined();
    // Restoring the current saved native content is clean even as the
    // mutation revision advances to fence older asynchronous work.
    expect(first.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "first" },
      state: "clean",
    });

    const current = first.runtime.workspaceDocuments.getDocument(document.id)!;
    first.runtime.workspaceDocuments.enterDocumentConflict(document.id, {
      base: {
        location: current.location!,
        typeId,
        schemaVersion: 1,
        content: { value: "first" },
        version: firstVersion,
        createdAt: firstVersion.savedAt,
        updatedAt: firstVersion.savedAt,
        metadata: {},
      },
      localModel: { value: "local" },
      remote: {
        location: current.location!,
        typeId,
        schemaVersion: 1,
        content: { value: "first" },
        version: firstVersion,
        createdAt: firstVersion.savedAt,
        updatedAt: firstVersion.savedAt,
        metadata: {},
      },
    });
    expect(first.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "local" },
      state: "conflicted",
    });
    await expect(first.runtime.workspaceDocuments.resolveDocumentConflict(document.id, {
      kind: "use-local",
      expectedRemoteVersion: firstVersion,
    })).resolves.toBeUndefined();
    await expect(first.runtime.workspaceDocuments.closeDocument(document.id, "user")).resolves.toEqual({
      outcome: "closed",
      documentId: document.id,
    });
  });

  it("fails closed for an observer, a revoked owner, and a same-ID replacement generation", async () => {
    const { first, replacement, observer } = fixture();
    const document = await savedDocument(first);
    const version = (await first.runtime.workspaceDocuments.listDocumentVersions(document.id))[0]!;

    expect(() => observer.runtime.workspaceDocuments.listDocumentVersions(document.id)).toThrow(/owner lease|security/i);
    expect(() => observer.runtime.workspaceDocuments.restoreDocumentVersion(document.id, version)).toThrow(/owner lease|security/i);
    expect(() => observer.runtime.workspaceDocuments.enterDocumentConflict(document.id, {
      base: null,
      localModel: { value: "observer" },
      remote: null,
    })).toThrow(/owner lease|security/i);
    expect(() => observer.runtime.workspaceDocuments.resolveDocumentConflict(document.id, {
      kind: "use-remote",
    })).toThrow(/owner lease|security/i);

    await first.runtime.workspaceDocuments.releaseDocument(document.id);
    expect(() => first.runtime.workspaceDocuments.listDocumentVersions(document.id)).toThrow(/owner lease|security/i);
    expect(() => first.runtime.workspaceDocuments.resolveDocumentConflict(document.id, {
      kind: "use-remote",
    })).toThrow(/owner lease|security/i);

    await replacement.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: { kind: "memory", namespace: "mounted-workspace-port", key: document.id },
    });
    await replacement.runtime.workspaceDocuments.closeDocument(document.id, "user");
    const replacementDocument = await replacement.runtime.workspaceDocuments.newDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: { kind: "memory", namespace: "mounted-workspace-port", key: `${document.id}:replacement` },
      initialModel: { value: "replacement" },
    });
    expect(() => first.runtime.workspaceDocuments.restoreDocumentVersion(document.id, version)).toThrow(/owner lease|security/i);
    expect(() => first.runtime.workspaceDocuments.resolveDocumentConflict(document.id, {
      kind: "use-remote",
    })).toThrow(/owner lease|security/i);
    expect(replacement.runtime.workspaceDocuments.getDocument(replacementDocument.id)).toMatchObject({
      model: { value: "replacement" },
    });
  });

  it("returns the canonical dirty-close cancellation without releasing the mounted owner", async () => {
    const { first, runtime } = fixture();
    const document = await savedDocument(first, "workspace-dirty-close-cancel");
    first.runtime.workspaceDocuments.updateDocument<{ value: string }>(document.id, () => ({ value: "unsaved" }), { actionName: "Unsaved edit" });
    const review = vi.fn(async () => "cancel" as const);
    runtime.documents.registerCloseReviewer({ review });

    await expect(first.runtime.workspaceDocuments.closeDocument(document.id, "user")).resolves.toEqual({
      outcome: "cancelled",
      documentId: document.id,
    });

    expect(review).toHaveBeenCalledWith(expect.objectContaining({ documentId: document.id, reason: "user" }));
    expect(first.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "unsaved" },
      state: "dirty",
    });
  });

  it("holds the originating owner lease until an in-flight restore settles before same-document renewal", async () => {
    const { first, replacement, runtime } = fixture();
    const document = await savedDocument(first, "workspace-inflight-owner-renewal");
    const version = (await first.runtime.workspaceDocuments.listDocumentVersions(document.id))[0]!;
    await replacement.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: { kind: "memory", namespace: "mounted-workspace-port", key: document.id },
    });
    const canonical = runtime.documents.getDocument(document.id)!;
    const gate = deferred<void>();
    const restore = vi.spyOn(canonical, "restoreVersion").mockImplementationOnce(() => gate.promise);

    const restoring = first.runtime.workspaceDocuments.restoreDocumentVersion(document.id, version);
    const release = first.runtime.workspaceDocuments.releaseDocument(document.id);
    let releaseSettled = false;
    void release.then(() => { releaseSettled = true; });
    await Promise.resolve();
    expect(releaseSettled).toBe(false);
    expect(runtime.documents.getDocument(document.id)).toBe(canonical);

    gate.resolve(undefined);
    await expect(restoring).resolves.toBeUndefined();
    await expect(release).resolves.toBe(true);
    await first.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: { kind: "memory", namespace: "mounted-workspace-port", key: document.id },
    });
    expect(runtime.documents.getDocument(document.id)).toBe(canonical);
    expect(restore).toHaveBeenCalledWith(version, expect.any(AbortSignal));
  });

  it("keeps a revoked mount's owner lease fenced until its in-flight restore settles", async () => {
    const { first, runtime } = fixture();
    const document = await savedDocument(first, "workspace-disposal-owner-fence");
    const version = (await first.runtime.workspaceDocuments.listDocumentVersions(document.id))[0]!;
    const canonical = runtime.documents.getDocument(document.id)!;
    const gate = deferred<void>();
    const restore = vi.spyOn(canonical, "restoreVersion").mockImplementationOnce(async () => gate.promise);

    const restoring = first.runtime.workspaceDocuments.restoreDocumentVersion(document.id, version);
    await vi.waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
    first.dispose("mounted owner disposal while restoring");

    try {
      expect(runtime.documents.hasActiveDocumentOwnerLease(document.id, "com.example.workspace-owner")).toBe(true);
    } finally {
      gate.resolve(undefined);
    }
    await expect(restoring).rejects.toThrow();
    await vi.waitFor(() => expect(runtime.documents.hasActiveDocumentOwnerLease(document.id, "com.example.workspace-owner")).toBe(false));
  });

  it("does not let a disposed same-ID owner apply a late version read over the replacement mount", async () => {
    const environment = createTestRuntimeEnvironment();
    const backing = new InMemoryDocumentAdapter(environment);
    const readStarted = deferred<void>();
    const releaseRead = deferred<void>();
    const adapter: DocumentStorageAdapter = {
      id: "mounted-version-disposal-fence",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: async (location, version, options) => {
        readStarted.resolve(undefined);
        await releaseRead.promise;
        // This intentionally ignores cancellation, modelling a backend that
        // returns a stale record after the mount has already been revoked.
        return backing.readVersion(location, version, { ...options, signal: undefined });
      },
    };
    const { first, replacement } = fixture({ environment, adapter });
    const document = await savedDocument(first, "workspace-disposal-version-fence");
    const version = (await first.runtime.workspaceDocuments.listDocumentVersions(document.id))[0]!;
    await replacement.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: { kind: "memory", namespace: "mounted-workspace-port", key: document.id },
    });

    const restoring = first.runtime.workspaceDocuments.restoreDocumentVersion(document.id, version);
    await readStarted.promise;
    first.dispose("first mounted document owner revoked");
    replacement.runtime.workspaceDocuments.updateDocument<{ value: string }>(
      document.id,
      () => ({ value: "replacement editor value" }),
      { actionName: "Replacement edit" },
    );
    releaseRead.resolve(undefined);

    await expect(restoring).rejects.toMatchObject({ code: "document-aborted" });
    expect(replacement.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "replacement editor value" },
      state: "dirty",
    });
  });

  it("aborts a late use-remote conflict acknowledgement before it can replace a replacement owner's model", async () => {
    const environment = createTestRuntimeEnvironment();
    const backing = new InMemoryDocumentAdapter(environment);
    const acknowledged = deferred<void>();
    const acknowledgementStarted = deferred<void>();
    let acknowledgementSignal: AbortSignal | undefined;
    const adapter: DocumentStorageAdapter = {
      id: "mounted-conflict-use-remote-fence",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
      acceptRemoteConflict: async (_location, _record, options) => {
        acknowledgementSignal = options?.signal;
        acknowledgementStarted.resolve(undefined);
        // Deliberately ignore cancellation: the document must fence its own
        // mutation when this late acknowledgement eventually resolves.
        await acknowledged.promise;
      },
    };
    const { first, replacement, runtime } = fixture({ environment, adapter });
    const document = await savedDocument(first, "workspace-conflict-use-remote-fence");
    await replacement.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: { kind: "memory", namespace: "mounted-workspace-port", key: document.id },
    });
    const canonical = runtime.documents.getDocument(document.id)!;
    const current = canonical.snapshot();
    const remote = {
      location: current.location!,
      typeId,
      schemaVersion: 1,
      content: { value: "remote value" },
      version: current.currentVersion!,
      createdAt: current.currentVersion!.savedAt,
      updatedAt: current.currentVersion!.savedAt,
      metadata: {},
    };
    first.runtime.workspaceDocuments.enterDocumentConflict(document.id, {
      base: null,
      localModel: { value: "local conflict value" },
      remote,
    });
    const before = canonical.snapshot();

    const resolving = first.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "use-remote" });
    await acknowledgementStarted.promise;
    first.dispose("owner revoked while accepting remote conflict");
    const acknowledgementWasAborted = acknowledgementSignal?.aborted;

    acknowledged.resolve(undefined);
    await expect(resolving).rejects.toSatisfy((error: unknown) => (
      (error instanceof DOMException && error.name === "AbortError") ||
      (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "document-aborted")
    ));
    expect(acknowledgementWasAborted).toBe(true);
    expect(canonical.snapshot()).toEqual(before);

    await expect(replacement.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "use-remote" })).resolves.toBeUndefined();
    expect(replacement.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "remote value" },
      state: "clean",
    });
  });

  it("aborts a late recreation preparation before it clears the conflict or starts a save", async () => {
    const environment = createTestRuntimeEnvironment();
    const backing = new InMemoryDocumentAdapter(environment);
    const preparation = deferred<void>();
    const preparationStarted = deferred<void>();
    let preparationSignal: AbortSignal | undefined;
    const adapter: DocumentStorageAdapter = {
      id: "mounted-conflict-recreate-fence",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
      prepareDocumentRecreation: async (_location, options) => {
        preparationSignal = options?.signal;
        preparationStarted.resolve(undefined);
        // Like a provider SDK that cannot cancel an already-issued request.
        await preparation.promise;
      },
    };
    const { first, replacement, runtime } = fixture({ environment, adapter });
    const document = await savedDocument(first, "workspace-conflict-recreate-fence");
    await replacement.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: { kind: "memory", namespace: "mounted-workspace-port", key: document.id },
    });
    const canonical = runtime.documents.getDocument(document.id)!;
    first.runtime.workspaceDocuments.enterDocumentConflict(document.id, {
      base: null,
      localModel: { value: "recreate local value" },
      remote: null,
      remoteState: "deleted",
    });
    const before = canonical.snapshot();

    const resolving = first.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "recreate" });
    await preparationStarted.promise;
    first.dispose("owner revoked while preparing recreation");
    const preparationWasAborted = preparationSignal?.aborted;

    preparation.resolve(undefined);
    await expect(resolving).rejects.toSatisfy((error: unknown) => (
      (error instanceof DOMException && error.name === "AbortError") ||
      (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "document-aborted")
    ));
    expect(preparationWasAborted).toBe(true);
    expect(canonical.snapshot()).toEqual(before);

    await expect(replacement.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "use-remote" })).resolves.toBeUndefined();
    expect(replacement.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "recreate local value" },
      state: "deleted",
    });
  });

  it("promptly aborts a never-settling use-remote provider and releases the revoked owner lease", async () => {
    const environment = createTestRuntimeEnvironment();
    const backing = new InMemoryDocumentAdapter(environment);
    const acknowledgementStarted = deferred<void>();
    let acknowledgementCalls = 0;
    const adapter: DocumentStorageAdapter = {
      id: "mounted-conflict-never-use-remote",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
      acceptRemoteConflict: async () => {
        acknowledgementCalls += 1;
        if (acknowledgementCalls === 1) {
          acknowledgementStarted.resolve(undefined);
          await new Promise<void>(() => undefined);
        }
      },
    };
    const { first, replacement, runtime } = fixture({ environment, adapter });
    const document = await savedDocument(first, "workspace-conflict-never-use-remote");
    const canonical = runtime.documents.getDocument(document.id)!;
    const current = canonical.snapshot();
    await replacement.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: current.location!,
    });
    const releaseLease = vi.spyOn(runtime.documents, "releaseDocumentReferenceLease");
    const remote = {
      location: current.location!,
      typeId,
      schemaVersion: 1,
      content: { value: "remote after never-settling acknowledgement" },
      version: current.currentVersion!,
      createdAt: current.currentVersion!.savedAt,
      updatedAt: current.currentVersion!.savedAt,
      metadata: {},
    };
    first.runtime.workspaceDocuments.enterDocumentConflict(document.id, {
      base: null,
      localModel: { value: "local before never-settling acknowledgement" },
      remote,
    });
    const before = canonical.snapshot();

    const resolving = first.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "use-remote" });
    await acknowledgementStarted.promise;
    first.dispose("owner revoked during never-settling remote acknowledgement");
    const outcome = await Promise.race([
      resolving.then(
        () => ({ kind: "resolved" as const }),
        (error: unknown) => ({ kind: "rejected" as const, error }),
      ),
      new Promise<{ readonly kind: "pending" }>((resolve) => setTimeout(() => resolve({ kind: "pending" }), 0)),
    ]);

    expect(outcome).toMatchObject({ kind: "rejected", error: { code: "document-aborted" } });
    expect(canonical.snapshot()).toEqual(before);
    await vi.waitFor(() => expect(releaseLease).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: document.id, kind: "owner" }),
      { closeIfFinalOwner: true },
    ));
    await expect(replacement.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "use-remote" })).resolves.toBeUndefined();
    expect(replacement.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "remote after never-settling acknowledgement" },
      state: "clean",
    });
    await expect(replacement.runtime.workspaceDocuments.closeDocument(document.id, "user")).resolves.toEqual({
      outcome: "closed",
      documentId: document.id,
    });
  });

  it("promptly aborts a never-settling recreation provider and releases the revoked owner lease", async () => {
    const environment = createTestRuntimeEnvironment();
    const backing = new InMemoryDocumentAdapter(environment);
    const preparationStarted = deferred<void>();
    let preparationCalls = 0;
    const adapter: DocumentStorageAdapter = {
      id: "mounted-conflict-never-recreate",
      capabilities: backing.capabilities,
      supports: (location) => backing.supports(location),
      read: (location, options) => backing.read(location, options),
      write: (request) => backing.write(request),
      remove: (location, version, options) => backing.remove(location, version, options),
      list: (query) => backing.list(query),
      listVersions: (location, options) => backing.listVersions(location, options),
      readVersion: (location, version, options) => backing.readVersion(location, version, options),
      prepareDocumentRecreation: async () => {
        preparationCalls += 1;
        if (preparationCalls === 1) {
          preparationStarted.resolve(undefined);
          await new Promise<void>(() => undefined);
        }
      },
    };
    const { first, replacement, runtime } = fixture({ environment, adapter });
    const document = await savedDocument(first, "workspace-conflict-never-recreate");
    const canonical = runtime.documents.getDocument(document.id)!;
    const current = canonical.snapshot();
    await replacement.runtime.workspaceDocuments.openDocument<{ value: string }>({
      documentId: document.id,
      typeId,
      location: current.location!,
    });
    const releaseLease = vi.spyOn(runtime.documents, "releaseDocumentReferenceLease");
    first.runtime.workspaceDocuments.enterDocumentConflict(document.id, {
      base: null,
      localModel: { value: "local before never-settling recreation" },
      remote: null,
      remoteState: "deleted",
    });
    const before = canonical.snapshot();

    const resolving = first.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "recreate" });
    await preparationStarted.promise;
    first.dispose("owner revoked during never-settling recreation preparation");
    const outcome = await Promise.race([
      resolving.then(
        () => ({ kind: "resolved" as const }),
        (error: unknown) => ({ kind: "rejected" as const, error }),
      ),
      new Promise<{ readonly kind: "pending" }>((resolve) => setTimeout(() => resolve({ kind: "pending" }), 0)),
    ]);

    expect(outcome).toMatchObject({ kind: "rejected", error: { code: "document-aborted" } });
    expect(canonical.snapshot()).toEqual(before);
    await vi.waitFor(() => expect(releaseLease).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: document.id, kind: "owner" }),
      { closeIfFinalOwner: true },
    ));
    await expect(replacement.runtime.workspaceDocuments.resolveDocumentConflict(document.id, { kind: "use-remote" })).resolves.toBeUndefined();
    expect(replacement.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      model: { value: "local before never-settling recreation" },
      state: "deleted",
    });
    await expect(replacement.runtime.workspaceDocuments.closeDocument(document.id, "user")).resolves.toEqual({
      outcome: "closed",
      documentId: document.id,
    });
  });
});
