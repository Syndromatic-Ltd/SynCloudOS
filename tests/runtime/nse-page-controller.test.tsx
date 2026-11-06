// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { useObserve } from "../../src/NSE/Objects/useObserve";
import { NSEPageController } from "../../src/NSE/Page";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.dispose();
});

interface Entry { readonly kind: "folder" | "note"; readonly name: string }

class EntryPage extends NSEViewController {
  constructor(readonly kind: string) { super(); }
  static override view = function EntryPageView({ controller }: { readonly controller: EntryPage }) {
    useObserve(controller);
    const object = controller.representedObject as Entry | string | undefined;
    return <p>{controller.kind}: {typeof object === "string" ? object : object?.name}</p>;
  };
}

/** A history of folders and notes; every folder shares one page, as do the notes. */
class History extends NSEPageController<Entry> {
  readonly made: string[] = [];
  readonly transitions: string[] = [];
  constructor() {
    super({ title: "Notes" });
    this.arrangedObjects = [{ kind: "folder", name: "All notes" }];
  }
  override identifierForObject(entry: Entry) { return entry.kind; }
  override viewControllerForIdentifier(identifier: string) {
    this.made.push(identifier);
    return this.addChild(EntryPage, identifier);
  }
  override didTransitionToObject(entry: Entry) { this.transitions.push(entry.name); }
}

class Days extends NSEPageController<string> {
  constructor() {
    super({ transitionStyle: "horizontalStrip", title: "Days" });
    this.arrangedObjects = ["Saturday", "Sunday", "Monday"];
  }
  override viewControllerForIdentifier(identifier: string) { return this.addChild(EntryPage, identifier); }
}

let history!: History;
let days!: Days;
class Content extends NSEViewController {
  readonly history = this.addChild(History);
  readonly days = this.addChild(Days);
  constructor() { super(); history = this.history; days = this.days; }
  static override view = function ContentView({ controller }: { readonly controller: Content }) {
    return <><controller.history.view /><controller.days.view /></>;
  };
}
class MainWindow extends NSEWindowController {
  constructor() { super(); this.contentViewController = new Content(); }
}
class Application extends NSEApplication { static override mainWindow = MainWindow; }

async function launch() {
  const host = createClassApplicationHost(Application, "com.example.page-controller");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  return host;
}

it("keeps a history: forward to a new page drops the pages after the selected one (stackHistory)", async () => {
  await launch();
  expect(history.transitionStyle).toBe("stackHistory");
  expect(await screen.findByText("folder: All notes")).toBeTruthy();
  expect(history.canNavigateBack).toBe(false);

  await act(async () => { history.navigateForwardToObject({ kind: "folder", name: "Travel" }); });
  expect(await screen.findByText("folder: Travel")).toBeTruthy();
  // Both folders share the one folder page, which now shows Travel.
  expect(history.made).toEqual(["folder"]);
  await act(async () => { history.navigateForwardToObject({ kind: "note", name: "Lisbon" }); });
  expect(await screen.findByText("note: Lisbon")).toBeTruthy();
  expect(screen.queryByText(/^folder:/)).toBeNull();
  expect(history.arrangedObjects.map(entry => entry.name)).toEqual(["All notes", "Travel", "Lisbon"]);

  await act(async () => { history.navigateBack(); });
  expect(await screen.findByText("folder: Travel")).toBeTruthy();
  expect(history.canNavigateForward).toBe(true);
  await act(async () => { history.navigateBack(); });
  expect(await screen.findByText("folder: All notes")).toBeTruthy();
  await act(async () => { history.navigateForwardToObject({ kind: "note", name: "Shopping" }); });
  expect(history.arrangedObjects.map(entry => entry.name)).toEqual(["All notes", "Shopping"]);
  expect(history.selectedIndex).toBe(1);
  expect(history.transitions).toEqual(["Travel", "Lisbon", "Travel", "All notes", "Shopping"]);

  // A swipe to the right goes back.
  const view = screen.getByLabelText("Notes");
  await act(async () => {
    fireEvent.pointerDown(view, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(view, { pointerId: 1, clientX: 220, clientY: 12 });
  });
  expect(history.selectedIndex).toBe(0);
});

it("lays its pages side by side and turns them with a swipe (horizontalStrip)", async () => {
  await launch();
  await screen.findByText("Saturday: Saturday");
  const view = screen.getByLabelText("Days");
  const pages = [...view.querySelectorAll("[aria-roledescription='page']")];
  expect(pages).toHaveLength(3);
  expect(pages.map(page => page.getAttribute("data-active"))).toEqual(["true", "false", "false"]);
  expect(pages[1]!.hasAttribute("inert")).toBe(true);
  expect(screen.getByText("Monday: Monday")).toBeTruthy();

  await act(async () => {
    fireEvent.pointerDown(view, { pointerId: 1, isPrimary: true, clientX: 200, clientY: 10 });
    fireEvent.pointerUp(view, { pointerId: 1, clientX: 100, clientY: 14 });
  });
  expect(days.selectedIndex).toBe(1);
  expect(view.getAttribute("data-selected-index")).toBe("1");
  expect((view.querySelector(".nse-container-sliding-view-track") as HTMLElement).style.transform).toBe("translate3d(-100%, 0, 0)");
  // A short or vertical drag does not turn the page, nor does a swipe past the first page.
  await act(async () => {
    fireEvent.pointerDown(view, { pointerId: 2, isPrimary: true, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(view, { pointerId: 2, clientX: 120, clientY: 10 });
  });
  expect(days.selectedIndex).toBe(1);
  await act(async () => { days.selectedIndex = 0; });
  await act(async () => {
    fireEvent.pointerDown(view, { pointerId: 3, isPrimary: true, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(view, { pointerId: 3, clientX: 220, clientY: 10 });
  });
  expect(days.selectedIndex).toBe(0);
});

it("refuses a page that is not its child", async () => {
  await launch();
  class Stray extends NSEPageController<string> {
    override viewControllerForIdentifier() { return days.viewControllerAt(0)!; }
  }
  const stray = history.parent!.addChild(Stray);
  expect(() => { stray.arrangedObjects = ["Lost"]; }).toThrow(/must be a child of its page controller/);
});
