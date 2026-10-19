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
import { attributedContent, paragraph, textRun, createInMemoryNSETextOwner } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import type { NSETextGeometryProvider, NSETextGeometryRevision } from "../../../src/NSE/TextLayout/textGeometryTypes";
import { createNSETextPresentationTransforms } from "../../../src/NSE/TextLayout/textGeometryTransforms";
import { declareSynCloudOSLifecycleSignal, SynCloudOSLifecycleError } from "../../../src/SynCloudOS/nseRuntimeContracts";

async function clientClass() {
  const module = await import("../../../src/NSE/TextEditing/NSETextInputClient").catch(() => null);
  expect(module?.NSETextInputClient, "B08 requires a real session-owned platform input bridge").toBeTypeOf("function");
  return module!.NSETextInputClient;
}
function fixture(text = "A😀é👨‍👩‍👧‍👦Z") {
  const owner = createInMemoryNSETextOwner({ flowId: "body", content: attributedContent([paragraph([textRun(text)])]) });
  const session = new TextEditingSession({ id: "custom-input", owner });
  return { owner, session };
}
function geometry(session: TextEditingSession) {
  const model = session.getSnapshot().model;
  let revision: NSETextGeometryRevision = { modelRevision: model.revision, ownerGeneration: model.ownerGeneration, layoutGeneration: 1, fontGeneration: 2, resourceGeneration: 3, containerGeneration: 4 };
  let current = true, complete = true;
  let queriedPoint: unknown;
  const space = { name: "container:body", units: "points" as const };
  const provider: NSETextGeometryProvider = {
    snapshot: () => ({ flowId: "body", revision: { ...revision }, kind: "shaped", complete, current, textLength: model.text.length, units: "points" }),
    caret: position => ({ ...position, containerId: "body", primary: { rect: { x: 10, y: 20, width: 1, height: 12 }, space, transformRevision: 0 }, secondary: null, visibility: "visible" }),
    selection: range => [{ ...range, containerId: "body", rect: { x: 10, y: 20, width: 20, height: 12 }, space, transformRevision: 0 }],
    positionAt: point => { queriedPoint = point; return { flowId: "body", revision: { ...revision }, offset: 2, affinity: "upstream" }; },
  };
  return { provider, space, point: () => queriedPoint, incomplete: () => { complete = false; }, stale: () => { current = false; }, mutateGeneration: () => { revision = { ...revision, fontGeneration: revision.fontGeneration + 1 }; } };
}

