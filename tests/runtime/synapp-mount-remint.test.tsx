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

import { act, render as renderView, screen } from "@testing-library/react";
import { HostSiteBrandingProvider, ResponderScope, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { useSCOS } from "../../src/SynCloudOS/AppSDK/scos/useSCOS"
import { SynCloudOSWatchdog } from "../../src/SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import type { DocumentCloseReviewer, DocumentType } from "../../src/SynCloudOS/Documents";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";

const discardCloseReviewer: DocumentCloseReviewer = { review: async () => "discard" };
const branding = Object.freeze({ name: "Remint test host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null });
function render(ui: React.ReactNode) {
  return renderView(ui, { wrapper: ({ children }) => <HostSiteBrandingProvider value={branding}>{children}</HostSiteBrandingProvider> });
}

interface RemintDocumentModel {
  readonly version: 1;
  readonly text: string;
}

const remintDocumentType: DocumentType<RemintDocumentModel> = Object.freeze({
  id: "tests.mount-remint-document",
  displayName: "Mount remint document",
  schemaVersion: 1,
  extensions: Object.freeze([".mount-remint-test"]),
  mimeTypes: Object.freeze(["application/x-syncloudos-mount-remint-test"]),
  creatingApplicationId: "window-owner",
  openingApplicationIds: Object.freeze(["window-owner"]),
  capabilities: Object.freeze({ versions: true, conflicts: true }),
  autosave: "disabled",
  create: () => Object.freeze({ version: 1, text: "Untitled" }),
  read: (value) => structuredClone(value),
  write: (value) => structuredClone(value),
  validate: (value): value is RemintDocumentModel => Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    (value as Partial<RemintDocumentModel>).version === 1 &&
    typeof (value as Partial<RemintDocumentModel>).text === "string",
  ),
});

const activeRuntimes: SynCloudOSRuntime[] = [];
const activeMounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];

afterEach(async () => {
  for (const mounted of activeMounts.splice(0)) mounted.dispose("test complete");
  for (const runtime of activeRuntimes.splice(0)) await runtime.dispose("test complete");
});

describe("window mount transfer re-mint", () => {
  it("updates host branding without revoking the mounted transfer generation", async () => {
    const runtime = createTestRuntime({ id: "runtime:mount-branding-update" });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "branding-app",
      version: "1.0.0",
      title: "Branding App",
      routes: [{ path: "/branding-app", primary: true }],
      windowDefaults: { title: "Branding App", width: 640, height: 480 },
    });
    const app = runtime.apps.getApp("branding-app");
    if (!app) throw new Error("The branding-app fixture did not register.");

    const firstBranding = Object.freeze({ ...branding, name: "First host brand" });
    const secondBranding = Object.freeze({ ...branding, name: "Second host brand" });
    let initialSignal: AbortSignal | null = null;
    let latestSignal: AbortSignal | null = null;

    function BrandingProbe() {
      const context = useSCOS();
      context.drag.endpoint();
      initialSignal ??= context.signal;
      latestSignal = context.signal;
      return <span>{context.branding.name}</span>;
    }

    const tree = (siteBranding: typeof firstBranding) => (
      <HostSiteBrandingProvider value={siteBranding}>
        <SynCloudOSWatchdog runtime={runtime} watchdogName="branding update mount">
          <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:branding-app">
            <BrandingProbe />
          </SynWareRuntimeMount>
        </SynCloudOSWatchdog>
      </HostSiteBrandingProvider>
    );

    const view = renderView(tree(firstBranding));
    await screen.findByText("First host brand");
    const mountedSignal = initialSignal;
    if (!mountedSignal) throw new Error("The branding-app mount did not expose its transfer signal.");
    expect(mountedSignal.aborted).toBe(false);

    view.rerender(tree(secondBranding));
    await screen.findByText("Second host brand");

    expect(latestSignal).toBe(mountedSignal);
    expect(mountedSignal.aborted).toBe(false);
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("keeps the mounted transfer generation across lifecycle-only AppInfo projection updates", async () => {
    const runtime = createTestRuntime({ id: "runtime:mount-lifecycle-projection" });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "lifecycle-app",
      version: "1.0.0",
      title: "Lifecycle App",
      routes: [{ path: "/lifecycle-app", primary: true }],
      windowDefaults: { title: "Lifecycle App", width: 640, height: 480 },
    });
    const app = runtime.apps.getApp("lifecycle-app");
    if (!app) throw new Error("The lifecycle-app fixture did not register.");
    const manager = runtime.appManager.getManagerForApp(app.id);
    if (!manager) throw new Error("The lifecycle-app manager did not register.");

    let firstSignal: AbortSignal | null = null;
    let latestSignal: AbortSignal | null = null;
    function LifecycleProbe({ tick }: { readonly tick: number }) {
      const context = useSCOS();
      context.drag.endpoint();
      firstSignal ??= context.signal;
      latestSignal = context.signal;
      return <span data-testid="lifecycle-probe" data-tick={tick}>Lifecycle live</span>;
    }
    const frame = (tick: number) => (
      <SynCloudOSWatchdog runtime={runtime} watchdogName="lifecycle projection mount">
        <SynWareRuntimeMount runtime={runtime} app={app} responderId={`application:${app.id}`}>
          <LifecycleProbe tick={tick} />
        </SynWareRuntimeMount>
      </SynCloudOSWatchdog>
    );

    const view = render(frame(0));
    await screen.findByText("Lifecycle live");
    const mountedSignal = firstSignal;
    if (!mountedSignal) throw new Error("The lifecycle-app mount did not expose its transfer signal.");
    const beforeProjection = runtime.apps.getApp(app.id);

    await act(async () => {
      expect(runtime.lifecycle.transition(app.id, "loading", { source: "test" })).toMatchObject({ ok: true });
    });
    const afterProjection = runtime.apps.getApp(app.id);
    expect(afterProjection).not.toBe(beforeProjection);
    expect(runtime.appManager.getManagerForApp(app.id)).toBe(manager);

    view.rerender(frame(1));
    await screen.findByText("Lifecycle live");

    expect(latestSignal).toBe(mountedSignal);
    expect(mountedSignal.aborted).toBe(false);
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("survives the browser StrictMode responder replay without exposing a revoked app facade", async () => {
    const runtime = createTestRuntime({ id: "runtime:mount-strict-responder" });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "strict-app",
      version: "1.0.0",
      title: "Strict App",
      routes: [{ path: "/strict-app", primary: true }],
      windowDefaults: { title: "Strict App", width: 640, height: 480 },
    });
    const app = runtime.apps.getApp("strict-app");
    if (!app) throw new Error("The strict-app fixture did not register.");

    function LiveCapabilityProbe() {
      const context = useSCOS();
      context.drag.endpoint();
      return <span>strict live content</span>;
    }

    const view = renderView(
      <React.StrictMode>
        <HostSiteBrandingProvider value={branding}>
          <SynCloudOSProvider runtime={runtime}>
            <SynCloudOSWatchdog runtime={runtime} watchdogName="strict responder mount">
              <ResponderScope
                responderId="application:strict-app"
                kind="application"
                parentResponderId="workspace"
                scopeId="application:strict-app"
              >
                <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:strict-app">
                  <LiveCapabilityProbe />
                </SynWareRuntimeMount>
              </ResponderScope>
            </SynCloudOSWatchdog>
          </SynCloudOSProvider>
        </HostSiteBrandingProvider>
      </React.StrictMode>,
    );

    await screen.findByText("strict live content");
    expect(view.queryByRole("alert")).toBeNull();
    expect(runtime.responders.get("application:strict-app")).not.toBeNull();
  });

  it("keeps one mounted transfer lease across a React presentation disconnect and reappearance", async () => {
    const runtime = createTestRuntime({ id: "runtime:mount-presentation-disconnect" });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "activity-app",
      version: "1.0.0",
      title: "Activity App",
      routes: [{ path: "/activity-app", primary: true }],
      windowDefaults: { title: "Activity App", width: 640, height: 480 },
    });
    const app = runtime.apps.getApp("activity-app");
    if (!app) throw new Error("The activity-app fixture did not register.");

    let initialSignal: AbortSignal | null = null;
    let latestSignal: AbortSignal | null = null;
    function LiveCapabilityProbe() {
      const context = useSCOS();
      context.drag.endpoint();
      initialSignal ??= context.signal;
      latestSignal = context.signal;
      return <span>activity live content</span>;
    }
    const frame = (mode: "visible" | "hidden") => (
      <React.StrictMode>
        <HostSiteBrandingProvider value={branding}>
          <SynCloudOSProvider runtime={runtime}>
            <SynCloudOSWatchdog runtime={runtime} watchdogName="presentation disconnect mount">
              <ResponderScope responderId="application:activity-app" kind="application" parentResponderId="workspace" scopeId="application:activity-app">
                <React.Activity mode={mode}>
                  <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:activity-app">
                    <LiveCapabilityProbe />
                  </SynWareRuntimeMount>
                </React.Activity>
              </ResponderScope>
            </SynCloudOSWatchdog>
          </SynCloudOSProvider>
        </HostSiteBrandingProvider>
      </React.StrictMode>
    );

    const view = renderView(frame("visible"));
    await screen.findByText("activity live content");
    const mountedSignal = initialSignal;
    if (!mountedSignal) throw new Error("The activity-app mount did not expose its transfer signal.");
    expect(mountedSignal.aborted).toBe(false);

    view.rerender(frame("hidden"));
    view.rerender(frame("visible"));
    await screen.findByText("activity live content");

    expect(latestSignal).toBe(mountedSignal);
    expect(mountedSignal.aborted).toBe(false);
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("does not surface an expected revocation when an outgoing child store renders during a replacement mount", async () => {
    const runtime = createTestRuntime({ id: "runtime:mount-revocation-boundary" });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "replace-app",
      version: "1.0.0",
      title: "Replace App",
      routes: [{ path: "/replace-app", primary: true }],
      windowDefaults: { title: "Replace App", width: 640, height: 480 },
    });
    const app = runtime.apps.getApp("replace-app");
    if (!app) throw new Error("The replace-app fixture did not register.");

    let version = 0;
    const listeners = new Set<() => void>();
    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => version,
      bump() {
        version += 1;
        for (const listener of [...listeners]) listener();
      },
    };
    function LiveCapabilityProbe({ label }: { readonly label: string }) {
      React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
      const context = useSCOS();
      context.drag.endpoint();
      return <span>{label}</span>;
    }

    const view = render(
      <SynCloudOSWatchdog runtime={runtime} watchdogName="mount revocation boundary">
        <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:replace-app">
          <LiveCapabilityProbe label="Outgoing" />
        </SynWareRuntimeMount>
      </SynCloudOSWatchdog>,
    );
    await screen.findByText("Outgoing");

    view.rerender(
      <SynCloudOSWatchdog runtime={runtime} watchdogName="mount revocation boundary">
        <>
          <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:replace-app">
            <LiveCapabilityProbe label="Outgoing" />
          </SynWareRuntimeMount>
          <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:replace-app">
            <LiveCapabilityProbe label="Incoming" />
          </SynWareRuntimeMount>
        </>
      </SynCloudOSWatchdog>,
    );
    await screen.findByText("Incoming");
    await act(async () => { store.bump(); });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Incoming")).toBeTruthy();
  });

  it("re-mints instead of rendering with a dead facade when responders regenerate", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({
      id: "runtime:mount-remint",
      environment,
      applicationDocuments: {
        initialTypes: [remintDocumentType],
        initialAdapters: [new InMemoryDocumentAdapter(environment)],
      },
    });
    activeRuntimes.push(runtime);
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      id: "window-owner",
      version: "1.0.0",
      title: "Window Owner",
      routes: [{ path: "/window-owner", primary: true }],
      windowDefaults: { title: "Window Owner", width: 640, height: 480 },
      documentTypes: [{ id: remintDocumentType.id, displayName: remintDocumentType.displayName }],
    });
    const mount = mountTestSynWareRuntime(runtime, "window-owner");
    activeMounts.push(mount);
    runtime.documents.registerCloseReviewer(discardCloseReviewer);
    const owner = createSynWareContextValue(mount.runtime);
    const document = await owner.documents.workspaceDocuments.newDocument<RemintDocumentModel>({
      documentId: "window-owner:document:remint",
      typeId: remintDocumentType.id,
      location: { kind: "memory", namespace: "mount-remint", key: "window-owner:document:remint" },
      initialModel: { version: 1, text: "Remint" },
      activate: false,
    });
    const opened = await owner.windows.openDocumentWindow({
      documentId: document.id,
      title: "Remint note",
      restorationKey: "remint-note",
    });
    const app = runtime.apps.getApp("window-owner");
    if (!app) throw new Error("The window-owner fixture app did not register.");

    const Probe = ({ tick }: { tick: number }) => (
      <SynCloudOSWatchdog runtime={runtime} watchdogName="mount remint test">
        <SynWareRuntimeMount
          runtime={runtime}
          app={app}
          responderId={`window:${opened.id}`}
          windowControllerId={opened.id}
        >
          <span data-testid="remint-content" data-tick={tick}>live content</span>
        </SynWareRuntimeMount>
      </SynCloudOSWatchdog>
    );
    const view = render(<Probe tick={0} />);
    expect(view.getByTestId("remint-content")).toBeTruthy();

    // Route commits re-register window responders with a fresh generation;
    // the transfer authority retires the previous mount generation for the
    // responder. The live tree must re-mint instead of throwing on its next
    // render with the retired facade, so force that render explicitly.
    const responderId = `window:${opened.id}`;
    const registration = runtime.responders.get(responderId);
    if (!registration) throw new Error("The window responder was not registered.");
    await act(async () => {
      runtime.responders.remove(responderId, { cascade: true });
      runtime.responders.register({
        id: registration.id,
        kind: registration.kind,
        ...(registration.parentId ? { parentId: registration.parentId } : {}),
        ...(registration.scopeId ? { scopeId: registration.scopeId } : {}),
      });
      await Promise.resolve();
    });
    // A same-element rerender bails out of reconciliation; the changed tick
    // forces a genuine descent render with the retired facade.
    view.rerender(<Probe tick={1} />);
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByTestId("remint-content")).toBeTruthy();
    view.unmount();
  });
});
