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
import { editDocumentFixture, editingControllerFixture } from "../fixtures/documentEditFixture";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
import type { DocumentEditingContext } from "../../src/SynCloudOS/Documents/documentEditingTypes";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() { const f = editDocumentFixture(noteType); cleanups.push(f.cleanup); return f; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; }

describe("document editing settlement", () => {
  it.each(["arbitrary", "sibling"])("disposes the admitted participant identity after caller changes its id to %s", async (changedId) => {
    const { document } = fixture(); const first = { id: "original", settle: vi.fn(() => ({ status: "settled" as const })) };
    const registration = document.registerEditingParticipant(first); const sibling = vi.fn(() => ({ status: "settled" as const }));
    document.registerEditingParticipant({ id: "sibling", settle: sibling });
    first.id = changedId; registration.dispose();
    expect(registration.isLive).toBe(false); expect((await document.settleEditing("save")).status).toBe("settled");
    expect(first.settle).not.toHaveBeenCalled(); expect(sibling).toHaveBeenCalledOnce();
  });

  it("routes participant context transactions through their originating mounted history partition", async () => {
    const { document } = fixture(); const partition = document.undoManager.createRegistrationLease();
    const sibling = document.undoManager.createRegistrationLease();
    document.registerEditingParticipant({ id: "mounted", settle: (context) => {
      expect(context.transact((model) => ({ ...model, body: "Draft" }), { expectedRevision: document.dirtyRevision, actionName: "Draft" }).status).toBe("committed");
      return { status: "settled" };
    } }, undefined, { isCurrent: () => true, reserveHistory: () => partition.reserve() });
    expect((await document.settleEditing("save")).status).toBe("settled");
    expect(partition.canUndo).toBe(true); expect(sibling.canUndo).toBe(false);
    await partition.undo(); expect(document.model.body).toBe("");
  });

  it("commits drafts in registration order before explicit save captures content", async () => {
    const { document, adapter } = fixture(); const order: string[] = [];
    for (const id of ["first", "second"]) document.registerEditingParticipant({ id, settle: (context) => {
      order.push(id); const receipt = context.transact((m) => ({ ...m, body: m.body + id }), { expectedRevision: document.dirtyRevision, actionName: id });
      expect(receipt.status).toBe("committed"); return { status: "settled" };
    } });
    await document.save({ reason: "explicit" });
    expect(order).toEqual(["first", "second"]); expect((await adapter.read<NoteDocumentModel>(document.location!))?.content.body).toBe("firstsecond");
    expect(document.hasUnsavedChanges).toBe(false);
  });

  it("preserves earlier committed edits when a later participant refuses", async () => {
    const { document, adapter } = fixture();
    document.registerEditingParticipant({ id: "committed", settle: (context) => {
      context.transact((m) => ({ ...m, body: "legitimate" }), { expectedRevision: document.dirtyRevision, actionName: "Field" }); return { status: "settled" };
    } });
    const discard = vi.fn(); document.registerEditingParticipant({ id: "invalid", settle: () => ({ status: "refused", reason: "validation", issues: [{ code: "font", message: "Invalid font" }] }), discard });
    const result = await document.settleEditing("save");
    expect(result).toMatchObject({ status: "refused", participantId: "invalid", settledParticipantIds: ["committed"], issues: [{ code: "font" }] });
    await expect(document.save({ reason: "explicit" })).rejects.toMatchObject({ settlement: { status: "refused" } });
    expect(document.model.body).toBe("legitimate"); expect(document.undoManager.canUndo).toBe(true); expect(await adapter.read(document.location!)).toBeNull(); expect(discard).not.toHaveBeenCalled();
  });

  it("does not settle transient input for autosave or committed-state recovery", async () => {
    const { document, adapter } = fixture(); const settle = vi.fn(() => ({ status: "refused" as const, reason: "composing" }));
    document.registerEditingParticipant({ id: "ime", settle });
    document.update((m) => ({ ...m, body: "committed" }), { actionName: "Type" });
    await document.flushRecovery(); expect(document.recoveryRecord?.serializedContent).toMatchObject({ body: "committed" });
    await document.save({ reason: "autosave" }); expect(settle).not.toHaveBeenCalled();
    expect((await adapter.read<NoteDocumentModel>(document.location!))?.content.body).toBe("committed");
  });

  it.each(["abort", "dispose", "close", "owner"])("revokes an async validation context on %s without late commitment", async (mode) => {
    const { document } = fixture(); const pending = deferred<{ status: "settled" }>(); const started = deferred<void>(); const caller = new AbortController();
    let context!: DocumentEditingContext<NoteDocumentModel>; let ownerLive = true;
    const registration = document.registerEditingParticipant({ id: "pending", settle: (ctx) => { context = ctx; started.resolve(); return pending.promise; } }, { isCurrent: () => ownerLive });
    const settlement = document.settleEditing("save", caller.signal); await started.promise;
    if (mode === "abort") caller.abort();
    else if (mode === "dispose") registration.dispose();
    else if (mode === "close") await document.markClosed();
    else { ownerLive = false; pending.resolve({ status: "settled" }); }
    expect(await settlement).toMatchObject({ status: "revoked" });
    pending.resolve({ status: "settled" }); await Promise.resolve();
    expect(context.isCurrent()).toBe(false);
    expect(context.transact((m) => ({ ...m, body: "late" }), { expectedRevision: 0, actionName: "Late" }).status).toBe("rejected");
    expect(document.model.body).toBe("");
  });

  it("shares identical in-flight settlement and revokes contexts after successful completion", async () => {
    const { document } = fixture(); const pending = deferred<{ status: "settled" }>(); const started = deferred<void>();
    let context!: DocumentEditingContext<NoteDocumentModel>; const settle = vi.fn((ctx) => { context = ctx; started.resolve(); return pending.promise; });
    document.registerEditingParticipant({ id: "field", settle });
    const first = document.settleEditing("save"); const second = document.settleEditing("save"); expect(first).toBe(second);
    await started.promise; pending.resolve({ status: "settled" }); expect(await first).toMatchObject({ status: "settled" }); expect(settle).toHaveBeenCalledOnce();
    expect(context.transact((m) => ({ ...m, body: "too late" }), { expectedRevision: 0, actionName: "Late" }).status).toBe("rejected");
  });

  it("rejects changed membership instead of skipping a newly registered draft", async () => {
    const { document } = fixture(); const pending = deferred<{ status: "settled" }>(); const started = deferred<void>();
    document.registerEditingParticipant({ id: "first", settle: () => { started.resolve(); return pending.promise; } });
    const settling = document.settleEditing("close"); await started.promise;
    document.registerEditingParticipant({ id: "new", settle: () => ({ status: "refused", reason: "new draft" }) }); pending.resolve({ status: "settled" });
    expect(await settling).toMatchObject({ status: "revoked", revocationReason: "membership-changed" });
  });

  it("only discards on explicit request and disposes lifetime registrations idempotently", async () => {
    const { document } = fixture(); const lifetime = new AbortController(); const discard = vi.fn(() => ({ status: "settled" as const }));
    const registration = document.registerEditingParticipant({ id: "field", settle: () => ({ status: "refused", reason: "draft" }), discard }, { signal: lifetime.signal });
    await document.settleEditing("revert"); expect(discard).not.toHaveBeenCalled();
    expect(await document.discardEditing("revert")).toMatchObject({ status: "settled" }); expect(discard).toHaveBeenCalledOnce();
    lifetime.abort(); registration.dispose(); registration.dispose(); expect(registration.isLive).toBe(false);
    expect(await document.settleEditing("save")).toMatchObject({ status: "settled", settledParticipantIds: [] });
  });

  it("does not give read-only participants transaction authority", async () => {
    const { controller, cleanup } = editingControllerFixture(); cleanups.push(cleanup);
    const document = await controller.newProjectionDocument<NoteDocumentModel>({ typeId: noteType.id, initialModel: { title: "Read", body: "only" } });
    controller.registerEditingParticipant<NoteDocumentModel>(document.id, { id: "projection", settle: (context) => {
      expect(context.transact((m) => ({ ...m, body: "edited" }), { expectedRevision: 0, actionName: "Edit" })).toMatchObject({ status: "rejected", reason: "read-only" });
      return { status: "settled" };
    } });
    expect(await controller.settleEditing(document.id, "export")).toMatchObject({ status: "settled" }); expect(document.model.body).toBe("only");
  });

  it("refuses duplicate IDs and converts participant exceptions into typed refusal", async () => {
    const { document } = fixture();
    document.registerEditingParticipant({ id: "field", settle: () => { throw new Error("validator fault"); } });
    expect(() => document.registerEditingParticipant({ id: "field", settle: () => ({ status: "settled" }) })).toThrow("already registered");
    expect(await document.settleEditing("print")).toMatchObject({ status: "refused", participantId: "field", refusalReason: "participant-error", issues: [{ message: "validator fault" }] });
  });

  it("accepts controller-class participants without losing their prototype methods", async () => {
    const { document } = fixture();
    class Field { readonly id = "class-field"; called = false; settle() { this.called = true; return { status: "settled" as const }; } }
    const field = new Field(); document.registerEditingParticipant(field);
    expect(await document.settleEditing("save")).toMatchObject({ status: "settled" }); expect(field.called).toBe(true);
  });

  it("cancels a queued barrier promptly while a different caller is still validating", async () => {
    const { document } = fixture(); const pending = deferred<{ status: "settled" }>(); const started = deferred<void>();
    document.registerEditingParticipant({ id: "field", settle: () => { started.resolve(); return pending.promise; } });
    const first = document.settleEditing("save"); await started.promise;
    const caller = new AbortController(); const queued = document.settleEditing("close", caller.signal); caller.abort();
    const result = await Promise.race([queued, Promise.resolve("still blocked")]);
    expect(result).toMatchObject({ status: "revoked", revocationReason: "aborted" });
    pending.resolve({ status: "settled" }); await first;
  });

  it("treats a failing lifetime predicate as revocation", async () => {
    const { document } = fixture(); let broken = false;
    const registration = document.registerEditingParticipant({ id: "field", settle: () => ({ status: "settled" }) }, { isCurrent: () => { if (broken) throw new Error("lifetime unavailable"); return true; } });
    broken = true; expect(registration.isLive).toBe(false);
    expect(await document.settleEditing("save")).toMatchObject({ status: "revoked", revocationReason: "participant-revoked" });
  });

  it("settles once for concurrent explicit saves and preserves conditional save ordering", async () => {
    const { document, adapter } = fixture(); const pending = deferred<{ status: "settled" }>(); const started = deferred<void>();
    const settle = vi.fn((context: DocumentEditingContext<NoteDocumentModel>) => {
      context.transact((m) => ({ ...m, body: "once" }), { expectedRevision: document.dirtyRevision, actionName: "Field" }); started.resolve(); return pending.promise;
    });
    document.registerEditingParticipant({ id: "field", settle });
    const first = document.save({ reason: "explicit" }); const second = document.save({ reason: "explicit" }); await started.promise;
    pending.resolve({ status: "settled" }); await Promise.all([first, second]);
    expect(settle).toHaveBeenCalledOnce(); expect(document.currentVersion?.sequence).toBe(2);
    expect((await adapter.read<NoteDocumentModel>(document.location!))?.content.body).toBe("once");
  });
});
