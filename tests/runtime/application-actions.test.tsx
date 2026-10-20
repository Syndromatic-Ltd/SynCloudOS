// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEObject, observable } from "../../src/NSE/Objects";
import { NSEPushButton } from "../../src/NSE/Controls/Buttons/NSEButtons";
import { NSEActionScopeProvider, NSEControlRuntimeProvider } from "../../src/NSE/Controls/Core";
import { NSEMenuController } from "../../src/NSE/Menus/NSEMenuController";
import type { NSEMenuRuntimePort } from "../../src/NSE/Menus/menuTypes";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { useNSEMenuPort } from "../../src/SynCloudOS/AppSDK/SynWareNSEMenuPort";
import { action, actionNames, bindActionResponder, hasActions, refreshActionBindings } from "../../src/SynCloudOS/AppSDK/actions";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import type { SynWareContextValue } from "../../src/SynCloudOS/AppSDK/appContextTypes";
import type { MountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const appId = "notes";

class Recorder extends NSEObject {
  readonly calls: string[] = [];
}

class AppController extends Recorder {
  @observable accessor readOnly = false;
  @action newNote() { this.calls.push("app.newNote"); }
  validateNewNote() { return !this.readOnly; }
  @action shared() { this.calls.push("app.shared"); }
  @action("document.save") save() { this.calls.push("app.save"); }
}

class WindowController extends Recorder {
  @action shared() { this.calls.push("window.shared"); }
  @action("document.save") save() { this.calls.push("window.save"); }
}

class ViewController extends Recorder {
  @action shared() { this.calls.push("view.shared"); }
  @action rename(payload: { readonly title: string }) { this.calls.push(`view.rename:${payload.title}`); }
  @action("window.close") closeWindow() { this.calls.push("view.close"); }
  @action reload() { this.calls.push("view.reload"); }
  validateReload() { return { enabled: false, disabledReason: "Nothing to reload." }; }
  @action async slow(payload: number) { await Promise.resolve(); this.calls.push(`view.slow:${payload}`); }
  validateSlow() { return Promise.resolve(true); }
}

const responderIds = { app: `application:${appId}`, window: "window:notes-main", view: "view:notes-editor" };
const mounts: MountedSynWareRuntime[] = [];
const runtimes: SynCloudOSRuntime[] = [];

afterEach(async () => {
  cleanup();
  for (const mount of mounts.splice(0)) mount.dispose();
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
});

function fixture() {
  const runtime = createTestRuntime();
  runtimes.push(runtime);
  registerTestSynWare(runtime, { schemaVersion: 1, id: appId, version: "1.0.0", title: "Notes" });
  const mount = mountTestSynWareRuntime(runtime, appId);
  mounts.push(mount);
  runtime.responders.register({ id: responderIds.window, kind: "window", parentId: responderIds.app, scopeId: responderIds.window });
  runtime.responders.register({ id: responderIds.view, kind: "view", parentId: responderIds.window, scopeId: responderIds.window });
  const context = createSynWareContextValue(mount.runtime);
  const host = { appId, commands: context.commands };
  const app = new AppController();
  const window = new WindowController();
  const view = new ViewController();
  const bindings = {
    app: bindActionResponder(app, host, responderIds.app),
    window: bindActionResponder(window, host, responderIds.window),
    view: bindActionResponder(view, host, responderIds.view),
  };
  const focus = (responder: keyof typeof responderIds) => runtime.focus.requestFocus(responderIds[responder]);
  const dispatch = (id: string, payload?: unknown) => context.commands.dispatch<{ readonly status: string; readonly reason?: string }>(id, payload);
  return { runtime, context, host, app, window, view, bindings, focus, dispatch };
}

describe("actions along the responder chain", () => {
  it("resolves an action from the focused view, then its window, then the application", async () => {
    const { app, window, view, focus, dispatch } = fixture();

    focus("view");
    await expect(dispatch("notes.shared")).resolves.toMatchObject({ status: "executed" });
    focus("window");
    await expect(dispatch("notes.shared")).resolves.toMatchObject({ status: "executed" });
    focus("app");
    await expect(dispatch("notes.shared")).resolves.toMatchObject({ status: "executed" });

    expect(view.calls).toEqual(["view.shared"]);
    expect(window.calls).toEqual(["window.shared"]);
    expect(app.calls).toEqual(["app.shared"]);
  });

  it("reaches an action declared higher in the chain from a focused view", async () => {
    const { app, focus, dispatch } = fixture();
    focus("view");
    await expect(dispatch("notes.newNote")).resolves.toMatchObject({ status: "executed" });
    expect(app.calls).toEqual(["app.newNote"]);
  });

  it("binds a standard command id and resolves it by focus", async () => {
    const { app, window, focus, dispatch } = fixture();
    focus("view");
    await expect(dispatch("document.save")).resolves.toMatchObject({ status: "executed" });
    focus("app");
    await expect(dispatch("document.save")).resolves.toMatchObject({ status: "executed" });
    expect(window.calls).toEqual(["window.save"]);
    expect(app.calls).toEqual(["app.save"]);
  });

  it("answers a standard window command declared on a view", async () => {
    const { view, focus, dispatch } = fixture();
    focus("view");
    await expect(dispatch("window.close")).resolves.toMatchObject({ status: "executed" });
    expect(view.calls).toEqual(["view.close"]);
  });

  it("passes the payload and rejects one the method does not take", async () => {
    const { app, view, focus, dispatch } = fixture();
    focus("view");
    await expect(dispatch("notes.rename", { title: "Receipts" })).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch("notes.slow", 4)).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch("notes.reload", { unexpected: true })).resolves.toMatchObject({ status: "invalid-payload" });
    expect(view.calls).toEqual(["view.rename:Receipts", "view.slow:4"]);
    focus("app");
    await expect(dispatch("notes.newNote", { unexpected: true })).resolves.toMatchObject({ status: "invalid-payload" });
    expect(app.calls).toEqual([]);
  });

  it("refuses to run an action whose validation says it is unavailable", async () => {
    const { app, view, focus, dispatch } = fixture();
    focus("view");
    await expect(dispatch("notes.reload")).resolves.toMatchObject({ status: "disabled", reason: "Nothing to reload." });
    expect(view.calls).toEqual([]);

    app.readOnly = true;
    await expect(dispatch("notes.newNote")).resolves.toMatchObject({ status: "disabled" });
    app.readOnly = false;
    await expect(dispatch("notes.newNote")).resolves.toMatchObject({ status: "executed" });
    expect(app.calls).toEqual(["app.newNote"]);
  });

  it("rolls back every registration when one cannot be made, and on dispose", async () => {
    const { runtime, context, host, focus, dispatch } = fixture();
    class Clash extends Recorder {
      @action shared() { this.calls.push("clash.shared"); }
      @action("notes.shared") other() { this.calls.push("clash.other"); }
    }
    expect(() => bindActionResponder(new Clash(), host, responderIds.app)).toThrow(/both answer notes\.shared/);

    class Extra extends Recorder { @action extra() { this.calls.push("extra"); } }
    const extra = new Extra();
    const binding = bindActionResponder(extra, host, responderIds.window);
    focus("window");
    await expect(dispatch("notes.extra")).resolves.toMatchObject({ status: "executed" });
    binding.dispose();
    binding.dispose();
    expect(runtime.commands.getDeclarations().some((declaration) => declaration.id === "notes.extra")).toBe(false);
    expect(context.commands.getPresentationGeneration().registryGeneration).toBeGreaterThan(0);
  });

  it("picks up actions added by a replaced class on refresh", async () => {
    const { host, focus, dispatch } = fixture();
    class Panel extends Recorder { @action first() { this.calls.push("first"); } }
    const panel = new Panel();
    bindActionResponder(panel, host, responderIds.window);
    class PanelV2 extends Recorder {
      @action first() { this.calls.push("first v2"); }
      @action second() { this.calls.push("second v2"); }
    }
    Object.setPrototypeOf(panel, PanelV2.prototype);
    refreshActionBindings(panel);
    focus("window");
    await expect(dispatch("notes.first")).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch("notes.second")).resolves.toMatchObject({ status: "executed" });
    expect(panel.calls).toEqual(["first v2", "second v2"]);
    expect(actionNames(panel)).toEqual(["first", "second"]);
  });

  it("knows which objects declare actions", () => {
    expect(hasActions(new AppController())).toBe(true);
    expect(hasActions(new Recorder())).toBe(false);
    expect(actionNames(new ViewController())).toEqual(expect.arrayContaining(["shared", "rename", "closeWindow"]));
  });

  it("rejects decorating a static, private or symbol-named method", () => {
    expect(() => {
      class Static { @action static run() { return undefined; } }
      return Static;
    }).toThrow(/static/);
    expect(() => {
      class Private { @action #run() { return undefined; } run() { return this.#run(); } }
      return Private;
    }).toThrow(/private/);
    expect(() => {
      const key = Symbol("run");
      class Symbolic { @action [key]() { return undefined; } }
      return Symbolic;
    }).toThrow(/symbol/);
  });
});

