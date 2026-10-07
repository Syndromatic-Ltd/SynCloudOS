/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom
import React, { useMemo, useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEPreferencesController, type PreferencesAdapter } from "../../../src/NSE/Controllers";
import { NSEOverlayProvider, type NSEWindowSurfaceDismissResult, type NSEWindowSurfaceRequest } from "../../../src/NSE/Overlays";
import {
  allocateNSEToolbarItems,
  NSEToolbar,
  NSEToolbarConfigurationSheet,
  NSEToolbarController,
  type NSEToolbarConfiguration,
  type NSEToolbarItem,
  type NSEToolbarPreferences,
  type NSEToolbarRuntimePort,
} from "../../../src/NSE/Toolbars";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(() => {
  document.body.replaceChildren();
});

function commandPresentation(commandId: string, overrides: Partial<{
  readonly enabled: boolean;
  readonly hidden: boolean;
  readonly state: "off" | "on" | "mixed";
  readonly title: string;
  readonly stale: boolean;
}> = {}) {
  return {
    commandId,
    responderId: "editor",
    title: commandId,
    enabled: true,
    denied: false,
    hidden: false,
    state: "off" as const,
    stale: false,
    ...overrides,
  };
}

function runtime(validateMany = vi.fn(), additions: Partial<NSEToolbarRuntimePort> = {}) {
  return {
    signal: new AbortController().signal,
    commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validateMany,
      prepareDispatch: vi.fn(async (commandId: string) => ({ status: "accepted" as const, acceptance: { commandId, responderId: "editor" } as never })),
      dispatch: vi.fn(async (commandId: string) => ({
        status: "executed" as const,
        commandId,
        responderId: "editor",
        operationId: "operation:toolbar",
        correlationId: "correlation:toolbar",
        value: undefined,
      })),
    },
    ...additions,
  } satisfies NSEToolbarRuntimePort;
}

const configuration = {
  identifier: "editor-toolbar",
  owner: { kind: "window", windowControllerId: "window:editor" },
  displayMode: "icon-and-label",
  sizeMode: "regular",
  allowedItemIds: ["save", "custom", "gap", "flex", "divider", "print"],
  defaultItemIds: ["save", "gap", "flex", "divider", "print"],
} as const satisfies NSEToolbarConfiguration;

const items = [
  {
    kind: "command",
    id: "save",
    commandId: "document.save",
    label: "Save",
    paletteLabel: "Save document",
    icon: <span aria-hidden="true">S</span>,
    minimumWidth: 40,
    idealWidth: 54,
  },
  {
    kind: "custom",
    id: "custom",
    label: "Custom inspector",
    minimumWidth: 40,
    idealWidth: 62,
    render: () => <span>Custom inspector</span>,
  },
  { kind: "space", id: "gap", width: 8 },
  { kind: "flexible-space", id: "flex", minimumWidth: 12 },
  { kind: "separator", id: "divider" },
  {
    kind: "command",
    id: "print",
    commandId: "document.print",
    label: "Print",
    paletteLabel: "Print document",
    icon: <span aria-hidden="true">P</span>,
    bordered: false,
    minimumWidth: 40,
    idealWidth: 54,
  },
] as const satisfies readonly NSEToolbarItem[];

