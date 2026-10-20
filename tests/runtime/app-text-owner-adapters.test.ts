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
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { bindSynWareNSETextEditingSession, createSynWareNSETextOwner } from "../../src/SynCloudOS/AppSDK/SynWareTextAdapter";
import { createSynWareDocumentOutputPreparation } from "../../src/SynCloudOS/AppSDK/SynWareDocumentOutputAdapter";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters";
import type { DocumentOutputPlan, DocumentOutputSnapshot } from "../../src/SynCloudOS/Documents/documentOutputTypes";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const content = (text: string) => attributedContent([paragraph([textRun(text)])]);
const blankPages = (): DocumentOutputPlan<NoteDocumentModel> => ({ pages: [{ geometry: { width: 100, height: 200 }, draw() {} }] });

async function fixture() {
  const environment = createTestRuntimeEnvironment();
  const adapter = new InMemoryDocumentAdapter(environment);
  const runtime = createTestRuntime({ id: "runtime:sdk-text-adapters", environment, applicationDocuments: { initialTypes: [noteType], initialAdapters: [adapter] } });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("test"); });
  const mount = (id: string) => {
    registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: id, version: "1.0.0", displayName: id, routes: [{ path: `/${id.split(".").at(-1)}`, primary: true }], documentTypes: [{ id: noteType.id, displayName: noteType.displayName }] });
    const mounted = mountTestSynWareRuntime(runtime, id);
    cleanups.push(() => mounted.dispose("test"));
    return { mounted, documents: createSynWareContextValue(mounted.runtime).documents.workspaceDocuments };
  };
  const app = mount("com.example.adapter-owner");
  const foreign = mount("com.example.adapter-foreign");
  const location = { kind: "memory" as const, namespace: "sdk-text-adapters", key: "note" };
  const document = await app.documents.newDocument<NoteDocumentModel>({ typeId: noteType.id, location, initialModel: { title: "Native title", body: "Hello" } });
  const owner = createSynWareNSETextOwner<NoteDocumentModel>({
    documents: app.documents, documentId: document.id, flowId: "body", signal: app.mounted.runtime.signal,
    readContent: (model) => content(model.body),
    writeContent: (model, next) => ({ ...model, body: createNSETextSnapshot(next).text }),
  });
  cleanups.push(() => owner.dispose());
  const session = new TextEditingSession({ id: "body-session", documentId: document.id, owner, history: app.documents.getUndoManager(document.id) });
  cleanups.push(() => session.dispose());
  return { runtime, adapter, app, foreign, location, document, owner, session };
}

