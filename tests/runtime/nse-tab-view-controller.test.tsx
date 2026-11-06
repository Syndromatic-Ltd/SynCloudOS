// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSETabViewController, NSETabViewItem } from "../../src/NSE/Navigation/NSETabViewController";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.dispose();
});

class Pane extends NSEViewController {
  constructor(readonly name: string) { super({ title: name }); }
  static override view = function PaneView({ controller }: { readonly controller: Pane }) {
    return <p>{controller.name} page</p>;
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
  const preferences = { read: (key: string) => stored.get(key), write: (key: string, value: unknown) => { stored.set(key, value); } };
  const restoration = {
    key: "sections.tab", version: 0, migrations: [], preferences,
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
