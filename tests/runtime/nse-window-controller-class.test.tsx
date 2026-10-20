// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEApplication, type NSEApplicationClass } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { applicationSessionFor, ensureApplicationSession } from "../../src/SynCloudOS/AppSDK/applicationSession";
import { createMountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { useSCOS } from "../../src/SynCloudOS/AppSDK/scos";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { ApplicationStageView } from "../../src/Webspring/ApplicationStageView";
import { createApplicationWindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { createTestBundle } from "./helpers";
import type { AppWorkspaceDocumentsClient } from "../../src/SynCloudOS/AppSDK/appClientTypes";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
});

/** Builds an application whose main window is `Controller`, launches it and mounts its windows. */
async function openApplication(Controller: NonNullable<NSEApplicationClass["mainWindow"]>, appId?: string) {
  class WindowedApp extends NSEApplication {
    static override mainWindow = Controller;
  }
  const host = createClassApplicationHost(WindowedApp, appId);
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  const windowId = await host.openMainWindow();
  return { host, windowId, record: () => host.runtime.windows.select(windowId) };
}

function registerClassDocumentType(host: ClassApplicationHost) {
  host.runtime.documents.registerType({
    id: "tests.class-document", displayName: "Class document", schemaVersion: 1, extensions: [], mimeTypes: [],
    capabilities: { versions: false, conflicts: false }, autosave: "disabled",
    create: () => ({ value: "new" }), read: (value: { value: string }) => value, write: (value: { value: string }) => value,
    validate: (value: unknown): value is { value: string } => Boolean(value && typeof value === "object" && "value" in value && typeof value.value === "string"),
  });
}

async function openDocumentApplication(appId: string) {
  let documents!: AppWorkspaceDocumentsClient;
  class Main extends NSEWindowController {
    static override view = function DocumentSource() {
      documents = useSCOS().documents.workspaceDocuments;
      return <p>Document source window</p>;
    };
  }
  class Detached extends NSEWindowController {
    static override view = () => <p>Detached document window</p>;
  }
  class Application extends NSEApplication {
    static override mainWindow = Main;
    static override windowControllers = { detached: Detached };
  }
  const host = createClassApplicationHost(Application, appId);
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  const windowId = await host.openMainWindow();
  const original = applicationSessionFor({ runtimeId: host.runtime.runtimeId, appId })!;
  registerClassDocumentType(host);
  await screen.findByText("Document source window");
  const document = await documents.newDocument({
    typeId: "tests.class-document",
    location: { kind: "memory", namespace: appId, key: "note" },
    initialModel: { value: "Note" },
  });
  await documents.saveDocument(document.id);
  return { host, windowId, original, documents, document, Detached, Application };
}

