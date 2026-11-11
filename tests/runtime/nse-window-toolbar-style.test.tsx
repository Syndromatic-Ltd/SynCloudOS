// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEPreferencesToast } from "../../src/NSE/Components/NSEPreferencesToast";
import { NSEWindowTitlebarContent } from "../../src/NSE/Windows/windowTitlebarContext";
import { useNSEWindowTitlebarDocument, NSEWindowTitlebarHostContext } from "../../src/SynCloudOS/AppHosting/windowChrome";
import { NSEStandardWindowView } from "../../src/NSE/Windows/NSEStandardWindowView";
import { standardWindow } from "../fixtures/windowTestDependencies";
import type { WindowRecord } from "../../src/SynCloudOS/Windows";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { createClassApplicationHost } from "./fixtures/classApplicationHost";
import { act } from "@testing-library/react";
import { NSETopBar } from "../../src/NSE/Windows/Chrome/NSETopBar";

afterEach(cleanup);

it("keeps the host's Home and Account controls alongside window titlebar accessories", () => {
  render(<NSETopBar variant="atmoMetal" title="" leadingItems={[{kind:"webspring",label:"Home"}]}
    trailingItems={[{kind:"userInfo",label:"Account"}]}
    leadingAccessory={<button>Sections</button>} trailingAccessory={<span>Window action</span>} />);
  expect(screen.getByRole("button", {name:"Home"})).toBeTruthy();
  expect(screen.getByRole("button", {name:"Account"})).toBeTruthy();
  expect(screen.getByRole("button", {name:"Sections"})).toBeTruthy();
});

it("owns the Preferences panel and Back accessory while a class application is running", async () => {
  class Content extends NSEViewController {
    static override view = () => <NSEPreferencesToast open title="Preferences" backLabel="Back" onClose={() => {}}
      panes={[{ id: "appearance", label: "Appearance", render: () => <p>Appearance settings</p> }]} />;
  }
  class Window extends NSEWindowController { constructor() { super(); this.contentViewController = new Content(); } }
  class Application extends NSEApplication { static override mainWindow = Window; }
  const host = createClassApplicationHost(Application, "com.example.preferences-titlebar-owner");
  try {
    await host.launch();
    host.mountWindows();
    await act(async () => { await host.openMainWindow(); });
    expect(screen.getByRole("dialog", { name: "Preferences" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Appearance", exact: true }));
    expect(screen.getByRole("dialog", { name: "Appearance" })).toBeTruthy();
  } finally { await act(async () => { await host.dispose(); }); }
});

function PublishWindow({ controller }: { controller: NSEWindowController }) {
  useNSEWindowTitlebarDocument(controller, React.useContext(NSEWindowTitlebarHostContext));
  return <p>Window content</p>;
}

it.each(["automatic", "expanded", "preference", "unified", "unifiedCompact"] as const)("projects %s through the actual standalone window title bar", toolbarStyle => {
  const controller = new NSEWindowController();
  controller.window.title = "Reference document";
  controller.window.subtitle = "Work in progress";
  controller.window.toolbarStyle = toolbarStyle;
  const record = { ...standardWindow("reference-window"), id: "reference-window", runtimeId: "test", state: "open", isKey: true, isMain: true, zIndex: 1 } as WindowRecord;
  const view = render(<NSEStandardWindowView record={record} dirty={false} blocked={false} dispatchCommand={async () => ({ handled: true })}
    presentation={{ kind: "desktop-window", visible: true, bounds: record.bounds, safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 }, movable: false, resizable: false, titleBarVisible: true }}>
    <PublishWindow controller={controller} />
  </NSEStandardWindowView>);
  const bar = view.container.querySelector('[data-window-titlebar]')!;
  expect(bar.getAttribute("data-toolbar-style")).toBe(toolbarStyle);
  expect(bar.querySelector('[data-window-title]')?.textContent).toBe("Reference documentWork in progress");
  expect(bar.querySelector('.nse-window-titlebar-subtitle')?.textContent).toBe("Work in progress");
  view.unmount();
  controller.dispose();
});

it.each(["automatic", "expanded", "preference", "unified", "unifiedCompact"] as const)("renders the %s title and subtitle without a parent-section label", toolbarStyle => {
  const view = render(<NSEWindowTitlebarContent toolbarStyle={toolbarStyle} title="Buttons" subtitle="Work in progress" />);
  expect(view.getByRole("heading", { name: "Buttons" })).toBeTruthy();
  expect(view.getByText("Work in progress")).toBeTruthy();
  expect(view.container.querySelector("header")?.getAttribute("data-toolbar-style")).toBe(toolbarStyle);
  expect(view.container.textContent).toBe("ButtonsWork in progress");
});

it("defaults to automatic and observes every NSWindow.ToolbarStyle value", () => {
  const controller = new NSEWindowController();
  const window = controller.window;
  expect(window.toolbarStyle).toBe("automatic");
  let changes = 0;
  controller.subscribe(() => { changes++; });
  for (const style of ["expanded", "preference", "unified", "unifiedCompact", "automatic"] as const) {
    window.toolbarStyle = style;
    expect(window.toolbarStyle).toBe(style);
  }
  expect(changes).toBe(5);
  window.toolbarStyle = "automatic";
  expect(changes).toBe(5);
  expect(() => { window.toolbarStyle = "collapsing" as never; }).toThrow(TypeError);
  window.subtitle = "Work in progress";
  expect(window.subtitle).toBe("Work in progress");
  expect(() => { window.subtitle = 3 as never; }).toThrow(TypeError);
  controller.dispose();
});

it("gives Preferences its own preference title bar, following the pane and leading Back", () => {
  render(<NSEPreferencesToast open title="Preferences" backLabel="Back to Preferences" onClose={() => {}}
    panes={[{ id: "appearance", label: "Appearance", render: () => <p>Appearance settings</p> }]} />);
  const bar = document.querySelector('[data-toolbar-style="preference"]');
  expect(bar).not.toBeNull();
  expect(bar?.querySelector('[data-window-title]')?.textContent).toBe("Preferences");
  fireEvent.click(screen.getByRole("button", { name: "Appearance", exact: true }));
  expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Appearance");
  const back = screen.getByRole("button", { name: "Back to Preferences" });
  expect(back.closest('[data-layout-attribute="leading"]')).not.toBeNull();
  fireEvent.click(back);
  expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Preferences");
  expect(document.querySelector('.nse-control-page-header')).toBeNull();
});