function preferenceController(
  namespace: string,
  itemIds: readonly string[] = configuration.defaultItemIds,
  adapter?: PreferencesAdapter,
) {
  const values = new Map<string, unknown>();
  const resolvedAdapter = adapter ?? {
    read: (key: string) => values.get(key) ?? null,
    write: (key: string, value: unknown) => void values.set(key, value),
    remove: (key: string) => void values.delete(key),
  } satisfies PreferencesAdapter;
  return new NSEPreferencesController<NSEToolbarPreferences>({
    namespace,
    schema: {
      version: 1,
      defaults: {
        itemIds,
        displayMode: configuration.displayMode,
        sizeMode: configuration.sizeMode,
      },
      fields: {
        itemIds: { validate: (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((id) => typeof id === "string") },
        displayMode: { validate: (value: unknown): value is NSEToolbarPreferences["displayMode"] => value === "icon-and-label" || value === "icon-only" || value === "label-only" },
        sizeMode: { validate: (value: unknown): value is NSEToolbarPreferences["sizeMode"] => value === "regular" || value === "small" },
      },
      migrations: [],
    },
    adapter: resolvedAdapter,
  });
}

function createController(options: Partial<{
  readonly preferences: NSEPreferencesController<NSEToolbarPreferences>;
  readonly runtime: NSEToolbarRuntimePort;
}> = {}) {
  return new NSEToolbarController({
    configuration,
    items,
    preferences: options.preferences ?? preferenceController("toolbar:window:editor"),
    runtime: options.runtime ?? runtime(),
  });
}

const workAreaSnapshot = Object.freeze({
  width: 1280,
  height: 720,
  safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
});
const presentation = createStaticPresentationPort({ width: 1280, height: 720 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:toolbar-tests",
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workAreaSnapshot, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), []);
  return <NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

function hostedConfiguration(outcome: NSEWindowSurfaceDismissResult["outcome"] = "closed") {
  const controller = createController();
  let request: NSEWindowSurfaceRequest | undefined;
  let setContent!: React.Dispatch<React.SetStateAction<React.ReactNode>>;
  let dismissOutcome = outcome;
  const closeWindow = () => {
    // The actual window host invokes this callback before dismiss resolves.
    request?.onDidClose?.();
    setContent(null);
  };
  const bridge = {
    present: vi.fn(async (nextRequest: NSEWindowSurfaceRequest, content: React.ReactNode) => {
      request = nextRequest;
      setContent(content);
      return "window:hosted-toolbar-configuration";
    }),
    dismiss: vi.fn(async () => {
      if (dismissOutcome === "closed") closeWindow();
      return { outcome: dismissOutcome };
    }),
    reportError: vi.fn(),
  };
  const changed = vi.fn();
  function Fixture() {
    const [open, setOpen] = useState(true);
    const [content, updateContent] = useState<React.ReactNode>(null);
    setContent = updateContent;
    return <OverlayHarness>
      <output aria-label="hosted configuration source">{open ? "open" : "closed"}</output>
      <NSEToolbarConfigurationSheet id="hosted-configuration" open={open} anchor={null} parentResponderId="window:editor" parentWindowControllerId="window:editor" controller={controller} windowBridge={bridge} onOpenChange={(nextOpen, reason) => { changed(nextOpen, reason); setOpen(nextOpen); }} />
      {content}
    </OverlayHarness>;
  }
  const view = render(<Fixture />);
  return { controller, bridge, changed, closeWindow, setOutcome: (next: typeof outcome) => { dismissOutcome = next; }, ...view };
}

describe("NSEToolbarController", () => {
  it("cancels a toolbar dispatch when the displayed command authority tuple is stale", async () => {
    let registryGeneration = 1;
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, commandPresentation(request.commandId)]),
    ));
    const port = runtime(validateMany);
    const prepareDispatch = vi.fn();
    Object.assign(port.commands, {
      getPresentationGeneration: () => ({ registryGeneration, responderGeneration: 2 }),
      prepareDispatch,
    });
    const controller = createController({ runtime: port });
    await controller.refresh();
    registryGeneration += 1;

    await expect(controller.dispatch("save")).resolves.toMatchObject({ status: "cancelled" });
    expect(prepareDispatch).not.toHaveBeenCalled();
    expect(port.commands.dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch an accepted toolbar command after disposal", async () => {
    let resolveAcceptance!: (value: { readonly status: "accepted"; readonly acceptance: never }) => void;
    const prepareDispatch = vi.fn(() => new Promise<{ readonly status: "accepted"; readonly acceptance: never }>((resolve) => {
      resolveAcceptance = resolve;
    }));
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, commandPresentation(request.commandId)]),
    ));
    const port = runtime(validateMany);
    Object.assign(port.commands, { prepareDispatch });
    const controller = createController({ runtime: port });
    await controller.refresh();

    const pending = controller.dispatch("save");
    controller.dispose();
    resolveAcceptance({ status: "accepted", acceptance: { commandId: "document.save", responderId: "editor" } as never });

    await expect(pending).resolves.toMatchObject({ status: "cancelled" });
    expect(port.commands.dispatch).not.toHaveBeenCalled();
  });

  it("resets all configuration fields through one failure-atomic configuration publication", () => {
    const values = new Map<string, unknown>();
    let writes = 0;
    let failAt = Number.POSITIVE_INFINITY;
    const adapter: PreferencesAdapter = {
      read: (key) => values.get(key) ?? null,
      write: (key, value) => {
        writes += 1;
        if (writes === failAt) throw new Error("persistent write failed");
        values.set(key, value);
      },
      remove: (key) => void values.delete(key),
    };
    const preferences = preferenceController("toolbar:atomic-reset", configuration.defaultItemIds, adapter);
    const controller = createController({ preferences });
    controller.setItemOrder(["print", "save"]);
    controller.setDisplayMode("icon-only");
    controller.setSizeMode("small");
    const before = preferences.getSnapshot();
    const published = vi.fn();
    preferences.subscribe(published);
    failAt = writes + 1;

    expect(() => controller.reset()).toThrow(/persistent write failed/i);
    expect(preferences.getSnapshot().committed).toEqual(before.committed);
    expect(preferences.getSnapshot().value).toEqual(before.value);
    expect(published).not.toHaveBeenCalled();
  });

  it("publishes a successful multi-field reset exactly once", () => {
    const preferences = preferenceController("toolbar:single-reset-publication");
    const controller = createController({ preferences });
    controller.setItemOrder(["print", "save"]);
    controller.setDisplayMode("icon-only");
    controller.setSizeMode("small");
    const published = vi.fn();
    preferences.subscribe(published);

    expect(controller.reset()).toBe(true);
    expect(preferences.getSnapshot().committed).toEqual({
      itemIds: configuration.defaultItemIds,
      displayMode: configuration.displayMode,
      sizeMode: configuration.sizeMode,
    });
    expect(published).toHaveBeenCalledTimes(1);
  });

  it("enforces allowed/default item policy and duplicate policy without a parallel preference store", () => {
    const controller = createController();

    expect(controller.snapshot.itemIds).toEqual(configuration.defaultItemIds);
    expect(() => controller.setItemOrder(["save", "save"])).toThrow(/duplicate/i);
    expect(() => controller.setItemOrder(["not-allowed"])).toThrow(/allowed/i);
    expect(() => new NSEToolbarController({
      configuration: { ...configuration, defaultItemIds: ["not-allowed"] },
      items,
      preferences: preferenceController("toolbar:invalid"),
      runtime: runtime(),
    })).toThrow(/allowed/i);
  });

  it("allocates flexible space, keeps exact-width items visible, and moves only trailing actions into stable overflow", () => {
    const layout = allocateNSEToolbarItems(items.filter((item) => item.id !== "custom"), 188, {
      displayMode: "icon-and-label",
      sizeMode: "regular",
      direction: "ltr",
    });
    expect(layout.visibleItemIds).toEqual(["save", "gap", "flex", "divider", "print"]);
    expect(layout.overflowItemIds).toEqual([]);
    expect(layout.entries.find((entry) => entry.id === "flex")).toMatchObject({ allocatedWidth: expect.any(Number) });

    const compactItems = items.filter((item) => item.kind === "command");
    const exactBoundary = allocateNSEToolbarItems(compactItems, 108, {
      displayMode: "icon-and-label",
      sizeMode: "regular",
      direction: "ltr",
    });
    expect(exactBoundary.visibleItemIds).toEqual(["save", "print"]);
    expect(exactBoundary.overflowItemIds).toEqual([]);

    const overflow = allocateNSEToolbarItems([...compactItems, items[1]], 119, {
      displayMode: "icon-and-label",
      sizeMode: "regular",
      direction: "rtl",
    });
    expect(overflow.direction).toBe("rtl");
    expect(overflow.visibleItemIds).toEqual(["save"]);
    expect(overflow.overflowItemIds).toEqual(["print", "custom"]);

    const structurallyClipped = allocateNSEToolbarItems([items[2], items[4]], 1, {
      displayMode: "icon-and-label",
      sizeMode: "regular",
      direction: "ltr",
    });
    expect(structurallyClipped.overflowRequired).toBe(false);
    expect(structurallyClipped.clipped).toBe(true);
  });

  it("uses one immutable command validation generation for configured commands and dispatches the exact payload through toolbar authority", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, commandPresentation(request.commandId, {
        state: request.commandId === "document.save" ? "on" : "off",
      })]),
    ));
    const toolbarRuntime = runtime(validateMany);
    const controller = createController({ runtime: toolbarRuntime });

    await controller.refresh();
    expect(validateMany).toHaveBeenCalledTimes(1);
    expect(validateMany.mock.calls[0]?.[0].map((request: { readonly key: string }) => request.key)).toEqual([
      "editor-toolbar:save:0",
      "editor-toolbar:print:0",
    ]);
    expect(controller.snapshot.items.find((item) => item.id === "save")).toMatchObject({
      kind: "command",
      checked: "on",
      enabled: true,
    });
    expect(Object.isFrozen(controller.snapshot.items)).toBe(true);

    await controller.dispatch("save");
    expect(toolbarRuntime.commands.dispatch).toHaveBeenCalledWith(
      "document.save",
      undefined,
      expect.objectContaining({ source: "toolbar" }),
    );
  });

  it("keeps duplicate command instances distinct in one validation generation", async () => {
    const duplicateItems = [{ ...items[0], allowsDuplicates: true }] as const satisfies readonly NSEToolbarItem[];
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, commandPresentation(request.commandId)]),
    ));
    const controller = new NSEToolbarController({
      configuration: {
        ...configuration,
        allowedItemIds: ["save"],
        defaultItemIds: ["save", "save"],
      },
      items: duplicateItems,
      preferences: preferenceController("toolbar:duplicates", ["save", "save"]),
      runtime: runtime(validateMany),
    });

    await controller.refresh();
    expect(validateMany.mock.calls[0]?.[0].map((request: { readonly key: string }) => request.key)).toEqual([
      "editor-toolbar:save:0",
      "editor-toolbar:save:1",
    ]);
    expect(controller.snapshot.items.map((item) => item.instanceId)).toEqual(["save:0", "save:1"]);
  });

  it("keeps each item's own label and border, as NSToolbarItem does", async () => {
    const validateMany = vi.fn(async () => new Map([
      ["editor-toolbar:save:0", commandPresentation("document.save", { title: "Save Document" })],
      ["editor-toolbar:print:0", commandPresentation("document.print", { title: "Print Document…" })],
    ]));
    const controller = createController({ runtime: runtime(validateMany) });
    await controller.refresh();
    expect(controller.snapshot.items.find((item) => item.id === "save")).toMatchObject({ label: "Save", bordered: true });
    expect(controller.snapshot.items.find((item) => item.id === "print")).toMatchObject({ label: "Print", bordered: false });
  });

  it("captions a view item with its label only when it asks to, as a view-based NSToolbarItem does", async () => {
    const labelled = new NSEToolbarController({
      configuration: { ...configuration, displayMode: "icon-and-label" },
      items: items.map((item) => item.kind === "custom" ? { ...item, showsLabel: true } : item),
      preferences: preferenceController("toolbar:labelled-view", ["save", "custom", "print"]),
      runtime: runtime(vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, commandPresentation(request.commandId)]),
      ))),
    });
    await labelled.refresh();
    const view = render(<OverlayHarness>
      <NSEToolbar composition="configured" controller={labelled} width={400} interaction={{ overflowOverlayId: "toolbar-labelled-view", parentResponderId: "window:editor" }} aria-label="Labelled view" />
    </OverlayHarness>);
    const group = await screen.findByRole("group", { name: "Custom inspector" });
    expect(group.getAttribute("data-nse-toolbar-labelled")).toBe("true");
    expect(group.querySelector(".nse-toolbar-item-label")?.textContent).toBe("Custom inspector");
    view.unmount();
    const plain = createController({ preferences: preferenceController("toolbar:plain-view", ["save", "custom", "print"]), runtime: runtime(vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, commandPresentation(request.commandId)]),
    ))) });
    await plain.refresh();
    render(<OverlayHarness>
      <NSEToolbar composition="configured" controller={plain} width={400} interaction={{ overflowOverlayId: "toolbar-plain-view", parentResponderId: "window:editor" }} aria-label="Plain view" />
    </OverlayHarness>);
    const unlabelled = await screen.findByRole("group", { name: "Custom inspector" });
    expect(unlabelled.hasAttribute("data-nse-toolbar-labelled")).toBe(false);
    expect(unlabelled.querySelector(".nse-toolbar-item-label")).toBeNull();
  });

  it("does not publish a replaced validation generation", async () => {
    const resolvers: Array<(value: ReadonlyMap<string, ReturnType<typeof commandPresentation>>) => void> = [];
    const validateMany = vi.fn(() => new Promise<ReadonlyMap<string, ReturnType<typeof commandPresentation>>>((resolve) => {
      resolvers.push(resolve);
    }));
    const controller = createController({ runtime: runtime(validateMany) });

    const first = controller.refresh();
    const second = controller.refresh();
    expect(validateMany).toHaveBeenCalledTimes(2);
    resolvers[0]!(new Map([
      ["editor-toolbar:save:0", commandPresentation("document.save", { title: "Stale save" })],
      ["editor-toolbar:print:0", commandPresentation("document.print", { title: "Stale print" })],
    ]));
    resolvers[1]!(new Map([
      ["editor-toolbar:save:0", commandPresentation("document.save", { title: "Fresh save" })],
      ["editor-toolbar:print:0", commandPresentation("document.print", { title: "Fresh print" })],
    ]));
    await Promise.all([first, second]);

    expect(controller.snapshot.items.find((item) => item.id === "save")).toMatchObject({ presentation: { title: "Fresh save" } });
  });

  it("persists configuration through each supplied configuration controller, resets defaults, and keeps window owners isolated", () => {
    const firstPreferences = preferenceController("toolbar:window:first");
    const secondPreferences = preferenceController("toolbar:window:second");
    const first = createController({ preferences: firstPreferences });
    const second = new NSEToolbarController({
      configuration: {
        ...configuration,
        owner: { kind: "window", windowControllerId: "window:second" },
      },
      items,
      preferences: secondPreferences,
      runtime: runtime(),
    });

    first.setItemOrder(["print", "save"]);
    expect(firstPreferences.getSnapshot().committed.itemIds).toEqual(["print", "save"]);
    expect(second.snapshot.itemIds).toEqual(configuration.defaultItemIds);
    first.reset();
    expect(first.snapshot.itemIds).toEqual(configuration.defaultItemIds);
  });
});