describe("class application undo", () => {
  it("routes normal stage Undo validation and dispatch to the application's recorded history", async () => {
    let value = 1;
    const appId = "com.example.stage-application-undo";
    class Main extends NSEWindowController {
      static override view = function UndoView() {
        const scos = useSCOS();
        return <button onClick={() => {
          scos.undo.create({ kind: "application", id: appId }).register({
            name: "Application change", asyncPolicy: "forbid",
            undo: () => { value = 0; }, redo: () => { value = 1; },
          });
        }}>Record application change</button>;
      };
    }
    class Application extends NSEApplication { static override mainWindow = Main; }
    const host = createClassApplicationHost(Application, appId);
    hosts.push(host);
    // Exercise the production bootstrap registration, not the fixture's host-owned responder.
    host.runtime.responders.remove(`application:${appId}`);
    await host.launch();
    const app = host.runtime.apps.getApp(appId)!;
    const registry = createApplicationWindowContentRendererRegistry(host.runtime, { [appId]: app });
    const view = render(<SynCloudOSProvider runtime={host.runtime}>
      <HostSiteBrandingProvider value={{ name: "Class application host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null }}>
        <ApplicationStageView app={app} lifecycle="active" windowContentRegistry={registry}
          stage={{ appId, id: `application-stage:${appId}`, title: app.window.title, isFocused: true, zIndex: 1 }} />
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>);
    const button = await screen.findByRole("button", { name: "Record application change" });
    fireEvent.click(button);
    act(() => { button.focus(); });

    await expect(host.runtime.commands.validate("edit.undo")).resolves.toMatchObject({ enabled: true, title: "Undo Application change" });
    await act(async () => {
      await expect(host.runtime.commands.dispatch("edit.undo")).resolves.toMatchObject({ status: "executed" });
    });
    expect(value).toBe(0);
    await expect(host.runtime.commands.validate("edit.redo")).resolves.toMatchObject({ enabled: true, title: "Redo Application change" });
    view.unmount();
  });
});

describe("NSEWindowController window", () => {
  it("restores the named detached controller and its options instead of the main controller", async () => {
    class Main extends NSEWindowController { static override view = () => <p>Main restoration window</p>; }
    class Detached extends NSEWindowController { static override view = () => <p>Detached restoration window</p>; }
    class Application extends NSEApplication {
      static override mainWindow = Main;
      static override windowControllers = { detached: Detached };
    }
    const host = createClassApplicationHost(Application, "com.example.controller-restoration");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    await host.openMainWindow();
    const identity = { runtimeId: host.runtime.runtimeId, appId: host.appId };
    const original = applicationSessionFor(identity)!;
    const options = { title: "Detached note", restorationKey: "note-one", mobilePolicy: "hidden" as const, width: 640, height: 480, preferredBounds: "centred" as const };
    let detached!: NSEWindowController;
    await act(async () => { detached = await original.app.openWindow(Detached, options); });
    await screen.findByText("Detached restoration window");
    const id = detached.window.id!;
    const frame = host.runtime.windows.select(id).record.bounds;
    const area = host.runtime.environment.workArea.getSnapshot();
    expect(frame.x).toBe(area.x + (area.width - frame.width) / 2);
    expect(host.runtime.windows.select(id).record.mobilePolicy).toBe("hidden");
    expect(detached.openingOptions).toEqual(options);
    host.unmountWindows();
    original.dispose("explicit");
    const restored = ensureApplicationSession(identity, { AppClass: Application, appName: "Class application", strictOwnership: true });
    restored.prepareServices(host.runtime);
    host.mountWindows();
    await screen.findByText("Detached restoration window");
    const recreated = restored.app.windows.find(controller => controller.window.id === id)!;
    expect(recreated).toBeInstanceOf(Detached);
    expect(recreated).not.toBe(detached);
    expect(recreated.openingOptions).toEqual(options);
  });
  it("loads the window with its identity before the view renders, and reports key-window changes", async () => {
    const events: string[] = [];
    const keyEvents: string[] = [];
    let controller!: LoadingWindow;
    class LoadingWindow extends NSEWindowController {
      static override view = function LoadingView() { events.push("view rendered"); return <p>Loading window content</p>; };
      constructor() { super(); controller = this; }
      windowDidLoad() { events.push(`didLoad:${this.window.id}`); }
      windowDidBecomeKey() { keyEvents.push("didBecomeKey"); }
      windowDidResignKey() { keyEvents.push("didResignKey"); }
    }
    class OtherWindow extends NSEWindowController {
      static override view = function OtherView() { return <p>Other window content</p>; };
    }
    const { host, windowId } = await openApplication(LoadingWindow);
    await screen.findByText("Loading window content");

    expect(events[0]).toBe(`didLoad:${windowId}`);
    expect(events.indexOf("view rendered")).toBeGreaterThan(0);
    expect(keyEvents).toEqual(["didBecomeKey"]);
    expect(controller.window.isKey).toBe(true);

    let other!: NSEWindowController;
    await act(async () => { other = await controller.app.openWindow(OtherWindow); });
    act(() => { host.runtime.windows.makeKey(other.window.id!); });

    expect(controller.window.isKey).toBe(false);
    expect(keyEvents).toEqual(["didBecomeKey", "didResignKey"]);

    act(() => { controller.window.focus(); });

    expect(controller.window.isKey).toBe(true);
    expect(keyEvents).toEqual(["didBecomeKey", "didResignKey", "didBecomeKey"]);
  });

  it("renames the window when the title is assigned, including before it mounts", async () => {
    let controller!: TitledWindow;
    class TitledWindow extends NSEWindowController {
      static override view = function TitledView() { return <p>Titled content</p>; };
      constructor() { super(); controller = this; this.window.title = "Before mount"; }
      windowDidLoad() { this.window.title = `${this.window.title}, loaded`; }
    }
    const { record } = await openApplication(TitledWindow);
    await screen.findByText("Titled content");

    expect(record().record.title).toBe("Before mount, loaded");
    expect(controller.window.title).toBe("Before mount, loaded");

    act(() => { controller.window.title = "Receipts"; });
    expect(record().record.title).toBe("Receipts");
    expect(controller.window.title).toBe("Receipts");
  });

  it("minimises and zooms the window it manages", async () => {
    let controller!: ResizableWindow;
    class ResizableWindow extends NSEWindowController {
      static override view = function ResizableView() { return <p>Resizable content</p>; };
      constructor() { super(); controller = this; }
    }
    const { record } = await openApplication(ResizableWindow);
    await screen.findByText("Resizable content");

    act(() => { controller.window.zoom(); });
    expect(record().geometryState.zoomed).toBe(true);
    act(() => { controller.window.zoom(); });
    expect(record().geometryState.zoomed).toBe(false);

    expect(controller.window.isMinimised).toBe(false);
    act(() => { controller.window.minimise(); });
    expect(record().record.state).toBe("minimised");
    expect(controller.window.isMinimised).toBe(true);
  });

  it("throws NSE_VIEW_NOT_LOADED from window members before the window mounts and after it unmounts", async () => {
    let early: unknown;
    let controller!: UnmountedWindow;
    class UnmountedWindow extends NSEWindowController {
      static override view = function UnmountedView() { return <p>Unmounted content</p>; };
      constructor() {
        super();
        controller = this;
        try { this.window.minimise(); } catch (error) { early = error; }
      }
    }
    const { host } = await openApplication(UnmountedWindow);
    await screen.findByText("Unmounted content");

    expect(early).toMatchObject({ code: "NSE_VIEW_NOT_LOADED" });
    expect(() => controller.window.zoom()).not.toThrow();

    host.unmountWindows();

    expect(() => controller.window.zoom()).toThrowError(expect.objectContaining({ code: "NSE_VIEW_NOT_LOADED" }));
  });
});

describe("NSEWindowController closing", () => {
  it("keeps the window open when windowShouldClose returns false, and closes it once it returns true", async () => {
    const events: string[] = [];
    let allow = false;
    class GuardedWindow extends NSEWindowController {
      static override view = function GuardedView() { return <p>Guarded content</p>; };
      async windowShouldClose() { events.push("shouldClose"); await Promise.resolve(); return allow; }
      windowWillClose() { events.push("willClose"); }
    }
    const { host, windowId, record } = await openApplication(GuardedWindow);
    await screen.findByText("Guarded content");

    const refused = await host.runtime.windows.requestClose(windowId, { reason: "command" });

    expect(refused.outcome).toBe("refused");
    expect(record().record.state).toBe("open");
    expect(screen.queryByText("Guarded content")).toBeTruthy();
    expect(events).toEqual(["shouldClose"]);

    allow = true;
    const closed = await host.runtime.windows.requestClose(windowId, { reason: "command" });

    expect(closed.outcome).toBe("closed");
    expect(events).toEqual(["shouldClose", "shouldClose", "willClose"]);
  });

  it("disposes the window controller with the reason window-closed once the window closes", async () => {
    let controller!: ClosingWindow;
    class ClosingWindow extends NSEWindowController {
      static override view = function ClosingView() { return <p>Closing content</p>; };
      constructor() { super(); controller = this; }
    }
    const { host, windowId } = await openApplication(ClosingWindow);
    await screen.findByText("Closing content");
    expect(controller.isDisposed).toBe(false);

    await act(async () => { await host.runtime.windows.requestClose(windowId, { reason: "command" }); });

    expect(controller.isDisposed).toBe(true);
    expect(controller.disposalReason).toBe("window-closed");
  });

  it("reports its own committed close after the window capability is revoked", async () => {
    let controller!: ClosingWindow;
    class ClosingWindow extends NSEWindowController {
      static override view = () => <p>Self-closing content</p>;
      constructor() { super(); controller = this; }
    }
    const { host, windowId } = await openApplication(ClosingWindow);
    await screen.findByText("Self-closing content");

    await act(async () => { expect(await controller.window.close()).toBe("closed"); });

    expect(host.runtime.windows.list().some(({ id }) => id === windowId)).toBe(false);
    expect(controller.isDisposed).toBe(true);
    expect(controller.disposalReason).toBe("window-closed");
  });

  it("rejects a pending close when its mount is revoked before the close commits", async () => {
    let controller!: WaitingWindow;
    let finishGuard!: (allow: boolean) => void;
    class WaitingWindow extends NSEWindowController {
      static override view = () => <p>Pending close content</p>;
      constructor() { super(); controller = this; }
      windowShouldClose() { return new Promise<boolean>((resolve) => { finishGuard = resolve; }); }
    }
    const { host, record } = await openApplication(WaitingWindow);
    await screen.findByText("Pending close content");
    const closing = controller.window.close();
    const rejected = expect(closing).rejects.toMatchObject({ name: "AbortError" });
    await waitFor(() => { expect(finishGuard).toBeTypeOf("function"); });

    host.unmountWindows();
    finishGuard(true);

    await rejected;
    expect(record().record.state).toBe("open");
    expect(controller.isDisposed).toBe(false);
  });

  it("reports a refused close through window.close()", async () => {
    let controller!: StubbornWindow;
    class StubbornWindow extends NSEWindowController {
      static override view = function StubbornView() { return <p>Stubborn content</p>; };
      constructor() { super(); controller = this; }
      windowShouldClose() { return false; }
    }
    await openApplication(StubbornWindow);
    await screen.findByText("Stubborn content");

    await expect(controller.window.close()).resolves.toBe("refused");
  });

  it("does not ask windowShouldClose when the application quits, leaving the decision to applicationShouldTerminate", async () => {
    const events: string[] = [];
    class QuittingApp extends NSEApplication {
      static override mainWindow = class QuitWindow extends NSEWindowController {
        static override view = function QuitView() { return <p>Quit content</p>; };
        windowShouldClose() { events.push("windowShouldClose"); return false; }
        windowWillClose() { events.push("windowWillClose"); }
      };
      applicationShouldTerminate() { events.push("applicationShouldTerminate"); return true; }
    }
    const host = createClassApplicationHost(QuittingApp, "com.example.quitting-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    const windowId = await host.openMainWindow();
    await screen.findByText("Quit content");

    const result = await host.quit();

    expect(result).toMatchObject({ status: "completed", committed: true });
    expect(events).toContain("applicationShouldTerminate");
    expect(events).not.toContain("windowShouldClose");
    expect(events).toContain("windowWillClose");
    expect(host.runtime.windows.list().map(({ id }) => id)).not.toContain(windowId);
  });

  it("keeps the windows open when the application vetoes the quit", async () => {
    const events: string[] = [];
    class VetoingApp extends NSEApplication {
      static override mainWindow = class VetoWindow extends NSEWindowController {
        static override view = function VetoView() { return <p>Veto content</p>; };
        windowWillClose() { events.push("windowWillClose"); }
      };
      applicationShouldTerminate() { return false; }
    }
    const host = createClassApplicationHost(VetoingApp, "com.example.vetoing-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    const windowId = await host.openMainWindow();
    await screen.findByText("Veto content");

    const result = await host.quit();

    expect(result).toMatchObject({ committed: false });
    expect(host.runtime.windows.select(windowId).record.state).toBe("open");
    expect(events).toEqual([]);
  });
});

describe("opening more windows", () => {
  it("keeps the stage source and two different class document owners live independently", async () => {
    const appId = "com.example.class-stage-document-owners";
    let documents!: AppWorkspaceDocumentsClient;
    class Main extends NSEWindowController {
      static override view = function StageDocumentSource() {
        documents = useSCOS().documents.workspaceDocuments;
        return <p>Stage document source</p>;
      };
    }
    class Detached extends NSEWindowController {
      static override view = () => <p>Independent detached document</p>;
    }
    class Application extends NSEApplication { static override mainWindow = Main; }
    const host = createClassApplicationHost(Application, appId);
    hosts.push(host);
    registerClassDocumentType(host);
    // The window-only fixture installs a host application responder. A real
    // stage launch lets the session establish that responder before mounting.
    host.runtime.responders.remove(`application:${appId}`);
    await host.launch();
    host.mountWindows();
    const app = host.runtime.apps.getApp(appId)!;
    const registry = createApplicationWindowContentRendererRegistry(host.runtime, { [appId]: app });
    const view = render(<SynCloudOSProvider runtime={host.runtime}>
      <HostSiteBrandingProvider value={{ name: "Class application host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null }}>
        <ApplicationStageView app={app} lifecycle="active" windowContentRegistry={registry}
          stage={{ appId, id: `application-stage:${appId}`, title: app.window.title, isFocused: true, zIndex: 1 }} />
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>);
    await screen.findByText("Stage document source");
    const original = applicationSessionFor({ runtimeId: host.runtime.runtimeId, appId })!;
    expect(original.ownsApplicationResponder).toBe(true);
    expect(host.runtime.responders.inspect().registrations.filter(
      responder => responder.id === `application:${appId}`,
    )).toHaveLength(1);
    const firstDocument = await documents.newDocument({
      typeId: "tests.class-document", location: { kind: "memory", namespace: appId, key: "first" }, initialModel: { value: "First" },
    });
    await documents.saveDocument(firstDocument.id);
    let first!: NSEWindowController;
    await act(async () => {
      first = await original.app.openWindow(Detached, { documentId: firstDocument.id, restorationKey: "first" });
    });
    // A document facade must not supersede the stage's app/responder/window
    // transfer identity: its original document port must still admit work.
    await expect(documents.saveDocument(firstDocument.id)).resolves.toBeUndefined();
    const secondDocument = await documents.newDocument({
      typeId: "tests.class-document", location: { kind: "memory", namespace: appId, key: "second" }, initialModel: { value: "Second" },
    });
    await documents.saveDocument(secondDocument.id);
    let second!: NSEWindowController;
    let anotherFirst!: NSEWindowController;
    await act(async () => {
      second = await original.app.openWindow(Detached, { documentId: secondDocument.id, restorationKey: "second" });
      anotherFirst = await original.app.openWindow(Detached, { documentId: firstDocument.id, restorationKey: "another-first" });
    });
    expect(host.runtime.windows.select(anotherFirst.window.id!).record.documentId).toBe(firstDocument.id);
    expect(host.runtime.windows.select(second.window.id!).record.documentId).toBe(secondDocument.id);
    const ownerResponders = () => host.runtime.responders.inspect().registrations.filter(
      responder => responder.id.startsWith(`controller:${appId}:document-windows:`),
    );
    expect(ownerResponders()).toHaveLength(2);
    await documents.releaseDocument(firstDocument.id);
    await documents.releaseDocument(secondDocument.id);
    await act(async () => {
      await first.window.close();
      await anotherFirst.window.close();
    });
    expect(ownerResponders()).toHaveLength(1);
    expect(host.runtime.documents.hasActiveDocumentOwnerLease(secondDocument.id, appId)).toBe(true);
    await act(async () => { await second.window.close(); });
    await waitFor(() => {
      expect(ownerResponders()).toHaveLength(0);
      expect(host.runtime.documents.getDocument(firstDocument.id)).toBeNull();
      expect(host.runtime.documents.getDocument(secondDocument.id)).toBeNull();
    });
    view.unmount();
  });

  it("retains another mount's document until the last class-controlled window closes", async () => {
    const { host, windowId, original, documents, document, Detached } = await openDocumentApplication("com.example.class-document-owners");
    const app = host.runtime.apps.getApp(host.appId)!;
    const unowned = createMountedSynWareRuntime({ runtime: host.runtime, app, responderId: `application:${host.appId}` });
    await expect(unowned.runtime.windows.openDocumentWindow({
      documentId: document.id, title: "Not retained", restorationKey: "not-retained",
    })).rejects.toMatchObject({ name: "SecurityError" });
    unowned.dispose();
    const options = { documentId: document.id, restorationKey: "detached-note", title: "Detached note", mobilePolicy: "hidden" as const, width: 620, height: 430, preferredBounds: "centred" as const };
    let first!: NSEWindowController;
    let second!: NSEWindowController;
    await act(async () => {
      [first, second] = await Promise.all([
        original.app.openWindow(Detached, options),
        original.app.openWindow(Detached, { ...options, restorationKey: "second-note" }),
      ]);
    });
    expect(first.openingOptions).toEqual(options);
    expect(host.runtime.windows.select(first.window.id!).record).toMatchObject({
      documentId: document.id, documentAssociationRole: "secondary", title: options.title, mobilePolicy: "hidden",
      bounds: { width: 620, height: 430 },
    });
    await documents.releaseDocument(document.id);
    await act(async () => { await host.runtime.windows.requestClose(windowId, { reason: "command" }); });
    expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(true);

    await act(async () => { await first.window.close(); });
    expect(first.isDisposed).toBe(true);
    expect(second.isDisposed).toBe(false);
    expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(true);
    expect(host.runtime.documents.getDocument(document.id)).not.toBeNull();
    await act(async () => { await second.window.close(); });
    await waitFor(() => {
      expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(false);
      expect(host.runtime.documents.getDocument(document.id)).toBeNull();
    });
  });

  it("restores a named document controller with its options and a new application owner", async () => {
    const { host, original, documents, document, Detached, Application } = await openDocumentApplication("com.example.class-document-restoration");
    const options = { documentId: document.id, restorationKey: "restored-document", title: "Restored note", mobilePolicy: "hidden" as const };
    let detached!: NSEWindowController;
    await act(async () => { detached = await original.app.openWindow(Detached, options); });
    const id = detached.window.id!;
    await documents.releaseDocument(document.id);
    host.unmountWindows();
    original.dispose("explicit");
    const restored = ensureApplicationSession({ runtimeId: host.runtime.runtimeId, appId: host.appId }, {
      AppClass: Application, appName: "Class application", strictOwnership: true,
    });
    restored.prepareServices(host.runtime);
    host.mountWindows();
    await screen.findByText("Detached document window");
    const controller = restored.app.windows.find(candidate => candidate.window.id === id)!;
    expect(controller).toBeInstanceOf(Detached);
    expect(controller.openingOptions).toEqual(options);
    expect(host.runtime.windows.select(id).record.documentId).toBe(document.id);
    expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(true);
    await act(async () => {
      expect(await restored.app.openWindow(Detached, options)).toBe(controller);
      await controller.window.close();
    });
    await waitFor(() => {
      expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(false);
      expect(host.runtime.documents.getDocument(document.id)).toBeNull();
    });
  });

  it.each([false, true])("rolls back failed document-window ownership without releasing another controller (existing: %s)", async (withExisting) => {
    const { host, original, documents, document, Detached } = await openDocumentApplication(`com.example.class-document-failure-${withExisting}`);
    let existing: NSEWindowController | undefined;
    if (withExisting) {
      await act(async () => {
        existing = await original.app.openWindow(Detached, { documentId: document.id, restorationKey: "existing" });
      });
    }
    const controllers = [...original.app.windows];
    await expect(original.app.openWindow(Detached, {
      documentId: document.id, restorationKey: "failed", mobilePolicy: "invalid" as never,
    })).rejects.toThrow(/mobilePolicy/);
    expect(original.app.windows).toEqual(controllers);
    await documents.releaseDocument(document.id);
    if (existing) {
      expect(existing.isDisposed).toBe(false);
      expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(true);
      await act(async () => { await existing!.window.close(); });
    }
    await waitFor(() => {
      expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(false);
      expect(host.runtime.documents.getDocument(document.id)).toBeNull();
    });
  });

  it("preserves the source facade's independent document owner when a class window closes", async () => {
    const { host, original, documents, document, Detached } = await openDocumentApplication("com.example.class-document-independent-owner");
    let detached!: NSEWindowController;
    await act(async () => { detached = await original.app.openWindow(Detached, { documentId: document.id }); });
    await act(async () => { await detached.window.close(); });
    expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(true);
    await expect(documents.saveDocument(document.id)).resolves.toBeUndefined();
    await documents.releaseDocument(document.id);
    await waitFor(() => {
      expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(false);
      expect(host.runtime.documents.getDocument(document.id)).toBeNull();
    });
  });

  it("rejects documents belonging to another application without disturbing their owner", async () => {
    const { host, original, Detached } = await openDocumentApplication("com.example.class-document-admission");
    const foreignAppId = "com.example.foreign-document";
    host.runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: foreignAppId, route: "/foreign-document" }));
    const responderId = `application:${foreignAppId}`;
    host.runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
    const foreign = createMountedSynWareRuntime({ runtime: host.runtime, app: host.runtime.apps.getApp(foreignAppId)!, responderId });
    try {
      const document = await foreign.runtime.workspaceDocuments.newDocument({ typeId: "tests.class-document", initialModel: { value: "Foreign" } });
      const controllers = [...original.app.windows];
      await expect(original.app.openWindow(Detached, { documentId: document.id, restorationKey: "foreign" })).rejects.toMatchObject({ name: "SecurityError" });
      expect(original.app.windows).toEqual(controllers);
      expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, host.appId)).toBe(false);
      expect(host.runtime.documents.hasActiveDocumentOwnerLease(document.id, foreignAppId)).toBe(true);
    } finally {
      foreign.dispose();
    }
  });

  it("opens another window controller with openWindow and gives it its own view", async () => {
    let app!: MultiWindowApp;
    class InspectorWindow extends NSEWindowController {
      static override view = function InspectorView() { return <p>Inspector content</p>; };
    }
    class MultiWindowApp extends NSEApplication {
      static override mainWindow = class MainWindow extends NSEWindowController {
        static override view = function MainView() { return <p>Main content</p>; };
      };
      constructor() { super(); app = this; }
    }
    const host = createClassApplicationHost(MultiWindowApp, "com.example.multi-window-app");
    hosts.push(host);
    await host.launch();
    host.mountWindows();
    await host.openMainWindow();
    await screen.findByText("Main content");

    let inspector!: InspectorWindow;
    await act(async () => { inspector = await app.openWindow(InspectorWindow, { title: "Inspector" }); });

    expect(await screen.findByText("Inspector content")).toBeTruthy();
    expect(app.windows).toContain(inspector);
    expect(inspector.window.title).toBe("Inspector");
    expect(inspector.app).toBe(app);
  });
});

describe("content view controller", () => {
  it("renders the content view controller instead of static view, and disposes the previous one when it is replaced", async () => {
    let controller!: HostWindow;
    class FirstContent extends NSEViewController {
      static override view = function FirstView() { return <p>First content</p>; };
    }
    class SecondContent extends NSEViewController {
      static override view = function SecondView() { return <p>Second content</p>; };
    }
    class HostWindow extends NSEWindowController {
      static override view = function IgnoredView() { return <p>Static view content</p>; };
      constructor() { super(); controller = this; this.contentViewController = new FirstContent(); }
    }
    await openApplication(HostWindow);
    await screen.findByText("First content");
    expect(screen.queryByText("Static view content")).toBeNull();

    const first = controller.contentViewController!;
    act(() => { controller.contentViewController = new SecondContent({ owner: controller }); });

    expect(await screen.findByText("Second content")).toBeTruthy();
    expect(first.isDisposed).toBe(true);
    expect(first.disposalReason).toBe("removed-from-parent");
  });
});
