// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { AFXLayer } from "../../src/FX/AnimationFX/AFXLayer";
import { AFXTransform3D } from "../../src/FX/AnimationFX/AFXTransform3D";
import { GFXColour } from "../../src/FX/GraphicsFX/GFXColour";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppSDK/applicationHosting";
import { NSEAnimationEnvironmentProvider } from "../../src/NSE/Animation";
import { render } from "@testing-library/react";
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

  it("keeps a native backing layer inside its CSS-sized outlet across FX writes, resize, and unmount", async () => {
    let width = 320;
    let height = 150;
    const observed = new Map<ResizeObserver, { callback: ResizeObserverCallback; observer: ResizeObserver }>();
    const disconnected = new Set<ResizeObserver>();
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("native-fx-stage") ? width : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("native-fx-stage") ? height : 0;
    });
    vi.stubGlobal("ResizeObserver", class {
      constructor(readonly callback: ResizeObserverCallback) {}
      observe(_target: Element) {
        const observer = this as unknown as ResizeObserver;
        observed.set(observer, { callback: this.callback, observer });
      }
      unobserve() {}
      disconnect() { disconnected.add(this as unknown as ResizeObserver); }
    });
    let controller!: Stage;
    let backing!: AFXLayer;
    const orb = new AFXLayer();
    orb.frame = { x: 20, y: 30, width: 40, height: 40 };
    orb.backgroundColour = GFXColour.parse("red");
    orb.autoresizingMask = ["width", "height"];
    class Stage extends NSEViewController {
      static override view = () => <span>Native FX stage</span>;
      constructor() { super(); controller = this; }
      viewDidLoad() { backing = this.view.layer; backing.addSublayer(orb); }
    }
    class Parent extends NSEViewController {
      readonly stage = this.addChild(Stage);
      static override view = ({ controller }: { controller: Parent }) => <>
        <style>{".native-fx-stage { position: relative; width: 320px; height: 150px; }"}</style>
        <h2>Before the stage</h2>
        <NSEViewControllerView controller={controller.stage} className="native-fx-stage" />
      </>;
    }
    try {
      const { windows } = await openContent(Parent);
      const outlet = controller.view.element;
      expect(window.getComputedStyle(outlet).position).toBe("relative");
      expect(window.getComputedStyle(outlet).height).toBe("150px");
      expect(outlet.style.position).toBe("");
      expect(outlet.style.left).toBe("");
      expect(outlet.style.top).toBe("");
      expect(outlet.style.width).toBe("");
      expect(outlet.style.height).toBe("");
      expect(backing.bounds).toMatchObject({ width, height });
      const projection = outlet.lastElementChild as HTMLElement;
      expect(projection).not.toBe(screen.getByText("Native FX stage"));
      expect(projection.parentElement).toBe(outlet);
      expect(projection.style.width).toBe("40px");
      expect(projection.style.backgroundColor).toBe("rgb(255, 0, 0)");
      backing.opacity = 0.6;
      backing.transform = AFXTransform3D.translation(7, 9);
      orb.opacity = 0.4;
      expect(outlet.style.opacity).toBe("0.6");
      expect(AFXTransform3D.fromCSS(outlet.style.transform).toAffine()).toMatchObject({ tx: 7, ty: 9 });
      expect(projection.style.opacity).toBe("0.4");
      width = 480;
      height = 210;
      act(() => {
        for (const { callback, observer } of observed.values()) callback([], observer);
      });
      expect(backing.bounds).toMatchObject({ width, height });
      expect(orb.frame).toEqual({ x: 20, y: 30, width: 200, height: 100 });
      expect(projection.style.width).toBe("200px");
      expect(projection.style.height).toBe("100px");
      expect(outlet.style.height).toBe("");
      windows.unmount();
      await settle();
      expect(outlet.contains(projection)).toBe(false);
      expect(() => { orb.opacity = 1; }).toThrowError(expect.objectContaining({ code: "AFX_LAYER_DISPOSED" }));
      expect(outlet.getAttribute("style")).toBeNull();
      for (const { observer } of observed.values()) expect(disconnected.has(observer)).toBe(true);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
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
  it("calls layout hooks after DOM commits and frame resizes, and disconnects on unmount", async () => {
    let resized: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    const previous = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resized = callback; }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;
    const events: string[] = [];
    class Measured extends NSEViewController {
      static override view = () => <p>Measured content</p>;
      override viewWillLayout() { events.push(`will:${this.view.element.textContent}`); }
      override viewDidLayout() { events.push(`did:${this.view.element.textContent}`); }
    }
    const controller = new Measured({ owner: nseTestOwner() });
    try {
      const view = render(<NSEViewControllerView controller={controller} />);
      expect(events).toEqual(["will:Measured content", "did:Measured content"]);
      act(() => { resized!([], {} as ResizeObserver); });
      expect(events).toHaveLength(4);
      view.unmount();
      await settle();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      window.ResizeObserver = previous;
      controller.dispose();
    }
  });
  it("lets a scroll area's parent lay out the child's intrinsic height", async () => {
    class Chapter extends NSEViewController {
      static override view = () => <article style={{ height: 72 }}>Chapter</article>;
    }
    const parent = new NSEViewController({ owner: nseTestOwner() });
    const child = parent.addChild(Chapter);
    const view = render(<div style={{ overflow: "auto", height: 320 }}><NSEViewControllerView controller={child} /></div>);
    const frame = screen.getByText("Chapter").parentElement!;
    expect(frame.style.height).toBe("");
    expect(frame.style.width).toBe("");
    view.unmount();
    await settle();
    parent.dispose();
  });

  it("observes reduced-motion traits from the actual NSE animation environment", async () => {
    const changes: boolean[] = [];
    class Animated extends NSEViewController {
      static override view = ({ controller }: { controller: Animated }) => <output>{String(controller.traitCollection.reducedMotion)}</output>;
      override traitCollectionDidChange() { changes.push(this.traitCollection.reducedMotion); }
    }
    const controller = new Animated({ owner: nseTestOwner() });
    const view = render(<NSEAnimationEnvironmentProvider reducedMotion={false}><NSEViewControllerView controller={controller} /></NSEAnimationEnvironmentProvider>);
    expect(screen.getByText("false")).toBeTruthy();
    view.rerender(<NSEAnimationEnvironmentProvider reducedMotion><NSEViewControllerView controller={controller} /></NSEAnimationEnvironmentProvider>);
    expect(screen.getByText("true")).toBeTruthy();
    expect(changes).toEqual([true]);
    view.unmount();
    await settle();
    controller.dispose();
  });
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
