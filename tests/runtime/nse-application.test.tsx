// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import * as React from "react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEApplication, type NSEApplicationClass } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { applicationSessionFor } from "../../src/SynCloudOS/AppSDK/applicationSession";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
});

function host(AppClass: NSEApplicationClass | ComponentType, appId?: string) {
  const created = createClassApplicationHost(AppClass, appId);
  hosts.push(created);
  return created;
}

function tick(ms = 0): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

describe("NSEApplication lifecycle", () => {
  it("runs the launch hooks in order and finishes an async applicationDidFinishLaunching before the launch settles", async () => {
    const events: string[] = [];
    class OrderedApp extends NSEApplication {
      constructor() { super(); events.push("constructor"); }
      applicationWillFinishLaunching() { events.push("willFinishLaunching"); }
      async applicationDidFinishLaunching() {
        events.push("didFinishLaunching:start");
        await tick(20);
        events.push("didFinishLaunching:end");
      }
      applicationDidBecomeActive() { events.push("didBecomeActive"); }
    }
    const { launch } = host(OrderedApp);

    const result = await launch();

    expect(result).toMatchObject({ status: "completed", committed: true });
    expect(events).toEqual([
      "constructor",
      "willFinishLaunching",
      "didFinishLaunching:start",
      "didFinishLaunching:end",
      "didBecomeActive",
    ]);
  });

  it("tells the same instance when it is suspended and when it becomes active again", async () => {
    const events: string[] = [];
    let instances = 0;
    class SuspendedApp extends NSEApplication {
      constructor() { super(); instances += 1; }
      applicationWillResignActive() { events.push("willResignActive"); }
      applicationDidBecomeActive() { events.push("didBecomeActive"); }
    }
    const { launch, runtime, appId } = host(SuspendedApp);
    await launch();

    await runtime.lifecycle.suspend(appId).result;
    expect(runtime.lifecycle.getState(appId)).toBe("suspended");
    await runtime.lifecycle.activate(appId).result;

    expect(events).toEqual(["didBecomeActive", "willResignActive", "didBecomeActive"]);
    expect(instances).toBe(1);
  });

  it("creates the application with its application id and no windows before one opens", async () => {
    let instance: NSEApplication | undefined;
    class IdentifiedApp extends NSEApplication {
      constructor() { super(); instance = this; }
    }
    const { launch, runtime, appId } = host(IdentifiedApp, "com.example.identified-app");
    await launch();

    expect(instance?.id).toBe("com.example.identified-app");
    expect(instance?.windows).toEqual([]);
    expect(applicationSessionFor({ runtimeId: runtime.runtimeId, appId })?.app).toBe(instance);
  });

  it("keeps the application running when applicationShouldTerminate returns false", async () => {
    const events: string[] = [];
    let allow = false;
    let instance!: VetoApp;
    class VetoApp extends NSEApplication {
      constructor() { super(); instance = this; }
      async applicationShouldTerminate() { events.push("shouldTerminate"); await tick(5); return allow; }
      applicationWillTerminate() { events.push("willTerminate"); }
    }
    const { launch, quit, runtime, appId } = host(VetoApp);
    await launch();

    const refused = await quit();

    expect(refused).toMatchObject({ committed: false });
    expect(runtime.lifecycle.getState(appId)).toBe("active");
    expect(instance.isDisposed).toBe(false);
    expect(events).toEqual(["shouldTerminate"]);
  });

  it("quits and disposes the application when applicationShouldTerminate returns true", async () => {
    const events: string[] = [];
    let instance!: QuitApp;
    class QuitApp extends NSEApplication {
      constructor() { super(); instance = this; }
      applicationShouldTerminate() { events.push("shouldTerminate"); return true; }
      applicationWillTerminate() { events.push("willTerminate"); }
    }
    const { launch, quit, runtime, appId } = host(QuitApp);
    await launch();

    const closed = await quit();

    expect(closed).toMatchObject({ status: "completed", committed: true });
    expect(runtime.lifecycle.getState(appId)).toBe("closed");
    expect(events).toEqual(["shouldTerminate", "willTerminate"]);
    expect(instance.isDisposed).toBe(true);
    expect(instance.disposalReason).toBe("application-closed");
  });

  it("can quit after a veto once the application agrees", async () => {
    let allow = false;
    class ChangesMindApp extends NSEApplication {
      applicationShouldTerminate() { return allow; }
    }
    const { launch, quit, runtime, appId } = host(ChangesMindApp);
    await launch();

    await quit();
    expect(runtime.lifecycle.getState(appId)).toBe("active");
    allow = true;
    await expect(quit()).resolves.toMatchObject({ committed: true });
    expect(runtime.lifecycle.getState(appId)).toBe("closed");
  });

  it("refuses to be constructed with new in application code", () => {
    class Direct extends NSEApplication {}
    expect(() => new Direct()).toThrow(/created by the framework/);
  });
});

describe("function-component application", () => {
  it("launches as a single-window application showing the component", async () => {
    function Notes() { return <p>Notes component</p>; }
    const created = host(Notes, "com.example.shortcut-app");
    const { runtime, appId } = created;

    await expect(created.launch()).resolves.toMatchObject({ status: "completed", committed: true });
    created.mountWindows();
    await created.openMainWindow();

    expect(await screen.findAllByText("Notes component")).toHaveLength(1);
    const session = applicationSessionFor({ runtimeId: runtime.runtimeId, appId });
    expect(session?.app).toBeInstanceOf(NSEApplication);
    expect(session?.windowControllers).toHaveLength(1);
    await expect(created.quit()).resolves.toMatchObject({ committed: true });
    expect(session?.isDisposed).toBe(true);
  });
});

describe("window controllers of an application", () => {
  it("is declared by static mainWindow and shown by its static view", async () => {
    class MainWindow extends NSEWindowController {
      static override view = function MainView() { return <p>Main window content</p>; };
    }
    class WindowedApp extends NSEApplication {
      static override mainWindow = MainWindow;
    }
    const created = host(WindowedApp, "com.example.windowed-app");
    await created.launch();
    created.mountWindows();
    await created.openMainWindow();

    expect(await screen.findByText("Main window content")).toBeTruthy();
  });
});