describe("AppSDK text and output owner adapters with real mounted documents", () => {
  it("publishes text through the canonical native model and replays the mounted history", async () => {
    const { app, document, owner, session } = await fixture();
    session.select(5);
    const edit = session.insertText("!");
    expect(app.documents.getDocument<NoteDocumentModel>(document.id)).toMatchObject({ model: { title: "Native title", body: "Hello!" }, dirtyRevision: document.dirtyRevision + 1 });
    expect(owner.getSnapshot().revision).toBe(edit.snapshot.revision);
    expect(session.getSnapshot().model.text).toBe("Hello!");
    await session.requestHistory("undo");
    expect(owner.getSnapshot().text).toBe("Hello");
    expect(session.getSnapshot().model.revision).toBe(document.dirtyRevision + 2);
    await session.requestHistory("redo");
    expect(app.documents.getDocument<NoteDocumentModel>(document.id)?.model.body).toBe("Hello!");
  });

  it("observes another canonical SDK edit while per-view selections stay independent", async () => {
    const { app, document, owner, session } = await fixture();
    const second = new TextEditingSession({ id: "other-view", documentId: document.id, owner });
    cleanups.push(() => second.dispose());
    session.select(5);
    second.select(0);
    const result = app.documents.transactDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "Hello world" }), { expectedRevision: document.dirtyRevision, actionName: "Another native view" });
    expect(result.status).toBe("committed");
    expect(session.getSnapshot().model.text).toBe("Hello world");
    expect(second.getSnapshot().model.text).toBe("Hello world");
    expect(second.getSnapshot().selection.range).toEqual({ location: 0, length: 0 });
    expect(session.getSnapshot().selection.sessionId).not.toBe(second.getSnapshot().selection.sessionId);
    expect(owner.getSnapshot().revision).toBe(app.documents.getDocument(document.id)!.dirtyRevision);
  });

  it("unregisters the document participant when its text session is disposed", async () => {
    const { app, runtime, adapter, location, document, session } = await fixture();
    const registration = bindSynWareNSETextEditingSession({ documents: app.documents, documentId: document.id, session });
    expect(registration.isLive).toBe(true);
    expect(runtime.documents.getDocument(document.id)!.hasEditingParticipants).toBe(true);
    session.dispose();
    expect(registration.isLive).toBe(false);
    expect(runtime.documents.getDocument(document.id)!.hasEditingParticipants).toBe(false);
    await expect(app.documents.settleEditing(document.id, "save")).resolves.toMatchObject({ status: "settled", settledParticipantIds: [] });
    await app.documents.saveDocument(document.id, { reason: "explicit" });
    expect((await adapter.read<NoteDocumentModel>(location))?.content.body).toBe("Hello");
  });

  it("refuses explicit Save during active IME and preserves both the draft and saved record", async () => {
    const { app, adapter, location, document, session } = await fixture();
    await app.documents.saveDocument(document.id);
    const saved = await adapter.read<NoteDocumentModel>(location);
    bindSynWareNSETextEditingSession({ documents: app.documents, documentId: document.id, session });
    session.select(5);
    session.setMarkedText("日本");
    await expect(app.documents.saveDocument(document.id, { reason: "explicit" })).rejects.toThrow(/text-composition-active/);
    expect(session.getSnapshot().marked?.text).toBe("日本");
    expect(app.documents.getDocument<NoteDocumentModel>(document.id)).toMatchObject({ model: { body: "Hello" }, dirtyRevision: document.dirtyRevision });
    expect(await adapter.read<NoteDocumentModel>(location)).toEqual(saved);
    session.unmarkText();
    await app.documents.saveDocument(document.id, { reason: "explicit" });
    expect((await adapter.read<NoteDocumentModel>(location))?.content.body).toBe("Hello日本");
  });

  it("captures the monotonic canonical revision after its scoped editing barrier commits", async () => {
    const { app, document } = await fixture();
    let settled = false;
    const registration = app.documents.registerEditingParticipant<NoteDocumentModel>(document.id, {
      id: "output-field-draft", settle(context) {
        const result = context.transact((model) => ({ ...model, body: "Settled for output" }), { expectedRevision: app.documents.getDocument(document.id)!.dirtyRevision, actionName: "Commit output field" });
        if (result.status !== "committed") return { status: "refused", reason: result.error.message };
        settled = true;
        return { status: "settled" };
      },
    });
    const preparation = createSynWareDocumentOutputPreparation<NoteDocumentModel>({ documents: app.documents, documentId: document.id, signal: app.mounted.runtime.signal });
    const engine = vi.fn((snapshot: DocumentOutputSnapshot<NoteDocumentModel>) => {
      expect(settled).toBe(true);
      expect(snapshot).toMatchObject({ documentId: document.id, revision: document.dirtyRevision + 1, model: { body: "Settled for output" } });
      return blankPages();
    });
    const result = await preparation.prepare({ purpose: "export", engine });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") throw new Error(JSON.stringify(result.receipt));
    registration.dispose();
    const captured = result.output.snapshot;
    app.documents.transactDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "Newer edit" }), { expectedRevision: captured.revision, actionName: "Edit after capture" });
    expect(result.output.snapshot).toEqual(captured);
    expect(result.output.snapshot.model.body).toBe("Settled for output");
    expect(result.output.receipt.revision).toBe(captured.revision);
    expect(app.documents.getDocument(document.id)!.dirtyRevision).toBeGreaterThan(captured.revision);
    expect(engine).toHaveBeenCalledOnce();
    result.output.release();
  });

  it("refuses output during active IME before calling its engine", async () => {
    const { app, document, session } = await fixture();
    bindSynWareNSETextEditingSession({ documents: app.documents, documentId: document.id, session });
    session.setMarkedText("未確定");
    const engine = vi.fn(blankPages);
    const preparation = createSynWareDocumentOutputPreparation<NoteDocumentModel>({ documents: app.documents, documentId: document.id, signal: app.mounted.runtime.signal });
    const result = await preparation.prepare({ engine });
    expect(result).toMatchObject({ status: "refused", receipt: { revision: null, reason: "text-composition-active" } });
    expect(engine).not.toHaveBeenCalled();
    expect(session.getSnapshot().marked?.text).toBe("未確定");
  });

  it("keeps foreign document IDs outside both adapter capabilities", async () => {
    const { foreign, document } = await fixture();
    expect(() => createSynWareNSETextOwner<NoteDocumentModel>({ documents: foreign.documents, documentId: document.id, flowId: "foreign", readContent: (model) => content(model.body), writeContent: (model) => ({ ...model }) })).toThrow(/another application|owner lease|owned/i);
    const engine = vi.fn(blankPages);
    const preparation = createSynWareDocumentOutputPreparation<NoteDocumentModel>({ documents: foreign.documents, documentId: document.id, signal: foreign.mounted.runtime.signal });
    await expect(preparation.prepare({ engine })).resolves.toMatchObject({ status: "failed", receipt: { documentId: null, revision: null } });
    expect(engine).not.toHaveBeenCalled();
  });

  it("cancels pending output and revokes attached text when the mount ends", async () => {
    const { app, document, session, owner } = await fixture();
    let enter!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    app.documents.registerEditingParticipant(document.id, { id: "pending-output", async settle() { enter(); await gate; return { status: "settled" }; } });
    const engine = vi.fn(blankPages);
    const preparation = createSynWareDocumentOutputPreparation<NoteDocumentModel>({ documents: app.documents, documentId: document.id, signal: app.mounted.runtime.signal });
    const pending = preparation.prepare({ engine });
    await entered;
    app.mounted.dispose("adapter owner revoked");
    expect(owner.signal?.aborted).toBe(true);
    expect(session.getSnapshot().disposed).toBe(true);
    await expect(pending).resolves.toMatchObject({ status: "canceled", receipt: { revision: null } });
    expect(engine).not.toHaveBeenCalled();
    finish();
  });
});
