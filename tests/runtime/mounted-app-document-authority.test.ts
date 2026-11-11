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
import { createDragSessionManager } from "../../src/SynCloudOS/Drag";
import { createGFXIdentifierScope } from "../../src/FX/GraphicsFX/identifierAuthority";
import { computeNSEOverlayPosition, computeNSEViewportCornerPosition } from "../../src/NSE/Overlays/computeNSEOverlayPosition";
import { createTestBundle, createTestRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("test cleanup")));
});

function registerApp(runtime: ReturnType<typeof createTestRuntime>, id: string) {
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: id, route: `/${id.split(".").at(-1)}` }));
  const app = runtime.apps.getApp(id)!;
  runtime.responders.register({ id: `application:${id}`, kind: "application", parentId: "workspace", scopeId: `application:${id}` });
  return app;
}

function mountPair() {
  const runtime = createTestRuntime();
  runtimes.push(runtime);
  const app = registerApp(runtime, "com.example.authority-app");
  const victim = registerApp(runtime, "com.example.authority-victim");
  return {
    runtime,
    app,
    victim,
    mount: createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.bundleIdentifier}` }),
    victimMount: createMountedSynWareRuntime({ runtime, app: victim, responderId: `application:${victim.bundleIdentifier}` }),
  };
}

describe("mounted application document authority", () => {
  it("does not let an AppSDK document call supply a forged policy subject", async () => {
    const { runtime, mount } = mountPair();
    runtime.documentStore.registerKind({
      kind: "p10.secret",
      version: 1,
      displayName: "Hidden kind",
      permissions: {
        saveDraft: { public: true },
        getDraft: { requiredCapabilities: ["p10.secret.read"], requiredRoles: ["system"] },
      },
    });
    const subject = {
      user: { id: "attacker", displayName: "Attacker", role: "system", isAuthenticated: true, isAnonymous: false },
      role: "system" as const,
      capabilities: ["*"],
      isAuthenticated: true,
    };
    await runtime.documentStore.saveDraft({ kind: "p10.secret", id: "secret-1", title: "private" }, { subject });
    await expect(mount.runtime.documentStore.getDraft("secret-1", { subject })).rejects.toThrow(/access|policy|capabilit|role/i);
  });

  it("keeps mounted kind registration host-provisioned and collision-safe", async () => {
    const metadata = { kind: "tests.mounted-authority", version: 1, displayName: "Mounted authority" };
    const runtime = createTestRuntime({ trustedDocumentKinds: [metadata] });
    const app = registerApp(runtime, "com.example.syncal");
    const syncalMount = createMountedSynWareRuntime({ runtime, app, responderId: "application:com.example.syncal" });
    const documentStore = syncalMount.runtime.documentStore as unknown as { registerKind?: (value: unknown) => unknown };
    const migration = vi.fn();

    expect(documentStore.registerKind).toBeUndefined();
    expect(() => documentStore.registerKind?.({
      ...metadata,
      displayName: "forged replacement",
      migrations: [{ fromVersion: 1, toVersion: 2, migrate: migration }],
    })).not.toThrow();
    expect(runtime.documentStore.getKind(metadata.kind)).toMatchObject(metadata);
    expect(migration).not.toHaveBeenCalled();
    syncalMount.dispose("kind registration test cleanup");
    await runtime.dispose("kind registration runtime cleanup");
  });

  it("does not replay another application's idempotent draft result", async () => {
    const { runtime, mount } = mountPair();
    runtime.documentStore.registerKind({
      kind: "p10.idempotent",
      version: 1,
      displayName: "Idempotent draft",
      permissions: { saveDraft: { public: true } },
    });
    await runtime.documentStore.saveDraft(
      { kind: "p10.idempotent", id: "victim-draft", title: "victim" },
      { appId: "com.example.authority-victim" },
      { idempotencyKey: "victim-key" },
    );
    await expect(mount.runtime.documentStore.saveDraft(
      { kind: "p10.idempotent", id: "victim-draft", title: "victim" },
      undefined,
      { idempotencyKey: "victim-key" },
    )).rejects.toThrow(/owned|not found|access|application/i);
  });

  it("freezes command authority before a pending declaration can be mutated", async () => {
    const { runtime, mount } = mountPair();
    const responderId = "application:com.example.authority-app";
    const execute = vi.fn(() => "original");
    const declaration = {
      id: "com.example.authority-app.command",
      responderId,
      title: { key: "authority.command", fallback: "Original" },
      payload: { description: "No payload.", parse: (value: unknown) => value === undefined ? { ok: true as const, value: undefined } : { ok: false as const, issues: ["payload"] } },
      scope: "focused" as const,
      defaultKeyBindings: [],
      undo: { kind: "none" as const },
      execute,
    };
    const registration = mount.runtime.commands.register(declaration);
    (declaration as { responderId: string; execute: () => string }).responderId = "application:com.example.authority-victim";
    (declaration as { responderId: string; execute: () => string }).execute = () => "forged";
    const result = await mount.runtime.commands.dispatch("com.example.authority-app.command");
    expect(result).toMatchObject({ status: "executed", responderId });
    expect(execute).toHaveBeenCalledTimes(1);
    registration.dispose();
  });

  it("does not project or accept foreign focus scopes and responders", () => {
    const { runtime, mount } = mountPair();
    runtime.responders.register({ id: "authority-victim:control", kind: "control", parentId: "application:com.example.authority-victim", scopeId: "authority-victim:control" });
    const foreignScope = runtime.focus.openScope({ id: "authority-victim:scope", kind: "modal", parentResponderId: "authority-victim:control", modal: true, trapFocus: true });
    runtime.focus.requestFocus("authority-victim:control");
    expect(mount.runtime.focus.getFocusedResponderId()).toBeNull();
    expect(mount.runtime.focus.isScopeWithin(foreignScope.id, foreignScope.id)).toBe(false);
    expect(() => mount.runtime.focus.openScope({
      id: "authority-app:scope",
      kind: "popover",
      parentScopeId: foreignScope.id,
      parentResponderId: "application:com.example.authority-app",
      restoreResponderId: "authority-victim:control",
      modal: false,
      trapFocus: false,
    })).toThrow(/owned|scope|application/i);
    foreignScope.dispose();
  });

  it("projects only mounted colour pickers and releases picker registrations", () => {
    const { mount, victimMount } = mountPair();
    const removeApp = mount.runtime.colourPanel.registerPicker({ id: "app-picker", label: "App", order: 0, supportedSpaces: ["srgb"] });
    victimMount.runtime.colourPanel.registerPicker({ id: "victim-picker", label: "Victim", order: 0, supportedSpaces: ["srgb"] });
    expect(mount.runtime.colourPanel.getPickers().map(({ id }) => id)).toEqual(["app-picker"]);
    expect(victimMount.runtime.colourPanel.getPickers().map(({ id }) => id)).toEqual(["victim-picker"]);
    removeApp();
    expect(mount.runtime.colourPanel.getPickers()).toEqual([]);
    mount.dispose("picker cleanup");
    expect(victimMount.runtime.colourPanel.getPickers()).toEqual([expect.objectContaining({ id: "victim-picker" })]);
  });

  it("retains the closed document owner and allows only that app to reopen its location", async () => {
    const { mount, victimMount, runtime } = mountPair();
    runtime.documents.registerType({
      id: "authority.document",
      displayName: "Authority document",
      schemaVersion: 1,
      extensions: [],
      mimeTypes: ["application/json"],
      capabilities: { versions: false, conflicts: false },
      autosave: "disabled",
      create: () => ({ value: "new" }),
      read: (value: { value: string }) => value,
      write: (value: { value: string }) => value,
      validate: (value: unknown): value is { value: string } => Boolean(value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string"),
    });
    const location = { kind: "memory" as const, namespace: "com.example.p10", key: "owned" };
    const document = await mount.runtime.workspaceDocuments.newDocument({ typeId: "authority.document", location, initialModel: { value: "owned" } });
    await mount.runtime.workspaceDocuments.saveDocument(document.id);
    await mount.runtime.workspaceDocuments.closeDocument(document.id, "parent-close");
    await expect(victimMount.runtime.workspaceDocuments.openDocument({ typeId: "authority.document", location })).rejects.toThrow(/owned|application|location/i);
    await expect(mount.runtime.workspaceDocuments.openDocument({ typeId: "authority.document", location })).resolves.toMatchObject({ applicationId: "com.example.authority-app" });
  });

  it("exposes a revocable document undo lease rather than the kernel manager", async () => {
    const { mount, runtime } = mountPair();
    runtime.documents.registerType({
      id: "authority.undo",
      displayName: "Authority undo document",
      schemaVersion: 1,
      extensions: [],
      mimeTypes: ["application/json"],
      capabilities: { versions: false, conflicts: false },
      autosave: "disabled",
      create: () => ({ value: "new" }),
      read: (value: { value: string }) => value,
      write: (value: { value: string }) => value,
      validate: (value: unknown): value is { value: string } => Boolean(value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string"),
    });
    const document = await mount.runtime.workspaceDocuments.newDocument({
      typeId: "authority.undo",
      location: { kind: "memory", namespace: "com.example.p10", key: "undo" },
      initialModel: { value: "undo" },
    });
    const lease = mount.runtime.workspaceDocuments.getUndoManager(document.id) as unknown as Record<string, unknown>;
    expect(lease.clear).toBeUndefined();
    expect(lease.dispose).toBeUndefined();
    mount.dispose("undo lease revocation");
    expect(() => lease.canUndo).toThrow(/Abort|revoked|capability/i);
  });

  it("does not publish a document after a non-cooperative adapter completes beyond mount disposal", async () => {
    const { mount, runtime } = mountPair();
    runtime.documents.registerType({
      id: "authority.late",
      displayName: "Late document",
      schemaVersion: 1,
      extensions: [],
      mimeTypes: ["application/json"],
      capabilities: { versions: false, conflicts: false },
      autosave: "disabled",
      create: () => ({ value: "new" }),
      read: (value: { value: string }) => value,
      write: (value: { value: string }) => value,
      validate: (value: unknown): value is { value: string } => Boolean(value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string"),
    });
    let release!: (value: null) => void;
    const pending = new Promise<null>((resolve) => { release = resolve; });
    runtime.documents.registerAdapter({
      id: "p10-late",
      capabilities: { versions: false, delete: false, watch: false, offline: false, atomicConditionalWrite: false },
      supports: (location) => location.kind === "remote",
      read: async () => pending,
      write: async () => { throw new Error("not used"); },
      remove: async () => undefined,
      list: async () => [],
      listVersions: async () => [],
      readVersion: async () => null,
    });
    const operation = mount.runtime.workspaceDocuments.newDocument({
      typeId: "authority.late",
      location: { kind: "remote", url: "https://p10.invalid/late" },
      initialModel: { value: "late" },
    });
    mount.dispose("late document disposal");
    release(null);
    await expect(operation).rejects.toMatchObject({ name: expect.stringMatching(/Abort|Unavailable|Error/) });
    expect(runtime.documents.openDocuments.some(({ type }) => type.id === "authority.late")).toBe(false);
  });

  it("owns image and tracking registrations through the mount lifetime", () => {
    const { runtime, mount } = mountPair();
    const imageRelease = vi.fn();
    const image = Object.freeze({
      state: "ready" as const,
      revision: 0,
      src: "blob:p10",
      intrinsicSize: { width: 1, height: 1 },
      density: 1,
      sourceOrientation: null,
      sourceICCProfile: null,
      accessibleLabel: "Authority",
      renderingMode: "original" as const,
      tintColour: null,
      capInsets: null,
      resizingMode: "stretch" as const,
      ready: Promise.resolve(),
      subscribe: () => () => undefined,
      release: imageRelease,
    });
    vi.spyOn(runtime.images, "load").mockReturnValue(image);
    const trackingRelease = vi.fn();
    vi.spyOn(runtime.tracking, "register").mockReturnValue(Object.freeze({ id: "tracking:p10", disposed: false, dispose: trackingRelease }));
    mount.runtime.images.load({ source: { kind: "app-asset", path: "p10.png" } });
    mount.runtime.tracking.register({ ownerId: "pointer", root: {}, element: {}, options: [] });
    mount.dispose("resource cleanup");
    expect(imageRelease).toHaveBeenCalledTimes(1);
    expect(trackingRelease).toHaveBeenCalledTimes(1);
  });

  it("revokes graphics identifier issuers with the mounted capability", () => {
    const { mount } = mountPair();
    const issuer = mount.runtime.images.createGraphicsIdentifierIssuer();
    expect(() => createGFXIdentifierScope(issuer)).not.toThrow();
    mount.dispose("graphics issuer cleanup");
    expect(() => createGFXIdentifierScope(issuer)).toThrow(/revoked|capability|live/i);
  });

  it("clears the kernel-owned drag board during drag manager disposal without depending on a revoked source lease", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const clears: AbortSignal[] = [];
    const board = {
      write: vi.fn(async () => undefined),
      clear: vi.fn((signal?: AbortSignal) => { if (signal) clears.push(signal); }),
    };
    const drag = createDragSessionManager({
      runtimeId: runtime.runtimeId,
      ownerToken: {} as never,
      signal: new AbortController().signal,
      pasteboard: board as never,
      randomUUID: () => "com.example.p10",
    });
    drag.begin({ source: { appId: "com.example.p10", windowId: "com.example.p10", responderId: "com.example.p10" }, operations: ["copy"], representations: [{ type: "text/plain", value: "com.example.p10" }] });
    drag.dispose();
    await Promise.resolve();
    expect(board.clear).toHaveBeenCalledTimes(1);
    expect(clears).toEqual([]);
  });

  it("handles synchronous injected overlay schedulers without phantom handles or TDZ errors", async () => {
    const anchor = document.createElement("button");
    const floating = document.createElement("div");
    document.body.append(anchor, floating);
    const clearOverlay = vi.fn();
    const schedule = vi.fn((callback: () => void) => { callback(); return "overlay-sync"; });
    const dispose = computeNSEOverlayPosition({
      anchor,
      floating,
      scheduler: { setTimeout: schedule, clearTimeout: clearOverlay },
    });
    window.dispatchEvent(new Event("resize"));
    expect(schedule).toHaveBeenCalled();
    dispose();
    expect(clearOverlay).not.toHaveBeenCalledWith("overlay-sync");
    anchor.remove(); floating.remove();
  });

  it("does not retain ancestor resize or scroll listeners for a viewport-corner surface", () => {
    const anchor = document.createElement("button");
    const floating = document.createElement("div");
    document.body.append(anchor, floating);
    const windowAdd = vi.spyOn(window, "addEventListener");
    const anchorAdd = vi.spyOn(anchor, "addEventListener");
    const floatingAdd = vi.spyOn(floating, "addEventListener");

    const dispose = computeNSEViewportCornerPosition({
      anchor,
      floating,
      insetBlockStart: 0,
      insetInlineEnd: 0,
      availableInlineSize: 100,
      availableBlockSize: 100,
    });

    const viewportEvents = ([type]: [string, ...unknown[]]) => type === "resize" || type === "scroll";
    expect(windowAdd.mock.calls.some(viewportEvents)).toBe(false);
    expect(anchorAdd.mock.calls.some(viewportEvents)).toBe(false);
    expect(floatingAdd.mock.calls.some(viewportEvents)).toBe(false);
    dispose();
    anchor.remove();
    floating.remove();
  });
});
