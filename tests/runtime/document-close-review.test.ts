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
import { documentAdoptionAuthority } from "../../src/SynCloudOS/Documents/documentAdoptionAuthority";
import { DocumentController, InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents";
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
  return { controller, adapter };
}

describe("DocumentController close review", () => {
  it("cancels dirty close without a reviewer and preserves the reason for a registered reviewer", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({
      typeId: noteType.id,
      location: { kind: "memory", namespace: "notes", key: "review" },
    });
    document.update((model) => ({ ...model, body: "Unsaved" }), { actionName: "Type" });
    await expect(controller.closeDocument(document.id, "window-control"))
      .resolves.toEqual({ outcome: "cancelled", documentId: document.id });
    const review = vi.fn().mockResolvedValue("save");
    controller.registerCloseReviewer({ review });
    await expect(controller.closeDocument(document.id, "window-control"))
      .resolves.toEqual({ outcome: "closed", documentId: document.id });
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ reason: "window-control" }));
  });

  it("refuses presentation-backed close without a coordinator without mutation", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({ documentId: "presented", typeId: noteType.id });
    controller.associateWindow(document.id, { windowControllerId: "window-1", role: "primary" });
    const before = document.snapshot();
    await expect(controller.closeDocument(document.id, "window-command")).resolves.toEqual({
      outcome: "refused",
      documentId: document.id,
      reason: "presentation-coordinator-unavailable",
    });
    expect(document.snapshot()).toBe(before);
    expect(controller.getDocument(document.id)).toBe(document);
  });

  it("rolls back a ready presentation when save fails", async () => {
    const { controller, adapter } = configuredController();
    const document = await controller.newDocument({
      documentId: "failed-close",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "notes", key: "failed-close" },
    });
    document.update((model) => ({ ...model, body: "Keep me" }), { actionName: "Type" });
    controller.associateWindow(document.id, { windowControllerId: "window-2", role: "primary" });
    controller.registerCloseReviewer({ review: async () => "save" });
    const rollbackClose = vi.fn();
    controller.registerPresentationCloseCoordinator({
      prepareClose: async ({ documentId }) => ({ status: "ready", token: "presentation-1", documentId, associationIds: ["window-2"] }),
      commitClose: (_preparation, commitDocument) => commitDocument(),
      rollbackClose,
    });
    vi.spyOn(adapter, "write").mockRejectedValueOnce(new Error("save failed"));
    await expect(controller.closeDocument(document.id, "window-command")).rejects.toThrow("save failed");
    expect(rollbackClose).toHaveBeenCalledOnce();
    expect(controller.getDocument(document.id)).toBe(document);
    expect(document.state).toBe("dirty");
  });

  it("commits presentation and document structure through one synchronous callback", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({ documentId: "coordinated", typeId: noteType.id });
    controller.associateWindow(document.id, { windowControllerId: "window-coordinated", role: "primary" });
    controller.registerCloseReviewer({ review: async () => "discard" });
    const signal = new AbortController().signal;
    const prepareClose = vi.fn(async ({ documentId }) => ({
      status: "ready" as const,
      token: "coordinated-token",
      documentId,
      associationIds: ["window-coordinated"],
    }));
    const commitClose = vi.fn((_preparation, commitDocument: () => void) => {
      commitDocument();
      expect(controller.getDocument(document.id)).toBeNull();
    });
    controller.registerPresentationCloseCoordinator({ prepareClose, commitClose, rollbackClose: vi.fn() });
    await expect(controller.closeDocument(document.id, "window-command", signal))
      .resolves.toEqual({ outcome: "closed", documentId: document.id });
    expect(prepareClose.mock.calls[0]?.[0].signal).toBe(signal);
    expect(commitClose).toHaveBeenCalledOnce();
  });

  it("prepares every document before closeAll commits any structural close", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "first-close", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "second-close", typeId: noteType.id });
    first.update((model) => ({ ...model, body: "Dirty" }), { actionName: "Type" });
    controller.registerCloseReviewer({
      review: vi.fn()
        .mockResolvedValueOnce("cancel")
        .mockResolvedValueOnce("discard"),
    });
    await expect(controller.closeAll("application-quit")).resolves.toMatchObject({
      outcome: "cancelled",
      closedDocumentIds: [],
    });
    expect(controller.getDocument(first.id)).toBe(first);
    expect(controller.getDocument(second.id)).toBe(second);
  });

  it("gates the complete closeAll selection before awaiting the first reviewer", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "close-all-gated-first", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "close-all-gated-second", typeId: noteType.id });
    let entered!: () => void;
    let finish!: (decision: "cancel") => void;
    const reviewEntered = new Promise<void>((resolve) => { entered = resolve; });
    const decision = new Promise<"cancel">((resolve) => { finish = resolve; });
    controller.registerCloseReviewer({
      review: vi.fn(async ({ documentId }) => {
        if (documentId === second.id) {
          entered();
          return decision;
        }
        return "discard";
      }),
    });

    const closing = controller.closeAll("application-quit");
    await reviewEntered;
    expect(() => first.update((model) => ({ ...model, body: "too late" }), { actionName: "Type" }))
      .toThrow(/prepared close/);
    finish("cancel");
    await expect(closing).resolves.toMatchObject({ outcome: "cancelled", closedDocumentIds: [] });
  });

  it("releases every selected gate when an earlier document cancels", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "selected-cancel-first", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "selected-cancel-second", typeId: noteType.id });
    first.update((model) => ({ ...model, body: "cancel this set" }), { actionName: "Type" });
    controller.registerCloseReviewer({
      review: vi.fn()
        .mockResolvedValueOnce("cancel")
        .mockResolvedValueOnce("discard"),
    });

    await expect(controller.prepareCloseDocuments([first.id, second.id], "application-quit"))
      .resolves.toMatchObject({ status: "cancelled", documentId: first.id });
    expect(() => second.update((model) => ({ ...model, body: "still editable" }), { actionName: "Type" }))
      .not.toThrow();
  });

  it("deduplicates a selected subset and commits it synchronously without closing unselected documents", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "selected-subset-first", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "selected-subset-second", typeId: noteType.id });
    controller.registerCloseReviewer({ review: async () => "discard" });
    const preparation = await controller.prepareCloseDocuments([first.id, first.id], "application-quit");
    expect(preparation).toMatchObject({ status: "ready", documentIds: [first.id] });
    if (preparation.status !== "ready") throw new Error("Expected selected close readiness.");

    expect(controller.commitCloseDocuments(preparation)).toEqual({
      outcome: "closed",
      closedDocumentIds: [first.id],
    });
    expect(controller.getDocument(first.id)).toBeNull();
    expect(controller.getDocument(second.id)).toBe(second);
  });

  it("releases every selected gate when presentation-set preparation rejects", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "set-reject-first", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "set-reject-second", typeId: noteType.id });
    controller.associateWindow(first.id, { windowControllerId: "set-reject-window", role: "primary" });
    let rejectPresentation!: (error: Error) => void;
    let presentationEntered!: () => void;
    const entered = new Promise<void>((resolve) => { presentationEntered = resolve; });
    const presentation = new Promise<never>((_resolve, reject) => { rejectPresentation = reject; });
    controller.registerPresentationCloseCoordinator({
      prepareClose: async () => ({ status: "cancelled", reason: "unused" }),
      commitClose: vi.fn(),
      rollbackClose: vi.fn(),
      prepareCloseSet: async () => {
        presentationEntered();
        return presentation;
      },
      validateCloseSet: vi.fn(),
      commitCloseSet: vi.fn(),
      rollbackCloseSet: vi.fn(),
    });

    const preparing = controller.prepareCloseDocuments([first.id, second.id], "application-quit");
    await entered;
    expect(() => first.update((model) => ({ ...model, body: "blocked" }), { actionName: "Type" }))
      .toThrow(/prepared close/);
    expect(() => second.update((model) => ({ ...model, body: "blocked" }), { actionName: "Type" }))
      .toThrow(/prepared close/);
    rejectPresentation(new Error("presentation preparation failed"));
    await expect(preparing).rejects.toThrow("presentation preparation failed");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(() => first.update((model) => ({ ...model, body: "editable" }), { actionName: "Type" }))
      .not.toThrow();
    expect(() => second.update((model) => ({ ...model, body: "editable" }), { actionName: "Type" }))
      .not.toThrow();
  });

  it("releases every selected gate when presentation-set preparation throws synchronously", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "set-sync-throw-first", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "set-sync-throw-second", typeId: noteType.id });
    controller.associateWindow(first.id, { windowControllerId: "set-sync-throw-window", role: "primary" });
    controller.registerCloseReviewer({ review: async () => "discard" });
    controller.registerPresentationCloseCoordinator({
      prepareClose: async () => ({ status: "cancelled", reason: "unused" }),
      commitClose: vi.fn(),
      rollbackClose: vi.fn(),
      prepareCloseSet: () => { throw new Error("synchronous presentation failure"); },
      validateCloseSet: vi.fn(),
      commitCloseSet: vi.fn(),
      rollbackCloseSet: vi.fn(),
    });

    await expect(controller.prepareCloseDocuments([first.id, second.id], "application-quit"))
      .rejects.toThrow("synchronous presentation failure");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(() => first.update((model) => ({ ...model, body: "editable" }), { actionName: "Type" }))
      .not.toThrow();
    expect(() => second.update((model) => ({ ...model, body: "editable" }), { actionName: "Type" }))
      .not.toThrow();
  });

  it("releases every selected gate when presentation returns mismatched document IDs and rollback throws", async () => {
    const { controller } = configuredController();
    const first = await controller.newDocument({ documentId: "set-mismatch-first", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "set-mismatch-second", typeId: noteType.id });
    controller.associateWindow(first.id, { windowControllerId: "set-mismatch-window", role: "primary" });
    controller.registerCloseReviewer({ review: async () => "discard" });
    controller.registerPresentationCloseCoordinator({
      prepareClose: async () => ({ status: "cancelled", reason: "unused" }),
      commitClose: vi.fn(),
      rollbackClose: vi.fn(),
      prepareCloseSet: async () => ({
        status: "ready",
        token: "mismatched-presentation-set",
        documentIds: [first.id, "foreign-document"],
        associationIdsByDocument: { [first.id]: ["set-mismatch-window"] },
      }),
      validateCloseSet: vi.fn(),
      commitCloseSet: vi.fn(),
      rollbackCloseSet: vi.fn(() => { throw new Error("mismatched presentation rollback failed"); }),
    });

    const failure = await controller.prepareCloseDocuments([first.id, second.id], "application-quit")
      .then(() => null, (error: unknown) => error);
    expect(failure).toMatchObject({ code: "document-presentation-close-contract" });
    expect(() => first.update((model) => ({ ...model, body: "editable" }), { actionName: "Type" }))
      .not.toThrow();
    expect(() => second.update((model) => ({ ...model, body: "editable" }), { actionName: "Type" }))
      .not.toThrow();
  });

  it("isolates throwing adapter-watch cleanup across a selected structural commit", async () => {
    const { controller, adapter } = configuredController();
    const firstWatchDispose = vi.fn(() => { throw new Error("first watch cleanup failed"); });
    const secondWatchDispose = vi.fn();
    vi.spyOn(adapter, "watch")
      .mockReturnValueOnce({ dispose: firstWatchDispose })
      .mockReturnValueOnce({ dispose: secondWatchDispose });
    const first = await controller.newDocument({
      documentId: "watch-cleanup-first",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "watch-cleanup", key: "first" },
    });
    const second = await controller.newDocument({
      documentId: "watch-cleanup-second",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "watch-cleanup", key: "second" },
    });
    controller.registerCloseReviewer({ review: async () => "discard" });
    const preparation = await controller.prepareCloseDocuments([first.id, second.id], "application-quit");
    if (preparation.status !== "ready") throw new Error("Expected selected close readiness.");

    expect(() => controller.commitCloseDocuments(preparation)).not.toThrow();
    expect(controller.openDocuments).toEqual([]);
    expect(first.state).toBe("closed");
    expect(second.state).toBe("closed");
    expect(firstWatchDispose).toHaveBeenCalledOnce();
    expect(secondWatchDispose).toHaveBeenCalledOnce();
  });

  it("seals selected close authority before a presentation commit callback can re-enter", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({ documentId: "sealed-set", typeId: noteType.id });
    controller.associateWindow(document.id, { windowControllerId: "sealed-set-window", role: "primary" });
    controller.registerCloseReviewer({ review: async () => "discard" });
    let preparation!: Extract<Awaited<ReturnType<typeof controller.prepareCloseDocuments>>, { status: "ready" }>;
    let mutationError: unknown = null;
    controller.registerPresentationCloseCoordinator({
      prepareClose: async () => ({ status: "cancelled", reason: "unused" }),
      commitClose: vi.fn(),
      rollbackClose: vi.fn(),
      prepareCloseSet: async () => ({
        status: "ready",
        token: "sealed-presentation-set",
        documentIds: [document.id],
        associationIdsByDocument: { [document.id]: ["sealed-set-window"] },
      }),
      validateCloseSet: vi.fn(),
      commitCloseSet: (_presentation, commitDocuments) => {
        void controller.cancelCloseDocuments(preparation);
        try {
          document.update((model) => ({ ...model, body: "reentrant edit" }), { actionName: "Type" });
        } catch (error) {
          mutationError = error;
        }
        commitDocuments();
      },
      rollbackCloseSet: vi.fn(),
    });
    const candidate = await controller.prepareCloseDocuments([document.id], "application-quit");
    if (candidate.status !== "ready") throw new Error("Expected a ready selected close.");
    preparation = candidate;

    expect(controller.commitCloseDocuments(preparation)).toEqual({
      outcome: "closed",
      closedDocumentIds: [document.id],
    });
    expect(mutationError).toMatchObject({ code: "document-unavailable" });
    expect(controller.getDocument(document.id)).toBeNull();
  });

  it("keeps a replacement registration when a stale registration used the same reviewer object", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({ documentId: "generation-safe", typeId: noteType.id });
    const reviewer = { review: vi.fn(async () => "discard" as const) };
    const stale = controller.registerCloseReviewer(reviewer);
    controller.registerCloseReviewer(reviewer);
    stale.dispose();
    await expect(controller.closeDocument(document.id, "user"))
      .resolves.toEqual({ outcome: "closed", documentId: document.id });
    expect(reviewer.review).toHaveBeenCalledOnce();
  });

  it("blocks document mutation while an asynchronous close review is outstanding", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({ documentId: "gated", typeId: noteType.id });
    let finishReview!: (decision: "cancel") => void;
    const review = vi.fn(() => new Promise<"cancel">((resolve) => { finishReview = resolve; }));
    controller.registerCloseReviewer({ review });
    const closing = controller.closeDocument(document.id, "user");
    await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
    expect(() => document.update((model) => ({ ...model, body: "Too late" }), { actionName: "Type" }))
      .toThrow(/prepared close/);
    finishReview("cancel");
    await expect(closing).resolves.toEqual({ outcome: "cancelled", documentId: document.id });
    expect(document.model.body).toBe("");
  });

  it("rejects a presentation commit that never invokes the document callback", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({ documentId: "zero-commit", typeId: noteType.id });
    controller.associateWindow(document.id, { windowControllerId: "window-zero", role: "primary" });
    const rollbackClose = vi.fn();
    controller.registerCloseReviewer({ review: async () => "discard" });
    controller.registerPresentationCloseCoordinator({
      prepareClose: async ({ documentId }) => ({ status: "ready", token: "zero", documentId, associationIds: ["window-zero"] }),
      commitClose: () => undefined,
      rollbackClose,
    });
    await expect(controller.closeDocument(document.id, "window-command"))
      .rejects.toMatchObject({ code: "document-presentation-close-contract" });
    expect(controller.getDocument(document.id)).toBe(document);
    expect(rollbackClose).toHaveBeenCalledOnce();
  });

  it("refuses external save capture under a foreign active close gate", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({
      documentId: "gated-save-as",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "notes", key: "gated-save-as" },
    });
    // A close preparation owns the gate; a save-as without its token is a
    // foreign mutation and must fail even though the document is open.
    await document.beginCloseGate("foreign-gate", documentAdoptionAuthority);
    try {
      await expect(controller.saveAsDocument({
        documentId: document.id,
        destination: { kind: "memory", namespace: "notes", key: "gated-copy" },
      })).rejects.toMatchObject({ code: "document-unavailable" });
      expect(controller.getDocument(document.id)).toBe(document);
    } finally {
      document.endCloseGate("foreign-gate", documentAdoptionAuthority);
    }
    // With the gate released the same save-as succeeds.
    await expect(controller.saveAsDocument({
      documentId: document.id,
      destination: { kind: "memory", namespace: "notes", key: "gated-copy" },
    })).resolves.toMatchObject({ documentId: document.id });
  });
});
