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

import { describe, expect, it, vi } from "vitest";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo";

describe("WindowManager indexes and rollback", () => {
  it("owns two windows for one application session and one document without conflating identity", async () => {
    const f = createWindowTestDependencies();
    await f.createDocument("shared-document");
    const first = f.manager.create(standardWindow("notes-a", {
      documentId: "shared-document",
      documentAssociationRole: "primary",
    }));
    const second = f.manager.create(standardWindow("notes-b", {
      documentId: "shared-document",
      documentAssociationRole: "secondary",
    }));

    await f.manager.open(first.id);
    await f.manager.open(second.id);

    expect(f.manager.list({ applicationId: "com.syndromatic.Notes" }).map(({ id }) => id)).toEqual([
      "notes-a",
      "notes-b",
    ]);
    expect(f.manager.list({ applicationSessionId: "session-notes" }).map(({ id }) => id)).toEqual([
      "notes-a",
      "notes-b",
    ]);
    expect(f.manager.list({ documentId: "shared-document" }).map(({ id }) => id)).toEqual([
      "notes-a",
      "notes-b",
    ]);
    expect(f.runtime.documents.getDocument("shared-document")?.windowAssociations).toEqual([
      { windowControllerId: "notes-a", role: "primary" },
      { windowControllerId: "notes-b", role: "secondary" },
    ]);
    expect(first.contentState).toMatchObject({ mountKey: "test-window:notes-a" });
    expect(second.contentState).toMatchObject({ mountKey: "test-window:notes-b" });
    expect(f.manager.diagnostics().fullRegistryScans).toBe(0);
    expect(f.manager.list()).toHaveLength(2);
    expect(f.manager.diagnostics().fullRegistryScans).toBe(1);
    await f.cleanup();
  });

  it("restores record, manager, association, indexes, focus and responders after open load failure", async () => {
    const f = createWindowTestDependencies({
      contentFactory: (_descriptor, id) => ({
        mountKey: `failed:${id}`,
        responderId: `control:${id}:failed`,
        load: vi.fn(async () => { throw new Error("load exploded"); }),
        prepareClose: vi.fn(async () => ({ status: "cancelled" as const })),
        unload: vi.fn(),
        dispose: vi.fn(),
      }),
    });
    await f.createDocument("rollback-document");
    const controller = f.manager.create(standardWindow("rollback-window", {
      documentId: "rollback-document",
      documentAssociationRole: "primary",
    }));
    const recordBefore = controller.record;
    const managerBefore = f.manager.snapshot();
    const documentBefore = f.runtime.documents.getDocument("rollback-document")?.snapshot();
    const respondersBefore = f.responders.inspect().registrations.map(({ id }) => id);
    const focusBefore = f.focus.inspect().focusedResponderId;

    await expect(f.manager.open(controller.id)).rejects.toThrow("load exploded");

    expect(controller.record).toBe(recordBefore);
    expect(f.manager.snapshot()).toBe(managerBefore);
    expect(f.runtime.documents.getDocument("rollback-document")?.snapshot()).toEqual(documentBefore);
    expect(f.manager.list({ documentId: "rollback-document" })).toEqual([]);
    expect(f.responders.inspect().registrations.map(({ id }) => id)).toEqual(respondersBefore);
    expect(f.focus.inspect().focusedResponderId).toBe(focusBefore);
    await f.cleanup();
  });

  it("rejects a missing responder parent instead of registering an orphan window chain", async () => {
    const f = createWindowTestDependencies();
    f.responders.remove("workspace");
    const controller = f.manager.create(standardWindow("orphan-system-window", {
      applicationId: null,
      applicationSessionId: null,
    }));
    const respondersBefore = f.responders.inspect().registrations.map(({ id }) => id);

    await expect(f.manager.open(controller.id)).rejects.toThrow(/parent responder.*workspace/i);
    expect(controller.record.state).toBe("closed");
    expect(f.responders.inspect().registrations.map(({ id }) => id)).toEqual(respondersBefore);
    await f.cleanup();
  });

  it("removes only window undo managers it created", async () => {
    const f = createWindowTestDependencies();
    const existing = f.undo.create({ kind: "window", id: "owned-elsewhere" });
    existing.register(defineSyncUndoAction({
      name: "Existing edit",
      asyncPolicy: "forbid",
      undo: () => undefined,
      redo: () => undefined,
    }));
    const controller = f.manager.create(standardWindow("owned-elsewhere"));
    await f.manager.open(controller.id);
    await f.manager.requestClose(controller.id, { reason: "command" });

    expect(f.undo.get({ kind: "window", id: "owned-elsewhere" })).toBe(existing);
    expect(existing.canUndo).toBe(true);
    await f.cleanup();
  });
});
