// @vitest-environment jsdom
import React, { useSyncExternalStore, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { NSESplitViewController, NSESplitViewItem } from "../../src/NSE/DataViews/Split";
import { NSEPageController } from "../../src/NSE/Page/NSEPageController";
import { NSEApplicationNavigationChromeController, NSEApplicationNavigationChromeProvider } from "../../src/NSE/Navigation/NSEApplicationNavigationChrome";
import { TestContentViewController, updateTraits } from "../fixtures/tabViewController";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";

const owned: Array<{ dispose(): void }> = [];
afterEach(() => { cleanup(); for (const controller of owned.splice(0)) controller.dispose(); });
function compact(controller: NSEViewController<unknown>) { updateTraits(controller, createStaticPresentationTraits({ width: 390, height: 844 })); }

function splitHierarchy() {
  const split = new NSESplitViewController({ id: "back-contract", title: "Workspace" }); owned.push(split);
  const detail = new TestContentViewController("Detail", () => <input aria-label="Detail draft" />);
  const list = new TestContentViewController("List", () => <button onClick={() => split.showDetail(detail)}>Open detail</button>);
  const home = new TestContentViewController("Home", () => <button onClick={() => split.showDetail(list)}>Open list</button>);
  for (const [identifier, viewController, behavior] of [["home", home, "sidebar"], ["list", list, "contentList"], ["detail", detail, "default"]] as const) {
    split.addSplitViewItem(new NSESplitViewItem({ identifier, viewController, behavior }));
  }
  compact(split);
  return split;
}

function Stage({ controller }: { controller: NSEApplicationNavigationChromeController }) {
  const active = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot).active;
  return <header data-testid="stage-chrome"><h1>{active?.title ?? "Application"}</h1>{active?.back ? <button onClick={active.back.onActivate}>{active.back.label}</button> : null}</header>;
}
function renderAtStage(controller: NSEViewController<unknown>, available = true) {
  const chrome = new NSEApplicationNavigationChromeController(); owned.push(chrome);
  render(<NSEApplicationNavigationChromeProvider controller={chrome} standardChromeAvailable={available}><Stage controller={chrome} /><NSEViewControllerView controller={controller} /></NSEApplicationNavigationChromeProvider>);
  return chrome;
}

it.each([false, true])("restores each initiating pane control through two %s-stage split Back actions", (stage) => {
  const split = splitHierarchy();
  if (stage) renderAtStage(split); else render(<NSEViewControllerView controller={split} />);
  const openList = screen.getByRole("button", { name: "Open list" }); openList.focus(); fireEvent.click(openList);
  const openDetail = screen.getByRole("button", { name: "Open detail" }); openDetail.focus(); fireEvent.click(openDetail);
  const backList = screen.getByRole("button", { name: "Back to List" });
  if (stage) {
    expect(backList.closest('[data-testid="stage-chrome"]')).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Detail" })).toBeTruthy();
    expect(document.querySelector('[data-nse-part="split-compact-chrome"]')).toBeNull();
  }
  backList.focus(); fireEvent.click(backList);
  expect(document.activeElement).toBe(openDetail);
  const backHome = screen.getByRole("button", { name: "Back to Home" }); backHome.focus(); fireEvent.click(backHome);
  expect(document.activeElement).toBe(openList);
  expect(split.compactItem?.identifier).toBe("home");
});

it("keeps the split Back inline when a custom stage has no standard top bar", () => {
  const split = splitHierarchy(); renderAtStage(split, false);
  fireEvent.click(screen.getByRole("button", { name: "Open list" }));
  expect(screen.getByRole("button", { name: "Back to Home" }).closest('[data-nse-part="split-compact-chrome"]')).toBeTruthy();
  expect(screen.getByTestId("stage-chrome").querySelector("button")).toBeNull();
});

it("leaves the stage title to its window when a peer split collapses its sidebar", () => {
  const split = new NSESplitViewController({ id: "peer-frame", splitViewItems: [
    new NSESplitViewItem({ identifier: "sidebar", behavior: "sidebar", viewController: new TestContentViewController("Sections", () => <p>Sections</p>) }),
    new NSESplitViewItem({ identifier: "content", viewController: new TestContentViewController("Content", () => <p>Content</p>) }),
  ] }); owned.push(split); compact(split);
  split.splitViewItems[0]!.isCollapsed = true;
  const chrome = renderAtStage(split);
  expect(screen.getByText("Content", { selector: "p" })).toBeTruthy();
  expect(chrome.getSnapshot().active).toBeNull();
  expect(screen.getByRole("heading", { name: "Application" })).toBeTruthy();
});

class History extends NSEPageController<string> {
  constructor(readonly content?: (identifier: string) => ReactNode) { super({ title: "History" }); this.arrangedObjects = ["Home"]; }
  override viewControllerForIdentifier(identifier: string) {
    return this.addChild(TestContentViewController, identifier, () => this.content?.(identifier) ?? (identifier === "Home" ? <button onClick={() => this.navigateForwardToObject("Detail")}>Read detail</button> : <input aria-label="Page draft" />));
  }
}

it.each([false, true])("draws one compact stack-history Back with %s-stage ownership", (stage) => {
  const pages = new History(); owned.push(pages); compact(pages);
  if (stage) renderAtStage(pages); else render(<NSEViewControllerView controller={pages} />);
  compact(pages);
  fireEvent.click(screen.getByRole("button", { name: "Read detail" }));
  const back = screen.getByRole("button", { name: "Back to Home" });
  expect(Boolean(back.closest('[data-testid="stage-chrome"]'))).toBe(stage);
  if (stage) expect(screen.getByRole("heading", { name: "Detail" })).toBeTruthy();
  fireEvent.click(back);
  expect(pages.selectedIndex).toBe(0);
  expect(document.activeElement).toBe(screen.getByRole("region", { name: "Home" }));
  expect(screen.getByRole("button", { name: "Read detail" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Back to Home" })).toBeNull();
});

it("keeps an outer split's stage claim while nested history uses inline Back", () => {
  const pages = new History();
  const split = new NSESplitViewController({ id: "outer-split", title: "Outer", splitViewItems: [
    new NSESplitViewItem({ identifier: "history", behavior: "sidebar", viewController: pages }),
    new NSESplitViewItem({ identifier: "detail", viewController: new TestContentViewController("Other", () => <p>Other</p>) }),
  ] }); owned.push(split); compact(split); renderAtStage(split);
  compact(pages);
  fireEvent.click(screen.getByRole("button", { name: "Read detail" }));
  expect(screen.getByRole("heading", { name: "Outer" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back to Home" }).closest('[data-testid="stage-chrome"]')).toBeNull();
});

it("leaves horizontal strips and regular-width history without compact Back chrome", () => {
  const pages = new History(); owned.push(pages); compact(pages); pages.transitionStyle = "horizontalStrip";
  const chrome = renderAtStage(pages);
  compact(pages);
  act(() => pages.navigateForwardToObject("Detail"));
  expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
  expect(chrome.getSnapshot().active).toBeNull();
  act(() => { pages.transitionStyle = "stackHistory"; });
  expect(chrome.getSnapshot().active?.back?.label).toBe("Back to Home");
  updateTraits(pages, createStaticPresentationTraits({ width: 1280, height: 844 }));
  expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
  expect(chrome.getSnapshot().active).toBeNull();
});
