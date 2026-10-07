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
import { editDocumentFixture } from "../fixtures/documentEditFixture";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType, type NoteDocumentModel } from "../fixtures/noteDocumentType";
import { DocumentController } from "../../src/SynCloudOS/Documents/DocumentController";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import { documentAdoptionAuthority } from "../../src/SynCloudOS/Documents/documentAdoptionAuthority";
import type { DocumentResourceLifecycle } from "../../src/SynCloudOS/Documents/documentResourceLifecycle";
import type { DocumentEditResourceRetention } from "../../src/SynCloudOS/Documents/documentEditTypes";
import { canonicalDocumentContentHash } from "../../src/SynCloudOS/Documents/DocumentRecoveryStore";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() { const result = editDocumentFixture(noteType); cleanups.push(result.cleanup); return result; }

/** Models use body as an opaque candidate key; production has no asset grammar. */
function resourcePort(initial: NoteDocumentModel) {
  let current = initial.body;
  const ready = new Set([current]);
  const log: string[] = [];
  const handles: DocumentEditResourceRetention[] = [];
  const historyRelease = vi.fn(); const preparationRelease = vi.fn(); const dispose = vi.fn();
  const hooks: { commit?: () => void; prepare?: () => Promise<void> } = {};
  const lifecycle: DocumentResourceLifecycle = {
    async prepareModel(next) {
      await hooks.prepare?.();
      const key = (next as NoteDocumentModel).body; ready.add(key); log.push(`prepare:${key}`);
      let released = false;
      return { release() { if (!released) { released = true; preparationRelease(key); } } };
    },
    stageChange(before, after, options) {
      const old = current, next = (after as NoteDocumentModel).body;
      if (before && (before as NoteDocumentModel).body !== old) throw new Error("current candidate mismatch");
      if (!ready.has(next)) throw new Error("candidate not prepared");
      log.push(`stage:${old}->${next}`);
      let released = false, committed = false, finalized = false;
      const handle: DocumentEditResourceRetention = { resourceIds: [old, next].filter(Boolean), release() { if (!released) { released = true; historyRelease(next); } } };
      if (options.recordHistory) handles.push(handle);
      return {
        ...(options.recordHistory ? { historyRetention: handle } : {}),
        commit() { current = next; committed = true; log.push(`commit:${next}`); hooks.commit?.(); },
        rollback() { if (finalized) return; finalized = true; if (committed) current = old; handle.release(); log.push(`rollback:${old}`); },
        release() { if (finalized) return; finalized = true; log.push(`release:${next}`); },
      };
    }, dispose,
  };
  return { lifecycle, ready, log, handles, historyRelease, preparationRelease, dispose, hooks, current: () => current };
}

