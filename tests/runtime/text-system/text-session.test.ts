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
import { createInMemoryNSETextOwner, attributedContent, paragraph, textRun } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
const content = (text: string) => attributedContent([paragraph([textRun(text)])]);
describe("semantic editing sessions", () => {
  it("inherits initial typing attributes but preserves an explicit collapsed removal", () => {
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("ab", { bold: true })])]) });
    const session = new TextEditingSession({ id: "inherit", owner });
    expect(session.getSnapshot().typingAttributes).toEqual({ bold: true });
    session.select(1); session.removeAttributes(["bold"]); session.insertText("x");
    const inserted = owner.getSnapshot().characterSpans.find(span => span.range.location === 1);
    expect(inserted?.attributes.bold).toBeUndefined();
    expect(owner.getSnapshot().text).toBe("axb");
    session.select(3); expect(session.getSnapshot().typingAttributes.bold).toBe(true);
  });
  it("revokes attached sessions with their owner and isolates observer failures", () => {
    const owner = createInMemoryNSETextOwner();
    const session = new TextEditingSession({ id: "scope", owner });
    let calls = 0;
    session.subscribe(() => { throw new Error("observer"); }); session.subscribe(() => calls++);
    session.select(0); session.setTypingAttributes({ bold: true });
    expect(calls).toBe(1); expect(session.observerErrors).toHaveLength(1);
    owner.dispose();
    expect(session.getSnapshot().disposed).toBe(true);
    expect(session.signal.aborted).toBe(true);
    expect(() => session.insertText("late")).toThrow(/revoked/);
  });
  it("keeps selection independent while two views share canonical content", () => {
    const owner = createInMemoryNSETextOwner({ content: content("hello"), flowId: "main" });
    const one = new TextEditingSession({ id: "one", owner });
    const two = new TextEditingSession({ id: "two", owner });
    one.select(1, 4); two.select(0, 0); one.insertText("i");
    expect(owner.getSnapshot().text).toBe("hio");
    expect(one.getSnapshot().selection.range).toEqual({ location: 2, length: 0 });
    expect(two.getSnapshot().selection.range).toEqual({ location: 0, length: 0 });
    one.dispose(); two.insertText("!");
    expect(owner.getSnapshot().text).toBe("!hio");
  });
  it("keeps marked input private and commits exactly once", () => {
    const owner = createInMemoryNSETextOwner({ content: content("ab") });
    const session = new TextEditingSession({ id: "ime", owner });
    session.select(1, 1); session.setMarkedText("に"); session.setMarkedText("日本");
    expect(owner.getSnapshot().text).toBe("ab");
    expect(session.settleEditing().status).toBe("refused");
    session.unmarkText(); session.unmarkText();
    expect(owner.getSnapshot().text).toBe("a日本b");
    expect(owner.getSnapshot().revision).toBe(1);
  });
  it("preserves marked input and refuses stale composition after external mutation", () => {
    const owner = createInMemoryNSETextOwner({ content: content("ab") });
    const session = new TextEditingSession({ id: "ime", owner });
    session.setMarkedText("x");
    owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 0, length: 2 }, content: content("changed") }] });
    expect(() => session.unmarkText()).toThrow(/composition/i);
    expect(session.getSnapshot().marked?.text).toBe("x");
    session.cancelMarkedText(); expect(owner.getSnapshot().text).toBe("changed");
  });
  it("stores collapsed formatting as typing attributes without canonical history", () => {
    const owner = createInMemoryNSETextOwner({ content: content("ab") });
    const session = new TextEditingSession({ id: "format", owner });
    session.applyAttributes({ bold: true });
    expect(owner.getSnapshot().revision).toBe(0);
    session.insertText("x");
    expect(owner.getSnapshot().attributedContent.blocks[0].runs[0]).toMatchObject({ text: "x", attributes: { bold: true } });
  });
  it("inherits effective typing attributes at a moved caret and rejects surrogate interiors", () => {
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("a😀b", { bold: true })])]) });
    const session = new TextEditingSession({ id: "typing", owner });
    session.select(1); expect(session.getSnapshot().typingAttributes.bold).toBe(true);
    expect(() => session.select(2)).toThrow(RangeError);
  });
});
