import { createTestTheme } from "../../fixtures/themes";
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
import { nseMenuModel } from "../../../src/NSE/Menus/menuTypes";
installNSEScrollIntoViewFixture();
import React, { StrictMode, useMemo, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSEMenuView,
  NSEMenu,
  NSEMenuBar,
  NSEMenuOverlay,
  orderMenuEntries,
  type NSEMenuModel,
  type NSEMenuRuntimePort,
} from "../../../src/NSE/Menus";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { NSEView } from "../../../src/NSE/Views/NSEView";
import { NSEMenuRuntimeProvider } from "../../../src/NSE/Menus/menuRuntimeContext";
import { NSEAppearanceProvider } from "../../../src/NSE/Appearance";
import { NSEPopUpButton, NSEPopup } from "../../../src/NSE/Menus";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

import { NSEMenuOverlayPresentationScope } from "../../../src/NSE/Menus/menuPresentationContext";

const customAppearance = createTestTheme("com.example.test-custom", "Test custom");

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

it("revalidates a visible menu activation after focus changes without dispatching stale presentations", async () => {
  let responderGeneration = 1;
  const validateMany = vi.fn(async (requests: readonly { key: string; commandId: string }[]) => new Map(requests.map(request => [request.key, presentation(request.commandId)])));
  const port = runtime(validateMany);
  port.commands.getPresentationGeneration = () => ({ registryGeneration: 0, responderGeneration });
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
  render(<NSEMenuView model={model} controller={controller} open />);
  const button = await screen.findByRole("menuitem", { name: "Bold" });
  responderGeneration++;
  fireEvent.click(button);
  await waitFor(() => expect(port.commands.dispatch).toHaveBeenCalledTimes(1));
  expect(validateMany.mock.calls.length).toBeGreaterThan(1);
  controller.dispose();
});

it("keeps a pointer activation when focus settles during its revalidation", async () => {
  // A click focuses the row; in a compact sheet the focus scope settles while
  // the activation is being revalidated, moving responder authority once more.
  let responderGeneration = 1;
  const validateMany = vi.fn(async (requests: readonly { key: string; commandId: string }[]) => {
    if (validateMany.mock.calls.length === 2) responderGeneration++;
    return new Map(requests.map(request => [request.key, presentation(request.commandId)]));
  });
  const port = runtime(validateMany);
  port.commands.getPresentationGeneration = () => ({ registryGeneration: 0, responderGeneration });
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
  render(<NSEMenuView model={model} controller={controller} open />);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Bold" }));
  await waitFor(() => expect(port.commands.dispatch).toHaveBeenCalledTimes(1));
  expect(validateMany).toHaveBeenCalledTimes(3);
  controller.dispose();
});

it("closes rather than dispatching when command authority never settles", async () => {
  let responderGeneration = 1;
  const validateMany = vi.fn(async (requests: readonly { key: string; commandId: string }[]) => {
    if (validateMany.mock.calls.length >= 2) responderGeneration++;
    return new Map(requests.map(request => [request.key, presentation(request.commandId)]));
  });
  const port = runtime(validateMany);
  port.commands.getPresentationGeneration = () => ({ registryGeneration: 0, responderGeneration });
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
  render(<NSEMenuView model={model} controller={controller} open />);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Bold" }));
  await waitFor(() => expect(controller.snapshot.open).toBe(false));
  expect(port.commands.dispatch).not.toHaveBeenCalled();
  controller.dispose();
});

it("retains the selected submenu while revalidating its activation", async () => {
  let responderGeneration = 1;
  const validateMany = vi.fn(async (requests: readonly { key: string; commandId: string }[]) => new Map(requests.map(request => [request.key, presentation(request.commandId)])));
  const port = runtime(validateMany);
  port.commands.getPresentationGeneration = () => ({ registryGeneration: 0, responderGeneration });
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
  render(<NSEMenuView model={model} controller={controller} open />);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Alignment" }));
  const item = await screen.findByRole("menuitem", { name: "Align Left" });
  responderGeneration++;
  fireEvent.click(item);
  await waitFor(() => expect(port.commands.dispatch).toHaveBeenCalledWith("text.align", { edge: "left" }, expect.anything()));
  controller.dispose();
});

