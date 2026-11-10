// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEBrowser } from "../../src/NSE/DataViews/Browser";
import { NSEListItem } from "../../src/NSE/Controls/Selection/NSEListItem";
import { NSEOutlineView } from "../../src/NSE/DataViews/Outline";
import { NSETreeController } from "../../src/NSE/Controllers";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";

afterEach(cleanup);
it("publishes browser columns and native disclosure state through drawing hooks", async () => {
  const rows = [{ id: "Folder", leaf: false }, { id: "File", leaf: true }];
  const { container } = render(<NSEBrowser aria-label="Files" presentation="columns" dataSource={{ rootItems: async () => rows, children: async () => [rows[1]!], idForItem: item => item.id, labelForItem: item => item.id, isLeaf: item => item.leaf }} />);
  const folder = await screen.findByRole("option", { name: "Folder" });
  expect(container.querySelector('[data-nse-part="columns"]')).not.toBeNull();
  expect(screen.getByRole("listbox").getAttribute("data-nse-part")).toBe("viewport");
  expect(folder.getAttribute("data-nse-expanded")).toBe("false");
  fireEvent.click(folder);
  await screen.findAllByRole("option", { name: "File" });
  expect(folder.getAttribute("data-nse-expanded")).toBe("true");
  expect(folder.getAttribute("aria-expanded")).toBe("true");
});
it("gives the existing list cell neutral text and accessory slots", () => {
  const { container } = render(<NSEListItem selected leading="Icon" trailing="Accessory" meta="Detail">Title</NSEListItem>);
  const cell = container.firstElementChild!;
  expect(cell.getAttribute("data-nse-control")).toBe("table-cell-view");
  expect(cell.hasAttribute("data-nse-selected")).toBe(true);
  for (const part of ["leading", "trailing", "text-content", "primary-text", "secondary-text"]) expect(cell.querySelector(`[data-nse-part="${part}"]`)).not.toBeNull();
});
it("publishes outline branch classification and expanded state without changing native activation", () => {
  interface Entry { readonly id: string; readonly children: readonly Entry[] }
  const leaf: Entry = { id: "File", children: [] };
  const rows: readonly Entry[] = [{ id: "Folder", children: [leaf] }];
  const controller = new NSETreeController({ owner: nseUnowned, id: "drawing-outline", content: rows, getId: item => item.id, getChildren: item => item.children, withChildren: (item, children) => ({ ...item, children }), selection: { mode: "multiple", allowsEmpty: true } });
  try {
    const { container } = render(<NSEOutlineView aria-label="Outline" controller={controller} idForItem={item => item.id} childrenForItem={item => item.children} labelForItem={item => item.id} />);
    const disclosure = screen.getByRole("button", { name: "Expand Folder" });
    expect(container.querySelector('[data-nse-control="outline-view"]')?.getAttribute("data-nse-selection-highlight-style")).toBe("regular");
    expect(disclosure.getAttribute("data-nse-expanded")).toBe("false");
    expect(container.querySelector('[data-nse-part="row"]')?.getAttribute("data-nse-type")).toBe("branch");
    fireEvent.click(disclosure);
    expect(screen.getByRole("button", { name: "Collapse Folder" }).getAttribute("data-nse-expanded")).toBe("true");
  } finally { controller.dispose(); }
});
