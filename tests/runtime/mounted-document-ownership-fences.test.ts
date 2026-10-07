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

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentType } from "../../src/SynCloudOS/Documents";
import type { DocumentRecord } from "../../src/SynCloudOS/Documents/documentTypes";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import type { RuntimeWebContentService } from "../../src/SynCloudOS/WebContent";
import { createTestBundle, createTestRuntime } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("test cleanup")));
});

function fixture(id = "repair-app") {
  const runtime = createTestRuntime({
    initialBundles: [createTestBundle({ id, route: `/${id}` })],
  });
  runtimes.push(runtime);
  const app = runtime.apps.getApp(id)!;
  runtime.responders.register({ id: `application:${id}`, kind: "application", parentId: "workspace", scopeId: `application:${id}` });
  return { runtime, app };
}

function mountFixture(id = "repair-app") {
  const value = fixture(id);
  const firstResponder = `application:${id}:first`;
  const secondResponder = `application:${id}:second`;
  for (const responderId of [firstResponder, secondResponder]) {
    value.runtime.responders.register({ id: responderId, kind: "control", parentId: `application:${id}`, scopeId: responderId });
  }
  return {
    ...value,
    first: createMountedSynWareRuntime({ runtime: value.runtime, app: value.app, responderId: firstResponder }),
    second: createMountedSynWareRuntime({ runtime: value.runtime, app: value.app, responderId: secondResponder }),
  };
}

