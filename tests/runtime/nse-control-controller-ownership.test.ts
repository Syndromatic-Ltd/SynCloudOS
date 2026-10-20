// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEPreferencesController, nseUnowned, type NSEControllerOwnershipOptions } from "../../src/NSE/Controllers";
import { enterClassApplication, instantiateInOwnerScope, NSEOwnershipScope } from "../../src/NSE/Controllers/ownership";
import { NSEMenuController } from "../../src/NSE/Menus/NSEMenuController";
import { NSESearchFieldController } from "../../src/NSE/Controls/Fields/NSESearchFieldController";
import { NSEPageController } from "../../src/NSE/Page/NSEPageController";
import { NSEColourPanelController } from "../../src/NSE/Colour/ColourPanel/NSEColourPanelController";
import { NSEApplicationNavigationChromeController } from "../../src/NSE/Navigation/NSEApplicationNavigationChrome";
import { NSEScrollViewController } from "../../src/NSE/Scroll/scrollTypes";
import { NSEToolbarController } from "../../src/NSE/Toolbars/NSEToolbarController";
import type { NSEToolbarPreferences } from "../../src/NSE/Toolbars/toolbarTypes";
import { createInMemoryNSETextOwner } from "../../src/NSE/Text";
import { TextEditingSession } from "../../src/NSE/TextEditing/TextEditingSession";
import { createTestRuntime } from "./helpers";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

const disposals: Array<() => unknown> = [];
const runtimes: SynCloudOSRuntime[] = [];
afterEach(async () => {
  for (const dispose of disposals.splice(0).reverse()) dispose();
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
});

function runtime() {
  const result = createTestRuntime();
  runtimes.push(result);
  return result;
}

