// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController, nseUpdateTraits } from "../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSETabViewController, NSETabViewItem } from "../../src/NSE/Navigation/NSETabViewController";
import { NSEToolbar } from "../../src/NSE/Toolbars/NSEToolbar";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { defaultsFrom } from "../fixtures/userDefaults";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  for (const host of hosts.splice(0)) await host.dispose();
});

function resizeTabs(tabs: NSETabViewController, width: number, height: number) {
  act(() => tabs[nseUpdateTraits]({ reducedMotion: false, presentation: createStaticPresentationTraits({ width, height }) }));
}

it("adapts peer tabs to a desktop source list, compact bottom tabs and a short-window rail without remounting content", async () => {
  const tabs = new Sections();
  tabs.tabStyle = "sidebarAdaptable";
  resizeTabs(tabs, 1440, 900);
  render(<NSEViewControllerView controller={tabs} />);
  expect(screen.getByRole("tree", { name: "Sections" })).toBeTruthy();
  expect(screen.queryByRole("tablist")).toBeNull();
  const page = screen.getByText("Company page");
  resizeTabs(tabs, 390, 844);
  expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("horizontal");
  expect(screen.getByText("Company page")).toBe(page);
  resizeTabs(tabs, 900, 400);
  expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical");
  expect(screen.getByText("Company page")).toBe(page);
  await act(async () => { fireEvent.keyDown(screen.getByRole("tab", { name: /Company/ }), { key: "ArrowDown" }); });
  expect(tabs.selectedTabViewItem?.identifier).toBe("framework");
  resizeTabs(tabs, 1440, 900);
  expect(screen.getByRole("treeitem", { name: "Framework" }).getAttribute("aria-selected")).toBe("true");
  tabs.dispose();
});

it("keeps fixed bottom tabs on wide and short layouts", () => {
  const tabs = new Sections();
  resizeTabs(tabs, 1440, 900);
  render(<NSEViewControllerView controller={tabs} />);
  expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("horizontal");
  resizeTabs(tabs, 900, 400);
  expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("horizontal");
  expect(screen.queryByRole("tree")).toBeNull();
  tabs.dispose();
});

it("shows every tab directly rather than inventing a More history", () => {
  const tabs = new Sections();
  for (const name of ["News", "Work", "Contact"]) tabs.addTabViewItem(new NSETabViewItem({ viewController: tabs.addChild(Pane, name), identifier: name.toLowerCase() }));
  render(<NSEViewControllerView controller={tabs} />);
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  expect(screen.queryByRole("tab", { name: /More/ })).toBeNull();
  tabs.dispose();
});

it("retains the same section DOM when an outer split hands unspecified presentation to compact peer tabs", () => {
  const tabs = new Sections();
  tabs.tabStyle = "unspecified";
  resizeTabs(tabs, 390, 844);
  render(<NSEViewControllerView controller={tabs} />);
  const page = screen.getByText("Company page");
  act(() => { tabs.tabStyle = "sidebarAdaptable"; });
  expect(screen.getByRole("tablist")).toBeTruthy();
  expect(screen.getByText("Company page")).toBe(page);
  act(() => { tabs.tabStyle = "unspecified"; });
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getByText("Company page")).toBe(page);
  tabs.dispose();
});

