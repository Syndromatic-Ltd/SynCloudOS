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

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentRecord, DocumentStorageAdapter, DocumentType, DocumentWriteRequest } from "../../src/SynCloudOS/Documents";
import { DocumentWriteOutcomeUnknownError } from "../../src/SynCloudOS/Documents";
import type { ServiceTerminalOperations } from "../../src/SynCloudOS/Documents/serviceTerminalOperations";
import type { MountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { createTestRuntime, createTrustedTestSynWareBundle, mountTestSynWareRuntime } from "./helpers";

import { defineSynWareServiceToken } from "../../src/SynCloudOS/AppSDK/serviceToken";

const terminalToken = defineSynWareServiceToken<{ readonly available: boolean }>({ id: "terminal-owner.provider" });

interface Note { readonly value: string }

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

const terminalManifest = {
  schemaVersion: 1,
  id: "terminal-owner",
  version: "1.0.0",
  title: "Document terminal fixture",
  routes: [{ path: "/terminal-owner", primary: true }],
  permissions: ["journal.publisher.open"],
  services: [{ id: "terminal-owner.provider", required: true }],
} as const;

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("Document terminal reconciliation cleanup")));
});

function noteType(id: string): DocumentType<Note> {
  return {
    id,
    displayName: "Terminal note",
    schemaVersion: 1,
    extensions: [],
    mimeTypes: [],
    creatingApplicationId: "terminal-owner",
    openingApplicationIds: ["terminal-owner"],
    capabilities: { versions: true, conflicts: true },
    autosave: { mode: "debounced", delayMs: 500 },
    create: () => ({ value: "initial" }),
    read: (value) => structuredClone(value),
    write: (value) => structuredClone(value),
    validate: (value: unknown): value is Note => Boolean(value && typeof value === "object" && typeof (value as Note).value === "string"),
  };
}

function stored(request: DocumentWriteRequest<Note>, sequence: number): DocumentRecord<Note> {
  const savedAt = new Date(sequence * 1_000).toISOString();
  return {
    location: request.location,
    typeId: request.typeId,
    schemaVersion: request.schemaVersion,
    content: structuredClone(request.content),
    version: { id: `v${sequence}`, sequence, savedAt, etag: `v${sequence}` },
    createdAt: savedAt,
    updatedAt: savedAt,
    metadata: request.metadata ?? {},
  };
}

function fixture(adapter: DocumentStorageAdapter) {
  const type = noteType("terminal-owner.note");
  const runtime = createTestRuntime({
    initialBundles: [createTrustedTestSynWareBundle(terminalManifest, ["journal-provider-admin"])],
    applicationDocuments: { initialAdapters: [adapter], initialTypes: [type] },
  });
  runtimes.push(runtime);
  const terminalOperationsByMount = new WeakMap<AbortSignal, ServiceTerminalOperations>();
  runtime.services.register({
    id: "terminal-owner.provider",
    version: "1.0.0",
    createAppClient({ signal, terminalOperations }) {
      if (!terminalOperations) throw new Error("The mounted provider requires terminal operations.");
      terminalOperationsByMount.set(signal, terminalOperations);
      return Object.freeze({ available: true });
    },
  });
  // Capture the host-only capability issued by token acquisition, including the
  // real mount's ownership checks, abort signal, and receipt-claim lifetime.
  const serviceTerminalOperations = (mount: MountedSynWareRuntime) => {
    const service = mount.runtime.services.optional(terminalToken);
    const operations = terminalOperationsByMount.get(mount.runtime.signal);
    if (!service.available || !operations) throw new Error("The mounted provider did not resolve.");
    return operations;
  };
  const mounted = mountTestSynWareRuntime(runtime, "terminal-owner");
  const reserveReconciliation = async (documentId: string) => {
    const lease = serviceTerminalOperations(mounted).reserve({
      documentId,
      providerDocumentId: documentId,
      operationKind: "publish",
      operationIdentity: documentId + ":publish",
      initialState: {},
      execute: () => ({ promise: Promise.resolve({ accepted: true }), releaseProviderLock: () => true }),
    });
    await lease.waitForProvider();
    return lease;
  };
  return { runtime, type, mounted, serviceTerminalOperations, reserveReconciliation };
}

