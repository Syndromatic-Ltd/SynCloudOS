// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import { NSEApplication, type NSEApplicationClass } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEArrayController, nseUnowned, type NSEControllerOwnershipOptions } from "../../src/NSE/Controllers";
import { NSEAdaptiveNavigationController, NSENavigationStackController, NSETabBarController } from "../../src/NSE/Navigation";
import { NSESplitViewController } from "../../src/NSE/DataViews/Split/NSESplitViewController";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
});

interface Note { readonly id: string }
function newNotes(id: string, options: NSEControllerOwnershipOptions = {}): NSEArrayController<Note> {
  return new NSEArrayController<Note>({ id, getId: (note) => note.id, ...options });
}

async function launched(AppClass: NSEApplicationClass | ComponentType, appId?: string) {
  const host = createClassApplicationHost(AppClass, appId);
  hosts.push(host);
  await host.launch();
  return host;
}

describe("ownership by structure", () => {
  it("owns controllers created while the application is constructed and disposes them when it closes, recording application-closed", async () => {
    let app!: FieldsApp;
    class FieldsApp extends NSEApplication {
      readonly fromField = newNotes("field");
      readonly fromConstructor: NSEArrayController<Note>;
      constructor() { super(); app = this; this.fromConstructor = newNotes("constructor"); }
    }
    const host = await launched(FieldsApp);
    expect(app.fromField.isDisposed).toBe(false);
    expect(app.fromConstructor.isDisposed).toBe(false);

    await host.quit();

    expect(app.fromField.disposalReason).toBe("application-closed");
    expect(app.fromConstructor.disposalReason).toBe("application-closed");
    expect(app.disposalReason).toBe("application-closed");
  });

  it("disposes a window controller's controllers when its window closes, with the reason window-closed", async () => {
    let controller!: OwningWindow;
    class OwningWindow extends NSEWindowController {
      static override view = function OwningView() { return <p>Owning window content</p>; };
      readonly rows = newNotes("window-rows");
      constructor() { super(); controller = this; }
    }
    class WindowedApp extends NSEApplication {
      static override mainWindow = OwningWindow;
    }
    const host = await launched(WindowedApp);
    host.mountWindows();
    const windowId = await host.openMainWindow();
    await screen.findByText("Owning window content");
    expect(controller.rows.isDisposed).toBe(false);

    await act(async () => { await host.runtime.windows.requestClose(windowId, { reason: "command" }); });

    expect(controller.rows.disposalReason).toBe("window-closed");
    expect(controller.disposalReason).toBe("window-closed");
  });

  it("disposes a view controller's controllers when it is removed from its parent, recording removed-from-parent", async () => {
    let parent!: ParentViewController;
    class RowsViewController extends NSEViewController {
      readonly rows = newNotes("child-rows");
    }
    class ParentViewController extends NSEViewController {
      readonly child = this.addChild(RowsViewController);
      constructor() { super(); parent = this; }
    }
    class RootWindow extends NSEWindowController {
      constructor() { super(); this.contentViewController = new ParentViewController(); }
    }
    class RootApp extends NSEApplication {
      static override mainWindow = RootWindow;
    }
    const host = await launched(RootApp);
    host.mountWindows();
    await host.openMainWindow();
    const { child } = parent;
    expect(child.rows.isDisposed).toBe(false);

    child.removeFromParent();

    expect(child.disposalReason).toBe("removed-from-parent");
    expect(child.rows.disposalReason).toBe("removed-from-parent");
    expect(parent.children).toEqual([]);
    expect(parent.isDisposed).toBe(false);
  });

  it("disposes view controllers, then window controllers, then the application, then what the application owns", async () => {
    const order: string[] = [];
    const record = (name: string) => (reason: string) => { order.push(`${name}:${reason}`); };
    class ChildViewController extends NSEViewController {
      readonly rows = newNotes("child-vc-rows");
      constructor(options = {}) { super(options); this.onDispose(record("child view controller")); this.rows.onDispose(record("child view controller's controller")); }
    }
    class RootViewController extends NSEViewController {
      readonly child = this.addChild(ChildViewController);
      constructor() { super(); this.onDispose(record("root view controller")); }
    }
    class OrderWindow extends NSEWindowController {
      readonly rows = newNotes("window-order-rows");
      constructor() {
        super();
        this.contentViewController = new RootViewController();
        this.onDispose(record("window controller"));
        this.rows.onDispose(record("window controller's controller"));
      }
    }
    class OrderApp extends NSEApplication {
      static override mainWindow = OrderWindow;
      readonly notes = newNotes("app-order-notes");
      constructor() { super(); this.onDispose(record("application")); this.notes.onDispose(record("application's controller")); }
    }
    const host = await launched(OrderApp);
    host.mountWindows();
    await host.openMainWindow();

    await host.quit();

    expect(order).toEqual([
      "child view controller:application-closed",
      "child view controller's controller:application-closed",
      "root view controller:application-closed",
      "window controller:application-closed",
      "window controller's controller:application-closed",
      "application:application-closed",
      "application's controller:application-closed",
    ]);
  });
});

