// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";
import { tabViewController, renderTabController, updateTraits } from "../fixtures/tabViewController";

afterEach(cleanup);
describe("tab view control placement", () => {
  it("projects each item's vector image in a source-list cell without changing its compact icon identity", () => {
    const tabs = tabViewController({ ids: ["Overview"] });
    const view = renderTabController(tabs, createStaticPresentationTraits({ width: 1440, height: 900 }));
    const image = screen.getByRole("tree").querySelector("img");
    expect(image?.getAttribute("src")).toContain("/navigation/overview.svg");
    const original = tabs.tabViewItems[0]!.image;
    updateTraits(tabs, createStaticPresentationTraits({ width: 390, height: 844 }));
    expect(tabs.tabViewItems[0]!.image).toBe(original);
    expect(screen.getByRole("tab", { name: "Overview destination" })).not.toBeNull();
    expect(view.container.querySelector("[data-navigation-renderer]")?.getAttribute("data-navigation-renderer")).toBe("tabs");
    tabs.dispose();
  });

  it("keeps fixed bottom controls after the content on every layout, independently of window footers", () => {
    const tabs = tabViewController({ style: "segmentedControlOnBottom", ids: ["Home", "Library"] });
    const view = renderTabController(tabs, createStaticPresentationTraits({ width: 1440, height: 900 }));
    const body = view.container.querySelector(".nse-tab-view-controller-content")!;
    const tabList = screen.getByRole("tablist");
    expect(body.compareDocumentPosition(tabList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.container.querySelector("footer")).toBeNull();
    updateTraits(tabs, createStaticPresentationTraits({ width: 390, height: 844 }));
    expect(screen.getByRole("tablist")).toBe(tabList);
    expect(tabs.tabStyle).toBe("segmentedControlOnBottom");
    fireEvent.click(screen.getByRole("tab", { name: "Library destination" }));
    act(() => tabs.selectTabViewItem("Home"));
    expect(tabs.selectedTabViewItem?.identifier).toBe("Home");
    tabs.dispose();
  });
});
