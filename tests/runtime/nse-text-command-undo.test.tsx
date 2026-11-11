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
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { attributedContent, paragraph, textRun, plainNSETextContent } from "../../src/NSE/Text";
import { TextEditingSession } from "../../src/NSE/TextEditing/TextEditingSession";
import { NSETextView } from "../../src/NSE/TextEditing/NSETextView";
import { createUndoableNSETextOwner } from "../../src/NSE/TextEditing/standaloneTextHistory";
import { NSETextCommands } from "../../src/NSE/TextEditing/textCommands";
import { currentTextDocumentFixture, type CurrentTextTestModel } from "./fixtures/currentTextDocument";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { cleanup(); for (const dispose of cleanups.splice(0).reverse()) await dispose(); });
async function fixture(text = "One") {
  const result = await currentTextDocumentFixture(text); cleanups.push(result.dispose); return result;
}

describe("current text owner command history", () => {
  it("routes focused control commands through the containing application and canonical document history", async () => {
    const f = await fixture();
    render(<NSETextView session={f.session} label="Note" />);
    f.runtime.focus.requestFocus(f.responderId);
    expect(f.runtime.responders.resolveChain().map(item => item.id)).toContain("application:com.example.current-text-tests");
    await f.runtime.commands.dispatch("text.selectAll");
    await expect(f.runtime.commands.dispatch("text.insert", "One two")).resolves.toMatchObject({ status: "executed", responderId: f.responderId });
    expect(f.history.canUndo).toBe(true);
    await f.runtime.commands.dispatch("text.undo");
    await waitFor(() => expect(screen.getByRole("textbox").textContent).toBe("One"));
    await f.runtime.commands.dispatch("text.redo");
    await waitFor(() => expect(screen.getByRole("textbox").textContent).toBe("One two"));
  });

  it("shares the same document history with a second session and native model edits", async () => {
    const f = await fixture();
    const second = new TextEditingSession({ id: "second-view", documentId: f.document.id, textOwner: f.owner, history: f.history });
    cleanups.push(() => second.dispose());
    f.session.select(3); f.session.insertText(" two");
    expect(second.getSnapshot().model.text).toBe("One two");
    const snapshot = f.documents.getDocument<CurrentTextTestModel>(f.document.id)!;
    const result = f.documents.transactDocument<CurrentTextTestModel>(f.document.id, model => ({ ...model, title: "Renamed" }),
      { expectedRevision: snapshot.dirtyRevision, actionName: "Rename" });
    expect(result.status).toBe("committed");
    await second.requestHistory("undo");
    expect(f.documents.getDocument<CurrentTextTestModel>(f.document.id)!.model.title).toBe("Text 1");
    expect(f.owner.getSnapshot().text).toBe("One two");
    await second.requestHistory("undo");
    expect(f.owner.getSnapshot().text).toBe("One");
    await second.requestHistory("redo");
    expect(f.owner.getSnapshot().text).toBe("One two");
  });

  it("isolates document histories and focused responder targets", async () => {
    const f = await fixture("First");
    const second = await f.add("Second");
    f.runtime.focus.requestFocus(f.responderId);
    await f.runtime.commands.dispatch("text.selectAll");
    await f.runtime.commands.dispatch("text.insert", "Changed first");
    expect(f.history.canUndo).toBe(true); expect(second.history.canUndo).toBe(false);
    f.runtime.focus.requestFocus(second.responderId);
    await expect(f.runtime.commands.dispatch("text.undo")).resolves.toMatchObject({ status: "disabled" });
    expect(f.owner.getSnapshot().text).toBe("Changed first");
    expect(second.owner.getSnapshot().text).toBe("Second");
    f.runtime.focus.requestFocus(f.responderId); await f.runtime.commands.dispatch("text.undo");
    expect(f.owner.getSnapshot().text).toBe("First");
  });

  it("observes canonical hydration without recording it as a user undo step", async () => {
    const f = await fixture("Remote A");
    f.documents.updateDocument<CurrentTextTestModel>(f.document.id,
      model => ({ ...model, content: plainNSETextContent("Remote B") }), { actionName: "Hydrate", recordUndo: false });
    expect(f.owner.getSnapshot().text).toBe("Remote B"); expect(f.history.canUndo).toBe(false);
    await expect(f.history.undo()).resolves.toMatchObject({ status: "empty" });
    f.session.select(0, 8); await f.commands.execute("text.insert", "User C");
    await f.commands.execute("text.undo");
    expect(f.owner.getSnapshot().text).toBe("Remote B");
  });

  it("keeps standalone owner history independent of native document history", async () => {
    const f = await fixture("Document");
    const owner = createUndoableNSETextOwner({ content: attributedContent([paragraph([textRun("Standalone")])]) });
    const session = new TextEditingSession({ id: "standalone", textOwner: owner, history: owner.history });
    const commands = new NSETextCommands({ session, historyPresentation: () => owner.history.getSnapshot() });
    cleanups.push(() => { commands.dispose(); session.dispose(); owner.dispose(); });
    session.select(0, 10); await commands.execute("text.insert", "Changed");
    expect(owner.history.getSnapshot().canUndo).toBe(true); expect(f.history.canUndo).toBe(false);
    await commands.execute("text.undo");
    expect(owner.getSnapshot().text).toBe("Standalone"); expect(f.owner.getSnapshot().text).toBe("Document");
  });

  it("keeps shared canonical history alive across view unmount and revokes the session on owner disposal", async () => {
    const f = await fixture("Draft");
    const view = render(<NSETextView session={f.session} label="Draft" />);
    f.session.select(5); f.session.insertText("!");
    view.unmount();
    expect(f.session.getSnapshot().disposed).toBe(false);
    expect(f.history.canUndo).toBe(true);
    await f.commands.execute("text.undo"); expect(f.owner.getSnapshot().text).toBe("Draft");
    f.owner.dispose();
    expect(f.session.getSnapshot().disposed).toBe(true);
    await expect(f.commands.execute("text.insert", "Late")).rejects.toThrow(/revoked|disposed/);
    expect(f.documents.getDocument<CurrentTextTestModel>(f.document.id)!.model.content.blocks[0]!.runs[0]).toMatchObject({ text: "Draft" });
  });
});
