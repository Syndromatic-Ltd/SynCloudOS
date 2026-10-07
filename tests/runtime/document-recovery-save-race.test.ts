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
import { DocumentController, InMemoryDocumentAdapter, InMemoryDocumentRecoveryStore } from "../../src/SynCloudOS/Documents";
import { documentAdoptionAuthority } from "../../src/SynCloudOS/Documents/documentAdoptionAuthority";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const release of cleanup.splice(0)) await release(); vi.restoreAllMocks(); });

describe("recovery during save cleanup", () => {
  it("preserves edits published by the clean notification", async () => {
    const recovery = new InMemoryDocumentRecoveryStore();
    const dependencies = createDocumentTestDependencies({ recovery });
    const controller = new DocumentController(dependencies);
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "save-recovery", key: "notification" } as const;
    const document = await controller.newDocument({ typeId: noteType.id, location, initialModel: { title: "Note", body: "A" } });
    cleanup.push(async () => { await document.markClosed(documentAdoptionAuthority); await dependencies.cleanup(); });
    await document.flushRecovery();
    const recoveryId = document.recoveryRecord!.recoveryId;
    let edited = false;
    const unsubscribe = document.undoManager.subscribe(() => {
      if (edited || document.state !== "clean") return;
      edited = true;
      document.update(model => ({ ...model, body: "B" }), { actionName: "Edit from clean notification" });
    });
    cleanup.push(async () => unsubscribe());
    await controller.saveDocument(document.id);
    unsubscribe();
    await document.flushRecovery();
    expect(edited).toBe(true);
    expect((await adapter.read(location))?.content).toEqual({ title: "Note", body: "A" });
    expect(document.model.body).toBe("B");
    expect(document.state).toBe("dirty");
    expect((await recovery.read(recoveryId))?.serializedContent).toEqual({ title: "Note", body: "B" });
    expect(document.hasRecoverableAutosave).toBe(true);
    expect(document.lastError).toBeNull();
  });

  it.each(["before deletion", "after deletion"] as const)("preserves a newer recovery write while cleanup is pending %s", async (timing) => {
    const recovery = new InMemoryDocumentRecoveryStore();
    const dependencies = createDocumentTestDependencies({ recovery });
    const controller = new DocumentController(dependencies);
    const adapter = new InMemoryDocumentAdapter(dependencies.environment);
    controller.registerType(noteType);
    controller.registerAdapter(adapter);
    const location = { kind: "memory", namespace: "save-recovery", key: "note" } as const;
    const document = await controller.newDocument({ typeId: noteType.id, location, initialModel: { title: "Note", body: "A" } });
    cleanup.push(async () => { await document.markClosed(documentAdoptionAuthority); await dependencies.cleanup(); });
    await document.flushRecovery();
    const recoveryId = document.recoveryRecord!.recoveryId;
    let entered!: () => void;
    const deleting = new Promise<void>(resolve => { entered = resolve; });
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const remove = recovery.remove.bind(recovery);
    vi.spyOn(recovery, "remove").mockImplementationOnce(async (...args) => {
      if (timing === "after deletion") await remove(...args);
      entered();
      await gate;
      if (timing === "before deletion") await remove(...args);
    });
    const saving = controller.saveDocument(document.id, { reason: "explicit" });
    await deleting;
    document.update(model => ({ ...model, body: "B" }), { actionName: "Edit during save cleanup" });
    const flushing = document.flushRecovery();
    // Attach rejection handling before releasing the delete transaction.
    const results = Promise.allSettled([saving, flushing]);
    resume();
    expect((await results).map(result => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect((await adapter.read(location))?.content).toEqual({ title: "Note", body: "A" });
    expect(document.model.body).toBe("B");
    expect((await recovery.read(recoveryId))?.serializedContent).toEqual({ title: "Note", body: "B" });
    expect(document.hasRecoverableAutosave).toBe(true);
    expect(document.lastError).toBeNull();
  });
});
