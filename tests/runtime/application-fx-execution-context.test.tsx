// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { acquireForegroundApplicationProcess, joinApplicationProcess } from "../../src/SynCloudOS/AppSDK/applicationProcessAuthority";
import { applicationSessionFor, ensureApplicationSession } from "../../src/SynCloudOS/AppHosting/applicationSession";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { mountedFXExecutionContext } from "../../src/SynCloudOS/AppSDK/mountedFXExecutionContext";
import { createSynWareDefinitionFromApplicationClass } from "../../src/SynCloudOS/AppHosting/applicationClass";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import {
  currentOwnedExecutionContext, requireOwnedExecutionContext, registerOwnedExecutionResource,
  ownedExecutionContextSignal, sameOwnedExecutionProcess, runInOwnedExecutionContext, type OwnedExecutionContext,
} from "../../src/SynCloudOS/ExecutionContext/ownedExecutionContext";
import { authoriseTestRuntime, createTestRuntime, registerTestSynWare } from "./helpers";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";
import { HostSiteBrandingProvider, SynCloudOSProvider, SynCloudOSRuntimeContext } from "../../src/SynCloudOSReact";
import { createElement, StrictMode, useContext } from "react";
import { act, render } from "@testing-library/react";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { createBundleLoader } from "../../src/SynCloudOS/BundleLoader/BundleLoader";
import ts from "typescript";
import { resolve } from "node:path";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";
import { createClassApplicationHost } from "./fixtures/classApplicationHost";

const runtimes: SynCloudOSRuntime[] = [];
const appId = "com.tests.fx-process";
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose(); });
function runtimeFor(App: typeof NSEApplication) {
  const runtime = authoriseTestRuntime(createTestRuntime({ id: "runtime:duplicate-fx" }));
  runtimes.push(runtime);
  registerTestSynWare(runtime, createSynWareDefinitionFromApplicationClass(App, {
    schemaVersion: 1, bundleIdentifier: appId, displayName: "FX process", version: "1.0.0",
  }));
  return runtime;
}
class TestDevice {
  readonly context = requireOwnedExecutionContext("TestDevice");
  readonly signal = ownedExecutionContextSignal(this.context);
  releases = 0;
  constructor() { registerOwnedExecutionResource(this.context, this, () => { this.releases++; }); }
}
function presentation(runtime: SynCloudOSRuntime, name: string) {
  const responderId = `controller:${appId}:${name}`;
  const responder = runtime.responders.get(responderId) ? null : runtime.responders.register({ id: responderId, kind: "controller", parentId: `application:${appId}`, scopeId: `application:${appId}` });
  const mount = createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp(appId)!, responderId });
  return { mount, execution: mountedFXExecutionContext(mount.runtime)!, dispose() { mount.dispose(); responder?.dispose({ cascade: true }); } };
}

