// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { applicationSessionFor } from "../../src/SynCloudOS/AppHosting/applicationSession";
import { authoriseTestRuntime } from "./helpers";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

it("ends class application resources on logout and constructs a fresh application after login", async () => {
  const applications: Application[] = [];
  class MainWindow extends NSEWindowController { static override view = () => <p>Session window</p>; }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    constructor() { super(); applications.push(this); }
  }
  const host = createClassApplicationHost(Application, "com.example.logout-resources");
  hosts.push(host);
  await host.launch(); host.mountWindows(); await host.openMainWindow();
  const first = applications[0]!;
  const oldWindow = first.windows[0]!;
  expect((await host.runtime.logOut().result).status).toBe("completed");
  expect(first.isDisposed).toBe(true);
  expect(oldWindow.isDisposed).toBe(true);
  expect(applicationSessionFor({ runtimeId: host.runtime.runtimeId, appId: host.appId })).toBeUndefined();
  authoriseTestRuntime(host.runtime);
  // LaunchServices prepares a closed application before launching it again.
  // This window-only fixture drives those lifecycle steps without a shell.
  await host.runtime.appManager.getManagerForApp(host.appId).getReady();
  const relaunched = await host.launch();
  expect(relaunched, JSON.stringify(relaunched)).toMatchObject({ status: "completed" });
  await host.openMainWindow();
  expect(applications).toHaveLength(2);
  expect(applications[1]!.isDisposed).toBe(false);
});

it("keeps the session authorised when an application vetoes logout", async () => {
  class MainWindow extends NSEWindowController { static override view = () => <p>Unsaved work</p>; }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    override applicationShouldTerminate() { return false; }
  }
  const host = createClassApplicationHost(Application, "com.example.logout-veto");
  hosts.push(host);
  await host.launch();
  expect((await host.runtime.logOut().result).status).toBe("cancelled");
  expect(host.runtime.store.getSnapshot().loginServices.isAuthorised).toBe(true);
});

it("does not end identity when an application's save/termination preparation fails", async () => {
  class MainWindow extends NSEWindowController { static override view = () => <p>Unsaved work</p>; }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    override async applicationShouldTerminate(): Promise<boolean> { throw new Error("Save failed"); }
  }
  const host = createClassApplicationHost(Application, "com.example.logout-save-failed");
  hosts.push(host);
  await host.launch();
  expect((await host.runtime.logOut().result).status).toBe("failed");
  expect(host.runtime.store.getSnapshot().loginServices.isAuthorised).toBe(true);
  expect(applicationSessionFor({ runtimeId: host.runtime.runtimeId, appId: host.appId })?.app.isDisposed).toBe(false);
});
