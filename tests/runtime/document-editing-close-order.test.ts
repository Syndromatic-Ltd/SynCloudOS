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
import { editingControllerFixture } from "../fixtures/documentEditFixture";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() { const f = editingControllerFixture(); cleanups.push(f.cleanup); return f; }

describe("editing barriers precede lifecycle decisions", () => {
  it("settles before dirty review and presentation preparation while retaining the mutation gate", async () => {
    const { controller } = fixture(); const order: string[] = [];
    const document = await controller.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    controller.associateWindow(document.id, { windowControllerId: "window", role: "primary" });
    controller.registerEditingParticipant<NoteDocumentModel>(document.id, { id: "draft", settle: (context) => {
      order.push("settle"); expect(context.transact((m) => ({ ...m, body: "draft" }), { expectedRevision: document.dirtyRevision, actionName: "Commit field" }).status).toBe("committed"); return { status: "settled" };
    } });
    controller.registerCloseReviewer({ review: async () => { order.push("review"); expect(document.model.body).toBe("draft"); return "discard"; } });
    controller.registerPresentationCloseCoordinator({
      prepareClose: async () => { order.push("prepare"); expect(() => document.update((m) => m, { actionName: "Illegal" })).toThrow("prepared close"); return { status: "ready", token: "presentation", documentId: document.id, associationIds: ["window"] }; },
      commitClose: (_p, commit) => commit(), rollbackClose: vi.fn(),
    });
    expect(await controller.closeDocument(document.id, "window-command")).toMatchObject({ outcome: "closed" }); expect(order).toEqual(["settle", "review", "prepare"]);
  });

  it("keeps a refused draft and earlier committed field open without presentation preparation", async () => {
    const { controller } = fixture(); const document = await controller.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    controller.associateWindow(document.id, { windowControllerId: "window", role: "primary" });
    controller.registerEditingParticipant<NoteDocumentModel>(document.id, { id: "good", settle: (context) => { context.transact((m) => ({ ...m, body: "committed" }), { expectedRevision: document.dirtyRevision, actionName: "Commit" }); return { status: "settled" }; } });
    const discard = vi.fn(); controller.registerEditingParticipant(document.id, { id: "bad", settle: () => ({ status: "refused", reason: "invalid font" }), discard });
    const prepareClose = vi.fn(); controller.registerPresentationCloseCoordinator({ prepareClose, commitClose: vi.fn(), rollbackClose: vi.fn() });
    expect(await controller.closeDocument(document.id, "user")).toMatchObject({ outcome: "refused", reason: "editing-refused" });
    expect(controller.getDocument(document.id)).toBe(document); expect(document.model.body).toBe("committed"); expect(prepareClose).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled();
    document.update((m) => ({ ...m, body: "still editable" }), { actionName: "Continue" });
  });

  it("settles Save As before capture and blocks revert on composing refusal", async () => {
    const { controller, adapter } = fixture(); const document = await controller.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    const settle = vi.fn((context) => { context.transact((m: NoteDocumentModel) => ({ ...m, body: "saved draft" }), { expectedRevision: document.dirtyRevision, actionName: "Draft" }); return { status: "settled" as const }; });
    const registration = controller.registerEditingParticipant<NoteDocumentModel>(document.id, { id: "draft", settle });
    const destination = { kind: "memory", namespace: "editing", key: "save-as" } as const;
    await controller.saveAsDocument({ documentId: document.id, destination });
    expect(settle.mock.calls[0]?.[0].reason).toBe("save-as"); expect((await adapter.read<NoteDocumentModel>(destination))?.content.body).toBe("saved draft");
    registration.dispose(); document.update((m) => ({ ...m, body: "keep draft" }), { actionName: "Type" });
    controller.registerEditingParticipant(document.id, { id: "ime", settle: () => ({ status: "refused", reason: "composing" }) });
    await expect(controller.revertDocument(document.id)).rejects.toMatchObject({ settlement: { status: "refused" } }); expect(document.model.body).toBe("keep draft");
  });

  it("settles the whole selected set before presentation prepareCloseSet", async () => {
    const { controller } = fixture(); const order: string[] = [];
    const documents = await Promise.all(["a", "b"].map((documentId) => controller.newDocument<NoteDocumentModel>({ documentId, typeId: noteType.id })));
    for (const document of documents) {
      controller.associateWindow(document.id, { windowControllerId: `window-${document.id}`, role: "primary" });
      controller.registerEditingParticipant<NoteDocumentModel>(document.id, { id: "draft", settle: async (context) => {
        await Promise.resolve(); order.push(document.id); expect(context.transact((m) => ({ ...m, body: "committed" }), { expectedRevision: document.dirtyRevision, actionName: "Field" }).status).toBe("committed"); return { status: "settled" };
      } });
    }
    controller.registerCloseReviewer({ review: async () => "discard" });
    controller.registerPresentationCloseCoordinator({
      prepareClose: vi.fn(), commitClose: vi.fn(), rollbackClose: vi.fn(),
      prepareCloseSet: async () => { order.push("presentations"); expect(documents.map((d) => d.model.body)).toEqual(["committed", "committed"]); return { status: "ready", token: "set", documentIds: ["a", "b"], associationIdsByDocument: { a: ["window-a"], b: ["window-b"] } }; },
      validateCloseSet: () => {}, commitCloseSet: (_p, commit) => commit(), rollbackCloseSet: vi.fn(),
    });
    const preparation = await controller.prepareCloseDocuments(["a", "b"], "user");
    expect(preparation.status).toBe("ready"); expect(order).toEqual(["a", "b", "presentations"]);
    if (preparation.status === "ready") await controller.cancelCloseDocuments(preparation);
  });

  it("revokes window-scoped participants when their window dissociates", async () => {
    const { controller } = fixture(); const document = await controller.newDocument({ typeId: noteType.id });
    controller.associateWindow(document.id, { windowControllerId: "window", role: "primary" });
    const settle = vi.fn(() => ({ status: "settled" as const }));
    const registration = controller.registerEditingParticipant(document.id, { id: "field", settle }, { windowControllerId: "window", mountId: "mount" });
    controller.dissociateWindow(document.id, "window"); expect(registration.isLive).toBe(false);
    await controller.settleEditing(document.id, "transition"); expect(settle).not.toHaveBeenCalled();
  });

  it("retains all documents when closeAll encounters a refused draft", async () => {
    const { controller } = fixture(); const first = await controller.newDocument<NoteDocumentModel>({ documentId: "first", typeId: noteType.id });
    const second = await controller.newDocument<NoteDocumentModel>({ documentId: "second", typeId: noteType.id });
    controller.registerEditingParticipant(first.id, { id: "invalid", settle: () => ({ status: "refused", reason: "draft invalid" }) });
    controller.registerCloseReviewer({ review: async () => "discard" });
    expect(await controller.closeAll("application-quit")).toMatchObject({ outcome: "refused", reason: "editing-refused", closedDocumentIds: [] });
    expect(controller.getDocument(first.id)).toBe(first); expect(controller.getDocument(second.id)).toBe(second);
  });

  it("forwards cancellation to revert reads without replacing newer content", async () => {
    const { controller, adapter } = fixture(); const location = { kind: "memory", namespace: "cancel", key: "source" } as const;
    const document = await controller.newDocument<NoteDocumentModel>({ typeId: noteType.id, location }); await controller.saveDocument(document.id);
    document.update((m) => ({ ...m, body: "new" }), { actionName: "Edit" });
    let started!: () => void; const entered = new Promise<void>((resolve) => { started = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = adapter.read.bind(adapter); const caller = new AbortController();
    vi.spyOn(adapter, "read").mockImplementationOnce(async (where, options) => { expect(options?.signal).toBeDefined(); started(); await gate; return read(where); });
    const reverting = controller.revertDocument(document.id, undefined, caller.signal); await entered; caller.abort(); release();
    await expect(reverting).rejects.toMatchObject({ code: "document-aborted" }); expect(document.model.body).toBe("new");
  });
});
