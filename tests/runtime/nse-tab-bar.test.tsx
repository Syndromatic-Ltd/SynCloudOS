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
import { defineNSEAppearance } from "@syndromatic/syncloudos/nse/appearance";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance";
import { atmoAppearance } from "../../src/NSE/Themes/Atmo";
import {
  NSEApplicationNavigationChromeController,
  NSEApplicationNavigationChromeProvider,
  NSETabBar,
  NSETabBarController,
  NSETabBarOverflowList,
  NSETabGroup,
} from "../../src/NSE/Navigation";

const customAppearance = defineNSEAppearance({ id: "custom-test", displayName: "Custom test", recipes: [
  { slot: "toolbar.item.normal.1x", recipeId: "custom-test.toolbar.normal" },
  { slot: "toolbar.item.selected.1x", recipeId: "custom-test.toolbar.selected" },
] });

afterEach(cleanup);

function destinations(count: number, options: { disabled?: string; badge?: string } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const id = ["Home", "Library", "Search", "Settings", "Sharing", "Activity"][index] ?? `Item ${index + 1}`;
    return {
      id: id.toLowerCase(),
      label: id,
      accessibleLabel: `${id} destination`,
      icon: { kind: "template" as const, name: id.toLowerCase() },
      disabled: options.disabled === id.toLowerCase(),
      badge: options.badge === id.toLowerCase() ? 3 : undefined,
      createContent: () => <section data-testid={`${id.toLowerCase()}-panel`}>{id} content</section>,
    };
  });
}

function SharedChromeBack({ controller }: { readonly controller: NSEApplicationNavigationChromeController }) {
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (!snapshot.active?.back) return null;
  return <button type="button" aria-label={snapshot.active.back.label} onClick={snapshot.active.back.onActivate}>Back</button>;
}

