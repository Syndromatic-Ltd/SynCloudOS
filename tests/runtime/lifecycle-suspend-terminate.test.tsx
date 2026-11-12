// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { NSEApplication, type NSEApplicationClass } from "../../src/NSE/Application/NSEApplication";
import { createSynWareDefinitionFromApplicationClass } from "../../src/SynCloudOS/AppHosting/applicationClass";
import { applicationSessionFor } from "../../src/SynCloudOS/AppHosting/applicationSession";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { createRuntimeHarness, createTestBundle, createTestRuntime, registerTestSynWare } from "./helpers";

const hosts: ClassApplicationHost[] = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function launchHost(AppClass: NSEApplicationClass) {
  const host = createClassApplicationHost(AppClass);
  hosts.push(host);
  const { runtime, appId } = host;
  const state = () => runtime.store.getSnapshot().lifecycle[appId];
  return { host, runtime, appId, state, open: () => runtime.launchServices.openApp(appId, { source: "developer" }) };
}

async function until(condition: () => boolean, label: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe("quit through LaunchServices", () => {
  it("asks applicationShouldTerminate, then applicationWillTerminate, then disposes the session", async () => {
    const order: string[] = [];
    class App extends NSEApplication {
      applicationDidBecomeActive() { order.push("active"); }
      applicationShouldTerminate() { order.push("applicationShouldTerminate"); return true; }
      applicationWillTerminate() { order.push("applicationWillTerminate"); }
    }
    const { open, runtime, appId, state } = launchHost(App);
    open();
    await until(() => order.includes("active"), "the launch");
    order.length = 0;

    await runtime.launchServices.closeApp(appId);

    expect(order).toEqual(["applicationShouldTerminate", "applicationWillTerminate"]);
    expect(state()).toBe("closed");
    expect(applicationSessionFor({ runtimeId: runtime.runtimeId, appId })).toBeFalsy();
  });

  it("leaves a vetoing application active with its windows open", async () => {
    const order: string[] = [];
    class App extends NSEApplication {
      applicationDidBecomeActive() { order.push("active"); }
      applicationShouldTerminate() { order.push("applicationShouldTerminate"); return false; }
      applicationWillTerminate() { order.push("applicationWillTerminate"); }
    }
    const { open, host, runtime, appId, state } = launchHost(App);
    open();
    await until(() => order.includes("active"), "the launch");
    const windowId = await host.openMainWindow();

    const result = await runtime.launchServices.closeApp(appId);

    expect(result).toMatchObject({ outcome: "refused" });
    expect(order).not.toContain("applicationWillTerminate");
    expect(state()).toBe("active");
    expect(runtime.windows.list({ applicationId: appId }).map(({ id }) => id)).toContain(windowId);
    // The quit released its reservation: the application can still open windows.
    await expect(host.openMainWindow()).resolves.toEqual(expect.any(String));
  });

  it("cancels a launch still in flight and never calls applicationWillTerminate", async () => {
    const order: string[] = [];
    const gate = Promise.withResolvers<void>();
    class App extends NSEApplication {
      async applicationWillFinishLaunching() { order.push("will"); await gate.promise; }
      applicationDidFinishLaunching() { order.push("applicationDidFinishLaunching"); }
      applicationShouldTerminate() { order.push("applicationShouldTerminate"); return true; }
      applicationWillTerminate() { order.push("applicationWillTerminate"); }
    }
    const { open, runtime, appId, state } = launchHost(App);
    open();
    await until(() => order.includes("will"), "the launch to start");

    await runtime.launchServices.closeApp(appId);
    gate.resolve();
    await new Promise<void>(resolve => setTimeout(resolve, 30));

    expect(order).toEqual(["will"]);
    expect(state()).not.toBe("active");
  });

  it("launches a fresh instance after a quit", async () => {
    let instances = 0, finished = 0, active = 0;
    class App extends NSEApplication {
      constructor() { super(); instances += 1; }
      applicationDidFinishLaunching() { finished += 1; }
      applicationDidBecomeActive() { active += 1; }
    }
    const { open, runtime, appId } = launchHost(App);
    open();
    await until(() => active === 1, "the first launch");
    await runtime.launchServices.closeApp(appId);
    open();
    await until(() => active === 2, "the second launch");
    expect({ instances, finished }).toEqual({ instances: 2, finished: 2 });
  });

  it("fires the bundle hooks applicationWillClose and applicationDidClose once, and no suspend hook", async () => {
    const runtime = createTestRuntime();
    cleanups.push(async () => { await runtime.dispose("legacy-close-hooks"); });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const harness = createRuntimeHarness(runtime);
    harness.ConfigurationProfiles.setAccessMode("public");
    const appId = "com.example.legacy-close-hooks";
    const order: string[] = [];
    harness.AppRegistry.registerBundle(createTestBundle({ bundleIdentifier: appId, policy: { public: true } }, {
      lifecycleHooks: {
        applicationDidBecomeActive: () => { order.push("didBecomeActive"); },
        applicationWillSuspend: () => { order.push("willSuspend"); },
        applicationDidSuspend: () => { order.push("didSuspend"); },
        applicationWillClose: () => { order.push("willClose"); },
        applicationDidClose: () => { order.push("didClose"); },
      },
    }));
    harness.LaunchServices.openApp(appId, { source: "developer" });
    await until(() => order.includes("didBecomeActive"), "the launch");
    order.length = 0;

    await harness.LaunchServices.closeApp(appId);

    expect(order).toEqual(["willClose", "didClose"]);
    expect(runtime.store.getSnapshot().lifecycle[appId]).toBe("closed");
  });
});

describe("resigning active when another application launches", () => {
  it("tells the outgoing application once, through the lifecycle", async () => {
    let resigned = 0, firstActive = 0, secondActive = 0;
    class First extends NSEApplication {
      applicationDidBecomeActive() { firstActive += 1; }
      applicationWillResignActive() { resigned += 1; }
    }
    class Second extends NSEApplication {
      applicationDidBecomeActive() { secondActive += 1; }
    }
    const { open, runtime, appId } = launchHost(First);
    const secondId = "com.example.second-class-app";
    registerTestSynWare(runtime, createSynWareDefinitionFromApplicationClass(Second, { schemaVersion: 1, bundleIdentifier: secondId, version: "1.0.0", displayName: "Second" }));
    open();
    await until(() => firstActive === 1, "the first launch");

    runtime.launchServices.openApp(secondId, { source: "developer" });
    await until(() => secondActive === 1, "the second launch");
    await new Promise<void>(resolve => setTimeout(resolve, 50));

    expect(resigned).toBe(1);
    expect(runtime.store.getSnapshot().lifecycle[appId]).toBe("suspended");
    applicationSessionFor({ runtimeId: runtime.runtimeId, appId: secondId })?.dispose("explicit");
  });
});
