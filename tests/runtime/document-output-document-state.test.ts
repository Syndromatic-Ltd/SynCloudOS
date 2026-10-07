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

import { expect, it } from "vitest";
import { createDocumentOutputPreparation } from "../../src/SynCloudOS/Documents/DocumentOutputPreparation";
import { noteType } from "../fixtures/noteDocumentType";
import { editDocumentFixture } from "../fixtures/documentEditFixture";

it.each(["success", "failure", "cancel"] as const)("preserves native dirty state and document history after output %s", async ending => {
  const { document, cleanup } = editDocumentFixture(noteType);
  const undoManager = document.undoManager;
  try {
    document.update(model => ({ ...model, body: "unsaved output text" }), { actionName: "Type" });
    const before = document.snapshot();
    const beforeHistory = undoManager.inspect();
    const controller = new AbortController();
    const prepared = await createDocumentOutputPreparation({
      settle: () => ({ status: "settled" }), capture: () => ({ documentId: document.id, revision: document.dirtyRevision, model: document.model }),
    }).prepare({ signal: controller.signal, engine: () => ({ pages: [{ geometry: { width: 100, height: 200 }, draw() {
      if (ending === "failure") throw new Error("fault injected drawing");
      if (ending === "cancel") controller.abort();
    } }] }) });
    if (prepared.status !== "prepared") throw new Error("Output fixture failed");
    const result = await prepared.output.exportPDF();
    expect(result.status).toBe(ending === "success" ? "exported" : ending === "cancel" ? "canceled" : "failed");
    expect(document.snapshot()).toEqual(before);
    expect(document.hasUnsavedChanges).toBe(true);
    expect(document.currentVersion).toBeNull();
    expect(undoManager.inspect()).toEqual(beforeHistory);
    await undoManager.undo();
    expect(document.model.body).toBe("");
  } finally { await cleanup(); }
});

it("captures the canonical revision after the real document editing barrier commits a draft", async () => {
  const { document, cleanup } = editDocumentFixture(noteType);
  try {
    document.registerEditingParticipant({ id: "field-draft", settle(context) {
      const result = context.transact(model => ({ ...model, body: "committed field draft" }), {
        expectedRevision: document.dirtyRevision, actionName: "Commit field draft",
      });
      expect(result.status).toBe("committed");
      return { status: "settled" };
    } });
    const prepared = await createDocumentOutputPreparation({
      settle: (purpose, signal) => document.settleEditing(purpose, signal),
      capture: () => ({ documentId: document.id, revision: document.dirtyRevision, model: document.model }),
    }).prepare({ engine: snapshot => {
      expect(snapshot.model.body).toBe("committed field draft");
      return { pages: [{ geometry: { width: 100, height: 200 }, draw() {} }] };
    } });
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") throw new Error("Settlement integration failed");
    expect(prepared.output.receipt.revision).toBe(document.dirtyRevision);
    expect((await prepared.output.exportPDF()).status).toBe("exported");
    expect(document.hasUnsavedChanges).toBe(true);
    expect(document.undoManager.inspect().entries).toHaveLength(1);
    await document.undoManager.undo();
    expect(document.model.body).toBe("");
  } finally { await cleanup(); }
});

it("preserves legitimate draft commits when a later real editing participant refuses output", async () => {
  const { document, cleanup } = editDocumentFixture(noteType);
  try {
    document.registerEditingParticipant({ id: "first-draft", settle(context) {
      context.transact(model => ({ ...model, body: "legitimate earlier commitment" }), {
        expectedRevision: document.dirtyRevision, actionName: "Commit field",
      });
      return { status: "settled" };
    } });
    document.registerEditingParticipant({ id: "ime", settle: () => ({ status: "refused", reason: "IME draft retained" }) });
    let captures = 0;
    const result = await createDocumentOutputPreparation({
      settle: (purpose, signal) => document.settleEditing(purpose, signal), capture: () => {
        captures++;
        return { documentId: document.id, revision: document.dirtyRevision, model: document.model };
      },
    }).prepare({ engine: () => ({ pages: [{ geometry: { width: 100, height: 200 }, draw() {} }] }) });
    expect(result.status).toBe("refused");
    if (result.status === "prepared") throw new Error("Expected participant refusal");
    expect(result.receipt.reason).toBe("IME draft retained");
    expect(captures).toBe(0);
    expect(document.model.body).toBe("legitimate earlier commitment");
    expect(document.hasUnsavedChanges).toBe(true);
    expect(document.undoManager.inspect().entries).toHaveLength(1);
  } finally { await cleanup(); }
});
