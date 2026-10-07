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
import { attributedContent, paragraph, textRun, createInMemoryNSETextOwner } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { NSETextView } from "../../../src/NSE/TextEditing/NSETextView";
afterEach(cleanup);
describe("bounded text view", () => {
  it("leaves links followable in a read-only view", () => {
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("Read on", { link: "https://syndromatic.example/journal" })])]) });
    const session = new TextEditingSession({ id: "reader", owner, editable: false });
    render(<NSETextView session={session} label="Post" />);
    const link = screen.getByRole("textbox").querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://syndromatic.example/journal");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });
  it("updates accessible presentation options without replacing the native editing host", () => {
    const owner = createInMemoryNSETextOwner(); const session = new TextEditingSession({ id: "stable", owner });
    const mounted = render(<NSETextView session={session} label="Initial" spellCheck />);
    const native = screen.getByRole("textbox", { name: "Initial" });
    mounted.rerender(<NSETextView session={session} label="Revised" spellCheck={false} />);
    expect(screen.getByRole("textbox", { name: "Revised" })).toBe(native);
    expect(native.getAttribute("spellcheck")).toBe("false");
  });
  it("projects canonical multiline text and updates two views from one owner", () => {
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("one")]), paragraph([textRun("two")])]) });
    const first = new TextEditingSession({ id: "first", owner });
    const second = new TextEditingSession({ id: "second", owner });
    render(<><NSETextView session={first} label="First" /><NSETextView session={second} label="Second" /></>);
    expect(screen.getAllByRole("textbox").map(el => el.textContent)).toEqual(["onetwo", "onetwo"]);
    act(() => { first.select(0, 3); first.insertText("new"); });
    expect(screen.getAllByRole("textbox").map(el => el.textContent)).toEqual(["newtwo", "newtwo"]);
  });
  it("projects formatting and transitions to read-only without exposing a backend", () => {
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("hello")])]) });
    const session = new TextEditingSession({ id: "first", owner });
    render(<NSETextView session={session} label="Document" />);
    act(() => { session.select(0, 5); session.applyAttributes({ bold: true }); });
    expect(screen.getByRole("textbox").querySelector("span")?.style.fontWeight).toBe("700");
    act(() => session.setEditable(false));
    expect(screen.getByRole("textbox").getAttribute("contenteditable")).toBe("false");
    expect(screen.getByRole("textbox").getAttribute("aria-readonly")).toBe("true");
  });
  it("unmounts presentation without disposing the shared content owner", () => {
    const owner = createInMemoryNSETextOwner(); const session = new TextEditingSession({ id: "one", owner });
    const view = render(<NSETextView session={session} label="Document" />);
    view.unmount(); session.insertText("still alive");
    expect(owner.getSnapshot().text).toBe("still alive");
  });
});
