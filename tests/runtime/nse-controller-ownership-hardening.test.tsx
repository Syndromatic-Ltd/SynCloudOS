// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import * as objectLifetime from "../../src/NSE/Application/objectLifetime";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEArrayController } from "../../src/NSE/Controllers/NSEArrayController";
import { instantiateInOwnerScope, NSEOwnershipScope, nseUnowned } from "../../src/NSE/Controllers/ownership";
import { ApplicationSession } from "../../src/SynCloudOS/AppHosting/applicationSession";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
const owned: Array<{ dispose(): void }> = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
  for (const object of owned.splice(0).reverse()) {
    try { object.dispose(); } catch { /* Throwing teardown is part of the regression. */ }
  }
});
const view = () => {
  const value = new NSEViewController({ owner: nseUnowned });
  owned.push(value);
  return value;
};
const window = () => {
  const value = new NSEWindowController({ owner: nseUnowned });
  owned.push(value);
  return value;
};
const rows = (options = {}) => new NSEArrayController<{ id: string }>({ id: "rows", getId: row => row.id, ...options });

describe("controller ownership hardening", () => {
  it.each(["view", "window"] as const)("rejects a %s controller's disposed owner before derived fields run", kind => {
    const owner = view();
    owner.dispose();
    let effects = 0;
    const Base = kind === "view" ? NSEViewController : NSEWindowController;
    class Derived extends Base { readonly effect = ++effects; }
    expect(() => new Derived({ owner })).toThrow();
    expect(effects).toBe(0);
  });

  it("rejects a released framework scope before entering the constructor", () => {
    const scope = new NSEOwnershipScope("NSEViewController", "released");
    scope.release("explicit");
    const construct = vi.fn(() => new NSEViewController());
    expect(() => instantiateInOwnerScope(scope, construct)).toThrow();
    expect(construct).not.toHaveBeenCalled();
  });

  it.each(["owner", "ownerSignal"] as const)("rejects controllers created with %s during their owner's teardown", option => {
    let effects = 0;
    let error: unknown;
    class Late extends NSEViewController { readonly effect = ++effects; }
    class Owner extends NSEViewController {
      protected override didDispose() {
        try { new Late(option === "owner" ? { owner: this } : { ownerSignal: this.ownerSignal }); } catch (caught) { error = caught; }
      }
    }
    const owner = new Owner({ owner: nseUnowned });
    owned.push(owner);
    owner.dispose();
    expect(error).toBeTruthy();
    expect(effects).toBe(0);
  });

  it.each(["disposed", "child", "other-window"] as const)("preserves content pointer, snapshot and ownership on rejected %s assignment", invalid => {
    const host = window();
    const previous = view();
    host.contentViewController = previous;
    const candidate = view();
    const parent = view();
    const other = window();
    if (invalid === "disposed") candidate.dispose();
    if (invalid === "child") parent.addChild(candidate);
    if (invalid === "other-window") other.contentViewController = candidate;
    const snapshot = host.getSnapshot();
    const changed = vi.fn();
    host.subscribe(changed);
    expect(() => { host.contentViewController = candidate; }).toThrow();
    expect(host.contentViewController).toBe(previous);
    expect(host.getSnapshot()).toBe(snapshot);
    expect(changed).not.toHaveBeenCalled();
    expect(previous.isDisposed).toBe(false);
    host.dispose();
    expect(previous.isDisposed).toBe(true);
    if (invalid === "other-window") {
      expect(candidate.isDisposed).toBe(false);
      other.dispose();
      expect(candidate.isDisposed).toBe(true);
    }
  });

  it("rejects child containment of a window root without moving it", () => {
    const host = window();
    const root = view();
    const parent = view();
    host.contentViewController = root;
    expect(() => parent.addChild(root)).toThrow();
    expect(parent.children).toEqual([]);
    expect(root.parent).toBeNull();
    parent.dispose();
    expect(root.isDisposed).toBe(false);
    host.dispose();
    expect(root.isDisposed).toBe(true);
  });

  it("rolls back addChild(Class) resources and scopes while preserving the constructor error", () => {
    const parent = view();
    const original = new Error("child constructor failed");
    let failed!: Failing;
    class Failing extends NSEViewController {
      readonly rows = rows();
      readonly child = this.addChild(NSEViewController);
      constructor() { super(); failed = this; throw original; }
      protected override didDispose() { throw new Error("cleanup also failed"); }
    }
    const before = parent.getSnapshot();
    expect(() => parent.addChild(Failing)).toThrow(original);
    expect(failed.isDisposed).toBe(true);
    expect(failed.ownerSignal.aborted).toBe(true);
    expect(failed.rows.isDisposed).toBe(true);
    expect(failed.child.isDisposed).toBe(true);
    expect(parent.children).toEqual([]);
    expect(parent.getSnapshot()).toBe(before);
    expect(parent.ownerSignal.aborted).toBe(false);
    const valid = parent.addChild(NSEViewController);
    expect(valid.isDisposed).toBe(false);
  });

  it("rolls back a window constructor that throws after super without retaining it in the session", () => {
    const original = new Error("window constructor failed");
    let failed!: FailingWindow;
    class FailingWindow extends NSEWindowController {
      readonly rows = rows();
      constructor() {
        super(); failed = this;
        this.contentViewController = new NSEViewController();
        throw original;
      }
      protected override didDispose() { throw new Error("window cleanup also failed"); }
    }
    class App extends NSEApplication { static override mainWindow = FailingWindow; }
    const session = new ApplicationSession({ runtimeId: "failed-window", appId: "tests.failed-window" }, {
      AppClass: App, appName: "Failure", strictOwnership: true,
    });
    owned.push(session);
    expect(() => session.controllerFor(null)).toThrow(original);
    expect(failed.isDisposed).toBe(true);
    expect(failed.ownerSignal.aborted).toBe(true);
    expect(failed.rows.isDisposed).toBe(true);
    expect(failed.contentViewController?.isDisposed).toBe(true);
    expect(session.windowControllers).toEqual([]);
    expect(session.app.isDisposed).toBe(false);
  });

  it.each(["view", "window"] as const)("publishes %s disposal once even if didDispose throws", kind => {
    const error = new Error("teardown");
    const Base = kind === "view" ? NSEViewController : NSEWindowController;
    class Throwing extends Base { protected override didDispose() { throw error; } }
    const controller = new Throwing({ owner: nseUnowned });
    owned.push(controller);
    const changed = vi.fn();
    const disposed = vi.fn();
    controller.subscribe(changed);
    controller.onDispose(disposed);
    const before = controller.getSnapshot();
    expect(() => controller.dispose()).toThrow(error);
    expect(controller.isDisposed).toBe(true);
    expect(controller.ownerSignal.aborted).toBe(true);
    expect(controller.getSnapshot()).not.toBe(before);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(disposed).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it.each(["view", "window"] as const)("removes disposed %s content from the production host even when didDispose throws", async kind => {
    const error = new Error("host teardown");
    let root!: Content;
    let hostWindow!: HostWindow;
    class Content extends NSEViewController {
      static override view = () => <p>Ownership hardening mounted content</p>;
      constructor() { super(); root = this; }
      protected override didDispose() { if (kind === "view") throw error; }
    }
    class HostWindow extends NSEWindowController {
      constructor() { super(); hostWindow = this; this.contentViewController = new Content(); }
      protected override didDispose() { if (kind === "window") throw error; }
    }
    class App extends NSEApplication { static override mainWindow = HostWindow; }
    const host = createClassApplicationHost(App);
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    await host.openMainWindow();
    expect(await screen.findByText("Ownership hardening mounted content")).toBeTruthy();
    act(() => { expect(() => (kind === "view" ? root : hostWindow).dispose()).toThrow(error); });
    expect(screen.queryByText("Ownership hardening mounted content")).toBeNull();
  });

  it("keeps nested field resources with the root when explicitly owned by this", () => {
    class Root extends NSEViewController { readonly rows = rows({ owner: this }); }
    class HostWindow extends NSEWindowController {
      readonly windowRows = rows();
      constructor() { super(); this.contentViewController = new Root(); }
    }
    const host = instantiateInOwnerScope(new NSEOwnershipScope("NSEWindowController", "nested"), () => new HostWindow());
    owned.push(host);
    const root = host.contentViewController as Root;
    host.contentViewController = null;
    expect(root.rows.isDisposed).toBe(true);
    expect(host.windowRows.isDisposed).toBe(false);
  });

  it("records the ambient limit for raw nested constructors without changing later window fields", () => {
    class Root extends NSEViewController { readonly rows = rows(); }
    class HostWindow extends NSEWindowController {
      readonly root = new Root();
      readonly laterWindowRows = rows();
      constructor() { super(); this.contentViewController = this.root; }
    }
    const host = instantiateInOwnerScope(new NSEOwnershipScope("NSEWindowController", "raw-nested"), () => new HostWindow());
    owned.push(host);
    host.contentViewController = null;
    expect(host.root.isDisposed).toBe(true);
    // Raw `new Root()` cannot establish a constructor-return boundary in the
    // outer ambient scope. Use owner:this inside Root for its own resources.
    expect(host.root.rows.isDisposed).toBe(false);
    expect(host.laterWindowRows.isDisposed).toBe(false);
    host.dispose();
    expect(host.root.rows.isDisposed).toBe(true);
    expect(host.laterWindowRows.isDisposed).toBe(true);
  });

  it("keeps application construction cleanup reasons and the original thrown value", () => {
    const original = { message: "application constructor failed" };
    let failed!: FailingApp;
    class FailingApp extends NSEApplication {
      readonly rows = rows();
      readonly child = new NSEViewController();
      constructor() { super(); failed = this; throw original; }
      protected override didDispose() { throw new Error("application cleanup also failed"); }
    }
    let caught: unknown;
    try {
      new ApplicationSession({ runtimeId: "failed-app", appId: "tests.failed-app" }, {
        AppClass: FailingApp, appName: "Failure", strictOwnership: true,
      });
    } catch (error) { caught = error; }
    expect(caught).toBe(original);
    expect(failed.isDisposed).toBe(true);
    expect(failed.disposalReason).toBe("application-closed");
    expect(failed.rows.disposalReason).toBe("application-closed");
    expect(failed.child.disposalReason).toBe("application-closed");
    // Failed application construction must leave strict-ownership mode too.
    const outside = rows();
    outside.dispose();
  });

  it("publishes a committed replacement even when the previous root's cleanup throws", () => {
    const original = new Error("previous root cleanup");
    class Throwing extends NSEViewController { protected override didDispose() { throw original; } }
    const host = window();
    const previous = new Throwing({ owner: host });
    const next = view();
    host.contentViewController = previous;
    const snapshot = host.getSnapshot();
    expect(() => { host.contentViewController = next; }).toThrow(original);
    expect(host.contentViewController).toBe(next);
    expect(host.getSnapshot()).not.toBe(snapshot);
    expect(previous.isDisposed).toBe(true);
    host.dispose();
    expect(next.isDisposed).toBe(true);
  });
});

describe("internal recorded owner observation", () => {
  it("returns target, containing views, window and application without evaluating app getters", () => {
    class App extends NSEApplication {}
    const session = new ApplicationSession({ runtimeId: "owner-chain", appId: "tests.owner-chain" }, {
      AppClass: App, appName: "Owners", strictOwnership: true,
    });
    owned.push(session);
    class HostWindow extends NSEWindowController {
      override get app(): NSEApplication { throw new Error("do not read arbitrary app getters"); }
    }
    const host = instantiateInOwnerScope(new NSEOwnershipScope("NSEWindowController", "chain"), () => new HostWindow(), { app: session.app });
    owned.push(host);
    const root = new NSEViewController({ owner: host });
    host.contentViewController = root;
    const child = root.addChild(NSEViewController);
    expect(objectLifetime.getNSEObjectOwners(child)).toEqual([child, root, host, session.app]);
    expect(objectLifetime.getNSEObjectOwners(host)).toEqual([host, session.app]);
    expect(objectLifetime.getNSEObjectOwners({ get app() { throw new Error("not an owner"); } })).toHaveLength(1);
  });

  it("follows adoption rather than the previous owner", () => {
    const oldOwner = view();
    const parent = view();
    const child = new NSEViewController({ owner: oldOwner });
    parent.addChild(child);
    expect(objectLifetime.getNSEObjectOwners(child)).toEqual([child, parent]);
  });

  it("includes a recorded owner named by its signal, then follows structural adoption", () => {
    const owner = view();
    const parent = view();
    const child = new NSEViewController({ ownerSignal: owner.ownerSignal });
    owned.push(child);
    expect(objectLifetime.getNSEObjectOwners(child)).toEqual([child, owner]);
    parent.addChild(child);
    expect(objectLifetime.getNSEObjectOwners(child)).toEqual([child, parent]);
    owner.dispose();
    expect(child.isDisposed).toBe(false);
    parent.dispose();
    expect(child.isDisposed).toBe(true);
  });

  it("fences recorded ownership cycles without reading unrelated properties", () => {
    const first = view();
    const second = new NSEViewController({ owner: first });
    owned.push(second);
    second.addChild(first);
    expect(objectLifetime.getNSEObjectOwners(first)).toEqual([first, second]);
    expect(objectLifetime.getNSEObjectOwners(second)).toEqual([second, first]);
  });
});
