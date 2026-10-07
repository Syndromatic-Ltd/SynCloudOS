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
import { applyNSETextOperations, attachmentRun, attributedContent, createInMemoryNSETextOwner, createNSETextSnapshot, effectiveNSEParagraphCustomAttribute, effectiveNSETextCustomAttribute, paragraph, textRun, type NSEAttributedContent, type NSETextList } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { NSETextCommands } from "../../../src/NSE/TextEditing/textCommands";
import { createUndoableNSETextOwner } from "../../../src/NSE/TextEditing/standaloneTextHistory";
import { aggregateNSETextAttributes } from "../../../src/NSE/TextEditing/textAttributeAggregate";
import { nseHeaderLevelOperations, nseListLevelOperations, nseRestartNumberingOperations, nseToggleListOperations, selectedNSETextAttachment, nseAttachmentBoundsOperations } from "../../../src/NSE/TextEditing/textStructureCommands";

const three = (lists?: readonly (readonly NSETextList[] | undefined)[]) => attributedContent(["one", "two", "three"].map((text, i) => paragraph([textRun(text)], lists?.[i] ? { textLists: lists[i] } : undefined)));
const apply = (content: NSEAttributedContent, operations: ReturnType<typeof nseToggleListOperations>) => applyNSETextOperations(createNSETextSnapshot(content), operations).snapshot.attributedContent;
const listsOf = (content: NSEAttributedContent) => content.blocks.map(block => block.attributes?.textLists?.map(list => list.marker).join(">") ?? null);
const all = { location: 0, length: 13 };

