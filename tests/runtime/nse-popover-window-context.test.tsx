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
import { NSEWindowSurfaceBridgeProvider } from "../../src/NSE/Overlays/NSEWindowSurfaceBridge";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry, WindowLayer } from "../../src/Webspring/WindowLayer";
import { createTestBundle, createTestRuntime } from "./helpers";

class PaperController extends NSEViewController {
  constructor() { super(); this.title = "Controller paper"; this.preferredContentSize = { width: 240, height: 150 }; }
  static view = () => {
    const app = useContext(SynWareRuntimeContext);
    const kernel = useContext(SynCloudOSRuntimeContext);
    const services = useSCOS();
    return <div style={{ "--nse-popover-content-fill": "#efe2c6" } as React.CSSProperties}>
      <output data-testid="presented-app">{app?.app.bundleIdentifier}</output>
      <output data-testid="presented-kernel">{String(kernel === null)}</output>
      <input aria-label="Controller draft" defaultValue={services.signal.aborted ? "Aborted" : "Retained services"} />
      <NSEButton title="Run presenting action" action="contextProbe" />
    </div>;
  };
}

class RootController extends NSEViewController {
  calls = 0;
  @action({ title: { key: "probe", fallback: "Probe" } }) contextProbe() { this.calls++; }
  static view = ({ controller }: { controller: RootController }) => <button onClick={event => controller.presentAsPopover(PaperController, {
    of: event.currentTarget, preferredEdge: "maxY", drawsBackground: false,
  })}>Show paper</button>;
}

it("hosts presentAsPopover in one real window while retaining the application's services and authority boundary", async () => {
  const runtime = createTestRuntime();
  const bundleId = "com.example.popover-context";
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: bundleId }));
  const app = runtime.apps.getApp(bundleId)!;
  const responderId = `application:${bundleId}`;
  runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
  const registry = new WindowContentRendererRegistry();
  const bridge = createTransientWindowSurfaceBridge({ runtime, renderers: registry, physicalHostId: "controller-context", owner: { workspaceId: "workspace:default", applicationId: bundleId, applicationSessionId: bundleId }, restoreFocus: anchor => anchor.focus() });
  const root = new RootController();
  const view = render(<div data-syncloudos-runtime-owner={runtime.runtimeId}><SynCloudOSProvider runtime={runtime}>
    <HostSiteBrandingProvider value={{ name: "Fixture", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Fixture" }}>
      <NSEWindowSurfaceBridgeProvider bridge={bridge}><SynWareRuntimeMount runtime={runtime} app={app} responderId={responderId}>
        <NSEViewControllerView controller={root} />
      </SynWareRuntimeMount></NSEWindowSurfaceBridgeProvider>
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
    expect((screen.getByRole("textbox", { name: "Controller draft" }) as HTMLInputElement).value).toBe("Retained services");
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
