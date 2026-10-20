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
import { attributedContent, createNSETextSnapshot, paragraph, textRun } from "../../src/NSE/Text";
import { TextEditingSession } from "../../src/NSE/TextEditing/TextEditingSession";
import { bindSynWareNSETextEditingSession, createSynWareNSETextOwner } from "../../src/SynCloudOS/AppSDK/SynWareTextAdapter";
import { createSynWareDocumentOutputPreparation } from "../../src/SynCloudOS/AppSDK/SynWareDocumentOutputAdapter";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const content = (value: string) => attributedContent([paragraph([textRun(value)])]);
async function fixture() {
  const runtime = createTestRuntime({ environment: createTestRuntimeEnvironment(), applicationDocuments: { initialTypes: [noteType] } });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("review complete"); });
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.review-owner", version: "1.0.0", displayName: "Review", documentTypes: [{ id: noteType.id, displayName: noteType.displayName }] });
  const mounted = mountTestSynWareRuntime(runtime, "com.example.review-owner");
  cleanups.push(() => mounted.dispose("review complete"));
  const app = createSynWareContextValue(mounted.runtime);
  const documents = app.documents.workspaceDocuments;
  const document = await documents.newDocument<NoteDocumentModel>({ documentId: "review-document", typeId: noteType.id, initialModel: { title: "A", body: "Original" } });
  return { runtime, mounted, app, documents, document };
}
describe("SDK adapter construction targets", () => {
  it("settles the bound session when the caller reuses its binding options", async () => {
    const { app, documents, document } = await fixture();
    const other = await documents.newDocument<NoteDocumentModel>({ typeId: noteType.id, initialModel: { title: "B", body: "Other" } });
    const makeSession = (documentId: string, id: string) => {
      const owner = createSynWareNSETextOwner<NoteDocumentModel>({ documents, documentId, flowId: "body", signal: app.signal,
        readContent: model => content(model.body), writeContent: (model, value) => ({ ...model, body: createNSETextSnapshot(value).text }),
      });
      cleanups.push(() => owner.dispose());
      const session = new TextEditingSession({ id, documentId, owner });
      cleanups.push(() => session.dispose());
      return session;
    };
    const session = makeSession(document.id, "original-binding"), replacement = makeSession(other.id, "replacement-binding");
    const options = { documents, documentId: document.id, session };
    const registration = bindSynWareNSETextEditingSession(options);
    cleanups.push(() => registration.dispose());
    options.session = replacement;
    session.setMarkedText("未確定");
    expect((await documents.settleEditing(document.id, "save")).status).toBe("refused");
    expect(session.getSnapshot().marked?.text).toBe("未確定");
    expect(documents.getDocument<NoteDocumentModel>(document.id)?.model.body).toBe("Original");
  });
  it("keeps a text owner on its originally supplied document port when the caller reuses its options object", async () => {
    const first = await fixture(), second = await fixture();
    const options = { documents: first.documents, documentId: first.document.id, flowId: "body", signal: first.app.signal,
      readContent: (model: Readonly<NoteDocumentModel>) => content(model.body),
      writeContent: (model: Readonly<NoteDocumentModel>, value: ReturnType<typeof content>) => ({ ...model, body: createNSETextSnapshot(value).text }),
    };
    const owner = createSynWareNSETextOwner(options);
    cleanups.push(() => owner.dispose());
    const session = new TextEditingSession({ id: "review-session", documentId: first.document.id, owner });
    cleanups.push(() => session.dispose());
    // Valid typed caller code: factory input is readonly, the caller's own object remains mutable.
    options.documents = second.documents;
    second.documents.transactDocument<NoteDocumentModel>(second.document.id, model => ({ ...model, body: "Other runtime" }), { expectedRevision: second.document.dirtyRevision, actionName: "Other edit" });
    owner.getSnapshot();
    session.select(0); session.insertText("!");
    const actual = { first: first.documents.getDocument<NoteDocumentModel>(first.document.id)!.model.body,
      second: second.documents.getDocument<NoteDocumentModel>(second.document.id)!.model.body, projected: owner.getSnapshot().text };
    console.log("TEXT_TARGET_PROBE", JSON.stringify(actual));
    expect(actual).toEqual({ first: "!Original", second: "Other runtime", projected: "!Original" });
  });
  it("captures the same document it settled when selection options change during an async barrier", async () => {
    const { app, documents, document } = await fixture();
    const other = await documents.newDocument<NoteDocumentModel>({ documentId: "review-other", typeId: noteType.id, initialModel: { title: "B", body: "Other committed" } });
    const owner = createSynWareNSETextOwner<NoteDocumentModel>({ documents, documentId: other.id, flowId: "body", signal: app.signal,
      readContent: model => content(model.body), writeContent: (model, value) => ({ ...model, body: createNSETextSnapshot(value).text }),
    });
    cleanups.push(() => owner.dispose());
    const session = new TextEditingSession({ id: "other-session", documentId: other.id, owner });
    cleanups.push(() => session.dispose());
    bindSynWareNSETextEditingSession({ documents, documentId: other.id, session });
    session.setMarkedText("未確定");
    expect((await documents.settleEditing(other.id, "export")).status).toBe("refused");
    let enter!: () => void, finish!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    documents.registerEditingParticipant(document.id, { id: "first-only", async settle() { enter(); await gate; return { status: "settled" }; } });
    const options = { documents, documentId: document.id, signal: app.signal };
    const output = createSynWareDocumentOutputPreparation<NoteDocumentModel>(options);
    const engine = vi.fn(() => ({ pages: [{ geometry: { width: 72, height: 72 }, draw() {} }] }));
    const pending = output.prepare({ engine });
    await entered; options.documentId = other.id; finish();
    const result = await pending;
    if (result.status === "prepared") {
      const actual = { documentId: result.output.snapshot.documentId, body: result.output.snapshot.model.body,
        otherMarked: session.getSnapshot().marked?.text, engineCalls: engine.mock.calls.length };
      result.output.release();
      console.log("OUTPUT_TARGET_PROBE", JSON.stringify(actual));
      expect(actual.documentId).toBe(document.id);
    } else expect(result.status).toBe("prepared");
  });
});
