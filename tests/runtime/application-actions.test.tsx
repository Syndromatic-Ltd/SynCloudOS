// @vitest-environment jsdom
import React from "react";
import { nseMenuModel } from "../../src/NSE/Menus/menuTypes";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEObject, observable } from "../../src/NSE/Objects";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { ActionScopeProvider, ControlRuntimeProvider } from "../../src/NSE/Controls/Core";
import { NSESegmentedControl } from "../../src/NSE/Controls/Values/NSESegmentedControl";
import { NSEPopUpButton } from "../../src/NSE/Menus/NSEPopUpButton";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { NSEMenu } from "../../src/NSE/Menus/NSEMenu";
import type { NSEMenuRuntimePort } from "../../src/NSE/Menus/menuTypes";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { useNSEMenuPort } from "../../src/SynCloudOS/AppSDK/SynWareNSEMenuPort";
import { action, actionNames, bindActionResponder, hasActions, refreshActionBindings, useAction } from "../../src/SynCloudOS/AppSDK/actions";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import type { SynWareContextValue } from "../../src/SynCloudOS/AppSDK/appContextTypes";
import type { MountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import type { CommandDispatchResult } from "../../src/SynCloudOS/Commands/commandTypes";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const appId = "com.example.notes";

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
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "Notes" });
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
  it("rejects malformed validators at binding and fails closed after corruption", async () => {
    const { host, focus, dispatch } = fixture();
    class Broken extends Recorder {
      @action danger() { this.calls.push("danger"); }
      validateDanger: unknown = false;
    }
    const target = new Broken();
    expect(() => bindActionResponder(target, host, responderIds.window)).toThrow(/validateDanger.*method/);
    target.validateDanger = () => true;
    const binding = bindActionResponder(target, host, responderIds.window);
    target.validateDanger = false;
    focus("window");
    await expect(dispatch(`${appId}.danger`)).rejects.toThrow(/validateDanger.*method/);
    expect(target.calls).toEqual([]);
    binding.dispose();
  });

  it("clears all registrations when a hot refresh cannot register the complete action set", () => {
    const { runtime, host } = fixture();
    class Before extends Recorder { @action before() {} }
    class After extends Recorder { @action fresh() {} @action collision() {} }
    const target = new Before();
    const register = host.commands.register.bind(host.commands);
    const failingHost = { appId, commands: { register(declaration: object) {
      if (Reflect.get(declaration, "id") === `${appId}.collision`) throw new Error("registration collision");
      return register(declaration);
    } } };
    const binding = bindActionResponder(target, failingHost, responderIds.window);
    Object.setPrototypeOf(target, After.prototype);
    expect(() => binding.refresh()).toThrow("registration collision");
    expect(runtime.commands.getDeclarations().filter(item => [`${appId}.before`, `${appId}.fresh`, `${appId}.collision`].includes(item.id))).toEqual([]);
    binding.dispose();
  });

  it("accepts default and rest payload parameters while retaining parameterless payload rejection", async () => {
    const { host, focus, dispatch } = fixture();
    class Parameters extends Recorder {
      @action renameDefault(payload = { title: "Untitled" }) { this.calls.push(payload.title); }
      @action rest(...payload: number[]) { this.calls.push(String(payload[0])); }
      @action empty(/* no payload */) { this.calls.push("empty"); }
    }
    const target = new Parameters();
    const binding = bindActionResponder(target, host, responderIds.window);
    focus("window");
    await expect(dispatch(`${appId}.renameDefault`, { title: "Chosen" })).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch(`${appId}.renameDefault`)).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch(`${appId}.rest`, 7)).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch(`${appId}.empty`, 7)).resolves.toMatchObject({ status: "invalid-payload" });
    expect(target.calls).toEqual(["Chosen", "Untitled", "7"]);
    binding.dispose();
  });

  it("resolves an action from the focused view, then its window, then the application", async () => {
    const { app, window, view, focus, dispatch } = fixture();

    focus("view");
    await expect(dispatch("com.example.notes.shared")).resolves.toMatchObject({ status: "executed" });
    focus("window");
    await expect(dispatch("com.example.notes.shared")).resolves.toMatchObject({ status: "executed" });
    focus("app");
    await expect(dispatch("com.example.notes.shared")).resolves.toMatchObject({ status: "executed" });

    expect(view.calls).toEqual(["view.shared"]);
    expect(window.calls).toEqual(["window.shared"]);
    expect(app.calls).toEqual(["app.shared"]);
  });

  it("reaches an action declared higher in the chain from a focused view", async () => {
    const { app, focus, dispatch } = fixture();
    focus("view");
    await expect(dispatch("com.example.notes.newNote")).resolves.toMatchObject({ status: "executed" });
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
    await expect(dispatch("com.example.notes.rename", { title: "Receipts" })).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch("com.example.notes.slow", 4)).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch("com.example.notes.reload", { unexpected: true })).resolves.toMatchObject({ status: "invalid-payload" });
    expect(view.calls).toEqual(["view.rename:Receipts", "view.slow:4"]);
    focus("app");
    await expect(dispatch("com.example.notes.newNote", { unexpected: true })).resolves.toMatchObject({ status: "invalid-payload" });
    expect(app.calls).toEqual([]);
  });

  it("refuses to run an action whose validation says it is unavailable", async () => {
    const { app, view, focus, dispatch } = fixture();
    focus("view");
    await expect(dispatch("com.example.notes.reload")).resolves.toMatchObject({ status: "disabled", reason: "Nothing to reload." });
    expect(view.calls).toEqual([]);

    app.readOnly = true;
    await expect(dispatch("com.example.notes.newNote")).resolves.toMatchObject({ status: "disabled" });
    app.readOnly = false;
    await expect(dispatch("com.example.notes.newNote")).resolves.toMatchObject({ status: "executed" });
    expect(app.calls).toEqual(["app.newNote"]);
  });

  it("rolls back every registration when one cannot be made, and on dispose", async () => {
    const { runtime, context, host, focus, dispatch } = fixture();
    class Clash extends Recorder {
      @action shared() { this.calls.push("clash.shared"); }
      @action("com.example.notes.shared") other() { this.calls.push("clash.other"); }
    }
    expect(() => bindActionResponder(new Clash(), host, responderIds.app)).toThrow(/both answer com\.example\.notes\.shared/);

    class Extra extends Recorder { @action extra() { this.calls.push("extra"); } }
    const extra = new Extra();
    const binding = bindActionResponder(extra, host, responderIds.window);
    focus("window");
    await expect(dispatch("com.example.notes.extra")).resolves.toMatchObject({ status: "executed" });
    binding.dispose();
    binding.dispose();
    expect(runtime.commands.getDeclarations().some((declaration) => declaration.id === "com.example.notes.extra")).toBe(false);
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
    await expect(dispatch("com.example.notes.first")).resolves.toMatchObject({ status: "executed" });
    await expect(dispatch("com.example.notes.second")).resolves.toMatchObject({ status: "executed" });
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

  it("registers menu categories and keyboard shortcuts with ordinary command safety", async () => {
    const { runtime, host, focus } = fixture();
    class Shortcuts extends Recorder {
      @action({ menuCategory: "file", keyBindings: [{ key: "j", modifiers: [], scope: "focused" }] })
      jump() { this.calls.push("jump"); }
      @action({ keyBindings: [{ key: "l", modifiers: ["primary"], scope: "focused" }] })
      location() { this.calls.push("location"); }
      @action({ keyBindings: [{ key: "t", modifiers: ["primary"], scope: "focused" }], allowReservedBrowserShortcut: true })
      tab() { this.calls.push("tab"); }
    }
    const target = new Shortcuts();
    const binding = bindActionResponder(target, host, responderIds.window);
    focus("view");
    const event = (key: string, primary = false) => ({
      key, altKey: false, shiftKey: false, repeat: false, isComposing: false,
      ctrlKey: primary && runtime.environment.platform !== "mac",
      metaKey: primary && runtime.environment.platform === "mac",
      getModifierState: () => false,
    });
    expect(runtime.commands.getDeclarations().find((declaration) => declaration.id === `${appId}.jump`)?.menuCategory).toBe("file");
    expect((await runtime.keyBindings.handleKeyboardEvent(event("j"), {})).handled).toBe(true);
    expect(runtime.keyBindings.resolve(event("l", true), {})).toBeNull();
    expect((await runtime.keyBindings.handleKeyboardEvent(event("t", true), {})).handled).toBe(true);
    expect(runtime.keyBindings.resolve({ ...event("t", true), isComposing: true }, {})).toBeNull();
    expect(target.calls).toEqual(["jump", "tab"]);
    binding.dispose();
    expect(runtime.keyBindings.resolve(event("j"), {})).toBeNull();
  });

  it("presents payload-dependent localised action titles and preserves validator title overrides", async () => {
    const { runtime, context, host, focus } = fixture();
    const namespace = "action-title-boundary";
    runtime.locale.registerTranslations(namespace, "en-GB", { publish: "Publish {name}", blocked: "Cannot publish {name}" });
    runtime.locale.registerTranslations(namespace, "fr-FR", { publish: "Publier {name}", blocked: "Publication interdite : {name}" });
    runtime.locale.setLocale("en-GB");
    class Publisher extends Recorder {
      @action<{ readonly name: string }>({
        title: ({ payload, runtime: app }) => ({
          key: "publish",
          fallback: app.locale.t("publish", { name: payload.name }, namespace),
        }),
      })
      publishSelection(payload: { readonly name: string }) { this.calls.push(payload.name); }
      validatePublishSelection(payload: { readonly name: string }) {
        return payload.name === "locked"
          ? { enabled: false, title: { key: "blocked", fallback: context.locale.t("blocked", { name: payload.name }, namespace) } }
          : { enabled: true };
      }
    }
    const publisher = new Publisher();
    const binding = bindActionResponder(publisher, host, responderIds.window);
    focus("view");
    await expect(context.commands.validate(`${appId}.publishSelection`, { name: "First" })).resolves.toMatchObject({ enabled: true, title: "Publish First" });
    await expect(context.commands.validate(`${appId}.publishSelection`, { name: "Second" })).resolves.toMatchObject({ enabled: true, title: "Publish Second" });
    runtime.locale.setLocale("fr-FR");
    await expect(context.commands.validate(`${appId}.publishSelection`, { name: "Deuxième" })).resolves.toMatchObject({ enabled: true, title: "Publier Deuxième" });
    await expect(context.commands.validate(`${appId}.publishSelection`, { name: "locked" })).resolves.toMatchObject({ enabled: false, title: "Publication interdite : locked" });
    binding.dispose();
  });

  it("accepts a plain string title from a validator, as NSMenuItem.title is set", async () => {
    const { context, host, focus } = fixture();
    class History extends Recorder {
      undoTitle = "Undo Change Coil Current";
      @action undoChange() { this.calls.push("undo"); }
      validateUndoChange() { return { enabled: true, title: this.undoTitle }; }
    }
    const history = new History();
    const binding = bindActionResponder(history, host, responderIds.window);
    focus("view");
    await expect(context.commands.validate(`${appId}.undoChange`)).resolves.toMatchObject({ enabled: true, title: "Undo Change Coil Current" });
    history.undoTitle = "Undo Move Probe";
    await expect(context.commands.validate(`${appId}.undoChange`)).resolves.toMatchObject({ title: "Undo Move Probe" });
    binding.dispose();
  });
});

