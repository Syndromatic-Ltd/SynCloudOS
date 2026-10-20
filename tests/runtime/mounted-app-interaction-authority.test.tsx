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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSCOS, type SCOSFacade } from "../../src/SynCloudOS/AppSDK";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import {
  FocusScope,
  ResponderScope,
  SynCloudOSProvider,
  SynCloudOSRuntimeContext,
  useCommandRegistration,
  useKernelSynCloudOS,
  useRuntimeNSEMenuPort,
  useRuntimeNSEOverlayPort,
} from "../../src/SynCloudOSReact";
import { createApplicationWindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { standardWindow } from "../fixtures/windowTestDependencies";
import { noteType } from "../fixtures/noteDocumentType";
import type { WindowPresentation } from "../../src/SynCloudOS/Windows";
import { createTestBundle, createTestRuntime } from "./helpers";

const siteBranding = Object.freeze({
  name: "Mounted app fixture", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null,
  compactLogoUrl: null, logoAlt: "Mounted app fixture",
});

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
const noPayload = {
  description: "No payload.",
  parse: (value: unknown) => value === undefined
    ? { ok: true as const, value: undefined }
    : { ok: false as const, issues: ["No payload is accepted."] },
};

afterEach(async () => {
  cleanup();
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose("test cleanup")));
});

function registerApp(runtime: ReturnType<typeof createTestRuntime>, id = "hostile-app", bundleOverrides: Parameters<typeof createTestBundle>[1] = {}) {
  runtime.apps.registerBundle(createTestBundle({ id, route: `/${id}` }, bundleOverrides));
  const app = runtime.apps.getApp(id)!;
  runtime.responders.register({ id: `application:${id}`, kind: "application", parentId: "workspace", scopeId: `application:${id}` });
  return app;
}

function MountedProbe({ commandExecuted }: { readonly commandExecuted: () => void }) {
  const app = useSCOS();
  const rawContext = React.useContext(SynCloudOSRuntimeContext);
  let rawHook: unknown = null;
  try {
    rawHook = useKernelSynCloudOS();
  } catch (error) {
    rawHook = error;
  }
  const overlay = useRuntimeNSEOverlayPort(`application:${app.app.id}`);
  const menu = useRuntimeNSEMenuPort();
  useCommandRegistration({
    id: `${app.app.id}.probe`,
    responderId: `control:${app.app.id}`,
    title: { key: `${app.app.id}.probe`, fallback: "Probe command" },
    payload: noPayload,
    scope: "focused",
    defaultKeyBindings: [],
    undo: { kind: "none" },
    validate: () => ({ enabled: true }),
    execute: commandExecuted,
  });
  return (
    <ResponderScope
      responderId={`control:${app.app.id}`}
      kind="control"
      parentResponderId={`application:${app.app.id}`}
      scopeId={`control:${app.app.id}`}
    >
      <FocusScope
        scopeId={`focus:${app.app.id}`}
        kind="modal"
        parentResponderId={`control:${app.app.id}`}
        modal
        trapFocus
      >
        <button type="button" onClick={() => { void menu.commands.dispatch(`${app.app.id}.probe`); }}>
          App scoped command
        </button>
        <output
          data-testid="app-boundary"
          data-raw-context={rawContext === null ? "null" : "present"}
          data-kernel-hook={rawHook instanceof Error ? "denied" : "present"}
          data-overlay-document={overlay.environment.browser.getDocument() === document ? "real" : "missing"}
          data-overlay-window={overlay.environment.browser.getWindow() === window ? "real" : "missing"}
          data-overlay-work-area={`${overlay.environment.workArea.getSnapshot().width}x${overlay.environment.workArea.getSnapshot().height}`}
          data-overlay-viewport={`${overlay.environment.visualViewport.getSnapshot()?.width ?? 0}x${overlay.environment.visualViewport.getSnapshot()?.height ?? 0}`}
        />
      </FocusScope>
    </ResponderScope>
  );
}

function GenerationProbe({ onGeneration, label = "Replacement generation" }: {
  readonly onGeneration: (context: SCOSFacade) => void;
  readonly label?: string;
}) {
  const context = useSCOS();
  React.useLayoutEffect(() => { onGeneration(context); }, [context, onGeneration]);
  return <p>{label}</p>;
}

