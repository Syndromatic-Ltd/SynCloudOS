// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WindowTitleBar } from "../../src/NSE/Windows/WindowTitleBar";
import { WindowTitlebarView } from "../../src/NSE/Windows/WindowTitlebarView";
import { WindowTitlebarDocumentContext } from "../../src/NSE/Windows/windowTitlebarContext";
import { createCanonicalWindowRecord } from "../../src/SynCloudOS/Windows/windowTypes";
import { standardWindow } from "../fixtures/windowTestDependencies";

afterEach(cleanup);
const record = createCanonicalWindowRecord(standardWindow("layout-window"), "titlebar-test", "layout-window");

it("draws the requested floating surface only for Cumulus", () => {
  const document = { title: "Draft", subtitle: "", documentEdited: false, titlebarPresentation: "floating" as const };
  const view = render(<WindowTitlebarView document={document} isKeyWindow material="cumulus" />);
  expect(view.container.querySelector('[data-nse-part="floating-titlebar"]')).not.toBeNull();
  view.rerender(<WindowTitlebarView document={document} isKeyWindow material="metal" />);
  expect(view.container.querySelector('[data-nse-part="floating-titlebar"]')).toBeNull();
});

it("keeps an empty menu portal target mounted and reports its disposal", () => {
  const slots = vi.fn();
  const view = render(<WindowTitlebarView document={{ title: "Draft", subtitle: "", documentEdited: false }} isKeyWindow onSlotsChange={slots} />);
  const menu = view.container.querySelector("[data-window-menu-slot]");
  expect(menu).not.toBeNull();
  expect(slots).toHaveBeenLastCalledWith(expect.objectContaining({ menuBar: menu }));
  view.unmount();
  expect(slots).toHaveBeenLastCalledWith(expect.objectContaining({ menuBar: null }));
});

it("honours a hidden window title without removing its accessible naming target", () => {
  const document = { title: "Private draft", subtitle: "Unsaved", documentEdited: true, titleVisibility: "hidden" as const };
  const view = render(<WindowTitlebarDocumentContext value={document}>
    <WindowTitleBar record={record} dirty dispatchCommand={vi.fn()} />
  </WindowTitlebarDocumentContext>);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(view.container.querySelector(`#${record.id}-title`)?.textContent).toBe("Private draftUnsaved");
});

it("excludes window controls from the move and double-click gesture handlers", () => {
  const move = vi.fn(), zoom = vi.fn(), dispatch = vi.fn();
  render(<WindowTitleBar record={record} dirty={false} dispatchCommand={dispatch} moveHandleProps={{ onPointerDown: move, onDoubleClick: zoom }} />);
  const close = screen.getByRole("button", { name: `Close ${record.title}` });
  fireEvent.pointerDown(close);
  fireEvent.doubleClick(close);
  fireEvent.click(close);
  expect(move).not.toHaveBeenCalled();
  expect(zoom).not.toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledWith("window.close", { windowControllerId: record.id });
});

it.each(["unified", "unifiedCompact", "expanded", "preference"] as const)("provides a toolbar portal target for %s", toolbarStyle => {
  const document = { title: "Draft", subtitle: "", documentEdited: false, toolbarStyle, hasToolbar: true };
  const view = render(<WindowTitlebarDocumentContext value={document}>
    <WindowTitleBar record={record} dirty={false} dispatchCommand={vi.fn()} />
  </WindowTitlebarDocumentContext>);
  expect(view.container.querySelector("[data-window-toolbar-slot]")).not.toBeNull();
});