it("uses the tab view's measured content budget and keeps its last renderer during stale geometry", () => {
  const tabs = new Sections();
  tabs.tabStyle = "sidebarAdaptable";
  resizeTabs(tabs, 1440, 900);
  const observations = new Map<Element, () => void>();
  class Observer {
    constructor(readonly callback: () => void) {}
    observe(element: Element) { observations.set(element, this.callback); }
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  render(<NSEViewControllerView controller={tabs} />);
  resizeTabs(tabs, 1440, 900);
  const root = document.querySelector(".nse-adaptive-tab-controller") as HTMLElement;
  let width = 430;
  Object.defineProperties(root, { clientWidth: { get: () => width }, clientHeight: { get: () => 368 } });
  act(() => { observations.get(root)!(); });
  expect(root.dataset.navigationRenderer).toBe("tabs");
  width = 594;
  act(() => { observations.get(root)!(); });
  expect(root.dataset.navigationRenderer).toBe("rail");
  act(() => tabs[nseUpdateTraits]({ reducedMotion: false, presentation: { ...createStaticPresentationTraits({ width: 1440, height: 900 }), geometryState: "retained" } }));
  expect(root.dataset.navigationRenderer).toBe("rail");
  tabs.dispose();
});

it("uses current foldable book regions before compact peer tabs and preserves the hinge gap", () => {
  const tabs = new Sections();
  tabs.tabStyle = "sidebarAdaptable";
  const presentation = createStaticPresentationTraits({ width: 669, height: 867 });
  tabs[nseUpdateTraits]({ reducedMotion: false, presentation: { ...presentation, viewportFeatures: { posture: "folded", segments: [
    { x: 0, y: 0, width: 329, height: 867 }, { x: 340, y: 0, width: 329, height: 867 },
  ] } } });
  render(<NSEViewControllerView controller={tabs} />);
  act(() => tabs[nseUpdateTraits]({ reducedMotion: false, presentation: { ...presentation, viewportFeatures: { posture: "folded", segments: [
    { x: 0, y: 0, width: 329, height: 867 }, { x: 340, y: 0, width: 329, height: 867 },
  ] } } }));
  expect(screen.getByRole("tree", { name: "Sections" })).toBeTruthy();
  expect(screen.queryByRole("tablist")).toBeNull();
  const split = document.querySelector('[data-book-regions="true"]') as HTMLElement;
  expect(split.style.getPropertyValue("--nse-book-gap")).toBe("11px");
  tabs.dispose();
});

it("moves source-list focus into compact tabs while leaving editor focus in its retained view", () => {
  const tabs = new Sections();
  tabs.tabStyle = "sidebarAdaptable";
  resizeTabs(tabs, 1440, 900);
  render(<NSEViewControllerView controller={tabs} />);
  act(() => screen.getByRole("tree").focus());
  resizeTabs(tabs, 390, 844);
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Company/ }));
  const editor = screen.getByRole("textbox", { name: "Draft Company" });
  editor.focus();
  resizeTabs(tabs, 1440, 900);
  expect(document.activeElement).toBe(editor);
  expect(screen.getByRole("textbox", { name: "Draft Company" })).toBe(editor);
  tabs.dispose();
});

class Pane extends NSEViewController {
  constructor(readonly name: string) { super({ title: name }); }
  static override view = function PaneView({ controller }: { readonly controller: Pane }) {
    return <div><p>{controller.name} page</p><input aria-label={`Draft ${controller.name}`} /></div>;
  };
}

class Sections extends NSETabViewController {
  readonly refused = new Set<string>();
  readonly selections: string[] = [];
  constructor() {
    super({ tabStyle: "segmentedControlOnBottom", title: "Sections" });
    for (const name of ["Company", "Framework", "Team"]) {
      this.addTabViewItem(new NSETabViewItem({ viewController: this.addChild(Pane, name), identifier: name.toLowerCase() }));
    }
  }
  override shouldSelect(item: NSETabViewItem) { return !this.refused.has(item.identifier); }
  override didSelect(item: NSETabViewItem) { this.selections.push(item.identifier); }
}

let sections!: Sections;
class Content extends NSEViewController {
  readonly tabs = this.addChild(Sections);
  constructor() { super(); sections = this.tabs; }
  static override view = function ContentView({ controller }: { readonly controller: Content }) {
    return <controller.tabs.view />;
  };
}
class MainWindow extends NSEWindowController {
  constructor() { super(); this.contentViewController = new Content(); }
}
class Application extends NSEApplication { static override mainWindow = MainWindow; }

async function launch() {
  const host = createClassApplicationHost(Application, "com.example.tab-view-controller");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  return host;
}

