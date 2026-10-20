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

import { act, render as renderView } from "@testing-library/react";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { SynCloudOSWatchdog } from "../../src/SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import type { DocumentCloseReviewer, DocumentType } from "../../src/SynCloudOS/Documents";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import type { SynCloudOSAppInfo, SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import {
  createRuntimeHarness,
  createTestRuntime,
  createTestRuntimeEnvironment,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";


const discardCloseReviewer: DocumentCloseReviewer = { review: async () => "discard" };
const branding = Object.freeze({ name: "Quit test host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null });
function render(ui: React.ReactNode) {
  return renderView(ui, { wrapper: ({ children }) => <HostSiteBrandingProvider value={branding}>{children}</HostSiteBrandingProvider> });
}
const cancelCloseReviewer: DocumentCloseReviewer = { review: async () => "cancel" };
interface QuitWindowDocumentModel {
  readonly version: 1;
  readonly text: string;
}

const quitWindowDocumentType: DocumentType<QuitWindowDocumentModel> = Object.freeze({
  id: "tests.app-quit-detached-window-document",
  displayName: "App quit detached window document",
  schemaVersion: 1,
  extensions: Object.freeze([".app-quit-detached-test"]),
  mimeTypes: Object.freeze(["application/x-syncloudos-app-quit-detached-test"]),
  creatingApplicationId: "com.example.window-owner",
  openingApplicationIds: Object.freeze(["com.example.window-owner"]),
  capabilities: Object.freeze({ versions: true, conflicts: true }),
  autosave: "disabled",
  create: () => Object.freeze({ version: 1, text: "Untitled" }),
  read: (value) => structuredClone(value),
  write: (value) => structuredClone(value),
  validate: (value): value is QuitWindowDocumentModel => Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    (value as Partial<QuitWindowDocumentModel>).version === 1 &&
    typeof (value as Partial<QuitWindowDocumentModel>).text === "string",
  ),
});

const activeRuntimes: SynCloudOSRuntime[] = [];
const activeMounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];

afterEach(async () => {
  for (const mounted of activeMounts.splice(0)) mounted.dispose("test complete");
  for (const runtime of activeRuntimes.splice(0)) await runtime.dispose("test complete");
});