describe("actions in menus and controls", () => {
  function PortProbe({ onPort }: { readonly onPort: (port: NSEMenuRuntimePort) => void }) {
    onPort(useNSEMenuPort());
    return null;
  }

  it("refuses a currently hidden action through a custom sender", async () => {
    const { context, host, focus } = fixture();
    class Hidden extends Recorder {
      @action hiddenAction() { this.calls.push("hidden"); }
      validateHiddenAction() { return { enabled: true, hidden: true }; }
    }
    const target = new Hidden();
    const binding = bindActionResponder(target, host, responderIds.window);
    focus("view");
    const hook = renderHook(() => useAction("hiddenAction"), { wrapper: ({ children }) => <ControlsHost context={context}>{children}</ControlsHost> });
    await act(async () => {});
    expect(hook.result.current.enabled).toBe(false);
    await act(async () => { await hook.result.current.perform(); });
    expect(target.calls).toEqual([]);
    binding.dispose();
  });

  it("refuses an action that becomes hidden during canonical preparation", async () => {
    const { context, host, focus } = fixture();
    let validations = 0;
    class Hidden extends Recorder {
      @action hiddenAction(value?: string) { this.calls.push(value ?? "hidden"); }
      validateHiddenAction(value?: string) {
        return { enabled: true, hidden: value === "event" && ++validations > 1 };
      }
    }
    const target = new Hidden();
    const binding = bindActionResponder(target, host, responderIds.window);
    focus("view");
    const hook = renderHook(() => useAction("hiddenAction"), { wrapper: ({ children }) => <ControlsHost context={context}>{children}</ControlsHost> });
    await act(async () => {});
    await act(async () => { await expect(hook.result.current.perform("event")).resolves.toBeNull(); });
    expect(target.calls).toEqual([]);
    // Hidden is a presentation policy, not a permission: direct API dispatch
    // remains governed by enabled/denied and its ordinary authority checks.
    await expect(context.commands.dispatch(`${appId}.hiddenAction`, "event")).resolves.toMatchObject({ status: "executed" });
    expect(target.calls).toEqual(["event"]);
    binding.dispose();
  });

  it("disables a menu item whose action validates as unavailable", async () => {
    const { context, app, focus } = fixture();
    let port!: NSEMenuRuntimePort;
    render(<SynWareProvider value={context}><PortProbe onPort={(next) => { port = next; }} /></SynWareProvider>);
    const controller = new NSEMenu({
      [nseMenuModel]: { id: "file", entries: [{ kind: "command", id: "new", action: "newNote" }, { kind: "command", id: "reload", action: "reload" }] },
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
    const controller = new NSEMenu({
      [nseMenuModel]: { id: "edit", entries: [{ kind: "command", id: "rename", action: "rename", payload: { title: "Menu" } }] },
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
    expect(() => new NSEMenu({ [nseMenuModel]: { id: "x", entries: [{ kind: "command", id: "a", action: "run" }] }, runtime: port })).toThrow(/no application/);
  });

  function controlPort(context: SynWareContextValue) {
    return {
      signal: context.signal,
      commands: {
        getPresentationGeneration: context.commands.getPresentationGeneration.bind(context.commands),
        subscribePresentation: context.commands.subscribePresentation.bind(context.commands),
        validate: context.commands.validate.bind(context.commands),
        prepareDispatch: context.commands.prepareDispatch.bind(context.commands),
        dispatch: context.commands.dispatch.bind(context.commands),
      },
    };
  }

  function ControlsHost({ context, children }: React.PropsWithChildren<{ readonly context: SynWareContextValue }>) {
    return <SynWareProvider value={context}>
      <StandaloneControlHost document={document} window={window} presentation={createStaticPresentationPort({ width: 1024, height: 768 })} parentResponderId={responderIds.view}>
        <ControlRuntimeProvider port={controlPort(context)}>
          <ActionScopeProvider appId={appId}>{children}</ActionScopeProvider>
        </ControlRuntimeProvider>
      </StandaloneControlHost>
    </SynWareProvider>;
  }

  it("keeps useAction availability and state in step with validate methods and dispatches through the focused chain", async () => {
    const { context, host, focus } = fixture();
    class Toggle extends Recorder {
      @observable accessor available = true;
      @observable accessor selected = false;
      @action toggle(payload: { readonly source: string }) { this.calls.push(payload.source); this.selected = !this.selected; }
      validateToggle() { return { enabled: this.available, state: this.selected ? "on" as const : "off" as const }; }
    }
    const target = new Toggle();
    const binding = bindActionResponder(target, host, responderIds.window);
    focus("view");
    function Probe() {
      const { perform, enabled, state } = useAction("toggle", { source: "Hook" });
      return <button disabled={!enabled} data-state={state} onClick={() => { void perform(); }}>Toggle action</button>;
    }
    render(<SynWareProvider value={context}><Probe /></SynWareProvider>);
    const button = screen.getByRole("button", { name: "Toggle action" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    await act(async () => { fireEvent.click(button); });
    await waitFor(() => expect(button.getAttribute("data-state")).toBe("on"));
    expect(target.calls).toEqual(["Hook"]);
    act(() => { target.available = false; });
    await waitFor(() => expect(button.disabled).toBe(true));
    act(() => { target.available = true; });
    await waitFor(() => expect(button.disabled).toBe(false));
    binding.dispose();
  });

  it("prepares an event payload even when the unbound typed action is disabled", async () => {
    const { context, host, focus } = fixture();
    const parse = vi.fn((value: unknown) => typeof value === "string"
      ? { ok: true as const, value: value.trim() }
      : { ok: false as const, issues: ["Expected a string."] });
    const validated = vi.fn((value: string) => value === "allowed");
    class Choices extends Recorder {
      @action({ payload: { description: "A choice", parse } })
      choose(value: string) { this.calls.push(value); }
      validateChoose(value: string) { return validated(value); }
    }
    const choices = new Choices();
    bindActionResponder(choices, host, responderIds.window);
    focus("view");
    const { result } = renderHook(() => useAction("choose"), {
      wrapper: ({ children }) => <SynWareProvider value={context}>{children}</SynWareProvider>,
    });
    await waitFor(() => expect(parse).toHaveBeenCalledWith(undefined));
    expect(result.current.enabled).toBe(false);
    await act(async () => {
      await expect(result.current.perform()).resolves.toBeNull();
      await expect(result.current.perform(" allowed ")).resolves.toMatchObject({ status: "executed" });
    });
    expect(validated).toHaveBeenCalledWith("allowed");
    expect(choices.calls).toEqual(["allowed"]);
    expect(result.current.enabled).toBe(false);
  });

  it("rejects invalid event payloads instead of reusing an enabled bound presentation", async () => {
    const { context, host, focus } = fixture();
    const validated = vi.fn((value: string) => value === "allowed");
    class Choices extends Recorder {
      @action({ payload: {
        description: "A choice",
        parse: (value: unknown) => typeof value === "string"
          ? { ok: true as const, value }
          : { ok: false as const, issues: ["Expected a string."] },
      } })
      choose(value: string) { this.calls.push(value); }
      validateChoose(value: string) { return validated(value); }
    }
    const choices = new Choices();
    bindActionResponder(choices, host, responderIds.window);
    focus("view");
    const { result } = renderHook(() => useAction("choose", "allowed"), {
      wrapper: ({ children }) => <SynWareProvider value={context}>{children}</SynWareProvider>,
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    await act(async () => {
      await expect(result.current.perform(42)).resolves.toBeNull();
      await expect(result.current.perform("blocked")).resolves.toBeNull();
      await expect(result.current.perform(undefined)).resolves.toBeNull();
    });
    expect(validated).toHaveBeenCalledWith("blocked");
    expect(choices.calls).toEqual([]);
    expect(result.current.enabled).toBe(true);
    await act(async () => {
      await expect(result.current.perform()).resolves.toMatchObject({ status: "executed" });
    });
    expect(choices.calls).toEqual(["allowed"]);
  });

  it("distinguishes the default bound payload from an explicit undefined override", async () => {
    const { context, host, focus } = fixture();
    class Choices extends Recorder {
      @action choose(value?: string) { this.calls.push(value ?? "undefined"); }
      validateChoose(value?: string) { return { enabled: true, state: value === "bound" ? "on" as const : "off" as const }; }
    }
    const choices = new Choices();
    bindActionResponder(choices, host, responderIds.window);
    focus("view");
    const { result } = renderHook(() => useAction("choose", "bound"), {
      wrapper: ({ children }) => <SynWareProvider value={context}>{children}</SynWareProvider>,
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.state).toBe("on");
    await act(async () => {
      await expect(result.current.perform()).resolves.toMatchObject({ status: "executed" });
    });
    await act(async () => {
      await expect(result.current.perform(undefined)).resolves.toMatchObject({ status: "executed" });
    });
    expect(choices.calls).toEqual(["bound", "undefined"]);
    expect(result.current.state).toBe("on");
  });

  it("executes an asynchronously validated event payload without binding its presentation", async () => {
    const { context, host, focus } = fixture();
    class Choices extends Recorder {
      @action choose(value?: string) { this.calls.push(value ?? "undefined"); }
      validateChoose(value?: string) { return Promise.resolve(value === "event"); }
    }
    const choices = new Choices();
    bindActionResponder(choices, host, responderIds.window);
    focus("view");
    const { result } = renderHook(() => useAction("choose"), {
      wrapper: ({ children }) => <SynWareProvider value={context}>{children}</SynWareProvider>,
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      await expect(result.current.perform("event")).resolves.toMatchObject({ status: "executed" });
    });
    expect(choices.calls).toEqual(["event"]);
    expect(result.current.enabled).toBe(false);
  });

  it("validates an event override against the currently focused responder, not the bound presentation's responder", async () => {
    const { context, host, focus } = fixture();
    class AppChoices extends Recorder {
      @action choose(value: string) { this.calls.push(value); }
      validateChoose() { return false; }
    }
    class WindowChoices extends Recorder {
      @action choose(value: string) { this.calls.push(value); }
    }
    const appChoices = new AppChoices();
    const windowChoices = new WindowChoices();
    bindActionResponder(appChoices, host, responderIds.app);
    bindActionResponder(windowChoices, host, responderIds.window);
    focus("view");
    const { result } = renderHook(() => useAction("choose", "bound"), {
      wrapper: ({ children }) => <SynWareProvider value={context}>{children}</SynWareProvider>,
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    await act(async () => {
      focus("app");
      await expect(result.current.perform("event")).resolves.toBeNull();
    });
    expect(appChoices.calls).toEqual([]);
    expect(windowChoices.calls).toEqual([]);
  });

  it.each(["focus", "registry", "binding", "unmount", "application-dispose"] as const)(
    "rejects event preparation when %s changes its authority while validation is pending",
    async (change) => {
      const { context, host, focus } = fixture();
      let settle!: (enabled: boolean) => void;
      const validation = new Promise<boolean>((resolve) => { settle = resolve; });
      const started = vi.fn();
      class Pending extends Recorder {
        @action pending(value?: string) { this.calls.push(value ?? "undefined"); }
        validatePending(value?: string) {
          if (value === undefined) return false;
          started(value);
          return validation;
        }
      }
      const target = new Pending();
      bindActionResponder(target, host, responderIds.window);
      focus("view");
      const { result, rerender, unmount } = renderHook(({ name }) => useAction(name), {
        initialProps: { name: "pending" },
        wrapper: ({ children }) => <SynWareProvider value={context}>{children}</SynWareProvider>,
      });
      await act(async () => { await Promise.resolve(); });
      let dispatched!: Promise<CommandDispatchResult<unknown> | null>;
      await act(async () => { dispatched = result.current.perform("event"); });
      expect(started).toHaveBeenCalledWith("event");
      act(() => {
        if (change === "focus") focus("app");
        else if (change === "registry") {
          class Extra extends Recorder { @action extra() { this.calls.push("extra"); } }
          bindActionResponder(new Extra(), host, responderIds.window);
        } else if (change === "binding") rerender({ name: "newNote" });
        else if (change === "unmount") unmount();
        else mounts[mounts.length - 1].dispose();
      });
      await act(async () => {
        settle(true);
        await expect(dispatched).resolves.toBeNull();
      });
      expect(target.calls).toEqual([]);
    },
  );

  it("publishes focus-only changes as command presentation authority changes", async () => {
    const { context, focus } = fixture();
    focus("app");
    await Promise.resolve();
    const before = context.commands.getPresentationGeneration();
    const changed = vi.fn();
    const unsubscribe = context.commands.subscribePresentation(changed);

    focus("view");
    const after = context.commands.getPresentationGeneration();
    expect(after.registryGeneration).toBe(before.registryGeneration);
    expect(after.responderGeneration).toBeGreaterThan(before.responderGeneration);
    await waitFor(() => expect(changed).toHaveBeenCalled());

    unsubscribe();
    changed.mockClear();
    focus("app");
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalled();
  });

  it("revalidates useAction when only responder focus changes", async () => {
    const { context, host, focus } = fixture();
    class AppActions extends Recorder {
      @action focusOnly() { this.calls.push("app"); }
      validateFocusOnly() { return { enabled: false, state: "off" as const }; }
    }
    class WindowActions extends Recorder {
      @action focusOnly() { this.calls.push("window"); }
      validateFocusOnly() { return { enabled: true, state: "on" as const }; }
    }
    const appActions = new AppActions();
    const windowActions = new WindowActions();
    const appBinding = bindActionResponder(appActions, host, responderIds.app);
    const windowBinding = bindActionResponder(windowActions, host, responderIds.window);
    focus("app");
    function Probe() {
      const { perform, enabled, state } = useAction("focusOnly");
      return <button disabled={!enabled} data-state={state} onClick={() => { void perform(); }}>Focused action</button>;
    }
    render(<SynWareProvider value={context}><Probe /></SynWareProvider>);
    const button = screen.getByRole("button", { name: "Focused action" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    act(() => { focus("view"); });
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(button.getAttribute("data-state")).toBe("on");
    await act(async () => { fireEvent.click(button); });
    expect(windowActions.calls).toEqual(["window"]);
    expect(appActions.calls).toEqual([]);
    act(() => { focus("app"); });
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(button.getAttribute("data-state")).toBe("off");
    appBinding.dispose();
    windowBinding.dispose();
  });

  it("sends segmented-control actions and payloads to the focused responder", async () => {
    const { context, view, focus } = fixture();
    focus("view");
    const onSelectionChange = vi.fn();
    render(<ControlsHost context={context}>
      <NSESegmentedControl aria-label="Commands" action="rename" actionPayload={{ title: "Segment" }} items={[{ id: "rename", label: "Rename segment" }, { id: "reload", label: "Reload segment", action: "reload" }]} selection={{ mode: "momentary", selectedIds: new Set() }} onSelectionChange={onSelectionChange} />
    </ControlsHost>);
    const button = screen.getByRole("button", { name: "Rename segment" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    expect((screen.getByRole("button", { name: "Reload segment" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(button); });
    await waitFor(() => expect(view.calls).toEqual(["view.rename:Segment"]));
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ selectedIds: new Set(["rename"]) }));
  });

  it("dispatches an overflow segment through the same action route as a visible segment", async () => {
    const { context, view, focus } = fixture();
    const onSelectionChange = vi.fn();
    focus("view");
    render(<ControlsHost context={context}>
      <NSESegmentedControl aria-label="Overflow commands" maximumVisibleSegments={1} items={[{ id: "first", label: "First" }, { id: "rename", label: "Overflow rename", action: "rename", actionPayload: { title: "Overflow" } }]} selection={{ mode: "momentary", selectedIds: new Set() }} onSelectionChange={onSelectionChange} />
    </ControlsHost>);
    fireEvent.click(screen.getByRole("button", { name: "More Overflow commands" }));
    const option = await screen.findByRole("option", { name: "Overflow rename" }) as HTMLButtonElement;
    await waitFor(() => expect(option.disabled).toBe(false));
    await act(async () => { fireEvent.click(option); });
    await waitFor(() => expect(view.calls).toEqual(["view.rename:Overflow"]));
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ selectedIds: new Set(["rename"]) }));
  });

  it("validates picker actions and dispatches on selection rather than opening the list", async () => {
    const { context, app, focus } = fixture();
    focus("view");
    const onValueChange = vi.fn();
    render(<ControlsHost context={context}>
      <NSEPopUpButton label="Create" action="newNote" actionPayload={undefined} items={[{ value: "a", title: "Alpha" }, { value: "b", title: "Beta" }]} onValueChange={onValueChange} />
    </ControlsHost>);
    const trigger = screen.getByRole("button", { name: /Create Alpha/ }) as HTMLButtonElement;
    await waitFor(() => expect(trigger.disabled).toBe(false));
    act(() => { app.readOnly = true; });
    await waitFor(() => expect(trigger.disabled).toBe(true));
    act(() => { app.readOnly = false; });
    await waitFor(() => expect(trigger.disabled).toBe(false));
    fireEvent.click(trigger);
    expect(app.calls).toEqual([]);
    const option = await screen.findByRole("option", { name: "Beta" });
    await act(async () => { fireEvent.click(option); });
    await waitFor(() => expect(app.calls).toEqual(["app.newNote"]));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("runs a pop-up button's command item after a rule without changing its value", async () => {
    const { context, host, focus } = fixture();
    class Fonts extends Recorder {
      @action orderFrontFontPanel() { this.calls.push("fonts"); }
    }
    const fonts = new Fonts();
    const binding = bindActionResponder(fonts, host, responderIds.window);
    focus("view");
    const onValueChange = vi.fn();
    render(<ControlsHost context={context}>
      <NSEPopUpButton label="Font" value="serif" onValueChange={onValueChange} items={[{ value: "serif", title: "Serif" }, { value: "sans", title: "Sans" }, { isSeparatorItem: true }, { title: "Show Fonts…", action: "orderFrontFontPanel" }]} />
    </ControlsHost>);
    fireEvent.click(screen.getByRole("button", { name: "Font Serif" }));
    const item = await screen.findByRole("option", { name: "Show Fonts…" });
    expect(item.getAttribute("data-kind")).toBe("action");
    expect(item.getAttribute("aria-selected")).toBe("false");
    expect(item.previousElementSibling?.getAttribute("role")).toBe("separator");
    await waitFor(() => expect(item.getAttribute("aria-disabled")).not.toBe("true"));
    await act(async () => { fireEvent.click(item); });
    await waitFor(() => expect(fonts.calls).toEqual(["fonts"]));
    expect(onValueChange).not.toHaveBeenCalled();
    binding.dispose();
  });

  it("disables a push button whose action is unavailable and runs one that is available", async () => {
    const { context, app, view, focus } = fixture();
    focus("view");
    render(
      <ControlRuntimeProvider port={controlPort(context)}>
        <ActionScopeProvider appId={appId}>
          <NSEButton title="New note" action="newNote" />
          <NSEButton title="Reload" action="reload" />
          <NSEButton title="Rename" action="rename" actionPayload={{ title: "Button" }} />
        </ActionScopeProvider>
      </ControlRuntimeProvider>,
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
      <ControlRuntimeProvider port={controlPort(context)}>
        <ActionScopeProvider appId={appId}>
          <NSEButton title="Save" action="document.save" />
        </ActionScopeProvider>
      </ControlRuntimeProvider>,
    );
    await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    await waitFor(() => expect(window.calls).toEqual(["window.save"]));
  });

  it("refuses a bare action name outside an application", () => {
    const { context } = fixture();
    expect(() => render(
      <ControlRuntimeProvider port={controlPort(context)}>
        <NSEButton title="New note" action="newNote" />
      </ControlRuntimeProvider>,
    )).toThrow(/action/i);
  });
  it("validates and sends each segmented candidate's id when no payload override is supplied", async () => {
    const { context, host, focus } = fixture();
    class Choices extends Recorder {
      @action choose(value: string) { this.calls.push(value); }
      validateChoose(value: string) { return value !== "blocked"; }
    }
    const choices = new Choices();
    const binding = bindActionResponder(choices, host, responderIds.window);
    focus("view");
    render(<ControlsHost context={context}>
      <NSESegmentedControl aria-label="Choices" action="choose" items={[{ id: "blocked", label: "Blocked segment" }, { id: "allowed", label: "Allowed segment" }]} selection={{ mode: "momentary", selectedIds: new Set() }} />
    </ControlsHost>);
    const allowed = screen.getByRole("button", { name: "Allowed segment" }) as HTMLButtonElement;
    await waitFor(() => expect(allowed.disabled).toBe(false));
    expect((screen.getByRole("button", { name: "Blocked segment" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(allowed); });
    await waitFor(() => expect(choices.calls).toEqual(["allowed"]));
    binding.dispose();
  });

  it("validates each picker candidate and sends its value even when the current option is disabled", async () => {
    const { context, host, focus } = fixture();
    class Choices extends Recorder {
      @action choose(value: string) { this.calls.push(value); }
      validateChoose(value: string) { return value !== "blocked"; }
    }
    const choices = new Choices();
    const binding = bindActionResponder(choices, host, responderIds.window);
    focus("view");
    render(<ControlsHost context={context}>
      <NSEPopUpButton label="Candidate" action="choose" defaultValue="blocked" items={[{ value: "blocked", title: "Blocked option" }, { value: "allowed", title: "Allowed option" }]} />
    </ControlsHost>);
    const trigger = screen.getByRole("button", { name: /Candidate Blocked option/ }) as HTMLButtonElement;
    await waitFor(() => expect(trigger.disabled).toBe(false));
    fireEvent.click(trigger);
    const blocked = await screen.findByRole("option", { name: "Blocked option" });
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    await act(async () => { fireEvent.click(screen.getByRole("option", { name: "Allowed option" })); });
    await waitFor(() => expect(choices.calls).toEqual(["allowed"]));
    binding.dispose();
  });
});
