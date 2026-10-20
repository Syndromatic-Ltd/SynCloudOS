// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { AFXLayer } from "../../src/FX/AnimationFX/AFXLayer";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppSDK/applicationHosting";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
});

/** Opens an application whose main window shows `Root` as its content view controller. */
async function openContent(Root: new () => NSEViewController<unknown>, appId?: string) {
  class RootWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Root(); }
  }
  class RootApp extends NSEApplication {
    static override mainWindow = RootWindow;
  }
  const host = createClassApplicationHost(RootApp, appId);
  hosts.push(host);
  await host.launch();
  const windows = host.mountWindows();
  await host.openMainWindow();
  return { host, windows };
}

/** View controllers unmount in a microtask, so a StrictMode replay is not mistaken for a removal. */
const settle = () => act(async () => { await Promise.resolve(); });

describe("view controller lifecycle", () => {
  it("loads once, then appears, and disappears when its view unmounts", async () => {
    const events: string[] = [];
    class Lifecycle extends NSEViewController {
      static override view = function LifecycleView() { return <p>Lifecycle content</p>; };
      viewDidLoad() { events.push("viewDidLoad"); }
      viewWillAppear() { events.push("viewWillAppear"); }
      viewDidAppear() { events.push("viewDidAppear"); }
      viewWillDisappear() { events.push("viewWillDisappear"); }
      viewDidDisappear() { events.push("viewDidDisappear"); }
    }
    const { windows } = await openContent(Lifecycle);
    await screen.findByText("Lifecycle content");

    expect(events).toEqual(["viewDidLoad", "viewWillAppear", "viewDidAppear"]);

    windows.unmount();
    await settle();

    expect(events).toEqual(["viewDidLoad", "viewWillAppear", "viewDidAppear", "viewWillDisappear", "viewDidDisappear"]);
  });

  it("appears again without loading again when its view mounts a second time", async () => {
    const events: string[] = [];
    let controller!: Remounted;
    class Remounted extends NSEViewController {
      static override view = function RemountedView() { return <p>Remounted content</p>; };
      constructor() { super(); controller = this; }
      viewDidLoad() { events.push("viewDidLoad"); }
      viewDidAppear() { events.push("viewDidAppear"); }
      viewDidDisappear() { events.push("viewDidDisappear"); }
    }
    const { host, windows } = await openContent(Remounted);
    await screen.findByText("Remounted content");
    windows.unmount();
    await settle();
    expect(controller.isViewVisible).toBe(false);

    host.mountWindows();
    await screen.findByText("Remounted content");

    expect(events).toEqual(["viewDidLoad", "viewDidAppear", "viewDidDisappear", "viewDidAppear"]);
    expect(controller.isViewVisible).toBe(true);
  });

  it("does not report a disappearance when StrictMode replays the mount", async () => {
    const events: string[] = [];
    class Strict extends NSEViewController {
      static override view = function StrictContentView() { return <p>Strict view content</p>; };
      viewDidLoad() { events.push("viewDidLoad"); }
      viewDidAppear() { events.push("viewDidAppear"); }
      viewWillDisappear() { events.push("viewWillDisappear"); }
    }
    class StrictWindow extends NSEWindowController {
      constructor() { super(); this.contentViewController = new Strict(); }
    }
    class StrictApp extends NSEApplication {
      static override mainWindow = StrictWindow;
    }
    const host = createClassApplicationHost(StrictApp, "com.example.strict-view-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows({ strict: true });
    await host.openMainWindow();
    await screen.findByText("Strict view content");
    await settle();

    expect(events).toEqual(["viewDidLoad", "viewDidAppear"]);
  });

  it("renders a child view controller's view inside its parent's and loads the child with it", async () => {
    const events: string[] = [];
    class Child extends NSEViewController {
      static override view = function ChildView() { return <p>Child content</p>; };
      viewDidLoad() { events.push("child viewDidLoad"); }
    }
    class Parent extends NSEViewController {
      static override view = function ParentView({ controller }: { readonly controller: Parent }) {
        return <section><p>Parent content</p><NSEViewControllerView controller={controller.child} /></section>;
      };
      readonly child = this.addChild(Child);
      viewDidLoad() { events.push("parent viewDidLoad"); }
    }
    await openContent(Parent);

    expect(await screen.findByText("Parent content")).toBeTruthy();
    expect(await screen.findByText("Child content")).toBeTruthy();
    expect(events.sort()).toEqual(["child viewDidLoad", "parent viewDidLoad"]);
  });
});

describe("view.layer", () => {
  it("throws NSE_VIEW_NOT_LOADED before the view mounts, hands out a layer while it is mounted, and throws again after it unmounts", async () => {
    let early: unknown;
    let layerInViewDidLoad: AFXLayer | undefined;
    let controller!: Layered;
    class Layered extends NSEViewController {
      static override view = function LayeredView() { return <p>Layered content</p>; };
      constructor() {
        super();
        controller = this;
        try { void this.view.layer; } catch (error) { early = error; }
      }
      viewDidLoad() { layerInViewDidLoad = this.view.layer; }
    }
    const { windows } = await openContent(Layered);
    await screen.findByText("Layered content");

    expect(early).toMatchObject({ code: "NSE_VIEW_NOT_LOADED" });
    expect(layerInViewDidLoad).toBeInstanceOf(AFXLayer);
    expect(controller.view.layer).toBe(layerInViewDidLoad);
    expect(controller.view.isLoaded).toBe(true);

    windows.unmount();
    await settle();

    expect(() => controller.view.layer).toThrowError(expect.objectContaining({ code: "NSE_VIEW_NOT_LOADED" }));
    expect(() => controller.view.element).toThrowError(expect.objectContaining({ code: "NSE_VIEW_NOT_LOADED" }));
  });

  it("attaches a layer made with new AFXLayer() when it is added to view.layer", async () => {
    const drawn = new AFXLayer();
    class Drawing extends NSEViewController {
      static override view = function DrawingView() { return <p>Drawing content</p>; };
      viewDidLoad() { this.view.layer.addSublayer(drawn); }
    }
    expect(drawn.isAttached).toBe(false);
    await openContent(Drawing);
    await screen.findByText("Drawing content");

    expect(drawn.isAttached).toBe(true);
  });

  it("gives a view that mounts again a layer bound to its new element", async () => {
    let controller!: Rebound;
    class Rebound extends NSEViewController {
      static override view = function ReboundView() { return <p>Rebound content</p>; };
      constructor() { super(); controller = this; }
    }
    const { host, windows } = await openContent(Rebound);
    await screen.findByText("Rebound content");
    const first = controller.view.layer;
    windows.unmount();
    await settle();

    host.mountWindows();
    await screen.findByText("Rebound content");

    expect(controller.view.layer).toBeInstanceOf(AFXLayer);
    expect(controller.view.layer).not.toBe(first);
  });
});

describe("child view controllers", () => {
  it("adds a class or an instance as a child, and rejects a second parent and a cycle", () => {
    class Plain extends NSEViewController {}
    class Holder extends NSEViewController {
      fromClass() { return this.addChild(Plain); }
      fromInstance(child: Plain) { return this.addChild(child); }
    }
    const holder = new Holder({ owner: nseTestOwner() });
    const other = new Holder({ owner: nseTestOwner() });
    const instance = new Plain({ owner: nseTestOwner() });

    const created = holder.fromClass();
    expect(created.parent).toBe(holder);
    expect(holder.fromInstance(instance)).toBe(instance);
    expect(holder.children).toEqual([created, instance]);

    expect(() => other.fromInstance(instance)).toThrow(/already has a parent/);
    expect(() => created.addChild(holder)).toThrow(/descendant/);
    expect(() => holder.addChild(holder)).toThrow(/its own child/);
  });

  it("disposes children with their parent and leaves the parent when a child is removed", () => {
    class Plain extends NSEViewController {}
    const parent = new Plain({ owner: nseTestOwner() });
    const keep = parent.addChild(Plain);
    const drop = parent.addChild(Plain);

    drop.removeFromParent();
    expect(parent.children).toEqual([keep]);
    expect(drop.disposalReason).toBe("removed-from-parent");

    parent.dispose();
    expect(keep.disposalReason).toBe("explicit");
    expect(parent.disposalReason).toBe("explicit");
  });
});

/** A throwaway owner for view controllers built outside an application. */
function nseTestOwner() {
  return { ownerSignal: new AbortController().signal };
}
