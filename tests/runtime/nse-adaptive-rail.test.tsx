// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSESplitViewController, NSESplitViewItem } from "../../src/NSE/DataViews/Split";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";
import { tabViewController, renderTabController, updateTraits, TestContentViewController } from "../fixtures/tabViewController";

afterEach(cleanup);
const traits = (width: number, height: number) => createStaticPresentationTraits({ width, height });
const renderer = (container: HTMLElement) => container.querySelector("[data-navigation-renderer]")?.getAttribute("data-navigation-renderer");

describe("sidebar-adaptable tab navigation", () => {
  it.each([
    [382,580,"tabs"],[463,280,"tabs"],[464,280,"rail"],[594,368,"rail"],[669,867,"tabs"],
    [768,481,"source-list-content"],[768,480,"rail"],[480,480,"tabs"],[1000,180,"rail"],
  ])("selects content geometry %ix%i as %s", (width, height, expected) => {
    const controller = tabViewController({});
    const view = renderTabController(controller, { ...traits(width, height), horizontalSizeClass: "wide", hostViewportBounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    expect(renderer(view.container)).toBe(expected);
    controller.dispose();
  });

  it("measures its untransformed allocation on a larger host and retains it while hidden", () => {
    let widthValue = 594, heightValue = 368;
    let resize: (() => void) | undefined;
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("nse-adaptive-tab-controller") ? widthValue : 0; });
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) { return this.classList.contains("nse-adaptive-tab-controller") ? heightValue : 0; });
    vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
    const controller = tabViewController({});
    try {
      const view = renderTabController(controller, traits(1440, 900));
      expect(renderer(view.container)).toBe("rail");
      widthValue = 0; heightValue = 0;
      act(() => resize?.());
      expect(renderer(view.container)).toBe("rail");
    } finally { controller.dispose(); width.mockRestore(); height.mockRestore(); vi.unstubAllGlobals(); }
  });

  it("retains a current renderer through untrusted geometry and starts unavailable peers as tabs", () => {
    const controller = tabViewController({});
    const view = renderTabController(controller, { ...traits(1200,800), geometryState: "unavailable" });
    expect(renderer(view.container)).toBe("tabs");
    updateTraits(controller, traits(594,368));
    expect(renderer(view.container)).toBe("rail");
    updateTraits(controller, { ...traits(1200,800), geometryState: "retained" });
    expect(renderer(view.container)).toBe("rail");
    updateTraits(controller, traits(1200,800));
    expect(renderer(view.container)).toBe("source-list-content");
    controller.dispose();
  });

  it("keeps fixed bottom tabs and hierarchy split semantics on short rectangles", () => {
    const tabs = tabViewController({ style: "segmentedControlOnBottom" });
    const view = renderTabController(tabs, traits(594,368));
    expect(view.container.querySelector('[data-tab-style="segmentedControlOnBottom"]')).not.toBeNull();
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("horizontal");
    const split = new NSESplitViewController({ id: "hierarchy", splitViewItems: [
      new NSESplitViewItem({ identifier: "sidebar", behavior: "sidebar", viewController: new TestContentViewController("Sources", () => null) }),
      new NSESplitViewItem({ identifier: "detail", viewController: new TestContentViewController("Detail", () => null) }),
    ] });
    updateTraits(split, traits(594,368)); expect(split.snapshot.presentation).toBe("single-pane");
    updateTraits(split, traits(1000,180)); expect(split.snapshot.presentation).toBe("split");
    tabs.dispose(); split.dispose();
  });

  it("retains draft DOM, scroll, and focus through tabs, rail and sidebar changes; overflow tabs stay reachable through More", async () => {
    const controller = tabViewController({});
    const view = renderTabController(controller, traits(382,580));
    const draft = screen.getByRole("textbox", { name: "Draft Home" }) as HTMLInputElement;
    fireEvent.change(draft, { target: { value: "Keep draft" } }); draft.scrollTop = 45; draft.focus();
    updateTraits(controller, traits(594,368));
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
    expect(document.activeElement).toBe(draft);
    const tab = screen.getByRole("tab", { name: "Home destination" }); tab.focus();
    updateTraits(controller, traits(382,580));
    expect(screen.getByRole("tab", { name: "Home destination" })).toBe(tab);
    expect(document.activeElement).toBe(tab);
    updateTraits(controller, traits(594,368));
    fireEvent.keyDown(tab, { key: "ArrowDown" });
    await waitFor(() => expect(controller.selectedTabViewItem?.identifier).toBe("Library"));
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Library destination" }));
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    fireEvent.click(screen.getByRole("tab", { name: "More destinations" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "More destinations" })).getByRole("button", { name: "History destination" }));
    await waitFor(() => expect(controller.selectedTabViewItem?.identifier).toBe("History"));
    act(() => controller.selectTabViewItem("Home")); draft.focus();
    updateTraits(controller, traits(1200,800));
    expect(screen.getByRole("textbox", { name: "Draft Home" })).toBe(draft);
    expect(draft.value).toBe("Keep draft"); expect(draft.scrollTop).toBe(45); expect(document.activeElement).toBe(draft);
    expect(view.container.querySelector("[data-nse-adaptive-tabs-chrome]")?.hasAttribute("hidden")).toBe(true);
    controller.dispose();
  });

  it("uses inherited RTL for horizontal keys while vertical keys remain in visual block order", async () => {
    const controller = tabViewController({});
    const view = renderTabController(controller, traits(594,368));
    view.container.setAttribute("dir", "rtl");
    const first = screen.getByRole("tab", { name: "Home destination" }); first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    await waitFor(() => expect(controller.selectedTabViewItem?.identifier).toBe("Library"));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Library destination" }), { key: "Home" });
    await waitFor(() => expect(controller.selectedTabViewItem?.identifier).toBe("Home"));
    expect(view.container.querySelector("[data-nse-tab-bar]")?.hasAttribute("dir")).toBe(false);
    controller.dispose();
  });
});
