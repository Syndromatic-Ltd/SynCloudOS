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

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorView } from "@tiptap/pm/view";
import { createInMemoryNSETextOwner, plainNSETextContent, attributedContent, paragraph, textRun, type NSEAttributedContent } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { mountDOMTextBackend } from "../../../src/NSE/TextEditing/backends/domTextBackend";
import { createBackendPositionMap } from "../../../src/NSE/TextEditing/backends/backendPositionMap";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); vi.useRealTimers(); document.body.replaceChildren(); });
function fixture(text: string | NSEAttributedContent = "before selected after") {
  vi.useFakeTimers();
  const owner = createInMemoryNSETextOwner({ content: typeof text === "string" ? plainNSETextContent(text) : text });
  const session = new TextEditingSession({ id: "composition", textOwner: owner });
  let view!: EditorView;
  const update = EditorView.prototype.updateState;
  vi.spyOn(EditorView.prototype, "updateState").mockImplementation(function (state) { view = this; return update.call(this, state); });
  const host = document.createElement("div"); document.body.append(host);
  const errors: unknown[] = [];
  const backend = mountDOMTextBackend(host, { session, label: "Document", onError: error => errors.push(error) });
  disposers.push(() => { backend.dispose(); session.dispose(); owner.dispose(); });
  const start = () => view.dom.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  const end = () => { view.dom.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); vi.runOnlyPendingTimers(); };
  const replace = (from: number, to: number, inserted: string) => {
    const positions = createBackendPositionMap(view.state.doc);
    view.dispatch(view.state.tr.insertText(inserted, positions.toBackend(from), positions.toBackend(to)));
  };
  return { owner, session, start, end, replace, errors, backend };
}
describe("mounted native composition adapter", () => {
  it("uses inherited native stored marks and honors explicit removal at a collapsed caret", () => {
    const f = fixture(attributedContent([paragraph([textRun("ab", { bold: true })])]));
    f.session.select(1); f.replace(1, 1, "x");
    expect(f.owner.getSnapshot().characterSpans.every(span => span.attributes.bold)).toBe(true);
    f.session.removeAttributes(["bold"]); f.replace(2, 2, "y");
    const inserted = f.owner.getSnapshot().characterSpans.find(span => span.range.location <= 2 && span.range.location + span.range.length > 2);
    expect(inserted?.attributes.bold).toBeUndefined();
    expect(f.owner.getSnapshot().text).toBe("axyb");
  });
  it("cancels a composition with no native edit without deleting the selected text", () => {
    const f = fixture(); f.session.select(7, 15); f.start(); f.end(); f.end();
    expect(f.owner.getSnapshot().text).toBe("before selected after");
    expect(f.owner.getSnapshot().revision).toBe(0);
    expect(f.session.getSnapshot().marked).toBeNull();
  });
  it("cancels a provisional edit reverted by the native backend", () => {
    const f = fixture(); f.session.select(7, 15); f.start(); f.replace(7, 15, "x"); f.replace(7, 8, "selected"); f.end();
    expect(f.owner.getSnapshot().text).toBe("before selected after");
    expect(f.owner.getSnapshot().revision).toBe(0);
    expect(f.session.getSnapshot().marked).toBeNull();
  });
  it.each(["before", "after"])("preserves a nonoverlapping external edit %s the composition", side => {
    const f = fixture(); f.session.select(7, 15); f.start(); f.replace(7, 15, "x");
    f.owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: side === "before" ? 0 : 21, length: 0 }, content: plainNSETextContent("!") }] });
    f.replace(7, 8, "xy"); f.end(); f.end();
    expect(f.owner.getSnapshot().text).toBe(side === "before" ? "!before xy after" : "before xy after!");
    expect(f.owner.getSnapshot().revision).toBe(2);
    expect(f.errors).toEqual([]);
  });
  it("refuses overlapping external edits and retains the draft", () => {
    const f = fixture(); f.session.select(7, 15); f.start(); f.replace(7, 15, "draft");
    f.owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 8, length: 1 }, content: plainNSETextContent("!") }] });
    f.end();
    expect(f.owner.getSnapshot().text).toBe("before s!lected after");
    expect(f.session.getSnapshot().marked).toMatchObject({ text: "draft", conflict: true });
    expect(f.errors).toHaveLength(1);
  });
  it("revokes native finalization when the view unmounts", () => {
    const f = fixture(); f.session.select(7, 15); f.start(); f.replace(7, 15, "draft"); f.backend.dispose(); f.end();
    expect(f.owner.getSnapshot().text).toBe("before selected after");
    expect(f.session.getSnapshot().marked).toBeNull();
  });
});
