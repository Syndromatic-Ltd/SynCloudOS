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

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useRef, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { defineWebspring, type WebspringActions, type WebspringViewProps } from "../../src/Webspring/public";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { useWebspringResponder } from "../../src/Webspring/useWebspringResponder";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment, authoriseTestRuntime } from "./helpers";

afterEach(cleanup);

function WebspringTestHost({ runtime, children, onNotificationCentreRequest, onApplicationMenuToggle }: PropsWithChildren<{
  runtime: ReturnType<typeof createWindowedTestRuntime>;
  onNotificationCentreRequest?: (notificationId?: string) => void;
  onApplicationMenuToggle?: () => void;
}>) {
  useWebspringResponder({ onNotificationCentreRequest, onApplicationMenuToggle });
  return <>{children}</>;
}

function createWindowedTestRuntime(appId = "diagnostics") {
  const runtime = authoriseTestRuntime(createTestRuntime({ id: `runtime:webspring-window:${appId}` }));
  runtime.apps.registerBundle(createTestBundle({
    id: appId,
    route: `/${appId}`,
    presentation: "windowedView",
  }));
  return runtime;
}

describe("Webspring window host", () => {
  it("keeps one mounted application instance through a throwing view and fallback view switch", async () => {
    let appMounts = 0;
    function StatefulApplication() {
      const instance = useRef<string | null>(null);
      if (instance.current === null) instance.current = `app-instance-${++appMounts}`;
      return <div data-testid="stateful-application">{instance.current}</div>;
    }
    const loadModule = vi.fn(async () => ({ default: StatefulApplication }));
    const environment = createTestRuntimeEnvironment();
    const viewportListeners = new Set<() => void>();
    const subscribeViewport = (listener: () => void) => { viewportListeners.add(listener); return () => viewportListeners.delete(listener); };
    environment.screen.subscribe = subscribeViewport;
    environment.layoutViewport.subscribe = subscribeViewport;
    environment.visualViewport.subscribe = subscribeViewport;
    const runtime = authoriseTestRuntime(createTestRuntime({
      id: "runtime:webspring-persistent-outlet",
      environment,
      initialBundles: [createTestBundle({
        id: "diagnostics", route: "/diagnostics", presentation: "appView",
        frame: { layout: "defacto", material: "standard", topBar: "standard", smoothSurface: "off" },
      }, { loadModule }), createTestBundle({
        id: "contact", route: "/contact", presentation: "appView",
        frame: { layout: "defacto", material: "standard", topBar: "standard", smoothSurface: "off" },
      })],
    }));
    await runtime.boot({ initialPathname: "/diagnostics" });

    let connectedActions: WebspringActions | null = null;
    function ConnectedView({ model, actions, applicationOutlet }: WebspringViewProps) {
      connectedActions = actions;
      return <main data-testid="connected-view" data-app-order={model.apps.map((app) => app.id).join(",")}>{applicationOutlet}</main>;
    }
    function MobileView({ model, actions, applicationOutlet }: WebspringViewProps) {
      connectedActions = actions;
      return <main data-testid="mobile-view" data-app-order={model.apps.map((app) => app.id).join(",")}>{applicationOutlet}</main>;
    }
    function ThrowingView(): never { throw new Error("fixture view failed"); }
    const manifest = {
      schemaVersion: 1, id: "com.example.webspring.host", version: "1.0.0", title: "Host fixture",
      webspringShell: {
        views: [
          { id: "connected", presentations: ["desktop", "tablet"], mode: "persistent" },
          { id: "mobile", presentations: ["mobile"], mode: "persistent" },
          { id: "throwing", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" },
          { id: "fallback", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" },
        ],
        defaults: { desktop: "connected", tablet: "connected", mobile: "mobile" },
        homeRoute: "/", branding: { name: { key: "site.name", fallback: "Fixture" } },
      },
    } as const;
    const connectedShell = defineWebspring({ manifest, components: { connected: ConnectedView, mobile: MobileView, throwing: ThrowingView, fallback: ConnectedView } });
    const throwingShell = defineWebspring({
      manifest: { ...manifest, webspringShell: { ...manifest.webspringShell, defaults: { desktop: "throwing", tablet: "throwing", mobile: "throwing" } } },
      components: { connected: ConnectedView, mobile: MobileView, throwing: ThrowingView, fallback: ConnectedView },
    });
    const invalidLauncherShell = defineWebspring({
      manifest: {
        ...manifest,
        webspringShell: {
          ...manifest.webspringShell,
          views: manifest.webspringShell.views.map((view) => ({ ...view, mode: "launcher" as const })),
          homeRoute: "/diagnostics",
        },
      },
      components: { connected: ConnectedView, mobile: MobileView, throwing: ThrowingView, fallback: ConnectedView },
    });
    const mounted = render(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={connectedShell} /></SynCloudOSProvider>);
    const applicationBefore = await screen.findByTestId("stateful-application");
    expect(appMounts).toBe(1);

    const screenSnapshot = environment.screen.getSnapshot() as { width: number; availableWidth: number };
    const visualViewportSnapshot = environment.visualViewport.getSnapshot()! as { width: number };
    await act(async () => {
      screenSnapshot.width = 600;
      screenSnapshot.availableWidth = 600;
      visualViewportSnapshot.width = 600;
      viewportListeners.forEach((listener) => listener());
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await screen.findByTestId("mobile-view")).toBeTruthy();
    expect(screen.getByTestId("stateful-application")).toBe(applicationBefore);
    expect(appMounts).toBe(1);

    mounted.rerender(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={throwingShell} /></SynCloudOSProvider>);
    expect((await screen.findByRole("alert")).textContent).toContain("fixture view failed");
    expect(runtime.store.getSnapshot().application.activeAppId).toBe("diagnostics");
    expect(loadModule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Use fallback view" }));
    const applicationAfter = await screen.findByTestId("stateful-application");
    expect(applicationAfter).toBe(applicationBefore);
    expect(appMounts).toBe(1);
    expect(document.querySelectorAll(".webspring-application-outlet-host")).toHaveLength(1);
    const reordered = await connectedActions!.reorder(["contact", "diagnostics"]);
    expect(reordered.status).toBe("completed");
    expect((await screen.findByTestId("mobile-view")).getAttribute("data-app-order")).toBe("contact,diagnostics");
    mounted.rerender(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={invalidLauncherShell} /></SynCloudOSProvider>);
    expect((await screen.findByRole("alert")).textContent).toContain("must resolve to the shell");
    expect(appMounts).toBe(1);
    mounted.rerender(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={connectedShell} /></SynCloudOSProvider>);
    expect(await screen.findByTestId("stateful-application")).toBe(applicationBefore);
    const invalidRoute = await connectedActions!.openApp("diagnostics", "/contact");
    expect(invalidRoute.status).toBe("failed");
    expect(runtime.store.getSnapshot().application.activeAppId).toBe("diagnostics");
    const contactRoute = await connectedActions!.openApp("contact");
    expect(contactRoute.status).toBe("completed");
    expect(runtime.store.getSnapshot().application).toMatchObject({ activeAppId: "contact", routePath: "/contact" });
    await runtime.dispose("persistent-outlet-test");
  });


  it("treats close-window and return-to-webspring as distinct commands", async () => {
    const runtime = createWindowedTestRuntime("diagnostics");
    const notificationRequests: Array<string | undefined> = [];
    let applicationMenuToggles = 0;
    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringTestHost
          runtime={runtime}
          onNotificationCentreRequest={(notificationId) => notificationRequests.push(notificationId)}
          onApplicationMenuToggle={() => { applicationMenuToggles += 1; }}
        />
      </SynCloudOSProvider>,
    );

    expect(runtime.focus.getActiveAnchors()).toMatchObject({
      runtimeResponderId: "runtime",
      webspringResponderId: "webspring",
      workspaceResponderId: "workspace",
    });
    await runtime.commands.dispatch("webspring.notificationCentre.open", { notificationId: "notification:test" });
    await runtime.commands.dispatch("webspring.applicationMenu.toggle", undefined);
    expect(notificationRequests).toEqual(["notification:test"]);
    expect(applicationMenuToggles).toBe(1);

    await runtime.routes.openRoute("/diagnostics", { source: "test" }).result;
    expect(runtime.windows.list()).toHaveLength(1);
    expect(runtime.statechart.getCurrentState()).not.toBe("active.webspring");

    await runtime.commands.dispatch("window.close", undefined);
    expect(runtime.windows.list()).toHaveLength(0);
    expect(runtime.statechart.getCurrentState()).not.toBe("active.webspring");

    await runtime.commands.dispatch("workspace.returnToWebspring", undefined);
    expect(runtime.statechart.getCurrentState()).toBe("active.webspring");
    await runtime.dispose("webspring-window-host-test");
  });
});