it("shows the selected item's view under a bottom tab control (NSTabViewController)", async () => {
  await launch();
  expect(sections.tabViewItems.map(item => item.label)).toEqual(["Company", "Framework", "Team"]);
  expect(sections.selectedTabViewItemIndex).toBe(0);
  expect(await screen.findByText("Company page")).toBeTruthy();
  const root = document.querySelector(".nse-tab-view-controller") as HTMLElement;
  expect(root.dataset.tabStyle).toBe("segmentedControlOnBottom");
  // The tab control comes after the content.
  expect(root.lastElementChild?.classList.contains("nse-tab-view-controller-content")).toBe(false);

  await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /Team/ })); });
  expect(await screen.findByText("Team page")).toBeTruthy();
  expect(screen.queryByText("Company page")).toBeNull();
  expect(sections.selectedTabViewItemIndex).toBe(2);
  expect(sections.selections).toEqual(["team"]);
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: /Team/ }).id);

  await act(async () => { sections.selectedTabViewItemIndex = 1; });
  expect(await screen.findByText("Framework page")).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Framework/ }).getAttribute("aria-selected")).toBe("true");
});

it("keeps the current tab when shouldSelect refuses, and relabels a tab from its item", async () => {
  await launch();
  sections.refused.add("framework");
  await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /Framework/ })); });
  expect(sections.selectedTabViewItemIndex).toBe(0);
  expect(screen.getByText("Company page")).toBeTruthy();
  await act(async () => { sections.selectedTabViewItemIndex = 1; });
  expect(sections.selectedTabViewItemIndex).toBe(0);

  await act(async () => { sections.tabViewItems[2]!.label = "People"; });
  expect(screen.getByRole("tab", { name: /People/ })).toBeTruthy();
  expect(sections.tabViewItem(sections.tabViewItems[2]!.viewController)?.identifier).toBe("team");
});

it("removes an item with its view controller", async () => {
  await launch();
  await act(async () => { sections.selectedTabViewItemIndex = 2; });
  const team = sections.tabViewItems[2]!;
  await act(async () => { sections.removeTabViewItem(team); });
  expect(team.viewController.isDisposed).toBe(true);
  expect(sections.tabViewItems.map(item => item.identifier)).toEqual(["company", "framework"]);
  expect(sections.selectedTabViewItemIndex).toBe(1);
  expect(await screen.findByText("Framework page")).toBeTruthy();
  expect(() => sections.insertTabViewItem(new NSETabViewItem({ viewController: sections.parent!.addChild(Pane, "Stray") }), 0)).toThrow(/child of its tab view controller/);
});

it("restores the selected tab and remembers each new one", async () => {
  const stored = new Map<string, unknown>();
  const defaults = defaultsFrom({ read: (key: string) => stored.get(key), write: (key: string, value: unknown) => { stored.set(key, value); }, remove: (key: string) => { stored.delete(key); } });
  const restoration = {
    key: "sections.tab", version: 0, migrations: [], defaults,
    parse: (value: unknown) => typeof value === "string" ? { ok: true as const, value } : { ok: false as const, issues: ["An identifier."] },
    capture: (snapshot: { readonly selectedIdentifier: string | null }) => snapshot.selectedIdentifier ?? "company",
    restore: (tabs: NSETabViewController, value: unknown) => { tabs.selectTabViewItem(String(value)); },
  };
  let restored!: Remembering;
  class Remembering extends NSETabViewController {
    constructor() {
      super({ restoration });
      restored = this;
      for (const name of ["Company", "Team"]) this.addTabViewItem(new NSETabViewItem({ viewController: this.addChild(Pane, name), identifier: name.toLowerCase() }));
    }
  }
  class Holder extends NSEViewController {
    readonly tabs = this.addChild(Remembering);
    static override view = function HolderView({ controller }: { readonly controller: Holder }) { return <controller.tabs.view />; };
  }
  stored.set("sections.tab", "team");
  class RestoringWindow extends NSEWindowController { constructor() { super(); this.contentViewController = new Holder(); } }
  class RestoringApplication extends NSEApplication { static override mainWindow = RestoringWindow; }
  const host = createClassApplicationHost(RestoringApplication, "com.example.tab-view-restoration");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  expect(restored.selectedTabViewItem?.identifier).toBe("team");
  expect(await screen.findByText("Team page")).toBeTruthy();
  await act(async () => { restored.selectedTabViewItemIndex = 0; });
  expect(stored.get("sections.tab")).toBe("company");
});

