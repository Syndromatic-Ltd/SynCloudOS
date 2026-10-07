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
import type { DocumentType } from "../../src/SynCloudOS/Documents/documentTypes";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() { const result = editDocumentFixture(noteType); cleanups.push(result.cleanup); return result; }

describe("staged document transactions", () => {
  it("admits mounted transaction history through the supplied existing registration partition", async () => {
    const { document } = fixture();
    const partition = document.undoManager.createRegistrationLease();
    const sibling = document.undoManager.createRegistrationLease();
    const result = document.transact((model) => ({ ...model, body: "Mounted" }), { expectedRevision: 0, actionName: "Mounted" }, {
      isCurrent: () => true, reserveHistory: () => partition.reserve(),
    });
    expect(result.status).toBe("committed"); expect(partition.canUndo).toBe(true); expect(sibling.canUndo).toBe(false);
    await partition.undo(); expect(document.model.body).toBe("");
    await partition.redo(); expect(document.model.body).toBe("Mounted");
  });

  it("fences private mount admission after application validation and retention before history commitment", () => {
    const { document } = fixture(); const before = document.snapshot(); let current = true;
    const partition = document.undoManager.createRegistrationLease(); const release = vi.fn();
    const result = document.transact((model) => ({ ...model, body: "revoked" }), {
      expectedRevision: 0, actionName: "Revoked", retainResources: () => { current = false; return { resourceIds: [], release }; },
    }, { isCurrent: () => current, reserveHistory: () => partition.reserve() });
    expect(result.status).toBe("rejected"); expect(document.snapshot()).toBe(before);
    expect(partition.canUndo).toBe(false); expect(document.undoManager.canUndo).toBe(false); expect(release).toHaveBeenCalledOnce();
  });

  it("publishes a three-flow transform with metadata once and admits one undo action", async () => {
    const model = { flows: ["alpha", "beta", "gamma"], object: { caption: "before" } };
    const type: DocumentType<typeof model> = {
      ...noteType, id: "test.flows", create: () => model,
      write: (value) => value, read: (value) => value,
      validate: (value): value is typeof model => Boolean(value && typeof value === "object" && "flows" in value),
    };
    const { document, cleanup } = editDocumentFixture(type); cleanups.push(cleanup);
    const observe = vi.fn(); document.subscribe(observe);
    const result = document.transact((current) => ({
      flows: current.flows.map((text) => text.toUpperCase()), object: { caption: "after" },
    }), { expectedRevision: 0, actionName: "Edit article" });
    expect(result).toMatchObject({ status: "committed", beforeRevision: 0, afterRevision: 1, documentId: document.id });
    expect(observe).toHaveBeenCalledOnce();
    expect(document.undoManager.inspect().entries).toMatchObject([{ actionCount: 1, name: "Edit article" }]);
    expect(Object.isFrozen(document.model.flows)).toBe(true);
    await document.undoManager.undo(); expect(document.model).toEqual(model);
    await document.undoManager.redo(); expect(document.model.flows).toEqual(["ALPHA", "BETA", "GAMMA"]);
  });

  it("rejects a stale base without invoking the transform", () => {
    const { document } = fixture(); document.update((m) => ({ ...m, body: "new" }), { actionName: "New" });
    const transform = vi.fn((m: Readonly<NoteDocumentModel>) => ({ ...m, body: "stale" }));
    const before = document.snapshot(); const history = document.undoManager.inspect();
    expect(document.transact(transform, { expectedRevision: 0, actionName: "Stale" })).toMatchObject({ status: "rejected", reason: "stale" });
    expect(transform).not.toHaveBeenCalled(); expect(document.snapshot()).toBe(before); expect(document.undoManager.inspect()).toEqual(history);
  });

  it.each(["schema", "validator", "transform", "reservation", "admission", "retention"])("keeps canonical state and history unchanged on %s failure", (failure) => {
    const { document } = fixture(); const before = document.snapshot(); const history = document.undoManager.inspect();
    const release = vi.fn();
    if (failure === "reservation") vi.spyOn(document.undoManager, "reserve").mockImplementationOnce(() => { throw new Error("reservation fault"); });
    if (failure === "admission") vi.spyOn(document.undoManager, "reserve").mockReturnValueOnce({ commit: () => { throw new Error("admission fault"); }, cancel: vi.fn() });
    const result = document.transact((m) => {
      if (failure === "transform") throw new Error("transform fault");
      return { ...m, body: failure === "schema" ? 4 as unknown as string : "next" };
    }, {
      expectedRevision: 0, actionName: "Fault",
      validateModel: () => { if (failure === "validator") throw new Error("invalid reference"); },
      retainResources: () => { if (failure === "retention") throw new Error("resource fault"); return { resourceIds: ["asset"], release }; },
    });
    expect(result.status).toBe("rejected"); expect(document.snapshot()).toBe(before); expect(document.undoManager.inspect()).toEqual(history);
    if (failure === "admission") expect(release).toHaveBeenCalledOnce();
  });

  it("revalidates cancellation and revision after staging", () => {
    const { document } = fixture(); const abort = new AbortController();
    expect(document.transact((m) => { abort.abort(); return { ...m, body: "aborted" }; }, { expectedRevision: 0, actionName: "Abort", signal: abort.signal }))
      .toMatchObject({ status: "rejected", reason: "aborted" });
    expect(document.dirtyRevision).toBe(0);
    expect(document.transact((m) => { document.update((current) => ({ ...current, body: "newer" }), { actionName: "Concurrent" }); return { ...m, body: "old" }; }, { expectedRevision: 0, actionName: "Stale" }))
      .toMatchObject({ status: "rejected", reason: "unavailable" });
    expect(document.model.body).toBe(""); // reentrant staging cannot publish either edit
    expect(document.undoManager.canUndo).toBe(false);
  });

  it("rejects asynchronous transforms without publishing", () => {
    const { document } = fixture();
    expect(document.transact((async (m: NoteDocumentModel) => ({ ...m, body: "late" })) as never, { expectedRevision: 0, actionName: "Async" }))
      .toMatchObject({ status: "rejected", reason: "invalid" });
    expect(document.model.body).toBe("");
  });

  it("rejects closed and projection documents and exposes controller transactions", async () => {
    const { controller, cleanup } = editingControllerFixture(); cleanups.push(cleanup);
    const projection = await controller.newProjectionDocument<NoteDocumentModel>({ typeId: noteType.id, initialModel: { title: "Read", body: "Only" } });
    expect(controller.transactDocument<NoteDocumentModel>(projection.id, (m) => ({ ...m, body: "edit" }), { expectedRevision: 0, actionName: "Edit" }))
      .toMatchObject({ status: "rejected", reason: "read-only" });
    const { document } = fixture(); await document.markClosed();
    expect(document.transact((m) => m, { expectedRevision: 0, actionName: "Closed" })).toMatchObject({ status: "rejected", reason: "unavailable" });
  });

  it("rejects unsafe existing history before mutation", async () => {
    const { document } = fixture(); document.update((m) => ({ ...m, body: "one" }), { actionName: "One" });
    await document.markClosed(); await document.undoManager.undo();
    expect(document.undoManager.inspect().lastFailure).not.toBeNull();
    expect(document.transact((m) => ({ ...m, body: "two" }), { expectedRevision: 1, actionName: "Two" })).toMatchObject({ status: "rejected" });
    expect(document.model.body).toBe("one");
  });

  it("reports committed content even if post-publication recovery scheduling fails", () => {
    const { document, dependencies } = fixture(); const observe = vi.fn(); document.subscribe(observe);
    vi.spyOn(dependencies.environment, "setTimeout").mockImplementationOnce(() => { throw new Error("timer fault"); });
    const result = document.transact((m) => ({ ...m, body: "published" }), { expectedRevision: 0, actionName: "Publish" });
    expect(result.status).toBe("committed"); expect(document.model.body).toBe("published"); expect(observe).toHaveBeenCalledOnce(); expect(document.undoManager.canUndo).toBe(true);
  });

  it("rejects asynchronous retention before admitting unretained history", () => {
    const { document } = fixture();
    expect(document.transact((m) => ({ ...m, body: "asset" }), { expectedRevision: 0, actionName: "Insert", retainResources: (async () => ({ resourceIds: ["asset"], release: vi.fn() })) as never }))
      .toMatchObject({ status: "rejected", reason: "invalid" });
    expect(document.dirtyRevision).toBe(0); expect(document.undoManager.canUndo).toBe(false);
  });
});