describe("Document terminal reconciliation lease", () => {
  it("shares one terminal save flight and never queues a second logical write", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    const terminalWrite = deferred<DocumentRecord<Note>>();
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-single-flight",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        if (writes.length === 1) return stored(request as DocumentWriteRequest<Note>, 1);
        return terminalWrite.promise;
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "single-flight" },
      initialModel: { value: "before" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted" }));

    const first = lease.save();
    const second = lease.save();
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    terminalWrite.resolve(stored(writes[1]!, 2));
    await Promise.all([first, second]);
    expect(writes).toHaveLength(2);
    await lease.release();
    mounted.dispose();
  });

  it("settles terminal authority instead of hanging behind a non-cooperative autosave", async () => {
    vi.useFakeTimers();
    const writes: DocumentWriteRequest<Note>[] = [];
    const autosaveWrite = deferred<DocumentRecord<Note>>();
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-autosave-handoff",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        if (writes.length === 1) return stored(request as DocumentWriteRequest<Note>, 1);
        return autosaveWrite.promise;
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "autosave-handoff" },
      initialModel: { value: "baseline" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    mounted.runtime.workspaceDocuments.updateDocument(document.id, () => ({ value: "ordinary-autosave" }), { actionName: "Typing" });
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(writes).toHaveLength(2));

    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted-provider-result" }));
    let settlement: "pending" | "fulfilled" | "rejected" = "pending";
    const saving = lease.save().then(
      () => { settlement = "fulfilled"; },
      () => { settlement = "rejected"; },
    );
    await vi.advanceTimersByTimeAsync(1);
    const settlementBeforeOrdinaryWrite = settlement;
    const writesBeforeOrdinarySettlement = writes.length;

    autosaveWrite.resolve(stored(writes[1]!, 2));
    await saving;
    await Promise.resolve();
    expect(settlementBeforeOrdinaryWrite).toBe("rejected");
    expect(writesBeforeOrdinarySettlement).toBe(2);
    expect(runtime.documents.getDocument(document.id)!.snapshot()).toMatchObject({ state: "dirty", model: { value: "accepted-provider-result" } });
    expect(writes).toHaveLength(2);
    await expect(lease.release()).rejects.toThrow(/determinate/i);
    await lease.recoverWrite();
    expect(runtime.documents.getDocument(document.id)!.snapshot()).toMatchObject({ state: "dirty", model: { value: "accepted-provider-result" } });
    expect(writes).toHaveLength(2);
    await lease.release();
    mounted.dispose();
  });

  it("observes a late non-cooperative autosave rejection before permitting a new terminal write", async () => {
    vi.useFakeTimers();
    const writes: DocumentWriteRequest<Note>[] = [];
    const autosaveWrite = deferred<DocumentRecord<Note>>();
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-autosave-late-rejection",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        if (writes.length === 1) return stored(request as DocumentWriteRequest<Note>, 1);
        if (writes.length === 2) return autosaveWrite.promise;
        return stored(request as DocumentWriteRequest<Note>, writes.length);
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "autosave-late-rejection" },
      initialModel: { value: "baseline" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    mounted.runtime.workspaceDocuments.updateDocument(document.id, () => ({ value: "ordinary-autosave" }), { actionName: "Typing" });
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(writes).toHaveLength(2));

    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted-provider-result" }));
    await expect(lease.save()).rejects.toBeInstanceOf(DocumentWriteOutcomeUnknownError);
    expect(writes).toHaveLength(2);

    autosaveWrite.reject(new Error("late autosave provider rejection"));
    await Promise.resolve();
    await Promise.resolve();
    await expect(lease.recoverWrite()).resolves.toBeUndefined();
    expect(writes).toHaveLength(2);
    await expect(lease.save()).resolves.toBeUndefined();
    expect(writes).toHaveLength(3);
    expect(runtime.documents.getDocument(document.id)!.snapshot()).toMatchObject({ state: "clean", model: { value: "accepted-provider-result" } });
    await lease.release();
    mounted.dispose();
  });

  it("fences release until its terminal flight settles and adopts late fulfilment only through exact recovery", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    const terminalWrite = deferred<DocumentRecord<Note>>();
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-release-late-fulfilment",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        if (writes.length === 1) return stored(request as DocumentWriteRequest<Note>, 1);
        return terminalWrite.promise;
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "release-late-fulfilment" },
      initialModel: { value: "baseline" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted-provider-result" }));
    const saving = lease.save();
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    const releasing = lease.release();

    await expect(saving).rejects.toBeInstanceOf(DocumentWriteOutcomeUnknownError);
    await expect(releasing).resolves.toBe(true);
    expect(mounted.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      state: "dirty",
      model: { value: "accepted-provider-result" },
    });

    terminalWrite.resolve(stored(writes[1]!, 2));
    await Promise.resolve();
    await Promise.resolve();
    const recovery = await reserveReconciliation(document.id);
    await expect(recovery.recoverWrite()).resolves.toBeUndefined();
    expect(writes).toHaveLength(2);
    expect(runtime.documents.getDocument(document.id)!.snapshot()).toMatchObject({ state: "clean", model: { value: "accepted-provider-result" } });
    await recovery.release();
    mounted.dispose();
  });

  it("defers a synchronisation acknowledgement while terminal authority is active", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    const terminalWrite = deferred<DocumentRecord<Note>>();
    let synchronisationListener: ((event: {
      readonly kind: "acknowledged";
      readonly record: DocumentRecord<unknown>;
    }) => void) | null = null;
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-synchronisation",
      capabilities: { versions: true, delete: true, watch: false, offline: true, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        if (writes.length === 1) return stored(request as DocumentWriteRequest<Note>, 1);
        return terminalWrite.promise;
      },
      isSynchronisationPending: () => false,
      subscribeSynchronisation: (_location, listener) => {
        synchronisationListener = listener as typeof synchronisationListener;
        return { dispose: () => undefined };
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "synchronisation" },
      initialModel: { value: "before" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted" }));
    const saving = lease.save();
    await vi.waitFor(() => expect(writes).toHaveLength(2));

    expect(synchronisationListener).not.toBeNull();
    let callbackError: unknown;
    try {
      synchronisationListener?.({ kind: "acknowledged", record: stored(writes[0]!, 3) });
    } catch (error) {
      callbackError = error;
    }
    const snapshotDuringCallback = runtime.documents.getDocument(document.id)!.snapshot();
    terminalWrite.resolve(stored(writes[1]!, 2));
    await saving;
    expect(callbackError).toBeUndefined();
    expect(snapshotDuringCallback).toMatchObject({ state: "saving", conflict: null, model: { value: "accepted" } });
    expect(runtime.documents.getDocument(document.id)!.snapshot().conflict).toBeNull();
    await lease.release();
    mounted.dispose();
  });

  it("rejects every ordinary close gate and runtime disposal while a lease is active", async () => {
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-close-gates",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => stored(request as DocumentWriteRequest<Note>, 1),
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "close-gates" },
      initialModel: { value: "before" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = await reserveReconciliation(document.id);
    const windowController = runtime.windows.create({
      id: "terminal-owner-close-window",
      workspaceId: "main",
      applicationId: "terminal-owner",
      applicationSessionId: "session:terminal-owner",
      documentId: document.id,
      documentAssociationRole: "primary",
      representedDocument: null,
      toolbar: null,
      role: "standard",
      style: ["titled", "closable", "minimisable", "resizable", "zoomable"],
      title: "Document terminal document",
      content: { rendererId: "application", parameters: { appId: "terminal-owner" } },
      bounds: { x: 80, y: 60, width: 800, height: 600 },
      minimumSize: { width: 320, height: 240 },
      maximumSize: null,
      level: "normal",
      parentWindowControllerId: null,
      anchor: null,
      pinned: false,
      mobilePolicy: "fullscreen",
      restorationKey: `terminal-owner:${document.id}`,
    });
    await runtime.windows.open(windowController.id);

    await expect(runtime.documents.prepareCloseDocument(document.id, "user")).rejects.toThrow(/terminal reconciliation/i);
    await expect(runtime.documents.prepareCloseDocuments([document.id], "application-quit")).rejects.toThrow(/terminal reconciliation/i);
    await expect(runtime.documents.closeAll("application-quit")).rejects.toThrow(/terminal reconciliation/i);
    await expect(runtime.commands.validate("window.close", { windowControllerId: windowController.id })).resolves.toMatchObject({
      enabled: false,
      disabledReason: expect.stringMatching(/terminal reconciliation/i),
    });
    await expect(runtime.windows.requestClose(windowController.id, { reason: "command" })).rejects.toThrow(/terminal reconciliation/i);
    await expect(runtime.dispose("terminal-lease-disposal")).resolves.toMatchObject({
      status: "cancelled",
      participantId: "documents",
      reason: expect.stringMatching(/terminal reconciliation/i),
    });
    expect(runtime.signal.aborted).toBe(false);
    expect(runtime.documents.getDocument(document.id)).not.toBeNull();

    await lease.release();
    mounted.dispose();
  });

  it("keeps Save As and Revert truthfully disabled while terminal authority is active", async () => {
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-standard-commands",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => stored(request as DocumentWriteRequest<Note>, 1),
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "commands" },
      initialModel: { value: "before" },
      activate: true,
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = await reserveReconciliation(document.id);

    await expect(runtime.commands.validate("document.save-as", undefined)).resolves.toMatchObject({
      enabled: false,
      disabledReason: expect.stringMatching(/terminal reconciliation/i),
    });
    await expect(runtime.commands.validate("document.revert", undefined)).resolves.toMatchObject({
      enabled: false,
      disabledReason: expect.stringMatching(/terminal reconciliation/i),
    });
    await expect(runtime.commands.validate("document.new", undefined)).resolves.toMatchObject({
      enabled: false,
      disabledReason: expect.stringMatching(/terminal reconciliation/i),
    });
    await lease.release();
    mounted.dispose();
  });

  it("suspends autosave and rejects ordinary mutation, Save, Restore and Close while the authorised lease saves and closes", async () => {
    vi.useFakeTimers();
    const writes: DocumentWriteRequest<Note>[] = [];
    let sequence = 0;
    let releaseTerminalWrite!: () => void;
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-memory",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        sequence += 1;
        if (sequence === 2) await new Promise<void>((resolve) => { releaseTerminalWrite = resolve; });
        return stored(request as DocumentWriteRequest<Note>, sequence);
      },
      remove: async () => undefined,
      list: async () => [],
      listVersions: async () => [],
      readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "lease" },
      initialModel: { value: "before" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted-provider-result" }));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(writes).toHaveLength(1);
    expect(() => mounted.runtime.workspaceDocuments.updateDocument(document.id, () => ({ value: "typing" }), { actionName: "Typing" })).toThrow(/terminal reconciliation/i);
    await expect(mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" })).rejects.toThrow(/terminal reconciliation/i);
    await expect(mounted.runtime.workspaceDocuments.restoreDocumentVersion(document.id, { id: "v1", sequence: 1, savedAt: new Date(1000).toISOString(), etag: "v1" })).rejects.toThrow(/terminal reconciliation/i);
    await expect(mounted.runtime.workspaceDocuments.closeDocument(document.id, "user")).rejects.toThrow(/terminal reconciliation/i);
    await expect(runtime.commands.validate("document.save", undefined)).resolves.toMatchObject({ enabled: false, disabledReason: expect.stringMatching(/terminal reconciliation/i) });
    await expect(runtime.commands.validate("document.close", undefined)).resolves.toMatchObject({ enabled: false, disabledReason: expect.stringMatching(/terminal reconciliation/i) });

    const saving = lease.save();
    await vi.waitFor(() => expect(releaseTerminalWrite).toBeTypeOf("function"));
    expect(() => mounted.runtime.workspaceDocuments.synchroniseDocument(document.id, () => ({ value: "late editor history" }))).toThrow(/terminal reconciliation/i);
    await expect(mounted.runtime.commands.dispatch("document.save", undefined)).resolves.toMatchObject({ status: "denied" });
    await expect(mounted.runtime.commands.dispatch("document.close", undefined)).resolves.toMatchObject({ status: "denied" });
    releaseTerminalWrite();
    await saving;
    expect(writes).toHaveLength(2);
    await expect(lease.close("user")).resolves.toMatchObject({ outcome: "closed" });
    mounted.dispose();
  });

  it("does not let final owner release implicitly save or close an unresolved leased document", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-owner-release",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => { writes.push(request as DocumentWriteRequest<Note>); return stored(request as DocumentWriteRequest<Note>, writes.length); },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "release" },
      initialModel: { value: "before" },
    });
    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted" }));

    await mounted.runtime.workspaceDocuments.releaseDocument(document.id);
    expect(runtime.documents.hasActiveDocumentOwnerLease(document.id, "terminal-owner")).toBe(false);
    expect(runtime.documents.getDocument(document.id)?.snapshot()).toMatchObject({ state: "dirty", model: { value: "accepted" } });
    expect(writes).toHaveLength(0);
    await lease.release();
    mounted.dispose();
  });

  it("recovers the exact committed write after its response is lost without issuing a second logical write", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    let committed: DocumentRecord<Note> | null = null;
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-indeterminate",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => committed,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        committed = stored(request as DocumentWriteRequest<Note>, 1);
        throw new DocumentWriteOutcomeUnknownError(request.location, request.idempotencyKey, "response lost after commit");
      },
      recoverWriteByIdempotencyKey: async (request) => {
        expect(request.idempotencyKey).toBe(writes[0]?.idempotencyKey);
        return committed;
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "unknown" },
      initialModel: { value: "before" },
    });
    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted" }));

    await expect(lease.save()).rejects.toBeInstanceOf(DocumentWriteOutcomeUnknownError);
    const originalKey = writes[0]!.idempotencyKey;
    await expect(lease.recoverWrite()).resolves.toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.idempotencyKey).toBe(originalKey);
    expect(runtime.documents.getDocument(document.id)!.snapshot()).toMatchObject({ state: "clean", model: { value: "accepted" } });
    await lease.release();
    mounted.dispose();
  });

  it("retains the exact indeterminate identity across a transient recovery failure", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    const recoveries: string[] = [];
    let committed: DocumentRecord<Note> | null = null;
    let recoveryAttempt = 0;
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-indeterminate-retry",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => committed,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        committed = stored(request as DocumentWriteRequest<Note>, 1);
        throw new DocumentWriteOutcomeUnknownError(request.location, request.idempotencyKey, "response lost after commit");
      },
      recoverWriteByIdempotencyKey: async (request) => {
        recoveries.push(request.idempotencyKey);
        recoveryAttempt += 1;
        if (recoveryAttempt === 1) throw new Error("transient recovery outage");
        return committed;
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, reserveReconciliation } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "unknown-retry" },
      initialModel: { value: "before" },
    });
    const lease = await reserveReconciliation(document.id);
    lease.synchronise<Note>(() => ({ value: "accepted" }));
    await expect(lease.save()).rejects.toBeInstanceOf(DocumentWriteOutcomeUnknownError);
    const originalKey = writes[0]!.idempotencyKey;

    await expect(lease.recoverWrite()).rejects.toThrow("transient recovery outage");
    await expect(lease.save()).rejects.toMatchObject({ idempotencyKey: originalKey });
    await expect(lease.recoverWrite()).resolves.toBeUndefined();
    expect(recoveries).toEqual([originalKey, originalKey]);
    expect(writes).toHaveLength(1);
    await lease.release();
    mounted.dispose();
  });

  it("preserves an indeterminate operation identity across mounted-owner disposal", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    let committed: DocumentRecord<Note> | null = null;
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-disposal-unknown",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => committed,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        committed = stored(request as DocumentWriteRequest<Note>, 1);
        throw new DocumentWriteOutcomeUnknownError(request.location, request.idempotencyKey, "lost after commit");
      },
      recoverWriteByIdempotencyKey: async (request) => {
        expect(request.idempotencyKey).toBe(writes[0]?.idempotencyKey);
        return committed;
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, serviceTerminalOperations } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "dispose-unknown" },
      initialModel: { value: "accepted" },
    });
    const releaseProviderLock = vi.fn(() => true);
    const lease = serviceTerminalOperations(mounted).reserve({
      documentId: document.id,
      providerDocumentId: "dispose-unknown",
      operationKind: "publish",
      operationIdentity: "dispose-unknown:publish",
      initialState: { value: "accepted" },
      execute: () => ({ promise: Promise.resolve({ value: "accepted" }), releaseProviderLock }),
    });
    await lease.waitForProvider();
    lease.synchronise(() => ({ value: "accepted" }));
    await expect(lease.save()).rejects.toBeInstanceOf(DocumentWriteOutcomeUnknownError);
    mounted.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toHaveLength(1);
    expect(runtime.documents.getDocument(document.id)).not.toBeNull();
    expect(releaseProviderLock).not.toHaveBeenCalled();
    expect(() => lease.snapshot()).toThrow();

    const replacement = mountTestSynWareRuntime(runtime, "terminal-owner", "application:terminal-owner:replacement");
    replacement.runtime.workspaceDocuments.retainDocument<Note>(document.id);
    const recovery = serviceTerminalOperations(replacement).claim<Note, Note>();
    if (!recovery) throw new Error("The replacement mount must claim the unresolved operation.");
    expect(recovery.operationIdentity).toBe("dispose-unknown:publish");
    await recovery.recoverWrite();
    expect(writes).toHaveLength(1);
    expect(recovery.snapshot()).toMatchObject({ state: "clean", model: { value: "accepted" } });
    await recovery.release();
    expect(releaseProviderLock).toHaveBeenCalledTimes(1);
    replacement.dispose();
  });

  it("does not deliver a late terminal-save result after same-ID bundle replacement", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    const terminalWrite = deferred<DocumentRecord<Note>>();
    let terminalRequest: DocumentWriteRequest<Note> | null = null;
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-bundle-replacement-revocation",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        if (writes.length === 2) {
          terminalRequest = request as DocumentWriteRequest<Note>;
          return terminalWrite.promise;
        }
        return stored(request as DocumentWriteRequest<Note>, writes.length);
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, serviceTerminalOperations } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "bundle-replacement-revocation" },
      initialModel: { value: "before" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = serviceTerminalOperations(mounted).reserve({
      documentId: document.id,
      providerDocumentId: "bundle-replacement-revocation",
      operationKind: "publish",
      operationIdentity: "bundle-replacement-revocation:publish",
      initialState: { value: "accepted" },
      execute: () => ({ promise: Promise.resolve({ value: "accepted" }), releaseProviderLock: () => true }),
    });
    await lease.waitForProvider();
    lease.synchronise(() => ({ value: "accepted" }));
    const saving = lease.save();
    await vi.waitFor(() => expect(terminalRequest).not.toBeNull());

    runtime.apps.register(createTrustedTestSynWareBundle(terminalManifest, ["journal-provider-admin"]));

    await expect(saving).rejects.toThrow(/abort|revoked|authority/i);
    expect(terminalRequest?.signal?.aborted).toBe(true);
    terminalWrite.resolve(stored(terminalRequest!, 2));
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.documents.getDocument(document.id)?.snapshot()).toMatchObject({
      state: "dirty",
      model: { value: "accepted" },
    });
    mounted.dispose();
    const replacement = mountTestSynWareRuntime(runtime, "terminal-owner", "application:terminal-owner:bundle-recovery");
    replacement.runtime.workspaceDocuments.retainDocument<Note>(document.id);
    const recovery = serviceTerminalOperations(replacement).claim<Note, Note>();
    if (!recovery) throw new Error("The replacement bundle must reclaim the unresolved operation.");
    await recovery.recoverWrite();
    expect(writes).toHaveLength(2);
    expect(recovery.snapshot()).toMatchObject({ state: "clean", model: { value: "accepted" } });
    await recovery.release();
    replacement.dispose();
  });

  it("does not deliver a late terminal-save result after mount disposal", async () => {
    const writes: DocumentWriteRequest<Note>[] = [];
    const terminalWrite = deferred<DocumentRecord<Note>>();
    let terminalRequest: DocumentWriteRequest<Note> | null = null;
    const adapter: DocumentStorageAdapter = {
      id: "terminal-owner-mount-disposal-revocation",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: () => true,
      read: async () => null,
      write: async (request) => {
        writes.push(request as DocumentWriteRequest<Note>);
        if (writes.length === 2) {
          terminalRequest = request as DocumentWriteRequest<Note>;
          return terminalWrite.promise;
        }
        return stored(request as DocumentWriteRequest<Note>, writes.length);
      },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const { runtime, type, mounted, serviceTerminalOperations } = fixture(adapter);
    const document = await mounted.runtime.workspaceDocuments.newDocument<Note>({
      typeId: type.id,
      location: { kind: "memory", namespace: "terminal", key: "mount-disposal-revocation" },
      initialModel: { value: "before" },
    });
    await mounted.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const lease = serviceTerminalOperations(mounted).reserve({
      documentId: document.id,
      providerDocumentId: "mount-disposal-revocation",
      operationKind: "publish",
      operationIdentity: "mount-disposal-revocation:publish",
      initialState: { value: "accepted" },
      execute: () => ({ promise: Promise.resolve({ value: "accepted" }), releaseProviderLock: () => true }),
    });
    await lease.waitForProvider();
    lease.synchronise(() => ({ value: "accepted" }));
    const saving = lease.save();
    await vi.waitFor(() => expect(terminalRequest).not.toBeNull());

    mounted.dispose();

    await expect(saving).rejects.toThrow(/abort|revoked|authority/i);
    expect(terminalRequest?.signal?.aborted).toBe(true);
    terminalWrite.resolve(stored(terminalRequest!, 2));
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.documents.getDocument(document.id)?.snapshot()).toMatchObject({
      state: "dirty",
      model: { value: "accepted" },
    });
    const replacement = mountTestSynWareRuntime(runtime, "terminal-owner", "application:terminal-owner:mount-recovery");
    replacement.runtime.workspaceDocuments.retainDocument<Note>(document.id);
    const recovery = serviceTerminalOperations(replacement).claim<Note, Note>();
    if (!recovery) throw new Error("The replacement mount must reclaim the unresolved operation.");
    await recovery.recoverWrite();
    expect(writes).toHaveLength(2);
    expect(recovery.snapshot()).toMatchObject({ state: "clean", model: { value: "accepted" } });
    await recovery.release();
    replacement.dispose();
  });
});