describe("structure commands", () => {
  it("toggles a list on and off again", () => {
    const before = three();
    const on = apply(before, nseToggleListOperations(createNSETextSnapshot(before), all, "decimal"));
    expect(listsOf(on)).toEqual(["decimal", "decimal", "decimal"]);
    expect(new Set(on.blocks.map(block => block.attributes!.textLists![0]!.id)).size).toBe(1);
    const off = apply(on, nseToggleListOperations(createNSETextSnapshot(on), all, "decimal"));
    expect(off.blocks.map(block => block.attributes ?? {})).toEqual([{}, {}, {}]);
  });

  it("continues the list of the paragraph before, and converts marker kinds", () => {
    const existing: NSETextList = { id: "kept", marker: "disc" };
    const before = three([[existing]]);
    const continued = apply(before, nseToggleListOperations(createNSETextSnapshot(before), { location: 4, length: 9 }, "disc"));
    expect(continued.blocks.map(block => block.attributes?.textLists?.[0]?.id)).toEqual(["kept", "kept", "kept"]);
    const converted = apply(continued, nseToggleListOperations(createNSETextSnapshot(continued), all, "lower-roman"));
    expect(listsOf(converted)).toEqual(["lower-roman", "lower-roman", "lower-roman"]);
  });

  it("indents into one shared nested list and outdents back", () => {
    const list: NSETextList = { id: "outer", marker: "decimal" };
    const before = three([[list], [list], [list]]);
    const indented = apply(before, nseListLevelOperations(createNSETextSnapshot(before), { location: 4, length: 9 }, 1));
    expect(listsOf(indented)).toEqual(["decimal", "decimal>lower-alpha", "decimal>lower-alpha"]);
    expect(indented.blocks[1]!.attributes!.textLists![1]!.id).toBe(indented.blocks[2]!.attributes!.textLists![1]!.id);
    const outdented = apply(indented, nseListLevelOperations(createNSETextSnapshot(indented), { location: 4, length: 0 }, -1));
    expect(listsOf(outdented)).toEqual(["decimal", "decimal", "decimal>lower-alpha"]);
  });

  it("restarts numbering for the rest of a contiguous list only", () => {
    const list: NSETextList = { id: "n", marker: "decimal" };
    const content = attributedContent([paragraph([textRun("a")], { textLists: [list] }), paragraph([textRun("b")], { textLists: [list] }), paragraph([textRun("c")], { textLists: [list] }), paragraph([textRun("x")]), paragraph([textRun("d")], { textLists: [list] })]);
    const restarted = apply(content, nseRestartNumberingOperations(createNSETextSnapshot(content), { location: 2, length: 0 }));
    const ids = restarted.blocks.map(block => block.attributes?.textLists?.[0]?.id ?? null);
    expect(ids[0]).toBe("n");
    expect(ids[1]).toBe(ids[2]);
    expect(ids[1]).not.toBe("n");
    expect(ids[4]).toBe("n");
  });

  it("sets and clears heading levels", () => {
    const before = three();
    const heading = apply(before, nseHeaderLevelOperations(createNSETextSnapshot(before), { location: 0, length: 0 }, 2));
    expect(heading.blocks[0]!.attributes).toEqual({ headerLevel: 2 });
    expect(apply(heading, nseHeaderLevelOperations(createNSETextSnapshot(heading), { location: 0, length: 0 }, 0)).blocks[0]!.attributes ?? {}).toEqual({});
    expect(() => nseHeaderLevelOperations(createNSETextSnapshot(before), all, 7)).toThrow(/0 to 6/);
  });

  it("finds an exactly selected attachment and resizes it", () => {
    const image = attachmentRun({ id: "img", kind: "image", source: { kind: "blob", blobId: "b" }, alt: "Photo" });
    const content = attributedContent([paragraph([textRun("a"), image, textRun("b")])]);
    const snapshot = createNSETextSnapshot(content);
    expect(selectedNSETextAttachment(snapshot, { location: 1, length: 1 })?.run.id).toBe("img");
    expect(selectedNSETextAttachment(snapshot, { location: 0, length: 2 })).toBeNull();
    const resized = apply(content, nseAttachmentBoundsOperations(snapshot, { location: 1, length: 1 }, { width: 200, height: 100 }));
    expect(resized.blocks[0]!.runs[1]).toEqual(attachmentRun({ id: "img", kind: "image", source: { kind: "blob", blobId: "b" }, alt: "Photo", bounds: { width: 200, height: 100 } }));
  });

  it("aggregates custom keys and the new paragraph attributes", () => {
    const content = attributedContent([
      paragraph([textRun("ab", { custom: { "journal.comment": "c1" } }), textRun("cd")], { headerLevel: 1, custom: { "journal.style": "title" } }),
      paragraph([textRun("ef", { custom: { "journal.comment": "c1" } })], { custom: { "journal.style": "body" } }),
    ]);
    const snapshot = createNSETextSnapshot(content);
    expect(effectiveNSETextCustomAttribute(snapshot, { location: 0, length: 2 }, "journal.comment")).toEqual({ state: "uniform", value: "c1" });
    expect(effectiveNSETextCustomAttribute(snapshot, { location: 0, length: 4 }, "journal.comment")).toEqual({ state: "mixed" });
    expect(effectiveNSETextCustomAttribute(snapshot, { location: 2, length: 2 }, "journal.comment")).toEqual({ state: "unset" });
    expect(effectiveNSEParagraphCustomAttribute(snapshot, { location: 0, length: 6 }, "journal.style")).toEqual({ state: "mixed" });
    const session = new TextEditingSession({ id: "agg", owner: createInMemoryNSETextOwner({ content }) });
    session.select(0, 1);
    expect(aggregateNSETextAttributes(session).paragraph.headerLevel).toEqual({ state: "uniform", value: 1 });
  });

  it("validates and executes list commands as one undoable formatting step", async () => {
    const owner = createUndoableNSETextOwner({ content: three() });
    const session = new TextEditingSession({ id: "cmd", owner, history: owner.history });
    const commands = new NSETextCommands({ session });
    session.select(0, 7);
    expect(commands.validate("text.toggleList", "disc").state).toBe("off");
    expect(commands.validate("text.listLevel", 1).enabled).toBe(false);
    await commands.execute("text.toggleList", "disc");
    expect(listsOf(session.getSnapshot().model.attributedContent)).toEqual(["disc", "disc", null]);
    session.select(0, 7);
    expect(commands.validate("text.toggleList", "disc").state).toBe("on");
    await session.requestHistory("undo");
    expect(listsOf(session.getSnapshot().model.attributedContent)).toEqual([null, null, null]);
    expect(() => commands.validate("text.toggleList", "star")).not.toThrow();
    expect(commands.validate("text.toggleList", "star").enabled).toBe(false);
  });
});
