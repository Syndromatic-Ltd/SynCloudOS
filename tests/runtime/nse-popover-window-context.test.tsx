// @vitest-environment jsdom
import React, { useContext } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { action } from "../../src/SynCloudOS/AppSDK/actions";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { useSCOS } from "../../src/SynCloudOS/AppSDK/scos/useSCOS";
import { SynCloudOSRuntimeContext, SynWareRuntimeContext } from "../../src/SynCloudOSReact/runtimeContext";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WindowSurfaceBridgeProvider } from "../../src/NSE/Overlays/NSEWindowSurfaceBridge";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry, WindowLayer } from "../../src/Webspring/WindowLayer";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

class PaperController extends NSEViewController {
  constructor(readonly showsDraft = true) { super(); this.title = "Controller paper"; this.preferredContentSize = { width: 240, height: 150 }; }
  static view = ({ controller }: { controller: PaperController }) => {
    const app = useContext(SynWareRuntimeContext);
    const kernel = useContext(SynCloudOSRuntimeContext);
    const services = useSCOS();
    return <div style={{ "--nse-popover-content-fill": "#efe2c6" } as React.CSSProperties}>
      <output data-testid="presented-app">{app?.app.bundleIdentifier}</output>
      <output data-testid="presented-kernel">{String(kernel === null)}</output>
      {controller.showsDraft ? <input aria-label="Controller draft" defaultValue={services.signal.aborted ? "Aborted" : "Retained services"} /> : null}
      <NSEButton title="Run presenting action" action="contextProbe" />
    </div>;
  };
}

class RootController extends NSEViewController {
  calls = 0;
  showsDraft = true;
  @action({ title: { key: "probe", fallback: "Probe" } }) contextProbe() { this.calls++; }
  static view = ({ controller }: { controller: RootController }) => <button onClick={event => controller.presentAsPopover(PaperController, {
    of: event.currentTarget, preferredEdge: "maxY", drawsBackground: false,
  }, controller.showsDraft)}>Show paper</button>;
}

it.each(["desktop", "compact"])("hosts presentAsPopover in a real %s window while retaining application services and actions", async mode => {
  const environment = createTestRuntimeEnvironment();
  const compact = mode === "compact";
  if (compact) {
    const bounds = { width: 390, height: 844 };
    const viewport = { ...bounds, offsetLeft: 0, offsetTop: 0, scale: 1 };
    const workArea = { ...bounds, x: 0, y: 0, devicePixelRatio: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } };
    environment.layoutViewport = { getSnapshot: () => bounds, subscribe: () => () => undefined };
    environment.visualViewport = { getSnapshot: () => viewport, subscribe: () => () => undefined };
    environment.workArea = { getSnapshot: () => workArea, subscribe: () => () => undefined };
  }
  const runtime = createTestRuntime({ environment });
  const bundleId = "com.example.popover-context";
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: bundleId }));
  const app = runtime.apps.getApp(bundleId)!;
  const responderId = `application:${bundleId}`;
  runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
  const registry = new WindowContentRendererRegistry();
  const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: registry, physicalHostId: "controller-context", owner: { workspaceId: "workspace:default", applicationId: bundleId, applicationSessionId: bundleId }, restoreFocus: anchor => anchor.focus() });
  const root = new RootController();
  root.showsDraft = !compact;
  const view = render(<div data-syncloudos-runtime-owner={runtime.runtimeId}><SynCloudOSProvider runtime={runtime}>
    <HostSiteBrandingProvider value={{ name: "Fixture", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Fixture" }}>
      <WindowSurfaceBridgeProvider bridge={bridge}><SynWareRuntimeMount runtime={runtime} app={app} responderId={responderId}>
        <NSEViewControllerView controller={root} />
      </SynWareRuntimeMount></WindowSurfaceBridgeProvider>
      <WindowLayer contentRegistry={registry} />
    </HostSiteBrandingProvider>
  </SynCloudOSProvider></div>);
  try {
    const anchor = screen.getByRole("button", { name: "Show paper" });
    fireEvent.click(anchor);
    const surface = await screen.findByRole("dialog", { name: "Controller paper" });
    expect(surface.closest("[data-window-host]")).not.toBeNull();
    expect(runtime.windows.list({ role: "popover" })).toHaveLength(1);
    expect(screen.getByTestId("presented-app").textContent).toBe(bundleId);
    expect(screen.getByTestId("presented-kernel").textContent).toBe("true");
    if (!compact) expect((screen.getByRole("textbox", { name: "Controller draft" }) as HTMLInputElement).value).toBe("Retained services");
    const actionButton = screen.getByRole("button", { name: "Run presenting action" });
    await waitFor(() => expect((actionButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(actionButton);
    await waitFor(() => expect(root.calls).toBe(1));
    fireEvent.keyDown(surface, { key: "Escape" });
    await waitFor(() => expect(runtime.windows.list({ role: "popover" })).toHaveLength(0));
    await waitFor(() => expect(root.presentedViewControllers).toHaveLength(0));
    await waitFor(() => expect(document.activeElement).toBe(anchor));
  } finally { view.unmount(); root.dispose(); bridge.dispose(); registry.dispose(); await runtime.dispose("test"); }
});
