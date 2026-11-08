// @vitest-environment jsdom
import * as React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEArrayController } from "../../src/NSE/Controllers/NSEArrayController";
import { observable } from "../../src/NSE/Objects/observable";
import { applicationSessionFor } from "../../src/SynCloudOS/AppHosting/applicationSession";
import { createSynWareDefinitionFromApplicationClass } from "../../src/SynCloudOS/AppHosting/applicationClass";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });
const manifest = { schemaVersion: 1 as const, bundleIdentifier: "com.tests.inline", displayName: "Inline", version: "1.0.0" };

describe("inline class view hosting", () => {
  it("passes the actual owning window to a parameterized content root in its own construction scope", async () => {
    let root!: Root; let window!: Window;
    class Root extends NSEViewController {
      readonly rows = new NSEArrayController<{ id: string }>({ id: "root-rows", getId: value => value.id });
      constructor(readonly publisher: Window) { super(); root = this; }
      renderView() { return <p>{this.publisher.title}</p>; }
    }
    class Window extends NSEWindowController {
      static override contentViewControllerClass = Root;
      readonly rows = new NSEArrayController<{ id: string }>({ id: "window-rows", getId: value => value.id });
      readonly title = "Parameterized root window";
      constructor() { super(); window = this; }
    }
    class App extends NSEApplication { static override mainWindow = Window; }
    const host = createClassApplicationHost(App, "com.tests.parameterized-root"); hosts.push(host);
    await host.launch(); host.mountWindows(); await host.openMainWindow();
    expect(await screen.findByText("Parameterized root window")).toBeTruthy(); expect(root.publisher).toBe(window);
    act(() => { window.contentViewController = null; }); expect(root.rows.isDisposed).toBe(true); expect(window.rows.isDisposed).toBe(false);
  });
  it("hosts a shorthand main view in a real window, observes it, and preserves hook children and secondary identity", async () => {
    let root!: Root; let layouts = 0;
    function Local() { const [count, setCount] = React.useState(0); React.useLayoutEffect(() => { layouts++; }, []); return <button onClick={() => setCount(count + 1)}>Local {count}</button>; }
    class Root extends NSEViewController {
      @observable accessor title = "Original inline";
      constructor() { super(); root = this; }
      renderView() { return <><h1>{this.title}</h1><Local /></>; }
    }
    class Secondary extends NSEWindowController { static override view = () => <p>Secondary inline window</p>; }
    class App extends NSEApplication { static mainViewController = Root; static override windowControllers = { secondary: Secondary }; }
    const host = createClassApplicationHost(App, manifest.bundleIdentifier); hosts.push(host);
    await host.launch(); host.mountWindows(); await host.openMainWindow();
    expect(await screen.findAllByText("Original inline")).toHaveLength(1);
    expect(root.view.element.isConnected).toBe(true); expect(layouts).toBe(1);
    act(() => { root.title = "Updated inline"; }); expect(screen.getByText("Updated inline")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Local 0" })); expect(screen.getByText("Local 1")).toBeTruthy();
    const session = applicationSessionFor({ runtimeId: host.runtime.runtimeId, appId: host.appId })!;
    const main = session.windowControllers[0]; expect(main.contentViewController).toBe(root); expect(main.window.frame).not.toBeNull();
    await act(async () => { await session.app.openWindow(Secondary, { restorationKey: "secondary-inline" }); });
    expect(await screen.findByText("Secondary inline window")).toBeTruthy();
    expect(session.windowControllers[1]).toBeInstanceOf(Secondary); expect(session.windowControllers[1]).not.toBe(main);
  });

  it("constructs contentViewControllerClass with a fresh root scope and permits later replacement", async () => {
    class Root extends NSEViewController { renderView() { return <p>Declared root</p>; } }
    class Next extends NSEViewController { renderView() { return <p>Replacement root</p>; } }
    class Window extends NSEWindowController { static contentViewControllerClass = Root; }
    class App extends NSEApplication { static override mainWindow = Window; }
    const host = createClassApplicationHost(App); hosts.push(host); await host.launch(); host.mountWindows(); await host.openMainWindow();
    expect(await screen.findByText("Declared root")).toBeTruthy();
    const session = applicationSessionFor({ runtimeId: host.runtime.runtimeId, appId: host.appId })!;
    const window = session.windowControllers[0]; const previous = window.contentViewController!;
    act(() => { window.contentViewController = new Next({ owner: window }); });
    expect(screen.getByText("Replacement root")).toBeTruthy(); expect(previous.isDisposed).toBe(true);
  });

  it("rejects both main declarations before constructing the application", () => {
    let constructions = 0;
    class Root extends NSEViewController { renderView() { return null; } }
    class Window extends NSEWindowController {}
    class App extends NSEApplication { static override mainWindow = Window; static mainViewController = Root; constructor() { super(); constructions++; } }
    expect(() => createSynWareDefinitionFromApplicationClass(App, manifest)).toThrow(/mainWindow.*mainViewController|mainViewController.*mainWindow/);
    expect(constructions).toBe(0);
  });

  it("rejects conflicting render declarations before hosting", () => {
    class Root extends NSEViewController { static override view = () => null; renderView() { return null; } }
    class App extends NSEApplication { static mainViewController = Root; }
    expect(() => createSynWareDefinitionFromApplicationClass(App, manifest)).toThrow(/renderView.*static view|static view.*renderView/);
  });

  it("rejects conflicting window declarations before hosting", () => {
    class Root extends NSEViewController { renderView() { return null; } }
    class Window extends NSEWindowController { static override view = () => null; static contentViewControllerClass = Root; }
    class App extends NSEApplication { static override mainWindow = Window; }
    expect(() => createSynWareDefinitionFromApplicationClass(App, manifest)).toThrow(/contentViewControllerClass.*static view|static view.*contentViewControllerClass/);
  });

  it("rejects a constructor root that conflicts with its declared content class", () => {
    class Root extends NSEViewController { renderView() { return null; } }
    class Other extends NSEViewController { renderView() { return null; } }
    class Window extends NSEWindowController { static contentViewControllerClass = Root; constructor() { super(); this.contentViewController = new Other(); } }
    class App extends NSEApplication { static override mainWindow = Window; }
    const host = createClassApplicationHost(App); hosts.push(host);
    // The constructor runs only when the main window is requested.
    return host.launch().then(() => {
      const session = applicationSessionFor({ runtimeId: host.runtime.runtimeId, appId: host.appId })!;
      expect(() => session.controllerFor(null)).toThrow(/contentViewControllerClass|constructor/);
      expect(session.windowControllers).toEqual([]);
    });
  });
});
