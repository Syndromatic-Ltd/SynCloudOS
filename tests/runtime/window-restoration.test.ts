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
import type {
  WindowRestorationPersistencePort,
  WindowRestorationSnapshot,
} from "../../src/SynCloudOS/Windows";
import { resolveWindowPersistenceNamespace } from "../../src/SynCloudOS/Windows";
import {
  createWindowTestDependencies,
  standardWindow,
} from "../fixtures/windowTestDependencies";

function memoryPersistence(): WindowRestorationPersistencePort & { readonly values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    read: vi.fn((key) => values.get(key) ?? null),
    write: vi.fn((key, value) => { values.set(key, value); }),
  };
}

describe("window workspace restoration", () => {
  it("uses the exact durable default namespace and preserves supplied whitespace", () => {
    expect(resolveWindowPersistenceNamespace()).toBe("syncloudos");
    expect(resolveWindowPersistenceNamespace("  tenant windows  ")).toBe("  tenant windows  ");
    expect(() => resolveWindowPersistenceNamespace("")).toThrow(/empty/i);
  });

  it("round-trips every durable field without runtime identity", async () => {
    const harness = createWindowTestDependencies({
      id: "runtime:windows-a",
      namespace: "tests.windows",
      installationId: "installation-a",
      now: () => 123_456,
    });
    await harness.createDocument("document-a");
    const controller = harness.manager.create(standardWindow("window-a", {
      workspaceId: "workspace-main",
      applicationSessionId: "session-memo-2",
      documentId: "document-a",
      documentAssociationRole: "primary",
      representedDocument: {
        documentId: "document-a",
        displayName: "A note",
        associationRole: "primary",
        location: null,
        edited: true,
      },
      toolbar: {
        identifier: "memo.toolbar",
        visible: true,
        displayMode: "icon-and-label",
        sizeMode: "small",
        selectedItemIdentifier: "share",
      },
      pinned: true,
      maximumSize: { width: 1_200, height: 900 },
    }));
    await harness.manager.open(controller.id);
    harness.manager.zoom(controller.id);

    const snapshot = harness.manager.createRestorationSnapshot();

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      namespace: "tests.windows",
      installationId: "installation-a",
      capturedAtEpochMs: 123_456,
      keyWindowControllerId: "window-a",
      mainWindowControllerId: "window-a",
      windows: [{
        windowControllerId: "window-a",
        workspaceId: "workspace-main",
        applicationSessionId: "session-memo-2",
        documentId: "document-a",
        documentAssociationRole: "primary",
        pinned: true,
        wasZoomed: true,
        normalBounds: { x: 80, y: 60, width: 720, height: 520 },
        representedDocument: { displayName: "A note", edited: true },
        toolbar: { identifier: "memo.toolbar", selectedItemIdentifier: "share" },
      }],
    });
    expect(JSON.stringify(snapshot)).not.toContain("runtime:windows-a");
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    await harness.cleanup();
  });

  it("persists once and restores into a later runtime for the same installation", async () => {
    const persistence = memoryPersistence();
    const first = createWindowTestDependencies({
      id: "runtime:first",
      namespace: "tests.restart",
      installationId: "installation-stable",
      persistence,
    });
    const source = first.manager.create(standardWindow("stable-window"));
    await first.manager.open(source.id);
    first.manager.saveRestorationSnapshot();
    await first.cleanup();

    const second = createWindowTestDependencies({
      id: "runtime:second",
      namespace: "tests.restart",
      persistence,
    });
    const report = await second.manager.restorePersistedWorkspace();

    expect(report.restoredWindowControllerIds).toEqual(["stable-window"]);
    expect(second.manager.select("stable-window").record.runtimeId).toBe("runtime:second");
    expect(second.manager.select("stable-window").record.state).toBe("open");
    expect(persistence.write).toHaveBeenCalledWith("windows.workspace-v1", expect.any(Object));
    await second.cleanup();
  });

  it("validates recreated application windows against their captured restoration ticket", async () => {
    // Regression: the ticket map registration for newly created restoration
    // windows was dropped, so the post-open validation received `null` and
    // silently bypassed the application-epoch check for every recreated
    // app-owned window.
    const persistence = memoryPersistence();
    const first = createWindowTestDependencies({
      id: "runtime:first",
      namespace: "tests.ticket",
      installationId: "installation-ticket",
      persistence,
    });
    const source = first.manager.create(standardWindow("ticket-window"));
    await first.manager.open(source.id);
    first.manager.saveRestorationSnapshot();
    await first.cleanup();

    const second = createWindowTestDependencies({
      id: "runtime:second",
      namespace: "tests.ticket",
      installationId: "installation-ticket",
      persistence,
    });
    const validateSpy = vi.spyOn(second.documents, "validateApplicationMutation");
    const report = await second.manager.restorePersistedWorkspace();

    expect(report.restoredWindowControllerIds).toEqual(["ticket-window"]);
    expect(report.reusedWindowControllerIds).toEqual([]);
    expect(report.failures).toEqual([]);
    const capturedTickets = validateSpy.mock.calls.map(([ticket]) => ticket);
    // The post-open filter consults the ticket map for the recreated window;
    // its call must receive the same non-null ticket captured during
    // restoration, never `null`.
    expect(capturedTickets.length).toBeGreaterThan(1);
    expect(capturedTickets[capturedTickets.length - 1]).not.toBeNull();
    expect(capturedTickets[capturedTickets.length - 1]).toBe(capturedTickets[0]);
    await second.cleanup();
  });

  it("rejects a foreign namespace or installation before any mutation", async () => {
    const source = createWindowTestDependencies({ namespace: "tests.source", installationId: "installation-a" });
    source.manager.create(standardWindow("source-window"));
    const snapshot = source.manager.createRestorationSnapshot();

    const wrongNamespace = createWindowTestDependencies({ namespace: "tests.other", installationId: "installation-a" });
    await expect(wrongNamespace.manager.restoreWorkspace(snapshot)).rejects.toThrow(/namespace/i);
    expect(wrongNamespace.manager.diagnostics().controllerCount).toBe(0);

    const wrongInstallation = createWindowTestDependencies({ namespace: "tests.source", installationId: "installation-b" });
    await expect(wrongInstallation.manager.restoreWorkspace(snapshot)).rejects.toThrow(/installation/i);
    expect(wrongInstallation.manager.diagnostics().controllerCount).toBe(0);

    await Promise.all([source.cleanup(), wrongNamespace.cleanup(), wrongInstallation.cleanup()]);
  });

  it.each([
    ["duplicate window IDs", (snapshot: any) => {
      snapshot.windows.push({ ...snapshot.windows[0], restorationKey: "second-key" });
    }],
    ["duplicate restoration keys", (snapshot: any) => {
      snapshot.windows.push({ ...snapshot.windows[0], windowControllerId: "second-id" });
    }],
    ["relationship cycles", (snapshot: any) => {
      snapshot.windows.push({
        ...snapshot.windows[0],
        windowControllerId: "second-id",
        restorationKey: "second-key",
        role: "modal",
        level: "modal",
        parentWindowControllerId: snapshot.windows[0].windowControllerId,
      });
      snapshot.windows[0].role = "modal";
      snapshot.windows[0].level = "modal";
      snapshot.windows[0].parentWindowControllerId = "second-id";
    }],
    ["non-finite geometry", (snapshot: any) => {
      snapshot.windows[0].normalBounds.width = Number.NaN;
    }],
    ["malformed serialisable values", (snapshot: any) => {
      snapshot.windows[0].contentRestorationState = { invalid: undefined };
    }],
  ])("validates %s for the whole snapshot before creating controllers", async (_label, corrupt) => {
    const source = createWindowTestDependencies({ namespace: "tests.validation", installationId: "installation-a" });
    source.manager.create(standardWindow("source-window"));
    const snapshot = JSON.parse(JSON.stringify(source.manager.createRestorationSnapshot()));
    corrupt(snapshot);
    const target = createWindowTestDependencies({ namespace: "tests.validation", installationId: "installation-a" });

    await expect(target.manager.restoreWorkspace(snapshot)).rejects.toThrow();
    expect(target.manager.diagnostics().controllerCount).toBe(0);

    await Promise.all([source.cleanup(), target.cleanup()]);
  });

  it("reports missing content and documents per window without losing unrelated windows", async () => {
    const source = createWindowTestDependencies({ namespace: "tests.partial", installationId: "installation-a" });
    source.manager.create(standardWindow("good"));
    source.manager.create(standardWindow("missing-content", {
      content: { rendererId: "not-installed", parameters: null },
    }));
    source.manager.create(standardWindow("missing-document", {
      documentId: null,
      documentAssociationRole: null,
    }));
    const snapshot = JSON.parse(JSON.stringify(source.manager.createRestorationSnapshot())) as any;
    const missingDocument = snapshot.windows.find((entry: any) => entry.windowControllerId === "missing-document");
    missingDocument.documentId = "document-that-is-not-open";
    missingDocument.documentKind = "standard";
    missingDocument.documentAssociationRole = "primary";
    missingDocument.representedDocument = {
      documentId: "document-that-is-not-open",
      displayName: "Missing",
      associationRole: "primary",
      location: null,
      edited: false,
    };
    const target = createWindowTestDependencies({ namespace: "tests.partial", installationId: "installation-a" });

    const report = await target.manager.restoreWorkspace(snapshot);

    expect(report.restoredWindowControllerIds).toEqual(["good"]);
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ windowControllerId: "missing-content", reason: "content-unavailable" }),
      expect.objectContaining({ windowControllerId: "missing-document", reason: "document-unavailable" }),
    ]));
    expect(target.manager.select("good").record.state).toBe("open");
    await Promise.all([source.cleanup(), target.cleanup()]);
  });

  it("migrates content before creation and passes the caller signal unchanged through restore and load", async () => {
    const source = createWindowTestDependencies({ namespace: "tests.migration", installationId: "installation-a" });
    source.manager.create(standardWindow("migrated", {
      content: { rendererId: "test-window", parameters: { version: 1 } },
    }));
    const snapshot = JSON.parse(JSON.stringify(source.manager.createRestorationSnapshot())) as WindowRestorationSnapshot;
    const restoreSignals: AbortSignal[] = [];
    const loadSignals: AbortSignal[] = [];
    const target = createWindowTestDependencies({
      namespace: "tests.migration",
      installationId: "installation-a",
      contentRestore: vi.fn(async ({ descriptor, signal }) => {
        restoreSignals.push(signal);
        return {
          descriptor: { ...descriptor, parameters: { version: 2 } },
          state: { migrated: true },
        };
      }),
      contentFactory: (descriptor, windowControllerId) => ({
        mountKey: `migrated:${windowControllerId}`,
        responderId: `control:${windowControllerId}:content`,
        load: vi.fn(async ({ signal }) => { loadSignals.push(signal); }),
        prepareClose: vi.fn(async () => ({ status: "ready" as const, token: null, commit: vi.fn(), rollback: vi.fn() })),
        unload: vi.fn(),
        dispose: vi.fn(),
      }),
    });
    const controller = new AbortController();

    await target.manager.restoreWorkspace(snapshot, controller.signal);

    expect(restoreSignals).toEqual([controller.signal]);
    expect(loadSignals).toEqual([controller.signal]);
    expect(target.manager.select("migrated").record.content.parameters).toEqual({ version: 2 });
    expect(target.manager.createRestorationSnapshot().windows[0]?.contentRestorationState).toEqual({ migrated: true });
    await Promise.all([source.cleanup(), target.cleanup()]);
  });

  it("uses injected namespace, installation, clock and ID ports and de-duplicates reruns by restoration key", async () => {
    const ids = vi.fn((kind: string) => `${kind}:from-port`);
    const harness = createWindowTestDependencies({
      namespace: "  preserved namespace  ",
      installationId: null,
      now: () => 999,
      idFactory: ids,
    });
    expect(harness.manager.createRestorationSnapshot()).toMatchObject({
      namespace: "  preserved namespace  ",
      installationId: "installation:from-port",
      capturedAtEpochMs: 999,
    });
    expect(ids).toHaveBeenCalledWith("installation");

    const source = createWindowTestDependencies({
      namespace: "  preserved namespace  ",
      installationId: "installation:from-port",
    });
    source.manager.create(standardWindow("stable-id"));
    const snapshot = source.manager.createRestorationSnapshot();
    const first = await harness.manager.restoreWorkspace(snapshot);
    const second = await harness.manager.restoreWorkspace(snapshot);
    expect(first.restoredWindowControllerIds).toEqual(["stable-id"]);
    expect(second.reusedWindowControllerIds).toEqual(["stable-id"]);
    expect(harness.manager.diagnostics().controllerCount).toBe(1);

    await Promise.all([source.cleanup(), harness.cleanup()]);
  });
});
