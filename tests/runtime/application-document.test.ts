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

import { afterAll, describe, expect, it } from "vitest";
import {
  ApplicationDocument,
  DocumentLocationRequiredError,
  DocumentRecoveryVersionConflictError,
  DocumentVersionConflictError,
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
} from "../../src/SynCloudOS/Documents";
import { createUndoManager } from "../../src/SynCloudOS/Undo";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const environment = createTestRuntimeEnvironment();
const runtime = createTestRuntime({ id: "runtime:application-document", environment });
afterAll(() => runtime.dispose("test"));

function undoManager(id: string) {
  return createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id },
    maxEntries: 100,
    randomUUID: environment.randomUUID,
  });
}

describe("ApplicationDocument", () => {
  it("keeps recovery writes and removes conditional", async () => {
    const store = new InMemoryDocumentRecoveryStore();
    const input = {
      schemaVersion: 1 as const,
      recoveryId: "recovery-1",
      documentId: "document-1",
      typeId: noteType.id,
      typeSchemaVersion: 1,
      location: null,
      baseVersion: null,
      dirtyRevision: 1,
      serializedContent: { title: "Note", body: "Draft" },
      contentHash: "hash",
      capturedAt: "2026-08-08T12:00:00.000Z",
    };
    const created = await store.write(input, null);
    expect(created.recoveryVersion).toBe(1);
    await expect(store.write({ ...input, dirtyRevision: 2 }, null))
      .rejects.toBeInstanceOf(DocumentRecoveryVersionConflictError);
    expect((await store.read(input.recoveryId))?.dirtyRevision).toBe(1);
    await expect(store.remove(input.recoveryId, 2))
      .rejects.toBeInstanceOf(DocumentRecoveryVersionConflictError);
    await store.remove(input.recoveryId, 1);
    expect(await store.read(input.recoveryId)).toBeNull();
  });

  it("owns undo, records recovery, and saves conditionally", async () => {
    const document = ApplicationDocument.create({
      id: "document-1",
      type: noteType,
      location: { kind: "memory", namespace: "test", key: "note-1" },
      adapter: new InMemoryDocumentAdapter(environment),
      recovery: new InMemoryDocumentRecoveryStore(),
      persistenceNamespace: "tests:application-document",
      environment,
      undoManager: undoManager("document-1"),
    });

    document.update((model) => ({ ...model, body: "Hello" }), { actionName: "Type", coalescingKey: "body" });
    expect(document.state).toBe("dirty");
    expect(document.undoManager.canUndo).toBe(true);
    await document.flushRecovery();
    expect(document.hasRecoverableAutosave).toBe(true);

    await document.save({ reason: "explicit" });
    expect(document.state).toBe("clean");
    expect(document.currentVersion?.sequence).toBe(1);
    expect(document.hasRecoverableAutosave).toBe(false);

    await document.undoManager.undo();
    expect(document.model.body).toBe("");
    expect(document.state).toBe("dirty");
  });

  it("can mirror an editor-owned history replay without adding a second document undo action", () => {
    const document = ApplicationDocument.create({
      id: "editor-history-mirror",
      type: noteType,
      recovery: new InMemoryDocumentRecoveryStore(),
      persistenceNamespace: "tests:application-document",
      environment,
      undoManager: undoManager("editor-history-mirror"),
    });

    document.update((model) => ({ ...model, body: "Replayed by the editor" }), {
      actionName: "Mirror editor history",
      recordUndo: false,
    });

    expect(document.model.body).toBe("Replayed by the editor");
    expect(document.state).toBe("dirty");
    expect(document.undoManager.canUndo).toBe(false);
  });

  it("rejects an untitled save without mutating state", async () => {
    const document = ApplicationDocument.create({
      id: "untitled",
      type: noteType,
      recovery: new InMemoryDocumentRecoveryStore(),
      persistenceNamespace: "tests:application-document",
      environment,
      undoManager: undoManager("untitled"),
    });
    document.update((model) => ({ ...model, body: "Unsaved" }), { actionName: "Type" });
    const before = document.snapshot();
    await expect(document.save({ reason: "explicit" })).rejects.toBeInstanceOf(DocumentLocationRequiredError);
    expect(document.snapshot()).toEqual(before);
  });

  it("exposes immutable model and association snapshots", () => {
    const document = ApplicationDocument.create({
      id: "immutable",
      type: noteType,
      recovery: new InMemoryDocumentRecoveryStore(),
      persistenceNamespace: "tests:application-document",
      environment,
      undoManager: undoManager("immutable"),
    });
    document.associateWindow({ windowControllerId: "window-1", role: "primary" });
    expect(Object.isFrozen(document.model)).toBe(true);
    expect(Object.isFrozen(document.windowAssociations)).toBe(true);
    expect(Object.isFrozen(document.windowAssociations[0])).toBe(true);
  });

  it("preserves base, local, and remote candidates on a conditional conflict", async () => {
    const adapter = new InMemoryDocumentAdapter(environment);
    const location = { kind: "memory", namespace: "test", key: "conflict" } as const;
    const initial = await adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: "Note", body: "Base" },
      expectedVersion: null,
      idempotencyKey: "seed-base",
    });
    const document = ApplicationDocument.open({
      id: "conflict-document",
      type: noteType,
      record: initial,
      adapter,
      recovery: new InMemoryDocumentRecoveryStore(),
      persistenceNamespace: "tests:application-document",
      environment,
      undoManager: undoManager("conflict-document"),
    });
    const remote = await adapter.write({
      location,
      typeId: noteType.id,
      schemaVersion: noteType.schemaVersion,
      content: { title: "Note", body: "Remote" },
      expectedVersion: initial.version,
      idempotencyKey: "remote-edit",
    });
    document.update((model) => ({ ...model, body: "Local" }), { actionName: "Type" });

    await expect(document.save({ reason: "explicit" })).rejects.toBeInstanceOf(DocumentVersionConflictError);
    expect(document.state).toBe("conflicted");
    expect(document.conflict).toMatchObject({
      base: initial,
      localModel: { title: "Note", body: "Local" },
      remote,
    });
    expect(document.model.body).toBe("Local");
  });
});
