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
import { installNSEScrollIntoViewFixture } from "../fixtures/browser";
installNSEScrollIntoViewFixture();
import React, { useMemo, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSEMenu,
  NSEContextMenu,
  NSEMenuController,
  NSEMenuBar,
  NSEMenuOverlay,
  NSEPopupButton,
  orderMenuEntries,
  type NSEMenuModel,
  type NSEMenuRuntimePort,
} from "../../../src/NSE/Menus";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { defineNSEAppearance, NSEAppearanceProvider } from "../../../src/NSE/Appearance";
import { NSEPicker, NSEPopup } from "../../../src/NSE/Menus";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

const customAppearance = defineNSEAppearance({ id: "test-custom", displayName: "Test custom" });

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function presentation(commandId: string, overrides: Partial<{
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

function runtime(validateMany = vi.fn(), additions: Partial<NSEMenuRuntimePort> = {}) {
  const signal = new AbortController().signal;
  return {
    signal,
    commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validateMany,
      prepareDispatch: vi.fn(async (commandId: string) => ({ status: "accepted" as const, acceptance: { commandId, responderId: "editor" } as never })),
      dispatch: vi.fn(async (commandId: string) => ({
        status: "executed" as const,
        commandId,
        responderId: "editor",
        operationId: "operation:menu",
        correlationId: "correlation:menu",
        value: undefined,
      })),
    },
    ...additions,
  } satisfies NSEMenuRuntimePort;
}

const model: NSEMenuModel = {
  id: "format",
  label: "Format",
  entries: [
    { kind: "command", id: "bold-plain", commandId: "text.toggleBold", payload: { variant: "plain" }, labelOverride: "Bold" },
    { kind: "command", id: "bold-markdown", commandId: "text.toggleBold", payload: { variant: "markdown" }, labelOverride: "Bold Markdown" },
    { kind: "separator", id: "format-separator" },
    { kind: "submenu", id: "alignment", label: "Alignment", entries: [
      { kind: "command", id: "align-left", commandId: "text.align", payload: { edge: "left" }, labelOverride: "Align Left" },
    ] },
  ],
};

const workAreaSnapshot = Object.freeze({
  width: 1280,
  height: 720,
  safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
});
const desktopPresentation = createStaticPresentationPort({ width: 1280, height: 720 });
const mobilePresentation = createStaticPresentationPort({ width: 390, height: 640 });

function MenuOverlayHarness({
  children,
  mode = "desktop",
  onScope,
}: {
  readonly children: React.ReactNode;
  readonly mode?: "desktop" | "mobile";
  readonly onScope?: (options: unknown) => void;
}) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:menu-tests",
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workAreaSnapshot, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation: mode === "mobile" ? mobilePresentation : desktopPresentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (options: unknown, node: React.ReactNode) => {
      onScope?.(options);
      return node;
    },
  }), [mode, onScope]);
  return <NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

