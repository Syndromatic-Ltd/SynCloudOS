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
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { attributedContent, createInMemoryNSETextOwner, paragraph, textRun, type NSEAttributedContent, type NSETextList } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { createUndoableNSETextOwner } from "../../../src/NSE/TextEditing/standaloneTextHistory";
import { plainNSETextContent } from "../../../src/NSE/Text";
import { NSETextView } from "../../../src/NSE/TextEditing/NSETextView";
import type { NSETextEditingSessionOptions } from "../../../src/NSE/TextEditing/textSessionTypes";

afterEach(cleanup);
const comment = { custom: { "journal.comment": "c1" } };
const policies: NSETextEditingSessionOptions["customAttributePolicies"] = { "journal.comment": { extendsWhenTyping: false }, "journal.style": { carriesAcrossParagraphSplit: false } };
const sessionFor = (content: NSEAttributedContent, options: Partial<NSETextEditingSessionOptions> = {}) =>
  new TextEditingSession({ id: "s", textOwner: createInMemoryNSETextOwner({ content }), customAttributePolicies: policies, ...options });
const runs = (session: TextEditingSession, block = 0) => session.getSnapshot().model.attributedContent.blocks[block]!.runs.map(run => run.kind === "text" ? [run.text, run.attributes ?? null] : null);
const bullet = (id = "l1"): NSETextList => ({ id, marker: "disc" });

describe("custom attribute editing policies", () => {
  it("does not extend a non-extending key by typing at its edge, but does inside it", () => {
    const session = sessionFor(attributedContent([paragraph([textRun("note", comment), textRun(" after")])]));
    session.select(4); session.insertText("X");
    expect(runs(session)).toEqual([["note", comment], ["X after", null]]);
    session.select(2); session.insertText("Y");
    expect(runs(session)[0]).toEqual(["noYte", comment]);
  });

  it("keeps an anchor on both halves of a split word", () => {
    const session = sessionFor(attributedContent([paragraph([textRun("anchored", comment)])]));
    session.select(4); session.splitParagraph();
    expect(runs(session, 0)).toEqual([["anch", comment]]);
    expect(runs(session, 1)).toEqual([["ored", comment]]);
    expect(session.getSnapshot().selection.range).toEqual({ location: 5, length: 0 });
  });

  it("uses the following-paragraph hook, including its typing attributes", () => {
    const session = sessionFor(attributedContent([paragraph([textRun("Heading", { bold: true })], { headerLevel: 1, custom: { "journal.style": "heading" } })]), {
      nextParagraphAttributes: previous => previous.headerLevel ? { paragraph: { custom: { "journal.style": "body" } }, typingAttributes: { italic: true } } : previous,
    });
    session.select(7); session.splitParagraph();
    const blocks = session.getSnapshot().model.attributedContent.blocks;
    expect(blocks[0]!.attributes).toEqual({ headerLevel: 1, custom: { "journal.style": "heading" } });
    expect(blocks[1]!.attributes).toEqual({ custom: { "journal.style": "body" } });
    expect(session.getSnapshot().typingAttributes).toEqual({ italic: true });
  });

  it("drops keys that do not carry across a split, and keeps typing attributes in the new empty paragraph", () => {
    const session = sessionFor(attributedContent([paragraph([textRun("Body", { bold: true })], { alignment: "centre", custom: { "journal.style": "body", "journal.keep": 1 } })]));
    session.select(4); session.splitParagraph();
    expect(session.getSnapshot().model.attributedContent.blocks[1]!.attributes).toEqual({ alignment: "centre", custom: { "journal.keep": 1 } });
    expect(session.getSnapshot().typingAttributes).toEqual({ bold: true });
  });

  it("ends a list level when Enter is pressed on an empty item", () => {
    const session = sessionFor(attributedContent([paragraph([textRun("one")], { textLists: [bullet()] }), paragraph([], { textLists: [bullet()] })]));
    session.select(4); session.splitParagraph();
    expect(session.getSnapshot().model.attributedContent.blocks).toHaveLength(2);
    expect(session.getSnapshot().model.attributedContent.blocks[1]!.attributes?.textLists).toBeUndefined();
  });

  it("indents and outdents list items through the text view's keys", () => {
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("one")], { textLists: [bullet()] }), paragraph([textRun("two")], { textLists: [bullet()] })]) });
    const session = new TextEditingSession({ id: "keys", textOwner: owner });
    render(<NSETextView session={session} label="Doc" />);
    const textbox = screen.getByRole("textbox");
    const key = (init: KeyboardEventInit) => act(() => { textbox.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });
    act(() => session.select(4));
    key({ key: "Tab" });
    let lists = session.getSnapshot().model.attributedContent.blocks[1]!.attributes!.textLists!;
    expect(lists.map(list => list.marker)).toEqual(["disc", "circle"]);
    key({ key: "Tab", shiftKey: true });
    expect(session.getSnapshot().model.attributedContent.blocks[1]!.attributes!.textLists).toEqual([bullet()]);
    act(() => session.select(4));
    key({ key: "Backspace" });
    expect(session.getSnapshot().model.attributedContent.blocks).toHaveLength(2);
    expect(session.getSnapshot().model.attributedContent.blocks[1]!.attributes?.textLists).toBeUndefined();
    act(() => session.select(7));
    key({ key: "Enter" });
    expect(session.getSnapshot().model.attributedContent.blocks).toHaveLength(3);
    lists = session.getSnapshot().model.attributedContent.blocks[0]!.attributes!.textLists!;
    expect(lists).toEqual([bullet()]);
  });
});

describe("Typing undo runs", () => {
  const typed = (session: TextEditingSession, text: string) => { for (const character of text) session.insertText(character); };
  it("undoes characters typed in one place as one action, and breaks the run when the caret moves", async () => {
    const owner = createUndoableNSETextOwner({ content: plainNSETextContent("") });
    const session = new TextEditingSession({ id: "typing-run", textOwner: owner, history: owner.history });
    typed(session, "Hello");
    session.select(0);
    typed(session, "Oh ");
    expect(session.getSnapshot().model.text).toBe("Oh Hello");
    await session.requestHistory("undo");
    expect(session.getSnapshot().model.text).toBe("Hello");
    await session.requestHistory("undo");
    expect(session.getSnapshot().model.text).toBe("");
    expect(owner.history.getSnapshot().canUndo).toBe(false);
    session.dispose(); owner.dispose();
  });

  it("groups backspaces into one deletion separate from the typing before it", async () => {
    const owner = createUndoableNSETextOwner({ content: plainNSETextContent("") });
    const session = new TextEditingSession({ id: "deletion-run", textOwner: owner, history: owner.history });
    typed(session, "Hello");
    for (let end = 5; end > 2; end--) session.commit([{ kind: "replace", range: { location: end - 1, length: 1 }, content: plainNSETextContent("") }]);
    expect(session.getSnapshot().model.text).toBe("He");
    await session.requestHistory("undo");
    expect(session.getSnapshot().model.text).toBe("Hello");
    await session.requestHistory("undo");
    expect(session.getSnapshot().model.text).toBe("");
    session.dispose(); owner.dispose();
  });
});
