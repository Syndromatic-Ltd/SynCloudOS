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

import { NSEThemeProvider } from "../../src/NSE/Appearance";
import { atmoTheme } from "../../src/NSE/Themes/Atmo/theme";


// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSECoverFlow } from "../../src/NSE/CoverFlow";
import { NSEAppFrame } from "../../src/NSE/Windows/NSEAppFrame";
import { NSEListItem } from "../../src/NSE/Controls/Selection/NSEListItem";
import { NSEMenu, NSEPicker } from "../../src/NSE/Menus";
import { NSEProgressBar } from "../../src/NSE/Progress";
import { NSESidebar, NSESourceListScene } from "../../src/NSE/Navigation/SourceList";
import { NSESlider } from "../../src/NSE/Controls/Values";
import { NSESplitView } from "../../src/NSE/DataViews/Split";
import { NSEStatusBar, NSETopBar } from "../../src/NSE/Windows/Chrome";
import {
  NSEAdaptiveNavigationController,
  NSEApplicationNavigationChromeController,
  NSEApplicationNavigationChromeProvider,
  NSENavigationStackController,
  NSETabBarController,
} from "../../src/NSE/Navigation";
import type { SynCloudOSPresentationTraits } from "../../src/SynCloudOS/SynCloudOS";
import { NSEList, NSEListRow, NSESwipeableItem, useNSEPageWindow } from "../../src/NSE/List";
import { NSEOrdered } from "../../src/NSE/Layout";
import { NSE } from "../../src/NSE/NSE";
import { getNSERegistryItem, nseRegistry } from "../../src/NSE/registry";

