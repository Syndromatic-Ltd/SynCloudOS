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
import { attributedContent, paragraph, textRun, createNSETextSnapshot } from "../../../src/NSE/Text";
import { createNSEDocumentTextOwner } from "../../../src/NSE/TextEditing/documentTextOwner";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { editDocumentFixture } from "../../fixtures/documentEditFixture";
import type { DocumentType } from "../../../src/SynCloudOS/Documents/documentTypes";
import { declareSynCloudOSLifecycleSignal, SynCloudOSLifecycleError } from "../../../src/SynCloudOS/nseRuntimeContracts";
const content = (text: string) => attributedContent([paragraph([textRun(text)])]);
type FlowModel = { main: ReturnType<typeof content>; note: string };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() {
  const initial: FlowModel = { main: content("abc"), note: "preserved" };
  const type: DocumentType<FlowModel> = { id: "test.owner-flow", displayName: "Flow", schemaVersion: 1, extensions: [], mimeTypes: [], autosave: "disabled", capabilities: { conflicts: true }, create: () => initial, read: x => x, write: x => x, validate: (x): x is FlowModel => Boolean(x && typeof x === "object" && "main" in x && "note" in x) };
  const result = editDocumentFixture(type, initial); cleanups.push(result.cleanup);
  const document = result.document;
  return { ...result, port: { getSnapshot: () => document.snapshot(), subscribe: document.subscribe.bind(document), transact: document.transact.bind(document) } };
}
describe("document semantic text owners", () => {
  it.each(["explicit", "application-closed"] as const)("records first %s disposal for each document owner operation", reason => {
    const { port } = fixture(); const signal = new AbortController();
    declareSynCloudOSLifecycleSignal(signal.signal, "application-closed");
    const owner = createNSEDocumentTextOwner({ document: port, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: next }), signal: signal.signal });
    if (reason === "explicit") owner.dispose(); else signal.abort();
    owner.dispose(); signal.abort();
    for (const [operation, action] of Object.entries({ getSnapshot: () => owner.getSnapshot(), subscribe: () => owner.subscribe(() => {}), commit: () => owner.commit({ expectedRevision: 0, operations: [] }) })) {
      expect(action).toThrow(SynCloudOSLifecycleError);
      expect(action).toThrow(expect.objectContaining({ code: "NSE_DOCUMENT_TEXT_OWNER_DISPOSED", operation, disposal: expect.objectContaining({ reason }) }));
    }
  });
  it("diagnoses already closed or aborted document owner creation", () => {
    const { port } = fixture(); const signal = new AbortController();
    declareSynCloudOSLifecycleSignal(signal.signal, "application-closed"); signal.abort();
    const options = { document: port, flowId: "main", readContent: (model: Readonly<FlowModel>) => model.main, writeContent: (model: Readonly<FlowModel>, next: FlowModel["main"]) => ({ ...model, main: next }) };
    for (const [reason, action] of Object.entries({
      "application-closed": () => createNSEDocumentTextOwner({ ...options, signal: signal.signal }),
      "document-closed": () => createNSEDocumentTextOwner({ ...options, document: { ...port, getSnapshot: () => ({ ...port.getSnapshot(), state: "closed" }) } }),
    })) {
      expect(action).toThrow(SynCloudOSLifecycleError);
      expect(action).toThrow(expect.objectContaining({ code: "NSE_DOCUMENT_TEXT_OWNER_DISPOSED", operation: "createNSEDocumentTextOwner", disposal: expect.objectContaining({ reason }) }));
    }
  });
  it("preserves a native DOMException while recording the resulting revocation", () => {
    const { port } = fixture(); const failure = new DOMException("Native document access failed", "InvalidStateError");
    let fail = false;
    const owner = createNSEDocumentTextOwner({ document: { ...port, getSnapshot: () => { if (fail) throw failure; return port.getSnapshot(); } }, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: next }) });
    fail = true;
    let observed: unknown;
    try { owner.getSnapshot(); } catch (error) { observed = error; }
    expect(observed).toBe(failure); expect(owner.signal.aborted).toBe(true);
    expect(() => owner.getSnapshot()).toThrow(SynCloudOSLifecycleError);
    expect(() => owner.getSnapshot()).toThrow(expect.objectContaining({ code: "NSE_DOCUMENT_TEXT_OWNER_DISPOSED", operation: "getSnapshot", disposal: expect.objectContaining({ reason: "document-revoked" }) }));
  });
  it("refreshes an actual conflict-local adoption and preserves it on the next session edit", () => {
    const { document, port } = fixture();
    const owner = createNSEDocumentTextOwner({ document: port, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: next }) });
    const session = new TextEditingSession({ id: "conflict", owner });
    document.enterConflict({ base: null, localModel: { ...document.model, main: content("NEW") }, remote: null });
    expect(owner.getSnapshot().text).toBe("NEW"); expect(owner.getSnapshot().revision).toBe(1);
    session.select(3); session.insertText("!"); expect(createNSETextSnapshot(document.model.main).text).toBe("NEW!");
    owner.dispose(); session.dispose();
  });

  it("rejects native writer text normalization before canonical or history admission", () => {
    const { document, port } = fixture(); const before = document.snapshot(); const observer = vi.fn(); document.subscribe(observer);
    const owner = createNSEDocumentTextOwner({ document: port, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: content(createNSETextSnapshot(next).text.replace(/x/g, "")) }) });
    expect(() => owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 0, length: 0 }, content: content("xxxxx") }] })).toThrow(/round.trip|normaliz/i);
    expect(document.snapshot()).toBe(before); expect(document.undoManager.canUndo).toBe(false); expect(observer).not.toHaveBeenCalled(); owner.dispose();
  });

  it("rejects native writer paragraph topology normalization even when flat text is identical", () => {
    const { document, port } = fixture(); const before = document.snapshot();
    const owner = createNSEDocumentTextOwner({ document: port, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: content(createNSETextSnapshot(next).text) }) });
    expect(() => owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 0, length: 3 }, content: attributedContent([paragraph([textRun("a")]), paragraph([textRun("b")])]) }] })).toThrow(/round.trip|normaliz/i);
    expect(document.snapshot()).toBe(before); expect(document.undoManager.canUndo).toBe(false); owner.dispose();
  });

  it("revokes on same-revision native model changes even when a violating port does not emit", () => {
    const { document, port } = fixture(); let model = document.model;
    const owner = createNSEDocumentTextOwner({ document: { ...port, getSnapshot: () => ({ ...document.snapshot(), model }) }, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: next }) });
    const session = new TextEditingSession({ id: "bad-port", owner }); const target = session.captureTarget();
    model = { ...model, main: content("changed without revision") };
    expect(() => owner.getSnapshot()).toThrow(SynCloudOSLifecycleError);
    expect(() => owner.getSnapshot()).toThrow(expect.objectContaining({ code: "NSE_DOCUMENT_TEXT_OWNER_DISPOSED", operation: "getSnapshot", disposal: expect.objectContaining({ reason: "document-revoked" }) })); expect(owner.signal?.aborted).toBe(true);
    expect(session.resolveTarget(target)).toBeNull(); expect(document.model.main).toEqual(content("abc")); session.dispose();
  });

  it("reports postcommit projection decoding failure as diagnostic while returning the verified admitted projection", () => {
    const { document, port } = fixture(); const diagnostic = vi.fn();
    const owner = createNSEDocumentTextOwner({ document: port, flowId: "main", readContent: model => { if (document.dirtyRevision > 0) throw new Error("postcommit decoder fault"); return model.main; }, writeContent: (model, next) => ({ ...model, main: next }), observeError: diagnostic });
    const receipt = owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 0, length: 0 }, content: content("!") }] });
    expect(receipt.snapshot.text).toBe("!abc"); expect(receipt.snapshot.revision).toBe(document.dirtyRevision);
    expect(receipt.changeMap.mapRange({ location: 3, length: 0 }, 0)).toEqual({ location: 4, length: 0 });
    expect(createNSETextSnapshot(document.model.main).text).toBe("!abc"); expect(document.undoManager.canUndo).toBe(true);
    expect(receipt.observerErrors.length).toBeGreaterThan(0); expect(diagnostic).toHaveBeenCalled(); expect(owner.signal?.aborted).toBe(true);
  });

  it("accepts semantically equivalent native run segmentation and maps actual canonical coordinates", () => {
    const { document, port } = fixture();
    const owner = createNSEDocumentTextOwner({ document: port, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: attributedContent(next.blocks.map(block => paragraph(block.runs.flatMap(run => run.kind === "text" ? [...run.text].map(letter => textRun(letter, run.attributes)) : [run]), block.attributes))) }) });
    const receipt = owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 0, length: 0 }, content: content("!") }] });
    expect(receipt.snapshot.attributedContent).toEqual(document.model.main); expect(receipt.snapshot.text).toBe("!abc");
    expect(receipt.changeMap.mapRange({ location: 3, length: 0 }, 0)).toEqual({ location: 4, length: 0 }); owner.dispose();
  });

  it("uses one canonical history for two independent flows", async () => {
    type Model = { main: ReturnType<typeof content>; note: ReturnType<typeof content> };
    const initial = { main: content("main"), note: content("note") };
    const type: DocumentType<Model> = { id: "test.two-flow", displayName: "Two flows", schemaVersion: 1, extensions: [], mimeTypes: [], autosave: "disabled", capabilities: { versions: true, conflicts: true }, create: () => initial, read: x => x, write: x => x, validate: (x): x is Model => Boolean(x && typeof x === "object" && "main" in x && "note" in x) };
    const fixture = editDocumentFixture(type, initial);
    const document = fixture.document;
    const port = { getSnapshot: () => document.snapshot(), subscribe: document.subscribe.bind(document), transact: document.transact.bind(document) };
    const main = createNSEDocumentTextOwner({ document: port, flowId: "main", readContent: model => model.main, writeContent: (model, next) => ({ ...model, main: next }) });
    const note = createNSEDocumentTextOwner({ document: port, flowId: "note", readContent: model => model.note, writeContent: (model, next) => ({ ...model, note: next }) });
    const session = new TextEditingSession({ id: "main-view", owner: main, history: document.undoManager });
    session.insertText("!");
    const committed = createNSETextSnapshot(document.snapshot().model.main);
    expect(committed.text).toBe("!main");
    expect(committed.characterSpans.every(span => Object.keys(span.attributes).length === 0)).toBe(true);
    expect(main.getSnapshot().attributedContent).toEqual(document.snapshot().model.main);
    expect(note.getSnapshot().text).toBe("note");
    expect(note.getSnapshot().revision).toBe(main.getSnapshot().revision);
    await session.requestHistory("undo");
    expect(main.getSnapshot().text).toBe("main");
    main.dispose(); expect(note.getSnapshot().text).toBe("note");
    note.dispose(); session.dispose(); await fixture.cleanup();
  });
});
