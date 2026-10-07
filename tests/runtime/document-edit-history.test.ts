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
import { editDocumentFixture } from "../fixtures/documentEditFixture";
import { noteType } from "../fixtures/noteDocumentType";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture(maxEntries = 100) { const f = editDocumentFixture(noteType, undefined, maxEntries); cleanups.push(f.cleanup); return f; }

describe("document transaction history", () => {
  it("restores model before delivering immutable semantic selection receipts", async () => {
    const { document } = fixture(); const states: string[] = [];
    const restore = vi.fn((receipt) => { states.push(document.model.body); expect(Object.isFrozen(receipt.bookmark)).toBe(true); });
    document.transact((m) => ({ ...m, body: "after" }), { expectedRevision: 0, actionName: "Type", selection: { before: { flowId: "body", offset: 0 }, after: { flowId: "body", offset: 5 } }, restoreSelection: restore });
    await document.undoManager.undo(); await document.undoManager.redo();
    expect(states).toEqual(["", "after"]);
    expect(restore.mock.calls.map(([r]) => [r.direction, r.bookmark.offset, r.revision])).toEqual([["undo", 0, 2], ["redo", 5, 3]]);
  });

  it("restores content when the originating view has gone and isolates restoration failures", async () => {
    const { document } = fixture();
    document.transact((m) => ({ ...m, body: "after" }), { expectedRevision: 0, actionName: "Type", selection: { before: { deletedTarget: "old-window" } }, restoreSelection: () => { throw new Error("view gone"); } });
    expect(await document.undoManager.undo()).toMatchObject({ status: "completed" });
    expect(document.model.body).toBe(""); expect(document.undoManager.inspect().lastFailure).toBeNull();
  });

  it("coalesces matching typing but ends the lineage at save and non-undoable adoption", async () => {
    const { document } = fixture();
    const type = (body: string) => document.transact((m) => ({ ...m, body }), { expectedRevision: document.dirtyRevision, actionName: "Type", coalescingKey: "body:session:selection:format" });
    type("a"); type("ab"); expect(document.undoManager.inspect().entries).toHaveLength(1);
    await document.save({ reason: "explicit" }); type("abc"); expect(document.undoManager.inspect().entries).toHaveLength(2);
    document.update((m) => ({ ...m, body: "adopted" }), { actionName: "Adopt", recordUndo: false });
    expect(document.undoManager.canUndo).toBe(false);
  });

  it("releases history resource roots on redo truncation and bounded eviction", async () => {
    const { document } = fixture(1); const first = vi.fn(); const second = vi.fn();
    const edit = (body: string, release: () => void) => document.transact((m) => ({ ...m, body }), { expectedRevision: document.dirtyRevision, actionName: body, retainResources: () => ({ resourceIds: [body], release }) });
    expect(edit("one", first)).toMatchObject({ retainedResourceIds: ["one"] });
    await document.undoManager.undo(); edit("two", second); expect(first).toHaveBeenCalledOnce();
    edit("three", vi.fn()); expect(second).toHaveBeenCalledOnce(); expect(document.model.body).toBe("three");
  });

  it("rejects non-undoable reentrant adoption during replay", async () => {
    const { document } = fixture(); document.update((m) => ({ ...m, body: "one" }), { actionName: "One" });
    let refused = false;
    document.subscribe(() => {
      if (!document.undoManager.isExecuting) return;
      try { document.update((m) => ({ ...m, body: "corrupt" }), { actionName: "Adopt", recordUndo: false }); }
      catch { refused = true; }
    });
    expect(await document.undoManager.undo()).toMatchObject({ status: "completed" });
    expect(refused).toBe(true); expect(document.model.body).toBe(""); expect(document.undoManager.canRedo).toBe(true);
  });
});