describe("production application execution ownership", () => {
  it("authenticates private process records and removes observers after the last idempotent release", () => {
    class App extends NSEApplication {}
    const first = runtimeFor(App), second = runtimeFor(App);
    const app = first.apps.getApp(appId)!;
    const removers: ReturnType<typeof vi.fn>[] = [];
    const subscribe = first.events.subscribe.bind(first.events);
    const spy = vi.spyOn(first.events, "subscribe").mockImplementation((...args) => {
      const remove = vi.fn(subscribe(...args)); removers.push(remove); return remove;
    });
    const a = acquireForegroundApplicationProcess(first, app), b = acquireForegroundApplicationProcess(first, app);
    expect(a.process).toBe(b.process);
    expect(() => joinApplicationProcess(second, second.apps.getApp(appId)!, a.process)).toThrow();
    expect(() => joinApplicationProcess(first, app, { identity: {}, signal: new AbortController().signal, assertLive() {} })).toThrow();
    a.release(); a.release();
    expect(b.process.signal.aborted).toBe(false);
    b.release();
    expect(b.process.signal.aborted).toBe(true);
    expect(removers).toHaveLength(5);
    expect(removers.every(remove => remove.mock.calls.length === 1)).toBe(true);
    spy.mockRestore();
    const c = acquireForegroundApplicationProcess(first, app);
    expect(c.process).not.toBe(a.process);
    c.release();
  });
  it("establishes exact owner authority before application field initialisers", async () => {
    let app!: App;
    class App extends NSEApplication {
      device = new TestDevice();
      constructor() { super(); app = this; }
    }
    const runtime = runtimeFor(App);
    expect(await runtime.lifecycle.launch(appId).result).toMatchObject({ committed: true });
    expect(app.device.signal.aborted).toBe(false);
    expect(currentOwnedExecutionContext()).toBeNull();
    await runtime.lifecycle.close(appId).result;
    expect(app.device.releases).toBe(1);
    expect(app.device.signal.aborted).toBe(true);
  });

  it("separates real runtime objects even when their configured runtime and app IDs match", async () => {
    const apps: App[] = [];
    class App extends NSEApplication {
      device = new TestDevice();
      resigned = 0;
      terminated = 0;
      constructor() { super(); apps.push(this); }
      override applicationWillResignActive() { this.resigned++; }
      override applicationWillTerminate() { this.terminated++; }
    }
    const first = runtimeFor(App), second = runtimeFor(App);
    await Promise.all([first.lifecycle.launch(appId).result, second.lifecycle.launch(appId).result]);
    expect(apps).toHaveLength(2);
    expect(sameOwnedExecutionProcess(apps[0]!.device.context, apps[1]!.device.context)).toBe(false);
    await first.lifecycle.suspend(appId).result;
    expect(apps.map(app => app.resigned)).toEqual([1, 0]);
    await first.lifecycle.close(appId).result;
    expect(apps.map(app => app.terminated)).toEqual([1, 0]);
    expect(apps[0]!.device.signal.aborted).toBe(true);
    expect(apps[1]!.device.signal.aborted).toBe(false);
  });

  it("prepares the render fallback from an exact presentation under StrictMode without a prior launch", async () => {
    class Window extends NSEWindowController {
      device = new TestDevice();
      static override view = () => createElement("span", null, "Fallback");
    }
    class App extends NSEApplication { static override mainWindow = Window; device = new TestDevice(); }
    const host = createClassApplicationHost(App, "com.tests.fx-fallback");
    const applicationId = `application:${host.appId}`;
    host.runtime.responders.register({ id: applicationId, kind: "application", parentId: "workspace", scopeId: applicationId, undoOwner: { kind: "application", id: host.appId } });
    const Root = host.runtime.bundles.getBundle(host.appId)!.synWareDefinition!.root;
    const branding = { name: "Fallback", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null };
    let tree: ReturnType<typeof render> | undefined;
    try {
      tree = render(createElement(StrictMode, null, createElement(SynCloudOSProvider, { runtime: host.runtime },
        createElement(HostSiteBrandingProvider, { value: branding }, createElement(SynWareRuntimeMount, {
          runtime: host.runtime, app: host.runtime.apps.getApp(host.appId)!, responderId: applicationId,
          children: createElement(Root),
        })))));
      const session = applicationSessionFor(host.runtime, host.appId)!;
      expect(session).toBeDefined();
      expect(session.launchReported).toBe(false);
      const app = session.app as App;
      expect(app.windows).toHaveLength(1);
      expect(sameOwnedExecutionProcess(app.device.context, (app.windows[0] as Window).device.context)).toBe(true);
      tree.unmount(); tree = undefined;
      expect(app.device.signal.aborted).toBe(false);
    } finally { tree?.unmount(); await host.dispose(); }
  });

  it("shares the process across services and presentations while preserving exact mount retirement", async () => {
    class App extends NSEApplication { device = new TestDevice(); }
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const app = applicationSessionFor(runtime, appId)!.app as App;
    const first = presentation(runtime, "first"), second = presentation(runtime, "second");
    expect(sameOwnedExecutionProcess(app.device.context, first.execution)).toBe(true);
    expect(sameOwnedExecutionProcess(first.execution, second.execution)).toBe(true);
    const firstSignal = ownedExecutionContextSignal(first.execution);
    const device = runInOwnedExecutionContext(first.execution, () => new TestDevice());
    const replacement = presentation(runtime, "first");
    expect(firstSignal.aborted).toBe(true);
    expect(device.releases).toBe(1);
    expect(mountedFXExecutionContext(first.mount.runtime)).toBe(first.execution);
    expect(mountedFXExecutionContext(first.mount.runtime)).not.toBe(replacement.execution);
    expect(() => runInOwnedExecutionContext(first.execution, () => new TestDevice())).toThrow();
    expect(sameOwnedExecutionProcess(replacement.execution, second.execution)).toBe(true);
    first.dispose(); second.dispose(); replacement.dispose();
    expect(app.device.signal.aborted).toBe(false);
  });

  it("narrows window and content field initialisers under their recorded application", async () => {
    class Content extends NSEViewController { device = new TestDevice(); }
    class Window extends NSEWindowController {
      static override contentViewControllerClass = Content;
      device = new TestDevice();
    }
    class App extends NSEApplication { device = new TestDevice(); }
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const app = applicationSessionFor(runtime, appId)!.app as App;
    const one = await app.openWindow(Window), two = await app.openWindow(Window);
    const child = one.contentViewController as Content;
    expect(sameOwnedExecutionProcess(app.device.context, one.device.context)).toBe(true);
    expect(sameOwnedExecutionProcess(one.device.context, child.device.context)).toBe(true);
    one.dispose();
    expect(one.device.releases).toBe(1);
    expect(child.device.releases).toBe(1);
    expect(two.device.signal.aborted).toBe(false);
    await runtime.lifecycle.close(appId).result;
    expect(two.device.releases).toBe(1);
  });

  it("keeps vetoed authority and retires before reentrant accepted-close abort handlers", async () => {
    let allow = false;
    class App extends NSEApplication {
      device = new TestDevice();
      override applicationShouldTerminate() { return allow; }
    }
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const session = applicationSessionFor(runtime, appId)!;
    const app = session.app as App;
    await runtime.lifecycle.close(appId).result;
    expect(app.device.signal.aborted).toBe(false);
    let reentrantError: unknown;
    let reentrantSessionError: unknown;
    const mount = presentation(runtime, "close-observer");
    app.device.signal.addEventListener("abort", () => {
      try { createMountedSynWareRuntime({ runtime, app: runtime.apps.getApp(appId)!, responderId: `controller:${appId}:close-observer` }); }
      catch (error) { reentrantError = error; }
      try { ensureApplicationSession(runtime, runtime.apps.getApp(appId)!, { AppClass: App, appName: "Reentrant close", strictOwnership: true }); }
      catch (error) { reentrantSessionError = error; }
    });
    allow = true;
    await runtime.lifecycle.close(appId).result;
    expect(reentrantError).toBeInstanceOf(DOMException);
    expect(reentrantSessionError).toBeInstanceOf(DOMException);
    expect(mount.mount.runtime.signal.aborted).toBe(true);
    await runtime.appManager.getManagerForApp(appId)!.getReady();
    await runtime.lifecycle.launch(appId).result;
    const next = applicationSessionFor(runtime, appId)!;
    expect(next).not.toBe(session);
    expect((next.app as App).device.context).not.toBe(app.device.context);
    expect(() => app.own(() => new TestDevice())).toThrow();
    session.dispose();
    expect(applicationSessionFor(runtime, appId)).toBe(next);
    mount.dispose();
  });

  it("rolls back constructor acquisitions once, preserves borrowed responders and admits a fresh launch", async () => {
    const devices: TestDevice[] = [];
    const original = new Error("constructor failed");
    let fail = true;
    class App extends NSEApplication {
      device = new TestDevice();
      constructor() { super(); devices.push(this.device); if (fail) throw original; }
    }
    const runtime = runtimeFor(App);
    const applicationId = `application:${appId}`;
    runtime.responders.register({ id: applicationId, kind: "application", parentId: "workspace", scopeId: applicationId, undoOwner: { kind: "application", id: appId } });
    const token = runtime.responders.getRegistrationToken(applicationId);
    const source = { AppClass: App, appName: "Failure", strictOwnership: true };
    expect(() => ensureApplicationSession(runtime, runtime.apps.getApp(appId)!, source)).toThrow(original);
    expect(devices[0]!.releases).toBe(1);
    expect(runtime.responders.getRegistrationToken(applicationId)).toEqual(token);
    expect(runtime.responders.get(`controller:${appId}:application-services`)).toBeNull();
    expect(applicationSessionFor(runtime, appId)).toBeUndefined();
    fail = false;
    expect(await runtime.lifecycle.launch(appId).result).toMatchObject({ committed: true });
    expect(devices[1]!.context).not.toBe(devices[0]!.context);
  });

  it("preserves construction failure while reporting secondary owned resource cleanup failure", () => {
    const original = new Error("primary constructor failure");
    const secondary = new Error("secondary constructor resource cleanup");
    class App extends NSEApplication {
      constructor() {
        super();
        registerOwnedExecutionResource(requireOwnedExecutionContext("constructor resource"), {}, () => { throw secondary; });
        throw original;
      }
    }
    const runtime = runtimeFor(App);
    expect(() => ensureApplicationSession(runtime, runtime.apps.getApp(appId)!, { AppClass: App, appName: "Cleanup failure", strictOwnership: true })).toThrow(original);
    expect(runtime.errors.getHistory().some(error => error.technicalDetails?.includes(secondary.message))).toBe(true);
  });

  it("reports failed own(factory) journal cleanup once without borrowing an outer application's context", async () => {
    class App extends NSEApplication { device = new TestDevice(); }
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const app = applicationSessionFor(runtime, appId)!.app as App;
    const outer = presentation(runtime, "outer-factory");
    const primary = new Error("primary factory failure"), secondary = new Error("secondary factory cleanup");
    const release = vi.fn(() => { throw secondary; });
    const capture = vi.spyOn(runtime.errors, "capture");
    expect(() => runInOwnedExecutionContext(outer.execution, () => app.own(() => {
      registerOwnedExecutionResource(requireOwnedExecutionContext("factory resource"), {}, release);
      throw primary;
    }))).toThrow(primary);
    expect(release).toHaveBeenCalledOnce();
    expect(runtime.errors.getHistory().filter(error => error.technicalDetails?.includes(secondary.message))).toHaveLength(1);
    expect(app.isDisposed).toBe(false);
    await runtime.lifecycle.close(appId).result;
    expect(release).toHaveBeenCalledOnce();
    expect(runtime.errors.getHistory().filter(error => error.technicalDetails?.includes(secondary.message))).toHaveLength(1);
    capture.mockRestore(); outer.dispose();
  });

  it("does not duplicate preparation during a reentrant constructor", async () => {
    let runtime!: SynCloudOSRuntime;
    let nested: unknown;
    class App extends NSEApplication {
      constructor() { super(); try { ensureApplicationSession(runtime, runtime.apps.getApp(appId)!, { AppClass: App, appName: "Nested", strictOwnership: true }); } catch (error) { nested = error; } }
    }
    runtime = runtimeFor(App);
    expect(await runtime.lifecycle.launch(appId).result).toMatchObject({ committed: true });
    expect(nested).toBeInstanceOf(TypeError);
  });

  it("replaces a retired session after exact bundle/registration replacement without retaining old authority", async () => {
    class App extends NSEApplication { device = new TestDevice(); }
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const old = applicationSessionFor(runtime, appId)!;
    runtime.apps.register(createSynWareBundle(createSynWare(createSynWareDefinitionFromApplicationClass(App, {
      schemaVersion: 1, bundleIdentifier: appId, displayName: "Replacement", version: "2.0.0",
    }))));
    const replacement = ensureApplicationSession(runtime, runtime.apps.getApp(appId)!, { AppClass: App, appName: "Replacement", strictOwnership: true });
    expect(replacement).not.toBe(old);
    expect((old.app as App).device.signal.aborted).toBe(true);
    expect((replacement.app as App).device.signal.aborted).toBe(false);
    expect(() => old.app.own(() => new TestDevice())).toThrow();
    old.dispose();
    expect(applicationSessionFor(runtime, appId)).toBe(replacement);
  });

  it("checks captured registration authority before session reuse even before replacement events publish", async () => {
    class App extends NSEApplication { device = new TestDevice(); }
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const old = applicationSessionFor(runtime, appId)!;
    const canonical = runtime.apps.getApp(appId)!;
    runtime.appManager.createManagerForApp(canonical, { replace: true, publish: false });
    const replacement = ensureApplicationSession(runtime, canonical, { AppClass: App, appName: "Registration replacement", strictOwnership: true });
    expect(replacement).not.toBe(old);
    expect((old.app as App).device.signal.aborted).toBe(true);
    expect((replacement.app as App).device.signal.aborted).toBe(false);
  });

  it("reports throwing resource cleanup through the captured runtime sink without borrowed authority", async () => {
    class App extends NSEApplication {}
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const seen: Array<OwnedExecutionContext | null> = [];
    const capture = runtime.errors.capture.bind(runtime.errors);
    vi.spyOn(runtime.errors, "capture").mockImplementation(payload => { seen.push(currentOwnedExecutionContext()); return capture(payload); });
    const first = presentation(runtime, "cleanup"), second = presentation(runtime, "outer");
    const failure = new Error("resource release failed");
    registerOwnedExecutionResource(first.execution, {}, () => { throw failure; });
    runInOwnedExecutionContext(second.execution, () => first.dispose());
    expect(seen).toEqual([null]);
    expect(runtime.errors.getHistory().some(error => error.technicalDetails?.includes("resource release failed"))).toBe(true);
    expect(currentOwnedExecutionContext()).toBeNull();
    second.dispose();
  });

  it("releases provisional process membership when facade preparation fails before client setup", () => {
    class App extends NSEApplication {}
    const runtime = runtimeFor(App);
    const failure = new Error("font scope failed");
    runtime.responders.register({ id: `application:${appId}`, kind: "application", parentId: "workspace", scopeId: `application:${appId}`, undoOwner: { kind: "application", id: appId } });
    const app = runtime.apps.getApp(appId)!;
    let failedSignal!: AbortSignal;
    expect(() => createMountedSynWareRuntime({ runtime, app, responderId: `application:${appId}`,
      get hostFontResourceLoader() {
        const probe = acquireForegroundApplicationProcess(runtime, app);
        failedSignal = probe.process.signal;
        probe.release();
        throw failure;
      },
    })).toThrow(failure);
    expect(failedSignal.aborted).toBe(true);
    const replacement = acquireForegroundApplicationProcess(runtime, app);
    expect(replacement.process.signal).not.toBe(failedSignal);
    replacement.release();
  });
});

