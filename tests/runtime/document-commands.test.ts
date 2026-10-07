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
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents";
import { documentCommands } from "../../src/SynCloudOS/Commands/standardCommands";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createTestRuntimeEnvironment } from "./helpers";
import { noteType } from "../fixtures/noteDocumentType";

describe("standard document commands", () => {
  it("declares the complete canonical command set", () => {
    expect(documentCommands).toEqual([
      { id: "document.new", defaultTitle: "New" },
      { id: "document.open", defaultTitle: "Open…" },
      { id: "document.save", defaultTitle: "Save" },
      { id: "document.save-as", defaultTitle: "Save As…" },
      { id: "document.revert", defaultTitle: "Revert to Saved" },
      { id: "document.close", defaultTitle: "Close" },
      { id: "document.show-versions", defaultTitle: "Browse All Versions…" },
    ]);
  });

  it("targets the active document and validates save without storage I/O", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment);
    const runtime = createSynCloudOS({ id: "runtime:document-commands", environment });
    runtime.documents.registerType(noteType);
    runtime.documents.registerAdapter(adapter);
    const first = await runtime.documents.newDocument({
      documentId: "first",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "commands", key: "first" },
    });
    const second = await runtime.documents.newDocument({
      documentId: "second",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "commands", key: "second" },
    });
    first.update((model) => ({ ...model, body: "First changed" }), { actionName: "Type" });
    second.update((model) => ({ ...model, body: "Second changed" }), { actionName: "Type" });
    runtime.documents.activateDocument(first.id);
    const read = vi.spyOn(adapter, "read");

    expect(await runtime.commands.validate("document.save")).toMatchObject({
      enabled: true,
      title: "Save",
    });
    expect(read).not.toHaveBeenCalled();
    await expect(runtime.commands.dispatch("document.save")).resolves.toMatchObject({
      status: "executed",
      responderId: `document:${first.id}`,
    });
    expect(first.state).toBe("clean");
    expect(second.state).toBe("dirty");
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    await runtime.dispose("test");
  });

  it("uses save-as presentation only during dispatch and forwards its reason", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment);
    const runtime = createSynCloudOS({ id: "runtime:document-save-as-command", environment });
    runtime.documents.registerType(noteType);
    runtime.documents.registerAdapter(adapter);
    const document = await runtime.documents.newDocument({ documentId: "draft", typeId: noteType.id });
    const chooseDestination = vi.fn(async () => ({
      destination: { kind: "memory" as const, namespace: "commands", key: "draft" },
    }));
    runtime.documents.registerSaveDestinationProvider({ chooseDestination });

    expect(await runtime.commands.validate("document.save-as")).toMatchObject({ enabled: true });
    expect(chooseDestination).not.toHaveBeenCalled();
    await expect(runtime.commands.dispatch("document.save-as")).resolves.toMatchObject({ status: "executed" });
    expect(chooseDestination).toHaveBeenCalledWith(expect.objectContaining({
      documentId: document.id,
      reason: "save-as",
    }));
    expect(document.location).toEqual({ kind: "memory", namespace: "commands", key: "draft" });
    await runtime.dispose("test");
  });

  it("keeps close enabled for dirty documents and honours cancellation", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createSynCloudOS({ id: "runtime:document-close-command", environment });
    runtime.documents.registerType(noteType);
    runtime.documents.registerCloseReviewer({ review: async () => "cancel" });
    const document = await runtime.documents.newDocument({ documentId: "dirty", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Unsaved" }), { actionName: "Type" });

    expect(await runtime.commands.validate("document.close")).toMatchObject({ enabled: true });
    await expect(runtime.commands.dispatch("document.close")).resolves.toMatchObject({
      status: "executed",
      value: { outcome: "cancelled", documentId: document.id },
    });
    expect(runtime.documents.getDocument(document.id)).toBe(document);
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    await runtime.dispose("test");
  });
});
