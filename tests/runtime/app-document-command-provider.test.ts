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
  const runtime = createTestRuntime({ id: "runtime:sdk-document-provider", environment, applicationDocuments: { initialTypes: [noteType], initialAdapters: [adapter] } });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  cleanups.push(async () => { await runtime.dispose("test"); });
  registerTestSynWare(runtime, { schemaVersion: 1, id: "provider-owner", version: "1.0.0", title: "Provider owner", routes: [{ path: "/provider", primary: true }], documentTypes: [{ id: noteType.id, displayName: noteType.displayName }] });
  const mounted = mountTestSynWareRuntime(runtime, "provider-owner");
  cleanups.push(() => mounted.dispose("test"));
  runtime.focus.setActiveAnchors({ applicationResponderId: "application:provider-owner" });
  const context = createSynWareContextValue(mounted.runtime);
  return { runtime, adapter, mounted, context, documents: context.documents.workspaceDocuments };
}

describe("application document command providers", () => {
  it("gives an honest provider-disabled reason with no open documents", async () => {
    const { runtime } = fixture();
    expect(runtime.documents.openDocuments).toHaveLength(0);
    await expect(runtime.commands.validate("document.new")).resolves.toMatchObject({ enabled: false, disabledReason: "No document-new provider is registered." });
    await expect(runtime.commands.validate("document.open")).resolves.toMatchObject({ enabled: false, disabledReason: "No document-open provider is registered." });
  });

  it("creates from an explicit app provider with no active document or validation I/O", async () => {
    const { runtime, documents, context } = fixture();
    const chooseNewDocument = vi.fn(async () => ({ typeId: noteType.id, initialModel: { title: "App default", body: "App model" } }));
    documents.registerWorkflowProvider({ chooseNewDocument });
    await expect(context.commands.validate("document.new")).resolves.toMatchObject({ enabled: true, responderId: "application:provider-owner" });
    expect(chooseNewDocument).not.toHaveBeenCalled();
    const result = await context.commands.dispatch<{ status: string; value: unknown }>("document.new");
    expect(result.status, JSON.stringify(result)).toBe("executed");
    expect(result).toMatchObject({ value: { applicationId: "provider-owner", model: { body: "App model" } } });
    expect(runtime.documents.openDocuments).toHaveLength(1);
    expect(documents.getUndoManager(runtime.documents.activeDocumentId!)).not.toBeNull();
    await vi.waitFor(() => expect(runtime.focus.getActiveAnchors().documentResponderId).toBe(`document:${runtime.documents.activeDocumentId}`));
  });

  it("opens through a supplied chooser even when a document responder is active", async () => {
    const { runtime, adapter, documents } = fixture();
    const location = { kind: "memory", namespace: "provider", key: "open" } as const;
    await adapter.write({ location, typeId: noteType.id, schemaVersion: 1, content: { title: "Stored", body: "Open me" }, expectedVersion: null, idempotencyKey: "provider-open" });
    const chooseOpenDocument = vi.fn(async () => ({ typeId: noteType.id, location }));
    const chooseNewDocument = vi.fn(async () => ({ typeId: noteType.id }));
    documents.registerWorkflowProvider({ chooseNewDocument, chooseOpenDocument });
    await documents.newDocument({ typeId: noteType.id });
    await expect(runtime.commands.validate("document.open")).resolves.toMatchObject({ enabled: true, responderId: "application:provider-owner" });
    expect(chooseOpenDocument).not.toHaveBeenCalled();
    await expect(runtime.commands.dispatch("document.open")).resolves.toMatchObject({ status: "executed", responderId: "application:provider-owner", value: { model: { body: "Open me" } } });
    await expect(runtime.commands.dispatch("document.new")).resolves.toMatchObject({ status: "executed", responderId: "application:provider-owner" });
    expect(chooseNewDocument).toHaveBeenCalledOnce();
    expect(documents.getDocument(runtime.documents.activeDocumentId!)).not.toBeNull();
  });

  it("does not create on chooser cancellation and removes disposed providers", async () => {
    const { runtime, documents } = fixture();
    const handle = documents.registerWorkflowProvider({ chooseNewDocument: async () => null });
    await expect(runtime.commands.dispatch("document.new")).resolves.toMatchObject({ status: "executed", value: null });
    expect(runtime.documents.openDocuments).toHaveLength(0);
    handle.dispose();
    await expect(runtime.commands.validate("document.new")).resolves.toMatchObject({ enabled: false, disabledReason: "No document-new provider is registered." });
  });

  it("honours a provider availability reason without invoking its chooser", async () => {
    const { runtime, documents } = fixture();
    const chooseOpenDocument = vi.fn(async () => null);
    documents.registerWorkflowProvider({ chooseOpenDocument, validate: () => ({ enabled: false, disabledReason: "The file-panel provider is unavailable." }) });
    await expect(runtime.commands.validate("document.open")).resolves.toMatchObject({ enabled: false, disabledReason: "The file-panel provider is unavailable." });
    await expect(runtime.commands.dispatch("document.open")).resolves.toMatchObject({ status: "disabled" });
    expect(chooseOpenDocument).not.toHaveBeenCalled();
  });

  it("prioritises an active terminal document over provider availability without running its chooser", async () => {
    const { runtime, documents, context } = fixture();
    const document = await documents.newDocument({ typeId: noteType.id });
    const chooseNewDocument = vi.fn(async () => ({ typeId: noteType.id }));
    const chooseOpenDocument = vi.fn(async () => null);
    const validate = vi.fn(() => ({ enabled: false, disabledReason: "Chooser temporarily unavailable." }));
    documents.registerWorkflowProvider({ chooseNewDocument, chooseOpenDocument, validate });
    const lease = runtime.documents.reserveTerminalProviderOperation({
      serviceId: "tests.document-workflow",
      applicationId: context.appId,
      documentId: document.id,
      providerDocumentId: document.id,
      operationKind: "publish",
      operationIdentity: document.id + ":publish",
      initialState: {},
      initialClaim: { claimant: context, windowControllerId: null },
      execute: () => ({ promise: Promise.resolve({ accepted: true }), releaseProviderLock: () => true }),
    }).receipt;
    await lease.waitForProvider();
    try {
      for (const action of ["new", "open"]) {
        await expect(context.commands.validate(`document.${action}`)).resolves.toMatchObject({ enabled: false, disabledReason: expect.stringMatching(/terminal reconciliation/i) });
        await expect(context.commands.dispatch(`document.${action}`)).resolves.toMatchObject({ status: "disabled" });
      }
      expect(validate).not.toHaveBeenCalled();
      expect(chooseNewDocument).not.toHaveBeenCalled();
      expect(chooseOpenDocument).not.toHaveBeenCalled();
      expect(runtime.documents.openDocuments).toHaveLength(1);
    } finally { await lease.complete(); }
    await expect(context.commands.validate("document.new")).resolves.toMatchObject({ enabled: false, disabledReason: "Chooser temporarily unavailable." });
  });

  it("revokes a pending chooser on unmount and rejects later registration", async () => {
    const { runtime, documents, mounted } = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let receivedSignal: AbortSignal | undefined;
    documents.registerWorkflowProvider({ chooseNewDocument: async ({ signal }) => { receivedSignal = signal; await gate; return { typeId: noteType.id }; } });
    const pending = runtime.commands.dispatch("document.new");
    await vi.waitFor(() => expect(receivedSignal).toBeDefined());
    mounted.dispose("provider revoked");
    expect(receivedSignal?.aborted).toBe(true);
    release();
    await pending;
    expect(runtime.documents.openDocuments).toHaveLength(0);
    expect(() => documents.registerWorkflowProvider({ chooseNewDocument: async () => ({ typeId: noteType.id }) })).toThrow();
  });

  it("does not require the application responder to predate its canonical document", async () => {
    const { runtime } = fixture();
    // Simulate a host-restored document whose owning application mounts later.
    runtime.responders.remove("application:provider-owner");
    const document = await runtime.documents.newDocument({ typeId: noteType.id, applicationId: "provider-owner" });
    runtime.responders.register({ id: "application:provider-owner", kind: "application", parentId: "runtime", scopeId: "application:provider-owner" });
    const replacement = mountTestSynWareRuntime(runtime, "provider-owner");
    cleanups.push(() => replacement.dispose("test"));
    const documents = createSynWareContextValue(replacement.runtime).documents.workspaceDocuments;
    documents.retainDocument(document.id);
    const chooseNewDocument = vi.fn(async () => ({ typeId: noteType.id }));
    documents.registerWorkflowProvider({ chooseNewDocument });
    await expect(runtime.commands.validate("document.new")).resolves.toMatchObject({ enabled: true, responderId: "application:provider-owner" });
    await expect(runtime.commands.dispatch("document.new")).resolves.toMatchObject({ status: "executed", responderId: "application:provider-owner" });
    expect(chooseNewDocument).toHaveBeenCalledOnce();
  });
});