describe("BundleLoader definition execution", () => {
  it("rejects actual-runtime closed background authority without using the isolated null path", async () => {
    const runtime = authoriseTestRuntime(createTestRuntime());
    runtimes.push(runtime);
    const create = vi.fn(() => ({ handle() {} }));
    registerTestSynWare(runtime, createSynWare({ manifest: {
      schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "Closed background",
      background: { enabled: true, tasks: [`${appId}.refresh`] },
    }, root: () => null, createBackgroundHandler: create }));
    await runtime.lifecycle.close(appId).result;
    expect(runtime.lifecycle.getState(appId)).toBe("closed");
    await expect(runtime.bundles.loadBundle(appId)).rejects.toThrow(/process authority|closed/i);
    expect(create).not.toHaveBeenCalled();
    expect(runtime.responders.get(`application:${appId}`)).toBeNull();
  });
  it("keeps an explicitly isolated loader's pure tasks unowned without borrowing app authority", async () => {
    class App extends NSEApplication { device = new TestDevice(); }
    const runtime = runtimeFor(App);
    await runtime.lifecycle.launch(appId).result;
    const app = applicationSessionFor(runtime, appId)!.app as App;
    const loader = createBundleLoader({ runtimeId: runtime.runtimeId, events: runtime.events });
    const calls: string[] = [];
    const bundle = createSynWareBundle(createSynWare({ manifest: {
      schemaVersion: 1, bundleIdentifier: "com.tests.isolated-background", version: "1.0.0", displayName: "Isolated",
      background: { enabled: true, tasks: ["com.tests.isolated-background.refresh"] },
    }, root: () => null, createBackgroundHandler() {
      expect(currentOwnedExecutionContext()).toBeNull();
      expect(() => new TestDevice()).toThrow(/owned execution/);
      calls.push("create");
      return { handle() { expect(currentOwnedExecutionContext()).toBeNull(); expect(() => new TestDevice()).toThrow(/owned execution/); calls.push("task"); } };
    } }));
    loader.registerBundle(bundle);
    try { await runInOwnedExecutionContext(app.device.context, () => loader.loadBundle(bundle.manifest.bundleIdentifier)); }
    finally { loader.dispose(); }
    expect(calls).toEqual(["create", "task"]);
    expect(app.device.signal.aborted).toBe(false);
  });
  it("keeps one load handler and narrows each task independently of the foreground process", async () => {
    const taskDevices: TestDevice[] = [];
    let handler!: TestDevice;
    let foreground!: TestDevice;
    let creates = 0;
    let count = 0;
    class App extends NSEApplication { device = new TestDevice(); constructor() { super(); foreground = this.device; } }
    const runtime = authoriseTestRuntime(createTestRuntime({ id: "runtime:background" }));
    runtimes.push(runtime);
    const definition = createSynWareDefinitionFromApplicationClass(App, {
      schemaVersion: 1, bundleIdentifier: appId, displayName: "Background", version: "1.0.0",
      background: { enabled: true, tasks: [`${appId}.first`, `${appId}.second`] },
    }, { createBackgroundHandler() {
      creates++;
      handler = new TestDevice();
      return { handle() {
        if (count++) expect(taskDevices[0]!.signal.aborted).toBe(true);
        const device = new TestDevice();
        taskDevices.push(device);
        expect(sameOwnedExecutionProcess(device.context, handler.context)).toBe(true);
        expect(sameOwnedExecutionProcess(device.context, foreground.context)).toBe(false);
      } };
    } });
    registerTestSynWare(runtime, definition);
    // Launch class services directly while the load's background definition remains pending.
    ensureApplicationSession(runtime, runtime.apps.getApp(appId)!, { AppClass: App, appName: "Background", strictOwnership: true });
    await runtime.appManager.getManagerForApp(appId)!.getReady();
    expect(creates).toBe(1);
    expect(count).toBe(2);
    expect(handler.releases).toBe(1);
    expect(taskDevices.map(device => device.releases)).toEqual([1, 1]);
    expect(foreground.signal.aborted).toBe(false);
    expect(currentOwnedExecutionContext()).toBeNull();
    expect(runtime.responders.inspect().registrations.filter(entry => entry.id.includes(":definition-task:"))).toHaveLength(0);
  });

  it("attaches a class background application's root before its field initialisers", async () => {
    const devices: TestDevice[] = [];
    class App extends NSEApplication {
      device = new TestDevice();
      constructor() { super(); devices.push(this.device); }
      override handleBackgroundTask() { expect(sameOwnedExecutionProcess(requireOwnedExecutionContext("background callback"), this.device.context)).toBe(true); }
    }
    const runtime = authoriseTestRuntime(createTestRuntime());
    runtimes.push(runtime);
    registerTestSynWare(runtime, createSynWareDefinitionFromApplicationClass(App, {
      schemaVersion: 1, bundleIdentifier: appId, displayName: "Background class", version: "1.0.0",
      background: { enabled: true, tasks: [`${appId}.refresh`] },
    }));
    await runtime.appManager.getManagerForApp(appId)!.getReady();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.releases).toBe(1);
    expect(applicationSessionFor(runtime, appId)).toBeUndefined();
  });

  it.each(["replacement", "runtime abort"])("revokes a held handler/task on %s and observes late settlement", async reason => {
    let enter!: () => void, finish!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const held = new Promise<void>(resolve => { finish = resolve; });
    let handler!: TestDevice, task!: TestDevice;
    const runtime = authoriseTestRuntime(createTestRuntime());
    runtimes.push(runtime);
    const definition = createSynWare({ manifest: {
      schemaVersion: 1, bundleIdentifier: appId, displayName: "Held background", version: "1.0.0",
      background: { enabled: true, tasks: [`${appId}.refresh`] },
    }, root: () => null, createBackgroundHandler() {
      handler = new TestDevice();
      return { async handle() { task = new TestDevice(); enter(); await held; throw new Error("late old task failure"); } };
    } });
    registerTestSynWare(runtime, definition);
    const ready = runtime.appManager.getManagerForApp(appId)!.getReady();
    const settlement = Promise.resolve(ready).catch(error => error);
    await entered;
    if (reason === "replacement") runtime.apps.register(createSynWareBundle(createSynWare({ manifest: { ...definition.manifest, version: "2.0.0", background: { enabled: false } }, root: () => null })));
    else await runtime.dispose();
    expect(handler.releases).toBe(1);
    expect(task.releases).toBe(1);
    expect(() => runInOwnedExecutionContext(task.context, () => new TestDevice())).toThrow();
    finish();
    await settlement;
    expect(currentOwnedExecutionContext()).toBeNull();
  });

  it("disposes the temporary class app on load cancellation even when its handler never settles", async () => {
    let enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    let app!: App;
    let releases = 0;
    class App extends NSEApplication {
      resource = this.own(() => ({ dispose() { releases++; } }));
      constructor() { super(); app = this; }
      override async handleBackgroundTask() { enter(); await new Promise<void>(() => {}); }
    }
    const runtime = authoriseTestRuntime(createTestRuntime());
    runtimes.push(runtime);
    registerTestSynWare(runtime, createSynWareDefinitionFromApplicationClass(App, {
      schemaVersion: 1, bundleIdentifier: appId, displayName: "Cancelled class", version: "1.0.0",
      background: { enabled: true, tasks: [`${appId}.refresh`] },
    }));
    const result = runtime.appManager.getManagerForApp(appId)!.getReady().catch(error => error);
    await entered;
    await runtime.dispose();
    await result;
    expect(app.isDisposed).toBe(true);
    expect(releases).toBe(1);
  });
});

