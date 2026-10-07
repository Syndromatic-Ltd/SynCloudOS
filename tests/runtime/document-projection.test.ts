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
import { ApplicationDocument, DocumentController, DocumentReadOnlyError, InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents";
import { documentAdoptionAuthority } from "../../src/SynCloudOS/Documents/documentAdoptionAuthority";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function configuredController(observeError?: (error: unknown, context: string) => void) {
  const dependencies = createDocumentTestDependencies();
  cleanups.push(dependencies.cleanup);
  const adapter = new InMemoryDocumentAdapter(dependencies.environment);
  const controller = new DocumentController(observeError ? { ...dependencies, observeError } : dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, adapter };
}

function disposalContext() {
  return {
    reason: "test",
    runtimeSignal: new AbortController().signal,
    preparationSignal: new AbortController().signal,
  };
}

describe("projection documents", () => {
  it("is born clean, non-dirty, location-less and read-only", async () => {
    const { controller } = configuredController();
    const mutableModel = { title: "Published", body: "Read only" };
    const document = await controller.newProjectionDocument({
      documentId: "projection-birth",
      typeId: noteType.id,
      initialModel: mutableModel,
    });
    expect(document.documentKind).toBe("projection");
    expect(document.readOnly).toBe(true);
    expect(document.state).toBe("clean");
    expect(document.dirtyRevision).toBe(0);
    expect(document.hasUnsavedChanges).toBe(false);
    expect(document.location).toBeNull();
    // The kernel clone-freezes: the caller's mutable object neither aliases
    // projection state nor escapes freezing.
    expect(document.model).not.toBe(mutableModel);
    expect(Object.isFrozen(document.model)).toBe(true);
    expect(document.snapshot()).toMatchObject({ documentKind: "projection", readOnly: true, dirtyRevision: 0 });
  });

  it("rejects every mutation, conflict, save and persistence path", async () => {
    const { controller } = configuredController();
    const document = await controller.newProjectionDocument({
      documentId: "projection-immutable",
      typeId: noteType.id,
      initialModel: { title: "Published", body: "Read only" },
    });
    expect(() => document.update((model) => ({ ...model, body: "edited" }), { actionName: "Type" }))
      .toThrow(DocumentReadOnlyError);
    expect(() => document.enterConflict({
      base: null,
      localModel: { title: "Published", body: "Read only" },
      remote: null,
    })).toThrow(DocumentReadOnlyError);
    await expect(document.save({ reason: "explicit" })).rejects.toBeInstanceOf(DocumentReadOnlyError);
    await expect(controller.saveAsDocument({
      documentId: document.id,
      destination: { kind: "memory", namespace: "notes", key: "projection-copy" },
    })).rejects.toBeInstanceOf(DocumentReadOnlyError);
    await expect(controller.moveDocument({
      documentId: document.id,
      destination: { kind: "memory", namespace: "notes", key: "projection-moved" },
    })).rejects.toBeInstanceOf(DocumentReadOnlyError);
    await expect(controller.duplicateDocument(
      document.id,
      { kind: "memory", namespace: "notes", key: "projection-duplicate" },
    )).rejects.toBeInstanceOf(DocumentReadOnlyError);
    // Nothing above may have dirtied the projection.
    expect(document.hasUnsavedChanges).toBe(false);
    expect(document.dirtyRevision).toBe(0);
  });

  it("closes a healthy projection without review and without diagnostics", async () => {
    const seen: Array<{ error: unknown; context: string }> = [];
    const { controller } = configuredController((error, context) => { seen.push({ error, context }); });
    const document = await controller.newProjectionDocument({
      documentId: "projection-clean-close",
      typeId: noteType.id,
      initialModel: { title: "Published", body: "Read only" },
    });
    // No reviewer registered: an ordinary dirty document would cancel here.
    await expect(controller.closeDocument(document.id, "window-control"))
      .resolves.toEqual({ outcome: "closed", documentId: document.id });
    expect(seen).toEqual([]);
  });

  it("refuses rather than discards a projection that somehow became dirty", async () => {
    const seen: Array<{ error: unknown; context: string }> = [];
    const { controller } = configuredController((error, context) => { seen.push({ error, context }); });
    const document = await controller.newProjectionDocument({
      documentId: "projection-corrupt",
      typeId: noteType.id,
      initialModel: { title: "Published", body: "Read only" },
    });
    // Simulate a future mutation-guard bug reaching the review loop through
    // the only remaining channel: direct kernel-authority state change.
    document.markUnsaved(documentAdoptionAuthority);
    expect(document.hasUnsavedChanges).toBe(true);
    const preparation = await controller.prepareRuntimeDisposal(disposalContext());
    expect(preparation.status).toBe("cancelled");
    expect(preparation).toMatchObject({ reason: `document-close-cancelled:${document.id}` });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.error).toBeInstanceOf(DocumentReadOnlyError);
    expect(seen[0]?.context).toBe(`documents.close.projection-dirty:${document.id}`);
    // The corrupt projection is still open — nothing was silently discarded.
    expect(controller.getDocument(document.id)).toBe(document);
  });

  it("lets an ordinary dirty document block a mixed close set containing projections", async () => {
    const { controller } = configuredController();
    await controller.newProjectionDocument({
      documentId: "projection-mixed",
      typeId: noteType.id,
      initialModel: { title: "Published", body: "Read only" },
    });
    const ordinary = await controller.newDocument({ documentId: "ordinary-mixed", typeId: noteType.id });
    ordinary.update((model) => ({ ...model, body: "Unsaved work" }), { actionName: "Type" });
    // No reviewer: the ordinary document cancels the whole disposal, and the
    // projection must still be open afterwards.
    const preparation = await controller.prepareRuntimeDisposal(disposalContext());
    expect(preparation.status).toBe("cancelled");
    expect(preparation).toMatchObject({ reason: `document-close-cancelled:${ordinary.id}` });
    expect(controller.getDocument("projection-mixed")?.hasUnsavedChanges).toBe(false);
  });

  it("commits disposal for projections alongside reviewed ordinary documents", async () => {
    const { controller } = configuredController();
    await controller.newProjectionDocument({
      documentId: "projection-ready",
      typeId: noteType.id,
      initialModel: { title: "Published", body: "Read only" },
    });
    // Ordinary documents are born dirty, so this one still needs its review;
    // the projection is clean and skips review entirely.
    await controller.newDocument({ documentId: "ordinary-ready", typeId: noteType.id });
    controller.registerCloseReviewer({ review: async () => "discard" });
    const runtimeAbort = new AbortController();
    const preparationAbort = new AbortController();
    const preparation = await controller.prepareRuntimeDisposal({
      reason: "test",
      runtimeSignal: runtimeAbort.signal,
      preparationSignal: preparationAbort.signal,
    });
    expect(preparation.status).toBe("ready");
    runtimeAbort.abort("commit");
    if (preparation.status === "ready") await preparation.commit();
    expect(controller.getDocument("projection-ready")).toBeNull();
    expect(controller.getDocument("ordinary-ready")).toBeNull();
  });

  it("never mints projections from the ordinary construction paths", async () => {
    const { controller } = configuredController();
    const created = await controller.newDocument({ documentId: "ordinary-kind", typeId: noteType.id });
    expect(created.documentKind).toBe("standard");
    expect(created.readOnly).toBe(false);
    expect(created.snapshot()).toMatchObject({ documentKind: "standard", readOnly: false });
    expect(() => ApplicationDocument.create({
      id: "smuggled-kind",
      type: noteType,
      model: { title: "No", body: "No" },
      documentKind: "projection",
      undoManager: created.undoManager,
      recovery: createDocumentTestDependencies().recovery,
      persistenceNamespace: "projection-test",
      environment: createDocumentTestDependencies().environment,
    } as never)).toThrow(/kernel-minted/);
  });

  it("rejects accessors, hidden fields and symbols before consuming admission authority", async () => {
    const { controller } = configuredController();
    let ownershipReads = 0;
    const accessor = Object.defineProperties({}, {
      typeId: { enumerable: true, value: noteType.id },
      initialModel: { enumerable: true, value: { title: "No", body: "No" } },
      applicationId: { enumerable: true, get: () => { ownershipReads += 1; return "projection-app"; } },
    });
    await expect(controller.newProjectionDocument(accessor as never)).rejects.toThrow(/data property/);
    expect(ownershipReads).toBe(0);

    const hidden = { typeId: noteType.id, initialModel: { title: "No", body: "No" } } as Record<PropertyKey, unknown>;
    Object.defineProperty(hidden, "smuggled", { enumerable: false, value: true });
    await expect(controller.newProjectionDocument(hidden as never)).rejects.toThrow(/must not carry "smuggled"/);

    const symbol = { typeId: noteType.id, initialModel: { title: "No", body: "No" }, [Symbol("smuggled")]: true };
    await expect(controller.newProjectionDocument(symbol as never)).rejects.toThrow(/symbol fields/);
  });

  it("excludes projections from restoration snapshots", async () => {
    const { controller } = configuredController();
    await controller.newProjectionDocument({
      documentId: "projection-unsnapshotted",
      typeId: noteType.id,
      initialModel: { title: "Published", body: "Read only" },
    });
    const snapshot = controller.createRestorationSnapshot();
    expect(snapshot.documents.map((entry) => entry.documentId)).not.toContain("projection-unsnapshotted");
  });

  it("pins documents with open windows against final-owner cleanup", async () => {
    const { controller } = configuredController();
    const document = await controller.newProjectionDocument({
      documentId: "projection-pinned",
      typeId: noteType.id,
      applicationId: "pin-app",
      initialModel: { title: "Published", body: "Read only" },
    });
    // A mount holds an owner lease; a window associates; suspend releases
    // the lease while the window stays open.
    const lease = controller.acquireDocumentReferenceLease(document.id, "pin-app", "owner");
    controller.associateWindow(document.id, { windowControllerId: "pin-window", role: "secondary" });
    // releaseDocumentReferenceLease awaits the full deferred cleanup pass,
    // so the surviving document proves the window pin — no sleep needed.
    await controller.releaseDocumentReferenceLease(lease, { closeIfFinalOwner: true });
    expect(controller.getDocument(document.id)).toBe(document);
    // The last window's dissociation resumes the cleanup instead of leaking.
    controller.dissociateWindow(document.id, "pin-window");
    await vi.waitFor(() => expect(controller.getDocument(document.id)).toBeNull());
  });

  it("serialises concurrent final-owner releases into one cleanup", async () => {
    const { controller } = configuredController();
    const document = await controller.newProjectionDocument({
      documentId: "projection-serial",
      typeId: noteType.id,
      applicationId: "pin-app",
      initialModel: { title: "Published", body: "Read only" },
    });
    const prepareSpy = vi.spyOn(document, "prepareToClose");
    const first = controller.acquireDocumentReferenceLease(document.id, "pin-app", "owner");
    const second = controller.acquireDocumentReferenceLease(document.id, "pin-app", "owner");
    // Both releases race: the second joins the in-flight cleanup instead of
    // starting its own — the canonical document prepares for close exactly once.
    await Promise.all([
      controller.releaseDocumentReferenceLease(first, { closeIfFinalOwner: true }),
      controller.releaseDocumentReferenceLease(second, { closeIfFinalOwner: true }),
    ]);
    expect(controller.getDocument(document.id)).toBeNull();
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    prepareSpy.mockRestore();
  });

  it("defers final-owner cleanup while a terminal reconciliation lease is active", async () => {
    const { controller } = configuredController();
    const document = await controller.newProjectionDocument({
      documentId: "projection-terminal",
      typeId: noteType.id,
      applicationId: "pin-app",
      initialModel: { title: "Published", body: "Read only" },
    });
    const lease = controller.acquireDocumentReferenceLease(document.id, "pin-app", "owner");
    const terminalToken = document.beginTerminalReconciliation(documentAdoptionAuthority);
    try {
      await controller.releaseDocumentReferenceLease(lease, { closeIfFinalOwner: true });
      // The terminal lease defers cleanup entirely: still open, no close.
      expect(controller.getDocument(document.id)).toBe(document);
    } finally {
      await document.endTerminalReconciliation(terminalToken, documentAdoptionAuthority);
    }
    // A fresh release after the lease ends proceeds to close.
    const second = controller.acquireDocumentReferenceLease(document.id, "pin-app", "owner");
    await controller.releaseDocumentReferenceLease(second, { closeIfFinalOwner: true });
    expect(controller.getDocument(document.id)).toBeNull();
  });

  it("refuses ordinary window close for a dirty projection without consulting a reviewer", async () => {
    const seen: Array<{ error: unknown; context: string }> = [];
    const { controller } = configuredController((error, context) => { seen.push({ error, context }); });
    const document = await controller.newProjectionDocument({
      documentId: "projection-ordinary-refuse",
      typeId: noteType.id,
      initialModel: { title: "Published", body: "Read only" },
    });
    const review = vi.fn().mockResolvedValue("discard");
    controller.registerCloseReviewer({ review });
    document.markUnsaved(documentAdoptionAuthority);
    await expect(controller.closeDocument(document.id, "window-control"))
      .resolves.toEqual({ outcome: "cancelled", documentId: document.id });
    expect(review).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.error).toBeInstanceOf(DocumentReadOnlyError);
    expect(controller.getDocument(document.id)).toBe(document);
  });
});
