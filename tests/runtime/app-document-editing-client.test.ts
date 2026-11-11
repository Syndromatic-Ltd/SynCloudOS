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
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import type { DocumentEditingContext } from "../../src/SynCloudOS/Documents/documentEditingTypes";
import type { DocumentEditResult } from "../../src/SynCloudOS/Documents/documentEditTypes";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters";
import { DocumentReadOnlyError } from "../../src/SynCloudOS/Documents";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function fixture() {
  const environment = createTestRuntimeEnvironment();
  const adapter = new InMemoryDocumentAdapter(environment);
  const runtime = createTestRuntime({ id: "runtime:sdk-editing", environment, applicationDocuments: { initialTypes: [noteType], initialAdapters: [adapter] } });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("test"); });
  const mount = (id: string) => {
    registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: id, version: "1.0.0", displayName: id, routes: [{ path: `/${id.split(".").at(-1)}`, primary: true }], documentTypes: [{ id: noteType.id, displayName: noteType.displayName }] });
    const mounted = mountTestSynWareRuntime(runtime, id);
    cleanups.push(() => mounted.dispose("test"));
    return { mounted, client: createSynWareContextValue(mounted.runtime).documents.workspaceDocuments };
  };
  return { runtime, adapter, owner: mount("com.example.editing-owner"), foreign: mount("com.example.editing-foreign"), mount };
}

async function updateFixture() {
  const f = fixture();
  const document = await f.owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id, initialModel: { title: "Untitled", body: "before" } });
  const raw = f.runtime.documents.getDocument(document.id)!;
  const before = raw.snapshot();
  const notifications = vi.fn();
  raw.subscribe(notifications);
  return { ...f, document, raw, before, notifications };
}

