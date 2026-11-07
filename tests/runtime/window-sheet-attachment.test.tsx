// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSEToolbar } from "../../src/NSE/Toolbars/NSEToolbar";
import { observable } from "../../src/NSE/Objects";
import { action } from "../../src/SynCloudOS/AppSDK/actions";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];

function inertAncestor(element: Element | null): Element | null {
  for (let current = element; current; current = current.parentElement) {
    if ((current as HTMLElement & { inert: boolean }).inert) return current;
  }
  return null;
}
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.dispose();
});

it("attaches a sheet under the window's toolbar, blocks the window and refuses its close button", async () => {
  let content!: Content;
  class Sheet extends NSEViewController {
    override title = "Rename";
    static override view = function SheetView() {
      return <NSEButton title="Use paper" action="choose" actionPayload="paper" />;
    };
  }
  class Content extends NSEViewController {
    @observable accessor chosen = "none";
    constructor() { super(); content = this; }
    // The sheet's action reaches its presenter, the next responder after the sheet.
    @action choose(value: string) { this.chosen = value; }
    static override view = function ContentView({ controller }: { readonly controller: Content }) {
      return <>
        <button onClick={() => { controller.presentAsSheet(Sheet); }}>Rename…</button>
        <output aria-label="Chosen">{controller.chosen}</output>
      </>;
    };
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Content(); }
    override windowDidLoad() {
      this.window.toolbar = new NSEToolbar({ identifier: "main", items: [{ id: "share", kind: "button", label: "Share" }], defaultItemIdentifiers: ["share"] });
      this.window.setContentBorderThickness(56, "minY");
      this.window.bottomBarAccessory = <button>Footer action</button>;
    }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.window-sheet");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  let windowId!: string;
  await act(async () => { windowId = await host.openMainWindow(); });
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Rename…" })); });

  const sheet = await screen.findByRole("dialog", { name: "Rename" });
  const layer = sheet.closest(".nse-window-sheet-layer") as HTMLElement;
  expect(layer).not.toBeNull();
  expect(layer.dataset.sheetAttached).toBe("true");
  // The layer is in the window's content area, under the toolbar.
  const area = layer.parentElement!;
  expect(area.classList.contains("nse-window-chrome-content")).toBe(true);
  const toolbar = area.parentElement!.querySelector(".nse-window-toolbar") as HTMLElement & { inert: boolean };
  expect(toolbar.inert).toBe(true);
  const contentButton = screen.getByRole("button", { name: "Rename…", hidden: true });
  const footerButton = screen.getByRole("button", { name: "Footer action", hidden: true });
  expect(inertAncestor(contentButton)).not.toBeNull();
  expect(inertAncestor(footerButton)).not.toBeNull();

  // The sheet's controls belong to the sheet's modal focus scope, so they can take focus.
  const usePaper = screen.getByRole("button", { name: "Use paper" });
  await act(async () => { usePaper.focus(); });
  expect(document.activeElement).toBe(usePaper);
  expect(host.runtime.focus.getFocusedResponderId()).toMatch(/^view:com\.example\.window-sheet:/);
  await act(async () => { fireEvent.click(usePaper); });
  expect(content.chosen).toBe("paper");

  const refused = await act(async () => host.runtime.windows.requestClose(windowId, { reason: "control" }));
  expect(refused.outcome).not.toBe("closed");

  await act(async () => { content.presentedViewControllers[0]!.dismiss(); });
  expect(screen.queryByRole("dialog", { name: "Rename" })).toBeNull();
  expect(toolbar.inert).toBe(false);
  expect(inertAncestor(contentButton)).toBeNull();
  expect(inertAncestor(footerButton)).toBeNull();
  const closed = await act(async () => host.runtime.windows.requestClose(windowId, { reason: "control" }));
  expect(closed.outcome).toBe("closed");
});

it("attaches an alert to its window as a sheet (NSAlert.beginSheetModal(for:))", async () => {
  const { NSEAlert, NSEModalResponse } = await import("../../src/NSE/Application/NSEAlert");
  let windowController!: MainWindow;
  class Content extends NSEViewController {
    static override view = function ContentView() { return <p>Post</p>; };
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); windowController = this; this.contentViewController = new Content(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.window-alert-sheet");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  await screen.findByText("Post");
  const alert = new NSEAlert();
  alert.messageText = "Delete this post?";
  alert.addButton("Delete");
  alert.addButton("Cancel");
  let response!: Promise<number>;
  await act(async () => { response = alert.beginSheetModal(windowController.window); });
  const sheet = await screen.findByRole("alertdialog", { name: "Delete this post?" });
  expect(sheet.closest(".nse-window-sheet-layer")).not.toBeNull();
  expect(inertAncestor(screen.getByText("Post", { ignore: false }))).not.toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel" })); });
  await expect(response).resolves.toBe(NSEModalResponse.alertSecondButtonReturn);
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("presents a view controller as a centred modal window (presentAsModalWindow)", async () => {
  let content!: Content;
  class Preferences extends NSEViewController {
    override title = "Preferences";
    cancelled = 0;
    constructor() { super(); this.preferredContentSize = { width: 400, height: 0 }; }
    cancelOperation() { this.cancelled += 1; this.dismiss(); }
    static override view = function PreferencesView() {
      return <NSEButton title="Use weeks" action="choose" actionPayload="weeks" />;
    };
  }
  class Content extends NSEViewController {
    @observable accessor chosen = "none";
    constructor() { super(); content = this; }
    @action choose(value: string) { this.chosen = value; }
    static override view = function ContentView({ controller }: { readonly controller: Content }) {
      return <button onClick={() => { controller.presentAsModalWindow(Preferences); }}>Preferences…</button>;
    };
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Content(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.modal-window");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Preferences…" })); });

  const panel = await screen.findByRole("dialog", { name: "Preferences" });
  // Not attached to the window as a sheet: it is the application's modal plate.
  expect(panel.closest(".nse-window-sheet-layer")).toBeNull();
  expect(panel.closest(".nse-modal-window, .nse-overlay-popup")).not.toBeNull();
  const presented = content.presentedViewControllers[0] as Preferences;
  expect(presented.presentingViewController).toBe(content);
  // Its actions reach its presenter after itself.
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use weeks" })); });
  expect(content.chosen).toBe("weeks");
  // Escape sends cancelOperation, which dismisses (disposes) it.
  await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
  expect(presented.cancelled).toBe(1);
  expect(presented.isDisposed).toBe(true);
  expect(content.presentedViewControllers).toEqual([]);
});
