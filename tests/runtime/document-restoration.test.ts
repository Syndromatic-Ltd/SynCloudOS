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

import { afterEach, describe, expect, it } from "vitest";
import {
  DocumentController,
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
} from "../../src/SynCloudOS/Documents";
import { createDocumentTestDependencies } from "../fixtures/documentTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntimeEnvironment } from "./helpers";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function configured(options: {
  readonly id: string;
  readonly environment: ReturnType<typeof createTestRuntimeEnvironment>;
  readonly adapter: InMemoryDocumentAdapter;
  readonly recovery: InMemoryDocumentRecoveryStore;
}) {
  const dependencies = createDocumentTestDependencies(options);
  cleanups.push(dependencies.cleanup);
  const controller = new DocumentController(dependencies);
  controller.registerType(noteType);
  controller.registerAdapter(options.adapter);
  return controller;
}

describe("document restoration", () => {
  it("reopens untitled dirty content under its stable ID in another runtime", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment);
    const recovery = new InMemoryDocumentRecoveryStore();
    const first = configured({ id: "runtime:documents-a", environment, adapter, recovery });
    const document = await first.newDocument({ documentId: "draft-quarterly-note", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Recovered body" }), { actionName: "Type" });
    await document.flushRecovery();
    const snapshot = first.createRestorationSnapshot();
    expect(JSON.stringify(snapshot)).not.toContain("runtime:documents-a");
    expect(snapshot.documents[0]?.recovery.kind).toBe("record");

    const second = configured({ id: "runtime:documents-b", environment, adapter, recovery });
    const report = await second.restoreSession(snapshot);
    expect(report.restoredDocumentIds).toEqual(["draft-quarterly-note"]);
    expect(second.getDocument("draft-quarterly-note")?.snapshot()).toMatchObject({
      id: "draft-quarterly-note",
      location: null,
      state: "dirty",
      model: { body: "Recovered body" },
    });
    const repeat = await second.restoreSession(snapshot);
    expect(repeat.restoredDocumentIds).toEqual(["draft-quarterly-note"]);
    expect(second.openDocuments).toHaveLength(1);
  });

  it("turns a stale saved base into a conflict with all candidates", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment);
    const recovery = new InMemoryDocumentRecoveryStore();
    const first = configured({ id: "runtime:stale-a", environment, adapter, recovery });
    const document = await first.newDocument({
      documentId: "stale-note",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "notes", key: "stale" },
    });
    await document.save({ reason: "explicit" });
    const baseVersion = document.currentVersion!;
    document.update((model) => ({ ...model, body: "Local recovery" }), { actionName: "Type" });
    await document.flushRecovery();
    const snapshot = first.createRestorationSnapshot();
    await adapter.write({
      location: document.location!,
      typeId: noteType.id,
      schemaVersion: 1,
      content: { ...document.model, body: "Remote newer" },
      expectedVersion: baseVersion,
      idempotencyKey: "remote-newer",
    });

    const second = configured({ id: "runtime:stale-b", environment, adapter, recovery });
    await second.restoreSession(snapshot);
    const restored = second.getDocument("stale-note")!;
    expect(restored.state).toBe("conflicted");
    expect(restored.conflict).toMatchObject({
      localModel: { body: "Local recovery" },
      remote: { content: { body: "Remote newer" } },
      base: { version: baseVersion },
    });
  });

  it("validates the whole snapshot before opening any entry", async () => {
    const environment = createTestRuntimeEnvironment();
    const controller = configured({
      id: "runtime:malformed",
      environment,
      adapter: new InMemoryDocumentAdapter(environment),
      recovery: new InMemoryDocumentRecoveryStore(),
    });
    await expect(controller.restoreSession({
      schemaVersion: 1,
      activeDocumentId: null,
      capturedAt: "2026-08-08T12:00:00.000Z",
      recentLocations: [],
      documents: [
        { documentId: "duplicate", typeId: noteType.id, typeSchemaVersion: 1, location: null, baseVersion: null, recovery: { kind: "inline", dirtyRevision: 1, serializedContent: noteType.create({ typeId: noteType.id }), contentHash: "deadbeef", capturedAt: "2026-08-08T12:00:00.000Z" }, windowAssociations: [] },
        { documentId: "duplicate", typeId: noteType.id, typeSchemaVersion: 1, location: null, baseVersion: null, recovery: { kind: "none" }, windowAssociations: [] },
      ],
    })).rejects.toMatchObject({ code: "document-recovery-corrupt" });
    expect(controller.openDocuments).toEqual([]);
  });

  it("embeds a current dirty revision when durable recovery has not flushed", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment);
    const recovery = new InMemoryDocumentRecoveryStore();
    const first = configured({ id: "runtime:inline-a", environment, adapter, recovery });
    const document = await first.newDocument({ documentId: "inline-note", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Inline before debounce" }), { actionName: "Type" });
    const snapshot = first.createRestorationSnapshot();
    expect(snapshot.documents[0]?.recovery.kind).toBe("inline");
    const second = configured({ id: "runtime:inline-b", environment, adapter, recovery });
    await second.restoreSession(snapshot);
    expect(second.getDocument("inline-note")?.model).toMatchObject({ body: "Inline before debounce" });
  });

  it("reports missing durable recovery without opening a clean fallback", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment);
    const recovery = new InMemoryDocumentRecoveryStore();
    const first = configured({ id: "runtime:missing-a", environment, adapter, recovery });
    const document = await first.newDocument({ documentId: "missing-recovery", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Must not vanish" }), { actionName: "Type" });
    await document.flushRecovery();
    const snapshot = first.createRestorationSnapshot();
    const descriptor = snapshot.documents[0]!.recovery;
    expect(descriptor.kind).toBe("record");
    if (descriptor.kind !== "record") throw new Error("Expected durable recovery.");
    await recovery.remove(descriptor.recoveryId, descriptor.recoveryVersion);
    const second = configured({ id: "runtime:missing-b", environment, adapter, recovery });
    const report = await second.restoreSession(snapshot);
    expect(report.failures).toMatchObject([{ documentId: "missing-recovery", code: "document-recovery-missing" }]);
    expect(second.getDocument("missing-recovery")).toBeNull();
  });

  it("refuses oversized dirty inline recovery", async () => {
    const environment = createTestRuntimeEnvironment();
    const controller = configured({
      id: "runtime:large-inline",
      environment,
      adapter: new InMemoryDocumentAdapter(environment),
      recovery: new InMemoryDocumentRecoveryStore(),
    });
    const document = await controller.newDocument({ documentId: "large-inline", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "x".repeat(70_000) }), { actionName: "Type" });
    expect(() => controller.createRestorationSnapshot())
      .toThrow(expect.objectContaining({ code: "document-recovery-unavailable" }));
  });
});
