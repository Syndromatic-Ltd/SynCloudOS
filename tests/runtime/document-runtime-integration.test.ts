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
import {
  InMemoryDocumentAdapter,
  InMemoryDocumentRecoveryStore,
} from "../../src/SynCloudOS/Documents";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createTestRuntimeEnvironment } from "./helpers";
import { noteType } from "../fixtures/noteDocumentType";

describe("runtime documents", () => {
  it("publishes the closed state to direct document observers during runtime disposal", async () => {
    const runtime = createSynCloudOS({
      id: "runtime:document-disposal-publication",
      environment: createTestRuntimeEnvironment(),
    });
    runtime.documents.registerType(noteType);
    const document = await runtime.documents.newDocument({
      documentId: "disposal-publication",
      typeId: noteType.id,
    });
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    const states: string[] = [];
    document.subscribe(() => states.push(document.state));

    await expect(runtime.dispose("publication-test")).resolves.toMatchObject({ status: "disposed" });
    expect(states).toEqual(["closed"]);
  });

  it("isolates document types and open instances per runtime", async () => {
    const first = createSynCloudOS({
      id: "runtime:docs-a",
      environment: createTestRuntimeEnvironment(),
    });
    const second = createSynCloudOS({
      id: "runtime:docs-b",
      environment: createTestRuntimeEnvironment(),
    });
    first.documents.registerType(noteType);
    expect(first.documents.hasType(noteType.id)).toBe(true);
    expect(second.documents.hasType(noteType.id)).toBe(false);
    await first.dispose("test");
    await second.dispose("test");
  });

  it("preserves the publishing store under the explicit documentStore seam", async () => {
    const runtime = createSynCloudOS({
      id: "runtime:publishing-store",
      environment: createTestRuntimeEnvironment(),
    });

    expect(runtime.documentStore.runtimeId).toBe(runtime.runtimeId);
    expect(runtime.documentStore).not.toBe(runtime.documents);
    await runtime.dispose("test");
  });

  it("reviews dirty documents before aborting runtime-owned resources", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createSynCloudOS({
      id: "runtime:doc-disposal-cancel",
      environment,
    });
    await runtime.boot({ initialPathname: "/" });
    runtime.documents.registerType(noteType);
    runtime.documents.registerAdapter(new InMemoryDocumentAdapter(environment));
    const cancellationReview = runtime.documents.registerCloseReviewer({
      review: async () => "cancel",
    });
    const document = await runtime.documents.newDocument({
      documentId: "dirty-at-disposal",
      typeId: noteType.id,
    });
    document.update((model) => ({ ...model, body: "Keep me" }), {
      actionName: "Type",
    });
    const listenerCount = environment.activeListenerCount();

    const cancelled = await runtime.dispose({
      reason: "test",
      inFlight: "await",
      timeoutMs: 1_000,
    });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      participantId: "documents",
    });
    expect(runtime.signal.aborted).toBe(false);
    expect(runtime.disposalState).toBe("running");
    expect(environment.activeListenerCount()).toBe(listenerCount);
    expect(runtime.documents.getDocument(document.id)).toBe(document);
    expect(document.state).toBe("dirty");
    expect(await runtime.commands.validate("document.close")).toMatchObject({
      enabled: true,
    });
    cancellationReview.dispose();
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    const disposed = await runtime.dispose("test-retry");
    expect(disposed).toMatchObject({ status: "disposed" });
    expect(environment.activeListenerCount()).toBe(0);
  });

  it("uses the configured recovery store and initial adapters with runtime ports", async () => {
    const environment = createTestRuntimeEnvironment();
    const recoveryStore = new InMemoryDocumentRecoveryStore();
    const adapter = new InMemoryDocumentAdapter(environment);
    const runtime = createSynCloudOS({
      id: "runtime:document-injection",
      environment,
      persistenceNamespace: "tests:document-injection",
      applicationDocuments: {
        recoveryStore,
        initialAdapters: [adapter],
      },
    });
    runtime.documents.registerType(noteType);
    const document = await runtime.documents.newDocument({
      documentId: "injected-draft",
      typeId: noteType.id,
    });
    document.update((model) => ({ ...model, body: "Recover me" }), {
      actionName: "Type",
    });
    await document.flushRecovery();

    expect(document.recoveryRecord).not.toBeNull();
    await expect(
      recoveryStore.read(document.recoveryRecord!.recoveryId),
    ).resolves.toEqual(document.recoveryRecord);
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    await runtime.dispose("test");
  });

  it("collects every close decision before performing disposal saves", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = new InMemoryDocumentAdapter(environment);
    const runtime = createSynCloudOS({ id: "runtime:document-all-ready", environment });
    runtime.documents.registerType(noteType);
    runtime.documents.registerAdapter(adapter);
    const first = await runtime.documents.newDocument({
      documentId: "first-review",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "disposal", key: "first" },
    });
    const second = await runtime.documents.newDocument({
      documentId: "second-review",
      typeId: noteType.id,
      location: { kind: "memory", namespace: "disposal", key: "second" },
    });
    first.update((model) => ({ ...model, body: "First" }), { actionName: "Type" });
    second.update((model) => ({ ...model, body: "Second" }), { actionName: "Type" });
    const reviews: string[] = [];
    runtime.documents.registerCloseReviewer({
      review: async ({ documentId }) => {
        reviews.push(documentId);
        return documentId === second.id ? "save" : "cancel";
      },
    });
    const write = vi.spyOn(adapter, "write");

    await expect(runtime.dispose("all-ready")).resolves.toMatchObject({
      status: "cancelled",
      participantId: "documents",
    });
    expect(reviews).toEqual([second.id, first.id]);
    expect(write).not.toHaveBeenCalled();
    expect(first.state).toBe("dirty");
    expect(second.state).toBe("dirty");
    first.update((model) => ({ ...model, body: "Still editable" }), { actionName: "Type" });
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    await runtime.dispose("cleanup");
  });

  it("rolls document gates back when a later participant cancels", async () => {
    const environment = createTestRuntimeEnvironment();
    const adapter = Object.assign(new InMemoryDocumentAdapter(environment), { dispose: vi.fn() });
    const runtime = createSynCloudOS({
      id: "runtime:document-window-rollback",
      environment,
      applicationDocuments: {
        recoveryStore: new InMemoryDocumentRecoveryStore(),
        initialAdapters: [adapter],
      },
    });
    runtime.documents.registerType(noteType);
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    const document = await runtime.documents.newDocument({ documentId: "rollback-draft", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Keep" }), { actionName: "Type" });
    const later = runtime.registerDisposalParticipant({
      id: "test-window-preflight",
      prepare: () => {
        expect(() => document.update((model) => model, { actionName: "Blocked" })).toThrow(/prepared close/);
        return { status: "cancelled", reason: "window-close-cancelled" };
      },
    });

    await expect(runtime.dispose("window-cancel")).resolves.toMatchObject({
      status: "cancelled",
      participantId: "test-window-preflight",
    });
    expect(adapter.dispose).not.toHaveBeenCalled();
    expect(runtime.signal.aborted).toBe(false);
    expect(() => document.update((model) => ({ ...model, body: "Usable" }), { actionName: "Type" })).not.toThrow();
    expect(later.unregister()).toBe(true);
    await expect(runtime.dispose("retry")).resolves.toMatchObject({ status: "disposed" });
    expect(adapter.dispose).toHaveBeenCalledTimes(1);
  });

  it("releases document gates when a close reviewer ignores cancellation", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createSynCloudOS({ id: "runtime:document-review-timeout", environment });
    runtime.documents.registerType(noteType);
    const unresolved = new Promise<"discard">(() => undefined);
    runtime.documents.registerCloseReviewer({ review: async () => unresolved });
    const document = await runtime.documents.newDocument({ documentId: "timeout-draft", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Keep" }), { actionName: "Type" });

    await expect(runtime.dispose({ reason: "timeout", timeoutMs: 20 })).resolves.toMatchObject({
      status: "cancelled",
      participantId: "documents",
    });
    expect(runtime.signal.aborted).toBe(false);
    expect(() => document.update((model) => ({ ...model, body: "Still usable" }), { actionName: "Type" })).not.toThrow();
    runtime.documents.registerCloseReviewer({ review: async () => "discard" });
    await runtime.dispose("cleanup");
  });
});
