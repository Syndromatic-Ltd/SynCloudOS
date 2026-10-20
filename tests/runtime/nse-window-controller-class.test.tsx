// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEApplication, type NSEApplicationClass } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
});

/** Builds an application whose main window is `Controller`, launches it and mounts its windows. */
async function openApplication(Controller: NonNullable<NSEApplicationClass["mainWindow"]>, appId?: string) {
  class WindowedApp extends NSEApplication {
    static override mainWindow = Controller;
  }
  const host = createClassApplicationHost(WindowedApp, appId);
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  const windowId = await host.openMainWindow();
  return { host, windowId, record: () => host.runtime.windows.select(windowId) };
}

describe("NSEWindowController window", () => {
  it("loads the window with its identity before the view renders, and reports key-window changes", async () => {
    const events: string[] = [];
    const keyEvents: string[] = [];
    let controller!: LoadingWindow;
    class LoadingWindow extends NSEWindowController {
      static override view = function LoadingView() { events.push("view rendered"); return <p>Loading window content</p>; };
      constructor() { super(); controller = this; }
      windowDidLoad() { events.push(`didLoad:${this.window.id}`); }
      windowDidBecomeKey() { keyEvents.push("didBecomeKey"); }
      windowDidResignKey() { keyEvents.push("didResignKey"); }
    }
    class OtherWindow extends NSEWindowController {
      static override view = function OtherView() { return <p>Other window content</p>; };
    }
    const { host, windowId } = await openApplication(LoadingWindow);
    await screen.findByText("Loading window content");

    expect(events[0]).toBe(`didLoad:${windowId}`);
    expect(events.indexOf("view rendered")).toBeGreaterThan(0);
    expect(keyEvents).toEqual(["didBecomeKey"]);
    expect(controller.window.isKey).toBe(true);

    let other!: NSEWindowController;
    await act(async () => { other = await controller.app.openWindow(OtherWindow); });
    act(() => { host.runtime.windows.makeKey(other.window.id!); });

    expect(controller.window.isKey).toBe(false);
    expect(keyEvents).toEqual(["didBecomeKey", "didResignKey"]);

    act(() => { controller.window.focus(); });

    expect(controller.window.isKey).toBe(true);
    expect(keyEvents).toEqual(["didBecomeKey", "didResignKey", "didBecomeKey"]);
  });

  it("renames the window when the title is assigned, including before it mounts", async () => {
    let controller!: TitledWindow;
    class TitledWindow extends NSEWindowController {
      static override view = function TitledView() { return <p>Titled content</p>; };
      constructor() { super(); controller = this; this.window.title = "Before mount"; }
      windowDidLoad() { this.window.title = `${this.window.title}, loaded`; }
    }
    const { record } = await openApplication(TitledWindow);
    await screen.findByText("Titled content");

    expect(record().record.title).toBe("Before mount, loaded");
    expect(controller.window.title).toBe("Before mount, loaded");

    act(() => { controller.window.title = "Receipts"; });
    expect(record().record.title).toBe("Receipts");
    expect(controller.window.title).toBe("Receipts");
  });

  it("minimises and zooms the window it manages", async () => {
    let controller!: ResizableWindow;
    class ResizableWindow extends NSEWindowController {
      static override view = function ResizableView() { return <p>Resizable content</p>; };
      constructor() { super(); controller = this; }
    }
    const { record } = await openApplication(ResizableWindow);
    await screen.findByText("Resizable content");

    act(() => { controller.window.zoom(); });
    expect(record().geometryState.zoomed).toBe(true);
    act(() => { controller.window.zoom(); });
    expect(record().geometryState.zoomed).toBe(false);

    expect(controller.window.isMinimised).toBe(false);
    act(() => { controller.window.minimise(); });
    expect(record().record.state).toBe("minimised");
    expect(controller.window.isMinimised).toBe(true);
  });

  it("throws NSE_VIEW_NOT_LOADED from window members before the window mounts and after it unmounts", async () => {
    let early: unknown;
    let controller!: UnmountedWindow;
    class UnmountedWindow extends NSEWindowController {
      static override view = function UnmountedView() { return <p>Unmounted content</p>; };
      constructor() {
        super();
        controller = this;
        try { this.window.minimise(); } catch (error) { early = error; }
      }
    }
    const { host } = await openApplication(UnmountedWindow);
    await screen.findByText("Unmounted content");

    expect(early).toMatchObject({ code: "NSE_VIEW_NOT_LOADED" });
    expect(() => controller.window.zoom()).not.toThrow();

    host.unmountWindows();

    expect(() => controller.window.zoom()).toThrowError(expect.objectContaining({ code: "NSE_VIEW_NOT_LOADED" }));
  });
});

