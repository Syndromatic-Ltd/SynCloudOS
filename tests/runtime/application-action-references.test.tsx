// @vitest-environment jsdom
import React from "react";
import { nseMenuModel } from "../../src/NSE/Menus/menuTypes";
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { action, bindActionResponder, refreshActionBindings, useAction } from "../../src/SynCloudOS/AppSDK/actions";
import { actionRef } from "../../src/SynCloudOS/AppSDK/actionReference";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { createSynWareMenuRuntime } from "../../src/SynCloudOS/AppSDK/SynWareNSEMenuPort";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSEActionScopeProvider, NSEControlRuntimeProvider } from "../../src/NSE/Controls/Core";
import { NSEMenu } from "../../src/NSE/Menus/NSEMenu";
import { NSEToolbarController } from "../../src/NSE/Toolbars/NSEToolbarController";
import { NSEPreferencesController } from "../../src/NSE/Controllers/NSEPreferencesController";
import type { NSEToolbarPreferences } from "../../src/NSE/Toolbars/toolbarTypes";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const disposers: (() => void | Promise<void>)[] = [];
afterEach(async () => { cleanup(); for (const dispose of disposers.splice(0).reverse()) await dispose(); });

class ItemController {
  constructor(readonly label = "app") {}
  @action<string>({ payload: { description: "Item ID", parse: (value: unknown) => typeof value === "string" ? { ok: true, value } : { ok: false, issues: ["Expected an item ID."] } } })
  chooseItem(id: string) { return `${this.label}:${id}`; }
  validateChooseItem(id: string) { return { enabled: id !== "forbidden", state: "mixed" as const }; }
  @action("document.save") save() { return this.label; }
  ordinary() {}
}

function fixture() {
  const appId = "com.example.action-refs";
  const runtime = createTestRuntime();
  disposers.push(() => runtime.dispose());
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "References" });
  const mounted = mountTestSynWareRuntime(runtime, appId);
  disposers.push(() => mounted.dispose());
  const context = createSynWareContextValue(mounted.runtime);
  const app = `application:${appId}`, window = "window:refs", child = "view:refs";
  runtime.responders.register({ id: window, kind: "window", parentId: app, scopeId: window });
  runtime.responders.register({ id: child, kind: "view", parentId: window, scopeId: window });
  const controllers = [app, window, child].map((id, index) => {
    const controller = new ItemController(["app", "window", "child"][index]);
    const binding = bindActionResponder(controller, { appId, commands: context.commands }, id);
    disposers.push(() => binding.dispose());
    return controller;
  });
  const port = createSynWareMenuRuntime(context);
  const controlPort = { signal: port.signal, commands: {
    ...port.commands, validate: context.commands.validate.bind(context.commands),
    subscribePresentation: context.commands.subscribePresentation.bind(context.commands),
  } };
  const wrapper = ({ children }: { children: React.ReactNode }) => <SynWareProvider value={context}>
    <NSEActionScopeProvider appId={appId}><NSEControlRuntimeProvider port={controlPort}>{children}</NSEControlRuntimeProvider></NSEActionScopeProvider>
  </SynWareProvider>;
  return { appId, runtime, context, port, wrapper, app, window, child, controllers };
}

it("creates frozen declaration metadata without constructing or retaining an instance", () => {
  class NeverConstruct extends ItemController { constructor() { super(); throw new Error("must not construct"); } }
  const reference = actionRef(NeverConstruct, "chooseItem");
  expect(actionRef(NeverConstruct, "chooseItem")).toBe(reference);
  expect(Object.isFrozen(reference)).toBe(true);
  expect(reference.methodName).toBe("chooseItem");
  expect(Object.values(reference).every(value => typeof value !== "function")).toBe(true);
  expect(() => actionRef(ItemController, "ordinary")).toThrow(/@action|decorated/);
  class UndecoratedOverride extends ItemController { override chooseItem(id: string) { return id; } }
  expect(() => actionRef(UndecoratedOverride, "chooseItem")).toThrow(/@action|decorated/);
});

it("uses focused child/window/app responders through typed useAction with real results and validation", async () => {
  const f = fixture();
  const reference = actionRef(ItemController, "chooseItem");
  const { result } = renderHook(() => useAction(reference, "note"), { wrapper: f.wrapper });
  for (const [id, label] of [[f.child, "child"], [f.window, "window"], [f.app, "app"]]) {
    await act(async () => { f.runtime.focus.requestFocus(id); });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.state).toBe("mixed");
    await act(async () => { await expect(result.current.perform()).resolves.toMatchObject({ status: "executed", value: `${label}:note` }); });
  }
  await act(async () => { await expect(result.current.perform("forbidden")).resolves.toBeNull(); });
});