function installPointerCaptureMocks() {
  const prototype = HTMLElement.prototype as HTMLElement & {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
    hasPointerCapture?: (pointerId: number) => boolean;
  };
  const originals = {
    setPointerCapture: prototype.setPointerCapture,
    releasePointerCapture: prototype.releasePointerCapture,
    hasPointerCapture: prototype.hasPointerCapture
  };

  prototype.setPointerCapture = vi.fn();
  prototype.releasePointerCapture = vi.fn();
  prototype.hasPointerCapture = vi.fn(() => true);

  return () => {
    if (originals.setPointerCapture) prototype.setPointerCapture = originals.setPointerCapture;
    else delete prototype.setPointerCapture;
    if (originals.releasePointerCapture) prototype.releasePointerCapture = originals.releasePointerCapture;
    else delete prototype.releasePointerCapture;
    if (originals.hasPointerCapture) prototype.hasPointerCapture = originals.hasPointerCapture;
    else delete prototype.hasPointerCapture;
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function navigationTraits(horizontalSizeClass: SynCloudOSPresentationTraits["horizontalSizeClass"]): SynCloudOSPresentationTraits {
  const width = horizontalSizeClass === "compact" ? 640 : 1280;
  return Object.freeze({
    revision: 1,
    contentBounds: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    hostViewportBounds: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    horizontalSizeClass,
    orientation: "landscape",
    workArea: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    visualViewportBounds: Object.freeze({ x: 0, y: 0, width, height: 800 }),
    safeAreaInsets: Object.freeze({ blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }),
    virtualKeyboardInset: 0,
    devicePixelRatio: 1,
    primaryPointer: "fine",
    hover: true,
    touch: false,
    reducedMotion: false,
    reducedTransparency: false,
    forcedColours: false,
  });
}

function StageChromeBackControl({ controller }: { readonly controller: NSEApplicationNavigationChromeController }) {
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (!snapshot.active?.back) return null;
  return (
    <button type="button" aria-label={snapshot.active.back.label} onClick={snapshot.active.back.onActivate}>
      Back
    </button>
  );
}

describe("NSE semantic contracts", () => {
  it("forwards an NSEListItem ref to the focusable row element", () => {
    const rowRef = React.createRef<HTMLDivElement>();
    render(<NSEListItem ref={rowRef} role="button" tabIndex={0}>Focusable row</NSEListItem>);

    const row = screen.getByRole("button", { name: "Focusable row" });
    expect(rowRef.current).toBe(row);
    rowRef.current?.focus();
    expect(document.activeElement).toBe(row);
  });

  it("projects declared semantic source-list groups without taking ownership of legacy rails or split panes", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "source-list-projection",
      destinations: [
        { id: "inbox", label: "Inbox", icon: { kind: "template", name: "tray" }, groupId: "Mail", createContent: () => <article data-testid="inbox-content">Inbox content</article> },
        { id: "archive", label: "Archive", icon: { kind: "template", name: "archive" }, groupId: "Mail", createContent: () => <article data-testid="archive-content">Archive content</article> },
        { id: "settings", label: "Settings", icon: { kind: "template", name: "gear" }, groupId: "System", createContent: () => <article data-testid="settings-content">Settings content</article> },
      ],
      sections: [
        { id: "mail", label: "Mail", destinationIds: ["inbox", "archive"] },
        { id: "system", label: "System", destinationIds: ["settings"] },
      ],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "source-list-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: controller,
      traits: navigationTraits("wide"),
    });
    const compact = vi.fn(() => <article data-testid="compact-navigation">Compact handoff</article>);
    const { container } = render(
      <NSESourceListScene
        projection={{ controller, adaptiveController: adaptive, compactContent: compact }}
      />,
    );

    expect(container.querySelectorAll("[data-navigation-group]")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll("[data-navigation-group]")).map((node) => node.getAttribute("data-navigation-group"))).toEqual(["mail", "system"]);
    expect(screen.getByTestId("inbox-content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.getByTestId("archive-content")).toBeTruthy());
    expect(container.querySelector(".nse-split-view")).not.toBeNull();

    adaptive.setTraits(navigationTraits("compact"));
    await waitFor(() => expect(screen.getByTestId("compact-navigation")).toBeTruthy());
    expect(container.querySelector(".nse-split-view")).not.toBeNull();
    expect(compact).toHaveBeenCalledWith(expect.objectContaining({ renderer: "tabs", selectedDestinationId: "archive" }));
    adaptive.dispose();
    controller.dispose();
  });

  it("suppresses a source-list status footer when compact tabs exclusively own the bottom chrome", () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "compact-status-suppression",
      destinations: [
        { id: "home", label: "Home", accessibleLabel: "Home destination", icon: { kind: "template", name: "home" }, createContent: () => <article>Home</article> },
        { id: "library", label: "Library", accessibleLabel: "Library destination", icon: { kind: "template", name: "library" }, createContent: () => <article>Library</article> },
      ],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "compact-status-suppression-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: controller,
      traits: navigationTraits("compact"),
    });
    const { container } = render(
      <NSESourceListScene
        projection={{ controller, adaptiveController: adaptive, ariaLabel: "Compact status suppression" }}
        status={{ rail: "Rail status", center: "Desktop status" }}
      />,
    );

    expect(screen.getByRole("tablist", { name: "Compact status suppression" })).toBeTruthy();
    expect(container.querySelector(".nse-source-list-scene-status")).toBeNull();
    expect(container.querySelector('[data-nse-source-list-compact-chrome="true"]')).toBeTruthy();
    expect(container.querySelector('[data-nse-compact-bottom-chrome="tabs-only"]')).toBeTruthy();

    adaptive.dispose();
    controller.dispose();
  });

  it("keeps one mounted peer destination host through source-list and tab renderer changes", async () => {
    function FormDestination() {
      const [draft, setDraft] = React.useState("initial");
      return (
        <section data-testid="peer-form-host">
          <label>Peer draft<input aria-label="Peer draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
        </section>
      );
    }
    const controller = new NSETabBarController<React.ReactNode>({
      id: "stable-peer-projection",
      destinations: [
        { id: "form", label: "Form", accessibleLabel: "Form destination", icon: { kind: "template", name: "form" }, createContent: () => <FormDestination /> },
        { id: "other", label: "Other", accessibleLabel: "Other destination", icon: { kind: "template", name: "other" }, createContent: () => <p>Other peer content</p> },
      ],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "stable-peer-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: controller,
      traits: navigationTraits("wide"),
    });
    render(<NSESourceListScene projection={{ controller, adaptiveController: adaptive, ariaLabel: "Stable peer navigation" }} />);

    const input = screen.getByRole("textbox", { name: "Peer draft" });
    const host = screen.getByTestId("peer-form-host");
    host.scrollTop = 61;
    input.focus();
    fireEvent.change(input, { target: { value: "retained through renderer changes" } });

    adaptive.setTraits(navigationTraits("compact"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Other destination" })).toBeTruthy());
    expect(screen.getByTestId("peer-form-host")).toBe(host);
    expect((screen.getByRole("textbox", { name: "Peer draft" }) as HTMLInputElement).value).toBe("retained through renderer changes");
    expect(screen.getByTestId("peer-form-host").scrollTop).toBe(61);
    expect(document.activeElement).toBe(input);

    fireEvent.click(screen.getByRole("tab", { name: "Other destination" }));
    await waitFor(() => expect(screen.getByText("Other peer content")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Form destination" }));
    await waitFor(() => expect(screen.getByTestId("peer-form-host")).toBe(host));
    const restoredInput = screen.getByRole("textbox", { name: "Peer draft" });
    expect((restoredInput as HTMLInputElement).value).toBe("retained through renderer changes");
    restoredInput.focus();

    adaptive.setTraits(navigationTraits("wide"));
    await waitFor(() => expect(screen.getByTestId("peer-form-host")).toBe(host));
    expect(document.activeElement).toBe(input);
    adaptive.dispose();
    controller.dispose();
  });

  it("retains an overflow destination host through a direct selection and peer renderer transition", async () => {
    function ActivityDetail() {
      const [draft, setDraft] = React.useState("initial overflow");
      return (
        <section data-testid="projection-overflow-host">
          <label>Projection overflow draft<input aria-label="Projection overflow draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
        </section>
      );
    }
    const destinationNames = ["Home", "Library", "Search", "Settings", "Sharing", "Activity"];
    const controller = new NSETabBarController<React.ReactNode>({
      id: "projection-overflow-retention",
      destinations: destinationNames.map((label) => {
        const id = label.toLowerCase();
        return {
          id,
          label,
          accessibleLabel: `${label} destination`,
          icon: { kind: "template" as const, name: id },
          createContent: () => id === "activity" ? <ActivityDetail /> : <article>{label} content</article>,
        };
      }),
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "projection-overflow-retention-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: controller,
      traits: navigationTraits("wide"),
    });
    render(<NSEThemeProvider theme={atmoTheme}><NSESourceListScene projection={{ controller, adaptiveController: adaptive, ariaLabel: "Overflow peer navigation" }} /></NSEThemeProvider>);

    adaptive.setTraits(navigationTraits("compact"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "More destinations" })).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "More destinations" }));
    await waitFor(() => expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more"]));
    fireEvent.click(within(await screen.findByRole("region", { name: "More destinations" })).getByRole("button", { name: "Activity destination" }));
    await waitFor(() => expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]));
    const input = await screen.findByRole("textbox", { name: "Projection overflow draft" });
    const host = screen.getByTestId("projection-overflow-host");
    host.scrollTop = 29;
    fireEvent.change(input, { target: { value: "retained overflow projection" } });

    fireEvent.click(screen.getByRole("tab", { name: "Library destination" }));
    await waitFor(() => expect(controller.getSnapshot().selectedDestinationId).toBe("library"));
    expect(controller.moreStack?.getSnapshot().path).toEqual([]);
    adaptive.setTraits(navigationTraits("wide"));
    await waitFor(() => expect(screen.getByTestId("projection-overflow-host")).toBe(host));
    adaptive.setTraits(navigationTraits("compact"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "More destinations" })).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "More destinations" }));
    await waitFor(() => expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more"]));
    fireEvent.click(within(await screen.findByRole("region", { name: "More destinations" })).getByRole("button", { name: "Activity destination" }));
    await waitFor(() => expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]));
    await waitFor(() => expect(screen.getByTestId("projection-overflow-host")).toBe(host));
    expect((screen.getByRole("textbox", { name: "Projection overflow draft" }) as HTMLInputElement).value).toBe("retained overflow projection");
    expect(screen.getByTestId("projection-overflow-host").scrollTop).toBe(29);
    expect(controller.moreStack?.getSnapshot().path).toEqual(["__nse-more", "activity"]);
    adaptive.dispose();
    controller.dispose();
  });

  it("projects compact hierarchy navigation as a real stack with back and restoration recovery", async () => {
    const controller = new NSETabBarController<React.ReactNode>({
      id: "compact-hierarchy-projection",
      destinations: [
        { id: "home", label: "Home", accessibleLabel: "Home destination", icon: { kind: "template", name: "home" }, createContent: () => <article data-testid="hierarchy-home">Home content</article> },
        { id: "library", label: "Library", accessibleLabel: "Library destination", icon: { kind: "template", name: "library" }, createContent: () => <article data-testid="hierarchy-library">Library content</article> },
      ],
    });
    const stack = new NSENavigationStackController({
      id: "compact-hierarchy-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "library"],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "compact-hierarchy-adaptive",
      model: "hierarchy",
      presentation: "adaptive",
      tabController: controller,
      stackController: stack,
      traits: navigationTraits("compact"),
    });
    const chromeController = new NSEApplicationNavigationChromeController();
    render(
      <NSEApplicationNavigationChromeProvider controller={chromeController}>
        <button type="button" onClick={() => { void stack.push("library"); }}>Open Library destination</button>
        <NSESourceListScene projection={{
          controller,
          adaptiveController: adaptive,
          ariaLabel: "Hierarchy navigation",
          applicationChrome: { ownerId: "fixture:hierarchy-application" },
        }} />
        <StageChromeBackControl controller={chromeController} />
      </NSEApplicationNavigationChromeProvider>,
    );

    expect(screen.queryByRole("navigation", { name: "Hierarchy navigation" })).toBeNull();
    expect(document.querySelector(".nse-hierarchy-stack-current")).toBeNull();
    expect(screen.getByTestId("hierarchy-home")).toBeTruthy();
    const open = screen.getByRole("button", { name: "Open Library destination" });
    open.focus();
    fireEvent.click(open);
    await waitFor(() => expect(screen.getByTestId("hierarchy-library")).toBeTruthy());
    expect(stack.getSnapshot().path).toEqual(["library"]);
    expect(screen.getByRole("button", { name: "Back to Home destination" })).toBeTruthy();

    const back = screen.getByRole("button", { name: "Back to Home destination" });
    back.focus();
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByTestId("hierarchy-home")).toBeTruthy());
    expect(stack.getSnapshot().path).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(open));

    stack.restore({ path: ["library"] });
    await waitFor(() => expect(screen.getByTestId("hierarchy-library")).toBeTruthy());
    stack.restore({ path: ["missing"] });
    await waitFor(() => expect(screen.getByTestId("hierarchy-home")).toBeTruthy());
    expect(stack.getSnapshot().path).toEqual([]);
    chromeController.dispose();
    adaptive.dispose();
    stack.dispose();
    controller.dispose();
  });

  it("keeps the compact hierarchy detail host's form, scroll, and focus through renderer transitions", async () => {
    function LibraryDetail() {
      const [draft, setDraft] = React.useState("library initial");
      return (
        <section data-testid="hierarchy-library-retained-host">
          <label>Hierarchy library draft<input aria-label="Hierarchy library draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
        </section>
      );
    }
    const controller = new NSETabBarController<React.ReactNode>({
      id: "hierarchy-retention-projection",
      destinations: [
        { id: "home", label: "Home", accessibleLabel: "Home destination", icon: { kind: "template", name: "home" }, createContent: () => <article>Hierarchy home</article> },
        { id: "library", label: "Library", accessibleLabel: "Library destination", icon: { kind: "template", name: "library" }, createContent: () => <LibraryDetail /> },
      ],
    });
    const stack = new NSENavigationStackController({
      id: "hierarchy-retention-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "library"],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "hierarchy-retention-adaptive",
      model: "hierarchy",
      presentation: "adaptive",
      tabController: controller,
      stackController: stack,
      traits: navigationTraits("compact"),
    });
    const chromeController = new NSEApplicationNavigationChromeController();
    render(
      <NSEApplicationNavigationChromeProvider controller={chromeController}>
        <button type="button" onClick={() => { void stack.push("library"); }}>Open Library destination</button>
        <NSESourceListScene projection={{ controller, adaptiveController: adaptive, ariaLabel: "Retained hierarchy navigation" }} />
      </NSEApplicationNavigationChromeProvider>,
    );

    const open = screen.getByRole("button", { name: "Open Library destination" });
    open.focus();
    fireEvent.click(open);
    const input = await screen.findByRole("textbox", { name: "Hierarchy library draft" });
    const host = screen.getByTestId("hierarchy-library-retained-host");
    host.scrollTop = 43;
    fireEvent.change(input, { target: { value: "retained hierarchy draft" } });
    input.focus();

    adaptive.setTraits(navigationTraits("wide"));
    await waitFor(() => expect(screen.getByTestId("hierarchy-library-retained-host")).toBe(host));
    expect((screen.getByRole("textbox", { name: "Hierarchy library draft" }) as HTMLInputElement).value).toBe("retained hierarchy draft");
    expect(screen.getByTestId("hierarchy-library-retained-host").scrollTop).toBe(43);
    expect(document.activeElement).toBe(input);

    adaptive.setTraits(navigationTraits("compact"));
    await waitFor(() => expect(screen.getByTestId("hierarchy-library-retained-host")).toBe(host));
    expect((screen.getByRole("textbox", { name: "Hierarchy library draft" }) as HTMLInputElement).value).toBe("retained hierarchy draft");
    expect(document.activeElement).toBe(input);
    chromeController.dispose();
    adaptive.dispose();
    stack.dispose();
    controller.dispose();
  });

  it("keeps the shared circular Back control geometry across Cumulus and Metal top bars", () => {
    const interfaceFxCss = readFileSync(resolve(process.cwd(), "src/NSE/Windows/Chrome/nse-chrome.css"), "utf8");
    expect(interfaceFxCss).toContain(".nse-app-topbar-slot-left .webspring-application-navigation-back.nse-control-button.nse-extended-tool-button");
    expect(interfaceFxCss).toContain(".nse-app-topbar-rail-aligned-leading .webspring-application-navigation-back.nse-control-button.nse-extended-tool-button");
    expect(interfaceFxCss).toContain(".nse-app-topbar-rail-aligned-leading .webspring-application-navigation-back .nse-control-button-icon");
  });

  it("routes source-list seams through the theme-neutral divider without a legacy raster fallback", () => {
    const sourceListCss = readFileSync(resolve(process.cwd(), "src/NSE/Navigation/SourceList/nse-sourcelist.css"), "utf8");

    expect(sourceListCss).toMatch(/--nse-sourcelist-divider:\s*var\(--nse-theme-divider, linear-gradient\(currentColor, currentColor\)\);/);
    expect(sourceListCss).not.toMatch(/--nse-atmo-onyx-divider|\/assets\/nse\/atmo\/onyx|url\([^)]*\.png/i);
  });

  it("keeps semantic control owners, the NSE facade, and the registry wired together", () => {
    expect(NSE.NSEAppFrame).toBe(NSEAppFrame);
    expect(NSE.NSESidebar).toBe(NSESidebar);
    expect(NSE.NSESplitView).toBe(NSESplitView);
    expect(NSE.NSEProgressBar).toBe(NSEProgressBar);
    expect(NSE.NSESlider).toBe(NSESlider);
    expect(typeof NSE.NSEFlex).toBe("function");
    expect(typeof NSE.NSEList).toBe("function");
    expect(typeof NSE.NSEPane).toBe("function");
    expect(typeof NSE.NSEDatePicker).toBe("function");
    expect(NSE.NSEOrdered).toBe(NSEOrdered);
    expect(NSE.Layout.NSEOrdered).toBe(NSEOrdered);
    expect(NSE.List.NSEList).toBe(NSEList);
    expect(NSE.Registry.items).toBe(nseRegistry);

    const names = nseRegistry.map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(["nse-controls", "nse-layout", "nse-list", "nse-containers"]));
    expect(new Set(names).size).toBe(names.length);
    for (const item of nseRegistry) {
      expect(getNSERegistryItem(item.name)).toBe(item);
      expect(NSE.Registry.get(item.name)).toBe(item);
      expect(item.files.length).toBeGreaterThan(0);
      expect(item.files.every((file) => (file.startsWith("src/NSE/") || file.startsWith("src/Themes/")))).toBe(true);
    }
    expect(getNSERegistryItem("missing-nse-control")).toBeNull();

    const registrySource = readFileSync(resolve(process.cwd(), "src/NSE/registry/index.ts"), "utf8");
    expect(registrySource).not.toMatch(/Atmo-Onyx|\bOnyx\b|atmo-onyx|AtmoRefresh\.app/u);
    expect(getNSERegistryItem("atmo")).toMatchObject({
      title: "Atmo",
      files: ["src/NSE/Themes/Atmo/index.ts", "src/Themes/Atmo.scostheme/Contents/styles.css"],
    });
  });

  it("renders app-frame page regions and sidebar row groups in caller order", () => {
    const onSelectItem = vi.fn();
    const onToggleSection = vi.fn();
    const { container } = render(
      <NSEAppFrame
        variant="sourceList"
        topBar={<NSETopBar title="Library" />}
        sidebar={
          <NSESidebar
            activeItemId="inbox"
            onSelectItem={onSelectItem}
            onToggleSection={onToggleSection}
            sections={[
              {
                id: "library",
                label: "Library",
                items: [
                  { id: "inbox", label: "Inbox", meta: "12" },
                  { id: "archive", label: "Archive", children: [{ id: "year-2026", label: "2026" }] }
                ]
              },
              {
                id: "collapsed",
                label: "Collapsed",
                collapsed: true,
                items: [{ id: "drafts", label: "Drafts" }]
              },
              {
                id: "tools",
                items: [
                  { id: "locked", label: "Locked", disabled: true },
                  { id: "settings", label: "Settings" }
                ]
              }
            ]}
          />
        }
        statusBar={<NSEStatusBar leading="Ready">5 rows</NSEStatusBar>}
      >
        <article>Window content</article>
      </NSEAppFrame>
    );

    expect(container.querySelector(".nse-app-frame")?.getAttribute("data-variant")).toBe("sourceList");
    expect(container.querySelector(".nse-app-frame-topbar")).not.toBeNull();
    expect(container.querySelector(".nse-app-frame-sidebar")).not.toBeNull();
    expect(container.querySelector(".nse-app-frame-content")?.textContent).toContain("Window content");
    expect(container.querySelector(".nse-app-frame-statusbar")?.textContent).toContain("5 rows");

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-nse-sidebar-row='true']"));
    expect(rows.map((row) => row.querySelector(".nse-control-list-primary")?.textContent)).toEqual([
      "Inbox",
      "Archive",
      "2026",
      "Drafts",
      "Locked",
      "Settings"
    ]);
    const collapsedSection = screen.getByText("Collapsed").closest<HTMLElement>(".nse-sidebar-section");
    const collapsedItems = collapsedSection?.querySelector<HTMLElement>(".nse-sidebar-section-items");
    expect(collapsedSection?.getAttribute("data-collapsed")).toBe("true");
    expect(collapsedItems?.hasAttribute("inert")).toBe(true);
    expect(screen.getByText("Drafts").closest("[data-nse-sidebar-row]")).not.toBeNull();
    expect(screen.getByText("Inbox").closest("[data-nse-sidebar-row]")?.getAttribute("aria-current")).toBe("true");

    fireEvent.click(screen.getByText("Settings").closest("[data-nse-sidebar-row]") as HTMLElement);
    expect(onSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "settings" }),
      expect.objectContaining({ id: "tools" })
    );

    rows[2].focus();
    fireEvent.keyDown(rows[2], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[5]);

    const interfaceFxCss = readFileSync(resolve(process.cwd(), "src/NSE/Windows/Chrome/nse-chrome.css"), "utf8");
    expect(interfaceFxCss).toMatch(/\.nse-sidebar-row\.nse-control-list-item\s*\{[^}]*margin:\s*0;/);
    expect(interfaceFxCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.nse-sidebar-section-items\s*\{\s*transition:\s*none;/);

    fireEvent.click(container.querySelector(".nse-sidebar-section-toggle") as HTMLElement);
    expect(onToggleSection).toHaveBeenCalledWith(expect.objectContaining({ id: "library" }));
  });

  it("orders NSEOrdered children by declared order while keeping stable ties", () => {
    const { container, rerender } = render(
      <NSEOrdered as="ol" axis="horizontal" gap={4}>
        <span data-nse-order="30">Third</span>
        <span data-order="10">First</span>
        <span data-nse-order="20">Second A</span>
        <span data-order="20">Second B</span>
        <span data-nse-order="5" hidden>Hidden</span>
      </NSEOrdered>
    );

    const ordered = container.querySelector(".nse-layout-ordered") as HTMLElement;
    expect(ordered.tagName).toBe("OL");
    expect(ordered.getAttribute("data-axis")).toBe("horizontal");
    expect(ordered.style.gap).toBe("4px");

    const visibleItems = Array.from(container.querySelectorAll<HTMLElement>(".nse-layout-ordered-item"));
    expect(visibleItems.map((item) => item.textContent)).toEqual(["First", "Second A", "Second B", "Third"]);
    expect(visibleItems.map((item) => item.getAttribute("data-nse-order"))).toEqual(["first", "middle", "middle", "last"]);
    expect(visibleItems.map((item) => item.getAttribute("data-nse-sort-order"))).toEqual(["10", "20", "20", "30"]);
    expect(visibleItems.map((item) => item.getAttribute("data-source-index"))).toEqual(["1", "2", "3", "0"]);

    rerender(
      <NSEOrdered includeHidden descending>
        <span data-nse-order="30">Third</span>
        <span data-order="10">First</span>
        <span data-nse-order="20">Second A</span>
        <span data-order="20">Second B</span>
        <span data-nse-order="5" hidden>Hidden</span>
      </NSEOrdered>
    );

    expect(Array.from(container.querySelectorAll<HTMLElement>(".nse-layout-ordered-item")).map((item) => item.textContent)).toEqual([
      "Third",
      "Second A",
      "Second B",
      "First",
      "Hidden"
    ]);
  });

  it("preserves split-view keyboard behavior and reset semantics", () => {
    const onSidebarWidthChange = vi.fn();
    render(
      <NSESplitView
        sidebar={<aside>Folders</aside>}
        defaultSidebarWidth={280}
        minSidebarWidth={224}
        maxSidebarWidth={320}
        onSidebarWidthChange={onSidebarWidthChange}
        valueText={(width) => `${width} pixels`}
      >
        <main>Document</main>
      </NSESplitView>
    );

    const separator = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(separator.getAttribute("aria-valuenow")).toBe("280");
    expect(separator.getAttribute("aria-valuetext")).toBe("280 pixels");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(296);
    expect(separator.getAttribute("aria-valuenow")).toBe("296");

    fireEvent.keyDown(separator, { key: "End" });
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(320);
    expect(separator.getAttribute("aria-valuenow")).toBe("320");

    fireEvent.doubleClick(separator);
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps NSEList selection and page windows stable", () => {
    const onSelectionChange = vi.fn();
    const onPageChange = vi.fn();

    function PageWindowHarness() {
      const pageWindow = useNSEPageWindow(["Alpha", "Beta", "Gamma", "Delta", "Epsilon"], {
        pageSize: 2,
        overscan: 1,
        onPageChange
      });

      return (
        <section aria-label="Page window" {...pageWindow.getWindowProps()}>
          {pageWindow.windowItems.map(({ item }) => <span key={item}>{item}</span>)}
          <button type="button" onClick={pageWindow.nextPage}>Next page</button>
        </section>
      );
    }

    render(
      <div>
        <NSEList
          items={["Alpha", "Beta", "Gamma", "Delta"]}
          getKey={(item) => item.toLowerCase()}
          mode="single"
          defaultSelectedKey="gamma"
          pageWindow={{ defaultPageIndex: 1, pageSize: 2, overscan: 1 }}
          onSelectionChange={onSelectionChange}
          renderItem={(item, index, state) => (
            <NSEListRow itemKey={state.key} title={item} meta={`#${index}`} />
          )}
        />
        <PageWindowHarness />
      </div>
    );

    const list = screen.getByRole("listbox");
    expect(list.getAttribute("data-page-index")).toBe("1");
    expect(list.getAttribute("data-page-size")).toBe("2");
    expect(list.getAttribute("data-window-start")).toBe("2");
    expect(list.getAttribute("data-window-end")).toBe("4");
    expect(within(list).queryByText("Alpha")).toBeNull();
    expect(screen.getByText("Gamma").closest("[role='option']")?.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByText("Delta").closest("[role='option']") as HTMLElement);
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
      action: "select",
      key: "delta",
      selectedKey: "delta"
    }));

    const pageWindow = screen.getByRole("region", { name: "Page window" });
    expect(pageWindow.getAttribute("data-page-index")).toBe("0");
    expect(pageWindow.textContent).toContain("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(expect.objectContaining({
      pageIndex: 1,
      startIndex: 2,
      endIndex: 4,
      overscanStartIndex: 1,
      overscanEndIndex: 5
    }));
    expect(pageWindow.getAttribute("data-page-index")).toBe("1");
    expect(pageWindow.textContent).toContain("Gamma");
  });

  it("keeps progress and slider values clamped, labelled, and reflected in CSS vars", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <div>
        <NSEProgressBar value={250} max={200} label="Transfer" />
        <NSESlider label="Volume" min={0} max={100} defaultValue={25} onValueChange={onValueChange} />
      </div>
    );

    const progress = screen.getByRole("progressbar", { name: "Transfer" });
    expect(progress.getAttribute("aria-valuemax")).toBe("200");
    expect(progress.getAttribute("aria-valuenow")).toBe("200");
    expect(progress.getAttribute("data-full")).toBe("true");
    expect(progress.style.getPropertyValue("--nse-control-progress")).toBe("100%");

    const sliderInput = screen.getByLabelText("Volume") as HTMLInputElement;
    const slider = container.querySelector(".nse-control-slider") as HTMLElement;
    expect(slider.style.getPropertyValue("--nse-control-slider-progress")).toBe("25%");

    fireEvent.change(sliderInput, { target: { value: "70" } });
    expect(onValueChange).toHaveBeenLastCalledWith(70);
    expect(slider.style.getPropertyValue("--nse-control-slider-progress")).toBe("70%");
  });

  it("splits Slider onChanging (drag) from onChange (commit)", () => {
    // Slider fires onChanging continuously while dragging and onChange once on commit
    //. A native input change (keyboard) is a committed change.
    const onChanging = vi.fn();
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    render(
      <NSESlider
        label="Vol"
        min={0}
        max={100}
        defaultValue={10}
        onChanging={onChanging}
        onChange={onChange}
        onValueChange={onValueChange}
      />
    );

    const input = screen.getByLabelText("Vol") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "40" } });

    expect(onValueChange).toHaveBeenLastCalledWith(40);
    expect(onChange).toHaveBeenCalledWith(40);
    expect(onChanging).not.toHaveBeenCalled();
  });


  it("honours CoverFlow click slop and swipe step thresholds", () => {
    const onActiveChange = vi.fn();
    const onActivate = vi.fn();
    render(
      <NSECoverFlow
        defaultActiveIndex={1}
        onActiveChange={onActiveChange}
        items={[
          { id: "one", image: "/assets/one.png", label: "One" },
          { id: "two", image: "/assets/two.png", label: "Two", onActivate },
          { id: "three", image: "/assets/three.png", label: "Three" }
        ]}
      />
    );

    const listbox = screen.getByRole("listbox", { name: "Showcase" });
    fireEvent.click(screen.getByRole("option", { name: "Two" }));
    expect(onActivate).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(listbox, { button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(listbox, { pointerId: 1, clientX: 170 });
    fireEvent.pointerUp(listbox, { pointerId: 1, clientX: 170 });
    expect(onActiveChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(listbox, { button: 0, pointerId: 2, clientX: 200 });
    fireEvent.pointerMove(listbox, { pointerId: 2, clientX: 120 });
    fireEvent.pointerUp(listbox, { pointerId: 2, clientX: 120 });
    expect(onActiveChange).toHaveBeenLastCalledWith(2);
  });

  it("uses swipe thresholds before opening list row actions", () => {
    const restorePointerCapture = installPointerCaptureMocks();
    const onOpenChange = vi.fn();
    const onSwipe = vi.fn();
    const onDelete = vi.fn();

    try {
      const { container } = render(
        <NSESwipeableItem
          threshold={48}
          maxSwipe={96}
          trailingActions={[{ id: "delete", label: "Delete", tone: "negative", onPress: onDelete }]}
          onOpenChange={onOpenChange}
          onSwipe={onSwipe}
        >
          <NSEListRow title="Message" />
        </NSESwipeableItem>
      );

      const item = container.querySelector(".nse-list-swipeable") as HTMLElement;
      fireEvent.pointerDown(item, { button: 0, pointerId: 1, clientX: 100 });
      fireEvent.pointerMove(item, { pointerId: 1, clientX: 70 });
      fireEvent.pointerUp(item, { pointerId: 1, clientX: 70 });
      expect(onOpenChange).toHaveBeenLastCalledWith(null);
      expect(onSwipe).not.toHaveBeenCalled();

      fireEvent.pointerDown(item, { button: 0, pointerId: 2, clientX: 100 });
      fireEvent.pointerMove(item, { pointerId: 2, clientX: 40 });
      fireEvent.pointerUp(item, { pointerId: 2, clientX: 40 });
      expect(onOpenChange).toHaveBeenLastCalledWith("trailing");
      expect(onSwipe).toHaveBeenCalledWith("trailing");

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(onDelete).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenLastCalledWith(null);
    } finally {
      restorePointerCapture();
    }
  });
});
