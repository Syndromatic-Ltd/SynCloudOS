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
  DocumentLocationRequiredError,
  DocumentRequestedIdConflictError,
  DocumentWriteOutcomeUnknownError,
  InMemoryDocumentAdapter,
} from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function configuredController() {
  const dependencies = createDocumentTestDependencies();
  cleanups.push(dependencies.cleanup);
  const adapter = new InMemoryDocumentAdapter(dependencies.environment);
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, adapter, dependencies };
}

function terminalReceiptOf<T>(reservation: T): any {
  return (reservation as { readonly receipt?: unknown }).receipt ?? reservation;
}

describe("DocumentController identity", () => {
  it("publishes temporary document closure when import and duplicate roll back", async () => {
    const { controller, adapter } = configuredController();
    const source = await controller.newDocument({ documentId: "rollback-source", typeId: noteType.id });
    const closedStates: string[] = [];
    const subscribedIds: string[] = [];
    vi.spyOn(adapter, "write").mockImplementation(async () => {
      const temporary = controller.openDocuments.find(({ id }) => id !== source.id && !subscribedIds.includes(id));
      if (!temporary) throw new Error("Expected a temporary rollback document.");
      subscribedIds.push(temporary.id);
      temporary.subscribe(() => closedStates.push(temporary.state));
      throw new Error("injected destination failure");
    });

    await expect(controller.duplicateDocument(source.id, {
      kind: "memory",
      namespace: "rollback-notifications",
      key: "duplicate",
    })).rejects.toThrow("injected destination failure");
    await expect(controller.importDocument({
      typeId: noteType.id,
      source: { kind: "text", text: "ignored", mediaType: "application/json" },
      decode: () => ({ title: "Imported", body: "Temporary" }),
      destination: {
        kind: "memory",
        namespace: "rollback-notifications",
        key: "import",
      },
    })).rejects.toThrow("injected destination failure");

    expect(subscribedIds).toHaveLength(2);
    expect(closedStates).toEqual(["closed", "closed"]);
    expect(controller.openDocuments).toEqual([source]);
  });

  it("keeps requested untitled IDs and de-duplicates an opened location", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "untitled-a", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "untitled-b", typeId: noteType.id });
    expect(first.id).toBe("untitled-a");
    expect(second.id).toBe("untitled-b");
    expect(first.location).toBeNull();
    expect(second.location).toBeNull();
    await expect(controller.saveDocument(first.id)).rejects.toBeInstanceOf(DocumentLocationRequiredError);

    const destination = { kind: "memory", namespace: "notes", key: "one" } as const;
    await controller.saveAsDocument({ documentId: first.id, destination });
    expect(await controller.openDocument({ typeId: noteType.id, location: destination })).toBe(first);
    await expect(controller.openDocument({ documentId: "different", typeId: noteType.id, location: destination }))
      .rejects.toBeInstanceOf(DocumentRequestedIdConflictError);
  });

  it("rejects duplicate requested IDs before allocating another undo manager", async () => {
    const { controller, dependencies } = configuredController();
    await controller.newDocument({ documentId: "stable", typeId: noteType.id });
    const before = dependencies.undo.inspect().length;
    await expect(controller.newDocument({ documentId: "stable", typeId: noteType.id }))
      .rejects.toBeInstanceOf(DocumentRequestedIdConflictError);
    expect(dependencies.undo.inspect()).toHaveLength(before);
  });

  it("coalesces concurrent opens of one canonical location", async () => {
    const { controller, adapter } = configuredController();
    const location = { kind: "memory", namespace: "notes", key: "concurrent-open" } as const;
    await adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: 1,
      content: noteType.create({ typeId: noteType.id }),
      expectedVersion: null,
      idempotencyKey: "concurrent-open-seed",
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalRead = adapter.read.bind(adapter);
    vi.spyOn(adapter, "read").mockImplementation(async (requested, options) => {
      await gate;
      return originalRead(requested, options);
    });
    const first = controller.openDocument({ typeId: noteType.id, location });
    await vi.waitFor(() => expect(adapter.read).toHaveBeenCalledOnce());
    const second = controller.openDocument({ typeId: noteType.id, location });
    release();
    const [firstDocument, secondDocument] = await Promise.all([first, second]);
    expect(secondDocument).toBe(firstDocument);
    expect(adapter.read).toHaveBeenCalledOnce();
  });
});

