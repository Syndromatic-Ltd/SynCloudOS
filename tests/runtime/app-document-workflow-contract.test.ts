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
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters";
import { noteType } from "../fixtures/noteDocumentType";
import { createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function fixture() {
  const environment = createTestRuntimeEnvironment();
  const adapter = new InMemoryDocumentAdapter(environment);
  const runtime = createTestRuntime({
    id: "runtime:sdk-document-workflows", environment,
    applicationDocuments: { initialTypes: [noteType], initialAdapters: [adapter] },
  });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("test complete"); });
  const mount = (id: string) => {
    registerTestSynWare(runtime, {
      schemaVersion: 1, id, version: "1.0.0", title: id,
      routes: [{ path: `/${id}`, primary: true }],
      documentTypes: [{ id: noteType.id, displayName: noteType.displayName }],
    });
    const mounted = mountTestSynWareRuntime(runtime, id);
    cleanups.push(() => mounted.dispose("test complete"));
    const context = createSynWareContextValue(mounted.runtime);
    return { mounted, client: context.documents.workspaceDocuments, context };
  };
  return { runtime, adapter, owner: mount("workflow-owner"), foreign: mount("workflow-foreign"), mount };
}

describe("mounted SDK document workflow contracts", () => {
  it("forwards the close options reason to the real close reviewer", async () => {
    const { runtime, owner } = fixture();
    const document = await owner.client.newDocument({ typeId: noteType.id });
    owner.client.updateDocument(document.id, (model) => ({ ...model, body: "Draft" }), { actionName: "Type" });
    const review = vi.fn(async () => "cancel" as const);
    runtime.documents.registerCloseReviewer({ review });
    await expect(owner.client.closeDocument(document.id, { reason: "window-control" })).resolves.toMatchObject({ outcome: "cancelled" });
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ reason: "window-control" }));
    expect(owner.client.getDocument(document.id)?.model).toMatchObject({ body: "Draft" });
  });

  it("honours an already aborted caller close signal without closing content", async () => {
    const { owner } = fixture();
    const document = await owner.client.newDocument({ typeId: noteType.id });
    const cancellation = new AbortController();
    cancellation.abort("cancel SDK close");
    await expect(owner.client.closeDocument(document.id, { reason: "user", signal: cancellation.signal })).rejects.toMatchObject({ name: "DocumentAbortError" });
    expect(owner.client.getDocument(document.id)).toMatchObject({ id: document.id });
  });

  it("refuses foreign document IDs and revoked close clients", async () => {
    const { owner, foreign } = fixture();
    const document = await owner.client.newDocument({ typeId: noteType.id });
    expect(() => foreign.client.closeDocument(document.id)).toThrow(/owner lease/i);
    owner.mounted.dispose("revoke client");
    expect(() => owner.client.closeDocument(document.id)).toThrow();
  });

  it("saves as, duplicates, reverts and moves through canonical persistence", async () => {
    const { owner, adapter } = fixture();
    const document = await owner.client.newDocument<{ title: string; body: string }>({ typeId: noteType.id });
    const first = { kind: "memory", namespace: "workflows", key: "original" } as const;
    owner.client.updateDocument(document.id, (model) => ({ ...model, body: "Saved" }), { actionName: "Type" });
    const saved = await owner.client.saveAsDocument({ documentId: document.id, destination: first });
    expect(saved).toMatchObject({ documentId: document.id, previousLocation: null, location: first, version: { sequence: 1 } });
    const copyLocation = { ...first, key: "copy" };
    const duplicate = await owner.client.duplicateDocument<{ title: string; body: string }>(document.id, copyLocation);
    expect(duplicate).toMatchObject({ applicationId: "workflow-owner", model: { body: "Saved" }, location: copyLocation });
    expect(duplicate.id).not.toBe(document.id);
    expect(Object.isFrozen(duplicate.model)).toBe(true);
    owner.client.updateDocument(document.id, (model) => ({ ...model, body: "Discard me" }), { actionName: "Type" });
    await owner.client.revertDocument(document.id);
    expect(owner.client.getDocument(document.id)).toMatchObject({ state: "clean", model: { body: "Saved" } });
    const movedLocation = { ...first, key: "moved" };
    const moved = await owner.client.moveDocument({ documentId: document.id, destination: movedLocation, expectedSourceVersion: saved.version });
    expect(moved).toMatchObject({ outcome: "moved", location: movedLocation });
    expect(await adapter.read(first)).toBeNull();
    expect((await adapter.read<{ body: string }>(movedLocation))?.content.body).toBe("Saved");
  });

  it("reports a move that persisted its copy but retained the source", async () => {
    const { owner, adapter } = fixture();
    const source = { kind: "memory", namespace: "workflows", key: "retained" } as const;
    const document = await owner.client.newDocument({ typeId: noteType.id, location: source });
    await owner.client.saveDocument(document.id);
    const saved = owner.client.getDocument(document.id)!;
    vi.spyOn(adapter, "remove").mockRejectedValueOnce(new Error("source removal refused"));
    const moved = await owner.client.moveDocument({ documentId: document.id, destination: { ...source, key: "retained-copy" }, expectedSourceVersion: saved.currentVersion! });
    expect(moved).toMatchObject({ outcome: "copied-source-retained", sourceRemovalError: { code: "document-source-removal", name: "DocumentSourceRemovalError", message: "The copied document was saved, but its source could not be removed." } });
    expect(await adapter.read(source)).not.toBeNull();
  });

  it("rejects foreign and observer workflows before storage I/O", async () => {
    const { owner, foreign, adapter, mount } = fixture();
    const document = await owner.client.newDocument({ typeId: noteType.id });
    const sibling = mount("workflow-owner");
    sibling.client.getDocument(document.id);
    const read = vi.spyOn(adapter, "read");
    const destination = { kind: "memory", namespace: "workflows", key: "unauthorized" } as const;
    for (const client of [foreign.client, sibling.client]) {
      expect(() => client.saveAsDocument({ documentId: document.id, destination })).toThrow(/owner lease/i);
      expect(() => client.duplicateDocument(document.id, destination)).toThrow(/owner lease/i);
      expect(() => client.moveDocument({ documentId: document.id, destination, expectedSourceVersion: { id: "x", sequence: 1, savedAt: "now", etag: "x" } })).toThrow(/owner lease/i);
      expect(() => client.revertDocument(document.id)).toThrow(/owner lease/i);
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("preserves content on aborted and unsupported save-as destinations", async () => {
    const { owner, adapter } = fixture();
    const document = await owner.client.newDocument({ typeId: noteType.id });
    const cancellation = new AbortController();
    cancellation.abort("cancel save-as");
    const read = vi.spyOn(adapter, "read");
    await expect(owner.client.saveAsDocument({ documentId: document.id, destination: { kind: "memory", namespace: "workflows", key: "cancelled" }, signal: cancellation.signal })).rejects.toMatchObject({ code: "document-aborted" });
    await expect(owner.client.saveAsDocument({ documentId: document.id, destination: { kind: "remote", url: "https://example.test/unsupported" } })).rejects.toMatchObject({ code: "document-adapter-unavailable" });
    expect(owner.client.getDocument(document.id)?.location).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses every persistence workflow for a read-only projection", async () => {
    const { owner } = fixture();
    const projection = await owner.client.newProjectionDocument({ typeId: noteType.id, initialModel: { title: "Read only", body: "Projection" } });
    const destination = { kind: "memory", namespace: "workflows", key: "projection" } as const;
    await expect(owner.client.saveAsDocument({ documentId: projection.id, destination })).rejects.toMatchObject({ code: "document-read-only" });
    await expect(owner.client.duplicateDocument(projection.id, destination)).rejects.toMatchObject({ code: "document-read-only" });
    await expect(owner.client.moveDocument({ documentId: projection.id, destination, expectedSourceVersion: { id: "x", sequence: 1, savedAt: "now", etag: "x" } })).rejects.toMatchObject({ code: "document-read-only" });
    await expect(owner.client.revertDocument(projection.id)).rejects.toMatchObject({ code: "document-read-only" });
  });

  it("cancels revert without replacing newer dirty content", async () => {
    const { owner } = fixture();
    const document = await owner.client.newDocument<{ title: string; body: string }>({ typeId: noteType.id, location: { kind: "memory", namespace: "workflows", key: "cancel-revert" } });
    await owner.client.saveDocument(document.id);
    owner.client.updateDocument(document.id, (model) => ({ ...model, body: "Keep this draft" }), { actionName: "Type" });
    const abort = new AbortController();
    abort.abort("cancel revert");
    await expect(owner.client.revertDocument(document.id, undefined, abort.signal)).rejects.toMatchObject({ code: "document-aborted" });
    expect(owner.client.getDocument(document.id)).toMatchObject({ state: "dirty", model: { body: "Keep this draft" } });
  });
});
