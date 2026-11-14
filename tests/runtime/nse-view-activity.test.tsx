// @vitest-environment jsdom
import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import * as activity from "../../src/NSE/Application/viewActivity";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { AnimationEnvironmentProvider } from "../../src/NSE/Animation";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); vi.restoreAllMocks(); });
const settle = () => act(async () => { await Promise.resolve(); });
async function open(id: string, strict = false) {
  let root!: Root;
  class Root extends NSEViewController {
    static override view = () => <p>{id}</p>;
    constructor() { super(); root = this; }
  }
  class Window extends NSEWindowController { constructor() { super(); this.contentViewController = new Root(); } }
  class App extends NSEApplication { static override mainWindow = Window; }
  const host = createClassApplicationHost(App, `com.${id}`); hosts.push(host);
  await host.launch(); host.mountWindows({ strict }); await host.openMainWindow();
  await screen.findByText(id);
  return { host, root };
}

describe("controller authority epochs", () => {
  it("revokes owner authority before child and owner teardown while preserving resource order", () => {
    let revoked = false;
    class Root extends NSEViewController { protected override didDispose() { revoked = epoch.signal.aborted; expect(this.ownerSignal.aborted).toBe(false); } }
    const root = new Root({ owner: nseUnowned });
    const epoch = activity.getNSEActivityEpoch(root, "owner")!;
    expect(activity.getNSEActivityEpoch(root, "mounted")).toBeNull();
    root.dispose(); expect(revoked).toBe(true); expect(activity.getNSEActivityEpoch(root, "owner")).toBeNull();
  });

  it("retains StrictMode epochs, ends real unmount, and renews remount epochs", async () => {
    const { host, root } = await open("tests.activity-strict", true);
    const mounted = activity.getNSEActivityEpoch(root, "mounted")!;
    const visible = activity.getNSEActivityEpoch(root, "visible")!;
    expect(root.view.mountSignal).toBe(mounted.signal);
    expect(mounted.signal.aborted).toBe(false); expect(visible.signal.aborted).toBe(false);
    const listener = vi.fn(); const stop = activity.subscribeNSEActivity(root, listener);
    await settle(); expect(activity.getNSEActivityEpoch(root, "visible")).toBe(visible);
    host.unmountWindows(); await settle();
    expect(mounted.signal.aborted).toBe(true); expect(visible.signal.aborted).toBe(true);
    expect(activity.getNSEActivityEpoch(root, "mounted")).toBeNull(); expect(() => root.view.mountSignal).toThrow();
    host.mountWindows({ strict: true }); await screen.findByText("tests.activity-strict");
    expect(root.view.mountSignal).not.toBe(mounted.signal);
    expect(activity.getNSEActivityEpoch(root, "visible")!.generation).toBeGreaterThan(visible.generation);
    stop(); listener.mockClear(); root.dispose(); expect(listener).not.toHaveBeenCalled();
  });

  it("follows actual application suspension separately in two runtimes", async () => {
    const first = await open("tests.activity-first"); const second = await open("tests.activity-second");
    const firstEpoch = activity.getNSEActivityEpoch(first.root, "visible")!;
    const secondEpoch = activity.getNSEActivityEpoch(second.root, "visible")!;
    await act(async () => { await first.host.runtime.lifecycle.suspend(first.host.appId).result; });
    expect(firstEpoch.signal.aborted).toBe(true); expect(activity.getNSEActivityEpoch(first.root, "visible")).toBeNull();
    expect(secondEpoch.signal.aborted).toBe(false);
    expect(first.root.view.mountSignal.aborted).toBe(false);
    await act(async () => { await first.host.runtime.lifecycle.activate(first.host.appId).result; });
    expect(activity.getNSEActivityEpoch(first.root, "visible")).not.toBe(firstEpoch);
  });

  it("uses the owning document visibility without ending mounted activity", async () => {
    const { root } = await open("tests.activity-document");
    const epoch = activity.getNSEActivityEpoch(root, "visible")!;
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(epoch.signal.aborted).toBe(true); expect(root.view.mountSignal.aborted).toBe(false);
    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(activity.getNSEActivityEpoch(root, "visible")!.signal.aborted).toBe(false);
  });

  it("uses animation environment activity and releases subscriptions on actual detach", async () => {
    const listeners = new Set<() => void>(); let suspended = false;
    const frames = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, get suspended() { return suspended; }, subscribeState(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
    class Root extends NSEViewController { static override view = () => <p>Outside runtime activity</p>; }
    const root = new Root({ owner: nseUnowned });
    const view = render(<React.StrictMode><AnimationEnvironmentProvider frames={frames}><NSEViewControllerView controller={root} /></AnimationEnvironmentProvider></React.StrictMode>);
    const visible = activity.getNSEActivityEpoch(root, "visible")!;
    expect(listeners.size).toBe(1);
    suspended = true; act(() => { for (const listener of listeners) listener(); });
    expect(visible.signal.aborted).toBe(true);
    view.unmount(); await settle(); expect(listeners.size).toBe(0); root.dispose();
  });
});