function documentType(id: string): DocumentType<{ value: string }> {
  return {
    id,
    displayName: id,
    schemaVersion: 1,
    extensions: [],
    mimeTypes: [],
    capabilities: { versions: true, conflicts: true },
    autosave: "disabled",
    create: () => ({ value: "new" }),
    read: (value) => structuredClone(value),
    write: (value) => structuredClone(value),
    validate: (value: unknown): value is { value: string } => Boolean(value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string"),
  };
}

describe("mounted document ownership fences", () => {
  it("does not expose mounted workspace document type registration", () => {
    const { runtime, app } = fixture();
    runtime.documents.registerType(documentType("repair-app.host-type"));
    const responderId = "application:repair-app";
    const mount = createMountedSynWareRuntime({ runtime, app, responderId });
    const workspace = mount.runtime.workspaceDocuments as unknown as Record<string, unknown>;
    expect(workspace.registerType).toBeUndefined();
    expect(mount.runtime.workspaceDocuments.hasType("repair-app.host-type")).toBe(true);
    mount.dispose();
  });

  it("does not let an observing sibling mount close a dirty document", async () => {
    const { runtime, first, second } = mountFixture();
    runtime.documents.registerType(documentType("repair-app.lease"));
    const document = await first.runtime.workspaceDocuments.newDocument({
      typeId: "repair-app.lease",
      location: { kind: "memory", namespace: "p10", key: "lease" },
      initialModel: { value: "initial" },
    });
    first.runtime.workspaceDocuments.updateDocument(document.id, () => ({ value: "edited" }), { actionName: "Edit" });
    expect(second.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({ id: document.id });
    second.runtime.workspaceDocuments.getUndoManager(document.id);
    second.dispose("observer released");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runtime.documents.getDocument(document.id)).toMatchObject({ id: document.id, state: "dirty" });
    first.dispose("owner released");
  });

  it("keeps a canonical document open when a replacement owner reacquires it during final-owner cleanup", async () => {
    const { runtime, first, second } = mountFixture();
    runtime.documents.registerType(documentType("repair-app.final-owner-reacquire"));
    const document = await first.runtime.workspaceDocuments.newDocument({
      documentId: "repair-app-final-owner-reacquire",
      typeId: "repair-app.final-owner-reacquire",
      location: { kind: "memory", namespace: "p10", key: "final-owner-reacquire" },
      initialModel: { value: "retained" },
    });
    await first.runtime.workspaceDocuments.saveDocument(document.id, { reason: "explicit" });
    const raw = runtime.documents.getDocument(document.id)!;
    const prepareToClose = raw.prepareToClose.bind(raw);
    let markCleanupStarted!: () => void;
    let resumeCleanup!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => { markCleanupStarted = resolve; });
    const cleanupGate = new Promise<void>((resolve) => { resumeCleanup = resolve; });
    vi.spyOn(raw, "prepareToClose").mockImplementationOnce(async (options) => {
      markCleanupStarted();
      await cleanupGate;
      return prepareToClose(options);
    });

    const releasing = first.runtime.workspaceDocuments.releaseDocument(document.id);
    await cleanupStarted;

    expect(second.runtime.workspaceDocuments.retainDocument(document.id)).toMatchObject({ id: document.id });
    resumeCleanup();
    await releasing;

    expect(runtime.documents.getDocument(document.id)).toBe(raw);
    expect(second.runtime.workspaceDocuments.getDocument(document.id)).toMatchObject({
      id: document.id,
      applicationId: "repair-app",
      state: "clean",
    });
  });

  it("forwards one detached command payload snapshot instead of rereading a stateful getter", async () => {
    const { first, runtime } = mountFixture();
    const execute = vi.fn((context: { readonly payload: { readonly appId: string } }) => context.payload.appId);
    first.runtime.commands.register({
      id: "repair-app.snapshot",
      responderId: "application:repair-app:first",
      title: { key: "repair.snapshot", fallback: "Snapshot" },
      payload: { description: "owned app", parse: (value: unknown) => ({ ok: true as const, value: value as { appId: string } }) },
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      execute,
    });
    let reads = 0;
    const payload = {} as { appId: string };
    Object.defineProperty(payload, "appId", {
      enumerable: true,
      get: () => reads++ === 0 ? "repair-app" : "victim-app",
    });
    await expect(first.runtime.commands.dispatch("repair-app.snapshot", payload)).rejects.toThrow(/accessor-free|payload|security/i);
    expect(execute).not.toHaveBeenCalled();
    expect(reads).toBe(0);
    runtime.apps.registerBundle(createTestBundle({ id: "victim-app", route: "/victim" }));
    first.dispose();
  });

  it("binds a prepared acceptance to its original detached payload snapshot", async () => {
    const { first } = mountFixture("acceptance-app");
    const values: string[] = [];
    first.runtime.commands.register({
      id: "acceptance-app.snapshot",
      responderId: "application:acceptance-app:first",
      title: { key: "acceptance.snapshot", fallback: "Snapshot" },
      payload: { description: "snapshot", parse: (value: unknown) => ({ ok: true as const, value: value as { readonly value: string } }) },
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      validate: () => ({ enabled: true }),
      execute: (context) => { values.push(context.payload.value); return context.payload.value; },
    });
    const payload = { value: "before" };
    const prepared = first.runtime.commands.prepareDispatch("acceptance-app.snapshot", payload);
    expect(prepared).toMatchObject({ status: "accepted" });
    if (prepared instanceof Promise || prepared.status !== "accepted") throw new Error("Expected synchronous command acceptance.");
    payload.value = "after";
    await expect(first.runtime.commands.dispatch("acceptance-app.snapshot", payload, { acceptance: prepared.acceptance }))
      .resolves.toMatchObject({ status: "executed", value: "before" });
    expect(values).toEqual(["before"]);
    first.dispose();
  });

  it("retires mounted transfer resources when the application closes", async () => {
    const { runtime, app } = fixture("mounted-transfer-app");
    const responderId = "application:mounted-transfer-app";
    const mount = runtime.transfers.mountApp(app, { responderId });
    const scope = mount.scope;
    const endpoint = scope.drag.endpoint();
    const session = scope.drag.manager.begin({
      source: endpoint,
      representations: [{ type: "text/plain", value: "mounted" }],
      operations: ["copy"],
    });
    expect(runtime.drag.snapshot().active?.id).toBe(session.id);
    await runtime.lifecycle.close(app.id, { reason: "test" }).result;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runtime.drag.snapshot().active).toBeNull();
    expect(mount.signal.aborted).toBe(true);
    mount.dispose();
  });

  it("reports only truthful scoped web diagnostics", () => {
    const { runtime, app } = fixture("diagnostic-app");
    const fakeWeb = {
      runtimeId: runtime.runtimeId,
      createSession: vi.fn(),
      get: () => null,
      suspendOwner: vi.fn(),
      resumeOwner: vi.fn(),
      closeOwner: vi.fn(),
      closeWindowController: vi.fn(),
      diagnostics: () => ({ sessionCount: 0, listenerCount: 4, objectURLCount: 3, frameCount: 1, pendingOperationCount: 0 }),
      dispose: vi.fn(),
    } as unknown as RuntimeWebContentService;
    runtime.transfers.bindWebContent(fakeWeb);
    const mount = runtime.transfers.mountApp(app, { responderId: "application:diagnostic-app" });
    const scope = mount.scope;
    expect(scope.webContent.diagnostics()).toEqual({ sessionCount: 0, pendingOperationCount: 0 });
    mount.dispose();
  });

  it("gives application undo only a revocable mounted lease", () => {
    const { runtime, first } = mountFixture();
    const manager = first.runtime.undo.get({ kind: "application", id: "repair-app" }) as unknown as Record<string, unknown>;
    expect(manager.clear).toBeUndefined();
    expect(manager.dispose).toBeUndefined();
    expect(manager.inspect).toBeUndefined();
    first.dispose("undo lease revoked");
    expect(() => manager.canUndo).toThrow(/revoked|abort|capability/i);
    expect(runtime.undo.get({ kind: "application", id: "repair-app" })).not.toBeNull();
  });

  it("does not adopt a late Save As write after the mounted admission is revoked", async () => {
    const { runtime, first } = mountFixture("save-as-app");
    runtime.documents.registerType(documentType("save-as-app.note"));
    const document = await first.runtime.workspaceDocuments.newDocument({ typeId: "save-as-app.note", initialModel: { value: "draft" } });
    const destination = { kind: "remote" as const, url: "https://p10.invalid/late-save" };
    let releaseWrite!: (record: DocumentRecord<{ value: string }>) => void;
    const writeRecord: DocumentRecord<{ value: string }> = {
      location: destination,
      typeId: "save-as-app.note",
      schemaVersion: 1,
      content: { value: "draft" },
      version: { id: "late-save-version", sequence: 1, savedAt: new Date(0).toISOString(), etag: "late" },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      metadata: {},
    };
    runtime.documents.registerAdapter({
      id: "late-save",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: (location) => location.kind === "remote",
      read: async () => null,
      write: async () => new Promise((resolve) => { releaseWrite = resolve; }).then(() => writeRecord),
      remove: async () => undefined,
      list: async () => [],
      listVersions: async () => [],
      readVersion: async () => null,
      reconcileFencedWrite: vi.fn(async () => undefined),
    });
    const operation = runtime.documents.saveAsDocument({ documentId: document.id, destination, signal: first.runtime.signal });
    await vi.waitFor(() => expect(releaseWrite).toBeTypeOf("function"));
    first.dispose("save-as revoked");
    releaseWrite(writeRecord);
    await expect(operation).rejects.toThrow();
    expect(runtime.documents.getDocument(document.id)).toMatchObject({ location: null });
  });

  it("does not register mounted command undo after a non-cooperative execute resolves", async () => {
    const { runtime, first } = mountFixture("command-undo-app");
    let release!: (value: string) => void;
    const execute = new Promise<string>((resolve) => { release = resolve; });
    const undo = vi.fn();
    first.runtime.commands.register({
      id: "command-undo-app.late",
      responderId: "application:command-undo-app:first",
      title: { key: "late", fallback: "Late" },
      payload: { description: "none", parse: (value: unknown) => value === undefined ? { ok: true as const, value: undefined } : { ok: false as const, issues: ["payload"] } },
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "register", createAction: () => ({ name: "late", undo, redo: vi.fn() }) },
      execute: () => execute,
    });
    const dispatch = runtime.commands.dispatch("command-undo-app.late", undefined, { responderId: "application:command-undo-app:first" });
    first.dispose("late command revoked");
    release("late");
    await dispatch;
    const manager = runtime.undo.get({ kind: "application", id: "command-undo-app" });
    expect(manager?.canUndo).toBe(false);
    await manager?.undo();
    expect(undo).not.toHaveBeenCalled();
  });

  it("rejects reconstructed document-resource descriptors before image decode", async () => {
    const { runtime, first } = mountFixture("image-resource-app");
    runtime.documents.registerType(documentType("image-resource-app.note"));
    const document = await first.runtime.workspaceDocuments.newDocument({ typeId: "image-resource-app.note", initialModel: { value: "image" } });
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const descriptor = await first.runtime.documentResources.acquire(document.id, {
      type: "image/png",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.slice().buffer,
    });
    const decode = vi.spyOn(runtime.images, "load");
    const reconstructed = { ...descriptor };
    expect(() => first.runtime.images.load({
      source: { kind: "document-resource", documentId: document.id, descriptor: reconstructed },
      subject: { documentId: document.id },
    })).toThrow(/lease|descriptor|resource|authority/i);
    expect(decode).not.toHaveBeenCalled();
    first.runtime.documentResources.release(document.id, descriptor);
  });
});