describe("NSEWindowController closing", () => {
  it("keeps the window open when windowShouldClose returns false, and closes it once it returns true", async () => {
    const events: string[] = [];
    let allow = false;
    class GuardedWindow extends NSEWindowController {
      static override view = function GuardedView() { return <p>Guarded content</p>; };
      async windowShouldClose() { events.push("shouldClose"); await Promise.resolve(); return allow; }
      windowWillClose() { events.push("willClose"); }
    }
    const { host, windowId, record } = await openApplication(GuardedWindow);
    await screen.findByText("Guarded content");

    const refused = await host.runtime.windows.requestClose(windowId, { reason: "command" });

    expect(refused.outcome).toBe("refused");
    expect(record().record.state).toBe("open");
    expect(screen.queryByText("Guarded content")).toBeTruthy();
    expect(events).toEqual(["shouldClose"]);

    allow = true;
    const closed = await host.runtime.windows.requestClose(windowId, { reason: "command" });

    expect(closed.outcome).toBe("closed");
    expect(events).toEqual(["shouldClose", "shouldClose", "willClose"]);
  });

  it("disposes the window controller with the reason window-closed once the window closes", async () => {
    let controller!: ClosingWindow;
    class ClosingWindow extends NSEWindowController {
      static override view = function ClosingView() { return <p>Closing content</p>; };
      constructor() { super(); controller = this; }
    }
    const { host, windowId } = await openApplication(ClosingWindow);
    await screen.findByText("Closing content");
    expect(controller.isDisposed).toBe(false);

    await act(async () => { await host.runtime.windows.requestClose(windowId, { reason: "command" }); });

    expect(controller.isDisposed).toBe(true);
    expect(controller.disposalReason).toBe("window-closed");
  });

  it("reports a refused close through window.close()", async () => {
    let controller!: StubbornWindow;
    class StubbornWindow extends NSEWindowController {
      static override view = function StubbornView() { return <p>Stubborn content</p>; };
      constructor() { super(); controller = this; }
      windowShouldClose() { return false; }
    }
    await openApplication(StubbornWindow);
    await screen.findByText("Stubborn content");

    await expect(controller.window.close()).resolves.toBe("refused");
  });

  it("does not ask windowShouldClose when the application quits, leaving the decision to applicationShouldTerminate", async () => {
    const events: string[] = [];
    class QuittingApp extends NSEApplication {
      static override mainWindow = class QuitWindow extends NSEWindowController {
        static override view = function QuitView() { return <p>Quit content</p>; };
        windowShouldClose() { events.push("windowShouldClose"); return false; }
        windowWillClose() { events.push("windowWillClose"); }
      };
      applicationShouldTerminate() { events.push("applicationShouldTerminate"); return true; }
    }
    const host = createClassApplicationHost(QuittingApp, "com.example.quitting-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    const windowId = await host.openMainWindow();
    await screen.findByText("Quit content");

    const result = await host.quit();

    expect(result).toMatchObject({ status: "completed", committed: true });
    expect(events).toContain("applicationShouldTerminate");
    expect(events).not.toContain("windowShouldClose");
    expect(events).toContain("windowWillClose");
    expect(host.runtime.windows.list().map(({ id }) => id)).not.toContain(windowId);
  });

  it("keeps the windows open when the application vetoes the quit", async () => {
    const events: string[] = [];
    class VetoingApp extends NSEApplication {
      static override mainWindow = class VetoWindow extends NSEWindowController {
        static override view = function VetoView() { return <p>Veto content</p>; };
        windowWillClose() { events.push("windowWillClose"); }
      };
      applicationShouldTerminate() { return false; }
    }
    const host = createClassApplicationHost(VetoingApp, "com.example.vetoing-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    const windowId = await host.openMainWindow();
    await screen.findByText("Veto content");

    const result = await host.quit();

    expect(result).toMatchObject({ committed: false });
    expect(host.runtime.windows.select(windowId).record.state).toBe("open");
    expect(events).toEqual([]);
  });
});

describe("opening more windows", () => {
  it("opens another window controller with openWindow and gives it its own view", async () => {
    let app!: MultiWindowApp;
    class InspectorWindow extends NSEWindowController {
      static override view = function InspectorView() { return <p>Inspector content</p>; };
    }
    class MultiWindowApp extends NSEApplication {
      static override mainWindow = class MainWindow extends NSEWindowController {
        static override view = function MainView() { return <p>Main content</p>; };
      };
      constructor() { super(); app = this; }
    }
    const host = createClassApplicationHost(MultiWindowApp, "com.example.multi-window-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    await host.openMainWindow();
    await screen.findByText("Main content");

    let inspector!: InspectorWindow;
    await act(async () => { inspector = await app.openWindow(InspectorWindow, { title: "Inspector" }); });

    expect(await screen.findByText("Inspector content")).toBeTruthy();
    expect(app.windows).toContain(inspector);
    expect(inspector.window.title).toBe("Inspector");
    expect(inspector.app).toBe(app);
  });
});

describe("content view controller", () => {
  it("renders the content view controller instead of static view, and disposes the previous one when it is replaced", async () => {
    let controller!: HostWindow;
    class FirstContent extends NSEViewController {
      static override view = function FirstView() { return <p>First content</p>; };
    }
    class SecondContent extends NSEViewController {
      static override view = function SecondView() { return <p>Second content</p>; };
    }
    class HostWindow extends NSEWindowController {
      static override view = function IgnoredView() { return <p>Static view content</p>; };
      constructor() { super(); controller = this; this.contentViewController = new FirstContent(); }
    }
    await openApplication(HostWindow);
    await screen.findByText("First content");
    expect(screen.queryByText("Static view content")).toBeNull();

    const first = controller.contentViewController!;
    act(() => { controller.contentViewController = new SecondContent({ owner: controller }); });

    expect(await screen.findByText("Second content")).toBeTruthy();
    expect(first.isDisposed).toBe(true);
    expect(first.disposalReason).toBe("removed-from-parent");
  });
});