describe("DocumentController terminal provider receipts", () => {
  it("allows receipt adoption only by the service that reserved it", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({
      documentId: "service-scoped-receipt", typeId: noteType.id, applicationId: "com.example.receipt-app",
    });
    const initial = controller.reserveTerminalProviderOperation({
      serviceId: "provider.first", applicationId: "com.example.receipt-app", documentId: document.id,
      providerDocumentId: document.id, operationKind: "publish", operationIdentity: "scope-test",
      initialState: { phase: "pending" }, initialClaim: { claimant: {}, windowControllerId: null },
      execute: () => ({ promise: Promise.resolve({ accepted: true }), releaseProviderLock: () => true }),
    });
    await initial.receipt.waitForProvider();
    initial.release();
    const other = controller.claimTerminalProviderOperation("com.example.receipt-app", {
      serviceId: "provider.other", claimant: {}, windowControllerId: null,
    });
    try { expect(other).toBeNull(); } finally { other?.release(); }
    const owner = controller.claimTerminalProviderOperation("com.example.receipt-app", {
      serviceId: "provider.first", claimant: {}, windowControllerId: null,
    });
    expect(owner?.receipt.snapshot()).toMatchObject({ serviceId: "provider.first", documentId: document.id });
    owner?.release();
  });

  it("does not acquire terminal authority when initial state cannot be cloned", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({
      documentId: "invalid-terminal-state", typeId: noteType.id, applicationId: "com.example.receipt-app",
    });
    const execute = vi.fn(() => ({ promise: Promise.resolve(true), releaseProviderLock: () => true }));
    const request = {
      serviceId: "provider.first", applicationId: "com.example.receipt-app", documentId: document.id,
      providerDocumentId: document.id, operationKind: "publish", operationIdentity: "invalid-state",
      initialClaim: { claimant: {}, windowControllerId: null }, execute,
    };
    expect(() => controller.reserveTerminalProviderOperation({ ...request, initialState: { callback() {} } })).toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(() => controller.reserveTerminalProviderOperation({ ...request, initialState: { phase: "pending" } })).not.toThrow();
  });

  it("clears runtime authority and its provider lock when terminal close commits", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({
      documentId: "terminal-provider-close",
      typeId: noteType.id,
      applicationId: "com.example.example-document",
      initialModel: { title: "Accepted provider result", body: "Canonical" },
    });
    await controller.saveAsDocument({
      documentId: document.id,
      destination: { kind: "memory", namespace: "terminal-provider", key: document.id },
    });
    let providerLockReleases = 0;
    const receipt = terminalReceiptOf(controller.reserveTerminalProviderOperation({
      serviceId: "receipt.provider",
      applicationId: "com.example.example-document",
      documentId: document.id,
      providerDocumentId: document.id,
      operationKind: "publish",
      operationIdentity: "publish:terminal-provider-close",
      initialState: { phase: "close" },
      initialClaim: { claimant: {}, windowControllerId: null },
      execute: () => ({
        promise: Promise.resolve({ accepted: true }),
        releaseProviderLock: () => {
          providerLockReleases += 1;
          return true;
        },
      }),
    }));

    await expect(receipt.waitForProvider()).resolves.toEqual({ accepted: true });
    await expect(receipt.close("user")).resolves.toEqual({
      outcome: "closed",
      documentId: document.id,
    });
    expect(controller.getTerminalProviderOperationSnapshot("com.example.example-document", document.id)).toBeNull();
    expect(providerLockReleases).toBe(1);
    await expect(receipt.complete()).resolves.toBe(true);
    expect(providerLockReleases).toBe(1);
  });

  it("exposes live indeterminate canonical-write truth on the terminal receipt", async () => {
    const { controller, adapter } = configuredController();
    const document = await controller.newDocument({
      documentId: "terminal-provider-live-unknown",
      typeId: noteType.id,
      applicationId: "com.example.example-document",
      initialModel: { title: "Before terminal write", body: "Canonical" },
    });
    await controller.saveAsDocument({
      documentId: document.id,
      destination: { kind: "memory", namespace: "terminal-provider", key: document.id },
    });
    const originalWrite = adapter.write.bind(adapter);
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    let writeStarted!: () => void;
    const started = new Promise<void>((resolve) => { writeStarted = resolve; });
    vi.spyOn(adapter, "write").mockImplementation(async (request) => {
      writeStarted();
      await writeGate;
      return originalWrite(request);
    });
    const receipt = terminalReceiptOf(controller.reserveTerminalProviderOperation({
      serviceId: "receipt.provider",
      applicationId: "com.example.example-document",
      documentId: document.id,
      providerDocumentId: document.id,
      operationKind: "publish",
      operationIdentity: "publish:terminal-provider-live-unknown",
      initialState: { phase: "canonical-save" },
      initialClaim: { claimant: {}, windowControllerId: null },
      execute: () => ({ promise: Promise.resolve({ accepted: true }), releaseProviderLock: () => true }),
    }));
    receipt.synchronise(() => ({ title: "Accepted terminal result", body: "Canonical" }));
    const abort = new AbortController();
    const saving = receipt.save(abort.signal);
    await started;
    abort.abort("mount-disposed");
    await expect(saving).rejects.toBeInstanceOf(DocumentWriteOutcomeUnknownError);

    expect(receipt.snapshot()).toMatchObject({ canonicalWriteOutcomeUnknown: true });

    releaseWrite();
    await Promise.allSettled([saving]);
  });

  it("retains a failed provider receipt while an inherited ordinary write remains indeterminate", async () => {
    const { controller, adapter } = configuredController();
    const document = await controller.newDocument({
      documentId: "terminal-provider-failed-inherited-write",
      typeId: noteType.id,
      applicationId: "com.example.example-document",
      initialModel: { title: "Before provider rejection", body: "Canonical" },
    });
    await controller.saveAsDocument({
      documentId: document.id,
      destination: { kind: "memory", namespace: "terminal-provider", key: document.id },
    });
    document.update(() => ({ title: "Autosave before terminal provider", body: "Canonical" }), { actionName: "Edit before provider" });
    const originalWrite = adapter.write.bind(adapter);
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    let notifyLateWrite!: () => void;
    const lateWrite = new Promise<void>((resolve) => { notifyLateWrite = resolve; });
    let writeStarted!: () => void;
    const started = new Promise<void>((resolve) => { writeStarted = resolve; });
    vi.spyOn(adapter, "write").mockImplementation(async (request) => {
      writeStarted();
      await writeGate;
      const record = await originalWrite({ ...request, signal: undefined });
      notifyLateWrite();
      return record;
    });
    const ordinarySave = controller.saveDocument(document.id, { reason: "explicit" });
    await started;
    let providerLockReleases = 0;
    const receipt = terminalReceiptOf(controller.reserveTerminalProviderOperation({
      serviceId: "receipt.provider",
      applicationId: "com.example.example-document",
      documentId: document.id,
      providerDocumentId: document.id,
      operationKind: "publish",
      operationIdentity: "publish:terminal-provider-failed-inherited-write",
      initialState: { phase: "opening" },
      initialClaim: { claimant: {}, windowControllerId: null },
      execute: () => ({
        promise: Promise.reject(new Error("provider rejected")),
        releaseProviderLock: () => {
          providerLockReleases += 1;
          return true;
        },
      }),
    }));

    await expect(ordinarySave).rejects.toBeInstanceOf(DocumentWriteOutcomeUnknownError);
    expect(document.hasIndeterminateTerminalWrite).toBe(true);
    expect(controller.getTerminalProviderOperationSnapshot("com.example.example-document", document.id)).toMatchObject({
      providerStatus: "failed",
      canonicalWriteOutcomeUnknown: true,
    });
    await expect(receipt.waitForProvider()).rejects.toThrow("provider rejected");
    expect(controller.getTerminalProviderOperationSnapshot("com.example.example-document", document.id)).toMatchObject({
      providerStatus: "failed",
      canonicalWriteOutcomeUnknown: true,
    });

    releaseWrite();
    await lateWrite;
    await Promise.resolve();
    await expect(receipt.recoverWrite()).resolves.toBeUndefined();
    expect(controller.getTerminalProviderOperationSnapshot("com.example.example-document", document.id)).toBeNull();
    expect(document.snapshot()).toMatchObject({
      model: { title: "Autosave before terminal provider", body: "Canonical" },
      state: "clean",
    });
    expect(providerLockReleases).toBe(1);
  });

  it("projects a non-cloneable accepted provider result as accepted but unavailable", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({
      documentId: "terminal-provider-unavailable-result",
      typeId: noteType.id,
      applicationId: "com.example.example-document",
      initialModel: { title: "Accepted result", body: "Canonical" },
    });
    const receipt = terminalReceiptOf(controller.reserveTerminalProviderOperation({
      serviceId: "receipt.provider",
      applicationId: "com.example.example-document",
      documentId: document.id,
      providerDocumentId: document.id,
      operationKind: "publish",
      operationIdentity: "publish:terminal-provider-unavailable-result",
      initialState: { phase: "opening" },
      initialClaim: { claimant: {}, windowControllerId: null },
      execute: () => ({ promise: Promise.resolve({ projection: () => undefined }), releaseProviderLock: () => true }),
    }));

    await expect(receipt.waitForProvider()).rejects.toBeInstanceOf(Error);
    expect(receipt.snapshot()).toMatchObject({
      providerStatus: "accepted",
      providerResultStatus: "unavailable",
    });
  });

  it("lists immutable terminal receipt snapshots instead of unclaimed mutation authority", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({
      documentId: "terminal-provider-snapshot-listing",
      typeId: noteType.id,
      applicationId: "com.example.example-document",
      initialModel: { title: "Receipt listing", body: "Canonical" },
    });
    controller.reserveTerminalProviderOperation({
      serviceId: "receipt.provider",
      applicationId: "com.example.example-document",
      documentId: document.id,
      providerDocumentId: document.id,
      operationKind: "publish",
      operationIdentity: "publish:terminal-provider-snapshot-listing",
      initialState: { phase: "opening" },
      initialClaim: { claimant: {}, windowControllerId: null },
      execute: () => ({ promise: new Promise<never>(() => undefined), releaseProviderLock: () => true }),
    });

    const listed = controller.listTerminalProviderOperations("com.example.example-document") as readonly Record<string, unknown>[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("save");
    expect(Object.isFrozen(listed[0]!)).toBe(true);
  });

  it("claims two terminal receipts exclusively by exact document and lets a released claim deterministically transfer", async () => {
    const { controller } = configuredController();
    const firstDocument = await controller.newDocument({
      documentId: "terminal-provider-claim-first",
      typeId: noteType.id,
      applicationId: "com.example.example-document",
      initialModel: { title: "First", body: "Canonical" },
    });
    const secondDocument = await controller.newDocument({
      documentId: "terminal-provider-claim-second",
      typeId: noteType.id,
      applicationId: "com.example.example-document",
      initialModel: { title: "Second", body: "Canonical" },
    });
    const firstInitial = controller.reserveTerminalProviderOperation({
      serviceId: "receipt.provider",
      applicationId: "com.example.example-document",
      documentId: firstDocument.id,
      providerDocumentId: firstDocument.id,
      operationKind: "publish",
      operationIdentity: "publish:terminal-provider-claim-first",
      initialState: { phase: "opening" },
      initialClaim: { claimant: Object.freeze({ mount: "first" }), windowControllerId: "window:first" },
      execute: () => ({ promise: Promise.resolve({ accepted: "first" }), releaseProviderLock: () => true }),
    });
    const secondInitial = controller.reserveTerminalProviderOperation({
      serviceId: "receipt.provider",
      applicationId: "com.example.example-document",
      documentId: secondDocument.id,
      providerDocumentId: secondDocument.id,
      operationKind: "publish",
      operationIdentity: "publish:terminal-provider-claim-second",
      initialState: { phase: "opening" },
      initialClaim: { claimant: Object.freeze({ mount: "second" }), windowControllerId: "window:second" },
      execute: () => ({ promise: Promise.resolve({ accepted: "second" }), releaseProviderLock: () => true }),
    });
    expect(firstInitial.release()).toBe(true);
    expect(secondInitial.release()).toBe(true);

    const firstClaim = controller.claimTerminalProviderOperation("com.example.example-document", {
      serviceId: "receipt.provider",
      claimant: Object.freeze({ mount: "window:first" }),
      windowControllerId: "window:first",
      preferredDocumentId: firstDocument.id,
    })!;
    const secondClaim = controller.claimTerminalProviderOperation("com.example.example-document", {
      serviceId: "receipt.provider",
      claimant: Object.freeze({ mount: "window:second" }),
      windowControllerId: "window:second",
      preferredDocumentId: secondDocument.id,
    })!;
    expect(firstClaim.documentId).toBe(firstDocument.id);
    expect(secondClaim.documentId).toBe(secondDocument.id);
    expect(controller.claimTerminalProviderOperation("com.example.example-document", {
      serviceId: "receipt.provider",
      claimant: Object.freeze({ mount: "blocked" }),
      windowControllerId: "window:blocked",
    })).toBeNull();

    expect(firstClaim.release()).toBe(true);
    expect(() => firstClaim.receipt.snapshot()).toThrow(/claim/i);
    const takeover = controller.claimTerminalProviderOperation("com.example.example-document", {
      serviceId: "receipt.provider",
      claimant: Object.freeze({ mount: "window:takeover" }),
      windowControllerId: "window:takeover",
      preferredDocumentId: firstDocument.id,
    })!;
    expect(takeover.documentId).toBe(firstDocument.id);
    expect(takeover.generation).toBeGreaterThan(firstClaim.generation);

    await expect(takeover.receipt.waitForProvider()).resolves.toEqual({ accepted: "first" });
    await expect(secondClaim.receipt.waitForProvider()).resolves.toEqual({ accepted: "second" });
    await expect(takeover.receipt.complete()).resolves.toBe(true);
    await expect(secondClaim.receipt.complete()).resolves.toBe(true);
  });
});
