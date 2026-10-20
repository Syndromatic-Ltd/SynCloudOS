// @vitest-environment jsdom
import * as React from "react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import { createAppSCOS } from "../../src/SynCloudOS/AppSDK/scos/scosFacade";
import type { SynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/testHostTypes";
import { defineSynWareServiceToken } from "../../src/SynCloudOS/AppSDK/serviceToken";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { routeQuery } from "../../src/SynCloudOS/Routing/routeQuery";
import { act, waitFor, within } from "@testing-library/react";
import { action } from "../../src/SynCloudOS/AppSDK/actions";
const hosts: SynWareTestHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });
it("launches a real class app with running services and exposes its live window controllers and preferences", async () => {
  const services = createAppSCOS("com.example.class-test-host");
  class MainWindow extends NSEWindowController { static override view = () => <p>Class test window</p>; }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    override applicationDidFinishLaunching() { services.preferences.set("launched", true); }
  }
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, bundleIdentifier: "com.example.class-test-host", displayName: "Class test", version: "1.0.0", routes: [{ path: "/class-test", primary: true }] }, document });
  hosts.push(host);
  host.adapters.storage.local.allow();
  host.adapters.credentials.allow();
  host.persistence.setPreference("beforeLaunch", "kept");
  const view = await host.render();
  expect(view.container.textContent).toContain("Class test window");
  expect(host.application).toBeInstanceOf(Application);
  expect(host.application!.windows[0]).toBeInstanceOf(MainWindow);
  expect(host.persistence.getPreference("launched")).toBe(true);
  expect(services.preferences.get("beforeLaunch")).toBe("kept");
  services.preferences.set("fromController", 42);
  expect(host.persistence.entries()).toContainEqual({ key: "fromController", value: 42 });
});

it("provides declared typed services to controllers through the ordinary service boundary", async () => {
  const token = defineSynWareServiceToken<{ read(): string }>({ id: "class.catalogue", contractVersion: "catalogue.v1", minimumVersion: "2.0.0" });
  const scos = createAppSCOS("com.example.class-service");
  class MainWindow extends NSEWindowController { static override view = () => <p>Service window</p>; }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    result = "";
    override applicationDidFinishLaunching() { this.result = scos.services.require(token).read(); }
  }
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, bundleIdentifier: "com.example.class-service", displayName: "Service app", version: "1.0.0", services: [{ id: token.id, required: true, minimumVersion: "2.0.0" }] }, services: [[token, { read: () => "catalogue" }]], document });
  hosts.push(host);
  host.adapters.services.allow();
  host.adapters.permissions.allow();
  host.adapters.policy.allow();
  await host.render();
  expect((host.application as Application).result).toBe("catalogue");
});

it("pushes and replaces route queries from a controller and notifies subscribers", async () => {
  const graph = defineSynWareRoutes({ id: "class.routes", routes: [{ name: "catalogue", path: "", query: { page: routeQuery.integer({ defaultValue: 1 }) } }] } as const);
  const scos = createAppSCOS("com.example.class-routes");
  class MainWindow extends NSEWindowController { static override view = () => <p>Route window</p>; }
  class Application extends NSEApplication { static override mainWindow = MainWindow; static override routes = graph; }
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, bundleIdentifier: "com.example.class-routes", displayName: "Routes", version: "1.0.0", routes: [{ path: "/catalogue", primary: true, match: "prefix" }] }, document });
  hosts.push(host);
  host.adapters.navigation.allow();
  await host.render();
  const state = scos.routes.state(graph, "catalogue");
  const seen: number[] = [];
  const remove = state.subscribe(() => { seen.push(state.getQuery().page); });
  await act(async () => { await scos.open("/catalogue"); });
  await act(async () => { await state.pushQuery({ page: 2 }).result; });
  expect(state.getQuery().page).toBe(2);
  expect(seen).toContain(2);
  expect(scos.routes.isActive(graph, { name: "catalogue" })).toBe(true);
  await act(async () => { await state.replaceQuery({ page: 3 }).result; });
  expect(state.getQuery().page).toBe(3);
  expect(scos.fonts.manager).toBeTruthy();
  expect(scos.menus.runtime.resolveAction?.("refresh")).toBe("com.example.class-routes.refresh");
  remove();
});

it.each(["stage", "window"] as const)("routes native Escape events through the production input boundary and removes routing on disposal (%s)", async surface => {
  class MainWindow extends NSEWindowController {
    static override view = () => <button>Keyboard target</button>;
  }
  class Application extends NSEApplication {
    static override mainWindow = MainWindow;
    cancellations = 0;
    @action({ keyBindings: [{ key: "Escape", modifiers: [], scope: "application", repeat: "ignore", allowInEditable: true }] })
    cancel() { this.cancellations += 1; }
  }
  const host = createSynWareTestHost({
    application: Application,
    manifest: { schemaVersion: 1, bundleIdentifier: "com.example.class-keyboard", displayName: "Keyboard", version: "1.0.0" },
    document,
    surface,
  });
  hosts.push(host);
  const view = await host.render();
  const application = host.application as Application;
  const target = within(view.container).getByRole("button", { name: "Keyboard target" }) as HTMLButtonElement;
  await act(async () => { target.focus(); });
  const escape = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  await act(async () => { target.dispatchEvent(escape); });
  expect(escape.defaultPrevented).toBe(true);
  await waitFor(() => expect(application.cancellations).toBe(1));
  await act(async () => { await host.dispose(); });
  const afterDisposal = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(afterDisposal);
  expect(afterDisposal.defaultPrevented).toBe(false);
  expect(application.cancellations).toBe(1);
});

it.each([false, true])("makes the class content view the initial stage responder without a forced control focus (late content: %s)", async lateContent => {
  class Content extends NSEViewController {
    static override view = () => <p>View-owned keyboard actions</p>;
    cancellations = 0;
    @action({ keyBindings: [{ key: "Escape", modifiers: [], scope: "application", repeat: "ignore", allowInEditable: true }] })
    cancel() { this.cancellations += 1; }
  }
  const content = new Content();
  class MainWindow extends NSEWindowController {
    static override view = () => <p>Preparing content</p>;
    override windowDidLoad() { if (!lateContent) this.contentViewController = content; }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createSynWareTestHost({
    application: Application,
    manifest: { schemaVersion: 1, bundleIdentifier: "com.example.initial-view-responder", displayName: "View responder", version: "1.0.0" },
    document,
    surface: "stage",
  });
  hosts.push(host);
  await host.render();
  if (lateContent) {
    await act(async () => { host.application!.windows[0].contentViewController = content; });
  }
  await waitFor(() => expect(document.activeElement).toBe(content.view.element));
  const escape = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  await act(async () => { document.activeElement!.dispatchEvent(escape); });
  expect(escape.defaultPrevented).toBe(true);
  await waitFor(() => expect(content.cancellations).toBe(1));
});
