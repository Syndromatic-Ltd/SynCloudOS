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

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WindowPresentation, WindowRecord } from "../../src/SynCloudOS/Windows";
import { NSEStandardWindowView } from "../../src/NSE/Windows";
import { standardWindow } from "../fixtures/windowTestDependencies";

const windowCSS = readFileSync("src/NSE/Windows/nse-windows.css", "utf8");
afterEach(cleanup);

function standardWindowViewProps(overrides: Partial<WindowRecord> = {}) {
  const request = standardWindow("window-1", { title: "Diagnostics" });
  const record = {
    ...request,
    id: "window-1",
    runtimeId: "runtime:nse-window-test" as WindowRecord["runtimeId"],
    state: "open",
    isKey: true,
    isMain: true,
    zIndex: 4,
    ...overrides,
  } as WindowRecord;
  const presentation: WindowPresentation = {
    kind: "desktop-window",
    visible: true,
    bounds: record.bounds,
    safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    movable: true,
    resizable: true,
    titleBarVisible: true,
  };
  return {
    record,
    presentation,
    blocked: false,
    dirty: false,
    dispatchCommand: vi.fn().mockResolvedValue({ handled: true }),
  };
}

describe("NSEStandardWindowView", () => {
  it("renders real labelled controls and keeps Webspring return separate", () => {
    const props = standardWindowViewProps();
    render(
      <NSEStandardWindowView {...props}>
        <p>Diagnostics content</p>
      </NSEStandardWindowView>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close Diagnostics" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimise Diagnostics" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom Diagnostics" }));

    expect(props.dispatchCommand).toHaveBeenNthCalledWith(1, "window.close", { windowControllerId: "window-1" });
    expect(props.dispatchCommand).toHaveBeenNthCalledWith(2, "window.minimise", { windowControllerId: "window-1" });
    expect(props.dispatchCommand).toHaveBeenNthCalledWith(3, "window.zoom", { windowControllerId: "window-1" });
    expect(screen.queryByRole("button", { name: /return to Webspring/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "Diagnostics" }).hasAttribute("data-window-title")).toBe(true);
    expect(screen.getByText("Diagnostics content").textContent).toBe("Diagnostics content");
  });

  it("emits the complete root semantic contract and native blocked state", () => {
    const props = standardWindowViewProps({ isKey: false, isMain: true, level: "floating" });
    render(
      <NSEStandardWindowView {...props} blocked dirty>
        <p>Content</p>
      </NSEStandardWindowView>,
    );

    const dialog = screen.getByRole("dialog", { name: "Diagnostics", hidden: true });
    expect(dialog.getAttribute("data-window-id")).toBe("window-1");
    expect(dialog.getAttribute("data-window-role")).toBe("standard");
    expect(dialog.getAttribute("data-window-state")).toBe("open");
    expect(dialog.getAttribute("data-window-key")).toBe("false");
    expect(dialog.getAttribute("data-window-main")).toBe("true");
    expect(dialog.getAttribute("data-window-dirty")).toBe("true");
    expect(dialog.getAttribute("data-window-presentation")).toBe("desktop-window");
    expect(dialog.getAttribute("data-window-level")).toBe("floating");
    expect(dialog.getAttribute("data-window-blocked")).toBe("true");
    expect(dialog.getAttribute("data-window-appearance-recipe")).toBe("window.standard.frame");
    expect(dialog.getAttribute("aria-labelledby")).toBe("window-1-title");
    expect(dialog.hasAttribute("inert")).toBe(true);
    expect(dialog.style.left).toBe("0px");
    expect(dialog.style.top).toBe("0px");
    expect(dialog.style.width).toBe("100%");
    expect(dialog.style.height).toBe("100%");
  });

  it("publishes inactive, unsaved and highlighted control recipes without replacing controls", () => {
    const props = standardWindowViewProps({ isKey: false });
    render(<NSEStandardWindowView {...props} dirty><p>Content</p></NSEStandardWindowView>);
    const close = screen.getByRole("button", { name: "Close Diagnostics" });

    expect(close.getAttribute("data-window-control")).toBe("close");
    expect(close.getAttribute("data-window-control-state")).toBe("unsaved-inactive");
    expect(close.getAttribute("data-window-appearance-recipe")).toBe("window.standard.close.unsaved-inactive");
    fireEvent.pointerEnter(close);
    expect(close.getAttribute("data-window-control-state")).toBe("unsaved-highlighted");
    expect(close.getAttribute("data-window-appearance-recipe")).toBe("window.standard.close.unsaved-highlighted");
    fireEvent.pointerLeave(close);
    expect(close.getAttribute("data-window-control-state")).toBe("unsaved-inactive");
  });

  it("renders only desktop resize handles supplied by the canonical gesture layer", () => {
    const props = standardWindowViewProps();
    const onPointerDown = vi.fn();
    const { container, rerender } = render(
      <NSEStandardWindowView
        {...props}
        resizeHandleProps={{ "block-end-inline-end": { onPointerDown } }}
      >
        <p>Content</p>
      </NSEStandardWindowView>,
    );
    const handle = container.querySelector('[data-window-resize-edge="block-end-inline-end"]');
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle!);
    expect(onPointerDown).toHaveBeenCalledTimes(1);

    rerender(
      <NSEStandardWindowView
        {...props}
        presentation={{ ...props.presentation, kind: "mobile-fullscreen", resizable: false }}
        resizeHandleProps={{ "block-end-inline-end": { onPointerDown } }}
      >
        <p>Content</p>
      </NSEStandardWindowView>,
    );
    expect(container.querySelector("[data-window-resize-edge]")).toBeNull();
  });

  it("keeps system titlebar chrome text non-selectable", () => {
    for (const selector of [".nse-window__titlebar", ".nse-window__title", ".nse-window__hud-titlebar", ".nse-window__hud-title"]) {
      const block = windowCSS.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*\\}`));
      expect(block, `missing CSS block for ${selector}`).not.toBeNull();
      expect(block![0]).toMatch(/user-select:\s*none/);
    }
  });
  it("paints system chrome when customChromeActive is omitted even if chromeMode is custom", () => {
    const props = standardWindowViewProps({ chromeMode: "custom" });
    const { container } = render(<NSEStandardWindowView {...props}><p>Content</p></NSEStandardWindowView>);
    const section = container.querySelector(".nse-window-view");
    expect(section?.getAttribute("data-window-chrome-mode")).toBe("custom");
    expect(section?.getAttribute("data-window-custom-chrome-active")).toBe("false");
    expect(section?.hasAttribute("data-window-chrome-appearance")).toBe(false);
    expect(section?.querySelector(".nse-window__titlebar")).not.toBeNull();
  });

  it("keeps concrete appearance identity on the surrounding NSE appearance boundary", () => {
    const props = standardWindowViewProps();
    const { container } = render(<NSEStandardWindowView {...props}><p>Content</p></NSEStandardWindowView>);
    expect(container.querySelector(".nse-window-view")?.hasAttribute("data-window-chrome-appearance")).toBe(false);
    expect(container.querySelector(".nse-window__titlebar")).not.toBeNull();
  });

  it("measures a surface that appears after a closed render and clears clipping when disabled", async () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 320 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 220 });
    try {
      const closed = standardWindowViewProps({ state: "closed", smoothSurface: { radius: 12 } });
      const { container, rerender } = render(<NSEStandardWindowView {...closed}><p>Content</p></NSEStandardWindowView>);
      expect(container.querySelector(".nse-window__surface")).toBeNull();
      const opened = standardWindowViewProps({ state: "open", smoothSurface: { radius: 12 } });
      rerender(<NSEStandardWindowView {...opened}><p>Content</p></NSEStandardWindowView>);
      await waitFor(() => expect(container.querySelector<HTMLElement>(".nse-window__surface")?.dataset.nseSmoothSurfaceState).toBe("ready"));
      const surface = container.querySelector<HTMLElement>(".nse-window__surface")!;
      expect(surface.style.clipPath).toContain("path(");
      const disabled = standardWindowViewProps({ state: "open", smoothSurface: "off" });
      rerender(<NSEStandardWindowView {...disabled}><p>Content</p></NSEStandardWindowView>);
      await waitFor(() => expect(surface.hasAttribute("data-nse-smooth-surface-state")).toBe(false));
      expect(surface.style.clipPath).toBe("");
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).offsetWidth;
      if (height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).offsetHeight;
    }
  });

  it("keeps the previous SmoothSurface clip active while changed geometry waits for the next frame", () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    const scheduled: FrameRequestCallback[] = [];
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduled.push(callback);
      return scheduled.length;
    });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 320 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 220 });

    try {
      const first = standardWindowViewProps({ smoothSurface: { radius: 6 } });
      const { container, rerender } = render(<NSEStandardWindowView {...first}><p>Content</p></NSEStandardWindowView>);
      const surface = container.querySelector<HTMLElement>(".nse-window__surface")!;
      expect(scheduled).toHaveLength(1);
      act(() => scheduled.shift()!(0));
      const firstClip = surface.style.clipPath;
      expect(firstClip).toContain("path(");

      const changed = standardWindowViewProps({ smoothSurface: { radius: 18 } });
      rerender(<NSEStandardWindowView {...changed}><p>Content</p></NSEStandardWindowView>);

      expect(surface.style.clipPath).toBe(firstClip);
      expect(surface.dataset.nseSmoothSurfaceState).toBe("pending");
      expect(scheduled).toHaveLength(1);
      act(() => scheduled.shift()!(16));
      expect(surface.style.clipPath).toContain("path(");
      expect(surface.style.clipPath).not.toBe(firstClip);
    } finally {
      requestFrame.mockRestore();
      cancelFrame.mockRestore();
      if (width) Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).offsetWidth;
      if (height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).offsetHeight;
    }
  });
});
