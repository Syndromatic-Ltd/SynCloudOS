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
import { type AppBounds } from "../../src/SynCloudOS/AppSDK";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import type { DocumentType } from "../../src/SynCloudOS/Documents";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters";
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";

interface WindowDocumentModel {
  readonly version: 1;
  readonly text: string;
}

const windowDocumentType: DocumentType<WindowDocumentModel> = Object.freeze({
  id: "tests.secondary-window-document",
  displayName: "Secondary window document",
  schemaVersion: 1,
  extensions: Object.freeze([".secondary-window-test"]),
  mimeTypes: Object.freeze(["application/x-syncloudos-secondary-window-test"]),
  creatingApplicationId: "com.example.window-owner",
  openingApplicationIds: Object.freeze(["com.example.window-owner", "com.example.foreign-owner"]),
  capabilities: Object.freeze({ versions: true, conflicts: true }),
  autosave: "disabled",
  create: () => Object.freeze({ version: 1, text: "Untitled" }),
  read: (value) => structuredClone(value),
  write: (value) => structuredClone(value),
  validate: (value): value is WindowDocumentModel => Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    (value as Partial<WindowDocumentModel>).version === 1 &&
    typeof (value as Partial<WindowDocumentModel>).text === "string",
  ),
});

const activeRuntimes: ReturnType<typeof createTestRuntime>[] = [];
const activeMounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];

afterEach(async () => {
  for (const mounted of activeMounts.splice(0)) mounted.dispose("test complete");
  for (const runtime of activeRuntimes.splice(0)) await runtime.dispose("test complete");
});

function createFixture(options: {
  readonly environment?: ReturnType<typeof createTestRuntimeEnvironment>;
  readonly runtimeId?: string;
} = {}) {
  const environment = options.environment ?? createTestRuntimeEnvironment();
  const runtime = createTestRuntime({
    id: options.runtimeId ?? `runtime:app-window-client:${Math.random().toString(16).slice(2)}`,
    environment,
    applicationDocuments: {
      initialTypes: [windowDocumentType],
      initialAdapters: [new InMemoryDocumentAdapter(environment)],
    },
  });
  activeRuntimes.push(runtime);
  registerTestSynWare(runtime, {
    schemaVersion: 1,
    bundleIdentifier: "com.example.window-owner",
    version: "1.0.0",
    displayName: "Window Owner",
    routes: [{ path: "/window-owner", primary: true }],
    windowDefaults: {
      title: "Window Owner",
      width: 640,
      height: 480,
      minimumWidth: 400,
      minimumHeight: 300,
      resizable: true,
    },
    documentTypes: [{ id: windowDocumentType.id, displayName: windowDocumentType.displayName }],
  });
  registerTestSynWare(runtime, {
    schemaVersion: 1,
    bundleIdentifier: "com.example.foreign-owner",
    version: "1.0.0",
    displayName: "Foreign Owner",
    routes: [{ path: "/foreign-owner", primary: true }],
    documentTypes: [{ id: windowDocumentType.id, displayName: windowDocumentType.displayName }],
  });
  const ownerMount = mountTestSynWareRuntime(runtime, "com.example.window-owner");
  const foreignMount = mountTestSynWareRuntime(runtime, "com.example.foreign-owner");
  activeMounts.push(ownerMount, foreignMount);
  return {
    runtime,
    ownerMount,
    foreignMount,
    owner: createSynWareContextValue(ownerMount.runtime),
    foreign: createSynWareContextValue(foreignMount.runtime),
  };
}

async function createOwnedDocument(
  fixture: ReturnType<typeof createFixture>,
  owner: "owner" | "foreign" = "owner",
  documentId = owner === "owner" ? "window-owner:document:one" : "foreign-owner:document:one",
) {
  return fixture[owner].documents.workspaceDocuments.newDocument<WindowDocumentModel>({
    documentId,
    typeId: windowDocumentType.id,
    location: { kind: "memory", namespace: "app-window-client", key: documentId },
    initialModel: { version: 1, text: `${owner} document` },
    activate: false,
  });
}