describe("NSEMenuController", () => {
  it("uses explicit item-menu overlay provenance when the host has no default responder", async () => {
    render(
      <MenuOverlayHarness>
        <NSEMenu
          label="Actions"
          defaultOpen
          menuOverlay={{ id: "gallery:actions", parentResponderId: "application:nse-control-gallery" }}
          items={[{ value: "today", label: "Go to today" }]}
        />
      </MenuOverlayHarness>,
    );

    expect((await screen.findByRole("menu")).getAttribute("data-nse-menu-id")).toContain("nse-item-menu:");
    expect((screen.getByRole("menuitem", { name: "Go to today" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an unavailable-reason tooltip only while the command is disabled", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, {
        ...presentation(request.commandId, { enabled: request.commandId !== "text.align" }),
        disabledReason: "Alignment is unavailable.",
      }]),
    ));
    const controller = new NSEMenuController({ model, runtime: runtime(validateMany) });
    const view = render(<NSEMenu model={model} controller={controller} open />);
    try {
      const bold = await screen.findByRole("menuitem", { name: "Bold" });
      await waitFor(() => expect(bold.hasAttribute("disabled")).toBe(false));
      expect(bold.getAttribute("title")).toBeNull();
      fireEvent.click(screen.getByRole("menuitem", { name: "Alignment" }));
      const alignment = await screen.findByRole("menuitem", { name: "Align Left" });
      await waitFor(() => expect(alignment.hasAttribute("disabled")).toBe(true));
      expect(alignment.getAttribute("title")).toBeTruthy();
    } finally {
      view.unmount();
      controller.dispose();
    }
  });

  it("cancels a displayed command when its command registry or responder generation is replaced", async () => {
    let registryGeneration = 4;
    let responderGeneration = 9;
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    const port = runtime(validateMany);
    const prepareDispatch = vi.fn();
    Object.assign(port.commands, {
      getPresentationGeneration: () => ({ registryGeneration, responderGeneration }),
      prepareDispatch,
    });
    const controller = new NSEMenuController({ model, runtime: port });
    await controller.open();

    registryGeneration += 1;
    responderGeneration += 1;
    await expect(controller.dispatch("bold-plain")).resolves.toMatchObject({ status: "cancelled" });
    expect(prepareDispatch).not.toHaveBeenCalled();
    expect(port.commands.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches only a one-shot command acceptance prepared for the displayed payload", async () => {
    const payload = { variant: "plain" };
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    const port = runtime(validateMany);
    const acceptance = { commandId: "text.toggleBold", responderId: "editor" };
    const prepareDispatch = vi.fn(async () => ({ status: "accepted" as const, acceptance }));
    Object.assign(port.commands, {
      getPresentationGeneration: () => ({ registryGeneration: 4, responderGeneration: 9 }),
      prepareDispatch,
    });
    const controller = new NSEMenuController({ model, runtime: port });
    await controller.open();
    await controller.dispatch("bold-plain");

    expect(prepareDispatch).toHaveBeenCalledWith("text.toggleBold", payload, expect.objectContaining({ source: "menu" }));
    expect(port.commands.dispatch).toHaveBeenCalledWith("text.toggleBold", payload, expect.objectContaining({
      source: "menu",
      acceptance,
    }));
  });

  it("does not dispatch an accepted command after the menu is dismissed or disposed", async () => {
    let resolveAcceptance!: (value: { readonly status: "accepted"; readonly acceptance: never }) => void;
    const prepareDispatch = vi.fn(() => new Promise<{ readonly status: "accepted"; readonly acceptance: never }>((resolve) => {
      resolveAcceptance = resolve;
    }));
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    const port = runtime(validateMany);
    Object.assign(port.commands, { prepareDispatch });
    const controller = new NSEMenuController({ model, runtime: port });
    await controller.open();

    const pending = controller.dispatch("bold-plain");
    controller.dismiss("escape");
    controller.dispose();
    resolveAcceptance({ status: "accepted", acceptance: { commandId: "text.toggleBold", responderId: "editor" } as never });

    await expect(pending).resolves.toMatchObject({ status: "cancelled" });
    expect(port.commands.dispatch).not.toHaveBeenCalled();
    await controller.open();
    expect(controller.snapshot.open).toBe(false);
    expect(validateMany).toHaveBeenCalledTimes(1);
  });

  it("validates one visible branch with distinct request keys and does not publish a dismissed generation", async () => {
    let resolveValidation!: (value: ReadonlyMap<string, ReturnType<typeof presentation>>) => void;
    const validateMany = vi.fn(() => new Promise<ReadonlyMap<string, ReturnType<typeof presentation>>>((resolve) => {
      resolveValidation = resolve;
    }));
    const port = runtime(validateMany);
    const controller = new NSEMenuController({ model, runtime: port });

    const opening = controller.open();
    expect(validateMany).toHaveBeenCalledTimes(1);
    const requests = validateMany.mock.calls[0]?.[0] ?? [];
    expect(requests.map((request: { readonly key: string }) => request.key)).toEqual([
      "format:bold-plain",
      "format:bold-markdown",
    ]);

    controller.dismiss("escape");
    resolveValidation(new Map([
      ["format:bold-plain", presentation("text.toggleBold")],
      ["format:bold-markdown", presentation("text.toggleBold")],
    ]));
    await opening;

    expect(controller.snapshot.open).toBe(false);
    expect(controller.snapshot.entries).toEqual([]);
    await expect(controller.dispatch("bold-plain")).resolves.toMatchObject({ status: "cancelled" });
    expect(port.commands.dispatch).not.toHaveBeenCalled();
  });

  it("projects command validation into ARIA menu roles and dispatches only the displayed command", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId, {
        state: request.commandId === "text.toggleBold" ? "on" : "off",
      })]),
    ));
    const port = runtime(validateMany);
    const controller = new NSEMenuController({ model, runtime: port });

    render(<NSEMenu model={model} controller={controller} open />);
    const bold = await screen.findByRole("menuitemcheckbox", { name: "Bold" });
    const surface = screen.getByRole("menu").querySelector('[data-nse-nine-slice="menu-surface"]');
    expect(surface?.querySelectorAll("[data-nse-nine-slice-part]")).toHaveLength(9);
    expect(bold.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "b" });
    await waitFor(() => expect(document.activeElement).toBe(bold));
    fireEvent.keyDown(bold, { key: "Enter" });
    await waitFor(() => expect(port.commands.dispatch).toHaveBeenCalledWith(
      "text.toggleBold",
      { variant: "plain" },
      expect.objectContaining({ source: "menu" }),
    ));
  });

  it("does not issue a second visible-branch validation during a StrictMode effect replay", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    const controller = new NSEMenuController({ model, runtime: runtime(validateMany) });
    render(<React.StrictMode><NSEMenu model={model} controller={controller} open /></React.StrictMode>);

    await screen.findByRole("menuitem", { name: "Bold" });
    expect(validateMany).toHaveBeenCalledTimes(1);
  });

  it("uses the injected scheduler for expiring multi-character typeahead", async () => {
    let nextHandle = 0;
    const timers = new Map<number, () => void>();
    const scheduler = {
      setTimeout: vi.fn((callback: () => void) => {
        const handle = ++nextHandle;
        timers.set(handle, callback);
        return handle;
      }),
      clearTimeout: vi.fn((handle: unknown) => { timers.delete(handle as number); }),
    };
    const typeaheadModel: NSEMenuModel = {
      id: "typeahead",
      label: "Typeahead",
      entries: [
        { kind: "command", id: "axe", commandId: "choose.axe", labelOverride: "Axe" },
        { kind: "command", id: "apricot", commandId: "choose.apricot", labelOverride: "Apricot" },
      ],
    };
    const controller = new NSEMenuController({
      model: typeaheadModel,
      runtime: runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      ), { scheduler }),
    });
    const rendered = render(<NSEMenu model={typeaheadModel} controller={controller} open />);
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "a" });
    fireEvent.keyDown(menu, { key: "p" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Apricot" })));
    expect(scheduler.clearTimeout).toHaveBeenCalledTimes(1);
    rendered.unmount();
    expect(timers.size).toBe(0);
  });

  it("keeps hidden commands out of the immutable projection and represents mixed and disabled state", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId, request.key.endsWith("bold-plain")
        ? { enabled: false, state: "mixed", title: "Mixed Bold" }
        : { hidden: true },
      )]),
    ));
    const controller = new NSEMenuController({ model, runtime: runtime(validateMany) });

    await controller.open();

    expect(controller.snapshot.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "bold-plain", enabled: false, checked: "mixed" }),
      expect.objectContaining({ id: "alignment", kind: "submenu" }),
    ]));
    expect(controller.snapshot.entries.find((entry) => entry.id === "bold-markdown")).toBeUndefined();
    await expect(controller.dispatch("bold-plain")).resolves.toMatchObject({ status: "cancelled" });
  });

  it("uses explicit radio semantics without weakening legacy checked command semantics", async () => {
    const radioModel: NSEMenuModel = {
      id: "sort",
      label: "Sort",
      entries: [{ kind: "command", id: "newest", commandId: "sort.newest", labelOverride: "Newest", selectionKind: "radio" }],
    };
    const controller = new NSEMenuController({
      model: radioModel,
      runtime: runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId, { state: "on" })]),
      )),
    });
    render(<NSEMenu model={radioModel} controller={controller} open />);
    expect((await screen.findByRole("menuitemradio", { name: "Newest" })).getAttribute("aria-checked")).toBe("true");
  });

  it("uses deterministic extension ordering and settles a cancelled delayed submenu", async () => {
    const extension = { kind: "command" as const, id: "print", commandId: "document.print", labelOverride: "Print" };
    expect(orderMenuEntries(model.entries, [
      { id: "print-after", afterId: "bold-plain", entries: [extension], weight: 5 },
      { id: "bold-before", beforeId: "bold-plain", entries: [{ ...extension, id: "preview", commandId: "document.preview" }], weight: -5 },
    ]).map((entry) => entry.id)).toEqual([
      "preview", "bold-plain", "print", "bold-markdown", "format-separator", "alignment",
    ]);

    let pendingCallback: (() => void) | null = null;
    const clearTimeout = vi.fn(() => { pendingCallback = null; });
    const scheduler = {
      setTimeout: vi.fn((callback: () => void) => {
        pendingCallback = callback;
        return "submenu-delay";
      }),
      clearTimeout,
    };
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    const controller = new NSEMenuController({ model, runtime: runtime(validateMany, { scheduler }) });
    await controller.open();
    const delayed = controller.openSubmenu("alignment", 180);
    expect(validateMany).toHaveBeenCalledTimes(1);

    controller.dismiss("escape");
    await expect(delayed).resolves.toBeUndefined();
    expect(clearTimeout).toHaveBeenCalledWith("submenu-delay");
    expect(controller.snapshot.open).toBe(false);
  });

  it("validates only the entered submenu branch and returns through the immutable branch stack", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    const controller = new NSEMenuController({ model, runtime: runtime(validateMany) });
    await controller.open();
    await controller.openSubmenu("alignment");
    expect(validateMany).toHaveBeenCalledTimes(2);
    expect(validateMany.mock.calls[1]?.[0].map((request: { readonly key: string }) => request.key)).toEqual([
      "format:alignment:align-left",
    ]);
    expect(controller.snapshot.branchPath).toEqual(["alignment"]);
    expect(controller.snapshot.entries).toEqual([expect.objectContaining({ id: "align-left" })]);

    await controller.closeSubmenu();
    expect(validateMany).toHaveBeenCalledTimes(3);
    expect(controller.snapshot.branchPath).toEqual([]);
  });

  it("fences an in-flight validation when the owning runtime aborts", async () => {
    const abort = new AbortController();
    let resolveValidation!: (value: ReadonlyMap<string, ReturnType<typeof presentation>>) => void;
    const validateMany = vi.fn(() => new Promise<ReadonlyMap<string, ReturnType<typeof presentation>>>((resolve) => {
      resolveValidation = resolve;
    }));
    const controller = new NSEMenuController({ model, runtime: runtime(validateMany, { signal: abort.signal }) });
    const opening = controller.open();
    abort.abort();
    resolveValidation(new Map([
      ["format:bold-plain", presentation("text.toggleBold")],
      ["format:bold-markdown", presentation("text.toggleBold")],
    ]));
    await opening;

    expect(controller.snapshot).toMatchObject({ open: false, validating: false, entries: [] });
  });

  it("closes a visible branch when command marks any validation presentation stale", async () => {
    const controller = new NSEMenuController({
      model,
      runtime: runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId, { stale: request.key.endsWith("bold-plain") })]),
      )),
    });
    await controller.open();
    expect(controller.snapshot).toMatchObject({ open: false, entries: [] });
    await expect(controller.dispatch("bold-plain")).resolves.toMatchObject({ status: "cancelled" });
  });

  it("routes modifier and Shift key equivalents through the command key-binding authority", async () => {
    const claimKeyboardEvent = vi.fn(() => ({
      resolution: { binding: { commandId: "text.toggleBold" } },
      acceptance: {},
    }));
    const handleKeyboardEvent = vi.fn(async () => ({ handled: true, reason: "handled" }));
    const controller = new NSEMenuController({
      model,
      runtime: runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      ), {
        keyBindings: { claimKeyboardEvent, handleKeyboardEvent },
      }),
    });
    await controller.open();
    const event = {
      key: "b",
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
      repeat: false,
    };
    const accepted = controller.claimKeyEquivalent({ event });

    expect(accepted).not.toBeNull();
    await controller.dispatchKeyEquivalent({ event }, accepted!);
    expect(claimKeyboardEvent).toHaveBeenCalledWith(event, {});
    expect(handleKeyboardEvent).toHaveBeenCalledWith(event, {}, expect.anything());
    expect(controller.snapshot.open).toBe(false);
  });

  it("projects a popup button through the menu overlay and restores trigger focus on Escape", async () => {
    const scope = vi.fn();
    function Fixture() {
      const menuRuntime = useMemo(() => runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      )), []);
      const controller = useMemo(() => new NSEMenuController({ model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness onScope={scope}>
          <NSEPopupButton
            label="Format"
            model={model}
            controller={controller}
            overlay={{ id: "format-menu", parentResponderId: "editor" }}
          />
        </MenuOverlayHarness>
      );
    }
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "Format" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    expect(menu.closest("[data-nse-overlay-kind]")?.getAttribute("data-nse-overlay-kind")).toBe("menu");
    expect(scope).toHaveBeenCalledWith(expect.objectContaining({ kind: "menu", parentResponderId: "editor" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bold" })));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("removes the provider-owned menu shell after a command selection", async () => {
    function Fixture() {
      const menuRuntime = useMemo(() => runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      )), []);
      const controller = useMemo(() => new NSEMenuController({ model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness>
          <NSEPopupButton label="Format" model={model} controller={controller} overlay={{ id: "format-selection", parentResponderId: "editor" }} />
        </MenuOverlayHarness>
      );
    }
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "Format" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Bold" }));
    await waitFor(() => expect(document.querySelector('[data-nse-overlay-kind="menu"]')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("revalidates a fresh visible generation after its overlay closes and reopens", async () => {
    const validateMany = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    function Fixture() {
      const menuRuntime = useMemo(() => runtime(validateMany), []);
      const controller = useMemo(() => new NSEMenuController({ model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness>
          <NSEPopupButton label="Reopen format" model={model} controller={controller} overlay={{ id: "format-reopen", parentResponderId: "editor" }} />
        </MenuOverlayHarness>
      );
    }
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "Reopen format" });

    fireEvent.click(trigger);
    await screen.findByRole("menuitem", { name: "Bold" });
    fireEvent.click(trigger);
    await waitFor(() => expect(document.querySelector('[data-nse-overlay-kind="menu"]')).toBeNull());

    fireEvent.click(trigger);
    await screen.findByRole("menuitem", { name: "Bold" });
    expect(validateMany).toHaveBeenCalledTimes(2);
  });

  it("uses the same menu model as a sheet/drill-in boundary on mobile", async () => {
    function Fixture() {
      const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
      const menuRuntime = useMemo(() => runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      )), []);
      const controller = useMemo(() => new NSEMenuController({ model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness mode="mobile">
          <button ref={setAnchor} type="button">Open format</button>
          <NSEMenuOverlay overlay={{ id: "format-mobile", parentResponderId: "editor" }} controller={controller} open anchor={anchor} onOpenChange={() => undefined}>
            <NSEMenu model={model} controller={controller} open />
          </NSEMenuOverlay>
        </MenuOverlayHarness>
      );
    }
    render(<Fixture />);
    const menu = await screen.findByRole("menu");
    expect(menu.closest("[data-nse-overlay-kind]")?.getAttribute("data-nse-overlay-kind")).toBe("action-sheet");
    expect(menu.closest("[aria-modal]")?.getAttribute("aria-modal")).toBe("true");
  });

  it("opens context menus from Shift+F10 and keeps their overlay branch typed as context-menu", async () => {
    function Fixture() {
      const menuRuntime = useMemo(() => runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      )), []);
      const controller = useMemo(() => new NSEMenuController({ model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness>
          <NSEContextMenu model={model} controller={controller} overlay={{ id: "canvas-context", parentResponderId: "canvas" }}>
            <span>Canvas</span>
          </NSEContextMenu>
        </MenuOverlayHarness>
      );
    }
    render(<Fixture />);
    const host = screen.getByText("Canvas").parentElement!;
    fireEvent.keyDown(host, { key: "F10", shiftKey: true });
    const menu = await screen.findByRole("menu");
    expect(menu.closest("[data-nse-overlay-kind]")?.getAttribute("data-nse-overlay-kind")).toBe("context-menu");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bold" })));
  });

  it("moves across a menubar with logical arrow keys and opens the newly active menu", async () => {
    const secondModel: NSEMenuModel = {
      id: "view",
      label: "View",
      entries: [{ kind: "command", id: "toggle-sidebar", commandId: "view.toggleSidebar", labelOverride: "Toggle Sidebar" }],
    };
    const validation = async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    );
    const firstController = new NSEMenuController({ model, runtime: runtime(validation) });
    const secondController = new NSEMenuController({ model: secondModel, runtime: runtime(validation) });
    render(
      <MenuOverlayHarness>
        <NSEMenuBar
          items={[
            { model, controller: firstController },
            { model: secondModel, controller: secondController },
          ]}
          overlay={{ parentResponderId: "editor", idForItem: (item) => `menubar:${item.model.id}` }}
        />
      </MenuOverlayHarness>,
    );
    const [format, view] = screen.getAllByRole("menuitem");
    fireEvent.keyDown(format!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(view);
    fireEvent.keyDown(view!, { key: "ArrowDown" });
    expect(await screen.findByRole("menu", { name: "View" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Toggle Sidebar" })));
  });

  it("propagates a custom appearance through the picker listbox with explicit provenance", async () => {
    const onValueChange = vi.fn();
    render(
      <MenuOverlayHarness>
        <NSEAppearanceProvider appearance={customAppearance}>
          <NSEPicker
            label="Density"
            value="balanced"
            options={[{ value: "balanced", label: "Balanced" }, { value: "compact", label: "Compact" }]}
            onValueChange={onValueChange}
            listboxOverlay={{ id: "density-listbox", parentResponderId: "editor" }}
          />
        </NSEAppearanceProvider>
      </MenuOverlayHarness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /balanced/i }));
    const listbox = await screen.findByRole("listbox");
    expect(listbox.getAttribute("data-nse-overlay-kind")).toBe("listbox");
    expect(listbox.closest(".nse-overlay-popup")?.getAttribute("data-nse-appearance")).toBe("test-custom");
    fireEvent.click(screen.getByRole("option", { name: "Compact" }));
    expect(onValueChange).toHaveBeenCalledWith("compact");
  });

  it("propagates a custom appearance and keeps listbox semantics inside the mobile action sheet", async () => {
    render(
      <MenuOverlayHarness mode="mobile">
        <NSEAppearanceProvider appearance={customAppearance}>
          <NSEPicker
            label="Density"
            value="balanced"
            options={[{ value: "balanced", label: "Balanced" }, { value: "compact", label: "Compact" }]}
            listboxOverlay={{ id: "density-mobile-listbox", parentResponderId: "editor" }}
          />
        </NSEAppearanceProvider>
      </MenuOverlayHarness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /balanced/i }));
    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest(".nse-overlay-popup")?.getAttribute("data-nse-appearance")).toBe("test-custom");
    expect(listbox.closest("[data-nse-overlay-kind]")?.getAttribute("data-nse-overlay-kind")).toBe("action-sheet");
    expect(listbox.closest("[aria-modal]")?.getAttribute("aria-modal")).toBe("true");
  });
});

describe("NSE runtime overlay contracts", () => {
  it("does not silently start picker authority inside an NSE runtime provider", () => {
    expect(() => render(
      <MenuOverlayHarness>
        <NSEPicker label="Runtime density" options={[{ value: "regular", label: "Regular" }]} />
      </MenuOverlayHarness>,
    )).toThrow(/listboxOverlay|provenance|standalone/i);
  });

  it("does not silently start popup authority inside an NSE runtime provider", () => {
    expect(() => render(
      <MenuOverlayHarness>
        <NSEPopup open title="Runtime popup">Content</NSEPopup>
      </MenuOverlayHarness>,
    )).toThrow(/id|parentResponderId|provenance|standalone/i);
  });
});
