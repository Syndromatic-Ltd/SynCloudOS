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

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WindowContentRendererRegistry, WindowLayer } from "../../src/Webspring/WindowLayer";
import { WindowChromeSlotContext } from "../../src/Webspring/WindowLayer/windowChromeSlotContext";
import { createWindowLayerFixture } from "../fixtures/windowLayerFixture";
import { standardWindow } from "../fixtures/windowTestDependencies";
import { NSEStandardWindowView } from "../../src/NSE/Windows";
import { readFileSync } from "node:fs";
import type { SynCloudOSRuntime, WindowManager } from "../../src/SynCloudOS/SynCloudOS";
import { createWindowTestDependencies, panelWindow } from "../fixtures/windowTestDependencies";

const windowCSS = readFileSync("src/NSE/Windows/nse-windows.css", "utf8");

describe("Webspring WindowLayer", () => {
  it("renders independent hosts and orders renderer teardown after the React commit", async () => {
    const fixture = await createWindowLayerFixture({
      windows: [
        { id: "diagnostics-a", role: "standard", title: "Diagnostics A" },
        { id: "diagnostics-b", role: "standard", title: "Diagnostics B" },
      ],
    });
    const teardownController = fixture.manager.create(standardWindow("renderer-teardown", { title: "Renderer teardown" }));
    await fixture.manager.open(teardownController.id);
    const teardownRegistration = fixture.contentRegistry.register(teardownController.contentState.mountKey, () => (
      <span>renderer teardown content</span>
    ));

    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
      </SynCloudOSProvider>,
    );

    expect(screen.getByRole("dialog", { name: "Diagnostics A" })).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Diagnostics B" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /^Close Diagnostics/ })).toHaveLength(2);
    expect(screen.getByText("content:diagnostics-a")).not.toBeNull();
    expect(screen.getByText("content:diagnostics-b")).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Renderer teardown" })).not.toBeNull();

    const registry = new WindowContentRendererRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const registration = registry.register("application:fixture", () => null);
    listener.mockClear();
    registration.dispose();
    teardownRegistration.dispose();
    expect(registry.has("application:fixture")).toBe(false);
    expect(registry.revision).toBe(2);
    expect(listener).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Renderer teardown" })).toBeNull();
    unsubscribe();
    await fixture.cleanup();
  });

  it("makes a parent inert while its attached sheet is mounted", async () => {
    const fixture = await createWindowLayerFixture({ attachedSheet: true });

    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
      </SynCloudOSProvider>,
    );

    const parent = document.querySelector<HTMLElement>('[data-window-id="memo"]')!;
    const parentHost = parent.closest<HTMLElement>("[data-window-host]")!;
    expect(parent.hasAttribute("inert")).toBe(true);
    expect(parentHost.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Save changes?" }).getAttribute("aria-modal")).toBe("true");
    expect(document.querySelectorAll("[data-window-modal-backdrop]")).toHaveLength(1);
    await act(() => fixture.manager.requestClose("save-sheet", { reason: "command" }));
    expect(parent.hasAttribute("inert")).toBe(false);
    expect(parentHost.hasAttribute("aria-hidden")).toBe(false);
    await fixture.cleanup();
  });

  it("uses direct indexed parent selection instead of enumerating the registry", async () => {
    const fixture = await createWindowLayerFixture({ attachedSheet: true });
    const list = vi.spyOn(fixture.manager, "list");

    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} />
      </SynCloudOSProvider>,
    );

    expect(list).not.toHaveBeenCalled();
    await fixture.cleanup();
  });

  it("dismisses an unpinned popover from production outside-pointer and anchor-removal signals", async () => {
    const fixture = await createWindowLayerFixture({ transientPopover: true });
    const dismiss = vi.spyOn(fixture.manager, "dismissTransientWindows");

    const first = render(
      <div data-syncloudos-runtime-owner={fixture.runtime.runtimeId}>
        <button id="transient-anchor">Anchor</button>
        <SynCloudOSProvider runtime={fixture.runtime}>
          <WindowLayer contentRegistry={fixture.contentRegistry} />
        </SynCloudOSProvider>
      </div>,
    );
    fireEvent.pointerDown(first.container.firstElementChild!);
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith({ reason: "outside-pointer" }));

    const secondFixture = await createWindowLayerFixture({ transientPopover: true });
    const anchorDismiss = vi.spyOn(secondFixture.manager, "dismissTransientWindows");
    const second = render(
      <div data-syncloudos-runtime-owner={secondFixture.runtime.runtimeId}>
        <button id="transient-anchor">Anchor</button>
        <SynCloudOSProvider runtime={secondFixture.runtime}>
          <WindowLayer contentRegistry={secondFixture.contentRegistry} />
        </SynCloudOSProvider>
      </div>,
    );
    second.container.querySelector("button")!.remove();
    await waitFor(() => expect(anchorDismiss).toHaveBeenCalledWith({ reason: "anchor-removed" }));
    await fixture.cleanup();
    await secondFixture.cleanup();
  });

  it("qualifies duplicate anchor IDs and pointer dismissal to the owning runtime root", async () => {
    const firstFixture = await createWindowLayerFixture({ transientPopover: true });
    const secondFixture = await createWindowLayerFixture({ transientPopover: true });
    const firstDismiss = vi.spyOn(firstFixture.manager, "dismissTransientWindows");
    const secondDismiss = vi.spyOn(secondFixture.manager, "dismissTransientWindows");
    const view = render(
      <>
        <div data-testid="first-owner" data-syncloudos-runtime-owner={firstFixture.runtime.runtimeId}>
          <button id="transient-anchor">First anchor</button>
          <SynCloudOSProvider runtime={firstFixture.runtime}>
            <WindowLayer contentRegistry={firstFixture.contentRegistry} />
          </SynCloudOSProvider>
        </div>
        <div data-testid="second-owner" data-syncloudos-runtime-owner={secondFixture.runtime.runtimeId}>
          <button id="transient-anchor">Second anchor</button>
          <SynCloudOSProvider runtime={secondFixture.runtime}>
            <WindowLayer contentRegistry={secondFixture.contentRegistry} />
          </SynCloudOSProvider>
        </div>
      </>,
    );

    screen.getByText("First anchor").remove();
    await waitFor(() => expect(firstDismiss).toHaveBeenCalledWith({ reason: "anchor-removed" }));
    expect(secondDismiss).not.toHaveBeenCalled();
    firstDismiss.mockClear();
    fireEvent.pointerDown(screen.getByTestId("first-owner"));
    await waitFor(() => expect(firstDismiss).toHaveBeenCalledWith({ reason: "outside-pointer" }));
    expect(secondDismiss).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll("#transient-anchor")).toHaveLength(1);
    await firstFixture.cleanup();
    await secondFixture.cleanup();
  });

  it("does not let an outer runtime observe pointer or anchor mutations owned by a nested runtime", async () => {
    const outerFixture = await createWindowLayerFixture({ transientPopover: true });
    const nestedFixture = await createWindowLayerFixture({ transientPopover: true });
    const outerDismiss = vi.spyOn(outerFixture.manager, "dismissTransientWindows");
    const nestedDismiss = vi.spyOn(nestedFixture.manager, "dismissTransientWindows");
    render(
      <div data-testid="outer-runtime" data-syncloudos-runtime-owner={outerFixture.runtime.runtimeId}>
        <button id="transient-anchor">Outer anchor</button>
        <SynCloudOSProvider runtime={outerFixture.runtime}>
          <WindowLayer contentRegistry={outerFixture.contentRegistry} />
        </SynCloudOSProvider>
        <div data-testid="nested-runtime" data-syncloudos-runtime-owner={nestedFixture.runtime.runtimeId}>
          <button id="transient-anchor">Nested anchor</button>
          <SynCloudOSProvider runtime={nestedFixture.runtime}>
            <WindowLayer contentRegistry={nestedFixture.contentRegistry} />
          </SynCloudOSProvider>
        </div>
      </div>,
    );

    screen.getByText("Nested anchor").remove();
    await waitFor(() => expect(nestedDismiss).toHaveBeenCalledWith({ reason: "anchor-removed" }));
    expect(outerDismiss).not.toHaveBeenCalled();
    nestedDismiss.mockClear();
    fireEvent.pointerDown(screen.getByTestId("nested-runtime"));
    await waitFor(() => expect(nestedDismiss).toHaveBeenCalledWith({ reason: "outside-pointer" }));
    expect(outerDismiss).not.toHaveBeenCalled();
    await outerFixture.cleanup();
    await nestedFixture.cleanup();
  });

  it("treats nested ownership markers carrying the same runtime ID as locally owned", async () => {
    const fixture = await createWindowLayerFixture({ transientPopover: true });
    const dismiss = vi.spyOn(fixture.manager, "dismissTransientWindows");
    render(
      <div data-testid="same-runtime-root" data-syncloudos-runtime-owner={fixture.runtime.runtimeId}>
        <div data-testid="same-runtime-marker" data-syncloudos-runtime-owner={fixture.runtime.runtimeId}>
          <button id="transient-anchor">Nested local anchor</button>
        </div>
        <SynCloudOSProvider runtime={fixture.runtime}>
          <WindowLayer contentRegistry={fixture.contentRegistry} />
        </SynCloudOSProvider>
      </div>,
    );

    fireEvent.pointerDown(screen.getByTestId("same-runtime-marker"));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith({ reason: "outside-pointer" }));
    dismiss.mockClear();
    const marker = screen.getByTestId("same-runtime-marker");
    await act(async () => {
      marker.append(document.createElement("span"));
      await Promise.resolve();
    });
    expect(dismiss).not.toHaveBeenCalledWith({ reason: "anchor-removed" });
    await fixture.cleanup();
  });

  it("omits opening, unloaded, minimised, hidden and invalid-geometry hosts", async () => {
    const fixture = await createWindowLayerFixture({ includeNonRenderable: true });

    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
      </SynCloudOSProvider>,
    );

    const loaded = screen.getByRole("dialog", { name: "loaded" });
    const host = loaded.closest<HTMLElement>("[data-window-host]");
    expect(host?.style.position).toBe("absolute");
    expect(host?.style.left).toBe("80px");
    expect(host?.style.top).toBe("60px");
    expect(host?.style.width).toBe("720px");
    expect(host?.style.height).toBe("520px");
    expect(screen.queryByText("content:opening")).toBeNull();
    expect(screen.queryByText("content:unloaded")).toBeNull();
    expect(screen.queryByText("content:minimised")).toBeNull();
    expect(screen.queryByText("content:hidden")).toBeNull();
    for (const id of ["invalid-nan", "invalid-infinite", "invalid-negative"]) {
      expect(screen.queryByText(`content:${id}`)).toBeNull();
      expect(fixture.diagnostics).toContainEqual(expect.objectContaining({ windowControllerId: id }));
    }
    await fixture.cleanup();
  });


  it("renders system chrome and shadow without minting a second appearance identity", async () => {
    const fixture = await createWindowLayerFixture({
      windows: [{ id: "system-window", role: "standard", title: "System chrome" }],
    });
    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
      </SynCloudOSProvider>,
    );

    const section = screen.getByRole("dialog", { name: "System chrome" });
    expect(section.getAttribute("data-window-chrome-mode")).toBe("system");
    expect(section.hasAttribute("data-window-chrome-appearance")).toBe(false);
    expect(section.querySelector(".nse-window__titlebar")).not.toBeNull();
    expect(section.querySelector('[data-nse-nine-slice="window-shadow"]')?.getAttribute("data-window-shadow-layer")).toBe("window.standard.shadow");
    await fixture.cleanup();
  });
  // The registry invokes factories during the host render, so hooks live in
  // a mounted child element — never in the factory itself.
  function ChromeReadyReporter() {
    const slot = React.useContext(WindowChromeSlotContext);
    React.useEffect(() => { slot?.reportChromeReady(); }, [slot]);
    return null;
  }

  it("suppresses system chrome paint once the mounted chrome reports ready", async () => {
    const fixture = await createWindowLayerFixture();
    const custom = fixture.manager.create(standardWindow("custom-window", {
      title: "Custom chrome",
      chromeMode: "custom",
      smoothSurface: "off",
    }));
    await fixture.manager.open(custom.id);
    // The mounted application reports a live chrome renderer through the
    // host-provided slot context; only that handshake suppresses system
    // chrome (chromeMode alone never blanks the bar).
    fixture.contentRegistry.register(custom.contentState.mountKey, ({ window }) => (
      <>
        <ChromeReadyReporter />
        <span data-window-content-id={window.id}>content:{window.id}</span>
      </>
    ));
    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
      </SynCloudOSProvider>,
    );

    // Bar-less chrome renders no labelled title element, so query the host.
    await waitFor(() => {
      const section = document.querySelector<HTMLElement>('[data-window-host="custom-window"] .nse-window-view');
      expect(section?.getAttribute("data-window-chrome-appearance")).toBeNull();
    });
    const section = document.querySelector<HTMLElement>('[data-window-host="custom-window"] .nse-window-view');
    expect(section?.getAttribute("data-window-chrome-mode")).toBe("custom");
    expect(section?.querySelector(".nse-window__titlebar")).toBeNull();
    expect(section?.querySelector('[data-nse-nine-slice="window-shadow"]')).toBeNull();
    await fixture.cleanup();
  });

  it("holds a declared-custom window on system chrome until chrome reports ready", async () => {
    const fixture = await createWindowLayerFixture();
    const custom = fixture.manager.create(standardWindow("custom-pending-window", {
      title: "Custom pending",
      chromeMode: "custom",
      smoothSurface: "off",
    }));
    await fixture.manager.open(custom.id);
    fixture.contentRegistry.register(custom.contentState.mountKey, ({ window }) => (
      <span data-window-content-id={window.id}>content:{window.id}</span>
    ));
    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
      </SynCloudOSProvider>,
    );

    const section = document.querySelector<HTMLElement>('[data-window-host="custom-pending-window"] .nse-window-view');
    expect(section?.getAttribute("data-window-chrome-mode")).toBe("custom");
    expect(section?.hasAttribute("data-window-chrome-appearance")).toBe(false);
    expect(section?.querySelector(".nse-window__titlebar")).not.toBeNull();
    await fixture.cleanup();
  });

  it("renders neither theme paint nor shadow for frameless windows", async () => {
    const fixture = await createWindowLayerFixture();
    const frameless = fixture.manager.create(standardWindow("frameless-window", {
      title: "Frameless",
      chromeMode: "frameless",
      smoothSurface: "off",
    }));
    await fixture.manager.open(frameless.id);
    fixture.contentRegistry.register(frameless.contentState.mountKey, ({ window }) => (
      <span data-window-content-id={window.id}>content:{window.id}</span>
    ));
    render(
      <SynCloudOSProvider runtime={fixture.runtime}>
        <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
      </SynCloudOSProvider>,
    );
    // Bar-less chrome renders no labelled title element, so query the host.
    const section = document.querySelector<HTMLElement>('[data-window-host="frameless-window"] .nse-window-view');
    expect(section.getAttribute("data-window-chrome-mode")).toBe("frameless");
    expect(section.getAttribute("data-window-chrome-appearance")).toBeNull();
    expect(section.querySelector(".nse-window__titlebar")).toBeNull();
    expect(section.querySelector('[data-nse-nine-slice="window-shadow"]')).toBeNull();
    await fixture.cleanup();
  });

  it("falls back to system chrome when custom chrome is unavailable", () => {
    const request = standardWindow("fallback-window", { title: "Fallback", chromeMode: "custom" });
    const record = {
      ...request,
      id: "fallback-window",
      runtimeId: "runtime:fallback" as const,
      state: "open",
      isKey: true,
      isMain: true,
      zIndex: 2,
    } as React.ComponentProps<typeof NSEStandardWindowView>["record"];
    const presentation = {
      kind: "desktop-window",
      visible: true,
      bounds: record.bounds,
      safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
      movable: true,
      resizable: false,
      titleBarVisible: true,
    } as React.ComponentProps<typeof NSEStandardWindowView>["presentation"];
    const { container } = render(
      <NSEStandardWindowView
        record={record}
        presentation={presentation}
        blocked={false}
        dirty={false}
        customChromeActive={false}
        dispatchCommand={() => Promise.resolve(null)}
      >
        <p>content</p>
      </NSEStandardWindowView>,
    );
    const section = container.querySelector('[data-window-chrome-mode="custom"]');
    expect(section?.hasAttribute("data-window-chrome-appearance")).toBe(false);
    expect(section?.querySelector(".nse-window__titlebar")).not.toBeNull();
    expect(section?.querySelector('[data-nse-nine-slice="window-shadow"]')).not.toBeNull();
  });

  it("keeps theme paint and the custom shadow off application content (source contract)", () => {
    // The custom-chrome surface rules key on the host-resolved active flag —
    // chromeMode alone never blanks the bar, so the mode attribute must not
    // suppress paint by itself.
    expect(windowCSS).toMatch(/\.nse-window-view\[data-window-custom-chrome-active="true"\]/);
    expect(windowCSS).toMatch(/\.nse-window-view\[data-window-custom-chrome-active="true"\]\[data-window-key="true"\]/);
    // Drop-shadow is on the unclipped view: clip-path on the surface would
    // eat a surface filter. Pending custom chrome must not stack a second
    // bar: the slot is display none until the handshake flips the active flag.
    expect(windowCSS).toMatch(/\.nse-window-view\[data-window-custom-chrome-active="true"\]\s*\{[^}]*filter:\s*drop-shadow/);
    expect(windowCSS).not.toMatch(/\[data-window-custom-chrome-active="true"\] \.nse-window__surface\s*\{[^}]*filter:/);
    expect(windowCSS).toMatch(/\.nse-window__custom-titlebar\s*\{[^}]*display:\s*none/);
    expect(windowCSS).toMatch(/\[data-window-custom-chrome-active="true"\] \.nse-window__custom-titlebar\s*\{[^}]*display:\s*block/);
    // Reduced motion suppresses the key-state shadow transition.
    const reducedMotion = windowCSS.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/);
    expect(reducedMotion?.[0]).toMatch(/\.nse-window-view/);
  });
});

