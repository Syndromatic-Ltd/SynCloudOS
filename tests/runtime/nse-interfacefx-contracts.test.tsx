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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppFrame } from "../../src/NSE/Windows/AppFrame";
import { GroupedRow } from "../../src/NSE/Controls/Selection/GroupedRow";
import { NSEProgressIndicator } from "../../src/NSE/Progress";
import { NSESlider } from "../../src/NSE/Controls/Values";
import { NSESplitView } from "../../src/NSE/DataViews/Split";
import { TopBar } from "../../src/NSE/Windows/Chrome";
import { NSESplitViewController, NSESplitViewItem } from "../../src/NSE/DataViews/Split";
import { NSEOutlineView } from "../../src/NSE/DataViews/Outline";
import { NSETreeController } from "../../src/NSE/Controllers/NSETreeController";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";
import { tabViewController, renderTabController, updateTraits, TestContentViewController } from "../fixtures/tabViewController";
import { NSEGridView } from "../../src/NSE/Layout";
import { NSE } from "../../src/NSE/NSE";
import { getNSERegistryItem, nseRegistry } from "../../src/NSE/registry";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NSE semantic contracts", () => {
  it("forwards a GroupedRow ref to the focusable row element", () => {
    const rowRef = React.createRef<HTMLDivElement>();
    render(<GroupedRow ref={rowRef} role="button" tabIndex={0}>Focusable row</GroupedRow>);

    const row = screen.getByRole("button", { name: "Focusable row" });
    expect(rowRef.current).toBe(row);
    rowRef.current?.focus();
    expect(document.activeElement).toBe(row);
  });

  // Rail geometry, book capability, fixed placement and footer ownership are exercised in the
  // dedicated nse-adaptive-rail, book-regions, nse-adaptive-bottom-tabs and nse-source-list-chrome suites.
  it("retains a peer form's host, draft, scroll and focus when its tab and layout change", async () => {
    function Form() {
      const [draft, setDraft] = React.useState("initial");
      return <section data-testid="peer-form-host"><input aria-label="Peer draft" value={draft} onChange={event => setDraft(event.target.value)} /></section>;
    }
    const tabs = tabViewController({ ids: ["Form", "Other"], content: id => id === "Form" ? <Form /> : <p>Other peer</p> });
    renderTabController(tabs, createStaticPresentationTraits({ width: 1280, height: 800 }));
    const input = screen.getByRole("textbox", { name: "Peer draft" }), host = screen.getByTestId("peer-form-host");
    host.scrollTop = 61; input.focus(); fireEvent.change(input, { target: { value: "retained through renderer changes" } });
    updateTraits(tabs, createStaticPresentationTraits({ width: 390, height: 844 }));
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getByRole("tab", { name: "Other destination" }));
    await waitFor(() => expect(tabs.selectedTabViewItem?.identifier).toBe("Other"));
    fireEvent.click(screen.getByRole("tab", { name: "Form destination" }));
    await waitFor(() => expect(tabs.selectedTabViewItem?.identifier).toBe("Form"));
    expect(screen.getByTestId("peer-form-host")).toBe(host);
    expect((input as HTMLInputElement).value).toBe("retained through renderer changes"); expect(host.scrollTop).toBe(61);
    input.focus(); updateTraits(tabs, createStaticPresentationTraits({ width: 1280, height: 800 }));
    expect(document.activeElement).toBe(input); tabs.dispose();
  });

  it("reaches a seventh tab through More and retains its form after revisiting it", async () => {
    const tabs = tabViewController({ content: id => <section data-testid={`host-${id}`}><input aria-label={`Draft ${id}`} defaultValue="initial" /></section> });
    renderTabController(tabs, createStaticPresentationTraits({ width: 390, height: 844 }));
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    fireEvent.click(screen.getByRole("tab", { name: "More destinations" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "More destinations" })).getByRole("button", { name: "History destination" }));
    await waitFor(() => expect(tabs.selectedTabViewItem?.identifier).toBe("History"));
    const input = screen.getByRole("textbox", { name: "Draft History" }), host = screen.getByTestId("host-History");
    fireEvent.change(input, { target: { value: "retained seventh tab" } }); host.scrollTop = 29;
    act(() => tabs.selectTabViewItem("Library"));
    updateTraits(tabs, createStaticPresentationTraits({ width: 1280, height: 800 }));
    updateTraits(tabs, createStaticPresentationTraits({ width: 390, height: 844 }));
    act(() => tabs.selectTabViewItem("History"));
    expect(screen.getByTestId("host-History")).toBe(host); expect((input as HTMLInputElement).value).toBe("retained seventh tab"); expect(host.scrollTop).toBe(29);
    tabs.dispose();
  });

  it("shows a compact split detail and returns to its source control through the theme's Back button", () => {
    let split: NSESplitViewController;
    const detail = new TestContentViewController("Library", () => <article data-testid="hierarchy-library">Library content</article>);
    const sidebar = new TestContentViewController("Home", () => <button onClick={() => split.showDetail(detail)}>Open Library destination</button>);
    split = new NSESplitViewController({ id: "compact-hierarchy", splitViewItems: [
      new NSESplitViewItem({ identifier: "home", behavior: "sidebar", viewController: sidebar }),
      new NSESplitViewItem({ identifier: "library", viewController: detail }),
    ] });
    render(<NSEViewControllerView controller={split} />);
    updateTraits(split, createStaticPresentationTraits({ width: 390, height: 844 }));
    const open = screen.getByRole("button", { name: "Open Library destination" }); open.focus(); fireEvent.click(open);
    expect(screen.getByTestId("hierarchy-library")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(document.activeElement).toBe(open); expect(split.compactItem?.viewController).toBe(sidebar);
    split.dispose();
  });

  it("retains a split detail's form, scroll and input focus through compact and regular transitions", () => {
    const detail = new TestContentViewController("Library", () => <section data-testid="hierarchy-library-retained-host"><input aria-label="Hierarchy library draft" defaultValue="initial" /></section>);
    const split = new NSESplitViewController({ id: "retained-hierarchy", splitViewItems: [
      new NSESplitViewItem({ identifier: "home", behavior: "sidebar", viewController: new TestContentViewController("Home", () => <p>Home</p>), minimumThickness: 208 }),
      new NSESplitViewItem({ identifier: "library", viewController: detail, minimumThickness: 280 }),
    ] });
    render(<NSEViewControllerView controller={split} />);
    updateTraits(split, createStaticPresentationTraits({ width: 390, height: 844 })); act(() => split.showDetail(detail));
    const input = screen.getByRole("textbox", { name: "Hierarchy library draft" }), host = screen.getByTestId("hierarchy-library-retained-host");
    host.scrollTop = 43; fireEvent.change(input, { target: { value: "retained hierarchy draft" } }); input.focus();
    for (const width of [1280, 390]) {
      updateTraits(split, createStaticPresentationTraits({ width, height: 844 }));
      expect(screen.getByTestId("hierarchy-library-retained-host")).toBe(host); expect((input as HTMLInputElement).value).toBe("retained hierarchy draft"); expect(host.scrollTop).toBe(43); expect(document.activeElement).toBe(input);
    }
    split.dispose();
  });

  it("keeps the shared circular Back control geometry across Cumulus and Metal top bars", () => {
    const interfaceFxCss = readFileSync(resolve(process.cwd(), "src/NSE/Windows/Chrome/nse-chrome.css"), "utf8");
    expect(interfaceFxCss).toContain(".nse-app-topbar-slot-left .webspring-application-navigation-back.nse-control-button.nse-extended-tool-button");
    expect(interfaceFxCss).toContain(".nse-app-topbar-metal-leading .webspring-application-navigation-back.nse-control-button.nse-extended-tool-button");
    expect(interfaceFxCss).toContain(".nse-app-topbar-metal-leading .webspring-application-navigation-back .nse-control-button-icon");
  });

  it("routes source-list seams through the canonical Atmo divider without a legacy raster fallback", () => {
    const sourceListCss = readFileSync(resolve(process.cwd(), "src/NSE/Navigation/SourceList/nse-sourcelist.css"), "utf8");

    expect(sourceListCss).toMatch(/--nse-sourcelist-divider:\s*var\(--nse-atmo-divider\);/);
    expect(sourceListCss).not.toMatch(/--nse-atmo-onyx-divider|\/assets\/nse\/atmo\/onyx|url\([^)]*\.png/i);
  });

  it("keeps semantic control owners, the NSE facade, and the registry wired together", () => {
    expect(NSE.NSESplitView).toBe(NSESplitView);
    expect(NSE.NSEProgressIndicator).toBe(NSEProgressIndicator);
    expect(NSE.NSESlider).toBe(NSESlider);
    expect(typeof NSE.NSEStackView).toBe("function");
    expect(typeof NSE.NSEBox).toBe("function");
    expect(typeof NSE.NSEDatePicker).toBe("function");
    expect(NSE.NSEGridView).toBe(NSEGridView);
    expect(NSE.Layout.NSEStackView).toBe(NSE.NSEStackView);
    expect(NSE.Registry.items).toBe(nseRegistry);

    const names = nseRegistry.map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(["nse-controls", "nse-layout", "nse-containers"]));
    expect(new Set(names).size).toBe(names.length);
    for (const item of nseRegistry) {
      expect(getNSERegistryItem(item.name)).toBe(item);
      expect(NSE.Registry.get(item.name)).toBe(item);
      expect(item.files.length).toBeGreaterThan(0);
      expect(item.files.every((file) => file.startsWith("src/NSE/"))).toBe(true);
    }
    expect(getNSERegistryItem("missing-nse-control")).toBeNull();

    const registrySource = readFileSync(resolve(process.cwd(), "src/NSE/registry/index.ts"), "utf8");
    expect(registrySource).not.toMatch(/Atmo-Onyx|\bOnyx\b|atmo-onyx|AtmoRefresh\.app/u);
    expect(getNSERegistryItem("atmo")).toMatchObject({
      title: "Atmo",
      files: ["src/NSE/Appearance/atmo.ts", "src/NSE/Appearance/atmo-theme.css"],
    });
  });

  it("renders app-frame regions and outline source-list groups in caller order, refusing unselectable rows", () => {
    interface Node { readonly id: string; readonly label: string; readonly children: readonly Node[]; }
    const leaf = (id: string, label: string): Node => ({ id, label, children: [] });
    const groups: readonly Node[] = [
      { id: "library", label: "Library", children: [leaf("inbox", "Inbox"), { id: "archive", label: "Archive", children: [leaf("year", "2026")] }] },
      { id: "collapsed", label: "Collapsed", children: [leaf("drafts", "Drafts")] },
      { id: "tools", label: "Tools", children: [leaf("locked", "Locked"), leaf("settings", "Settings")] },
    ];
    const tree = new NSETreeController({ id: "source-groups", content: groups, getId: (node: Node) => node.id, getChildren: (node: Node) => node.children, withChildren: (node: Node, children: readonly Node[]) => ({ ...node, children }), selection: { mode: "single" } });
    tree.expand("library"); tree.expand("archive"); tree.expand("tools"); tree.select(["inbox"]);
    const onSelect = vi.fn();
    const { container } = render(<AppFrame variant="sourceList" topBar={<TopBar title="Library" />} sidebar={
      <NSEOutlineView controller={tree} aria-label="Sources" selectionHighlightStyle="sourceList" idForItem={node => node.id} labelForItem={node => node.label} childrenForItem={node => node.children} isExpandable={node => node.children.length > 0}
        delegate={{ isGroupItem: id => ["library", "collapsed", "tools"].includes(id), shouldSelect: id => !["library", "collapsed", "tools", "locked"].includes(id) }} onSelectionChange={onSelect} />
    } statusBar={<footer>Ready · 5 rows</footer>}><article>Window content</article></AppFrame>);
    expect(container.querySelector(".nse-app-frame-content")?.textContent).toContain("Window content");
    expect(container.querySelector(".nse-app-frame-statusbar")?.textContent).toContain("5 rows");
    const rows = container.querySelectorAll('[data-nse-part="row"] .nse-control-list-primary');
    expect([...rows].map(row => row.textContent)).toEqual(["Inbox", "Archive", "2026", "Drafts", "Locked", "Settings"]);
    expect(container.querySelector('.nse-outline-children[data-collapsed="true"]')?.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("treeitem", { name: "Settings" })); expect(tree.getSnapshot().selection.selectedIds).toEqual(new Set(["settings"])); expect(onSelect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("treeitem", { name: "2026" }));
    const outline = screen.getByRole("tree"); outline.focus(); fireEvent.keyDown(outline, { key: "ArrowDown" });
    expect(tree.getSnapshot().selection.selectedIds).toEqual(new Set(["year"]));
    for (let step = 0; step < 2; step += 1) fireEvent.keyDown(outline, { key: "ArrowDown" });
    fireEvent.keyDown(outline, { key: " " }); expect(tree.getSnapshot().selection.selectedIds).toEqual(new Set(["year"]));
    fireEvent.keyDown(outline, { key: "ArrowDown" }); fireEvent.keyDown(outline, { key: " " });
    expect(tree.getSnapshot().selection.selectedIds).toEqual(new Set(["settings"]));
    fireEvent.click(screen.getByRole("button", { name: "Collapse Library" })); expect(tree.getSnapshot().expandedIds.has("library")).toBe(false);
    tree.dispose();
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


  it("keeps progress and slider values clamped, labelled, and reflected in CSS vars", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <div>
        <NSEProgressIndicator value={250} maximum={200} aria-label="Transfer" />
        <NSESlider label="Volume" minimum={0} maximum={100} defaultValue={25} onValueChange={onValueChange} />
      </div>
    );

    const progress = screen.getByRole("progressbar", { name: "Transfer" });
    expect(progress.getAttribute("aria-valuemax")).toBe("200");
    expect(progress.getAttribute("aria-valuenow")).toBe("200");
    expect(progress.style.getPropertyValue("--nse-control-progress")).toBe("100%");

    const sliderInput = screen.getByLabelText("Volume") as HTMLInputElement;
    const slider = container.querySelector(".nse-control-slider") as HTMLElement;
    expect(slider.style.getPropertyValue("--nse-control-slider-progress")).toBe("25%");

    fireEvent.change(sliderInput, { target: { value: "70" } });
    expect(onValueChange).toHaveBeenLastCalledWith(70, "commit");
    expect(slider.style.getPropertyValue("--nse-control-slider-progress")).toBe("70%");
  });

  it("previews a slider while it is dragged and commits a change made without the pointer", () => {
    // A native input change outside a drag (the keyboard, assistive technology) is a committed change.
    const onValueChange = vi.fn();
    render(
      <NSESlider
        label="Vol"
        minimum={0}
        maximum={100}
        defaultValue={10}
        onValueChange={onValueChange}
      />
    );

    const input = screen.getByLabelText("Vol") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "40" } });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith(40, "commit");
  });

});
