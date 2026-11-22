// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { useNSEFocusPort } from "../../src/NSE/Focus";
import { useNSEOverlayProvider } from "../../src/NSE/Overlays";
import { useTooltipProvider } from "../../src/NSE/Tooltips";
import { useOptionalNSEControlRuntimePort } from "../../src/NSE/Controls/Core/useNSEControlCommand";
import { ViewAppearanceBoundary } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { SynCloudOSWatchdog } from "../../src/SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WSStageLayer } from "../../src/Webspring/WSStageLayer";
import { WSStageWindowHost } from "../../src/Webspring/WSStageWindowHost";
import { WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { createTestBundle, createTestRuntime } from "./helpers";

const hosts: SynWareTestHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
  cleanup();
});

const stageWindow = '[data-nse-control="window"][data-nse-part="background"][data-nse-presentation="stage"][data-nse-role="standard"]';

async function presentOnStage(view: () => React.ReactNode) {
  class MainWindow extends NSEWindowController {
    static override title = "Ledger";
    static override view = view;
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createSynWareTestHost({ application: Application, document,
    manifest: { schemaVersion: 1, bundleIdentifier: "com.example.ledger", displayName: "Ledger", version: "1.0.0" } });
  hosts.push(host);
  await act(async () => { await host.render(); });
  return host;
}

/** Counts mounted components of a type, from every React root in the document. */
function mountedCount(type: unknown) {
  let count = 0;
  const visit = (fiber: { type?: unknown; child?: unknown; sibling?: unknown } | null | undefined) => {
    for (let node = fiber; node; node = node.sibling as typeof fiber) {
      if (node.type === type) count++;
      visit(node.child as typeof fiber);
    }
  };
  for (const element of document.querySelectorAll("*")) {
    const key = Object.keys(element).find((name) => name.startsWith("__reactContainer$"));
    if (key) visit((element as unknown as Record<string, { child?: unknown }>)[key]);
  }
  return count;
}

it("renders a stage window", async () => {
  await presentOnStage(() => <p>Ledger body</p>);
  const frame = document.querySelector<HTMLElement>(stageWindow);
  expect(frame).not.toBeNull();
  expect(frame!.querySelector('[data-nse-control="window"][data-nse-part="header"] [data-nse-part="title"]')?.textContent).toBe("Ledger");
  expect(frame!.querySelector('[data-nse-part="content-view"]')?.textContent).toContain("Ledger body");
});

it("one watchdog and one appearance boundary", async () => {
  const runtime = createTestRuntime();
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.single", route: "/single" }));
  const app = runtime.apps.getApp("com.example.single")!;
  render(<SynCloudOSProvider runtime={runtime}><WSStageWindowHost windowContentRegistry={new WindowContentRendererRegistry()}
    stage={{ id: "application-stage:com.example.single", appId: app.bundleIdentifier, title: app.window.title, isFocused: true, zIndex: 1 }}
    app={app} lifecycle="active" /></SynCloudOSProvider>);
  expect(document.querySelector(stageWindow)).not.toBeNull();
  expect(mountedCount(SynCloudOSWatchdog)).toBe(1);
  expect(mountedCount(ViewAppearanceBoundary)).toBe(1);
});

it("providers still resolve", async () => {
  const resolved: Record<string, unknown> = {};
  function Probe() {
    resolved.overlay = useNSEOverlayProvider();
    resolved.tooltip = useTooltipProvider();
    resolved.focus = useNSEFocusPort();
    resolved.control = useOptionalNSEControlRuntimePort();
    return <p>Probe</p>;
  }
  await presentOnStage(() => <Probe />);
  const owner = document.querySelector<HTMLElement>(stageWindow)?.dataset.syncloudosRuntimeOwner;
  expect(document.querySelector(`${stageWindow} [data-nse-part="content-view"]`)?.textContent).toContain("Probe");
  expect(resolved.overlay).toBeTruthy();
  expect(resolved.tooltip).toBeTruthy();
  expect((resolved.focus as { runtimeId?: string } | null)?.runtimeId).toBe(owner);
  expect(resolved.control).toBeTruthy();
});

it("MultiSwitch roles", async () => {
  const runtime = createTestRuntime();
  runtime.apps.registerMany([
    createTestBundle({ bundleIdentifier: "com.example.from", route: "/from" }),
    createTestBundle({ bundleIdentifier: "com.example.to", route: "/to" }),
  ]);
  const apps = Object.fromEntries(runtime.apps.getAllApps().map((app) => [app.bundleIdentifier, app]));
  const registry = new WindowContentRendererRegistry();
  const layer = (switching: boolean) => <SynCloudOSProvider runtime={runtime}><WSStageLayer windowContentRegistry={registry} apps={apps}
    lifecycle={{ "com.example.from": "suspended", "com.example.to": "active" }} activeAppId="com.example.to"
    multiSwitch={switching ? { id: "switch:roles", status: "switching", fromAppId: "com.example.from", toAppId: "com.example.to",
      fromRoute: "/from", toRoute: "/to", source: "keyboard", startedAt: runtime.environment.now(), completedAt: null } : undefined} /></SynCloudOSProvider>;
  const view = render(layer(true));
  const transitions = Object.fromEntries([...view.container.querySelectorAll<HTMLElement>(stageWindow)]
    .map((frame) => [frame.dataset.syncloudosResponderId, frame.dataset.nseTransition]));
  expect(transitions).toEqual({ "application:com.example.from": "outgoing", "application:com.example.to": "incoming" });
  // The outgoing window keeps its role for its exit; once that settles, no window carries one.
  view.rerender(layer(false));
  await waitFor(() => expect(view.container.querySelectorAll(stageWindow)).toHaveLength(1));
  expect(view.container.querySelector(stageWindow)!.dataset.syncloudosResponderId).toBe("application:com.example.to");
  expect(view.container.querySelectorAll("[data-nse-transition]")).toHaveLength(0);
});

it("loading fallback", () => {
  const runtime = createTestRuntime();
  runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.pending", route: "/pending" },
    { loadModule: () => new Promise(() => {}) }));
  const app = runtime.apps.getApp("com.example.pending")!;
  render(<SynCloudOSProvider runtime={runtime}><WSStageWindowHost windowContentRegistry={new WindowContentRendererRegistry()}
    stage={{ id: "application-stage:com.example.pending", appId: app.bundleIdentifier, title: app.window.title, isFocused: true, zIndex: 1 }}
    app={app} lifecycle="loading" /></SynCloudOSProvider>);
  const loading = document.querySelector(`${stageWindow} [data-nse-part="content-view"] [data-nse-part="loading"][aria-busy="true"]`);
  expect(loading).not.toBeNull();
  expect(loading!.textContent).toContain("Loading");
});
