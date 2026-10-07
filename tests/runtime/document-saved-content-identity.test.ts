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
import { editDocumentFixture, editingControllerFixture } from "../fixtures/documentEditFixture";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture(maxEntries = 100) { const f = editDocumentFixture(noteType, undefined, maxEntries); cleanups.push(f.cleanup); return f; }

describe("saved content identity", () => {
  it("adopts a differing conflict-local model at a new revision and recovers exactly that native content", async () => {
    const { document, dependencies } = fixture(); await document.save({ reason: "explicit" });
    document.update(model => ({ ...model, body: "old edit" }), { actionName: "Old edit" });
    const previousRevision = document.dirtyRevision;
    document.enterConflict({ base: document.lastSavedRecord, localModel: { ...document.model, body: "conflict local" }, remote: document.lastSavedRecord });
    expect(document.dirtyRevision).toBe(previousRevision + 1); expect(document.undoManager.canUndo).toBe(false);
    expect(document.state).toBe("conflicted"); expect(document.hasUnsavedChanges).toBe(true);
    expect(document.transact(model => ({ ...model, body: "stale" }), { expectedRevision: previousRevision, actionName: "Stale" }).status).toBe("rejected");
    await document.flushRecovery();
    const recovery = await dependencies.recovery.read(JSON.stringify([dependencies.persistenceNamespace, document.id]));
    expect(recovery?.dirtyRevision).toBe(document.dirtyRevision); expect(recovery?.serializedContent).toEqual(document.model);
    await document.revert(); expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean");
  });

  it("preserves the revision and existing history when conflict local content is unchanged", () => {
    const { document } = fixture(); document.update(model => ({ ...model, body: "same" }), { actionName: "Edit" });
    const revision = document.dirtyRevision;
    document.enterConflict({ base: null, localModel: { ...document.model }, remote: null });
    expect(document.dirtyRevision).toBe(revision); expect(document.undoManager.canUndo).toBe(true); expect(document.hasUnsavedChanges).toBe(true);
  });

  it("advances conflict adoption revision for model changes even when normalized native identity is equal", async () => {
    const type = { ...noteType, write: (model: Readonly<NoteDocumentModel>) => ({ ...model, body: model.body.trim() }) };
    const { document, cleanup } = editDocumentFixture(type); cleanups.push(cleanup); await document.save({ reason: "explicit" });
    document.enterConflict({ base: document.lastSavedRecord, localModel: { ...document.model, body: "  " }, remote: document.lastSavedRecord });
    expect(document.dirtyRevision).toBe(1); expect(document.hasUnsavedChanges).toBe(true);
    await document.revert(); expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean");
  });

  it("rejects invalid conflict-local adoption before changing model, identity or history", () => {
    const { document } = fixture(); const before = document.snapshot(); const observer = vi.fn(); document.subscribe(observer);
    expect(() => document.enterConflict({ base: null, localModel: { ...document.model, body: 4 as unknown as string }, remote: null })).toThrow();
    expect(document.snapshot()).toBe(before); expect(observer).not.toHaveBeenCalled(); expect(document.undoManager.canUndo).toBe(false);
  });

  it("save A, edit B, undo A is native-clean while the mutation revision advances", async () => {
    const { document } = fixture(); await document.save({ reason: "explicit" });
    document.update((m) => ({ ...m, body: "B" }), { actionName: "B" });
    await document.undoManager.undo(); expect(document.dirtyRevision).toBe(2); expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean");
    await document.undoManager.redo(); expect(document.dirtyRevision).toBe(3); expect(document.hasUnsavedChanges).toBe(true);
  });

  it("recognizes saved content even when its undo clean cursor was evicted", async () => {
    const { document } = fixture(1); await document.save({ reason: "explicit" });
    document.update((m) => ({ ...m, body: "B" }), { actionName: "B" });
    document.update((m) => ({ ...m, body: "" }), { actionName: "A again" });
    expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean"); expect(document.undoManager.isDirty).toBe(true);
  });

  it("keeps a newer edit dirty during an asynchronous save, then recognizes undo to the saved snapshot", async () => {
    const { document, adapter } = fixture();
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const write = adapter.write.bind(adapter);
    vi.spyOn(adapter, "write").mockImplementationOnce(async (request) => { entered(); await gate; return write(request); });
    document.update((m) => ({ ...m, body: "A" }), { actionName: "A" });
    const saving = document.save({ reason: "explicit" }); await started;
    document.update((m) => ({ ...m, body: "B" }), { actionName: "B" }); release(); await saving;
    expect(document.hasUnsavedChanges).toBe(true); expect(document.state).toBe("dirty");
    await document.undoManager.undo(); expect(document.model.body).toBe("A"); expect(document.hasUnsavedChanges).toBe(false);
  });

  it("keeps conflicts independent of native content identity", async () => {
    const { document } = fixture(); await document.save({ reason: "explicit" });
    document.enterConflict({ base: document.lastSavedRecord, localModel: document.model, remote: document.lastSavedRecord });
    expect(document.hasUnsavedChanges).toBe(true); expect(document.state).toBe("conflicted");
  });

  it("uses serialized native content identity when an application normalizes its model", async () => {
    const type = { ...noteType, write: (model: Readonly<{ title: string; body: string }>) => ({ ...model, body: model.body.trim() }) };
    const { document, cleanup } = editDocumentFixture(type); cleanups.push(cleanup);
    await document.save({ reason: "explicit" });
    document.update((m) => ({ ...m, body: "  " }), { actionName: "Whitespace projection" });
    expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean");
  });

  it("keeps synchronization pending independently dirty even when native content matches", async () => {
    const { document, adapter } = fixture();
    Object.assign(adapter, { isSynchronisationPending: () => true });
    await document.save({ reason: "explicit" });
    expect(document.hasUnsavedChanges).toBe(true); expect(document.state).toBe("dirty");
  });

  it("finishes clean if an edit is undone to the captured content while save is still in flight", async () => {
    const { document, adapter } = fixture();
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const write = adapter.write.bind(adapter);
    vi.spyOn(adapter, "write").mockImplementationOnce(async (request) => { entered(); await gate; return write(request); });
    const saving = document.save({ reason: "explicit" }); await started;
    document.update((m) => ({ ...m, body: "B" }), { actionName: "B" }); await document.undoManager.undo();
    release(); await saving;
    expect(document.dirtyRevision).toBe(2); expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean");
  });

  it("adopts Save As clean when the current content returns to the captured snapshot", async () => {
    const { controller, adapter, cleanup } = editingControllerFixture(); cleanups.push(cleanup);
    const document = await controller.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const write = adapter.write.bind(adapter);
    vi.spyOn(adapter, "write").mockImplementationOnce(async (request) => { entered(); await gate; return write(request); });
    const saving = controller.saveAsDocument({ documentId: document.id, destination: { kind: "memory", namespace: "identity", key: "save-as" } }); await started;
    document.update((m) => ({ ...m, body: "B" }), { actionName: "B" }); await document.undoManager.undo();
    release(); await saving;
    expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean");
  });
});