interface ClickToFrontFixture {
  readonly runtime: SynCloudOSRuntime;
  readonly manager: WindowManager;
  readonly contentRegistry: WindowContentRendererRegistry;
  readonly reportDiagnostic: (diagnostic: unknown) => void;
  readonly cleanup: () => Promise<void>;
}

function registerClickToFrontContent(fixture: ClickToFrontFixture, windowControllerId: string): void {
  const state = fixture.manager.select(windowControllerId).contentState;
  if (state.status !== "loaded") throw new Error(`Content for "${windowControllerId}" is not loaded.`);
  fixture.contentRegistry.register(state.mountKey, ({ window }) => (
    <span data-window-content-id={window.id}>content:{window.id}</span>
  ));
}

function renderClickToFrontLayer(fixture: ClickToFrontFixture): void {
  render(
    <SynCloudOSProvider runtime={fixture.runtime}>
      <WindowLayer contentRegistry={fixture.contentRegistry} onDiagnostic={fixture.reportDiagnostic} />
    </SynCloudOSProvider>,
  );
}

describe("Webspring WindowLayer click-to-front and level ordering", () => {
  it("raises a background window when its titlebar or content is pressed", async () => {
    const fixture = await createWindowLayerFixture({ windows: [
      { id: "alpha", role: "standard", title: "Alpha" },
      { id: "beta", role: "standard", title: "Beta" },
    ] });
    renderClickToFrontLayer(fixture);
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe("beta");
    fireEvent.pointerDown(screen.getByText("content:alpha"));
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe("alpha");
    expect(fixture.manager.select("alpha").record.zIndex).toBeGreaterThan(fixture.manager.select("beta").record.zIndex);
    fixture.manager.makeKey("beta");
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "Alpha" }));
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe("alpha");
    await fixture.cleanup();
  });

  it("does not hand key status to a window blocked by an attached sheet", async () => {
    const fixture = await createWindowLayerFixture({ attachedSheet: true });
    renderClickToFrontLayer(fixture);
    fireEvent.pointerDown(screen.getByText("content:memo"));
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe("save-sheet");
    expect(fixture.manager.select("memo").record.zIndex).toBeLessThan(fixture.manager.select("save-sheet").record.zIndex);
    await fixture.cleanup();
  });

  it("keeps a floating panel above a newly keyed standard window", async () => {
    const fixture = await createWindowLayerFixture();
    const main = fixture.manager.create(standardWindow("main-window", { title: "Main" }));
    await fixture.manager.open(main.id);
    registerClickToFrontContent(fixture, main.id);
    const inspector = fixture.manager.create(panelWindow("inspector", { title: "Inspector" }));
    await fixture.manager.open(inspector.id);
    registerClickToFrontContent(fixture, inspector.id);
    renderClickToFrontLayer(fixture);
    fireEvent.pointerDown(screen.getByText("content:main-window"));
    expect(fixture.manager.snapshot().keyWindowControllerId).toBe("main-window");
    expect(fixture.manager.select("inspector").record.zIndex).toBeGreaterThan(fixture.manager.select("main-window").record.zIndex);
    await fixture.cleanup();
  });

  it("does not raise a background document window when the application stage is opened", async () => {
    const harness = createWindowTestDependencies({ id: "runtime:app-enter-stack" });
    try {
      await harness.createDocument("note-back");
      await harness.createDocument("note-front");
      const back = harness.manager.create(standardWindow("note-back", { documentId: "note-back", documentAssociationRole: "secondary" }));
      const front = harness.manager.create(standardWindow("note-front", { documentId: "note-front", documentAssociationRole: "secondary" }));
      await harness.manager.open(back.id);
      await harness.manager.open(front.id);
      expect(await harness.manager.openApplicationWindow("com.syndromatic.Notes")).toBeNull();
      expect(harness.manager.select("note-back").record.zIndex).toBeLessThan(harness.manager.select("note-front").record.zIndex);
      expect(harness.manager.snapshot().keyWindowControllerId).toBe("note-front");
    } finally {
      await harness.cleanup();
    }
  });
});