it("prepares control and menu references through canonical command dispatch", async () => {
  const f = fixture();
  const reference = actionRef(ItemController, "chooseItem");
  f.runtime.focus.requestFocus(f.child);
  const view = render(<NSEButton title="Choose" action={reference} actionPayload="control" />, { wrapper: f.wrapper });
  await waitFor(() => expect((view.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(view.getByRole("button")); });
  const menu = new NSEMenu({ standalone: true, [nseMenuModel]: { id: "refs", label: "Refs", entries: [
    { kind: "command", id: "choose", action: reference, payload: "menu" },
  ] }, runtime: f.port });
  disposers.push(() => menu.dispose());
  await menu.open();
  await expect(menu.dispatch("choose")).resolves.toMatchObject({ status: "executed", value: "child:menu" });
});

it("preserves standard IDs and uses refreshed methods without a stale implementation pointer", async () => {
  const f = fixture();
  const standard = actionRef(ItemController, "save");
  const reference = actionRef(ItemController, "chooseItem");
  f.runtime.focus.requestFocus(f.child);
  const { result } = renderHook(() => ({ choose: useAction(reference, "note"), save: useAction(standard) }), { wrapper: f.wrapper });
  await waitFor(() => expect(result.current.save.enabled).toBe(true));
  await act(async () => { await expect(result.current.save.perform()).resolves.toMatchObject({ status: "executed", commandId: "document.save", value: "child" }); });
  class Reloaded extends ItemController { @action override chooseItem(id: string) { return `reloaded:${id}`; } }
  await act(async () => { Object.setPrototypeOf(f.controllers[2], Reloaded.prototype); refreshActionBindings(f.controllers[2]); });
  await waitFor(() => expect(result.current.choose.enabled).toBe(true));
  await act(async () => { await expect(result.current.choose.perform()).resolves.toMatchObject({ status: "executed", value: "reloaded:note" }); });
});

it("projects toolbar action entries into canonical commands for dispatch and overflow", async () => {
  const f = fixture();
  f.runtime.focus.requestFocus(f.child);
  const preferences = new NSEPreferencesController<NSEToolbarPreferences>({
    standalone: true, namespace: "refs-toolbar", adapter: { read: () => null, write: () => {}, remove: () => {} },
    schema: { version: 1, defaults: { itemIds: ["choose"], displayMode: "icon-and-label", sizeMode: "regular" }, fields: {
      itemIds: { validate: (value: unknown): value is readonly string[] => Array.isArray(value) },
      displayMode: { validate: (value: unknown): value is NSEToolbarPreferences["displayMode"] => value === "icon-and-label" },
      sizeMode: { validate: (value: unknown): value is NSEToolbarPreferences["sizeMode"] => value === "regular" },
    }, migrations: [] },
  });
  disposers.push(() => preferences.dispose());
  const toolbar = new NSEToolbarController({ standalone: true,
    configuration: { identifier: "refs", owner: { kind: "application", applicationId: f.appId }, displayMode: "icon-and-label", sizeMode: "regular", allowedItemIds: ["choose"], defaultItemIds: ["choose"] },
    items: [{ kind: "command", id: "choose", action: actionRef(ItemController, "chooseItem"), payload: "toolbar", label: "Choose", paletteLabel: "Choose", icon: null }],
    preferences, runtime: f.port,
  });
  disposers.push(() => toolbar.dispose());
  await toolbar.refresh();
  expect(toolbar.snapshot.items[0]).toMatchObject({ commandId: `${f.appId}.chooseItem`, checked: "mixed", enabled: true });
  await expect(toolbar.dispatch("choose:0")).resolves.toMatchObject({ status: "executed", value: "child:toolbar" });
});

it("keeps runtime schemas and opaque payload admission for typed references and rejects forged metadata", async () => {
  const f = fixture();
  f.runtime.focus.requestFocus(f.child);
  const { result } = renderHook(() => useAction(actionRef(ItemController, "chooseItem"), "note"), { wrapper: f.wrapper });
  await waitFor(() => expect(result.current.enabled).toBe(true));
  for (const payload of [{ raw: true }, document.createElement("div"), new File(["data"], "file.txt"), () => {}]) {
    await act(async () => { await expect(result.current.perform(payload as never)).resolves.toBeNull(); });
  }
  expect(() => renderHook(() => useAction({ methodName: "chooseItem" } as never), { wrapper: f.wrapper })).toThrow(/Invalid action reference/);
});

it("does not acquire another application's responder from a reference", async () => {
  const f = fixture();
  const otherId = "com.example.other-refs";
  registerTestSynWare(f.runtime, { schemaVersion: 1, bundleIdentifier: otherId, version: "1.0.0", displayName: "Other" });
  const mounted = mountTestSynWareRuntime(f.runtime, otherId);
  disposers.push(() => mounted.dispose());
  const called = vi.fn();
  class Other { @action foreignOnly() { called(); return "other"; } }
  const binding = bindActionResponder(new Other(), { appId: otherId, commands: createSynWareContextValue(mounted.runtime).commands }, `application:${otherId}`);
  disposers.push(() => binding.dispose());
  f.runtime.focus.requestFocus(f.child);
  const { result } = renderHook(() => useAction(actionRef(Other, "foreignOnly")), { wrapper: f.wrapper });
  await act(async () => { await expect(result.current.perform()).resolves.toBeNull(); });
  expect(called).not.toHaveBeenCalled();
});

it("invalidates asynchronous validation when focus moves to a different exact target", async () => {
  const f = fixture();
  const reference = actionRef(ItemController, "chooseItem");
  f.runtime.focus.requestFocus(f.child);
  const { result } = renderHook(() => useAction(reference, "note"), { wrapper: f.wrapper });
  await waitFor(() => expect(result.current.enabled).toBe(true));
  let settle!: (value: { enabled: boolean; state: "mixed" }) => void;
  const validation = new Promise<{ enabled: boolean; state: "mixed" }>(resolve => { settle = resolve; });
  const execute = vi.spyOn(f.controllers[2], "chooseItem");
  vi.spyOn(f.controllers[2], "validateChooseItem").mockImplementation(() => validation as never);
  let pending!: ReturnType<typeof result.current.perform>;
  await act(async () => { pending = result.current.perform(); });
  await act(async () => { f.runtime.focus.requestFocus(f.window); settle({ enabled: true, state: "mixed" }); });
  await expect(pending).resolves.toBeNull();
  expect(execute).not.toHaveBeenCalled();
});