function createWindowedAppFixture(runtimeId: string) {
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({
    id: runtimeId,
    environment,
    applicationDocuments: {
      initialTypes: [quitWindowDocumentType],
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
    documentTypes: [{ id: quitWindowDocumentType.id, displayName: quitWindowDocumentType.displayName }],
  });
  const mount = mountTestSynWareRuntime(runtime, "com.example.window-owner");
  activeMounts.push(mount);
  return { runtime, owner: createSynWareContextValue(mount.runtime) };
}

async function openDetachedWindow(fixture: ReturnType<typeof createWindowedAppFixture>) {
  const document = await fixture.owner.documents.workspaceDocuments.newDocument<QuitWindowDocumentModel>({
    documentId: "window-owner:document:one",
    typeId: quitWindowDocumentType.id,
    location: { kind: "memory", namespace: "app-quit-detached", key: "window-owner:document:one" },
    initialModel: { version: 1, text: "Detached" },
    activate: false,
  });
  return fixture.owner.windows.openDocumentWindow({
    documentId: document.id,
    title: "Detached note",
    restorationKey: "note-one",
  });
}

function mountElement(fixture: ReturnType<typeof createWindowedAppFixture>, app: SynCloudOSAppInfo, windowControllerId: string) {
  return (
    <SynCloudOSWatchdog runtime={fixture.runtime} watchdogName="app-quit-detached-windows test">
      <SynWareRuntimeMount
        runtime={fixture.runtime}
        app={app}
        responderId={`window:${windowControllerId}`}
        windowControllerId={windowControllerId}
      >
        <span data-testid="app-content">detached content</span>
      </SynWareRuntimeMount>
    </SynCloudOSWatchdog>
  );
}

describe("application quit with detached windows", () => {
  it("closes detached windows before the lifecycle commit completes", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-detached-a");
    fixture.runtime.documents.registerCloseReviewer(discardCloseReviewer);
    const opened = await openDetachedWindow(fixture);
    expect(fixture.runtime.windows.select(opened.id).record.state).toBe("open");

    const result = await fixture.runtime.lifecycle.close("com.example.window-owner", { reason: "test" }).result;
    expect(result).toMatchObject({ status: "completed", committed: true });
    expect(fixture.runtime.windows.list().map(({ id }) => id)).not.toContain(opened.id);
    expect(fixture.runtime.windows.snapshot().windowControllerIds).toHaveLength(0);
    expect(fixture.runtime.lifecycle.getState("com.example.window-owner")).toBe("closed");
  });

  it("fails the quit and keeps windows when the window close is refused", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-detached-b");
    fixture.runtime.documents.registerCloseReviewer(cancelCloseReviewer);
    const opened = await openDetachedWindow(fixture);

    const result = await fixture.runtime.lifecycle.close("com.example.window-owner", { reason: "test" }).result;

    expect(result).toMatchObject({ status: "failed", committed: false });
    expect(fixture.runtime.lifecycle.getState("com.example.window-owner")).not.toBe("closed");
    expect(fixture.runtime.windows.select(opened.id).record.state).toBe("open");
  });

  it("renders nothing and reports no error when unregister tears down a mounted detached window", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-detached-c");
    fixture.runtime.documents.registerCloseReviewer(discardCloseReviewer);
    const app = fixture.runtime.apps.getApp("com.example.window-owner");
    if (!app) throw new Error("The window-owner fixture app did not register.");
    const opened = await openDetachedWindow(fixture);
    const harness = createRuntimeHarness(fixture.runtime);
    const view = render(mountElement(fixture, app, opened.id));
    expect(view.getByTestId("app-content")).toBeTruthy();

    await act(async () => {
      await harness.AppRegistry.unregister("com.example.window-owner");
    });
    // Production flush: the window host re-renders the still-composed mount
    // while the registry entry is already gone (the stale app prop object
    // stays; canonical resolution returns null).
    act(() => {
      view.rerender(mountElement(fixture, app, opened.id));
    });

    expect(view.queryByTestId("app-content")).toBeNull();
    expect(view.queryByRole("alert")).toBeNull();
    expect(fixture.runtime.windows.list().map(({ id }) => id)).not.toContain(opened.id);
    view.unmount();
  });

  it("surfaces registry corruption when the app is removed while its lifecycle is active", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-detached-d");
    const app = fixture.runtime.apps.getApp("com.example.window-owner");
    if (!app) throw new Error("The window-owner fixture app did not register.");
    const view = render(
      <SynCloudOSWatchdog runtime={fixture.runtime} watchdogName="app-quit-detached-windows test">
        <SynWareRuntimeMount runtime={fixture.runtime} app={app} responderId="application:com.example.window-owner">
          <span data-testid="app-content">mounted content</span>
        </SynWareRuntimeMount>
      </SynCloudOSWatchdog>,
    );
    expect(view.getByTestId("app-content")).toBeTruthy();

    // Simulated corruption: the registry entry disappears while the lifecycle
    // still reports the application as running.
    act(() => {
      fixture.runtime.store.mutate((draft: { lifecycle: Record<string, string>; appInfo: Record<string, unknown> }) => {
        draft.lifecycle["com.example.window-owner"] = "active";
        delete draft.appInfo["com.example.window-owner"];
      });
      view.rerender(
        <SynCloudOSWatchdog runtime={fixture.runtime} watchdogName="app-quit-detached-windows test">
          <SynWareRuntimeMount runtime={fixture.runtime} app={app} responderId="application:com.example.window-owner">
            <span data-testid="app-content">mounted content</span>
          </SynWareRuntimeMount>
        </SynCloudOSWatchdog>,
      );
    });

    expect(view.getByRole("alert")).toBeTruthy();
    view.unmount();
  });

  it("treats an unregister during runtime disposal as teardown, not corruption", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-detached-e");
    const app = fixture.runtime.apps.getApp("com.example.window-owner");
    if (!app) throw new Error("The window-owner fixture app did not register.");
    const view = render(
      <SynCloudOSWatchdog runtime={fixture.runtime} watchdogName="app-quit-detached-windows test">
        <SynWareRuntimeMount runtime={fixture.runtime} app={app} responderId="application:com.example.window-owner">
          <span data-testid="app-content">mounted content</span>
        </SynWareRuntimeMount>
      </SynCloudOSWatchdog>,
    );
    expect(view.getByTestId("app-content")).toBeTruthy();

    Object.defineProperty(fixture.runtime, "disposalState", { configurable: true, get: () => "disposing" });
    act(() => {
      fixture.runtime.store.mutate((draft: { lifecycle: Record<string, string>; appInfo: Record<string, unknown> }) => {
        draft.lifecycle["com.example.window-owner"] = "active";
        delete draft.appInfo["com.example.window-owner"];
      });
      view.rerender(
        <SynCloudOSWatchdog runtime={fixture.runtime} watchdogName="app-quit-detached-windows test">
          <SynWareRuntimeMount runtime={fixture.runtime} app={app} responderId="application:com.example.window-owner">
            <span data-testid="app-content">mounted content</span>
          </SynWareRuntimeMount>
        </SynCloudOSWatchdog>,
      );
    });

    expect(view.queryByTestId("app-content")).toBeNull();
    expect(view.queryByRole("alert")).toBeNull();
    view.unmount();
  });

  it("requests a return decision instead of navigating when the active app owns open windows", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-decision-a");
    fixture.runtime.documents.registerCloseReviewer(discardCloseReviewer);
    const opened = await openDetachedWindow(fixture);
    fixture.runtime.store.mutate((draft: { application: { activeAppId: string | null } }) => {
      draft.application.activeAppId = "com.example.window-owner";
    });

    await fixture.runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "test" });

    expect(fixture.runtime.systemUI.getSnapshot().returnDecision).toEqual({ appId: "com.example.window-owner" });
    expect(fixture.runtime.store.getSnapshot().application.activeAppId).toBe("com.example.window-owner");
    expect(fixture.runtime.windows.select(opened.id).record.state).toBe("open");
  });

  it("returns directly without a decision when the active app only has panels open", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-decision-panels");
    const bridge = createTransientWindowSurfaceBridge({
      runtime: fixture.runtime,
      renderers: new WindowContentRendererRegistry(),
      physicalHostId: "stage:window-owner",
      owner: { workspaceId: "workspace:default", applicationId: "com.example.window-owner", applicationSessionId: "com.example.window-owner" },
    });
    const panel = await bridge.present(
      { id: "colours", role: "panel", title: "Colours", parentWindowControllerId: null, anchor: null, bounds: { x: 0, y: 0, width: 240, height: 320 } },
      <p>Colours</p>,
    );
    expect(fixture.runtime.windows.select(panel).record).toMatchObject({ applicationId: "com.example.window-owner", role: "panel", state: "open" });
    fixture.runtime.store.mutate((draft: { application: { activeAppId: string | null } }) => {
      draft.application.activeAppId = "com.example.window-owner";
    });

    await fixture.runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "test" });

    expect(fixture.runtime.systemUI.getSnapshot().returnDecision).toBeNull();
    expect(fixture.runtime.store.getSnapshot().application.activeAppId).toBeNull();
    bridge.dispose();
  });

  it("returns directly without a decision when the active app owns no windows", async () => {
    const fixture = createWindowedAppFixture("runtime:app-quit-decision-b");
    fixture.runtime.store.mutate((draft: { application: { activeAppId: string | null } }) => {
      draft.application.activeAppId = "com.example.window-owner";
    });

    await fixture.runtime.commands.dispatch("workspace.returnToWebspring", undefined, { source: "test" });

    expect(fixture.runtime.systemUI.getSnapshot().returnDecision).toBeNull();
    expect(fixture.runtime.store.getSnapshot().application.activeAppId).toBeNull();
  });
});
