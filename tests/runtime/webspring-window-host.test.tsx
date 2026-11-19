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
import { WSLauncherViewController, type WebspringActions } from "../../src/Webspring/public";
import { createTestLauncher, createTestWebspring } from "./webspringTestShell";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { useWebspringResponder } from "../../src/Webspring/useWebspringResponder";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment, authoriseTestRuntime } from "./helpers";

afterEach(cleanup);

function WebspringTestHost({ runtime, children, onNotificationCentreRequest }: PropsWithChildren<{
  runtime: ReturnType<typeof createWindowedTestRuntime>;
  onNotificationCentreRequest?: (notificationId?: string) => void;
}>) {
  useWebspringResponder({ onNotificationCentreRequest });
  return <>{children}</>;
}

function createWindowedTestRuntime(appId = "com.example.diagnostics") {
  const runtime = authoriseTestRuntime(createTestRuntime({ id: `runtime:webspring-window:${appId}` }));
  runtime.apps.registerBundle(createTestBundle({
    bundleIdentifier: appId,
    route: `/${appId.split(".").at(-1)}`,
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
        bundleIdentifier: "com.example.diagnostics", route: "/diagnostics", presentation: "appView",
        frame: { material: "standard", topBar: "standard", smoothSurface: "off" },
      }, { loadModule }), createTestBundle({
        bundleIdentifier: "com.example.contact", route: "/contact", presentation: "appView",
        frame: { material: "standard", topBar: "standard", smoothSurface: "off" },
      })],
    }));
    await runtime.boot({ initialPathname: "/diagnostics" });

    let connectedActions: WebspringActions | null = null;
    const orderedView = (testId: string) => createTestLauncher(({ model, actions }) => {
      connectedActions = actions;
      return <main data-testid={testId} data-app-order={model.apps.map((app) => app.bundleIdentifier).join(",")} />;
    }, "persistent");
    class ThrowingLauncher extends WSLauncherViewController {
      static override mode = "persistent" as const;
      override renderView(): never { throw new Error("fixture view failed"); }
    }
    const info = { bundleIdentifier: "com.example.webspring.host", displayName: "Host fixture", branding: { name: { key: "site.name", fallback: "Fixture" } } };
    const ConnectedLauncher = orderedView("connected-view");
    const MobileLauncher = orderedView("mobile-view");
    const connectedShell = createTestWebspring({ info, viewControllers: { desktop: ConnectedLauncher, tablet: ConnectedLauncher, mobile: MobileLauncher } });
    const throwingShell = createTestWebspring({ info, launcher: ThrowingLauncher });
    // A launcher-mode shell must home on the shell itself, so this one is refused when it is defined.
    expect(() => createTestWebspring({ info: { ...info, homeRoute: "/diagnostics" }, launcher: createTestLauncher() })).toThrow(/must resolve to the shell/);
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
    expect(runtime.store.getSnapshot().application.activeAppId).toBe("com.example.diagnostics");
    expect(loadModule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Use fallback view" }));
    const applicationAfter = await screen.findByTestId("stateful-application");
    expect(applicationAfter).toBe(applicationBefore);
    expect(document.querySelector("main.webspring-board")).not.toBeNull();
    expect(appMounts).toBe(1);
    expect(document.querySelectorAll(".webspring-application-outlet-host")).toHaveLength(1);
    mounted.rerender(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={connectedShell} /></SynCloudOSProvider>);
    expect(await screen.findByTestId("stateful-application")).toBe(applicationBefore);
    const reordered = await connectedActions!.reorder(["com.example.contact", "com.example.diagnostics"]);
    expect(reordered.status).toBe("completed");
    expect((await screen.findByTestId("mobile-view")).getAttribute("data-app-order")).toBe("com.example.contact,com.example.diagnostics");
    expect(appMounts).toBe(1);
    const invalidRoute = await connectedActions!.openApp("com.example.diagnostics", "/contact");
    expect(invalidRoute.status).toBe("failed");
    expect(runtime.store.getSnapshot().application.activeAppId).toBe("com.example.diagnostics");
    const contactRoute = await connectedActions!.openApp("com.example.contact");
    expect(contactRoute.status).toBe("completed");
    expect(runtime.store.getSnapshot().application).toMatchObject({ activeAppId: "com.example.contact", routePath: "/contact" });
    await runtime.dispose("persistent-outlet-test");
  });


  it("treats close-window and return-to-webspring as distinct commands", async () => {
    const runtime = createWindowedTestRuntime("com.example.diagnostics");
    const notificationRequests: Array<string | undefined> = [];
    render(
      <SynCloudOSProvider runtime={runtime}>
        <WebspringTestHost
          runtime={runtime}
          onNotificationCentreRequest={(notificationId) => notificationRequests.push(notificationId)}
        />
      </SynCloudOSProvider>,
    );

    expect(runtime.focus.getActiveAnchors()).toMatchObject({
      runtimeResponderId: "runtime",
      webspringResponderId: "webspring",
      workspaceResponderId: "workspace",
    });
    await runtime.commands.dispatch("webspring.notificationCentre.open", { notificationId: "notification:test" });
    expect(notificationRequests).toEqual(["notification:test"]);

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
