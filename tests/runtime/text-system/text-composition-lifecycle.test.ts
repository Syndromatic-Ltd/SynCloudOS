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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { attributedContent, paragraph, textRun, attachmentRun, createInMemoryNSETextOwner } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { SynCloudOSLifecycleError } from "../../../src/SynCloudOS/nseRuntimeContracts";

afterEach(cleanup);

async function clientClass() {
  const module = await import("../../../src/NSE/TextEditing/NSETextInputClient").catch(() => null);
  expect(module?.NSETextInputClient, "B08 must preserve native composition ownership").toBeTypeOf("function");
  return module!.NSETextInputClient;
}
function fixture(text = "abcd") {
  const owner = createInMemoryNSETextOwner({ flowId: "body", content: attributedContent([paragraph([textRun(text)])]) });
  return { owner, session: new TextEditingSession({ id: "ime-input", owner }) };
}
describe("custom input composition lifecycle", () => {
  it("replaces marked drafts repeatedly and commits reconversion once with a draft-local selection", async () => {
    const Client = await clientClass(); const { owner, session } = fixture(); const client = new Client({ session });
    let commits = 0; owner.subscribe(() => { commits++; });
    client.setSelectedRange({ location: 1, length: 2 }); const token = client.beginComposition();
    client.setMarkedText("仮", { composition: token });
    client.setMarkedText("日本語", { composition: token, selectedRange: { location: 1, length: 0 } });
    expect(owner.getSnapshot().text).toBe("abcd");
    expect(client.getSnapshot()).toMatchObject({ selectedRange: { location: 2, length: 0 }, markedRange: { location: 1, length: 3 } });
    expect(client.getSnapshot().projection.text).toBe("a日本語d");
    expect(session.settleEditing().status).toBe("refused");
    expect(client.unmarkText(token).status).toBe("applied");
    expect(owner.getSnapshot().text).toBe("a日本語d");
    expect(session.getSnapshot().selection.range).toEqual({ location: 2, length: 0 });
    expect(client.unmarkText(token).status).toBe("ignored");
    expect(commits).toBe(1); client.dispose();
  });
  it("uses an explicit empty marked replacement instead of the selected canonical range", async () => {
    const Client = await clientClass(); const { owner, session } = fixture(); const client = new Client({ session });
    client.setSelectedRange({ location: 1, length: 2 });
    client.setMarkedText("X", { replacementRange: { location: 0, length: 0 } }); client.unmarkText();
    expect(owner.getSnapshot().text).toBe("Xabcd"); client.dispose();
  });
  it("rejects late compositionend after cancellation, a newer composition or client disposal", async () => {
    const Client = await clientClass(); const { owner, session } = fixture(); const client = new Client({ session });
    const old = client.beginComposition(); client.setMarkedText("old", { composition: old }); client.cancelMarkedText(old);
    const next = client.beginComposition(); client.setMarkedText("new", { composition: next });
    expect(client.unmarkText(old).status).toBe("ignored");
    expect(session.getSnapshot().marked?.text).toBe("new");
    client.dispose(); expect(client.unmarkText(next).status).toBe("ignored");
    expect(owner.getSnapshot().text).toBe("abcd");
    expect(session.getSnapshot().disposed).toBe(false); session.insertText("usable");
    expect(owner.getSnapshot().text).toContain("usable");
  });
  it("preserves a conflicted marked draft after an external overlapping canonical edit", async () => {
    const Client = await clientClass(); const { owner, session } = fixture(); const other = new TextEditingSession({ id: "other", owner });
    const client = new Client({ session }); client.setSelectedRange({ location: 1, length: 2 }); const token = client.beginComposition();
    client.setMarkedText("日本語", { composition: token });
    other.insertText("remote", { location: 1, length: 1 });
    const result = client.unmarkText(token);
    expect(result.status).toBe("rejected");
    expect(session.getSnapshot().marked).toMatchObject({ text: "日本語", conflict: true });
    expect(owner.getSnapshot().text).toBe("aremotecd");
    client.cancelMarkedText(token); expect(session.getSnapshot().marked).toBeNull(); client.dispose();
  });
  it("remaps nonoverlapping external edits and preserves final committed content", async () => {
    const Client = await clientClass(); const { owner, session } = fixture("abcdef"); const other = new TextEditingSession({ id: "other", owner });
    const client = new Client({ session }); client.setSelectedRange({ location: 3, length: 1 }); const token = client.beginComposition();
    client.setMarkedText("語", { composition: token }); other.insertText("Z", { location: 0, length: 0 });
    expect(client.unmarkText(token).status).toBe("applied"); expect(owner.getSnapshot().text).toBe("Zabc語ef"); client.dispose();
  });
  it("edits marked text by grapheme without committing interim deletions", async () => {
    const Client = await clientClass(); const { owner, session } = fixture(""); const client = new Client({ session });
    const token = client.beginComposition(); client.setMarkedText("😀é", { composition: token });
    client.doCommand("deleteBackward"); expect(session.getSnapshot().marked?.text).toBe("😀");
    expect(owner.getSnapshot().text).toBe(""); client.unmarkText(token); expect(owner.getSnapshot().text).toBe("😀"); client.dispose();
  });
  it("keeps marked candidate geometry pending and rejects split-surrogate draft selections", async () => {
    const Client = await clientClass(); const { session } = fixture(); const client = new Client({ session });
    const token = client.beginComposition();
    expect(client.setMarkedText("😀", { composition: token, selectedRange: { location: 1, length: 0 } }).status).toBe("rejected");
    client.setMarkedText("😀", { composition: token });
    expect(client.firstRectForRange(client.getSnapshot().selectedRange).status).toBe("pending"); client.dispose();
  });
  it("keeps the marked selection direction when extending movement from its focus", async () => {
    const Client = await clientClass(); const { session } = fixture(""); const client = new Client({ session });
    const token = client.beginComposition(); client.setMarkedText("abc", { composition: token });
    client.setSelectedRange({ location: 1, length: 2 }, { direction: "backward" }); client.doCommand("moveBackward", true);
    expect(client.getSnapshot().selectedRange).toEqual({ location: 0, length: 3 });
    client.unmarkText(token); expect(session.getSnapshot().selection).toMatchObject({ anchor: 3, focus: 0 }); client.dispose();
  });
});