it("renders through createSynWareTestHost with exact class authority while the public kernel remains hidden", async () => {
  const observed: Array<SynCloudOSRuntime | null> = [];
  class Window extends NSEWindowController {
    device = new TestDevice();
    static override view = function View() { observed.push(useContext(SynCloudOSRuntimeContext)); return createElement("span", null, "Private host identity"); };
  }
  class App extends NSEApplication { static override mainWindow = Window; device = new TestDevice(); }
  const host = createSynWareTestHost({ application: App, manifest: { schemaVersion: 1, bundleIdentifier: appId, displayName: "Private host", version: "1.0.0" }, document });
  host.adapters.animation.allow();
  try {
    let view!: Awaited<ReturnType<typeof host.render>>;
    await act(async () => { view = await host.render(); });
    expect(view.container.textContent).toContain("Private host identity");
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every(value => value === null)).toBe(true);
    const app = host.application as App;
    expect(sameOwnedExecutionProcess(app.device.context, (app.windows[0] as Window).device.context)).toBe(true);
  } finally { await act(async () => { await host.dispose(); }); }
});

it("keeps private process issuers, mounted associations and the host identity provider out of public SDK exports", () => {
  const privateNames = new Set([
    "ApplicationProcessAuthority", "ApplicationProcessMembership", "assertApplicationProcessAdmission", "acquireForegroundApplicationProcess",
    "joinApplicationProcess", "createBackgroundApplicationProcess", "revokeForegroundApplicationProcess", "registerMountedFXExecutionContext",
    "mountedFXExecutionContext", "applicationResourceErrorReporter", "ApplicationHostRuntimeContext", "PreparedApplicationServices",
    "prepareApplicationServices", "prepareDefinitionBackgroundExecution", "DefinitionBackgroundExecution", "createUnownedDefinitionBackgroundExecution", "reportNSEConstructionCleanupError",
  ]);
  const entries = Object.values(synWareSdkEntries).map(path => resolve(path));
  const program = ts.createProgram(entries, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true });
  const checker = program.getTypeChecker();
  for (const entry of entries) {
    const source = program.getSourceFile(entry)!;
    expect(checker.getExportsOfModule(checker.getSymbolAtLocation(source)!).map(symbol => symbol.name).filter(name => privateNames.has(name)), entry).toEqual([]);
  }
  expect(entries.some(path => /applicationProcessAuthority|mountedFXExecutionContext|applicationHostRuntimeContext|applicationServicesPreparation/.test(path))).toBe(false);
});