function CanonicalDocumentChildProbe({ documentId, onComplete }: {
  readonly documentId: string;
  readonly onComplete: () => void;
}) {
  const app = useSCOS();
  const responderId = `document:${documentId}:editor:body`;
  const execute = React.useCallback(() => undefined, []);
  const declaration = React.useMemo(() => ({
    id: `${app.app.id}.document-child-probe`,
    responderId,
    title: { key: `${app.app.id}.document-child-probe`, fallback: "Document child probe" },
    payload: noPayload,
    scope: "focused" as const,
    defaultKeyBindings: [],
    undo: { kind: "none" as const },
    validate: () => ({ enabled: true }),
    execute,
  }), [app.app.id, execute, responderId]);
  useCommandRegistration(declaration);
  return (
    <ResponderScope
      responderId={responderId}
      kind="control"
      parentResponderId={`document:${documentId}`}
      scopeId={`document:${documentId}`}
      undoOwner={{ kind: "document", id: documentId }}
      diagnosticsLabel="Canonical document child probe"
    >
      <button type="button" onClick={() => {
        app.responders.requestFocus(responderId);
        onComplete();
      }}>
        Focus canonical document child
      </button>
    </ResponderScope>
  );
}

describe("mounted application context and interaction authority", () => {
  it("preserves a child-owned ref when an app focus scope attaches asChild authority", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime, "focus-ref-app");
    const childRef = vi.fn<(element: HTMLDivElement | null) => void>();
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={siteBranding}>
        <SynWareRuntimeMount runtime={runtime} app={app} responderId={`application:${app.id}`}>
          <FocusScope asChild scopeId="focus:owned-ref" kind="menu" parentResponderId={`application:${app.id}`}>
            <div ref={childRef} data-testid="focus-ref-host" />
          </FocusScope>
        </SynWareRuntimeMount>
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );

    const host = await screen.findByTestId("focus-ref-host");
    expect(childRef).toHaveBeenCalledWith(host);
    view.unmount();
    expect(childRef).toHaveBeenLastCalledWith(null);
  });

  it("projects immutable app-local observations and keeps revoked tombstones detached", () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime);
    runtime.apps.registerBundle(createTestBundle({ id: "victim-app", route: "/victim-app" }));
    const mount = createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.id}` });
    const scoped = mount.runtime;

    const state = scoped.state.getSnapshot();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.loginServices)).toBe(true);
    expect((state.loginServices as Record<string, unknown>).synId).toBeUndefined();
    expect(state).not.toHaveProperty("responsive");
    const presentation = scoped.presentation.getSnapshot();
    expect(Object.isFrozen(presentation)).toBe(true);
    const originalWidth = presentation.contentBounds.width;
    try { (presentation.contentBounds as { width: number }).width = originalWidth + 1; } catch { /* frozen projections reject mutation in strict mode */ }
    expect(scoped.presentation.getSnapshot().contentBounds.width).toBe(originalWidth);

    const foreign = scoped.catalog.getApp("victim-app");
    expect(foreign).toEqual(expect.objectContaining({ id: "victim-app" }));
    try { (foreign as { id: string }).id = "hostile-app"; } catch { /* immutable public descriptor */ }
    expect(scoped.catalog.getApp("victim-app")?.id).toBe("victim-app");
    expect(Reflect.get(scoped.locale as object, "setLocale")).toBeUndefined();
    expect(Reflect.get(scoped.locale as object, "clearLocale")).toBeUndefined();
    expect(Reflect.get(scoped.workspaceDocuments as object, "hasAdapter")).toBeUndefined();
    expect(Reflect.get(scoped.workspaceDocuments as object, "registerAdapter")).toBeUndefined();
    expect(() => scoped.events.subscribe("*", () => undefined)).toThrow(/wildcard/i);

    const received: unknown[] = [];
    const unsubscribe = scoped.events.subscribe("app.lifecycle", (event) => received.push(event));
    runtime.events.publish("app.lifecycle", { appId: app.id, nested: { safe: true } });
    runtime.events.publish("app.lifecycle", { appId: "victim-app", nested: { safe: false } });
    unsubscribe();
    expect(received).toHaveLength(1);
    expect(Object.isFrozen(received[0])).toBe(true);
    expect(Object.isFrozen((received[0] as { payload: object }).payload)).toBe(true);

    const report = scoped.diagnostics.getReport() as Record<string, unknown>;
    expect(report).toEqual(expect.objectContaining({ appId: app.id, responderId: `application:${app.id}`, live: true }));
    expect(report.snapshot).toBeUndefined();
    expect(report.responders).toBeUndefined();
    const tombstone = scoped.state.getSnapshot();
    const tombstonePresentation = scoped.presentation.getSnapshot();
    mount.dispose("projection tombstone");
    expect(scoped.state.getSnapshot()).toBe(tombstone);
    expect(scoped.presentation.getSnapshot()).toBe(tombstonePresentation);
  });

  it("routes commands through an owned responder lease and rejects global, foreign, and stale tuples", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime, "command-app");
    const victim = registerApp(runtime, "victim-app");
    runtime.responders.register({ id: "control:command-app", kind: "control", parentId: `application:${app.id}`, scopeId: "command-app" });
    runtime.responders.register({ id: "control:victim-app", kind: "control", parentId: `application:${victim.id}`, scopeId: "victim-app" });
    const mount = createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.id}` });
    const execute = vi.fn();
    const registration = mount.runtime.commands.register({
      id: "command-app.probe",
      responderId: "control:command-app",
      title: { key: "command-app.probe", fallback: "Probe" },
      payload: noPayload,
      scope: "focused",
      defaultKeyBindings: [],
      undo: { kind: "none" },
      validate: () => ({ enabled: true }),
      execute,
    });
    expect(() => mount.runtime.commands.register({
      id: "document.elevate",
      responderId: "control:command-app",
      title: { key: "document.elevate", fallback: "Elevate" },
      payload: noPayload,
      scope: "focused",
      defaultKeyBindings: [],
      undo: { kind: "none" },
      execute,
    })).toThrow(/reserved/i);

    runtime.focus.requestFocus("control:victim-app");
    await expect(mount.runtime.commands.dispatch("session.logOut")).resolves.toMatchObject({ status: "denied" });
    await expect(mount.runtime.commands.validate("session.logOut")).resolves.toMatchObject({ denied: true, enabled: false });
    const presentations = await mount.runtime.commands.validateMany([
      { key: "logout", commandId: "session.logOut" },
      { key: "own", commandId: "command-app.probe" },
    ]);
    expect(presentations.get("logout")).toEqual(expect.objectContaining({ denied: true }));
    expect(presentations.get("own")).toEqual(expect.objectContaining({ enabled: true, responderId: "control:command-app" }));
    expect(() => mount.runtime.commands.prepareDispatch("command-app.probe", { appId: "victim-app" })).toThrow(/another application/i);
    await expect(mount.runtime.commands.dispatch("command-app.probe")).resolves.toMatchObject({ status: "executed", responderId: "control:command-app" });
    expect(execute).toHaveBeenCalledTimes(1);

    const prepared = mount.runtime.commands.prepareDispatch("command-app.probe");
    expect(prepared).toMatchObject({ status: "accepted" });
    if (prepared instanceof Promise || prepared.status !== "accepted") throw new Error("Expected synchronous command acceptance.");
    mount.dispose("stale command tuple");
    const replacement = createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.id}` });
    const replacementRegistration = replacement.runtime.commands.register({
      id: "command-app.probe",
      responderId: "control:command-app",
      title: { key: "command-app.probe", fallback: "Probe" },
      payload: noPayload,
      scope: "focused",
      defaultKeyBindings: [],
      undo: { kind: "none" },
      validate: () => ({ enabled: true }),
      execute,
    });
    await expect(replacement.runtime.commands.dispatch("command-app.probe", undefined, { acceptance: prepared.acceptance })).resolves.toMatchObject({ status: "cancelled" });
    replacementRegistration.dispose();
    registration.dispose();
    replacement.dispose();
  });

  it("allows mounted command and focus authority beneath an app-owned canonical document while rejecting a foreign document tree", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime, "document-child-owner");
    const victim = registerApp(runtime, "document-child-victim");
    runtime.documents.registerType(noteType);
    const ownedDocument = await runtime.documents.newDocument({
      documentId: "owned-canonical-document",
      typeId: noteType.id,
      applicationId: app.id,
    });
    const foreignDocument = await runtime.documents.newDocument({
      documentId: "foreign-canonical-document",
      typeId: noteType.id,
      applicationId: victim.id,
    });
    // Canonical document -> owning application joins app workflow providers;
    // the document undo owner and foreign descendant fences remain distinct.
    expect(runtime.responders.get(`document:${ownedDocument.id}`)).toMatchObject({
      kind: "document",
      parentId: `application:${app.id}`,
      scopeId: "root",
      undoOwner: { kind: "document", id: ownedDocument.id },
      diagnosticsLabel: `Document ${ownedDocument.id}`,
    });
    expect(runtime.responders.get(`document:${foreignDocument.id}`)).toMatchObject({
      kind: "document",
      parentId: `application:${victim.id}`,
      scopeId: "root",
      undoOwner: { kind: "document", id: foreignDocument.id },
      diagnosticsLabel: `Document ${foreignDocument.id}`,
    });

    const completed = vi.fn();
    render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={siteBranding}>
          <SynWareRuntimeMount runtime={runtime} app={app} responderId={`application:${app.id}`}>
            <CanonicalDocumentChildProbe documentId={ownedDocument.id} onComplete={completed} />
          </SynWareRuntimeMount>
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );
    const button = await screen.findByRole("button", { name: "Focus canonical document child" });
    expect(runtime.responders.get(`document:${ownedDocument.id}:editor:body`)).toMatchObject({
      kind: "control",
      parentId: `document:${ownedDocument.id}`,
    });
    fireEvent.click(button);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(runtime.focus.getFocusedResponderId()).toBe(`document:${ownedDocument.id}:editor:body`);

    const foreignChild = runtime.responders.register({
      id: `document:${foreignDocument.id}:editor:body`,
      kind: "control",
      parentId: `document:${foreignDocument.id}`,
      scopeId: `document:${foreignDocument.id}`,
      undoOwner: { kind: "document", id: foreignDocument.id },
    });
    const directMount = createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.id}` });
    runtime.focus.setActiveAnchors({
      ...runtime.focus.getActiveAnchors(),
      applicationResponderId: `application:${app.id}`,
    });
    expect(() => directMount.runtime.focus.requestFocus(`document:${foreignDocument.id}:editor:body`)).toThrow(/owned responders/i);
    directMount.dispose("foreign canonical document descendant test");
    foreignChild.dispose();
  });

  it("keeps colour mutations bound to the issuing target lease across replacement and disposal", () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime, "colour-app");
    const victim = registerApp(runtime, "victim-app");
    runtime.responders.register({ id: "colour:app", kind: "control", parentId: `application:${app.id}`, scopeId: "colour:app" });
    runtime.responders.register({ id: "colour:victim", kind: "control", parentId: `application:${victim.id}`, scopeId: "colour:victim" });
    const mount = createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.id}` });
    const victimMount = createMountedSynWareRuntime({ runtime, app: victim, responderId: `application:${victim.id}` });
    const appTarget = {
      id: "app-well",
      responderId: "colour:app",
      read: () => "#000000",
      preview: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    };
    const victimTarget = {
      id: "victim-well",
      responderId: "colour:victim",
      read: () => "#ffffff",
      preview: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    };
    mount.runtime.colourPanel.activateTarget(appTarget);
    mount.runtime.colourPanel.preview("#112233", "pointer");
    victimMount.runtime.colourPanel.activateTarget(victimTarget);
    for (const mutation of [
      () => mount.runtime.colourPanel.open(),
      () => mount.runtime.colourPanel.close("programmatic"),
      () => mount.runtime.colourPanel.preview("#334455", "pointer"),
      () => mount.runtime.colourPanel.commit("#334455", "pointer"),
      () => mount.runtime.colourPanel.cancel("programmatic"),
      () => mount.runtime.colourPanel.addRecent("#334455"),
      () => mount.runtime.colourPanel.setSwatches(["#334455"]),
    ]) expect(mutation).toThrow(/lease|stale/i);
    victimMount.runtime.colourPanel.preview("#abcdef", "pointer");
    expect(victimTarget.preview).toHaveBeenCalledWith(expect.objectContaining({ currentCSS: "#abcdef" }));
    mount.dispose("stale colour target");
    expect(victimMount.runtime.colourPanel.getSnapshot().activeTargetId).toBe("victim-well");
    victimMount.dispose();
  });

  it("keeps a departing colour panel's presentation read safe without exposing another app's target", () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime, "outgoing-colour-app");
    const victim = registerApp(runtime, "outgoing-colour-victim");
    runtime.responders.register({ id: "colour:outgoing", kind: "control", parentId: `application:${app.id}`, scopeId: "colour:outgoing" });
    runtime.responders.register({ id: "colour:outgoing-victim", kind: "control", parentId: `application:${victim.id}`, scopeId: "colour:outgoing-victim" });
    const mount = createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.id}` });
    const victimMount = createMountedSynWareRuntime({ runtime, app: victim, responderId: `application:${victim.id}` });

    mount.runtime.colourPanel.activateTarget({
      id: "outgoing-colour-well",
      responderId: "colour:outgoing",
      read: () => "#000000",
      preview: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    });
    victimMount.runtime.colourPanel.activateTarget({
      id: "victim-colour-well",
      responderId: "colour:outgoing-victim",
      read: () => "#ffffff",
      preview: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
    });
    expect(mount.runtime.colourPanel.getSnapshot().activeTargetId).toBeNull();

    mount.dispose("outgoing colour presentation");

    expect(() => mount.runtime.colourPanel.getSnapshot()).not.toThrow();
    expect(mount.runtime.colourPanel.getSnapshot()).toMatchObject({
      open: false,
      activeTargetId: null,
      activePickerId: null,
      pickers: [],
    });
    expect(() => mount.runtime.colourPanel.open()).toThrow(/stale|revoked/i);
    victimMount.dispose();
  });

  it("releases every animation owner through one idempotent mount-owned wrapper", () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime, "animation-app");
    const mount = createMountedSynWareRuntime({ runtime, app, responderId: `application:${app.id}` });
    const rawRelease = vi.fn();
    const rawLease = Object.freeze({ appId: app.id, viewId: "view", epoch: 1, release: rawRelease });
    vi.spyOn(runtime.animations, "acquireOwner").mockReturnValue(rawLease as never);
    const lease = mount.runtime.animations.acquireOwner({ appId: app.id, viewId: "view" });
    lease.release("caller release");
    lease.release("caller release twice");
    mount.dispose("animation mount disposed");
    expect(rawRelease).toHaveBeenCalledTimes(1);
  });

  it("drops the stale same-ID stage generation before rendering its replacement in StrictMode", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime, "replace-app");
    const generations: SCOSFacade[] = [];
    const frame = (key: string) => (
      <React.StrictMode>
        <SynCloudOSProvider runtime={runtime}>
          <HostSiteBrandingProvider value={siteBranding}>
          <SynWareRuntimeMount key={key} runtime={runtime} app={app} responderId={`application:${app.id}`}>
            <GenerationProbe onGeneration={(context) => { generations.push(context); }} />
          </SynWareRuntimeMount>
          </HostSiteBrandingProvider>
        </SynCloudOSProvider>
      </React.StrictMode>
    );
    const view = render(frame("first"));
    await screen.findByText("Replacement generation");
    const stale = generations[0] ?? generations.at(-1)!;
    runtime.apps.registerBundle(createTestBundle({ id: app.id, route: "/replace-app-next" }));
    view.rerender(frame("replacement"));
    await waitFor(() => expect(generations.length).toBeGreaterThan(2));
    const fresh = generations.at(-1)!;
    expect(fresh).not.toBe(stale);
    expect(() => stale.drag.endpoint()).toThrow(/Runtime transfer authority is no longer live/);
    expect(fresh.drag.endpoint()).toEqual(expect.objectContaining({ appId: app.id }));
    view.unmount();
    expect(() => fresh.drag.endpoint()).toThrow(/Runtime transfer authority is no longer live/);
  });

  it("masks the kernel context while retaining the system kernel outside a stage app", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const app = registerApp(runtime);
    const commandExecuted = vi.fn();
    function SystemProbe() {
      const kernel = useKernelSynCloudOS();
      return <output data-testid="system-kernel" data-runtime-id={kernel.runtimeId} />;
    }

    render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={siteBranding}>
        <SystemProbe />
        <SynWareRuntimeMount runtime={runtime} app={app} responderId={`application:${app.id}`}>
          <MountedProbe commandExecuted={commandExecuted} />
        </SynWareRuntimeMount>
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );

    const boundary = await screen.findByTestId("app-boundary");
    expect(boundary.dataset.rawContext).toBe("null");
    expect(boundary.dataset.kernelHook).toBe("denied");
    expect(screen.getByTestId("system-kernel").dataset.runtimeId).toBe(runtime.runtimeId);
    expect(boundary.dataset.overlayDocument).toBe("real");
    expect(boundary.dataset.overlayWindow).toBe("real");
    expect(boundary.dataset.overlayWorkArea).toBe("1440x900");
    expect(boundary.dataset.overlayViewport).toBe("1440x900");

    fireEvent.focus(screen.getByRole("button", { name: "App scoped command" }));
    expect(runtime.focus.getFocusedResponderId()).toBe(`control:${app.id}`);
    expect(runtime.focus.inspect().scopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `focus:${app.id}`, parentResponderId: `control:${app.id}`, modal: true, trapFocus: true }),
    ]));
    fireEvent.click(screen.getByRole("button", { name: "App scoped command" }));
    await waitFor(() => expect(commandExecuted).toHaveBeenCalledTimes(1));
    expect(runtime.responders.get(`control:${app.id}`)).toBeTruthy();
  });

  it("keeps the genuine window mount on the app responder and overlay leases", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const commandExecuted = vi.fn();
    const app = registerApp(runtime, "hostile-app", {
      loadModule: async () => ({ default: () => <MountedProbe commandExecuted={commandExecuted} /> }),
    });
    const window = runtime.windows.create(standardWindow("window:hostile-app", {
      applicationId: app.id,
      applicationSessionId: app.id,
      content: { rendererId: "application", parameters: { appId: app.id } },
      restorationKey: "p10.window:hostile-app",
    }));
    await runtime.windows.open(window.id);
    await runtime.bundles.loadBundle(app.id);
    const registry = createApplicationWindowContentRendererRegistry(runtime, { [app.id]: runtime.apps.getApp(app.id)! });
    const content = registry.render(`application:${app.id}`, {
      mountKey: `application:${app.id}`,
      presentation: {} as WindowPresentation,
      window: window.record,
    });

    render(<SynCloudOSProvider runtime={runtime}><HostSiteBrandingProvider value={siteBranding}>{content}</HostSiteBrandingProvider></SynCloudOSProvider>);

    const boundary = await screen.findByTestId("app-boundary");
    expect(boundary.dataset.rawContext).toBe("null");
    expect(boundary.dataset.kernelHook).toBe("denied");
    expect(boundary.dataset.overlayDocument).toBe("real");
    expect(boundary.dataset.overlayWorkArea).toBe("1440x900");
    fireEvent.focus(screen.getByRole("button", { name: "App scoped command" }));
    expect(runtime.focus.getFocusedResponderId()).toBe(`control:${app.id}`);
    fireEvent.click(screen.getByRole("button", { name: "App scoped command" }));
    await waitFor(() => expect(commandExecuted).toHaveBeenCalledTimes(1));
    expect(runtime.responders.get(`control:${app.id}`)).toBeTruthy();
  });

  it("revokes a same-ID genuine-window generation before its replacement renders", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    const id = "window-replace-app";
    const windowId = "window-replace-app";
    const generations: SCOSFacade[] = [];
    const bundle = (route: string, label: string) => createTestBundle({ id, route }, {
      loadModule: async () => ({
        default: () => <GenerationProbe label={label} onGeneration={(context) => { generations.push(context); }} />,
      }),
    });
    runtime.apps.registerBundle(bundle("/window-replace-app", "Window generation one"));
    const window = runtime.windows.create(standardWindow(windowId, {
      applicationId: id,
      applicationSessionId: id,
      content: { rendererId: "application", parameters: { appId: id } },
      restorationKey: `p10.${windowId}`,
    }));
    await runtime.windows.open(window.id);
    const first = runtime.apps.getApp(id)!;
    await runtime.bundles.loadBundle(id);
    const record = window.record;
    const firstRegistry = createApplicationWindowContentRendererRegistry(runtime, { [id]: first });
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={siteBranding}>
        {firstRegistry.render(`application:${id}`, { mountKey: `application:${id}`, presentation: {} as WindowPresentation, window: record })}
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );
    await screen.findByText("Window generation one");
    const stale = generations.at(-1)!;

    runtime.apps.registerBundle(bundle("/window-replace-app-next", "Window generation two"));
    const replacement = runtime.apps.getApp(id)!;
    await runtime.bundles.loadBundle(id);
    const replacementRegistry = createApplicationWindowContentRendererRegistry(runtime, { [id]: replacement });
    view.rerender(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={siteBranding}>
        {replacementRegistry.render(`application:${id}`, { mountKey: `application:${id}`, presentation: {} as WindowPresentation, window: record })}
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );
    await screen.findByText("Window generation two");
    await waitFor(() => expect(generations.some((generation) => generation !== stale && !generation.signal.aborted)).toBe(true));
    const fresh = generations.findLast((generation) => generation !== stale && !generation.signal.aborted)!;
    expect(fresh).not.toBe(stale);
    expect(stale.signal.aborted).toBe(true);
    expect(() => stale.drag.endpoint()).toThrow(/no longer live|revoked|AbortError|lifecycle ended/i);
    expect(fresh.signal.aborted).toBe(false);
    expect(fresh.drag.endpoint()).toEqual(expect.objectContaining({ appId: id }));
    view.unmount();
    expect(fresh.signal.aborted).toBe(true);
  });
});