it("refuses a menu action that becomes disabled during activation revalidation", async () => {
  let enabled = true;
  const validateMany = vi.fn(async (requests: readonly { key: string; commandId: string }[]) => new Map(requests.map(request => [request.key, presentation(request.commandId, { enabled })])));
  const port = runtime(validateMany);
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
  render(<NSEMenuView model={model} controller={controller} open />);
  const item = await screen.findByRole("menuitem", { name: "Bold" });
  enabled = false;
  fireEvent.click(item);
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "Bold" }).getAttribute("aria-disabled")).toBe("true"));
  expect(port.commands.dispatch).not.toHaveBeenCalled();
  controller.dispose();
});

it("does not retarget the displayed menu command to another document's responder", async () => {
  let responderId = "original-document";
  const validateMany = vi.fn(async (requests: readonly { key: string; commandId: string }[]) => new Map(requests.map(request => [request.key, { ...presentation(request.commandId), responderId }])));
  const port = runtime(validateMany);
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
  render(<NSEMenuView model={model} controller={controller} open />);
  const item = await screen.findByRole("menuitem", { name: "Bold" });
  responderId = "other-document";
  fireEvent.click(item);
  await waitFor(() => expect(controller.snapshot.open).toBe(false));
  expect(port.commands.dispatch).not.toHaveBeenCalled();
  controller.dispose();
});

it("does not carry a pending activation into a dismissed and reopened menu", async () => {
  type Request = { key: string; commandId: string };
  let finish!: (value: ReadonlyMap<string, ReturnType<typeof presentation>>) => void;
  let pending: readonly Request[] = [];
  let count = 0;
  const projected = (requests: readonly Request[]) => new Map(requests.map(request => [request.key, presentation(request.commandId)]));
  const validateMany = vi.fn(async (requests: readonly Request[]) => {
    if (++count === 2) { pending = requests; return new Promise<ReadonlyMap<string, ReturnType<typeof presentation>>>(resolve => { finish = resolve; }); }
    return projected(requests);
  });
  const port = runtime(validateMany);
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
  render(<NSEMenuView model={model} controller={controller} open />);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Bold" }));
  await waitFor(() => expect(validateMany).toHaveBeenCalledTimes(2));
  await act(async () => { controller.dismiss("escape"); await controller.open(); });
  const reopened = controller.snapshot.generation;
  await act(async () => { finish(projected(pending)); });
  expect(port.commands.dispatch).not.toHaveBeenCalled();
  expect(controller.snapshot).toMatchObject({ open: true, generation: reopened });
  controller.dispose();
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

it.each(["item menu", "menu bar"])("releases the %s subscriptions after a StrictMode mount", async (surface) => {
  const port = runtime();
  const mainMenu = new NSEMenu({ [nseMenuModel]: { id: "main", label: "Main", entries: [
    { kind: "submenu", id: model.id, label: model.label, entries: model.entries },
  ] }, runtime: port });
  const add = vi.spyOn(port.signal, "addEventListener");
  const remove = vi.spyOn(port.signal, "removeEventListener");
  const held = () => add.mock.calls.filter(([type, listener]) => type === "abort"
    && !remove.mock.calls.some(([removedType, removed]) => removedType === type && removed === listener)).length;
  const before = held();
  try {
    const view = render(
      <StrictMode>
        <MenuOverlayHarness signal={port.signal}>
          {surface === "item menu"
            ? <NSEMenuView label="Format" items={[{ value: "bold", label: "Bold" }]} parentResponderId="editor" />
            : <NSEMenuBar menu={mainMenu} overlay={{ parentResponderId: "editor" }} />}
        </MenuOverlayHarness>
      </StrictMode>,
    );
    expect(held()).toBeGreaterThan(before);
    await act(async () => { view.unmount(); });
    expect(held()).toBe(before);
  } finally {
    mainMenu.dispose();
    add.mockRestore();
    remove.mockRestore();
  }
});

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
  signal,
}: {
  readonly children: React.ReactNode;
  readonly mode?: "desktop" | "mobile";
  readonly onScope?: (options: unknown) => void;
  readonly signal?: AbortSignal;
}) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:menu-tests",
    signal: signal ?? new AbortController().signal,
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
  }), [mode, onScope, signal]);
  return <NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

