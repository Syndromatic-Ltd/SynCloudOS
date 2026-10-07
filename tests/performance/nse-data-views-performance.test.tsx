/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it } from "vitest";

import { NSEArrayController, NSETreeController } from "../../src/NSE/Controllers";
import { NSEOutline, NSETable, type NSEDataViewAdapter, type NSETableColumn } from "../../src/NSE/DataViews";
import { runStructuralScenario } from "./structural-performance-scenario";

interface Row { readonly id: string; readonly label: string }
interface OutlineNode { readonly id: string; readonly label: string; readonly children: readonly OutlineNode[] }
const rows = Object.freeze(Array.from({ length: 10_000 }, (_, index) => Object.freeze({ id: `row-${index}`, label: `Row ${index}` })));
const outlineChildren = Object.freeze(Array.from({ length: 50_000 }, (_, index) => Object.freeze({ id: `node-${index}`, label: `Node ${index}`, children: Object.freeze([]) })));
const outlineRoot: OutlineNode = Object.freeze({ id: "root", label: "Diagnostics", children: outlineChildren });
const columns: readonly NSETableColumn<Row, string, unknown>[] = [{ id: "label", title: "Label", value: (row) => row.label, width: { min: 100, ideal: 180, max: 320 } }];

afterEach(cleanup);

it("keeps the 10,000-row table and sparse 50,000-node outline structurally bounded", async () => {
  await runStructuralScenario({
    run: () => {
      const controller = new NSEArrayController<Row, string>({ id: "performance-table", content: rows, getId: (row) => row.id, selection: { mode: "multiple", allowsEmpty: true } });
      const adapter: NSEDataViewAdapter<Row, string> = { controller, idForItem: (row) => row.id, labelForItem: (row) => row.label };
      const before = controller.getSnapshot().arranged[5000];
      const view = render(<NSETable aria-label="Performance table" adapter={adapter} columns={columns} viewportBlockSize={230} />);
      const grid = view.getByRole("grid");
      const treeController = new NSETreeController<OutlineNode, string>({ id: "performance-outline", content: [outlineRoot], getId: (node) => node.id, getChildren: (node) => node.children, withChildren: (node, children) => ({ ...node, children }), clone: (node) => node, selection: { mode: "multiple", allowsEmpty: true } });
      const stableNode = treeController.getSnapshot().roots[0]!.children[25_000];
      let outlinePublications = 0;
      const unsubscribeOutline = treeController.subscribeChanges(() => { outlinePublications += 1; });
      const outline = render(<NSEOutline aria-label="Performance outline" controller={treeController} idForItem={(node) => node.id} childrenForItem={(node) => node.children} labelForItem={(node) => node.label} viewportBlockSize={230} />);
      fireEvent.click(outline.getByRole("button", { name: "Expand Diagnostics" }));
      const tree = outline.getByRole("tree");
      return {
        view, controller, outline, treeController, unsubscribeOutline, outlinePublications,
        wrappers: view.container.querySelectorAll('[data-nse-part="row"], [data-nse-part="cell"]').length,
        outlineWrappers: outline.container.querySelectorAll('[data-nse-part="row"]').length,
        active: grid.getAttribute("aria-activedescendant"), outlineActive: tree.getAttribute("aria-activedescendant"),
        before, after: controller.getSnapshot().arranged[5000], stableNode, stableNodeAfter: treeController.getSnapshot().roots[0]!.children[25_000],
      };
    },
    assertStructural: ({ view, controller, outline, treeController, unsubscribeOutline, outlinePublications, wrappers, outlineWrappers, active, outlineActive, before, after, stableNode, stableNodeAfter }) => {
      expect(wrappers).toBeLessThan(120);
      expect(outlineWrappers).toBeLessThan(120);
      expect(active).not.toBeNull();
      expect(outlineActive).not.toBeNull();
      expect(view.container.querySelector(`#${active}`)).not.toBeNull();
      expect(outline.container.querySelector(`#${outlineActive}`)).not.toBeNull();
      expect(after).toBe(before);
      expect(stableNodeAfter).toBe(stableNode);
      expect(outlinePublications).toBeLessThanOrEqual(1);
      unsubscribeOutline(); outline.unmount(); treeController.dispose();
      view.unmount(); controller.dispose();
    },
  });
});

it("keeps scroll updates bounded without controller publications or detached active descendants", async () => {
  await runStructuralScenario({
    run: () => {
      const controller = new NSEArrayController<Row, string>({ id: "performance-scroll", content: rows, getId: (row) => row.id, selection: { mode: "multiple", allowsEmpty: true } });
      let publications = 0;
      const unsubscribe = controller.subscribeChanges(() => { publications += 1; });
      const adapter: NSEDataViewAdapter<Row, string> = { controller, idForItem: (row) => row.id, labelForItem: (row) => row.label };
      const view = render(<NSETable aria-label="Scrolling table" adapter={adapter} columns={columns} viewportBlockSize={230} />);
      const grid = view.getByRole("grid");
      for (const scrollTop of [230, 460, 690]) { Object.defineProperty(grid, "scrollTop", { configurable: true, value: scrollTop, writable: true }); fireEvent.scroll(grid); }
      const active = grid.getAttribute("aria-activedescendant");
      return { view, controller, unsubscribe, publications, wrappers: view.container.querySelectorAll('[data-nse-part="row"], [data-nse-part="cell"]').length, active, renderedRowIndices: [...view.container.querySelectorAll<HTMLElement>('[data-nse-part="row"][aria-rowindex]')].map((row) => Number(row.getAttribute("aria-rowindex"))) };
    },
    assertStructural: ({ view, controller, unsubscribe, publications, wrappers, active, renderedRowIndices }) => {
      expect(publications).toBeLessThanOrEqual(4);
      expect(wrappers).toBeLessThan(120);
      expect(view.container.querySelector(`#${active}`)).not.toBeNull();
      expect(Math.max(...renderedRowIndices)).toBeGreaterThan(20);
      unsubscribe(); view.unmount(); controller.dispose();
    },
  });
});
