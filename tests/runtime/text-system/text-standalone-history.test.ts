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

import { describe, expect, it } from "vitest";
import { createUndoableNSETextOwner } from "../../../src/NSE/TextEditing/standaloneTextHistory";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { attributedContent, paragraph, textRun } from "../../../src/NSE/Text";
import { translateBackendContent } from "../../../src/NSE/TextEditing/backends/backendChangeTranslator";
import { SynCloudOSLifecycleError } from "../../../src/SynCloudOS/nseRuntimeContracts";
describe("standalone text history", () => {
  it("identifies disposed owner and history operations", async () => {
    const owner = createUndoableNSETextOwner({ flowId: "history" });
    owner.dispose(); owner.dispose();
    const actions = {
      getSnapshot: () => owner.getSnapshot(), subscribe: () => owner.subscribe(() => {}),
      commit: () => owner.commit({ expectedRevision: 0, operations: [] }),
    };
    for (const [operation, action] of Object.entries(actions)) {
      expect(action).toThrow(SynCloudOSLifecycleError);
      expect(action).toThrow(expect.objectContaining({ code: "NSE_TEXT_HISTORY_OWNER_DISPOSED", operation, disposal: expect.objectContaining({ reason: "explicit" }) }));
    }
    for (const [operation, action] of Object.entries({ getSnapshot: () => owner.history.getSnapshot(), subscribe: () => owner.history.subscribe(() => {}) })) {
      expect(action).toThrow(SynCloudOSLifecycleError);
      expect(action).toThrow(expect.objectContaining({ code: "NSE_TEXT_HISTORY_OWNER_DISPOSED", operation }));
    }
    for (const operation of ["undo", "redo"] as const) {
      await expect(owner.history[operation]()).rejects.toBeInstanceOf(SynCloudOSLifecycleError);
      await expect(owner.history[operation]()).rejects.toMatchObject({ code: "NSE_TEXT_HISTORY_OWNER_DISPOSED", operation });
    }
  });
  it("replays structural paragraph changes even when flat text is identical", async () => {
    const hard = attributedContent([paragraph([textRun("one\ntwo")])]);
    const blocks = attributedContent([paragraph([textRun("one")]), paragraph([textRun("two")])]);
    const owner = createUndoableNSETextOwner({ content: hard });
    owner.commit({ expectedRevision: 0, operations: translateBackendContent(owner.getSnapshot(), blocks) });
    expect(owner.getSnapshot().attributedContent).toEqual(blocks);
    await owner.history.undo(); expect(owner.getSnapshot().attributedContent).toEqual(hard);
    await owner.history.redo(); expect(owner.getSnapshot().attributedContent).toEqual(blocks);
    owner.dispose();
  });
  it("uses the existing history manager without backend history or document runtime", async () => {
    const owner = createUndoableNSETextOwner({ flowId: "note" });
    const first = new TextEditingSession({ id: "first", textOwner: owner, history: owner.history });
    const second = new TextEditingSession({ id: "second", textOwner: owner, history: owner.history });
    first.insertText("hello"); second.select(5); second.insertText("!");
    expect(owner.history.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });
    await first.requestHistory("undo"); expect(owner.getSnapshot().text).toBe("hello");
    await second.requestHistory("redo"); expect(owner.getSnapshot().text).toBe("hello!");
    owner.dispose(); await expect(first.requestHistory("undo")).rejects.toThrow();
  });
  it("does not register no-op or rejected content", () => {
    const owner = createUndoableNSETextOwner();
    owner.commit({ expectedRevision: 0, operations: [] });
    expect(owner.history.getSnapshot().canUndo).toBe(false);
    expect(() => owner.commit({ expectedRevision: 4, operations: [] })).toThrow();
    expect(owner.history.getSnapshot().canUndo).toBe(false);
  });
});
