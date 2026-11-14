// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEApplication, type NSEApplicationClass } from "../../src/NSE/Application/NSEApplication";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const host of hosts.splice(0)) await host.dispose();
});

/** A host whose launches go through LaunchServices, recording the order of what an application can observe. */
function launchHost(AppClass: NSEApplicationClass, order: string[]) {
  const host = createClassApplicationHost(AppClass);
  hosts.push(host);
  const { runtime, appId } = host;
  const open = runtime.windows.openApplicationWindow.bind(runtime.windows);
  const openWindow = vi.spyOn(runtime.windows, "openApplicationWindow").mockImplementation(async (...args) => {
    order.push("openApplicationWindow");
    return open(...args);
  });
  runtime.events.subscribe("app.lifecycle", (event) => {
    const payload = (event as { payload?: { stage?: string; appId?: string } }).payload;
    if (payload?.stage === "launch") order.push("lifecycle:committed");
  });
  runtime.events.subscribe("app.launch.complete", () => order.push("app.launch.complete"));
  runtime.events.subscribe("app.launch.failed", () => order.push("app.launch.failed"));
  return { host, runtime, appId, openWindow, open: () => runtime.launchServices.openApp(appId, { source: "developer" }) };
}

async function until(condition: () => boolean, label: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe("launch callbacks and the main window", () => {
  it("opens the main window before applicationDidFinishLaunching and applicationDidBecomeActive", async () => {
    const order: string[] = [];
    class OrderedApp extends NSEApplication {
      applicationWillFinishLaunching() { order.push("applicationWillFinishLaunching"); }
      applicationDidFinishLaunching() { order.push("applicationDidFinishLaunching"); }
      applicationDidBecomeActive() { order.push("applicationDidBecomeActive"); }
    }
    const { open } = launchHost(OrderedApp, order);
    open();
    await until(() => order.includes("applicationDidBecomeActive"), "applicationDidBecomeActive");
    expect(order.filter(entry => entry !== "app.launch.complete")).toEqual([
      "applicationWillFinishLaunching", "lifecycle:committed", "openApplicationWindow",
      "applicationDidFinishLaunching", "applicationDidBecomeActive",
    ]);
  });

  it("opens the window without waiting for a slow applicationDidFinishLaunching", async () => {
    const order: string[] = [];
    const gate = Promise.withResolvers<void>();
    class SlowApp extends NSEApplication {
      async applicationDidFinishLaunching() { order.push("did:start"); await gate.promise; order.push("did:end"); }
    }
    const { open, openWindow } = launchHost(SlowApp, order);
    open();
    await until(() => order.includes("did:start"), "applicationDidFinishLaunching to start");
    expect(order.indexOf("app.launch.complete")).toBeGreaterThan(order.indexOf("openApplicationWindow"));
    expect(order.indexOf("app.launch.complete")).toBeLessThan(order.indexOf("did:start"));
    expect(openWindow).toHaveBeenCalledTimes(1);
    gate.resolve();
    await until(() => order.includes("did:end"), "applicationDidFinishLaunching to end");
  });

  it("reports a throwing applicationDidFinishLaunching and keeps the launch", async () => {
    const order: string[] = [];
    class ThrowingApp extends NSEApplication {
      applicationDidFinishLaunching() { order.push("did"); throw new Error("draft store denied"); }
      applicationDidBecomeActive() { order.push("active"); }
    }
    const { open, openWindow, runtime, appId } = launchHost(ThrowingApp, order);
    open();
    await until(() => order.includes("active"), "applicationDidBecomeActive");
    expect(order).not.toContain("app.launch.failed");
    expect(runtime.store.getSnapshot().lifecycle[appId]).toBe("active");
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it("fails the launch and runs no did hook when the window cannot open", async () => {
    const order: string[] = [];
    class App extends NSEApplication {
      applicationDidFinishLaunching() { order.push("applicationDidFinishLaunching"); }
      applicationDidBecomeActive() { order.push("applicationDidBecomeActive"); }
    }
    const { open, openWindow } = launchHost(App, order);
    openWindow.mockImplementation(async () => { order.push("openApplicationWindow"); throw new Error("no window server"); });
    open();
    await until(() => order.includes("app.launch.failed"), "the launch to fail");
    await new Promise<void>(resolve => setTimeout(resolve, 20));
    expect(order).not.toContain("applicationDidFinishLaunching");
    expect(order).not.toContain("applicationDidBecomeActive");
    expect(order).not.toContain("app.launch.complete");
  });

  it("does not tell a resumed application that it finished launching again", async () => {
    const order: string[] = [];
    let finished = 0, active = 0;
    class App extends NSEApplication {
      applicationDidFinishLaunching() { finished += 1; }
      applicationDidBecomeActive() { active += 1; }
    }
    const { open, runtime, appId } = launchHost(App, order);
    open();
    await until(() => active === 1, "the first activation");
    await until(() => order.includes("app.launch.complete"), "the first launch to complete");
    await runtime.lifecycle.suspend(appId, { reason: "test" }).result;
    order.length = 0;
    open();
    await until(() => active === 2, "the second activation");
    expect(finished).toBe(1);
  });
});