describe("admitted SDK document editing", () => {
  it("rejects cyclic staged content before model or history publication", async () => {
    const { owner, document, raw, before, notifications } = await updateFixture();
    const undo = owner.client.getUndoManager(document.id);
    const cycle: NoteDocumentModel & { self?: unknown } = { title: "Untitled", body: "cyclic" };
    cycle.self = cycle;

    expect(() => owner.client.updateDocument(document.id, () => cycle, { actionName: "Cyclic model" })).toThrow();

    expect(raw.snapshot()).toMatchObject({ model: before.model, dirtyRevision: before.dirtyRevision });
    expect(notifications).not.toHaveBeenCalled();
    expect(undo.canUndo).toBe(false);
  });

  it("forwards a read-only update failure and rejects closed updates without model or history publication", async () => {
    const { owner, document, raw, before, notifications } = await updateFixture();
    const undo = raw.undoManager;
    vi.spyOn(raw, "update").mockImplementationOnce(() => { throw new DocumentReadOnlyError(); });

    expect(() => owner.client.updateDocument(document.id, () => ({ title: "Untitled", body: "blocked" }), { actionName: "Read-only update" })).toThrow(DocumentReadOnlyError);
    expect(raw.snapshot()).toMatchObject({ model: before.model, dirtyRevision: before.dirtyRevision });
    expect(notifications).not.toHaveBeenCalled();
    expect(undo.inspect().entries).toHaveLength(0);

    raw.markClosed();
    notifications.mockClear();
    expect(() => owner.client.updateDocument(document.id, () => ({ title: "Untitled", body: "closed" }), { actionName: "Closed update" })).toThrow(/closed|unavailable/i);
    expect(raw.snapshot()).toMatchObject({ model: before.model, dirtyRevision: before.dirtyRevision });
    expect(notifications).not.toHaveBeenCalled();
    expect(undo.inspect().entries).toHaveLength(0);
  });

  it("rejects an update whose transform revokes its owner before publication", async () => {
    const { owner, document, raw, before } = await updateFixture();

    expect(() => owner.client.updateDocument(document.id, () => {
      owner.mounted.dispose("owner revoked during staging");
      return { title: "Untitled", body: "Must not publish" };
    }, { actionName: "Revoked update" })).toThrow(/abort|owner|revoked/i);

    expect(raw.snapshot()).toMatchObject({ model: before.model, dirtyRevision: before.dirtyRevision });
    expect(raw.undoManager.inspect().entries).toHaveLength(0);
  });

  it("does not publish a staged update when history admission rejects", async () => {
    const { owner, document, raw, before, notifications } = await updateFixture();
    const actualLease = raw.undoManager.createRegistrationLease();
    vi.spyOn(raw.undoManager, "createRegistrationLease").mockReturnValue({
      ...actualLease,
      reserve() {
        const reservation = actualLease.reserve();
        return {
          commit() { reservation.cancel(); throw new Error("simulated history commit failure"); },
          cancel() { reservation.cancel(); },
        };
      },
    });

    expect(() => owner.client.updateDocument(document.id, () => ({ title: "Untitled", body: "Must not publish" }), { actionName: "Commit failure" })).toThrow(/commit failure/i);

    expect(raw.snapshot()).toMatchObject({ model: before.model, dirtyRevision: before.dirtyRevision });
    expect(notifications).not.toHaveBeenCalled();
    expect(raw.undoManager.inspect().entries).toHaveLength(0);
  });

  it("publishes one atomic transaction with replay through its admitted undo lease", async () => {
    const { owner } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id, location: { kind: "memory", namespace: "editing", key: "transaction" } });
    await owner.client.saveDocument(document.id);
    const result = owner.client.transactDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, title: "Changed", body: "Two fields, one action" }), { expectedRevision: document.dirtyRevision, actionName: "Edit both" });
    expect(result).toMatchObject({ status: "committed", beforeRevision: document.dirtyRevision, afterRevision: document.dirtyRevision + 1, historyEntryId: expect.any(String) });
    const undo = owner.client.getUndoManager(document.id);
    expect(undo.canUndo).toBe(true);
    await undo.undo();
    expect(owner.client.getDocument(document.id)).toMatchObject({ model: { title: "Untitled", body: "" }, state: "clean" });
    await undo.redo();
    expect(owner.client.getDocument(document.id)?.model).toMatchObject({ title: "Changed", body: "Two fields, one action" });
  });

  it("reads an unchanged document as the same snapshot, so it can back useSyncExternalStore", async () => {
    const { owner } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    const first = owner.client.getDocument<NoteDocumentModel>(document.id);
    expect(owner.client.getDocument(document.id)).toBe(first);
    expect(Object.isFrozen(first?.model)).toBe(true);
    owner.client.transactDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "Changed" }), { expectedRevision: document.dirtyRevision, actionName: "Edit" });
    const changed = owner.client.getDocument<NoteDocumentModel>(document.id);
    expect(changed).not.toBe(first);
    expect(changed?.model.body).toBe("Changed");
    expect(owner.client.getDocument(document.id)).toBe(changed);
  });

  it("rejects stale, cancelled and invalid transactions without content or history publication", async () => {
    const { owner } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    const transform = vi.fn((model: Readonly<NoteDocumentModel>) => ({ ...model, body: "Must not publish" }));
    expect(owner.client.transactDocument(document.id, transform, { expectedRevision: 99, actionName: "Stale" })).toMatchObject({ status: "rejected", reason: "stale" });
    expect(transform).not.toHaveBeenCalled();
    const abort = new AbortController();
    abort.abort("cancel transaction");
    expect(owner.client.transactDocument(document.id, transform, { expectedRevision: document.dirtyRevision, actionName: "Cancelled", signal: abort.signal })).toMatchObject({ status: "rejected", reason: "aborted" });
    expect(owner.client.transactDocument(document.id, transform, { expectedRevision: document.dirtyRevision, actionName: "Invalid", validateModel: () => { throw new Error("invalid semantic references"); } })).toMatchObject({ status: "rejected" });
    expect(owner.client.getDocument(document.id)).toMatchObject({ dirtyRevision: document.dirtyRevision, model: document.model });
    expect(owner.client.getUndoManager(document.id).canUndo).toBe(false);
  });

  it("settles a field draft before close reviews the newly dirty content", async () => {
    const { owner, runtime } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    let committed: DocumentEditResult | undefined;
    let participantFailure: unknown;
    const participant = owner.client.registerEditingParticipant<NoteDocumentModel>(document.id, { id: "field", settle: (context) => {
      try {
        committed = context.transact((model) => ({ ...model, body: "Committed field draft" }), { expectedRevision: owner.client.getDocument(document.id)!.dirtyRevision, actionName: "Commit field" });
        return committed.status === "committed" ? { status: "settled" } : { status: "refused", reason: committed.error.message };
      } catch (error) { participantFailure = error; throw error; }
    } });
    const review = vi.fn(async () => {
      expect(runtime.documents.getDocument(document.id)?.model).toMatchObject({ body: "Committed field draft" });
      return "cancel" as const;
    });
    runtime.documents.registerCloseReviewer({ review });
    const result = await owner.client.closeDocument(document.id, { reason: "window-command" });
    expect(participantFailure).toBeUndefined();
    expect(committed?.status, committed?.status === "rejected" ? committed.error.message : JSON.stringify(result)).toBe("committed");
    expect(result.outcome, JSON.stringify(result)).toBe("cancelled");
    expect(review).toHaveBeenCalledOnce();
    expect(owner.client.getUndoManager(document.id).canUndo).toBe(true);
    participant.dispose();
    expect(participant.isLive).toBe(false);
  });

  it("reports participant refusal and retains drafts without entering close review", async () => {
    const { owner, runtime } = fixture();
    const document = await owner.client.newDocument({ typeId: noteType.id });
    const settle = vi.fn(() => ({ status: "refused" as const, reason: "Marked text is still composing." }));
    owner.client.registerEditingParticipant(document.id, { id: "ime", settle });
    const review = vi.fn(async () => "discard" as const);
    runtime.documents.registerCloseReviewer({ review });
    await expect(owner.client.settleEditing(document.id, "export")).resolves.toMatchObject({ status: "refused", participantId: "ime", refusalReason: "Marked text is still composing." });
    await expect(owner.client.closeDocument(document.id)).resolves.toMatchObject({ outcome: "refused", reason: "editing-refused" });
    expect(review).not.toHaveBeenCalled();
    expect(owner.client.getDocument(document.id)).not.toBeNull();
  });

  it("rejects foreign and observer editing admission", async () => {
    const { owner, foreign, mount } = fixture();
    const document = await owner.client.newDocument({ typeId: noteType.id });
    expect(() => foreign.client.transactDocument(document.id, (model) => model, { expectedRevision: 0, actionName: "Spoof" })).toThrow(/owner lease/i);
    expect(() => foreign.client.registerEditingParticipant(document.id, { id: "spoof", settle: () => ({ status: "settled" }) })).toThrow(/owner lease/i);
    const sibling = mount("com.example.editing-owner");
    sibling.client.getDocument(document.id);
    expect(() => sibling.client.settleEditing(document.id, "save")).toThrow(/owner lease/i);
  });

  it("revokes a pending participant and its captured transaction on unmount", async () => {
    const { owner, runtime } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    let context: DocumentEditingContext<NoteDocumentModel> | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const participant = owner.client.registerEditingParticipant<NoteDocumentModel>(document.id, { id: "pending", settle: async (value) => { context = value; await gate; return { status: "settled" }; } });
    const pending = owner.client.settleEditing(document.id, "save");
    await vi.waitFor(() => expect(context).toBeDefined());
    owner.mounted.dispose("editing session revoked");
    expect(participant.isLive).toBe(false);
    expect(context!.signal.aborted).toBe(true);
    expect(context!.isCurrent()).toBe(false);
    expect(context!.transact((model) => ({ ...model, body: "Late edit" }), { expectedRevision: 0, actionName: "Late" })).toMatchObject({ status: "rejected" });
    release();
    await expect(pending).resolves.toMatchObject({ status: "revoked" });
    expect(runtime.documents.getDocument(document.id)?.model).not.toMatchObject({ body: "Late edit" });
  });

  it("preserves sequential legacy update history through the same admitted lease", async () => {
    const { owner } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    owner.client.updateDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "First" }), { actionName: "First" });
    owner.client.updateDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "Second" }), { actionName: "Second" });
    const undo = owner.client.getUndoManager(document.id);
    await undo.undo();
    expect(owner.client.getDocument(document.id)?.model).toMatchObject({ body: "First" });
    expect(undo.canUndo).toBe(true);
    await undo.undo();
    expect(owner.client.getDocument(document.id)?.model).toMatchObject({ body: "" });
  });

  it.each(["transform", "validation", "retention"] as const)("rejects publication when the mount is revoked during %s", async (phase) => {
    const { owner, runtime } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    const canonical = runtime.documents.getDocument(document.id)!;
    const release = vi.fn();
    const revoke = () => owner.mounted.dispose("revoked during synchronous staging");
    const result = owner.client.transactDocument<NoteDocumentModel>(document.id, (model) => {
      if (phase === "transform") revoke();
      return { ...model, body: "Revoked edit" };
    }, {
      expectedRevision: document.dirtyRevision,
      actionName: "Revoked edit",
      validateModel: () => { if (phase === "validation") revoke(); },
      retainResources: phase === "retention" ? () => { revoke(); return { resourceIds: ["history:test"], release }; } : undefined,
    });
    expect(result).toMatchObject({ status: "rejected" });
    expect(canonical.snapshot()).toMatchObject({ model: document.model, dirtyRevision: document.dirtyRevision });
    expect(canonical.undoManager.canUndo).toBe(false);
    expect(release).toHaveBeenCalledTimes(phase === "retention" ? 1 : 0);
  });

  it("keeps two live document owner mounts in separate history partitions", async () => {
    const { owner, runtime } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    const responderId = "application:editing-owner:second-view";
    runtime.responders.register({ id: responderId, kind: "view", parentId: "application:com.example.editing-owner", scopeId: responderId });
    const sibling = mountTestSynWareRuntime(runtime, "com.example.editing-owner", responderId);
    cleanups.push(() => sibling.dispose("test"));
    const other = createSynWareContextValue(sibling.runtime).documents.workspaceDocuments;
    other.retainDocument(document.id);
    expect(owner.client.transactDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "First owner's transaction" }), { expectedRevision: document.dirtyRevision, actionName: "First owner's transaction" }).status).toBe("committed");
    const ownHistory = owner.client.getUndoManager(document.id);
    const otherHistory = other.getUndoManager(document.id);
    expect(ownHistory.canUndo).toBe(true);
    expect(otherHistory.canUndo).toBe(false);
    await expect(otherHistory.undo()).resolves.toMatchObject({ status: "empty" });
    expect(other.getDocument<NoteDocumentModel>(document.id)?.model.body).toBe("First owner's transaction");
    await ownHistory.undo();
    expect(other.getDocument<NoteDocumentModel>(document.id)?.model.body).toBe("");
  });

  it("never grants a mounted client undo authority over raw host history", async () => {
    const { owner, runtime } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    expect(runtime.documents.transactDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "Host edit" }), { expectedRevision: document.dirtyRevision, actionName: "Host edit" }).status).toBe("committed");
    const history = owner.client.getUndoManager(document.id);
    expect(history.canUndo).toBe(false);
    await expect(history.undo()).resolves.toMatchObject({ status: "empty" });
    const hostRevision = owner.client.getDocument(document.id)!.dirtyRevision;
    expect(owner.client.transactDocument<NoteDocumentModel>(document.id, (model) => ({ ...model, body: "Mounted edit" }), { expectedRevision: hostRevision, actionName: "Mounted edit" }).status).toBe("committed");
    await history.undo();
    expect(owner.client.getDocument<NoteDocumentModel>(document.id)?.model.body).toBe("Host edit");
    expect(history.canUndo).toBe(false);
    await expect(history.undo()).resolves.toMatchObject({ status: "empty" });
    expect(runtime.documents.getDocument(document.id)!.undoManager.canUndo).toBe(true);
  });

  it.each(["update", "synchronise"] as const)("fences legacy non-history %s when its transform revokes the mount", async (operation) => {
    const { owner, runtime } = fixture();
    const document = await owner.client.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    const canonical = runtime.documents.getDocument(document.id)!;
    const transform = (model: Readonly<NoteDocumentModel>) => {
      owner.mounted.dispose("revoked legacy writer");
      return { ...model, body: "Must not publish" };
    };
    expect(() => {
      if (operation === "update") owner.client.updateDocument(document.id, transform, { actionName: "Non-history update", recordUndo: false });
      else owner.client.synchroniseDocument(document.id, transform);
    }).toThrow();
    expect(canonical.snapshot()).toMatchObject({ model: document.model, dirtyRevision: document.dirtyRevision });
  });
});