function commandPort(host: SynCloudOSRuntime) {
  return {
    getPresentationGeneration: () => ({ registryGeneration: host.commands.inspect().generation, responderGeneration: host.responders.generation }),
    validateMany: host.commands.validateMany.bind(host.commands),
    prepareDispatch: host.commands.prepareDispatch.bind(host.commands),
    dispatch: host.commands.dispatch.bind(host.commands),
  };
}
function preferences() {
  const result = new NSEPreferencesController<NSEToolbarPreferences>({
    owner: nseUnowned, namespace: "ownership.toolbar", schema: {
      version: 1, defaults: { itemIds: [], displayMode: "icon-only", sizeMode: "regular" }, migrations: [],
      fields: {
        itemIds: { validate: (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((item) => typeof item === "string") },
        displayMode: { validate: (value: unknown): value is NSEToolbarPreferences["displayMode"] => value === "icon-only" || value === "icon-and-label" || value === "label-only" },
        sizeMode: { validate: (value: unknown): value is NSEToolbarPreferences["sizeMode"] => value === "small" || value === "regular" },
      },
    }, adapter: { read: () => null, write: () => undefined, remove: () => undefined },
  });
  disposals.push(() => result.dispose());
  return result;
}
const factories = {
  menu: (options: NSEControllerOwnershipOptions) => {
    const host = runtime();
    return new NSEMenuController({ ...options, model: { id: "owned-menu", entries: [] }, runtime: { signal: new AbortController().signal, commands: commandPort(host) } });
  },
  toolbar: (options: NSEControllerOwnershipOptions) => {
    const host = runtime();
    return new NSEToolbarController({ ...options, configuration: { identifier: "owned-toolbar", owner: { kind: "application", applicationId: "app" }, displayMode: "icon-only", sizeMode: "regular", allowedItemIds: [], defaultItemIds: [] }, items: [], preferences: preferences(), runtime: { signal: new AbortController().signal, commands: commandPort(host) } });
  },
  search: (options: NSEControllerOwnershipOptions) => new NSESearchFieldController(options),
  page: (options: NSEControllerOwnershipOptions) => new NSEPageController(options),
  colour: (options: NSEControllerOwnershipOptions) => new NSEColourPanelController(runtime(), options),
  navigationChrome: (options: NSEControllerOwnershipOptions) => new NSEApplicationNavigationChromeController(options),
  scroll: (options: NSEControllerOwnershipOptions) => new NSEScrollViewController(document.createElement("div"), undefined, options),
  text: (options: NSEControllerOwnershipOptions) => {
    const textOwner = createInMemoryNSETextOwner();
    disposals.push(() => textOwner.dispose());
    return new TextEditingSession({ ...options, id: "owned-text", textOwner });
  },
};

describe.each(Object.entries(factories))("%s controller ownership", (_name, create) => {
  it("adopts an ambient owner and is disposed when that owner is released", () => {
    const scope = new NSEOwnershipScope("application", "ambient");
    const controller = instantiateInOwnerScope(scope, () => create({}));
    expect(controller.isDisposed).toBe(false);
    scope.release("application-closed");
    expect(controller.isDisposed).toBe(true);
    controller.dispose();
  });

  it("accepts owner:this after an await and disconnects with that owner", async () => {
    const owner = new NSEViewController({ owner: nseUnowned });
    disposals.push(() => owner.dispose());
    await Promise.resolve();
    const controller = create({ owner });
    expect(controller.isDisposed).toBe(false);
    owner.dispose();
    expect(controller.isDisposed).toBe(true);
  });

  it("requires an owner in class applications, but honours deliberate standalone ownership", () => {
    const leave = enterClassApplication();
    try {
      expect(() => create({})).toThrowError(expect.objectContaining({ code: "NSE_CONTROLLER_UNOWNED" }));
      const controller = create({ owner: nseUnowned });
      expect(controller.isDisposed).toBe(false);
      controller.dispose();
      expect(controller.isDisposed).toBe(true);
    } finally { leave(); }
  });

  it("refuses an already-aborted owner before acquiring resources", () => {
    const owner = new AbortController();
    owner.abort(new Error("owner already closed"));
    expect(() => create({ ownerSignal: owner.signal })).toThrow("owner already closed");
  });
});

it("stops menu work and toolbar preference observation on owner disposal without disposing shared preferences", async () => {
  const owner = new AbortController();
  const host = runtime();
  const menu = new NSEMenuController({ ownerSignal: owner.signal, model: { id: "menu", entries: [] }, runtime: { signal: new AbortController().signal, commands: commandPort(host) } });
  const toolbar = factories.toolbar({ ownerSignal: owner.signal });
  await menu.open();
  expect(menu.snapshot.open).toBe(true);
  const listener = vi.fn();
  toolbar.subscribe(listener);
  owner.abort();
  expect(menu.snapshot.open).toBe(false);
  await menu.open();
  expect(menu.snapshot.open).toBe(false);
  toolbar.preferences.set("sizeMode", "small");
  expect(listener).not.toHaveBeenCalled();
  expect(toolbar.preferences.isDisposed).toBe(false);
  expect(() => toolbar.setSizeMode("regular")).toThrow();
});

it("revokes search and page mutation and removes colour registrations with their owner", () => {
  const owner = new AbortController();
  const search = new NSESearchFieldController({ ownerSignal: owner.signal });
  const page = new NSEPageController({ ownerSignal: owner.signal });
  const host = runtime();
  const colour = new NSEColourPanelController(host, { ownerSignal: owner.signal });
  colour.registerPicker({ id: "owned-picker", label: "Owned", order: 1, supportedSpaces: ["srgb"], render: () => null });
  expect(host.colourPanel.getSnapshot().pickers.some((picker) => picker.id === "owned-picker")).toBe(true);
  owner.abort();
  expect(() => search.rememberQuery("after close")).toThrow();
  expect(() => page.setProgress(0.5)).toThrow();
  expect(host.colourPanel.getSnapshot().pickers.some((picker) => picker.id === "owned-picker")).toBe(false);
  expect(() => colour.open()).toThrow();
});

it("keeps text content authority alive when its separately owned editing controller is disposed", () => {
  const owner = new NSEViewController({ owner: nseUnowned });
  const textOwner = createInMemoryNSETextOwner();
  disposals.push(() => owner.dispose(), () => textOwner.dispose());
  const controller = new TextEditingSession({ id: "separate-lifetimes", owner, textOwner });
  controller.insertText("Retained content");
  owner.dispose();
  expect(controller.isDisposed).toBe(true);
  expect(textOwner.getSnapshot().text).toBe("Retained content");
  expect(() => controller.insertText("Revoked edit")).toThrow();
});