describe("mounted AppSDK secondary document windows", () => {
  it("accepts only the approved request shape and forces all host authority fields", async () => {
    const fixture = createFixture();
    const document = await createOwnedDocument(fixture);
    const opened = await fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Owned note",
      restorationKey: "note-one",
      preferredBounds: { x: -200, y: 880, width: 2000, height: 200 } satisfies AppBounds,
      mobilePolicy: "hidden",
    });

    const record = fixture.runtime.windows.select(opened.id).record;
    expect(record).toMatchObject({
      workspaceId: "workspace-main",
      applicationId: "com.example.window-owner",
      applicationSessionId: "com.example.window-owner",
      documentId: document.id,
      documentAssociationRole: "secondary",
      representedDocument: null,
      toolbar: null,
      role: "standard",
      style: ["titled", "closable", "minimisable", "resizable", "zoomable"],
      title: "Owned note",
      content: { rendererId: "application", parameters: { appId: "com.example.window-owner" } },
      bounds: { x: 0, y: 600, width: 1440, height: 300 },
      minimumSize: { width: 400, height: 300 },
      maximumSize: null,
      level: "normal",
      parentWindowControllerId: null,
      anchor: null,
      pinned: false,
      mobilePolicy: "hidden",
      restorationKey: "application.com.example.window-owner.document.note-one",
    });

    await expect(fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Escalated",
      restorationKey: "authority-injection",
      rendererId: "diagnostics",
    } as never)).rejects.toMatchObject({ name: "SecurityError" });
    await expect(fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Non-finite",
      restorationKey: "non-finite",
      preferredBounds: { x: Number.NaN, y: 0, width: 640, height: 480 },
    })).rejects.toBeInstanceOf(TypeError);
  });

  it("publishes immutable owned/current projections and never leaks raw window authority", async () => {
    const fixture = createFixture();
    const document = await createOwnedDocument(fixture);
    const opened = await fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Projected note",
      restorationKey: "projected-note",
    });
    const stageSnapshot = fixture.owner.windows.getSnapshot();
    expect(stageSnapshot.current).toBeNull();
    expect(stageSnapshot.owned).toEqual([opened]);
    expect(Object.isFrozen(stageSnapshot)).toBe(true);
    expect(Object.isFrozen(stageSnapshot.owned)).toBe(true);
    expect(Object.isFrozen(opened)).toBe(true);
    expect(opened).not.toHaveProperty("applicationId");
    expect(opened).not.toHaveProperty("applicationSessionId");
    expect(opened).not.toHaveProperty("workspaceId");
    expect(opened).not.toHaveProperty("content");
    expect(fixture.owner.windows).not.toHaveProperty("manager");
    expect(fixture.owner.windows).not.toHaveProperty("select");
    expect(fixture.owner.windows).not.toHaveProperty("create");

    const mountedAgain = fixture.runtime.apps.getApp("com.example.window-owner");
    if (!mountedAgain) throw new Error("Window owner was not registered.");
    const secondaryMount = (await import("../../src/SynCloudOS/AppSDK/appRuntimeFacade")).createMountedSynWareRuntime({
      runtime: fixture.runtime,
      app: mountedAgain,
      responderId: `window:${opened.id}:projection`,
      windowControllerId: opened.id,
    });
    activeMounts.push(secondaryMount);
    const secondary = createSynWareContextValue(secondaryMount.runtime);
    expect(secondary.windows.getSnapshot().current).toEqual(opened);
    expect(secondary.windows.getSnapshot().current?.documentId).toBe(document.id);
  });

  it("issues animation owners to a window-scoped mount for its own window", async () => {
    const fixture = createFixture();
    const document = await createOwnedDocument(fixture);
    const opened = await fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Animated note",
      restorationKey: "animated-note",
    });
    const app = fixture.runtime.apps.getApp("com.example.window-owner");
    if (!app) throw new Error("Window owner was not registered.");
    const secondaryMount = (await import("../../src/SynCloudOS/AppSDK/appRuntimeFacade")).createMountedSynWareRuntime({
      runtime: fixture.runtime,
      app,
      responderId: `window:${opened.id}:animated-projection`,
      windowControllerId: opened.id,
    });
    activeMounts.push(secondaryMount);
    const secondary = createSynWareContextValue(secondaryMount.runtime);
    // NSE presentations in a second window acquire owners through this path.
    const owner = secondary.animations.acquireOwner("nse-presentation:probe");
    expect(owner.dispose()).toBe(true);
  });

  it("keeps a document window alive after its opener releases ownership while the child mount retains it", async () => {
    const fixture = createFixture();
    const document = await fixture.owner.documents.workspaceDocuments.newProjectionDocument<WindowDocumentModel>({
      typeId: windowDocumentType.id, initialModel: { version: 1, text: "Read-only sample" }, activate: false,
    });
    const opened = await fixture.owner.windows.openDocumentWindow({
      documentId: document.id, title: "Independent note", restorationKey: "independent-note",
    });
    const app = fixture.runtime.apps.getApp("com.example.window-owner");
    if (!app) throw new Error("Window owner was not registered.");
    const secondaryMount = (await import("../../src/SynCloudOS/AppSDK/appRuntimeFacade")).createMountedSynWareRuntime({
      runtime: fixture.runtime, app, responderId: `window:${opened.id}:document-owner`, windowControllerId: opened.id,
    });
    activeMounts.push(secondaryMount);
    const secondary = createSynWareContextValue(secondaryMount.runtime);
    expect(secondary.documents.workspaceDocuments.retainDocument(document.id)?.id).toBe(document.id);

    await fixture.owner.documents.workspaceDocuments.releaseDocument(document.id);
    expect(fixture.runtime.documents.getDocument(document.id)?.state).toBe("clean");
    expect(fixture.runtime.windows.select(opened.id).record.state).toBe("open");

    await secondary.documents.workspaceDocuments.releaseDocument(document.id);
    // A live window pins the document even after both component owners leave.
    expect(fixture.runtime.documents.getDocument(document.id)?.state).toBe("clean");
    await fixture.owner.windows.close(opened.id);
    await vi.waitFor(() => expect(fixture.runtime.documents.getDocument(document.id)).toBeNull());
    expect(fixture.owner.windows.getSnapshot().owned).toEqual([]);
  });

  it("reuses and restores the same caller-scoped restoration key instead of duplicating", async () => {
    const fixture = createFixture();
    const document = await createOwnedDocument(fixture);
    const first = await fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "One",
      restorationKey: "same-note",
    });
    fixture.runtime.windows.minimise(first.id);
    const second = await fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Ignored duplicate title",
      restorationKey: "same-note",
    });

    expect(second.id).toBe(first.id);
    expect(fixture.runtime.windows.list({ applicationId: "com.example.window-owner" })).toHaveLength(1);
    expect(fixture.runtime.windows.select(first.id).record.state).toBe("open");
    expect(fixture.runtime.windows.snapshot().keyWindowControllerId).toBe(first.id);
  });

  it("fails closed for missing, closed, unowned, and foreign documents", async () => {
    const fixture = createFixture();
    const foreignDocument = await createOwnedDocument(fixture, "foreign");
    const ownerDocument = await createOwnedDocument(fixture, "owner", "window-owner:document:closed");
    await fixture.owner.documents.workspaceDocuments.releaseDocument(ownerDocument.id);

    for (const documentId of ["missing-document", ownerDocument.id, foreignDocument.id]) {
      await expect(fixture.owner.windows.openDocumentWindow({
        documentId,
        title: "Denied",
        restorationKey: `denied-${documentId}`,
      })).rejects.toMatchObject({ name: "SecurityError" });
    }
  });

  it("revalidates ownership for focus and close and dissociates the document on normal close", async () => {
    const fixture = createFixture();
    const ownerDocument = await createOwnedDocument(fixture);
    const foreignDocument = await createOwnedDocument(fixture, "foreign");
    const ownerWindow = await fixture.owner.windows.openDocumentWindow({
      documentId: ownerDocument.id,
      title: "Owner",
      restorationKey: "owner-window",
    });
    const foreignWindow = await fixture.foreign.windows.openDocumentWindow({
      documentId: foreignDocument.id,
      title: "Foreign",
      restorationKey: "foreign-window",
    });

    expect(() => fixture.owner.windows.focus(foreignWindow.id)).toThrow(expect.objectContaining({ name: "SecurityError" }));
    await expect(fixture.owner.windows.close(foreignWindow.id)).rejects.toMatchObject({ name: "SecurityError" });
    expect(fixture.owner.windows.focus(ownerWindow.id)).toEqual(ownerWindow);
    await expect(fixture.owner.windows.close(ownerWindow.id)).resolves.toMatchObject({ outcome: "closed" });
    expect(fixture.runtime.documents.getDocument(ownerDocument.id)?.windowAssociations).toEqual([]);
    expect(fixture.owner.windows.getSnapshot().owned).toEqual([]);
    expect(() => fixture.owner.windows.focus(ownerWindow.id)).toThrow(expect.objectContaining({ name: "SecurityError" }));
  });

  it("notifies subscribers for owned lifecycle changes", async () => {
    const fixture = createFixture();
    const document = await createOwnedDocument(fixture);
    const listener = vi.fn();
    const unsubscribe = fixture.owner.windows.subscribe(listener);
    const opened = await fixture.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Observed",
      restorationKey: "observed",
    });
    await fixture.owner.windows.close(opened.id);
    unsubscribe();
    expect(listener).toHaveBeenCalled();
  });

  it("restores a persisted secondary document window in a fresh runtime after restoring its unsaved caller-owned document", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtimeId = "runtime:app-window-client:fresh-restoration";
    const source = createFixture({ environment, runtimeId });
    const document = await createOwnedDocument(source, "owner", "window-owner:document:restored-projection");
    const opened = await source.owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Restored projection",
      restorationKey: "restored-projection",
      preferredBounds: { x: 91, y: 73, width: 690, height: 510 },
      mobilePolicy: "sheet",
    });
    const documentSnapshot = structuredClone(source.runtime.documents.createRestorationSnapshot());
    const persistedWindowSnapshot = source.runtime.windows.saveRestorationSnapshot();

    const target = createFixture({ environment, runtimeId });
    expect(target.runtime).not.toBe(source.runtime);
    const documentReport = await target.runtime.documents.restoreSession(documentSnapshot);
    expect(documentReport).toMatchObject({
      restoredDocumentIds: [document.id],
      failures: [],
    });
    expect(target.runtime.documents.getDocument(document.id)?.snapshot()).toMatchObject({
      id: document.id,
      applicationId: "com.example.window-owner",
      model: { version: 1, text: "owner document" },
    });

    const windowReport = await target.runtime.windows.restorePersistedWorkspace();
    expect(windowReport).toEqual({
      restoredWindowControllerIds: [opened.id],
      reusedWindowControllerIds: [],
      failures: [],
    });
    const restoredWindowSnapshot = target.runtime.windows.createRestorationSnapshot();
    expect(restoredWindowSnapshot.capturedAtEpochMs).toBeGreaterThanOrEqual(persistedWindowSnapshot.capturedAtEpochMs);
    expect({ ...restoredWindowSnapshot, capturedAtEpochMs: 0 }).toEqual({ ...persistedWindowSnapshot, capturedAtEpochMs: 0 });
    const restored = target.runtime.windows.select(opened.id).record;
    expect(restored).toMatchObject({
      workspaceId: "workspace-main",
      applicationId: "com.example.window-owner",
      applicationSessionId: "com.example.window-owner",
      documentId: document.id,
      documentAssociationRole: "secondary",
      representedDocument: null,
      toolbar: null,
      role: "standard",
      style: ["titled", "closable", "minimisable", "resizable", "zoomable"],
      title: "Restored projection",
      content: { rendererId: "application", parameters: { appId: "com.example.window-owner" } },
      bounds: { x: 91, y: 73, width: 690, height: 510 },
      minimumSize: { width: 400, height: 300 },
      maximumSize: null,
      level: "normal",
      parentWindowControllerId: null,
      anchor: null,
      pinned: false,
      mobilePolicy: "sheet",
      restorationKey: "application.com.example.window-owner.document.restored-projection",
    });
    expect(target.runtime.documents.getDocument(document.id)?.windowAssociations).toEqual([
      { windowControllerId: opened.id, role: "secondary" },
    ]);
    expect(target.owner.windows.getSnapshot().owned).toEqual([
      expect.objectContaining({ id: opened.id, documentId: document.id, documentAssociationRole: "secondary" }),
    ]);
    expect(target.foreign.windows.getSnapshot().owned).toEqual([]);
    expect(() => target.foreign.windows.focus(opened.id)).toThrow(expect.objectContaining({ name: "SecurityError" }));

    const app = target.runtime.apps.getApp("com.example.window-owner");
    if (!app) throw new Error("Window owner was not registered in the restored runtime.");
    const secondaryMount = (await import("../../src/SynCloudOS/AppSDK/appRuntimeFacade")).createMountedSynWareRuntime({
      runtime: target.runtime,
      app,
      responderId: `window:${opened.id}:restored-projection`,
      windowControllerId: opened.id,
    });
    activeMounts.push(secondaryMount);
    const secondary = createSynWareContextValue(secondaryMount.runtime);
    expect(secondary.windows.getSnapshot().current).toEqual(expect.objectContaining({
      id: opened.id,
      documentId: document.id,
      documentAssociationRole: "secondary",
    }));
  });
});