async function hostComponent() {
  const hostPath = "../../../src/NSE/TextEditing/textInputHost";
  const module: typeof import("../../../src/NSE/TextEditing/textInputHost") | null = await import(hostPath).catch(() => null);
  expect(module?.NSETextInputHost, "B08 requires a stable native accessible input host").toBeTypeOf("function");
  return module!.NSETextInputHost;
}
describe("stable native custom-surface input host", () => {
  it("keeps one accessible reading source and stable textarea across rerendered canvas/layout", async () => {
    const Client = await clientClass(), Host = await hostComponent();
    const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("Read", { link: "https://example.test/read" }), attachmentRun({ id: "figure", kind: "image", source: { kind: "remote", url: "https://example.test/figure.png" }, alt: "Mountain photograph" })]), paragraph([textRun("Second paragraph")])]) });
    const session = new TextEditingSession({ id: "accessible-host", owner }); const client = new Client({ session });
    const view = render(React.createElement(Host, { client, label: "Article" }, React.createElement("canvas", { "aria-label": "Duplicate drawn article" })));
    const textarea = screen.getByRole("textbox", { name: "Article" }) as HTMLTextAreaElement;
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(textarea.value).toBe("Read\uFFFC\nSecond paragraph");
    const descriptions = document.getElementById(textarea.getAttribute("aria-describedby")!);
    expect(descriptions?.textContent).toContain("Mountain photograph");
    expect(descriptions?.textContent).toContain("https://example.test/read");
    expect(screen.getByLabelText("Duplicate drawn article").closest('[aria-hidden="true"]')).not.toBeNull();
    view.rerender(React.createElement(Host, { client, label: "Article", style: { width: 400 } }, React.createElement("canvas", { "aria-label": "Duplicate drawn article" })));
    expect(screen.getByRole("textbox")).toBe(textarea);
    client.dispose();
  });
  it("reconciles beforeinput replacement, native selection and plain text paste through one owner", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    render(React.createElement(Host, { client, label: "Custom text" }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => { textarea.setSelectionRange(1, 3); textarea.dispatchEvent(new Event("select", { bubbles: true })); });
    act(() => { textarea.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: "X" })); });
    expect(owner.getSnapshot().text).toBe("aXd");
    expect(textarea.value).toBe("aXd");
    fireEvent.paste(textarea, { clipboardData: { getData: (type: string) => type === "text/plain" ? "😀" : "" } });
    expect(owner.getSnapshot().text).toBe("aX😀d");
    client.dispose();
  });
  it("commits composition once and ignores its terminal native input event", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    let commits = 0; owner.subscribe(() => { commits++; });
    render(React.createElement(Host, { client, label: "IME" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => client.setSelectedRange({ location: 1, length: 2 }));
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "日本" });
    textarea.value = "a日本d"; textarea.setSelectionRange(3, 3);
    fireEvent.input(textarea, { inputType: "insertCompositionText", data: "日本", isComposing: true });
    expect(owner.getSnapshot().text).toBe("abcd");
    fireEvent.compositionEnd(textarea, { data: "日本" });
    act(() => { textarea.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromComposition", data: "日本" })); });
    fireEvent.input(textarea, { inputType: "insertFromComposition", data: "日本" });
    fireEvent.compositionEnd(textarea, { data: "日本" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(owner.getSnapshot().text).toBe("a日本d"); expect(commits).toBe(1); client.dispose();
  });
  it("preserves composition on focus transfer and cancels late finalization on Escape/unmount", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    const view = render(React.createElement(Host, { client, label: "IME" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "draft" }); fireEvent.blur(textarea);
    expect(session.settleEditing().status).toBe("refused");
    fireEvent.keyDown(textarea, { key: "Escape" }); fireEvent.compositionEnd(textarea, { data: "late" });
    expect(owner.getSnapshot().text).toBe("abcd");
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "second" }); view.unmount();
    fireEvent.compositionEnd(textarea, { data: "late after unmount" });
    expect(owner.getSnapshot().text).toBe("abcd"); expect(session.getSnapshot().marked).toBeNull();
    client.insertText("alive"); expect(owner.getSnapshot().text).toContain("alive"); client.dispose();
  });
  it("reconciles native input without data and avoids splitting a surrogate pair in its diff", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture("😀a"); const client = new Client({ session });
    render(React.createElement(Host, { client, label: "Fallback input" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.value = "😁a"; textarea.setSelectionRange(2, 2); fireEvent.input(textarea, { data: null, inputType: "insertReplacementText" });
    expect(owner.getSnapshot().text).toBe("😁a"); client.dispose();
  });
  it("accepts the final native value after an empty compositionend before finalization", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    render(React.createElement(Host, { client, label: "Final native value" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => client.setSelectedRange({ location: 1, length: 2 }));
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "に" });
    fireEvent.compositionEnd(textarea, { data: "" });
    textarea.value = "a日本d"; textarea.setSelectionRange(3, 3);
    fireEvent.input(textarea, { inputType: "insertFromComposition", data: null });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(owner.getSnapshot().text).toBe("a日本d"); expect(session.getSnapshot().marked).toBeNull(); client.dispose();
  });
  it.each(["Escape", "unmount"] as const)("preserves an already-ended final native draft before %s", async ending => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    let commits = 0; owner.subscribe(() => { commits++; });
    const view = render(React.createElement(Host, { client, label: "Finalization ordering" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "old draft" });
    fireEvent.compositionEnd(textarea, { data: "" }); textarea.value = "語abcd"; textarea.setSelectionRange(1, 1);
    fireEvent.input(textarea, { inputType: "insertFromComposition", data: "語" });
    if (ending === "Escape") fireEvent.keyDown(textarea, { key: "Escape" }); else view.unmount();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(owner.getSnapshot().text).toBe("語abcd"); expect(commits).toBe(1); client.dispose();
  });
  it("ignores canceled composition input and end events even when a late native event changes the textarea", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    render(React.createElement(Host, { client, label: "Canceled native events" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "draft" }); fireEvent.keyDown(textarea, { key: "Escape" });
    textarea.value = "lateabcd"; fireEvent.input(textarea, { inputType: "insertCompositionText", data: "late", isComposing: true });
    fireEvent.compositionEnd(textarea, { data: "late" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(owner.getSnapshot().text).toBe("abcd"); expect(textarea.value).toBe("abcd"); client.dispose();
  });
  it("revokes the bridge and native finalization when the canonical owner is disposed", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    render(React.createElement(Host, { client, label: "Disposed owner" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "draft" });
    act(() => owner.dispose()); fireEvent.compositionEnd(textarea, { data: "late" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(client.getSnapshot().disposed).toBe(true);
    expect(session.getSnapshot().model.text).toBe("abcd"); expect(textarea.readOnly).toBe(true);
    expect(() => client.attachInputHost(() => null)).toThrow(SynCloudOSLifecycleError);
    expect(() => client.attachInputHost(() => null)).toThrow(expect.objectContaining({ code: "NSE_TEXT_INPUT_CLIENT_DISPOSED", operation: "attachInputHost" })); client.dispose();
  });
  it("accepts a revision-fenced final composition input in a later native task after an empty end", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    let commits = 0; owner.subscribe(() => { commits++; });
    render(React.createElement(Host, { client, label: "Later final input" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => client.setSelectedRange({ location: 1, length: 2 }));
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "仮" }); fireEvent.compositionEnd(textarea, { data: "" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(owner.getSnapshot().text).toBe("abcd"); expect(session.getSnapshot().marked).toBeNull();
    textarea.value = "a確定d"; textarea.setSelectionRange(3, 3);
    fireEvent.input(textarea, { inputType: "insertFromComposition", data: null });
    fireEvent.input(textarea, { inputType: "insertFromComposition", data: "確定" });
    expect(owner.getSnapshot().text).toBe("a確定d"); expect(commits).toBe(1); client.dispose();
  });
  it("rejects a later final native input when an external edit has invalidated its empty-end ticket", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    const other = new TextEditingSession({ id: "remote-input", owner });
    render(React.createElement(Host, { client, label: "Stale native end" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "draft" }); fireEvent.compositionEnd(textarea, { data: "" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    act(() => other.insertText("remote", { location: 0, length: 1 }));
    textarea.value = "lateabcd"; fireEvent.input(textarea, { inputType: "insertFromComposition", data: "late" });
    expect(owner.getSnapshot().text).toBe("remotebcd"); expect(textarea.value).toBe("remotebcd"); client.dispose(); other.dispose();
  });
  it.each(["owner", "session", "client"] as const)("cancels scheduled finalization on %s disposal without committing late native content", async lifetime => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    render(React.createElement(Host, { client, label: "Revoked finalization" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "draft" }); fireEvent.compositionEnd(textarea, { data: "final" });
    act(() => { if (lifetime === "owner") owner.dispose(); else if (lifetime === "session") session.dispose(); else client.dispose(); });
    textarea.value = "lateabcd"; fireEvent.input(textarea, { inputType: "insertFromComposition", data: "late" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(session.getSnapshot().model.text).toBe("abcd"); expect(client.getSnapshot().disposed).toBe(true); expect(textarea.readOnly).toBe(true);
    client.dispose();
  });
  it("commits a native empty marked replacement and clears a canceled empty end without input", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    render(React.createElement(Host, { client, label: "Empty final text" })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => client.setSelectedRange({ location: 1, length: 2 }));
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "仮" }); fireEvent.compositionEnd(textarea, { data: "" });
    textarea.value = "ad"; textarea.setSelectionRange(1, 1); fireEvent.input(textarea, { inputType: "insertFromComposition", data: "" });
    expect(owner.getSnapshot().text).toBe("ad");
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "cancel me" }); fireEvent.compositionEnd(textarea, { data: "" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(owner.getSnapshot().text).toBe("ad"); expect(session.getSnapshot().marked).toBeNull(); client.dispose();
  });
  it("preserves a conflicted native marked draft for Escape recovery after rejected finalization", async () => {
    const Client = await clientClass(), Host = await hostComponent(); const { owner, session } = fixture(); const client = new Client({ session });
    const other = new TextEditingSession({ id: "overlap", owner }); const failures: unknown[] = [];
    render(React.createElement(Host, { client, label: "Conflicted final text", onInputError: error => failures.push(error) })); const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    act(() => client.setSelectedRange({ location: 1, length: 2 }));
    fireEvent.compositionStart(textarea); fireEvent.compositionUpdate(textarea, { data: "日本" });
    act(() => other.insertText("remote", { location: 1, length: 1 })); fireEvent.compositionEnd(textarea, { data: "日本語" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(owner.getSnapshot().text).toBe("aremotecd"); expect(session.getSnapshot().marked?.conflict).toBe(true); expect(failures.length).toBeGreaterThan(0);
    fireEvent.keyDown(textarea, { key: "Escape" }); expect(session.getSnapshot().marked).toBeNull(); expect(textarea.value).toBe("aremotecd"); client.dispose(); other.dispose();
  });
});