describe("custom text input client", () => {
  it.each(["explicit", "application-closed"] as const)("records %s for both throwing disposed entry points", async reason => {
    const Client = await clientClass(); const { owner, session } = fixture("abc");
    const signal = new AbortController();
    declareSynCloudOSLifecycleSignal(signal.signal, "application-closed");
    const client = new Client({ session, signal: signal.signal });
    if (reason === "explicit") client.dispose(); else signal.abort();
    client.dispose(); session.dispose(); signal.abort();
    for (const [operation, action] of Object.entries({ beginComposition: () => client.beginComposition(), attachInputHost: () => client.attachInputHost(() => null) })) {
      expect(action).toThrow(SynCloudOSLifecycleError);
      expect(action).toThrow(expect.objectContaining({ code: "NSE_TEXT_INPUT_CLIENT_DISPOSED", operation, disposal: expect.objectContaining({ reason }) }));
    }
    expect(client.insertText("late")).toEqual({ status: "ignored", reason: "disposed" });
    owner.dispose();
  });
  it("preserves application closure through the session owner signal", async () => {
    const Client = await clientClass(); const owner = createInMemoryNSETextOwner();
    const signal = new AbortController();
    declareSynCloudOSLifecycleSignal(signal.signal, "application-closed");
    const session = new TextEditingSession({ id: "owned-input", owner, signal: signal.signal });
    const client = new Client({ session }); signal.abort(); client.dispose();
    expect(() => client.beginComposition()).toThrow(SynCloudOSLifecycleError);
    expect(() => client.beginComposition()).toThrow(expect.objectContaining({ code: "NSE_TEXT_INPUT_CLIENT_DISPOSED", operation: "beginComposition", disposal: expect.objectContaining({ reason: "application-closed" }) }));
    owner.dispose();
  });
  it("honors empty explicit replacement and delegates one canonical edit to the session owner", async () => {
    const Client = await clientClass();
    const { owner, session } = fixture("abcd");
    let commits = 0; owner.subscribe(() => { commits++; });
    const client = new Client({ session });
    client.setSelectedRange({ location: 1, length: 2 });
    expect(client.insertText("X", { replacementRange: { location: 0, length: 0 } }).status).toBe("applied");
    expect(owner.getSnapshot().text).toBe("Xabcd");
    expect(commits).toBe(1);
    expect(client.getSnapshot().selectedRange).toEqual({ location: 1, length: 0 });
    client.dispose();
  });
  it("moves and deletes by grapheme without splitting surrogate/combining/ZWJ clusters", async () => {
    const Client = await clientClass();
    const { owner, session } = fixture(); const client = new Client({ session });
    client.doCommand("moveToEnd"); client.doCommand("moveBackward");
    expect(client.getSnapshot().selectedRange.location).toBe(owner.getSnapshot().text.length - 1);
    client.doCommand("deleteBackward");
    expect(owner.getSnapshot().text).toBe("A😀éZ");
    client.doCommand("deleteBackward"); expect(owner.getSnapshot().text).toBe("A😀Z");
    client.doCommand("deleteBackward"); expect(owner.getSnapshot().text).toBe("AZ");
    expect(client.setSelectedRange({ location: -1, length: 0 }).status).toBe("rejected");
    client.dispose();
  });
  it("rejects split-surrogate selection and stale semantic mutation targets", async () => {
    const Client = await clientClass(); const { owner, session } = fixture("😀abcd"); const client = new Client({ session });
    expect(client.setSelectedRange({ location: 1, length: 0 }).status).toBe("rejected");
    client.setSelectedRange({ location: 2, length: 2 }); const target = session.captureTarget();
    client.setSelectedRange({ location: 6, length: 0 });
    expect(client.insertText("bad", { target }).status).toBe("rejected");
    expect(owner.getSnapshot().text).toBe("😀abcd"); client.dispose();
  });
  it("preserves backward selection and extends grapheme movement from its anchor", async () => {
    const Client = await clientClass(); const { session } = fixture("abc"); const client = new Client({ session });
    client.setSelectedRange({ location: 1, length: 2 }, { direction: "backward" });
    expect(session.getSnapshot().selection).toMatchObject({ anchor: 3, focus: 1 });
    client.doCommand("moveBackward", true);
    expect(session.getSnapshot().selection).toMatchObject({ anchor: 3, focus: 0 }); client.dispose();
  });
  it("queries synchronous transformed caret/selection geometry and converts injected client hit coordinates", async () => {
    const Client = await clientClass(); const { session } = fixture("abcdef"); const g = geometry(session);
    const transforms = createNSETextPresentationTransforms({ layoutSpace: g.space, revision: 8, zoom: 1.5, scroll: { x: 2, y: 3 }, clientOffset: { x: 100, y: 200 }, screenOffset: { x: 5, y: 7 }, devicePixelRatio: 2 });
    const client = new Client({ session, geometry: () => g.provider, transforms: () => transforms });
    const rect = client.firstRectForRange({ location: 2, length: 0 }, "screen");
    expect(rect.status).toBe("ready");
    if (rect.status !== "ready") throw new Error("geometry not ready");
    expect(rect.rect.rect).toEqual({ x: 123, y: 244, width: 2, height: 24 });
    expect(rect.rect.space).toEqual({ name: "screen", units: "css-pixels" });
    const hit = client.characterIndexForPoint({ x: 118, y: 237, space: { name: "css-client", units: "css-pixels" }, transformRevision: 8 });
    expect(hit.status).toBe("ready");
    if (hit.status === "ready") expect(hit.position).toMatchObject({ offset: 2, affinity: "upstream" });
    expect(g.point()).toMatchObject({ x: 10, y: 20, transformRevision: 0, space: g.space });
    expect(client.firstRectForRange({ location: 1, length: 2 }).status).toBe("ready"); client.dispose();
  });
  it("returns honestly pending/provisional geometry for incomplete or stale layouts", async () => {
    const Client = await clientClass(); const { session } = fixture("abc"); const g = geometry(session);
    const provisional = { rect: { x: 1, y: 2, width: 3, height: 4 }, space: { name: "css-client", units: "css-pixels" as const }, transformRevision: 5 };
    const client = new Client({ session, geometry: () => g.provider, provisionalRect: () => provisional });
    g.incomplete();
    expect(client.firstRectForRange({ location: 0, length: 0 })).toMatchObject({ status: "pending", provisional: true, rect: provisional });
    g.stale(); expect(client.firstRectForRange({ location: 0, length: 0 }).status).toBe("pending"); client.dispose();
  });
  it("fences provider generation changes during a query and canonical edits against stale geometry", async () => {
    const Client = await clientClass(); const { session } = fixture("abc"); const g = geometry(session);
    const original = g.provider.caret;
    g.provider.caret = query => { const result = original(query); g.mutateGeneration(); return result; };
    const client = new Client({ session, geometry: () => g.provider });
    expect(client.firstRectForRange({ location: 0, length: 0 }).status).toBe("pending");
    session.insertText("X");
    expect(client.characterIndexForPoint({ x: 0, y: 0, space: g.space, transformRevision: 0 }).status).toBe("pending"); client.dispose();
  });
  it("does not mint editing authority for read-only or disposed sessions", async () => {
    const Client = await clientClass(); const { owner, session } = fixture("abc"); session.setEditable(false);
    const client = new Client({ session });
    expect(client.insertText("bad").status).toBe("rejected");
    session.dispose(); expect(client.insertText("late").status).toBe("ignored");
    expect(owner.getSnapshot().text).toBe("abc"); client.dispose();
  });
  it("rejects a caret carrying a foreign revision even if the provider snapshot is current", async () => {
    const Client = await clientClass(); const { session } = fixture("abc"); const g = geometry(session);
    const original = g.provider.caret;
    g.provider.caret = query => ({ ...original(query)!, revision: { ...query.revision, fontGeneration: 999 } });
    const transforms = createNSETextPresentationTransforms({ layoutSpace: g.space, revision: 8, zoom: 1, scroll: { x: 0, y: 0 }, clientOffset: { x: 0, y: 0 }, screenOffset: { x: 0, y: 0 }, devicePixelRatio: 1 });
    const client = new Client({ session, geometry: () => g.provider, transforms: () => transforms });
    expect(client.firstRectForRange({ location: 0, length: 0 }).status).toBe("pending"); client.dispose();
  });
  it("admits one active input host per session across distinct bridge instances", async () => {
    const Client = await clientClass(); const { session } = fixture("abc");
    const first = new Client({ session }), second = new Client({ session });
    const remove = first.attachInputHost(() => null);
    expect(() => second.attachInputHost(() => null)).toThrow(/active input host/);
    remove(); const removeSecond = second.attachInputHost(() => null); removeSecond();
    first.dispose(); second.dispose();
  });
});