describe("NSEMenu", () => {
  it("uses explicit item-menu overlay provenance when the host has no default responder", async () => {
    render(
      <MenuOverlayHarness>
        <NSEMenuView
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: runtime(validateMany) });
    const view = render(<NSEMenuView model={model} controller={controller} open />);
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });

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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: port });

    render(<NSEMenuView model={model} controller={controller} open />);
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: runtime(validateMany) });
    render(<React.StrictMode><NSEMenuView model={model} controller={controller} open /></React.StrictMode>);

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
    const controller = new NSEMenu({
      [nseMenuModel]: typeaheadModel,
      runtime: runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId)]),
      ), { scheduler }),
    });
    const rendered = render(<NSEMenuView model={typeaheadModel} controller={controller} open />);
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: runtime(validateMany) });

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
    const controller = new NSEMenu({
      [nseMenuModel]: radioModel,
      runtime: runtime(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
        requests.map((request) => [request.key, presentation(request.commandId, { state: "on" })]),
      )),
    });
    render(<NSEMenuView model={radioModel} controller={controller} open />);
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: runtime(validateMany, { scheduler }) });
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: runtime(validateMany) });
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
    const controller = new NSEMenu({ [nseMenuModel]: model, runtime: runtime(validateMany, { signal: abort.signal }) });
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
    const controller = new NSEMenu({
      [nseMenuModel]: model,
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
    const controller = new NSEMenu({
      [nseMenuModel]: model,
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
      const controller = useMemo(() => new NSEMenu({ [nseMenuModel]: model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness onScope={scope}>
          <NSEPopUpButton pullsDown
            title="Format"
            menu={controller}
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
      const controller = useMemo(() => new NSEMenu({ [nseMenuModel]: model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness>
          <NSEPopUpButton pullsDown title="Format" menu={controller} overlay={{ id: "format-selection", parentResponderId: "editor" }} />
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
      const controller = useMemo(() => new NSEMenu({ [nseMenuModel]: model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness>
          <NSEPopUpButton pullsDown title="Reopen format" menu={controller} overlay={{ id: "format-reopen", parentResponderId: "editor" }} />
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
      const controller = useMemo(() => new NSEMenu({ [nseMenuModel]: model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness mode="mobile">
          <button ref={setAnchor} type="button">Open format</button>
          <NSEMenuOverlay overlay={{ id: "format-mobile", parentResponderId: "editor" }} controller={controller} open anchor={anchor} onOpenChange={() => undefined}>
            <NSEMenuView model={model} controller={controller} open />
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
      const controller = useMemo(() => new NSEMenu({ [nseMenuModel]: model, runtime: menuRuntime }), [menuRuntime]);
      return (
        <MenuOverlayHarness>
          <NSEView menu={controller} menuOverlay={{ id: "canvas-context", parentResponderId: "canvas" }}>
            <span>Canvas</span>
          </NSEView>
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
    const mainMenu = new NSEMenu({ [nseMenuModel]: { id: "main", label: "Main Menu", entries: [
      { kind: "submenu", id: model.id, label: model.label, entries: model.entries },
      { kind: "submenu", id: secondModel.id, label: secondModel.label, entries: secondModel.entries },
    ] }, runtime: runtime(validation) });
    render(
      <MenuOverlayHarness>
        <NSEMenuBar
          menu={mainMenu}
          overlay={{ parentResponderId: "editor", idForMenu: (item) => `menubar:${item.identifier}` }}
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

  it("validates a main menu's items in the window that draws its menu bar", async () => {
    const appLevel = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId, { enabled: false })]),
    ));
    const windowLevel = vi.fn(async (requests: readonly { readonly key: string; readonly commandId: string }[]) => new Map(
      requests.map((request) => [request.key, presentation(request.commandId)]),
    ));
    const mainMenu = new NSEMenu({ [nseMenuModel]: { id: "main", label: "Main Menu", entries: [
      { kind: "submenu", id: "view", label: "View", entries: [{ kind: "command", id: "toggle-sidebar", commandId: "view.toggleSidebar", labelOverride: "Toggle Sidebar" }] },
    ] }, runtime: runtime(appLevel) });
    render(
      <MenuOverlayHarness>
        <NSEMenuRuntimeProvider port={runtime(windowLevel)}>
          <NSEMenuBar menu={mainMenu} overlay={{ parentResponderId: "editor" }} />
        </NSEMenuRuntimeProvider>
      </MenuOverlayHarness>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    const item = await screen.findByRole("menuitem", { name: "Toggle Sidebar" });
    await waitFor(() => expect(item.getAttribute("aria-disabled")).toBeNull());
    expect(windowLevel).toHaveBeenCalled();
    expect(appLevel).not.toHaveBeenCalled();
  });

  it("propagates a custom appearance through the picker listbox with explicit provenance", async () => {
    const onValueChange = vi.fn();
    render(
      <MenuOverlayHarness>
        <NSEAppearanceProvider theme={customAppearance}>
          <NSEPopUpButton
            label="Density"
            value="balanced"
            items={[{ value: "balanced", title: "Balanced" }, { value: "compact", title: "Compact" }]}
            onValueChange={onValueChange}
            overlay={{ id: "density-listbox", parentResponderId: "editor" }}
          />
        </NSEAppearanceProvider>
      </MenuOverlayHarness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /balanced/i }));
    const listbox = await screen.findByRole("listbox");
    expect(listbox.getAttribute("data-nse-overlay-kind")).toBe("listbox");
    // The popup host is the theme root; the surface inside it draws in that theme.
    expect(listbox.closest(".nse-overlay-popup")?.closest("[data-nse-theme]")?.getAttribute("data-nse-theme")).toBe("com.example.test-custom");
    fireEvent.click(screen.getByRole("option", { name: "Compact" }));
    expect(onValueChange).toHaveBeenCalledWith("compact");
  });

  it("propagates a custom appearance and keeps listbox semantics inside the mobile action sheet", async () => {
    render(
      <MenuOverlayHarness mode="mobile">
        <NSEAppearanceProvider theme={customAppearance}>
          <NSEPopUpButton
            label="Density"
            value="balanced"
            items={[{ value: "balanced", title: "Balanced" }, { value: "compact", title: "Compact" }]}
            overlay={{ id: "density-mobile-listbox", parentResponderId: "editor" }}
          />
        </NSEAppearanceProvider>
      </MenuOverlayHarness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /balanced/i }));
    const listbox = await screen.findByRole("listbox");
    // The popup host is the theme root; the surface inside it draws in that theme.
    expect(listbox.closest(".nse-overlay-popup")?.closest("[data-nse-theme]")?.getAttribute("data-nse-theme")).toBe("com.example.test-custom");
    expect(listbox.closest("[data-nse-overlay-kind]")?.getAttribute("data-nse-overlay-kind")).toBe("action-sheet");
    expect(listbox.closest("[aria-modal]")?.getAttribute("aria-modal")).toBe("true");
  });
});

describe("NSE runtime overlay contracts", () => {
  it("draws a native select rather than start pop-up authority without a responder", () => {
    const { container } = render(
      <MenuOverlayHarness>
        <NSEPopUpButton label="Runtime density" items={[{ value: "regular", title: "Regular" }]} />
      </MenuOverlayHarness>,
    );
    expect(container.querySelector("select")?.getAttribute("aria-label")).toBe("Runtime density");
    expect(container.querySelector("[role=listbox]")).toBeNull();
  });

  it("refuses a pull-down button without overlay provenance", () => {
    expect(() => render(
      <MenuOverlayHarness>
        <NSEPopUpButton pullsDown title="Density" items={[{ value: "regular", title: "Regular" }]} />
      </MenuOverlayHarness>,
    )).toThrow(/overlay host/i);
  });

  it("does not silently start popup authority inside an NSE runtime provider", () => {
    expect(() => render(
      <MenuOverlayHarness>
        <NSEPopup open title="Runtime popup">Content</NSEPopup>
      </MenuOverlayHarness>,
    )).toThrow(/id|parentResponderId|provenance|standalone/i);
  });
});


describe("menu presentation readiness", () => {
  function fixture(ready: boolean, controller: NSEMenu, open = true) {
    return <NSEMenuOverlayPresentationScope ready={ready}><NSEMenuView model={model} controller={controller} open={open} /></NSEMenuOverlayPresentationScope>;
  }
  function readyController() {
    return new NSEMenu({ [nseMenuModel]: model, runtime: runtime(async requests => new Map(requests.map(request => [request.key, presentation(request.commandId)]))) });
  }
  it("waits for the popup's visible content commit before initial focus", async () => {
    const controller = readyController();
    const prior = document.createElement("button"); document.body.append(prior); prior.focus();
    const view = render(fixture(false, controller));
    await screen.findByRole("menuitem", { name: "Bold" });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Bold" }).tabIndex).toBe(0));
    expect(document.activeElement).toBe(prior);
    view.rerender(fixture(true, controller));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bold" })));
  });
  it("does not steal an intervening focus choice when content becomes ready", async () => {
    const controller = readyController();
    const prior = document.createElement("button"), next = document.createElement("button"); document.body.append(prior, next); prior.focus();
    const view = render(fixture(false, controller));
    await screen.findByRole("menuitem", { name: "Bold" });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Bold" }).tabIndex).toBe(0));
    next.focus();
    view.rerender(fixture(true, controller));
    expect(document.activeElement).toBe(next);
  });
  it("retires a pending focus on close and focuses a fresh reopening", async () => {
    const controller = readyController();
    const prior = document.createElement("button"); document.body.append(prior); prior.focus();
    const view = render(fixture(false, controller));
    await screen.findByRole("menuitem", { name: "Bold" });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Bold" }).tabIndex).toBe(0));
    view.rerender(fixture(true, controller, false));
    expect(document.activeElement).toBe(prior);
    view.rerender(fixture(true, controller));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Bold" })));
  });
});


it("keeps a validating popup inert and measurable, then publishes focusable content", async () => {
  let finish!: () => void;
  const held = new Promise<void>(resolve => { finish = resolve; });
  const controller = new NSEMenu({ [nseMenuModel]: model, runtime: runtime(async requests => { await held; return new Map(requests.map(request => [request.key, presentation(request.commandId)])); }) });
  function Fixture() {
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    return <MenuOverlayHarness><button ref={setAnchor}>Generated trigger</button><NSEMenuOverlay overlay={{ id: 'pending-observed', parentResponderId: 'editor' }} controller={controller} open anchor={anchor} onOpenChange={() => undefined}><NSEMenuView model={model} controller={controller} open /></NSEMenuOverlay></MenuOverlayHarness>;
  }
  render(<Fixture />);
  const popup = await waitFor(() => { const e = document.querySelector('[data-nse-content-pending=true]'); expect(e).not.toBeNull(); return e!; });
  expect(popup.hasAttribute('inert')).toBe(true);
  await act(async () => { finish(); await held; });
  const item = await screen.findByRole('menuitem', { name: 'Bold' });
  await waitFor(() => expect(document.activeElement).toBe(item));
  expect(popup.hasAttribute('inert')).toBe(false);
  expect(popup.hasAttribute('data-nse-content-pending')).toBe(false);
});