describe("actions in menus and controls", () => {
  function PortProbe({ onPort }: { readonly onPort: (port: NSEMenuRuntimePort) => void }) {
    onPort(useNSEMenuPort());
    return null;
  }

  it("disables a menu item whose action validates as unavailable", async () => {
    const { context, app, focus } = fixture();
    let port!: NSEMenuRuntimePort;
    render(<SynWareProvider value={context}><PortProbe onPort={(next) => { port = next; }} /></SynWareProvider>);
    const controller = new NSEMenuController({
      model: { id: "file", entries: [{ kind: "command", id: "new", action: "newNote" }, { kind: "command", id: "reload", action: "reload" }] },
      runtime: port,
    });
    focus("view");
    await controller.open();
    expect(controller.snapshot.entries.find((entry) => entry.id === "new")).toMatchObject({ enabled: true });
    expect(controller.snapshot.entries.find((entry) => entry.id === "reload")).toMatchObject({ enabled: false, disabledReason: "Nothing to reload." });

    app.readOnly = true;
    await controller.open();
    expect(controller.snapshot.entries.find((entry) => entry.id === "new")).toMatchObject({ enabled: false });
    controller.dispose();
  });

  it("dispatches a menu item's action with its payload", async () => {
    const { context, view, focus } = fixture();
    let port!: NSEMenuRuntimePort;
    render(<SynWareProvider value={context}><PortProbe onPort={(next) => { port = next; }} /></SynWareProvider>);
    const controller = new NSEMenuController({
      model: { id: "edit", entries: [{ kind: "command", id: "rename", action: "rename", payload: { title: "Menu" } }] },
      runtime: port,
    });
    focus("view");
    await controller.open();
    await expect(controller.dispatch("rename")).resolves.toMatchObject({ status: "executed" });
    expect(view.calls).toEqual(["view.rename:Menu"]);
    controller.dispose();
  });

  it("refuses a menu action when the menu has no application", () => {
    const port: NSEMenuRuntimePort = {
      signal: new AbortController().signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
        validateMany: () => Promise.resolve(new Map()),
        prepareDispatch: () => Promise.resolve({ status: "cancelled", reason: "none" }),
        dispatch: () => Promise.resolve({ status: "unhandled", commandId: "x" }),
      },
      scheduler: { setTimeout: () => 0, clearTimeout: () => undefined },
    };
    expect(() => new NSEMenuController({ model: { id: "x", entries: [{ kind: "command", id: "a", action: "run" }] }, runtime: port })).toThrow(/no application/);
  });

  function controlPort(context: SynWareContextValue) {
    return {
      signal: context.signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
        validate: context.commands.validate.bind(context.commands),
        prepareDispatch: context.commands.prepareDispatch.bind(context.commands),
        dispatch: context.commands.dispatch.bind(context.commands),
      },
    };
  }

  it("disables a push button whose action is unavailable and runs one that is available", async () => {
    const { context, app, view, focus } = fixture();
    focus("view");
    render(
      <NSEControlRuntimeProvider port={controlPort(context)}>
        <NSEActionScopeProvider appId={appId}>
          <NSEPushButton action="newNote">New note</NSEPushButton>
          <NSEPushButton action="reload">Reload</NSEPushButton>
          <NSEPushButton action="rename" actionPayload={{ title: "Button" }}>Rename</NSEPushButton>
        </NSEActionScopeProvider>
      </NSEControlRuntimeProvider>,
    );
    await waitFor(() => expect((screen.getByRole("button", { name: "New note" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole("button", { name: "Reload" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "New note" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rename" })); });
    await waitFor(() => expect([...app.calls, ...view.calls]).toEqual(["app.newNote", "view.rename:Button"]));
  });

  it("scopes a bare action name to the application and takes a standard id as written", async () => {
    const { context, window, focus } = fixture();
    focus("window");
    render(
      <NSEControlRuntimeProvider port={controlPort(context)}>
        <NSEActionScopeProvider appId={appId}>
          <NSEPushButton action="document.save">Save</NSEPushButton>
        </NSEActionScopeProvider>
      </NSEControlRuntimeProvider>,
    );
    await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await waitFor(() => expect(window.calls).toEqual(["window.save"]));
  });

  it("refuses a bare action name outside an application", () => {
    const { context } = fixture();
    expect(() => render(
      <NSEControlRuntimeProvider port={controlPort(context)}>
        <NSEPushButton action="newNote">New note</NSEPushButton>
      </NSEControlRuntimeProvider>,
    )).toThrow(/action/i);
  });
});