it("puts toolbar-style tabs in the window toolbar and removes its own toolbar when the style changes", async () => {
  await launch();
  const window = sections.view.window!;
  expect(window.toolbar).toBeNull();
  await act(async () => { sections.tabStyle = "toolbar" as never; });
  expect(window.toolbar).not.toBeNull();
  const team = screen.getByRole("button", { name: "Team" });
  expect(team.closest('[data-nse-part="toolbar"]')).toBeTruthy();
  await act(async () => { fireEvent.click(team); });
  expect(sections.selectedTabViewItem?.identifier).toBe("team");
  expect(team.getAttribute("aria-pressed")).toBe("true");
  await act(async () => { sections.tabStyle = "segmentedControlOnBottom"; });
  expect(window.toolbar).toBeNull();
});

it("installs an initial toolbar tab style when its view first mounts in a window", async () => {
  class ToolbarContent extends NSEViewController {
    readonly tabs = this.addChild(Sections);
    constructor() { super(); this.tabs.tabStyle = "toolbar"; }
    static override view = function ToolbarContentView({ controller }: { readonly controller: ToolbarContent }) { return <controller.tabs.view />; };
  }
  class ToolbarWindow extends NSEWindowController { constructor() { super(); this.contentViewController = new ToolbarContent(); } }
  class ToolbarApplication extends NSEApplication { static override mainWindow = ToolbarWindow; }
  const host = createClassApplicationHost(ToolbarApplication, "com.example.toolbar-tabs");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  expect(screen.getByRole("button", { name: "Company" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Team" }).closest('[data-nse-part="toolbar"]')).toBeTruthy();
});

it("adds selectable toolbar tabs without replacing a window's existing toolbar or its items", async () => {
  await launch();
  const window = sections.view.window!;
  const toolbar = new NSEToolbar({ identifier: "existing", items: [{ kind: "custom", id: "status", label: "Status", minimumWidth: 50, idealWidth: 80, render: () => <span>Existing item</span> }], defaultItemIdentifiers: ["status"] });
  await act(async () => { window.toolbar = toolbar; sections.tabStyle = "toolbar" as never; });
  expect(window.toolbar).toBe(toolbar);
  expect(screen.getByText("Existing item")).toBeTruthy();
  const company = screen.getByRole("button", { name: "Company" });
  company.focus();
  await act(async () => { fireEvent.keyDown(company, { key: "ArrowRight" }); });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Framework" }));
  expect(sections.selectedTabViewItem?.identifier).toBe("framework");
  await act(async () => { sections.tabStyle = "unspecified"; });
  expect(window.toolbar).toBe(toolbar);
  expect(toolbar.itemIdentifiers).toEqual(["status"]);
  expect(screen.queryByRole("button", { name: "Framework" })).toBeNull();
});

it("retains toolbar tabs when the window replaces its active toolbar", async () => {
  await launch();
  const window = sections.view.window!;
  await act(async () => { sections.tabStyle = "toolbar"; });
  expect(screen.getByRole("button", { name: "Team" })).toBeTruthy();
  const replacement = new NSEToolbar({ identifier: "replacement", items: [{ kind: "custom", id: "replacement-item", label: "Replacement", minimumWidth: 50, idealWidth: 80, render: () => <span>Replacement toolbar item</span> }], defaultItemIdentifiers: ["replacement-item"] });
  await act(async () => { window.toolbar = replacement; });
  expect(screen.getByText("Replacement toolbar item")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Team" })).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Team" })); });
  expect(sections.selectedTabViewItem?.identifier).toBe("team");
  await act(async () => { sections.tabStyle = "unspecified"; });
  expect(window.toolbar).toBe(replacement);
  expect(screen.getByText("Replacement toolbar item")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Team" })).toBeNull();
});
