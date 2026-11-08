// @vitest-environment jsdom
import * as React from "react";
import { act, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { preference } from "../../src/NSE/Objects/preference";
import { observes } from "../../src/NSE/Objects/observes";
import { applicationSessionFor } from "../../src/SynCloudOS/AppHosting/applicationSession";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { useSCOS } from "../../src/SynCloudOS/AppSDK/scos";
import { fireEvent } from "@testing-library/react";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

it("preserves exact app-scoped primitive keys, hydrates before launch/load, shares two windows, and isolates runtimes", async () => {
  const seen: boolean[] = []; const roots: Root[] = [];
  class Root extends NSEViewController {
    @preference("sidebar.visible") accessor visible = true;
    constructor() { super(); roots.push(this); }
    renderView() { return <p>{this.visible ? "Visible preference" : "Hidden preference"}</p>; }
    override viewDidLoad() { seen.push(this.visible); }
    @observes("visible", { lifetime: "mounted", initial: true }) mounted(value: boolean) { expect(this.view.element.isConnected).toBe(true); seen.push(value); }
  }
  class Window extends NSEWindowController { static override contentViewControllerClass = Root; }
  class App extends NSEApplication {
    @preference("sidebar.visible") accessor visible = true;
    static override mainWindow = Window;
    override applicationWillFinishLaunching() { seen.push(this.visible); }
  }
  const first = createClassApplicationHost(App, "com.tests.preference-session"); hosts.push(first);
  first.runtime.persistence.setPreference(`${first.appId}:sidebar.visible`, false);
  await first.launch(); first.mountWindows(); await first.openMainWindow(); await screen.findByText("Hidden preference");
  const session = applicationSessionFor({ runtimeId: first.runtime.runtimeId, appId: first.appId })!;
  await act(async () => { await session.app.openWindow(Window, { restorationKey: "second-preference" }); });
  expect(await screen.findAllByText("Hidden preference")).toHaveLength(2);
  expect(seen).toEqual([false, false, false, false, false]);
  act(() => { roots[0].visible = true; });
  expect(screen.getAllByText("Visible preference")).toHaveLength(2);
  expect(first.runtime.persistence.getPreference(`${first.appId}:sidebar.visible`, false)).toBe(true);
  const other = createClassApplicationHost(App, "com.tests.preference-session"); hosts.push(other);
  await other.launch(); expect((applicationSessionFor({ runtimeId: other.runtime.runtimeId, appId: other.appId })!.app as App).visible).toBe(true);
});

it("updates decorated fields for ordinary SCOS persistence writes and removals immediately", async () => {
  function LegacyWriter() {
    const scos = useSCOS();
    return <><button onClick={() => scos.persistence.setPreference("sidebar.visible", false)}>Write old key</button><button onClick={() => scos.persistence.removePreference("sidebar.visible")}>Remove old key</button></>;
  }
  class Root extends NSEViewController {
    @preference("sidebar.visible") accessor visible = true;
    renderView() { return <><p>{this.visible ? "Legacy shown" : "Legacy hidden"}</p><LegacyWriter /></>; }
  }
  class App extends NSEApplication { static override mainViewController = Root; }
  const host = createClassApplicationHost(App, "com.tests.legacy-preference"); hosts.push(host);
  await host.launch(); host.mountWindows(); await host.openMainWindow(); await screen.findByText("Legacy shown");
  fireEvent.click(screen.getByRole("button", { name: "Write old key" })); expect(screen.getByText("Legacy hidden")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove old key" })); expect(screen.getByText("Legacy shown")).toBeTruthy();
});
