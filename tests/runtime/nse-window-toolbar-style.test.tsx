// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEPreferencesToast } from "../../src/NSE/Components/NSEPreferencesToast";
import { NSEWindowTitlebarContent } from "../../src/NSE/Windows/windowTitlebarContext";

afterEach(cleanup);

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
