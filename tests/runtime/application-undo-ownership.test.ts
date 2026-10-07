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
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import type { DocumentType, DocumentRecord } from "../../src/SynCloudOS/Documents";
import { defineSyncUndoAction } from "../../src/SynCloudOS/Undo";
import { createTestBundle, createTestRuntime } from "./helpers";

const runtimes: Array<ReturnType<typeof createTestRuntime>> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("test cleanup")));
});

function fixture(id = "repair-3-app") {
  const runtime = createTestRuntime({ initialBundles: [createTestBundle({ id, route: `/${id}` })] });
  runtimes.push(runtime);
  const app = runtime.apps.getApp(id)!;
  const responderId = `application:${id}`;
  if (!runtime.responders.get(responderId)) runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
  return { runtime, app, responderId };
}

function noteType(id: string): DocumentType<{ value: string }> {
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

function record(location: { readonly kind: "remote"; readonly url: string }, typeId: string, value: string): DocumentRecord<{ value: string }> {
  return {
    location,
    typeId,
    schemaVersion: 1,
    content: { value },
    version: { id: "repair-3-version", sequence: 1, savedAt: new Date(0).toISOString(), etag: "repair-3" },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    metadata: {},
  };
}

describe("transactional generations and application undo ownership", () => {
  it("revokes only one application undo registration segment and retires its entries", async () => {
    const { runtime } = fixture();
    const manager = runtime.undo.create({ kind: "application", id: "repair-3-app" });
    const first = manager.createRegistrationLease();
    const second = manager.createRegistrationLease();
    let value = 0;
    first.register(defineSyncUndoAction({ name: "first", asyncPolicy: "forbid", undo: () => { value -= 1; }, redo: () => { value += 1; } }));
    second.register(defineSyncUndoAction({ name: "second", asyncPolicy: "forbid", undo: () => { value -= 10; }, redo: () => { value += 10; } }));
    expect(manager.inspect().entries.map(({ name }) => name)).toEqual(["first", "second"]);
    first.revoke();
    expect(manager.inspect().entries.map(({ name }) => name)).toEqual(["second"]);
    expect(manager.canUndo).toBe(true);
    await manager.undo();
    expect(value).toBe(-10);
    expect(first.isLive).toBe(false);
  });

  it("keeps the cursor and sibling action intact when revoking from a mixed group", async () => {
    const { runtime } = fixture();
    const manager = runtime.undo.create({ kind: "application", id: "repair-3-app" });
    const first = manager.createRegistrationLease();
    const second = manager.createRegistrationLease();
    let value = 0;
    let firstCleanup = 0;
    let secondCleanup = 0;
    manager.beginGroup("mixed");
    first.register(defineSyncUndoAction({ name: "first", asyncPolicy: "forbid", undo: () => { value -= 1; }, redo: () => { value += 1; }, cleanup: () => { firstCleanup += 1; } }));
    second.register(defineSyncUndoAction({ name: "second", asyncPolicy: "forbid", undo: () => { value -= 10; }, redo: () => { value += 10; }, cleanup: () => { secondCleanup += 1; } }));
    manager.endGroup();
    first.revoke();
    expect(manager.inspect().cursor).toBe(1);
    expect(manager.inspect().entries).toEqual(expect.arrayContaining([expect.objectContaining({ name: "mixed", actionCount: 1 })]));
    expect(firstCleanup).toBe(1);
    expect(secondCleanup).toBe(0);
    await manager.undo();
    expect(value).toBe(-10);
    second.revoke();
    expect(secondCleanup).toBe(1);
  });

  it("gives a document observer a read-only undo status projection", async () => {
    const { runtime, app, responderId } = fixture();
    const owner = createMountedSynWareRuntime({ runtime, app, responderId });
    const observer = createMountedSynWareRuntime({ runtime, app, responderId: `${responderId}:observer` });
    runtime.responders.register({ id: `${responderId}:observer`, kind: "view", parentId: responderId, scopeId: `${responderId}:observer` });
    runtime.documents.registerType(noteType("repair-3-app.note"));
    const document = await owner.runtime.workspaceDocuments.newDocument({ typeId: "repair-3-app.note", initialModel: { value: "a" } });
    owner.runtime.workspaceDocuments.updateDocument(document.id, () => ({ value: "b" }), { actionName: "Edit" });
    const readOnly = observer.runtime.workspaceDocuments.getUndoManager(document.id);
    expect(readOnly.canUndo).toBe(true);
    expect(() => readOnly.register(defineSyncUndoAction({ name: "bad", asyncPolicy: "forbid", undo: () => {}, redo: () => {} }))).toThrow(/observer|undo/i);
    expect(() => readOnly.undo()).toThrow(/observer|undo/i);
    expect(() => readOnly.redo()).toThrow(/observer|undo/i);
    expect((owner.runtime.workspaceDocuments.getUndoManager(document.id)).canUndo).toBe(true);
    observer.dispose();
    owner.dispose();
  });

  it("rejects array getters, custom methods, proxies, holes and oversized lengths without host dispatch", async () => {
    const { runtime, app, responderId } = fixture();
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const execute = vi.fn();
    mounted.runtime.commands.register({
      id: "repair-3-app.array",
      responderId,
      title: { key: "repair.array", fallback: "Array" },
      payload: { description: "array", parse: (value: unknown) => ({ ok: true as const, value }) },
      defaultKeyBindings: [], scope: "application", undo: { kind: "none" }, execute,
    });
    let reads = 0;
    const getter = [] as unknown[];
    Object.defineProperty(getter, "0", { enumerable: true, get: () => { reads += 1; return "bad"; } });
    await expect(mounted.runtime.commands.dispatch("repair-3-app.array", getter)).rejects.toThrow(/accessor|array|payload/i);
    const custom = ["bad"] as unknown[];
    Object.defineProperty(custom, "map", { enumerable: true, value: () => [] });
    await expect(mounted.runtime.commands.dispatch("repair-3-app.array", custom)).rejects.toThrow(/custom|array|payload/i);
    const proxy = new Proxy(["bad"], { get() { reads += 1; throw new Error("proxy getter executed"); } });
    await expect(mounted.runtime.commands.dispatch("repair-3-app.array", proxy)).rejects.toThrow(/proxy|array|payload/i);
    const sparse = [] as unknown[];
    Object.defineProperty(sparse, "length", { value: 10_000 });
    await expect(mounted.runtime.commands.dispatch("repair-3-app.array", sparse)).rejects.toThrow(/dense|length|node|array/i);
    expect(reads).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    await expect(mounted.runtime.commands.dispatch("repair-3-app.array", ["safe", { nested: [1, 2] }])).resolves.toMatchObject({ status: "executed" });
    expect(execute).toHaveBeenCalledOnce();
    mounted.dispose();
  });

  it("revokes a transfer mount when its responder is removed and never revives it by ID", async () => {
    const { runtime, app, responderId } = fixture("repair-3-transfer");
    const mount = runtime.transfers.mountApp(app, { responderId });
    const scope = mount.scope;
    const endpoint = scope.drag.endpoint();
    const session = scope.drag.manager.begin({ source: endpoint, representations: [{ type: "text/plain", value: "mounted" }], operations: ["copy"] });
    expect(runtime.drag.snapshot().active?.id).toBe(session.id);
    runtime.responders.remove(responderId, { cascade: true });
    expect(runtime.drag.snapshot().active).toBeNull();
    expect(mount.signal.aborted).toBe(true);
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
    expect(() => scope.drag.endpoint()).toThrow(/authority|live|transfer/i);
    const fresh = runtime.transfers.mountApp(app, { responderId });
    expect(() => fresh.scope.drag.endpoint()).not.toThrow();
    fresh.dispose();
    mount.dispose();
  });

  it("rejects an uncompensable empty Save As before writing", async () => {
    const { runtime, app, responderId } = fixture("repair-3-save");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    runtime.documents.registerType(noteType("repair-3-save.note"));
    const document = await mounted.runtime.workspaceDocuments.newDocument({ typeId: "repair-3-save.note", initialModel: { value: "draft" } });
    const destination = { kind: "remote" as const, url: "https://p10.invalid/uncompensable" };
    let writes = 0;
    runtime.documents.registerAdapter({
      id: "repair-3-uncompensable",
      capabilities: { versions: true, delete: false, watch: false, offline: false, atomicConditionalWrite: true },
      supports: (location) => location.kind === "remote",
      read: async () => null,
      write: async () => { writes += 1; return record(destination, "repair-3-save.note", "draft"); },
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    });
    await expect(runtime.documents.saveAsDocument({ documentId: document.id, destination })).rejects.toThrow(/compensate|safe/i);
    expect(writes).toBe(0);
    expect(runtime.documents.getDocument(document.id)?.location).toBeNull();
    mounted.dispose();
  });

  it("stales new-document admissions when a type or adapter is replaced during non-cooperative read", async () => {
    const { runtime, app, responderId } = fixture("repair-3-generation");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const type = noteType("repair-3-generation.note");
    const typeRegistration = runtime.documents.registerType(type);
    let releaseRead!: (value: null) => void;
    const oldAdapter = {
      id: "repair-3-generation-adapter",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: (location: { readonly kind: string }) => location.kind === "remote",
      read: async () => new Promise<null>((resolve) => { releaseRead = resolve; }),
      write: async () => record({ kind: "remote", url: "https://p10.invalid/generation" }, type.id, "new"),
      remove: async () => undefined,
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const oldRegistration = runtime.documents.registerAdapter(oldAdapter);
    const pending = mounted.runtime.workspaceDocuments.newDocument({
      typeId: type.id,
      location: { kind: "remote", url: "https://p10.invalid/generation" },
      initialModel: { value: "new" },
    });
    await vi.waitFor(() => expect(releaseRead).toBeTypeOf("function"));
    typeRegistration.dispose();
    runtime.documents.registerType(noteType(type.id));
    oldRegistration.dispose();
    runtime.documents.registerAdapter({ ...oldAdapter, read: async () => null });
    releaseRead(null);
    await expect(pending).rejects.toThrow(/stale|admission|abort|storage/i);
    expect(runtime.documents.openDocuments).toHaveLength(0);
    mounted.dispose();
  });

  it("compensates exactly once when the Save As adapter generation is replaced during write", async () => {
    const { runtime, app, responderId } = fixture("repair-3-write-generation");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    const type = noteType("repair-3-write-generation.note");
    runtime.documents.registerType(type);
    const document = await mounted.runtime.workspaceDocuments.newDocument({ typeId: type.id, initialModel: { value: "draft" } });
    const destination = { kind: "remote" as const, url: "https://p10.invalid/write-generation" };
    let releaseWrite!: () => void;
    let removed = 0;
    const oldAdapter = {
      id: "repair-3-write-generation-adapter",
      capabilities: { versions: true, delete: true, watch: false, offline: false, atomicConditionalWrite: true },
      supports: (location: { readonly kind: string }) => location.kind === "remote",
      read: async () => null,
      write: async () => new Promise<DocumentRecord<{ value: string }>>((resolve) => { releaseWrite = () => resolve(record(destination, type.id, "draft")); }),
      remove: async () => { removed += 1; },
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
    };
    const oldRegistration = runtime.documents.registerAdapter(oldAdapter);
    const pending = runtime.documents.saveAsDocument({ documentId: document.id, destination });
    await vi.waitFor(() => expect(releaseWrite).toBeTypeOf("function"));
    oldRegistration.dispose();
    runtime.documents.registerAdapter({ ...oldAdapter, write: async () => record(destination, type.id, "replacement") });
    releaseWrite();
    await expect(pending).rejects.toThrow(/stale|admission|abort/i);
    expect(removed).toBe(1);
    expect(runtime.documents.getDocument(document.id)?.location).toBeNull();
    mounted.dispose();
  });

  it("restores the old document binding and removes a committed Save As when watch adoption throws", async () => {
    const { runtime, app, responderId } = fixture("repair-3-atomic");
    const mounted = createMountedSynWareRuntime({ runtime, app, responderId });
    runtime.documents.registerType(noteType("repair-3-atomic.note"));
    const source = { kind: "memory" as const, namespace: "repair-3", key: "source" };
    const destination = { kind: "remote" as const, url: "https://p10.invalid/atomic" };
    const document = await mounted.runtime.workspaceDocuments.newDocument({ typeId: "repair-3-atomic.note", location: source, initialModel: { value: "draft" } });
    let removed = 0;
    runtime.documents.registerAdapter({
      id: "repair-3-throwing-watch",
      capabilities: { versions: true, delete: true, watch: true, offline: false, atomicConditionalWrite: true },
      supports: (location) => location.kind === "remote",
      read: async () => null,
      write: async () => record(destination, "repair-3-atomic.note", "draft"),
      remove: async () => { removed += 1; },
      list: async () => [], listVersions: async () => [], readVersion: async () => null,
      watch: () => { throw new Error("watch admission failed"); },
    });
    await expect(runtime.documents.saveAsDocument({ documentId: document.id, destination })).rejects.toThrow(/watch|admission|failed/i);
    expect(removed).toBe(1);
    expect(runtime.documents.getDocument(document.id)?.location).toEqual(source);
    mounted.dispose();
  });
});