describe("NSEToolbar presentation", () => {
  it("commits hosted Done before onDidClose can discard the configuration draft", async () => {
    const { controller, changed } = hostedConfiguration();
    const commit = vi.spyOn(controller, "commitConfiguration");
    const discard = vi.spyOn(controller, "discardConfiguration");
    fireEvent.click(await screen.findByRole("button", { name: "Move Print left" }));
    const draft = [...controller.snapshot.itemIds];
    expect(draft).not.toEqual(configuration.defaultItemIds);
    expect(controller.preferences.getSnapshot().committed.itemIds).toEqual(configuration.defaultItemIds);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.getByLabelText("hosted configuration source").textContent).toBe("closed"));
    expect(controller.preferences.getSnapshot().committed.itemIds).toEqual(draft);
    expect(controller.preferences.isEditing).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(discard).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith(false, "selection");
  });

  it("discards hosted Cancel exactly once when the host reports onDidClose first", async () => {
    const { controller, changed } = hostedConfiguration();
    const commit = vi.spyOn(controller, "commitConfiguration");
    const discard = vi.spyOn(controller, "discardConfiguration");
    fireEvent.click(await screen.findByRole("button", { name: "Move Print left" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.getByLabelText("hosted configuration source").textContent).toBe("closed"));
    expect(controller.snapshot.itemIds).toEqual(configuration.defaultItemIds);
    expect(controller.preferences.isEditing).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith(false, "programmatic");
  });

  it("discards an externally closed hosted configuration without a Done intent", async () => {
    const { controller, closeWindow, changed } = hostedConfiguration();
    const commit = vi.spyOn(controller, "commitConfiguration");
    const discard = vi.spyOn(controller, "discardConfiguration");
    fireEvent.click(await screen.findByRole("button", { name: "Move Print left" }));

    act(closeWindow);

    await waitFor(() => expect(screen.getByLabelText("hosted configuration source").textContent).toBe("closed"));
    expect(controller.snapshot.itemIds).toEqual(configuration.defaultItemIds);
    expect(controller.preferences.isEditing).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith(false, "programmatic");
  });

  it.each(["refused", "cancelled"] as const)("retains the draft when hosted Done is %s and allows a later Cancel", async (outcome) => {
    const { controller, bridge, changed, setOutcome } = hostedConfiguration(outcome);
    const commit = vi.spyOn(controller, "commitConfiguration");
    const discard = vi.spyOn(controller, "discardConfiguration");
    fireEvent.click(await screen.findByRole("button", { name: "Move Print left" }));
    const draft = [...controller.snapshot.itemIds];

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(bridge.dismiss).toHaveBeenCalled());
    expect(screen.getByLabelText("hosted configuration source").textContent).toBe("open");
    expect(controller.snapshot.itemIds).toEqual(draft);
    expect(controller.preferences.getSnapshot().committed.itemIds).toEqual(configuration.defaultItemIds);
    expect(controller.preferences.isEditing).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalledWith(false, expect.anything());

    setOutcome("closed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.getByLabelText("hosted configuration source").textContent).toBe("closed"));
    expect(controller.snapshot.itemIds).toEqual(configuration.defaultItemIds);
    expect(controller.preferences.isEditing).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("projects source authority onto the toolbar shell and command items without moving controller state", async () => {
    const controller = createController({
      preferences: preferenceController("toolbar:appearance-evidence"),
      runtime: runtime(vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, commandPresentation(request.commandId)]),
      ))),
    });
    render(
      <OverlayHarness>
        <NSEToolbar composition="configured" controller={controller} width={300} interaction={{ overflowOverlayId: "toolbar-appearance-evidence", parentResponderId: "window:editor" }} aria-label="Appearance actions" />
      </OverlayHarness>,
    );

    const toolbar = await screen.findByRole("toolbar", { name: "Appearance actions" });
    const save = await screen.findByRole("button", { name: "Save" });
    expect(toolbar.getAttribute("data-nse-appearance-slot")).toBe("toolbar.surface.normal.1x");
    expect(save.getAttribute("data-nse-appearance-slot")).toBe("toolbar.item.normal.1x");
    expect(controller.snapshot.itemIds).toEqual(configuration.defaultItemIds);
    fireEvent.click(save);
    await waitFor(() => expect(controller.runtime.commands.dispatch).toHaveBeenCalledWith(
      "document.save",
      undefined,
      expect.objectContaining({ source: "toolbar" }),
    ));
  });

  it("uses Atmo chrome as inert paint layers while command and focus ownership stay with the toolbar", async () => {
    const controller = createController({
      preferences: preferenceController("toolbar:chrome-layers"),
      runtime: runtime(vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, commandPresentation(request.commandId)]),
      ))),
    });
    render(
      <OverlayHarness>
        <NSEToolbar composition="configured" controller={controller} width={300} interaction={{ overflowOverlayId: "toolbar-chrome-layers", parentResponderId: "window:editor" }} aria-label="Chrome actions" />
      </OverlayHarness>,
    );

    const toolbar = await screen.findByRole("toolbar", { name: "Chrome actions" });
    const save = await screen.findByRole("button", { name: "Save" });
    expect(toolbar.querySelector('[data-nse-chrome-primitive="surface"]')).not.toBeNull();
    expect(save.querySelector('[data-nse-chrome-primitive="bevel"]')?.getAttribute("aria-hidden")).toBe("true");
    save.focus();
    expect(document.activeElement).toBe(save);
    fireEvent.click(save);
    await waitFor(() => expect(controller.runtime.commands.dispatch).toHaveBeenCalledWith(
      "document.save",
      undefined,
      expect.objectContaining({ source: "toolbar" }),
    ));
  });

  it("removes command controls and announces a validation failure instead of dispatching stale state", async () => {
    const controller = createController({
      runtime: runtime(vi.fn(async () => {
        throw new Error("command validation unavailable");
      })),
      preferences: preferenceController("toolbar:validation-failure", ["save"]),
    });
    render(
      <OverlayHarness>
        <NSEToolbar
          composition="configured"
          controller={controller}
          width={300}
          interaction={{ overflowOverlayId: "toolbar-failure-overflow", parentResponderId: "window:editor" }}
          aria-label="Document actions"
        />
      </OverlayHarness>,
    );

    const toolbar = await screen.findByRole("toolbar", { name: "Document actions" });
    await waitFor(() => expect(toolbar.getAttribute("data-state")).toBe("error"));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("temporarily unavailable");
  });

  it("renders child composition with direct children and positional surface state", () => {
    render(
      <NSEToolbar composition="children" position="top" grouped aria-label="Child actions">
        <span>Child action</span>
      </NSEToolbar>,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Child actions" });
    expect(toolbar.className).toContain("nse-control-toolbar");
    expect(toolbar.getAttribute("data-position")).toBe("top");
    expect(toolbar.getAttribute("data-grouped")).toBe("true");
    expect(screen.getByText("Child action")).toBeTruthy();
  });

  it("projects overflow through the shared menu layer and keeps toolbar roving focus", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, commandPresentation(request.commandId)]),
    ));
    const toolbarRuntime = runtime(validateMany);
    const controller = createController({
      runtime: toolbarRuntime,
      preferences: preferenceController("toolbar:overflow", ["save", "custom", "print"]),
    });
    render(
      <OverlayHarness>
        <NSEToolbar
          composition="configured"
          controller={controller}
          width={150}
          interaction={{ overflowOverlayId: "toolbar-overflow", parentResponderId: "window:editor" }}
          aria-label="Document actions"
        />
      </OverlayHarness>,
    );

    const save = await screen.findByRole("button", { name: "Save" });
    const overflowTrigger = screen.getByRole("button", { name: "More toolbar items" });
    expect(save.tabIndex).toBe(0);
    expect(overflowTrigger.tabIndex).toBe(-1);
    fireEvent.keyDown(save, { key: "ArrowRight" });
    expect(document.activeElement).toBe(overflowTrigger);
    expect(save.tabIndex).toBe(-1);
    expect(overflowTrigger.tabIndex).toBe(0);
    fireEvent.click(document.activeElement!);
    const overflow = await screen.findByRole("menu");
    fireEvent.click(screen.getByRole("menuitem", { name: "Print" }));
    expect(overflow).toBeTruthy();
    await waitFor(() => expect(toolbarRuntime.commands.dispatch).toHaveBeenCalledWith(
      "document.print",
      undefined,
      expect.objectContaining({ source: "menu" }),
    ));
  });

  it("carries the canonical scheduler into an overflow branch so scope setup cannot stale its validation", async () => {
    let runScheduledOpen: (() => void) | null = null;
    const scheduler = {
      setTimeout: vi.fn((callback: () => void) => {
        runScheduledOpen = callback;
        return "overflow-open";
      }),
      clearTimeout: vi.fn(),
    };
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, commandPresentation(request.commandId)]),
    ));
    const toolbarRuntime = Object.assign(runtime(validateMany), { scheduler });
    const controller = createController({
      runtime: toolbarRuntime,
      preferences: preferenceController("toolbar:overflow-scheduler", ["save", "custom", "print"]),
    });
    render(
      <OverlayHarness>
        <NSEToolbar
          composition="configured"
          controller={controller}
          width={150}
          interaction={{ overflowOverlayId: "toolbar-overflow-scheduler", parentResponderId: "window:editor" }}
          aria-label="Scheduled document actions"
        />
      </OverlayHarness>,
    );

    const overflowTrigger = await screen.findByRole("button", { name: "More toolbar items" });
    fireEvent.click(overflowTrigger);
    await waitFor(() => expect(scheduler.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0));

    runScheduledOpen?.();
    expect(await screen.findByRole("menu")).toBeTruthy();
  });

  it("uses a window sheet bridge, keyboard reordering, and provider focus restoration for configuration", async () => {
    const controller = createController({ preferences: preferenceController("toolbar:configuration") });
    const bridge = { open: vi.fn(), close: vi.fn() };
    function Fixture() {
      const [open, setOpen] = useState(false);
      const trigger = useRef<HTMLButtonElement>(null);
      return (
        <OverlayHarness>
          <button ref={trigger} type="button" onClick={() => setOpen(true)}>Configure toolbar</button>
          <NSEToolbarConfigurationSheet
            id="configure-editor-toolbar"
            open={open}
            anchor={trigger.current}
            parentResponderId="window:editor"
            parentWindowControllerId="window:editor"
            controller={controller}
            windowBridge={bridge}
            onOpenChange={setOpen}
          />
        </OverlayHarness>
      );
    }
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "Configure toolbar" });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Customize editor toolbar" })).toBeTruthy();
    expect(bridge.open).toHaveBeenCalledWith(expect.objectContaining({
      role: "sheet",
      parentWindowControllerId: "window:editor",
      owner: configuration.owner,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Move Print left" }));
    expect(controller.snapshot.itemIds.indexOf("print")).toBeLessThan(controller.snapshot.itemIds.indexOf("divider"));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Customize editor toolbar" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(bridge.close).toHaveBeenCalled();
  });

  it("discards the configuration transaction when its controlled window host closes it", async () => {
    const controller = createController({ preferences: preferenceController("toolbar:controlled-close") });
    const bridge = { open: vi.fn(), close: vi.fn() };
    function Fixture() {
      const [open, setOpen] = useState(true);
      return (
        <OverlayHarness>
          <button type="button" onClick={() => setOpen(false)}>Host closes configuration</button>
          <NSEToolbarConfigurationSheet
            id="controlled-close-editor-toolbar"
            open={open}
            anchor={null}
            parentResponderId="window:editor"
            parentWindowControllerId="window:editor"
            controller={controller}
            windowBridge={bridge}
            onOpenChange={setOpen}
          />
        </OverlayHarness>
      );
    }
    render(<Fixture />);

    await screen.findByRole("dialog", { name: "Customize editor toolbar" });
    fireEvent.click(screen.getByRole("button", { name: "Move Print left" }));
    expect(controller.preferences.isEditing).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Host closes configuration" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Customize editor toolbar" })).toBeNull());
    expect(controller.preferences.isEditing).toBe(false);
    expect(controller.snapshot.itemIds).toEqual(configuration.defaultItemIds);
    expect(bridge.close).toHaveBeenCalled();
  });

  it("keeps the configuration transaction and restores open truth when canonical close is refused", async () => {
    const controller = createController({ preferences: preferenceController("toolbar:refused-close") });
    const bridge = {
      present: vi.fn(async () => "window:toolbar-configuration"),
      dismiss: vi.fn(async () => ({ outcome: "refused" as const })),
      reportError: vi.fn(),
    };
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <OverlayHarness>
        <button type="button" onClick={() => setOpen(false)}>Close canonical configuration</button>
        <output aria-label="configuration source">{open ? "open" : "closed"}</output>
        <NSEToolbarConfigurationSheet id="refused-configuration" open={open} anchor={null} parentResponderId="window:editor" parentWindowControllerId="window:editor" controller={controller} windowBridge={bridge} onOpenChange={setOpen} />
      </OverlayHarness>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalled());
    const presentationsBeforeClose = bridge.present.mock.calls.length;
    expect(controller.preferences.isEditing).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close canonical configuration" }));

    await waitFor(() => expect(screen.getByLabelText("configuration source").textContent).toBe("open"));
    expect(bridge.present.mock.calls.length).toBeGreaterThan(presentationsBeforeClose);
    expect(controller.preferences.isEditing).toBe(true);
  });

  it("reports a rejected canonical close while preserving the configuration transaction and source truth", async () => {
    const controller = createController({ preferences: preferenceController("toolbar:rejected-close") });
    const failure = new Error("toolbar close failed");
    const bridge = {
      present: vi.fn(async () => "window:toolbar-configuration"),
      dismiss: vi.fn(async () => { throw failure; }),
      reportError: vi.fn(),
    };
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <OverlayHarness>
        <button type="button" onClick={() => setOpen(false)}>Reject canonical configuration close</button>
        <output aria-label="rejected configuration source">{open ? "open" : "closed"}</output>
        <NSEToolbarConfigurationSheet id="rejected-configuration" open={open} anchor={null} parentResponderId="window:editor" parentWindowControllerId="window:editor" controller={controller} windowBridge={bridge} onOpenChange={setOpen} />
      </OverlayHarness>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalled());
    controller.setItemOrder(["print", "save"]);
    expect(controller.preferences.isEditing).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Reject canonical configuration close" }));

    await waitFor(() => expect(screen.getByLabelText("rejected configuration source").textContent).toBe("open"));
    expect(bridge.reportError).toHaveBeenCalledWith(failure, { requestId: "rejected-configuration", operation: "dismiss" });
    expect(controller.preferences.isEditing).toBe(true);
    expect(controller.snapshot.itemIds).not.toEqual(configuration.defaultItemIds);
  });
});
