/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it } from "vitest";
import { DocumentController } from "../../src/SynCloudOS/Documents/DocumentController";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import type { DocumentLocation } from "../../src/SynCloudOS/Documents/documentTypes";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function controllerWithDefaults() {
  const dependencies = createDocumentTestDependencies();
  const created: InMemoryDocumentAdapter[] = [];
  const controller = new DocumentController({
    ...dependencies,
    defaultAdapterFor: (location: DocumentLocation) => {
      if (location.kind !== "memory") return null;
      const adapter = new InMemoryDocumentAdapter(dependencies.environment, { id: "syncloudos.default.memory" });
      created.push(adapter);
      return adapter;
    },
  });
  controller.registerType(noteType);
  cleanups.push(async () => {
    for (const document of controller.openDocuments) await document.markClosed();
    await dependencies.cleanup();
  });
  return { controller, created, dependencies };
}

describe("default document adapters", () => {
  it("saves and reopens a memory location with no adapter registered, creating the default once", async () => {
    const { controller, created } = controllerWithDefaults();
    const location = { kind: "memory", namespace: "notes", key: "first" } as const;
    const document = await controller.newDocument({ documentId: "first", typeId: noteType.id, location });
    document.update(model => ({ ...model, body: "kept" }), { actionName: "Type" });
    await document.save({ reason: "explicit" });
    await controller.closeDocument(document.id, "user");
    const second = await controller.newDocument({ documentId: "second", typeId: noteType.id, location: { kind: "memory", namespace: "notes", key: "second" } });
    await second.save({ reason: "explicit" });
    expect(created).toHaveLength(1);
    expect(await created[0]!.read(location)).toMatchObject({ content: { body: "kept" } });
  });

  it("gives way to an adapter the host registers for the same location kind", async () => {
    const { controller, created, dependencies } = controllerWithDefaults();
    const hosted = new InMemoryDocumentAdapter(dependencies.environment);
    controller.registerAdapter(hosted);
    const location = { kind: "memory", namespace: "notes", key: "hosted" } as const;
    const document = await controller.newDocument({ documentId: "hosted", typeId: noteType.id, location });
    await document.save({ reason: "explicit" });
    expect(created).toHaveLength(0);
    expect(await hosted.read(location)).not.toBeNull();
  });

  it("still reports an unsupported location when no default applies", async () => {
    const { controller } = controllerWithDefaults();
    await expect(controller.newDocument({ documentId: "remote", typeId: noteType.id, location: { kind: "remote", url: "https://example.invalid/doc" } }))
      .rejects.toMatchObject({ code: "document-adapter-unavailable" });
  });
});
