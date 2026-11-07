// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController, nseUpdateTraits } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { useObserve } from "../../src/NSE/Objects/useObserve";
import { NSEPageController } from "../../src/NSE/Page";
import { pageCurlConnection } from "../../src/NSE/Page/pageCurlConnection";
import type { NSEPageEvent, NSEPageHandle } from "../../src/NSE/Page/nsePageTypes";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.dispose();
});

interface Entry { readonly kind: "folder" | "note"; readonly name: string }
let pageRenders = 0;

class EntryPage extends NSEViewController {
  constructor(readonly kind: string) { super(); }
  static override view = function EntryPageView({ controller }: { readonly controller: EntryPage }) {
    pageRenders++;
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

it("describes a single curling page without exposing the curl engine", () => {
  const book = new NSEPageController({ transitionStyle: "pageCurl" });
  expect(book.spineLocation).toBe("min");
  expect(book.getSnapshot()).toEqual({ selectedIndex: 0, count: 0, turnProgress: 0, turnDirection: null });
  book.spineLocation = "mid";
  expect(book.spineLocation).toBe("mid");
  expect(() => { book.spineLocation = "max" as never; }).toThrow(TypeError);
  book.dispose();
});

class Book extends NSEPageController<Entry> {
  readonly transitions: string[] = [];
  constructor() {
    super({ transitionStyle: "pageCurl" });
    this.arrangedObjects = Array.from({ length: 5 }, (_, index) => ({ kind: "note", name: `Page ${index + 1}` }));
  }
  override identifierForObject(entry: Entry) { return entry.kind; }
  override viewControllerForIdentifier(identifier: string) { return this.addChild(EntryPage, identifier); }
  override didTransitionToObject(entry: Entry) { this.transitions.push(entry.name); }
}

function curlEvent(progress: number, direction: "forward" | "backward" = "forward", phase: "dragging" | "turning" | "idle" = "turning", reason: NSEPageEvent["reason"] = "gesture"): NSEPageEvent {
  return { reason, snapshot: { progress, direction, phase, reason, targetProgress: 1, mode: "curl", edge: direction === "forward" ? "right" : "left", torn: false, turnId: 1, updatedAt: 0 } };
}

it("keeps selection and represented pages until the curl completes, including a returned drag", () => {
  const book = new Book();
  expect(book.viewControllerAt(0)).not.toBe(book.viewControllerAt(1));
  expect(book.viewControllerAt(0)!.representedObject).toBe(book.arrangedObjects[0]);
  const engine = pageCurlConnection(book);
  engine.progress(.5, curlEvent(.5, "forward", "dragging"));
  expect(book.selectedIndex).toBe(0);
  expect(book.getSnapshot()).toMatchObject({ turnProgress: .5, turnDirection: "forward" });
  engine.progress(1, curlEvent(1));
  expect(book.transitions).toEqual([]);
  engine.end(curlEvent(1, "forward", "idle"));
  expect(book.selectedIndex).toBe(1);
  expect(book.transitions).toEqual(["Page 2"]);
  expect(book.getSnapshot()).toMatchObject({ turnProgress: 0, turnDirection: null });
  engine.progress(.15, curlEvent(.15, "backward", "dragging"));
  engine.progress(0, curlEvent(0, "backward", "idle", "cancel"));
  expect(book.selectedIndex).toBe(1);
  expect(book.getSnapshot()).toMatchObject({ turnProgress: 0, turnDirection: null });
  expect(book.transitions).toEqual(["Page 2"]);
  book.dispose();
});

it("turns spreads in both directions, gates overlapping commands, and cancels on replacement", () => {
  const book = new Book();
  book.spineLocation = "mid";
  const engine = pageCurlConnection(book);
  const turns: string[] = [];
  const attach = (direction: "forward" | "backward") => engine.attach(direction, {
    reset() {}, setProgress() {}, turnTo(progress, options) { turns.push(`${direction}:${progress}:${options?.edge}`); },
  } as NSEPageHandle);
  attach("forward"); attach("backward");
  book.navigateForward(); book.navigateForward();
  expect(turns).toEqual(["forward:1:right"]);
  expect(book.selectedIndex).toBe(0);
  engine.end(curlEvent(1, "forward", "idle"));
  expect(book.selectedIndex).toBe(2);
  book.navigateBack();
  expect(turns.at(-1)).toBe("backward:1:left");
  engine.end(curlEvent(1, "backward", "idle"));
  expect(book.selectedIndex).toBe(0);
  book.navigateForward();
  book.selectedIndex = 4;
  engine.end(curlEvent(1, "forward", "idle", "superseded"));
  expect(book.selectedIndex).toBe(4);
  expect(book.canNavigateForward).toBe(false);
  expect(book.transitions).toEqual(["Page 3", "Page 1"]);
  book.dispose();
});

let history!: History;
let days!: Days;
let liveBook!: Book;
class Content extends NSEViewController {
  readonly history = this.addChild(History);
  readonly days = this.addChild(Days);
  readonly book = this.addChild(Book);
  constructor() { super(); history = this.history; days = this.days; liveBook = this.book; this.book.title = "Book"; }
  static override view = function ContentView({ controller }: { readonly controller: Content }) {
    return <><controller.history.view /><controller.days.view /><controller.book.view /></>;
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

it("renders one live child per printed page and completes real reduced-motion button turns", async () => {
  await launch();
  const view = screen.getByLabelText("Book");
  await act(async () => { liveBook[nseUpdateTraits]({ ...liveBook.traitCollection, reducedMotion: true }); });
  expect(view.getAttribute("data-transition-style")).toBe("pageCurl");
  expect(view.querySelectorAll('.nse-page__face--front [data-nse-view-controller]')).toHaveLength(1);
  const before = pageRenders;
  await act(async () => {
    for (let frame = 1; frame < 20; frame++) pageCurlConnection(liveBook).progress(frame / 40, curlEvent(frame / 40, "forward", "dragging"));
  });
  expect(pageRenders).toBe(before);
  await act(async () => { liveBook.selectedIndex = liveBook.selectedIndex; });
  await act(async () => { fireEvent.click(within(view).getByRole("button", { name: "Next page" })); });
  expect(liveBook.selectedIndex).toBe(1);
  expect(liveBook.transitions).toEqual(["Page 2"]);
  await act(async () => { fireEvent.click(within(view).getByRole("button", { name: "Previous page" })); });
  expect(liveBook.selectedIndex).toBe(0);
  expect(liveBook.transitions).toEqual(["Page 2", "Page 1"]);
  await act(async () => { liveBook.spineLocation = "mid"; });
  expect(view.querySelectorAll('.nse-page__face--front [data-nse-view-controller]')).toHaveLength(2);
  await act(async () => { liveBook.navigateForward(); });
  expect(liveBook.selectedIndex).toBe(2);
  expect(liveBook.getSnapshot()).toMatchObject({ turnProgress: 0, turnDirection: null });
  expect(() => liveBook.navigateForwardToObject(liveBook.arrangedObjects[0]!)).toThrow(/distant page/);
});

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
