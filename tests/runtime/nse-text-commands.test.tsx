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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachmentRun, attributedContent, paragraph, textRun, plainNSETextContent,
  nseAttributedContentType, serializeAttributedContent,
} from "../../src/NSE/Text";
import { NSETextView } from "../../src/NSE/TextEditing/NSETextView";
import { findNSEText, replaceAllNSEText } from "../../src/NSE/TextEditing/textFind";
import { nseTextCommandIds, parseNSETextCommandPayload } from "../../src/NSE/TextEditing/textCommandValidation";
import { NSETextCommands } from "../../src/NSE/TextEditing/textCommands";
import type { NSETextClipboardPort } from "../../src/NSE/TextEditing/textClipboard";
import { createTestRuntimeEnvironment } from "./helpers";
import { currentTextDocumentFixture } from "./fixtures/currentTextDocument";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { cleanup(); for (const dispose of cleanups.splice(0).reverse()) await dispose(); });
async function fixture(initial: Parameters<typeof currentTextDocumentFixture>[0] = "Cloud",
  options: Parameters<typeof currentTextDocumentFixture>[1] = {}) {
  const f = await currentTextDocumentFixture(initial, options); cleanups.push(f.dispose); return f;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("current text commands through canonical owners", () => {
  it("changes editability without publishing a content mutation or undo entry", async () => {
    const f = await fixture("Stable content");
    const change = vi.fn(); const unsubscribe = f.owner.subscribe(change); cleanups.push(unsubscribe);
    render(<NSETextView session={f.session} label="Stable" />);
    const before = f.owner.getSnapshot();
    f.session.setEditable(false);
    await waitFor(() => expect(screen.getByRole("textbox").getAttribute("contenteditable")).toBe("false"));
    expect(f.owner.getSnapshot()).toBe(before); expect(change).not.toHaveBeenCalled();
    expect(f.history.canUndo).toBe(false);
  });

  it("routes formatting through the focused control once and uses the existing history", async () => {
    const f = await fixture(); f.runtime.focus.requestFocus(f.responderId);
    await f.runtime.commands.dispatch("text.selectAll");
    await expect(f.runtime.commands.dispatch("text.bold")).resolves.toMatchObject({ status: "executed", responderId: f.responderId });
    expect(f.commands.validate("text.bold").state).toBe("on");
    expect(f.runtime.responders.resolveChain()[0]).toMatchObject({ id: f.responderId, kind: "control" });
    for (const commandId of nseTextCommandIds)
      expect(f.runtime.commands.inspect().registrations.filter(item => item.commandId === commandId), commandId).toHaveLength(1);
    await f.runtime.commands.dispatch("text.undo");
    expect(f.commands.validate("text.bold").state).toBe("off");
    expect(f.owner.getSnapshot().text).toBe("Cloud");
    expect(f.history.canUndo).toBe(false); expect(f.history.canRedo).toBe(true);
  });

  it("refuses a foreign responder registration through an actual mounted command capability", async () => {
    const f = await fixture();
    f.runtime.responders.register({ id: "foreign:control", kind: "control", parentId: "workspace", scopeId: "foreign" });
    const before = f.runtime.commands.inspect().registrations.length;
    const modelBefore = f.owner.getSnapshot();
    expect(() => f.mounted.runtime.commands.register({ id: "current-text-tests.foreign-probe", responderId: "foreign:control",
      scope: "focused", title: { key: "foreign-probe", fallback: "Foreign" }, defaultKeyBindings: [], undo: { kind: "none" },
      payload: { description: "No payload", parse: () => ({ ok: true, value: undefined }) }, execute: () => "forged",
    })).toThrow(/owned|application|responder/i);
    expect(f.runtime.commands.inspect().registrations).toHaveLength(before);
    expect(f.owner.getSnapshot()).toBe(modelBefore);
  });

  it("disables mutation commands in read-only sessions while allowing selection and copy", async () => {
    const write = vi.fn(async () => {});
    const f = await fixture("Cloud", { clipboard: { read: async () => ({}), write } });
    f.session.select(0, 5); f.session.setEditable(false);
    for (const id of ["text.bold", "text.cut", "text.paste", "text.undo"] as const) expect(f.commands.validate(id).enabled).toBe(false);
    expect(f.commands.validate("text.copy").enabled).toBe(true);
    await f.commands.execute("text.copy"); expect(write).toHaveBeenCalledOnce();
    await expect(f.commands.execute("text.insert", "bad")).rejects.toThrow(/read-only/);
    expect(f.owner.getSnapshot().text).toBe("Cloud");
  });

  it("inserts markup literally and replaces all matches as one failure-atomic history action", async () => {
    const f = await fixture("cloud cloud");
    render(<NSETextView session={f.session} label="Literal" />);
    f.session.select(11); await f.commands.execute("text.insert", "<img src=x onerror=alert(1)>");
    expect(screen.getByRole("textbox").querySelector("img")).toBeNull();
    expect(f.owner.getSnapshot().text).toBe("cloud cloud<img src=x onerror=alert(1)>");
    const result = findNSEText(f.owner.getSnapshot(), "cloud");
    replaceAllNSEText(f.session, result, "Sky");
    expect(f.history.undoTitle).toBe("Undo Replace All");
    expect(f.owner.getSnapshot().text).toBe("Sky Sky<img src=x onerror=alert(1)>");
    await f.commands.execute("text.undo");
    expect(f.owner.getSnapshot().text).toBe("cloud cloud<img src=x onerror=alert(1)>");
    const before = f.owner.getSnapshot();
    expect(() => replaceAllNSEText(f.session, findNSEText(before, "cloud"), "😀".repeat(300_000))).toThrow(/byte limit|exceed/i);
    expect(f.owner.getSnapshot()).toBe(before);
  });

  it("rejects stale, forged, over-limit and aborted replace-all preparation without a partial edit", async () => {
    const f = await fixture("aaaa");
    const result = findNSEText(f.owner.getSnapshot(), "a");
    const before = f.owner.getSnapshot();
    expect(() => replaceAllNSEText(f.session, { ...result, matches: [{ location: 0, length: 4 }] }, "b")).toThrow(/invalid|stale/);
    const abort = new AbortController(); abort.abort(new Error("cancelled before publication"));
    expect(() => replaceAllNSEText(f.session, result, "b", abort.signal)).toThrow(/cancelled/);
    expect(f.owner.getSnapshot()).toBe(before);
    f.session.insertText("x");
    expect(() => replaceAllNSEText(f.session, result, "b")).toThrow(/stale/);
    const large = await fixture("a".repeat(20_001));
    const largeBefore = large.owner.getSnapshot();
    expect(() => findNSEText(largeBefore, "a")).toThrow(/match limit/);
    expect(large.owner.getSnapshot()).toBe(largeBefore); expect(large.history.canUndo).toBe(false);
  });

  it("rejects stale captured command targets when switching to a different document session", async () => {
    const f = await fixture("First"), second = await f.add("Second");
    const oldTarget = f.session.captureTarget();
    await expect(second.commands.execute("text.insert", "forged", { target: oldTarget })).rejects.toThrow(/stale|revoked/);
    expect(f.owner.getSnapshot().text).toBe("First"); expect(second.owner.getSnapshot().text).toBe("Second");
    expect(second.history.canUndo).toBe(false);
  });

  it("cancels an uncooperative clipboard read on session disposal and refuses a late result", async () => {
    const gate = deferred<Readonly<Record<string, string>>>(); let providerSignal!: AbortSignal;
    const f = await fixture("Before", { clipboard: { read: signal => { providerSignal = signal; return gate.promise; }, write: async () => {} } });
    const pending = f.commands.execute("text.paste"), rejected = expect(pending).rejects.toThrow(/revoked|disposed/);
    const before = f.owner.getSnapshot();
    f.session.dispose(); expect(providerSignal.aborted).toBe(true); await rejected;
    gate.resolve({ "text/plain": "Late" }); await Promise.resolve();
    expect(f.owner.getSnapshot()).toBe(before); expect(f.history.canUndo).toBe(false);
  });

  it("cancels pending text commands on mounted app revocation", async () => {
    const gate = deferred<Readonly<Record<string, string>>>();
    const f = await fixture("Before", { clipboard: { read: () => gate.promise, write: async () => {} } });
    const before = f.session.getSnapshot().model;
    const pending = f.commands.execute("text.paste"), rejected = expect(pending).rejects.toThrow(/revoked|disposed|abort/i);
    f.mounted.dispose("text owner closed"); await rejected;
    gate.resolve({ "text/plain": "Late" }); await Promise.resolve();
    expect(f.session.getSnapshot()).toMatchObject({ disposed: true, model: before });
    expect(() => f.history.canUndo).toThrow(/revoked|abort/i);
  });

  it("cancels pending commands on runtime disposal", async () => {
    const gate = deferred<Readonly<Record<string, string>>>();
    const f = await fixture("Before", { clipboard: { read: () => gate.promise, write: async () => {} } });
    const pending = f.commands.execute("text.paste"), rejected = expect(pending).rejects.toThrow(/revoked|disposed|abort/i);
    const before = f.session.getSnapshot().model;
    await f.runtime.dispose({ reason: "text command disposal", inFlight: "cancel", timeoutMs: 1_000 });
    await rejected; gate.resolve({ "text/plain": "Late" }); await Promise.resolve();
    expect(f.session.getSnapshot().model).toEqual(before);
  });

  it("refuses late paste after selection moves, but maps an unrelated canonical insertion", async () => {
    const gate = deferred<Readonly<Record<string, string>>>();
    const f = await fixture("abcd", { clipboard: { read: () => gate.promise, write: async () => {} } });
    f.session.select(2, 4); const pending = f.commands.execute("text.paste");
    f.owner.commit({ expectedRevision: f.owner.getSnapshot().revision,
      operations: [{ kind: "replace", range: { location: 0, length: 0 }, content: plainNSETextContent("prefix ") }] });
    gate.resolve({ "text/plain": "X" }); await pending;
    expect(f.owner.getSnapshot().text).toBe("prefix abX");
    const other = deferred<Readonly<Record<string, string>>>();
    const commands = new NSETextCommands({ session: f.session, clipboard: { read: () => other.promise, write: async () => {} } });
    cleanups.push(() => commands.dispose());
    const late = commands.execute("text.paste"); f.session.select(0); other.resolve({ "text/plain": "BAD" });
    await expect(late).rejects.toThrow(/stale|revoked/); expect(f.owner.getSnapshot().text).toBe("prefix abX");
  });

  it("keeps selection, model, history and pasteboard unchanged after a malformed partial cut acknowledgement", async () => {
    let malformed = false;
    const environment = { ...createTestRuntimeEnvironment(), clipboard: {
      read: vi.fn(async () => []),
      write: vi.fn(async () => malformed ? { writtenTypes: ["text/plain"], omittedTypes: [], partial: true } : undefined),
    } };
    let f!: Awaited<ReturnType<typeof fixture>>;
    const clipboard: NSETextClipboardPort = {
      read: async () => ({}),
      write: async (payload, signal) => { await f.runtime.pasteboards.system.write([
        { type: nseAttributedContentType, value: payload[nseAttributedContentType]! },
        { type: "text/plain", value: payload["text/plain"]! },
      ], signal); },
    };
    f = await fixture("Keep selected", { clipboard, runtimeOptions: { environment } });
    await f.runtime.pasteboards.system.write([{ type: "text/plain", value: "before" }]);
    const previous = f.runtime.pasteboards.system.snapshot(), count = f.runtime.pasteboards.system.changeCount;
    f.session.select(0, 13); const target = f.session.captureTarget(), before = f.owner.getSnapshot();
    malformed = true;
    await expect(f.commands.execute("text.cut")).rejects.toMatchObject({ name: "PasteboardUnavailableError" });
    expect(f.session.captureTarget()).toEqual(target); expect(f.owner.getSnapshot()).toBe(before);
    expect(f.history.canUndo).toBe(false);
    expect(f.runtime.pasteboards.system.changeCount).toBe(count); expect(f.runtime.pasteboards.system.snapshot()).toEqual(previous);
  });

  it("copies portable attributes and links, prioritises attributed MIME, and records one named paste", async () => {
    let stored: Readonly<Record<string, string>> = {};
    const clipboard = { read: async () => stored, write: async (payload: Readonly<Record<string, string>>) => { stored = payload; } };
    const content = attributedContent([paragraph([textRun("Cloud", { bold: true, link: "https://example.test" })], { alignment: "end" })]);
    const f = await fixture(content, { clipboard }); f.session.select(0, 5);
    await f.commands.execute("text.copy"); expect(stored["text/plain"]).toBe("Cloud");
    const second = await f.add("");
    stored = { "text/plain": "fallback must not win", [nseAttributedContentType]: stored[nseAttributedContentType]! };
    await second.commands.execute("text.paste");
    expect(second.owner.getSnapshot().attributedContent.blocks[0]).toMatchObject({ attributes: { alignment: "end" }, runs: [{ attributes: { bold: true, link: "https://example.test" } }] });
    expect(second.history.undoTitle).toBe("Undo Paste");
    await second.commands.execute("text.undo"); expect(second.owner.getSnapshot().text).toBe("");
  });

  it("leaves dangerous plain clipboard markup literal and rejects hostile attributed MIME without fallback", async () => {
    const payload: Record<string, string> = { "text/plain": "<script>alert(1)</script>" };
    const f = await fixture("", { clipboard: { read: async () => payload, write: async () => {} } });
    render(<NSETextView session={f.session} label="Clipboard" />);
    await f.commands.execute("text.paste"); expect(screen.getByRole("textbox").querySelector("script")).toBeNull();
    expect(f.owner.getSnapshot().text).toBe(payload["text/plain"]);
    payload[nseAttributedContentType] = JSON.stringify({ type: "nse-attributed-content", version: 1, blocks: [{ kind: "paragraph", runs: [], script: "bad" }] });
    const before = f.owner.getSnapshot();
    await expect(f.commands.execute("text.paste")).rejects.toThrow(/unsupported/);
    expect(f.owner.getSnapshot()).toBe(before);
  });

  it("treats attachments as one semantic unit with descriptive copy and canonical undo", async () => {
    const f = await fixture("");
    const descriptor = await f.runtime.documentResources.acquire(f.document.id,
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), new AbortController().signal);
    const content = attributedContent([paragraph([attachmentRun({ id: "attachment:unit", kind: "image", source: descriptor, alt: "Diagram" })])]);
    expect(f.runtime.documentResources.isActive(f.document.id, descriptor)).toBe(true);
    await f.commands.execute("text.replace", { range: { location: 0, length: 0 }, content });
    expect(f.owner.getSnapshot().text).toBe("\uFFFC");
    f.session.select(0, 1);
    const written = vi.fn(async () => {});
    const copy = new NSETextCommands({ session: f.session, clipboard: { read: async () => ({}), write: written } });
    cleanups.push(() => copy.dispose());
    await copy.execute("text.copy");
    expect(written).toHaveBeenCalledWith(expect.objectContaining({ "text/plain": "Diagram", [nseAttributedContentType]: serializeAttributedContent(content) }), expect.any(AbortSignal));
    await f.commands.execute("text.insert", "Replacement");
    await f.commands.execute("text.undo");
    expect(f.owner.getSnapshot().text).toBe("\uFFFC");
    expect(f.owner.getSnapshot().attributedContent).toEqual(content);
    expect(f.runtime.documentResources.isActive("other-document", descriptor)).toBe(false);
    f.runtime.documentResources.release(f.document.id, descriptor);
    expect(f.runtime.documentResources.isActive(f.document.id, descriptor)).toBe(false);
  });

  it("measures command ingress in UTF-8 bytes and rejects accessor payloads without evaluating them", () => {
    expect(() => parseNSETextCommandPayload("text.insert", "😀".repeat(300_000))).toThrow(/byte limit|exceed/i);
    expect(parseNSETextCommandPayload("text.insert", "é".repeat(100))).toBe("é".repeat(100));
    const getter = vi.fn(() => 0); const range = {};
    Object.defineProperty(range, "location", { enumerable: true, get: getter });
    expect(() => parseNSETextCommandPayload("text.replace", { range, content: plainNSETextContent("") })).toThrow(/accessor|data propert/i);
    expect(getter).not.toHaveBeenCalled();
  });

  it("keeps logical paragraph alignment through native text projection and canonical history", async () => {
    const f = await fixture("مرحبا");
    render(<NSETextView session={f.session} label="Arabic" />);
    await f.commands.execute("text.paragraphAttributes", { alignment: "start" });
    expect(f.owner.getSnapshot().attributedContent.blocks[0]!.attributes!.alignment).toBe("start");
    await waitFor(() => expect(screen.getByRole("textbox").querySelector("p")!.style.textAlign).toBe("start"));
    await f.commands.execute("text.paragraphAttributes", { alignment: "end" });
    await f.commands.execute("text.undo");
    expect(f.owner.getSnapshot().attributedContent.blocks[0]!.attributes!.alignment).toBe("start");
  });

  it("uses the supplied canonical history for native undo and redo chords", async () => {
    const f = await fixture("One");
    render(<NSETextView session={f.session} label="Keyboard history" />);
    f.session.select(3); f.session.insertText(" two");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "z", ctrlKey: true });
    await waitFor(() => expect(f.owner.getSnapshot().text).toBe("One"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "z", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(f.owner.getSnapshot().text).toBe("One two"));
  });

  it("deletes whole graphemes and blocks commands while marked text is provisional", async () => {
    const f = await fixture("Ae\u0301👨‍👩‍👧‍👦");
    f.session.select(f.owner.getSnapshot().text.length); await f.commands.execute("text.deleteBackward");
    expect(f.owner.getSnapshot().text).toBe("Ae\u0301");
    await f.commands.execute("text.deleteBackward"); expect(f.owner.getSnapshot().text).toBe("A");
    const before = f.owner.getSnapshot(); f.session.setMarkedText("draft");
    expect(f.commands.validate("text.bold").enabled).toBe(false);
    await expect(f.commands.execute("text.insert", "bad")).rejects.toThrow(/composition/);
    expect(f.owner.getSnapshot()).toBe(before);
  });
});
