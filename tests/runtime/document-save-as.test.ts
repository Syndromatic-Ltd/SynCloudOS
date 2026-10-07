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
import {
  DocumentController,
  DocumentDestinationConflictError,
  DocumentSameLocationMoveError,
  InMemoryDocumentAdapter,
} from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function configuredController() {
  const dependencies = createDocumentTestDependencies();
  cleanups.push(dependencies.cleanup);
  const adapter = new InMemoryDocumentAdapter(dependencies.environment);
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(adapter);
  return { controller, adapter };
}

describe("DocumentController Save As and move", () => {
  it("never overwrites a destination without its exact version", async () => {
    const { controller, adapter } = configuredController();
    const destination = { kind: "memory", namespace: "notes", key: "occupied" } as const;
    const occupied = await adapter.write({
      location: destination,
      typeId: noteType.id,
      schemaVersion: 1,
      content: noteType.create({ typeId: noteType.id }),
      expectedVersion: null,
      idempotencyKey: "occupied",
    });
    const document = await controller.newDocument({ documentId: "replacement", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Replacement" }), { actionName: "Type" });
    await expect(controller.saveAsDocument({ documentId: document.id, destination }))
      .rejects.toBeInstanceOf(DocumentDestinationConflictError);
    expect(document.location).toBeNull();
    await expect(controller.saveAsDocument({
      documentId: document.id,
      destination,
      conflict: { kind: "replace", expectedVersion: occupied.version },
    })).resolves.toMatchObject({ documentId: document.id, version: { sequence: 2 } });
    expect(document.location).toEqual(destination);
  });

  it("uses in-place CAS for same-location Save As and rejects same-location move before I/O", async () => {
    const { controller, adapter } = configuredController();
    const location = { kind: "memory", namespace: "notes", key: "same" } as const;
    const document = await controller.newDocument({ documentId: "same", typeId: noteType.id, location });
    document.update((model) => ({ ...model, body: "One" }), { actionName: "Type" });
    await controller.saveDocument(document.id);
    document.update((model) => ({ ...model, body: "Two" }), { actionName: "Type" });
    const read = vi.spyOn(adapter, "read");
    const saved = await controller.saveAsDocument({ documentId: document.id, destination: { ...location } });
    expect(saved.version.sequence).toBe(2);
    expect(read).not.toHaveBeenCalled();
    const before = document.snapshot();
    await expect(controller.moveDocument({
      documentId: document.id,
      destination: { ...location },
      expectedSourceVersion: saved.version,
    })).rejects.toBeInstanceOf(DocumentSameLocationMoveError);
    expect(document.snapshot()).toBe(before);
    expect(read).not.toHaveBeenCalled();
  });

  it("reserves a destination across an awaited existence check", async () => {
    const { controller, adapter } = configuredController();
    const first = await controller.newDocument({ documentId: "first", typeId: noteType.id });
    const second = await controller.newDocument({ documentId: "second", typeId: noteType.id });
    const destination = { kind: "memory", namespace: "notes", key: "raced" } as const;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalRead = adapter.read.bind(adapter);
    vi.spyOn(adapter, "read").mockImplementationOnce(async (location, options) => {
      await gate;
      return originalRead(location, options);
    });
    const firstSave = controller.saveAsDocument({ documentId: first.id, destination });
    await vi.waitFor(() => expect(adapter.read).toHaveBeenCalledOnce());
    await expect(controller.saveAsDocument({ documentId: second.id, destination }))
      .rejects.toBeInstanceOf(DocumentDestinationConflictError);
    release();
    await expect(firstSave).resolves.toMatchObject({ documentId: first.id });
  });

  it("adopts a successful destination without clearing a newer edit", async () => {
    const { controller, adapter } = configuredController();
    const document = await controller.newDocument({ documentId: "edited-during-save-as", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Captured" }), { actionName: "Type" });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalWrite = adapter.write.bind(adapter);
    vi.spyOn(adapter, "write").mockImplementationOnce(async (request) => {
      await gate;
      return originalWrite(request);
    });
    const destination = { kind: "memory", namespace: "notes", key: "newer-edit" } as const;
    const saving = controller.saveAsDocument({ documentId: document.id, destination });
    await vi.waitFor(() => expect(adapter.write).toHaveBeenCalledOnce());
    document.update((model) => ({ ...model, body: "Newer" }), { actionName: "Type" });
    release();
    await saving;
    expect(document.location).toEqual(destination);
    expect(document.model.body).toBe("Newer");
    expect(document.state).toBe("dirty");
    expect((await adapter.read<{ body: string }>(destination))?.content.body).toBe("Captured");
  });

  it("publishes one controller change for successful location adoption", async () => {
    const { controller } = configuredController();
    const document = await controller.newDocument({ documentId: "one-emission", typeId: noteType.id });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.saveAsDocument({
      documentId: document.id,
      destination: { kind: "memory", namespace: "notes", key: "one-emission" },
    });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