describe("NSETabBar", () => {
  it("keeps NSETabGroup as a selected-value strip without panel ownership", () => {
    const change = vi.fn();
    render(
      <NSETabGroup
        label="View choices"
        defaultValue="home"
        selectionHaptic={false}
        options={[{ value: "home", label: "Home" }, { value: "library", label: "Library" }]}
        onValueChange={change}
      />,
    );
    const tabList = screen.getByRole("tablist", { name: "View choices" });
    expect(within(tabList).queryByRole("tabpanel")).toBeNull();
    fireEvent.keyDown(within(tabList).getByRole("tab", { name: "Home" }), { key: "ArrowRight" });
    expect(change).toHaveBeenCalledWith("library");
  });
  it.each([
    [1, 1, 0],
    [2, 2, 0],
    [3, 3, 0],
    [4, 4, 0],
    [5, 5, 0],
    [6, 4, 2],
  ])("keeps %i declared destinations as %i direct tabs and %i overflow destinations", (count, direct, overflow) => {
    const controller = new NSETabBarController<React.ReactNode>({ id: `tab-boundary-${count}`, destinations: destinations(count) });
    const { unmount } = render(<NSETabBar controller={controller} aria-label="Boundary tabs" />);

    expect(controller.getSnapshot().directDestinationIds).toHaveLength(direct);
    expect(controller.getSnapshot().overflowDestinationIds).toHaveLength(overflow);
    expect(screen.getAllByRole("tab")).toHaveLength(direct + (overflow ? 1 : 0));
    if (overflow) expect(screen.getByRole("tab", { name: "More destinations" })).toBeTruthy();
    else expect(screen.queryByRole("tab", { name: "More destinations" })).toBeNull();

    unmount();
    controller.dispose();
  });

  it("caps a six-plus bar at four destinations plus semantic More, pushes a semantic overflow page, and restores the tab root through shared Back", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "overflow-page-tabs",
      destinations: destinations(6),
    });
    const chromeController = new NSEApplicationNavigationChromeController();
    const { unmount } = render(
      <NSEApplicationNavigationChromeProvider controller={chromeController}>
        <NSETabBar controller={controller} aria-label="Primary destinations" idScope="overflow-page-tabs" />
        <NSETabBarOverflowList
          controller={controller}
          aria-label="Primary destinations"
          idScope="overflow-page-tabs"
          applicationChrome={{ ownerId: "fixture:overflow-page-application" }}
        />
        <SharedChromeBack controller={chromeController} />
      </NSEApplicationNavigationChromeProvider>,
    );
    const tabList = screen.getByRole("tablist", { name: "Primary destinations" });
    const more = screen.getByRole("tab", { name: "More destinations" });

    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(tabList.getAttribute("data-nse-tab-visible-item-count")).toBe("5");
    expect(tabList.getAttribute("data-nse-tab-overflow-count")).toBe("2");
    expect(tabList.getAttribute("data-nse-tab-overflow-open")).toBe("false");
    expect(screen.getByRole("tab", { name: "Home destination" }).hasAttribute("data-nse-tab-chrome-source-path")).toBe(false);
    expect(screen.getByRole("tab", { name: "Home destination" }).hasAttribute("data-nse-tab-chrome-source-identity")).toBe(false);

    more.focus();
    fireEvent.click(more);

    const overflowPage = await screen.findByRole("region", { name: "More destinations" });
    expect(screen.queryByRole("listbox", { name: "More destinations" })).toBeNull();
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more"]);
    expect(tabList.getAttribute("data-nse-tab-overflow-open")).toBe("true");
    const overflowGroup = within(overflowPage).getByRole("group", { name: "More destinations" });
    expect(overflowGroup.tagName).toBe("FIELDSET");
    expect(overflowGroup.getAttribute("data-appearance-recipe")).toBe("box.primary.bezel.none");
    const overflowRows = within(overflowPage).getAllByRole("button");
    expect(overflowRows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Sharing destination",
      "Activity destination",
    ]);
    for (const row of overflowRows) {
      expect(row.tagName).toBe("DIV");
      expect(row.className).toContain("nse-control-list-item");
      expect(row.querySelector(".nse-control-list-leading")).not.toBeNull();
      expect(row.querySelector(".nse-control-list-body")).not.toBeNull();
      expect(row.querySelector(".nse-control-list-primary")).not.toBeNull();
    }
    expect(overflowPage.querySelectorAll("button")).toHaveLength(0);
    await waitFor(() => expect(chromeController.getSnapshot().active).toMatchObject({
      title: "More destinations",
      back: { label: "Back to Primary destinations" },
    }));

    fireEvent.click(screen.getByRole("button", { name: "Back to Primary destinations" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "More destinations" })).toBeNull());
    expect(controller.moreStack?.getSnapshot().path).toEqual([]);
    expect(document.activeElement).toBe(more);

    fireEvent.click(more);
    fireEvent.click(within(await screen.findByRole("region", { name: "More destinations" })).getByRole("button", { name: "Activity destination" }));
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("activity"));
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]);
    expect(more.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(chromeController.getSnapshot().active).toMatchObject({
      title: "Activity destination",
      back: { label: "Back to More destinations" },
    }));
    const activityBack = screen.getByRole("button", { name: "Back to More destinations" });
    fireEvent.click(activityBack);
    const restoredOverflow = await screen.findByRole("region", { name: "More destinations" });
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more"]);
    expect(document.activeElement).toBe(within(restoredOverflow).getByRole("button", { name: "Activity destination" }));

    unmount();
    chromeController.dispose();
    controller.dispose();
  });

  it("keeps More aria-controls bound to one present tabpanel through root, list, detail, Back, and programmatic selection", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "stable-more-panel-tabs",
      destinations: destinations(6),
    });
    const { unmount } = render(
      <>
        <NSETabBar controller={controller} aria-label="Stable More panel" idScope="stable-more-panel" />
        <NSETabBarOverflowList controller={controller} aria-label="Stable More panel" idScope="stable-more-panel" />
      </>,
    );
    const more = screen.getByRole("tab", { name: "More destinations" });
    const safeArea = screen.getByRole("tablist", { name: "Stable More panel" })
      .closest<HTMLElement>(".nse-tab-bar-safe-area");
    const destinationHost = document.querySelector<HTMLElement>(".nse-navigation-destination-host");
    expect(safeArea).not.toBeNull();
    expect(destinationHost).not.toBeNull();
    expect(safeArea?.contains(destinationHost)).toBe(false);
    expect(safeArea?.nextElementSibling).toBe(destinationHost);
    expect(safeArea?.parentElement).toBe(destinationHost?.parentElement);
    const controlledId = more.getAttribute("aria-controls");
    const controlledPanel = controlledId ? document.getElementById(controlledId) : null;
    const homePanel = screen.getByTestId("home-panel").closest<HTMLElement>("[role='tabpanel']");
    const expectStablePanel = (visibility: "visible" | "hidden") => {
      expect(more.getAttribute("aria-controls")).toBe(controlledId);
      const panel = controlledId ? document.getElementById(controlledId) : null;
      expect(panel).toBe(controlledPanel);
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      if (visibility === "visible") {
        expect(panel?.hasAttribute("hidden")).toBe(false);
        expect(panel?.hasAttribute("inert")).toBe(false);
        expect(panel?.getAttribute("aria-hidden")).toBeNull();
      } else {
        expect(panel?.hasAttribute("hidden")).toBe(true);
        expect(panel?.hasAttribute("inert")).toBe(true);
        expect(panel?.getAttribute("aria-hidden")).toBe("true");
      }
      return panel;
    };

    expectStablePanel("hidden");
    expect(homePanel?.hasAttribute("hidden")).toBe(false);
    expect(homePanel?.hasAttribute("inert")).toBe(false);
    fireEvent.click(more);
    const overflow = await screen.findByRole("region", { name: "More destinations" });
    expect(expectStablePanel("visible")?.contains(overflow)).toBe(true);
    expect(homePanel?.hasAttribute("hidden")).toBe(true);
    expect(homePanel?.hasAttribute("inert")).toBe(true);
    expect(homePanel?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(within(overflow).getByRole("button", { name: "Activity destination" }));
    await waitFor(() => expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]));
    const activity = document.querySelector<HTMLElement>('[data-nse-more-destination="activity"]');
    expect(expectStablePanel("visible")?.contains(activity)).toBe(true);

    controller.moreStack?.pop();
    const restoredOverflow = await screen.findByRole("region", { name: "More destinations" });
    expect(expectStablePanel("visible")?.contains(restoredOverflow)).toBe(true);

    controller.closeOverflow();
    await waitFor(() => expect(controller.moreStack?.getSnapshot().path).toEqual([]));
    expect(more.getAttribute("aria-selected")).toBe("true");
    expect(expectStablePanel("visible")?.contains(activity)).toBe(true);

    await controller.select("sharing", { source: "programmatic" });
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("sharing"));
    expect(expectStablePanel("visible")?.contains(
      document.querySelector<HTMLElement>('[data-nse-more-destination="sharing"]'),
    )).toBe(true);

    unmount();
    controller.dispose();
  });

  it("owns one stable More panel when an app renderer delegates destination content", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "owned-more-panel-tabs",
      destinations: destinations(6),
    });
    const { unmount } = render(
      <>
        <NSETabBar
          controller={controller}
          aria-label="Owned More panel"
          idScope="owned-more-panel"
          renderPanels={false}
        />
        <NSETabBarOverflowList controller={controller} aria-label="Owned More panel" idScope="owned-more-panel" />
      </>,
    );
    const more = screen.getByRole("tab", { name: "More destinations" });
    const controlledId = more.getAttribute("aria-controls")!;
    const panel = document.getElementById(controlledId);

    expect(panel?.getAttribute("data-nse-tab-overflow-owned-panel")).toBe("true");
    expect(document.querySelectorAll(`#${controlledId}`)).toHaveLength(1);
    expect(panel?.hasAttribute("hidden")).toBe(true);

    fireEvent.click(more);
    const overflow = await screen.findByRole("region", { name: "More destinations" });
    expect(document.getElementById(controlledId)).toBe(panel);
    expect(panel?.contains(overflow)).toBe(true);
    expect(panel?.hasAttribute("hidden")).toBe(false);
    expect(panel?.hasAttribute("inert")).toBe(false);

    fireEvent.click(within(overflow).getByRole("button", { name: "Activity destination" }));
    await waitFor(() => expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]));
    expect(document.getElementById(controlledId)).toBe(panel);
    expect(panel?.hasAttribute("hidden")).toBe(false);
    expect(panel?.hasAttribute("inert")).toBe(false);
    expect(panel?.getAttribute("data-nse-tab-overflow-page-open")).toBeNull();

    await controller.select("home", { source: "programmatic" });
    await waitFor(() => expect(more.getAttribute("aria-selected")).toBe("false"));
    expect(document.getElementById(controlledId)).toBe(panel);
    expect(panel?.hasAttribute("hidden")).toBe(true);
    expect(panel?.hasAttribute("inert")).toBe(true);

    unmount();
    controller.dispose();
  });

  it("restores the More list scroll position with its focused row after a destination Back transition", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "overflow-scroll-restoration-tabs",
      destinations: destinations(10),
    });
    const chromeController = new NSEApplicationNavigationChromeController();
    const { unmount } = render(
      <NSEApplicationNavigationChromeProvider controller={chromeController}>
        <NSETabBar controller={controller} aria-label="Scroll restoration destinations" idScope="overflow-scroll-restoration-tabs" />
        <NSETabBarOverflowList
          controller={controller}
          aria-label="Scroll restoration destinations"
          idScope="overflow-scroll-restoration-tabs"
          applicationChrome={{ ownerId: "fixture:scroll-restoration-application" }}
        />
        <SharedChromeBack controller={chromeController} />
      </NSEApplicationNavigationChromeProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "More destinations" }));
    const overflow = await screen.findByRole("region", { name: "More destinations" });
    const surface = overflow.querySelector<HTMLElement>(".nse-tab-bar-overflow-metal-surface");
    expect(surface).not.toBeNull();
    surface!.scrollTop = 43;
    fireEvent.scroll(surface!);

    const activity = within(overflow).getByRole("button", { name: "Activity destination" });
    fireEvent.click(activity);
    await waitFor(() => expect(screen.queryByRole("region", { name: "More destinations" })).toBeNull());
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]);

    fireEvent.click(screen.getByRole("button", { name: "Back to More destinations" }));
    const restoredOverflow = await screen.findByRole("region", { name: "More destinations" });
    const restoredSurface = restoredOverflow.querySelector<HTMLElement>(".nse-tab-bar-overflow-metal-surface");
    expect(restoredSurface).not.toBe(surface);
    expect(restoredSurface?.scrollTop).toBe(43);
    expect(document.activeElement).toBe(within(restoredOverflow).getByRole("button", { name: "Activity destination" }));

    unmount();
    chromeController.dispose();
    controller.dispose();
  });

  it.each(["light", "dark"] as const)("projects the More hierarchy through the shared %s Metal surface and Preferences-derived grouped-list seam composition", async (mode) => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: `metal-overflow-${mode}`,
      destinations: destinations(7),
    });
    const { unmount } = render(
      <NSEAppearanceProvider appearance={atmoAppearance} colourScheme={mode}>
        <NSETabBar controller={controller} aria-label="Metal More destinations" idScope={`metal-overflow-${mode}`} />
        <NSETabBarOverflowList controller={controller} aria-label="Metal More destinations" idScope={`metal-overflow-${mode}`} />
      </NSEAppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "More destinations" }));

    const overflow = await screen.findByRole("region", { name: "More destinations" });
    const surface = overflow.querySelector<HTMLElement>(".nse-metal-surface");
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-nse-material")).toBe("metal");
    expect(surface?.getAttribute("data-mode")).toBe(mode);
    expect(surface?.getAttribute("data-nse-metal-surface-recipe")).toBe("nse.sidebar.metal.surface");
    expect(surface?.getAttribute("data-nse-metal-surface-lineage")).toBeNull();
    expect(surface?.getAttribute("data-nse-metal-surface-noise")).toBe("nse-metal-grain");
    expect(surface?.getAttribute("data-nse-metal-surface-source-path")).toBeNull();

    const group = within(overflow).getByRole("group", { name: "More destinations" });
    expect(group.getAttribute("data-nse-grouped-list")).toBe("true");
    expect(group.getAttribute("data-nse-grouped-list-seam-recipe")).toBe("nse.list-item.paired-bevel");
    expect(group.getAttribute("data-nse-grouped-list-seam-source-path")).toBeNull();
    expect(group.getAttribute("data-nse-grouped-list-inner-radius")).toBe("frame-minus-row-inset");
    const inner = group.querySelector<HTMLElement>(":scope > .nse-control-group-inner");
    expect(inner).not.toBeNull();
    const children = Array.from(inner!.children);
    expect(children.map((child) => `row:${child.getAttribute("data-nse-grouped-list-edge")}`)).toEqual([
      "row:first",
      "row:middle",
      "row:last",
    ]);
    expect(inner!.querySelectorAll(":scope > .nse-control-grouped-list-divider")).toHaveLength(0);
    expect(inner!.querySelectorAll(":scope > hr")).toHaveLength(0);
    // Physical seam geometry is asserted in the Chromium proof; JSDOM has no
    // loaded Atmo stylesheet and reports unresolved `medium` border widths.
    expect(within(overflow).getAllByRole("button").map((row) => row.getAttribute("data-nse-grouped-list-edge"))).toEqual([
      "first",
      "middle",
      "last",
    ]);

    unmount();
    controller.dispose();
  });

  it("owns accessible direct and More interactions, keyboard roving, RTL direction, touch, disabled tabs, and badges", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "interaction-tabs",
      destinations: destinations(6, { disabled: "settings", badge: "activity" }),
    });
    const { unmount } = render(
      <>
        <NSETabBar controller={controller} aria-label="Primary destinations" dir="rtl" reducedMotion idScope="interaction-tabs" />
        <NSETabBarOverflowList controller={controller} aria-label="Primary destinations" idScope="interaction-tabs" />
      </>,
    );
    const home = screen.getByRole("tab", { name: "Home destination" });

    expect(screen.getByRole("tablist", { name: "Primary destinations" }).getAttribute("data-reduced-motion")).toBe("true");
    fireEvent.keyDown(home, { key: "ArrowLeft" });
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("library"));
    expect(screen.getByRole("tab", { name: "Library destination" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Library destination" }), { key: "Home" });
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("home"));

    const disabled = screen.getByRole("tab", { name: "Settings destination" });
    fireEvent.click(disabled);
    expect(controller.getSnapshot().selectedDestinationId).toBe("home");

    const more = screen.getByRole("tab", { name: "More destinations" });
    fireEvent.click(more);
    const overflow = await screen.findByRole("region", { name: "More destinations" });
    expect(screen.queryByRole("listbox", { name: "More destinations" })).toBeNull();
    expect(screen.getByText("3").getAttribute("data-nse-tab-badge")).toBe("true");
    fireEvent.pointerUp(within(overflow).getByRole("button", { name: "Activity destination" }), { pointerType: "touch" });
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("activity"));
    // Overflow selection is a hierarchy push, not a popup dismissal. This
    // keeps More available as the shared-chrome Back destination.
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]);
    expect(screen.getByRole("tabpanel", { name: "More destinations" })).toBeTruthy();
    controller.restore({ selectedDestinationId: "sharing" });
    await waitFor(() => expect(screen.getByTestId("sharing-panel")).toBeTruthy());

    unmount();
    controller.dispose();
  });

  it("projects the selected tall Atmo recipe while retaining unresolved icon state and controller ownership", () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "atmo-tab-skin",
      destinations: destinations(6, { disabled: "settings", badge: "library" }),
    });
    const { unmount } = render(<NSEAppearanceProvider appearance={atmoAppearance}><NSETabBar controller={controller} aria-label="Atmo tab skin" /></NSEAppearanceProvider>);
    const home = screen.getByRole("tab", { name: "Home destination" });
    const library = screen.getByRole("tab", { name: "Library destination" });
    const settings = screen.getByRole("tab", { name: "Settings destination" });

    const tabList = screen.getByRole("tablist", { name: "Atmo tab skin" });
    expect(tabList.getAttribute("data-nse-tab-layout")).toBe("floating-bottom");
    expect(tabList.className).toContain("nse-control-toolbar");
    expect(tabList.getAttribute("data-grouped")).toBe("true");
    expect(tabList.getAttribute("data-nse-tab-chrome-active")).toBe("true");
    expect(tabList.getAttribute("data-nse-tab-chrome-family")).toBe("grouped-toolbutton");
    expect(tabList.getAttribute("data-nse-tab-chrome-variant")).toBe("tall");
    expect(tabList.getAttribute("data-nse-tab-chrome-size")).toBe("tall");
    expect(tabList.hasAttribute("data-nse-tab-vector-generator")).toBe(false);
    expect(home.getAttribute("data-nse-appearance-slot")).toBe("tab-bar.tab.selected.1x");
    expect(home.getAttribute("data-nse-appearance-authority")).toBeNull();
    expect(home.getAttribute("data-nse-tab-chrome-source-path")).toBeNull();
    expect(home.getAttribute("data-nse-appearance-recipe-id")).toBe("atmo.tab-bar.tab.grouped-toolbutton.selected.1x");
    expect(home.getAttribute("data-nse-tab-chrome-segment")).toBe("first");
    expect(home.getAttribute("data-nse-tab-chrome-state")).toBe("sel");
    expect(home.querySelector(".nse-tab-bar-icon")?.getAttribute("data-nse-appearance-slot")).toBe("tab-bar.icon.selected.1x");
    expect(home.querySelector(".nse-tab-bar-icon")?.getAttribute("data-nse-appearance-recipe-id")).toBeNull();
    expect(home.querySelector(".nse-tab-bar-icon")?.getAttribute("data-nse-tab-icon-source")).toBe("template:home");
    expect(home.querySelector(".nse-tab-bar-icon")?.getAttribute("data-nse-tab-icon-ready")).toBe("false");
    expect(home.querySelectorAll(".nse-control-chrome-primitive")).toHaveLength(0);
    const tabControls = screen.getAllByRole("tab");
    expect(tabControls).toHaveLength(5);
    for (const control of tabControls) {
      const content = control.querySelector<HTMLElement>(":scope > .nse-tab-bar-content");
      expect(content).not.toBeNull();
      expect(content?.getAttribute("data-nse-tab-content")).toBe("true");
      expect(content?.getAttribute("aria-hidden")).toBeNull();
      expect(content?.querySelector(".nse-tab-bar-icon")).not.toBeNull();
      expect(content?.querySelector(".nse-tab-bar-label")).not.toBeNull();
    }
    expect(home.querySelector(":scope > .nse-tab-bar-icon")).toBeNull();
    expect(library.querySelector(":scope > .nse-tab-bar-badge")).toBeNull();
    expect(library.querySelector(".nse-tab-bar-content > .nse-tab-bar-badge")).not.toBeNull();
    const navigationCss = readFileSync(resolve(process.cwd(), "src/NSE/Navigation/nse-navigation.css"), "utf8");
    expect(navigationCss).toContain(".nse-tab-bar-content");
    expect(navigationCss).toContain("pointer-events: none");
    expect(navigationCss).toMatch(/\[data-nse-tab-chrome-segment="first"\] > \.nse-tab-bar-content \{\s*inset-inline-start: 6px;/u);
    expect(navigationCss).toMatch(/\[data-nse-tab-chrome-segment="last"\] > \.nse-tab-bar-content \{\s*inset-inline-start: -6px;/u);

    fireEvent.pointerEnter(library);
    expect(library.getAttribute("data-nse-appearance-slot")).toBe("tab-bar.tab.hover.1x");
    expect(library.getAttribute("data-nse-appearance-recipe-id")).toBe("atmo.tab-bar.tab.grouped-toolbutton.hover.1x");
    fireEvent.pointerDown(library);
    expect(library.getAttribute("data-nse-appearance-slot")).toBe("tab-bar.tab.pressed.1x");
    expect(library.getAttribute("data-nse-appearance-recipe-id")).toBe("atmo.tab-bar.tab.grouped-toolbutton.pressed.1x");
    fireEvent.pointerUp(library);
    fireEvent.pointerLeave(library);
    fireEvent.focus(library);
    expect(library.getAttribute("data-nse-appearance-slot")).toBe("tab-bar.tab.focused.1x");
    expect(library.getAttribute("data-nse-appearance-recipe-id")).toBe("atmo.tab-bar.tab.grouped-toolbutton.focused.1x");
    expect(settings.getAttribute("data-nse-appearance-recipe-id")).toBe("atmo.tab-bar.tab.grouped-toolbutton.disabled.1x");

    fireEvent.pointerDown(home);
    expect(home.getAttribute("data-nse-tab-presentation-state")).toBe("pressed");
    expect(home.getAttribute("data-nse-tab-visual-state")).toBe("selected-pressed");
    fireEvent.pointerUp(home, { pointerType: "mouse" });

    expect(controller.getSnapshot().selectedDestinationId).toBe("home");
    unmount();
    controller.dispose();
  });

  it("projects one app-owned vector path as a state-managed mask while retaining a visible template diagnostic", () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "vector-tab-icons",
      destinations: [
        { id: "home", label: "Home", accessibleLabel: "Home destination", icon: { kind: "vector", path: "/fixture/home.svg" } },
        { id: "template", label: "Template", accessibleLabel: "Template destination", icon: { kind: "template", name: "template" } },
      ],
    });
    const { unmount } = render(<NSETabBar controller={controller} aria-label="Vector tab icons" />);

    const homeIcon = screen.getByRole("tab", { name: "Home destination" }).querySelector<HTMLElement>(".nse-tab-bar-icon");
    const templateIcon = screen.getByRole("tab", { name: "Template destination" }).querySelector<HTMLElement>(".nse-tab-bar-icon");
    const navigationCss = readFileSync(resolve(process.cwd(), "src/NSE/Navigation/nse-navigation.css"), "utf8");

    expect(homeIcon?.getAttribute("data-nse-tab-icon-source")).toBe("vector:/fixture/home.svg");
    expect(homeIcon?.getAttribute("data-nse-tab-icon-ready")).toBe("true");
    expect(homeIcon?.style.getPropertyValue("--nse-tab-icon-source")).toBe('url("/fixture/home.svg")');
    // The stylesheet owns the mask, so an appearance can replace it.
    expect(homeIcon?.style.maskImage).toBe('');
    expect(navigationCss).toContain('mask: var(--nse-tab-icon-source) center / contain no-repeat;');
    expect(templateIcon?.getAttribute("data-nse-tab-icon-ready")).toBe("false");
    expect(navigationCss).toContain('.nse-tab-bar-icon[data-nse-tab-icon-ready="true"]');
    expect(navigationCss).not.toContain('.nse-tab-bar-icon[data-nse-appearance-authority="unresolved"] { display: none; }');

    unmount();
    controller.dispose();
  });

  it("switches explicit themes without replacing the controller, selected tab or focus", async () => {
    const controller = new NSETabBarController<React.ReactNode>({ id: "theme-switch-tabs", destinations: destinations(2) });
    const fixture = (appearance: typeof atmoAppearance) => <NSEAppearanceProvider appearance={appearance}><NSETabBar controller={controller} aria-label="Theme tabs" /></NSEAppearanceProvider>;
    const view = render(fixture(atmoAppearance));
    const library = screen.getByRole("tab", { name: "Library destination" });
    fireEvent.click(library);
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("library"));
    library.focus();
    view.rerender(fixture(customAppearance));
    expect(screen.getByRole("tab", { name: "Library destination" })).toBe(library);
    expect(document.activeElement).toBe(library);
    expect(library.getAttribute("aria-selected")).toBe("true");
    expect(library.closest("[data-nse-appearance]")?.getAttribute("data-nse-appearance")).toBe("custom-test");
    expect(library.getAttribute("data-nse-appearance-recipe-id")).toBeNull();
    view.rerender(fixture(atmoAppearance));
    expect(document.activeElement).toBe(library);
    expect(library.getAttribute("data-nse-appearance-recipe-id")).toBe("atmo.tab-bar.tab.grouped-toolbutton.selected.1x");
    view.unmount(); controller.dispose();
  });

  it("keeps canonical Atmo density-independent at DPR2 without adding a compact chrome diagnostic", () => {
    const originalDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const controller = new NSETabBarController<React.ReactNode>({
      id: "high-density-source-gap-tabs",
      destinations: destinations(2),
    });
    try {
      const { unmount } = render(<NSEAppearanceProvider appearance={atmoAppearance}><NSETabBar controller={controller} aria-label="High density source gap" /></NSEAppearanceProvider>);
      const tabBar = screen.getByRole("tablist", { name: "High density source gap" })
        .closest<HTMLElement>("[data-nse-tab-bar='true']");
      expect(tabBar).not.toBeNull();
      expect(tabBar?.getAttribute("data-nse-tab-chrome-status")).toBe("resolved");
      expect(tabBar?.getAttribute("data-nse-tab-unresolved-chrome-slots")).toBeNull();
      expect(tabBar?.querySelector("[data-nse-tab-authority-diagnostic]")).toBeNull();
      expect(tabBar?.querySelector(".nse-tab-bar-authority-status")).toBeNull();
      unmount();
    } finally {
      controller.dispose();
      if (originalDpr) Object.defineProperty(window, "devicePixelRatio", originalDpr);
      else delete (window as Window & { devicePixelRatio?: number }).devicePixelRatio;
    }
  });

  it("retains custom appearance selection and reachable interaction states without borrowing Atmo recipes", () => {
    const controller = new NSETabBarController<React.ReactNode>({ id: "custom-tabs", destinations: destinations(2) });
    const view = render(<NSEAppearanceProvider appearance={customAppearance}><NSETabBar controller={controller} aria-label="custom appearance tabs" /></NSEAppearanceProvider>);
    const library = screen.getByRole("tab", { name: "Library destination" });
    fireEvent.pointerEnter(library);
    expect(library.getAttribute("data-nse-appearance-slot")).toBe("tab-bar.tab.hover.1x");
    expect(library.getAttribute("data-nse-appearance-recipe-id")).toBeNull();
    expect(library.closest("[data-nse-appearance]")?.getAttribute("data-nse-appearance")).toBe("custom-test");
    expect(library.querySelector(".nse-tab-bar-label")?.textContent).toBe("Library");
    fireEvent.pointerDown(library);
    expect(library.getAttribute("data-nse-tab-presentation-state")).toBe("pressed");
    expect(screen.queryByRole("status")).toBeNull();
    view.unmount(); controller.dispose();
  });

  it("keeps labels and badges present under theme-neutral navigation structure", () => {
    const css = readFileSync("src/NSE/Navigation/nse-navigation.css", "utf8");
    expect(css).toContain(".nse-tab-bar-label {");
    expect(css).toContain(".nse-tab-bar-badge {");
    const controller = new NSETabBarController<React.ReactNode>({ id: "neutral-tabs", destinations: destinations(2, { badge: "library" }) });
    const view = render(<NSETabBar controller={controller} aria-label="Neutral tabs" />);
    expect(screen.getByText("Library")).not.toBeNull();
    expect(screen.getByText("3").getAttribute("data-nse-tab-badge")).toBe("true");
    view.unmount(); controller.dispose();
  });

  it("moves keyboard focus through the More hierarchy page and restores More focus after Escape", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "more-listbox-tabs",
      destinations: destinations(6, { disabled: "sharing" }),
    });
    const { unmount } = render(
      <>
        <NSETabBar controller={controller} aria-label="More hierarchy destinations" idScope="more-hierarchy-tabs" />
        <NSETabBarOverflowList controller={controller} aria-label="More hierarchy destinations" idScope="more-hierarchy-tabs" />
      </>,
    );
    const more = screen.getByRole("tab", { name: "More destinations" });

    more.focus();
    fireEvent.keyDown(more, { key: "ArrowDown" });
    const overflow = await screen.findByRole("region", { name: "More destinations" });
    const activity = within(overflow).getByRole("button", { name: "Activity destination" });
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("listbox", { name: "More destinations" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(activity));

    fireEvent.keyDown(activity, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region", { name: "More destinations" })).toBeNull());
    expect(document.activeElement).toBe(more);

    fireEvent.keyDown(more, { key: "Enter" });
    const reopened = await screen.findByRole("region", { name: "More destinations" });
    const reopenedActivity = within(reopened).getByRole("button", { name: "Activity destination" });
    fireEvent.keyDown(reopenedActivity, { key: "Enter" });
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("activity"));
    expect(controller.getSnapshot().activeTabId).toBe("__nse-more");

    unmount();
    controller.dispose();
  });

  it("pushes keyboard activation through shared More chrome and restores the overflow-row focus on Back", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "more-keyboard-activation-focus-tabs",
      destinations: destinations(6, { disabled: "sharing" }),
    });
    const chromeController = new NSEApplicationNavigationChromeController();
    const { unmount } = render(
      <NSEApplicationNavigationChromeProvider controller={chromeController}>
        <NSETabBar controller={controller} aria-label="More keyboard activation focus" idScope="more-keyboard-activation-focus-tabs" />
        <NSETabBarOverflowList
          controller={controller}
          aria-label="More keyboard activation focus"
          idScope="more-keyboard-activation-focus-tabs"
          applicationChrome={{ ownerId: "fixture:keyboard-more-application" }}
        />
        <SharedChromeBack controller={chromeController} />
      </NSEApplicationNavigationChromeProvider>,
    );
    const more = screen.getByRole("tab", { name: "More destinations" });

    more.focus();
    fireEvent.keyDown(more, { key: "ArrowDown" });
    const activity = within(await screen.findByRole("region", { name: "More destinations" })).getByRole("button", { name: "Activity destination" });
    expect(document.activeElement).toBe(activity);

    fireEvent.keyDown(activity, { key: "Enter" });
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("activity"));
    await waitFor(() => expect(screen.queryByRole("region", { name: "More destinations" })).toBeNull());
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]);
    expect(more.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(chromeController.getSnapshot().active).toMatchObject({
      title: "Activity destination",
      back: { label: "Back to More destinations" },
    }));

    fireEvent.click(screen.getByRole("button", { name: "Back to More destinations" }));
    const restoredOverflow = await screen.findByRole("region", { name: "More destinations" });
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more"]);
    expect(document.activeElement).toBe(within(restoredOverflow).getByRole("button", { name: "Activity destination" }));

    unmount();
    chromeController.dispose();
    controller.dispose();
  });

  it("keeps an overflow destination host, draft, scroll, and focus through a direct-tab detour", async () => {
    function ActivityForm() {
      const [draft, setDraft] = useState("initial activity");
      return (
        <section data-testid="activity-retained-host">
          <label>Activity draft<input aria-label="Activity draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
        </section>
      );
    }
    const controller = new NSETabBarController<React.ReactNode>({
      id: "retained-more-host-tabs",
      destinations: destinations(6).map((destination) => (
        destination.id === "activity" ? { ...destination, createContent: () => <ActivityForm /> } : destination
      )),
    });
    const { unmount } = render(
      <>
        <NSETabBar controller={controller} aria-label="Retained More destinations" idScope="retained-more-host-tabs" />
        <NSETabBarOverflowList controller={controller} aria-label="Retained More destinations" idScope="retained-more-host-tabs" />
      </>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "More destinations" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "More destinations" })).getByRole("button", { name: "Activity destination" }));
    const input = await screen.findByRole("textbox", { name: "Activity draft" });
    const host = screen.getByTestId("activity-retained-host");
    host.scrollTop = 37;
    fireEvent.change(input, { target: { value: "retained activity draft" } });
    input.focus();

    await controller.select("library", { source: "test-direct-detour" });
    await controller.select("activity", { source: "test-return-overflow" });
    await waitFor(() => expect(screen.getByTestId("activity-retained-host")).toBe(host));
    expect((screen.getByRole("textbox", { name: "Activity draft" }) as HTMLInputElement).value).toBe("retained activity draft");
    expect(screen.getByTestId("activity-retained-host").scrollTop).toBe(37);
    expect(document.activeElement).toBe(input);
    expect(controller.moreStack?.getSnapshot().path).toEqual([]);

    unmount();
    controller.dispose();
  });

  it("keeps constructed destination content mounted through selection changes and releases its subscription on unmount", async () => {
    const subscriptions = vi.fn();
    const unsubscriptions = vi.fn();
    function FormDestination() {
      const [draft, setDraft] = useState("initial");
      return <label>Draft<input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>;
    }
    const controller = new NSETabBarController<React.ReactNode>({
      id: "retained-tabs",
      destinations: [
        { id: "form", label: "Form", icon: { kind: "template", name: "form" }, createContent: () => <FormDestination /> },
        { id: "other", label: "Other", icon: { kind: "template", name: "other" }, createContent: () => <p>Other</p> },
      ],
    });
    const originalSubscribe = controller.subscribe.bind(controller);
    controller.subscribe = (listener) => {
      subscriptions();
      const unsubscribe = originalSubscribe(listener);
      return () => {
        unsubscriptions();
        unsubscribe();
      };
    };
    const { unmount } = render(<NSETabBar controller={controller} aria-label="Retained destinations" />);

    fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), { target: { value: "retained draft" } });
    fireEvent.click(screen.getByRole("tab", { name: "Other" }));
    await waitFor(() => expect(screen.getByText("Other")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Form" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement).value).toBe("retained draft"));

    unmount();
    expect(subscriptions).toHaveBeenCalledTimes(1);
    expect(unsubscriptions).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});