describe("private document resource publication lifecycle", () => {
  it("rejects an unprepared model before canonical content or history changes", () => {
    const { document } = fixture(); const port = resourcePort(document.model);
    document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority);
    const before = document.snapshot(), history = document.undoManager.inspect();
    const result = document.transact(m => ({ ...m, body: "new-resource" }), { expectedRevision: 0, actionName: "Insert" });
    expect(result.status).toBe("rejected"); expect(document.snapshot()).toBe(before); expect(document.undoManager.inspect()).toEqual(history); expect(port.current()).toBe("");
  });

  it("automatically retains prepared resources through undo/redo and deduplicates a caller's same handle", async () => {
    const { document } = fixture(); const port = resourcePort(document.model);
    document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority);
    const next = { ...document.model, body: "attachment" };
    const prepared = await document.prepareResourceModel(next, documentAdoptionAuthority);
    const result = document.transact(() => next, { expectedRevision: 0, actionName: "Insert", retainResources: () => port.handles.at(-1)! });
    await prepared.release();
    expect(result).toMatchObject({ status: "committed", retainedResourceIds: ["attachment"] });
    await document.undoManager.undo(); expect(port.current()).toBe("");
    await document.undoManager.redo(); expect(port.current()).toBe("attachment"); expect(port.historyRelease).not.toHaveBeenCalled();
    document.undoManager.clear(); expect(port.historyRelease).toHaveBeenCalledOnce();
  });

  it("switches current roots before history teardown on a nonhistory adoption", async () => {
    const { document } = fixture(); const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority);
    port.ready.add("first"); document.update(m => ({ ...m, body: "first" }), { actionName: "First" });
    const release = vi.fn(() => expect(port.current()).toBe("last"));
    // An independent caller hold must compose with automatic retention.
    document.update(m => m, { actionName: "Caller root", retainResources: () => ({ resourceIds: ["caller"], release }) });
    port.ready.add("last"); document.update(m => ({ ...m, body: "last" }), { actionName: "Adopt", recordUndo: false });
    expect(release).toHaveBeenCalledOnce(); expect(document.undoManager.canUndo).toBe(false); expect(port.current()).toBe("last");
  });

  it("rolls current ownership back and releases automatic/caller holds when history admission fails", () => {
    const { document } = fixture(); const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority);
    port.ready.add("next"); const release = vi.fn(); const before = document.snapshot();
    vi.spyOn(document.undoManager, "reserve").mockReturnValueOnce({ commit: () => { throw new Error("history refusal"); }, cancel: vi.fn() });
    expect(document.transact(m => ({ ...m, body: "next" }), { expectedRevision: 0, actionName: "Fault", retainResources: () => ({ resourceIds: ["caller"], release }) }).status).toBe("rejected");
    expect(document.snapshot()).toBe(before); expect(port.current()).toBe(""); expect(port.historyRelease).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
  });

  it("fences mount revocation during resource admission before committing history", () => {
    const { document } = fixture(); const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority); port.ready.add("next");
    let current = true; port.hooks.commit = () => { current = false; };
    const lease = document.undoManager.createRegistrationLease(); const before = document.snapshot();
    expect(document.transact(m => ({ ...m, body: "next" }), { expectedRevision: 0, actionName: "Revoked" }, { isCurrent: () => current, reserveHistory: () => lease.reserve() }).status).toBe("rejected");
    expect(document.snapshot()).toBe(before); expect(port.current()).toBe(""); expect(lease.canUndo).toBe(false); expect(port.historyRelease).toHaveBeenCalledOnce();
  });

  it("truthfully commits an admitted edit when a history callback revokes the mount and closes the document", async () => {
    const { document } = fixture(); const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority); port.ready.add("next");
    const abort = new AbortController(); const lease = document.undoManager.createRegistrationLease(); let live = true; let closed: Promise<void> | undefined;
    const detach = document.undoManager.subscribe(() => {
      if (closed || document.undoManager.inspect().entries.length === 0) return;
      live = false; abort.abort(); lease.revoke(); closed = document.markClosed();
    });
    const result = document.transact(m => ({ ...m, body: "next" }), { expectedRevision: 0, actionName: "Admitted", signal: abort.signal }, { isCurrent: () => live, reserveHistory: () => lease.reserve() });
    detach(); await closed;
    expect(result).toMatchObject({ status: "committed", afterRevision: 1 }); expect(document.model.body).toBe("next"); expect(document.state).toBe("closed"); expect(port.dispose).toHaveBeenCalledOnce(); expect(port.historyRelease).toHaveBeenCalledOnce();
  });

  it("rejects terminal structural admission from an actual history notification", () => {
    const { document } = fixture(); let terminal: unknown;
    const detach = document.undoManager.subscribe(() => {
      if (!document.undoManager.inspect().entries.length) return;
      try { terminal = document.beginTerminalReconciliation(documentAdoptionAuthority); } catch { terminal = "refused"; }
    });
    expect(document.transact(m => ({ ...m, body: "safe" }), { expectedRevision: 0, actionName: "Edit" }).status).toBe("committed"); detach();
    expect(terminal).toBe("refused"); expect(document.hasTerminalReconciliationLease).toBe(false); expect(document.model.body).toBe("safe");
  });

  it.each(["validation", "resource-commit", "history-notification"] as const)("fences kernel unsaved marking during %s without corrupting native identity", async phase => {
    const { document } = fixture(); const port = resourcePort(document.model);
    document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority); port.ready.add("next");
    let attempts = 0;
    const markDuringAdmission = () => {
      const before = document.snapshot(); attempts += 1;
      expect(() => document.markUnsaved(documentAdoptionAuthority)).toThrow(/staging|admission|publication/);
      expect(document.snapshot()).toBe(before);
    };
    if (phase === "resource-commit") port.hooks.commit = markDuringAdmission;
    const detach = phase === "history-notification" ? document.undoManager.subscribe(() => {
      if (attempts === 0 && document.undoManager.inspect().entries.length > 0) markDuringAdmission();
    }) : () => undefined;
    const result = document.transact(m => ({ ...m, body: "next" }), {
      expectedRevision: 0, actionName: "Edit", ...(phase === "validation" ? { validateModel: markDuringAdmission } : {}),
    });
    detach(); port.hooks.commit = undefined;
    expect(attempts).toBe(1); expect(result).toMatchObject({ status: "committed", beforeRevision: 0, afterRevision: 1 });
    expect(document.model.body).toBe("next"); expect(port.current()).toBe("next");
    await document.undoManager.undo();
    expect(document.model.body).toBe(""); expect(port.current()).toBe("");
    expect(document.hasUnsavedChanges).toBe(false); expect(document.state).toBe("clean");
  });

  it("releases a late asynchronous preparation after cancellation without publishing", async () => {
    const { document } = fixture(); const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority);
    const gate = deferred<void>(); port.hooks.prepare = () => gate.promise; const abort = new AbortController();
    const preparing = document.prepareResourceModel({ ...document.model, body: "late" }, documentAdoptionAuthority, abort.signal);
    abort.abort(); await expect(preparing).rejects.toMatchObject({ code: "document-aborted" });
    gate.resolve(); await vi.waitFor(() => expect(port.preparationRelease).toHaveBeenCalledWith("late")); expect(document.dirtyRevision).toBe(0);
  });

  it("waits for initial factory admission before exposing a new document", async () => {
    const dependencies = createDocumentTestDependencies(); const gate = deferred<void>(); let port: ReturnType<typeof resourcePort> | undefined;
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: async doc => { port = resourcePort(doc.model as NoteDocumentModel); await gate.promise; return port.lifecycle; } });
    controller.registerType(noteType); cleanups.push(async () => { for (const doc of controller.openDocuments) await doc.markClosed(); await dependencies.cleanup(); });
    const creating = controller.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    await vi.waitFor(() => expect(port).toBeDefined()); expect(controller.openDocuments).toEqual([]);
    gate.resolve(); const document = await creating; expect(controller.openDocuments).toEqual([document]); expect(port!.current()).toBe(document.model.body);
  });

  it("aborts a pending factory promptly and disposes its late lifecycle before registration", async () => {
    const dependencies = createDocumentTestDependencies(); const gate = deferred<void>(); const started = deferred<void>(); const port = resourcePort(noteType.create({ typeId: noteType.id }));
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: async () => { started.resolve(); await gate.promise; return port.lifecycle; } });
    controller.registerType(noteType); cleanups.push(dependencies.cleanup); const abort = new AbortController();
    const creating = controller.newDocument({ typeId: noteType.id, signal: abort.signal }).then(() => "created", () => "aborted");
    await started.promise; abort.abort();
    const outcome = await Promise.race([creating, new Promise<string>(done => setTimeout(() => done("pending"), 0))]);
    gate.resolve(); await creating; await vi.waitFor(() => expect(port.dispose).toHaveBeenCalledOnce());
    expect(outcome).toBe("aborted"); expect(controller.openDocuments).toEqual([]);
  });

  it("transforms initial and later native adapters at their canonical registration point", async () => {
    const dependencies = createDocumentTestDependencies(); const transformed = vi.fn(adapter => adapter);
    const controller = new DocumentController({ ...dependencies, transformAdapter: transformed }); controller.registerType(noteType); cleanups.push(dependencies.cleanup);
    const first = new InMemoryDocumentAdapter(dependencies.environment); controller.registerAdapter(first); expect(transformed).toHaveBeenCalledWith(first);
    const second = new InMemoryDocumentAdapter(dependencies.environment); const proxy = { ...second, id: "later", capabilities: second.capabilities, supports: second.supports.bind(second), read: second.read.bind(second), write: second.write.bind(second), remove: second.remove.bind(second), list: second.list.bind(second), listVersions: second.listVersions.bind(second), readVersion: second.readVersion.bind(second) };
    const registration = controller.registerAdapter(proxy); expect(transformed).toHaveBeenCalledWith(proxy); registration.dispose(); expect(controller.hasAdapter("later")).toBe(false);
  });

  it("does not register a document closed by initial resource finalization", async () => {
    const dependencies = createDocumentTestDependencies(); let closed: Promise<void> | undefined; let port: ReturnType<typeof resourcePort> | undefined;
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: async doc => {
      port = resourcePort(doc.model as NoteDocumentModel);
      return { ...port.lifecycle, stageChange(before, after, options) {
        const change = port!.lifecycle.stageChange(before, after, options);
        return { ...change, release() { change.release(); closed = doc.markClosed(); } };
      } };
    } });
    controller.registerType(noteType); cleanups.push(dependencies.cleanup);
    await expect(controller.newDocument({ typeId: noteType.id })).rejects.toMatchObject({ code: "document-unavailable" });
    await closed; expect(controller.openDocuments).toEqual([]); expect(port!.dispose).toHaveBeenCalledOnce();
  });

  it("admits inline recovery against a durable base before the document is registered", async () => {
    const dependencies = createDocumentTestDependencies(); const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    const location = { kind: "memory", namespace: "resources", key: "inline" } as const;
    const base = await adapter.write({ location, typeId: noteType.id, schemaVersion: 1, content: { title: "Base", body: "base" }, expectedVersion: null, idempotencyKey: "seed" });
    const gate = deferred<void>(), started = deferred<void>(); let port: ReturnType<typeof resourcePort> | undefined;
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: async doc => {
      port = resourcePort(doc.model as NoteDocumentModel);
      port.hooks.prepare = async () => { started.resolve(); await gate.promise; };
      return port.lifecycle;
    } });
    controller.registerType(noteType); controller.registerAdapter(adapter);
    cleanups.push(async () => { for (const doc of controller.openDocuments) await doc.markClosed(); await dependencies.cleanup(); });
    const recovered = { title: "Recovered", body: "attachment-recovered" }, capturedAt = new Date(dependencies.environment.now()).toISOString();
    const restoring = controller.restoreSession({ schemaVersion: 1, activeDocumentId: "restored", capturedAt, recentLocations: [], documents: [{
      documentId: "restored", typeId: noteType.id, typeSchemaVersion: 1, location, baseVersion: base.version, windowAssociations: [],
      recovery: { kind: "inline", dirtyRevision: 9, serializedContent: recovered, contentHash: canonicalDocumentContentHash(recovered), capturedAt },
    }] });
    await started.promise; expect(controller.getDocument("restored")).toBeNull(); expect(controller.openDocuments).toEqual([]); expect(port!.current()).toBe("base");
    gate.resolve(); const report = await restoring; expect(report.failures).toEqual([]);
    expect(controller.getDocument("restored")).toMatchObject({ model: recovered, dirtyRevision: 9, state: "dirty" }); expect(port!.current()).toBe("attachment-recovered"); expect(port!.preparationRelease).toHaveBeenCalledOnce();
  });

  it("prepares a remote conflict model before provider acceptance and canonical replacement", async () => {
    const { document, adapter } = fixture(); await document.save({ reason: "explicit" });
    const saved = document.lastSavedRecord!; const remote = { ...saved, content: { ...saved.content, body: "remote-attachment" } };
    const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority);
    const gate = deferred<void>(), started = deferred<void>(); port.hooks.prepare = async () => { started.resolve(); await gate.promise; };
    const accepted = vi.fn(async () => { expect(port.log).toContain("prepare:remote-attachment"); });
    Object.assign(adapter, { acceptRemoteConflict: accepted }); document.enterConflict({ base: saved, localModel: document.model, remote });
    const resolving = document.resolveConflict({ kind: "use-remote" }); await started.promise;
    expect(accepted).not.toHaveBeenCalled(); expect(document.model.body).toBe("");
    gate.resolve(); await resolving; expect(accepted).toHaveBeenCalledOnce(); expect(port.current()).toBe("remote-attachment"); expect(document.model.body).toBe("remote-attachment"); expect(document.state).toBe("clean");
  });

  it("saves current local content after conflicted undo and participant commitment", async () => {
    const { document, adapter } = fixture(); await document.save({ reason: "explicit" }); const saved = document.lastSavedRecord!;
    document.enterConflict({ base: saved, localModel: document.model, remote: saved });
    document.update(m => ({ ...m, body: "one" }), { actionName: "One" }); document.update(m => ({ ...m, body: "two" }), { actionName: "Two" });
    await document.undoManager.undo();
    const registration = document.registerEditingParticipant({ id: "local-draft", settle(context) {
      expect(context.transact(m => ({ ...m, body: `${m.body}+settled` }), { expectedRevision: document.dirtyRevision, actionName: "Settle draft" }).status).toBe("committed");
      return { status: "settled" };
    } });
    await document.resolveConflict({ kind: "use-local", expectedRemoteVersion: saved.version }); registration.dispose();
    expect(document.model.body).toBe("one+settled"); expect((await adapter.read<NoteDocumentModel>(document.location!))?.content.body).toBe("one+settled"); expect(document.hasUnsavedChanges).toBe(false);
  });

  it("rejects a replaced conflict after provider acceptance even when the revision is unchanged", async () => {
    const { document, adapter } = fixture(); await document.save({ reason: "explicit" }); const saved = document.lastSavedRecord!;
    const first = { ...saved, content: { ...saved.content, body: "first remote" } }, second = { ...saved, content: { ...saved.content, body: "second remote" } };
    document.enterConflict({ base: saved, localModel: document.model, remote: first }); const revision = document.dirtyRevision;
    const gate = deferred<void>(), started = deferred<void>(); Object.assign(adapter, { acceptRemoteConflict: async () => { started.resolve(); await gate.promise; } });
    const resolving = document.resolveConflict({ kind: "use-remote" }); await started.promise;
    document.enterConflict({ base: saved, localModel: document.model, remote: second }); expect(document.dirtyRevision).toBe(revision);
    gate.resolve(); await expect(resolving).rejects.toMatchObject({ code: "document-unavailable" }); expect(document.conflict?.remote?.content).toEqual(second.content); expect(document.model.body).toBe("");
  });

  it.each(["recreate", "terminal"] as const)("fences a newer canonical edit after held %s provider acceptance", async kind => {
    const { document, adapter } = fixture(); await document.save({ reason: "explicit" }); const saved = document.lastSavedRecord!;
    document.enterConflict({ base: saved, localModel: document.model, remote: null, remoteState: "deleted" });
    const gate = deferred<void>(), started = deferred<void>(); const provider = async () => { started.resolve(); await gate.promise; };
    Object.assign(adapter, { acceptRemoteConflict: provider, prepareDocumentRecreation: provider });
    const resolving = document.resolveConflict({ kind: kind === "recreate" ? "recreate" : "use-remote" }); await started.promise;
    document.update(m => ({ ...m, body: "new local edit" }), { actionName: "Continue editing" }); gate.resolve();
    await expect(resolving).rejects.toMatchObject({ code: "document-unavailable" }); expect(document.model.body).toBe("new local edit"); expect(document.state).toBe("conflicted"); expect(document.undoManager.canUndo).toBe(true);
  });

  it("releases a stale remote preparation without contacting the provider or replacing a newer edit", async () => {
    const { document, adapter } = fixture(); await document.save({ reason: "explicit" }); const saved = document.lastSavedRecord!;
    const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority); port.ready.add("new local edit");
    const remote = { ...saved, content: { ...saved.content, body: "remote" } }; document.enterConflict({ base: saved, localModel: document.model, remote });
    const gate = deferred<void>(), started = deferred<void>(); port.hooks.prepare = async () => { started.resolve(); await gate.promise; };
    const accepted = vi.fn(async () => undefined); Object.assign(adapter, { acceptRemoteConflict: accepted });
    const resolving = document.resolveConflict({ kind: "use-remote" }); await started.promise;
    document.update(m => ({ ...m, body: "new local edit" }), { actionName: "Continue editing" }); gate.resolve();
    await expect(resolving).rejects.toMatchObject({ code: "document-unavailable" }); expect(port.preparationRelease).toHaveBeenCalledOnce(); expect(accepted).not.toHaveBeenCalled(); expect(port.current()).toBe("new local edit"); expect(document.model.body).toBe("new local edit");
  });

  it.each(["revert", "use-remote", "use-local", "merge", "recreate", "terminal", "restore-version"] as const)("preserves snapshot/history/current resources on cancellation inside %s resource commitment", async kind => {
    const { document } = fixture(); await document.save({ reason: "explicit" }); const saved = document.lastSavedRecord!;
    document.update(m => ({ ...m, body: "unsaved local work" }), { actionName: "Local edit" });
    if (kind !== "revert" && kind !== "restore-version") document.enterConflict({ base: saved, localModel: document.model,
      remote: kind === "terminal" || kind === "recreate" ? null : saved,
      ...(kind === "terminal" || kind === "recreate" ? { remoteState: "deleted" as const } : {}),
    });
    const port = resourcePort(document.model); document.installResourceLifecycle(port.lifecycle, documentAdoptionAuthority);
    const before = document.snapshot(), history = document.undoManager.inspect(); const abort = new AbortController();
    port.hooks.commit = () => abort.abort("mount revoked before model admission");
    const operation = kind === "revert" ? document.revert(undefined, abort.signal) : kind === "restore-version" ? document.restoreVersion(saved.version, abort.signal) :
      document.resolveConflict(kind === "merge" ? { kind: "merge", model: { ...document.model, body: "merged" }, expectedRemoteVersion: saved.version } :
        kind === "recreate" ? { kind: "recreate" } : kind === "use-local" ? { kind: "use-local", expectedRemoteVersion: saved.version } : { kind: "use-remote" }, abort.signal);
    await expect(operation).rejects.toMatchObject({ code: "document-aborted" });
    expect(document.snapshot()).toBe(before); expect(document.undoManager.inspect()).toEqual(history); expect(port.current()).toBe("unsaved local work");
    expect(port.log).toContain("rollback:unsaved local work");
  });

  it("refuses a nested transaction inside initial resource staging and installs the exact canonical candidate", async () => {
    const dependencies = createDocumentTestDependencies(); let port: ReturnType<typeof resourcePort> | undefined; let nested: string | undefined;
    const controller = new DocumentController({ ...dependencies, resourceLifecycle: async doc => {
      port = resourcePort(doc.model as NoteDocumentModel);
      return { ...port.lifecycle, stageChange(before, after, options) {
        nested = doc.transact(m => ({ ...(m as NoteDocumentModel), body: "nested initial content" }), { expectedRevision: doc.dirtyRevision, actionName: "Nested staging" }).status;
        return port!.lifecycle.stageChange(before, after, options);
      } };
    } });
    controller.registerType(noteType); cleanups.push(async () => { for (const doc of controller.openDocuments) await doc.markClosed(); await dependencies.cleanup(); });
    const document = await controller.newDocument<NoteDocumentModel>({ typeId: noteType.id });
    expect(nested).toBe("rejected"); expect(document.model.body).toBe(""); expect(port!.current()).toBe(document.model.body); expect(document.dirtyRevision).toBe(1); expect(document.undoManager.canUndo).toBe(false);
  });
});