describe("controllers created outside construction", () => {
  it("throws NSE_CONTROLLER_UNOWNED in a method, in a callback and after an await, and accepts owner: this", async () => {
    let app!: LateApp;
    let afterAwait: unknown;
    const tick = async () => { await Promise.resolve(); };
    class LateApp extends NSEApplication {
      constructor() { super(); app = this; }
      async applicationDidFinishLaunching() {
        await tick();
        try { newNotes("after-await"); } catch (error) { afterAwait = error; }
      }
      inMethod() { return newNotes("in-method"); }
      inCallback() { return [1].map(() => newNotes("in-callback")); }
      owned() { return newNotes("owned", { owner: this }); }
      deliberatelyUnowned() { return newNotes("unowned", { owner: nseUnowned }); }
    }
    const host = await launched(LateApp);

    expect(afterAwait).toMatchObject({ code: "NSE_CONTROLLER_UNOWNED" });
    expect(() => app.inMethod()).toThrowError(expect.objectContaining({ code: "NSE_CONTROLLER_UNOWNED" }));
    expect(() => app.inCallback()).toThrowError(expect.objectContaining({ code: "NSE_CONTROLLER_UNOWNED" }));

    const owned = app.owned();
    const unowned = app.deliberatelyUnowned();
    await host.quit();

    expect(owned.disposalReason).toBe("application-closed");
    expect(unowned.isDisposed).toBe(false);
    unowned.dispose();
  });

  it("throws NSE_CONTROLLER_UNOWNED for a view controller created after construction, and accepts owner", async () => {
    let controller!: LateWindow;
    class LateChild extends NSEViewController {}
    class LateWindow extends NSEWindowController {
      constructor() { super(); controller = this; }
      later() { return new LateChild(); }
      laterOwned() { return new LateChild({ owner: this }); }
    }
    class LateWindowApp extends NSEApplication {
      static override mainWindow = LateWindow;
    }
    const host = await launched(LateWindowApp);
    host.mountWindows();
    await host.openMainWindow();

    expect(() => controller.later()).toThrowError(expect.objectContaining({ code: "NSE_CONTROLLER_UNOWNED" }));
    const child = controller.laterOwned();
    expect(child.isDisposed).toBe(false);

    await host.quit();
    expect(child.disposalReason).toBe("application-closed");
  });

  it("lets a function-component application create controllers anywhere, as before", async () => {
    let made: NSEArrayController<Note> | undefined;
    function Shortcut() {
      made ??= newNotes("shortcut-notes");
      return <p>Shortcut content</p>;
    }
    const host = createClassApplicationHost(Shortcut, "com.example.shortcut-ownership-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    await host.openMainWindow();
    await screen.findByText("Shortcut content");

    expect(made?.isDisposed).toBe(false);
    made?.dispose();
  });
});

describe("StrictMode", () => {
  it("does not dispose the controllers a window controller and its view controller own", async () => {
    let window!: StrictWindow;
    let content!: StrictContent;
    const loads: string[] = [];
    class StrictContent extends NSEViewController {
      static override view = function StrictView() { return <p>Strict content</p>; };
      readonly rows = newNotes("strict-content-rows");
      constructor() { super(); content = this; }
      viewDidLoad() { loads.push("viewDidLoad"); }
    }
    class StrictWindow extends NSEWindowController {
      readonly rows = newNotes("strict-window-rows");
      constructor() { super(); window = this; this.contentViewController = new StrictContent(); }
    }
    class StrictApp extends NSEApplication {
      static override mainWindow = StrictWindow;
      readonly notes = newNotes("strict-app-notes");
    }
    const host = await launched(StrictApp, "com.example.strict-app");
    host.mountWindows({ strict: true });
    await host.openMainWindow();
    await screen.findByText("Strict content");
    // View controllers detach in a microtask, so let a replayed mount settle before asserting.
    await act(async () => { await Promise.resolve(); });

    expect(window.isDisposed).toBe(false);
    expect(window.rows.isDisposed).toBe(false);
    expect(content.isViewVisible).toBe(true);
    expect(content.isDisposed).toBe(false);
    expect(content.rows.isDisposed).toBe(false);
    expect(loads).toEqual(["viewDidLoad"]);
  });
});

describe("navigation controllers as view controllers", () => {
  const destinations = [
    { id: "home", label: "Home", icon: { kind: "template" as const, name: "home" } },
    { id: "files", label: "Files", icon: { kind: "template" as const, name: "files" } },
  ];

  it("dispose with the owner that constructs them", async () => {
    let app!: NavigationApp;
    class NavigationApp extends NSEApplication {
      readonly tabs = new NSETabBarController({ id: "tabs", destinations });
      readonly stack = new NSENavigationStackController({ id: "stack", destinationIds: ["detail"] });
      readonly split = new NSESplitViewController({
        id: "split",
        orientation: "horizontal",
        panes: [{ id: "content", minimum: 320, ideal: 720, maximum: Number.POSITIVE_INFINITY, collapsible: false, collapsePriority: 0 }],
      });
      readonly adaptive = new NSEAdaptiveNavigationController({
        id: "adaptive",
        model: "peer",
        presentation: "adaptive",
        tabController: this.tabs,
        traits: createStaticPresentationTraits({ width: 1440, height: 900 }),
      });
      constructor() { super(); app = this; }
    }
    const host = await launched(NavigationApp);
    const controllers = [app.tabs, app.stack, app.split, app.adaptive];
    expect(controllers.map((controller) => controller.isDisposed)).toEqual([false, false, false, false]);

    await host.quit();

    expect(controllers.map((controller) => controller.disposalReason)).toEqual([
      "application-closed", "application-closed", "application-closed", "application-closed",
    ]);
  });

  it("throw NSE_CONTROLLER_UNOWNED when created later without an owner, and take owner: this", async () => {
    let app!: LateNavigationApp;
    class LateNavigationApp extends NSEApplication {
      constructor() { super(); app = this; }
      unowned() { return new NSENavigationStackController({ id: "late-stack", destinationIds: ["detail"] }); }
      owned() { return new NSENavigationStackController({ id: "owned-stack", destinationIds: ["detail"], owner: this }); }
    }
    const host = await launched(LateNavigationApp);

    expect(() => app.unowned()).toThrowError(expect.objectContaining({ code: "NSE_CONTROLLER_UNOWNED" }));
    const owned = app.owned();
    await host.quit();
    expect(owned.disposalReason).toBe("application-closed");
  });
});
