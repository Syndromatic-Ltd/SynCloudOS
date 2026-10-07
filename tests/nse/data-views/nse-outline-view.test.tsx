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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSETreeController } from "../../../src/NSE/Controllers";
import { IndexPath, TreeNode } from "../../../src/SynCloudOS/Models";
import {
  NSEOutline,
  flattenVisibleTree,
  type NSEOutlineSelectionEvent,
} from "../../../src/NSE/DataViews/Outline";

interface FileNode {
  readonly id: string;
  readonly name: string;
  readonly children: readonly FileNode[];
  readonly canLoad?: boolean;
}

const report: FileNode = { id: "report", name: "Report", children: [] };
const documents: FileNode = { id: "documents", name: "Documents", children: [report] };
const pictures: FileNode = { id: "pictures", name: "Pictures", children: [] };

function createController(content: readonly FileNode[] = [documents, pictures], loadChildren?: (item: FileNode, signal: AbortSignal) => Promise<readonly FileNode[]>) {
  return new NSETreeController<FileNode, string>({
    id: `files-${content.length}`,
    content,
    getId: (item) => item.id,
    getChildren: (item) => item.children,
    withChildren: (item, children) => ({ ...item, children }),
    loadChildren,
    selection: { mode: "multiple", allowsEmpty: true },
  });
}

afterEach(cleanup);

describe("NSEOutline", () => {
  it("maps rows, levels and items while expanding and collapsing selection to the parent", () => {
    const controller = createController();
    const changes = vi.fn();
    render(
      <NSEOutline
        aria-label="Files"
        controller={controller}
        idForItem={(node) => node.id}
        childrenForItem={(node) => node.children}
        labelForItem={(node) => node.name}
        onSelectionChange={changes}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand Documents" }));
    expect(screen.getByRole("treeitem", { name: /Report/ }).getAttribute("aria-level")).toBe("2");
    fireEvent.click(screen.getByRole("treeitem", { name: /Report/ }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse Documents" }));

    const event = changes.mock.calls.at(-1)?.[0] as NSEOutlineSelectionEvent<string>;
    expect(event.reason).toBe("collapse-parent");
    expect(event.snapshot.selectedIds).toEqual(new Set(["documents"]));
    expect(screen.queryByRole("treeitem", { name: /Report/ })).toBeNull();
    expect(document.getElementById(screen.getByRole("tree").getAttribute("aria-activedescendant")!)?.textContent).toContain("Documents");
  });

  it("honours expansion delegate veto and publishes successful expansion", () => {
    const controller = createController();
    const didExpand = vi.fn();
    const view = render(
      <NSEOutline
        aria-label="Files"
        controller={controller}
        idForItem={(node) => node.id}
        childrenForItem={(node) => node.children}
        labelForItem={(node) => node.name}
        delegate={{ shouldExpand: () => false, didExpand }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand Documents" }));
    expect(controller.getSnapshot().expandedIds.size).toBe(0);

    view.rerender(
      <NSEOutline
        aria-label="Files"
        controller={controller}
        idForItem={(node) => node.id}
        childrenForItem={(node) => node.children}
        labelForItem={(node) => node.name}
        delegate={{ shouldExpand: () => true, didExpand }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand Documents" }));
    expect(controller.getSnapshot().expandedIds).toEqual(new Set(["documents"]));
    expect(didExpand).toHaveBeenCalledWith("documents", expect.objectContaining({ name: "Documents" }));
  });

  it.each(["disabled", "denied", "invalid"] as const)("blocks selection, disclosure and activation while %s", (kind) => {
    const controller = createController();
    const activate = vi.fn();
    render(<NSEOutline aria-label="Files" controller={controller} idForItem={(node) => node.id} childrenForItem={(node) => node.children} labelForItem={(node) => node.name} state={{ kind, message: kind }} delegate={{ didActivate: activate }} />);
    fireEvent.click(screen.getByRole("treeitem", { name: /Documents/ }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Documents" }));
    fireEvent.keyDown(screen.getByRole("tree"), { key: "Enter" });
    expect(controller.getSnapshot().selection.selectedIds.size).toBe(0);
    expect(controller.getSnapshot().expandedIds.size).toBe(0);
    expect(activate).not.toHaveBeenCalled();
  });

  it("reuses controller-owned async loading and aborts rapid collapse", async () => {
    let resolveChildren!: (children: readonly FileNode[]) => void;
    let observedSignal: AbortSignal | undefined;
    const lazy: FileNode = { id: "lazy", name: "Remote", children: [], canLoad: true };
    const controller = createController([lazy], (_item, signal) => {
      observedSignal = signal;
      return new Promise((resolve) => { resolveChildren = resolve; });
    });
    render(
      <NSEOutline
        aria-label="Files"
        controller={controller}
        idForItem={(node) => node.id}
        childrenForItem={(node) => node.children}
        labelForItem={(node) => node.name}
        isExpandable={(node) => node.canLoad === true || node.children.length > 0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand Remote" }));
    expect(await screen.findByText("Loading children")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Remote" }));
    expect(observedSignal?.aborted).toBe(true);
    resolveChildren([{ id: "late", name: "Late", children: [] }]);
    await Promise.resolve();
    expect(screen.queryByText("Late")).toBeNull();
  });

  it("loads asynchronous children through the public outline data source", async () => {
    const lazy: FileNode = { id: "lazy", name: "Remote", children: [], canLoad: true };
    const controller = createController([lazy]);
    const childrenForItem = vi.fn(async (_item: FileNode, signal?: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return [{ id: "late", name: "Late", children: [] }];
    });
    render(<NSEOutline aria-label="Files" controller={controller} idForItem={(node) => node.id} childrenForItem={childrenForItem} labelForItem={(node) => node.name} isExpandable={(node) => node.canLoad === true} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Remote" }));
    expect(await screen.findByRole("treeitem", { name: /Late/ })).not.toBeNull();
    expect(childrenForItem).toHaveBeenCalledTimes(1);
  });

  it("discovers a lazy public data source without calling it during render", async () => {
    const lazy: FileNode = { id: "lazy", name: "Remote", children: [] };
    const childrenForItem = vi.fn((_item: FileNode, signal?: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve([{ id: "child", name: "Loaded child", children: [] }]);
    });
    render(<NSEOutline aria-label="Files" controller={createController([lazy])} idForItem={(node) => node.id} childrenForItem={childrenForItem} labelForItem={(node) => node.name} />);

    expect(childrenForItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand Remote" }));
    expect(await screen.findByRole("treeitem", { name: /Loaded child/ })).not.toBeNull();
    expect(childrenForItem).toHaveBeenCalledTimes(1);
  });

  it("routes synchronous public children through the same controller-owned load path", async () => {
    const lazy: FileNode = { id: "lazy", name: "Local", children: [] };
    const childrenForItem = vi.fn((_item: FileNode, signal?: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return [{ id: "child", name: "Local child", children: [] }];
    });
    render(<NSEOutline aria-label="Files" controller={createController([lazy])} idForItem={(node) => node.id} childrenForItem={childrenForItem} labelForItem={(node) => node.name} />);

    expect(childrenForItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Expand Local" }));
    expect(await screen.findByRole("treeitem", { name: /Local child/ })).not.toBeNull();
  });

  it("loads public children for controlled expansion without render-time source reads", async () => {
    const lazy: FileNode = { id: "lazy", name: "Controlled", children: [] };
    const childrenForItem = vi.fn((_item: FileNode, signal?: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve([{ id: "controlled-child", name: "Controlled child", children: [] }]);
    });
    render(<NSEOutline aria-label="Files" controller={createController([lazy])} idForItem={(node) => node.id} childrenForItem={childrenForItem} labelForItem={(node) => node.name} expandedIds={new Set(["lazy"])} />);
    expect(await screen.findByRole("treeitem", { name: /Controlled child/ })).not.toBeNull();
    expect(childrenForItem).toHaveBeenCalledTimes(1);
  });

  it("renders async errors with retry while retaining the labelled tree", async () => {
    const lazy: FileNode = { id: "lazy", name: "Remote", children: [], canLoad: true };
    const controller = createController([lazy], async () => { throw new Error("Network unavailable"); });
    render(
      <NSEOutline
        aria-label="Files"
        controller={controller}
        idForItem={(node) => node.id}
        childrenForItem={(node) => node.children}
        labelForItem={(node) => node.name}
        isExpandable={(node) => node.canLoad === true}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand Remote" }));
    expect(await screen.findByText("Network unavailable")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Retry loading Remote" })).not.toBeNull();
    expect(screen.getByRole("tree", { name: "Files" })).not.toBeNull();
  });

  it("uses logical RTL indentation and disclosure keyboard semantics", () => {
    const controller = createController();
    render(
      <NSEOutline
        aria-label="Files"
        dir="rtl"
        controller={controller}
        idForItem={(node) => node.id}
        childrenForItem={(node) => node.children}
        labelForItem={(node) => node.name}
      />,
    );
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowRight" });
    expect(controller.getSnapshot().expandedIds).toEqual(new Set(["documents"]));
    const child = screen.getByRole("treeitem", { name: /Report/ });
    expect(child.getAttribute("style")).toContain("--nse-outline-level: 1");
    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(document.getElementById(tree.getAttribute("aria-activedescendant")!)?.textContent).toContain("Report");
    fireEvent.keyDown(tree, { key: "ArrowLeft" });
    expect(document.getElementById(tree.getAttribute("aria-activedescendant")!)?.textContent).toContain("Documents");
  });

  it("does not navigate or type ahead during IME composition", () => {
    const controller = createController();
    render(<NSEOutline aria-label="Files" controller={controller} idForItem={(node) => node.id} childrenForItem={(node) => node.children} labelForItem={(node) => node.name} />);
    const tree = screen.getByRole("tree");
    const before = tree.getAttribute("aria-activedescendant");
    fireEvent.keyDown(tree, { key: "ArrowDown", isComposing: true });
    fireEvent.keyDown(tree, { key: "Process", keyCode: 229 });
    expect(tree.getAttribute("aria-activedescendant")).toBe(before);
  });

  it("bounds 50,000 sparse rows and retains the final active descendant", () => {
    const roots = Array.from({ length: 50_000 }, (_, index) => ({ id: `node-${index}`, name: `Node ${index}`, children: [] }));
    const controller = createController(roots);
    render(
      <NSEOutline
        aria-label="Large tree"
        controller={controller}
        idForItem={(node) => node.id}
        childrenForItem={(node) => node.children}
        labelForItem={(node) => node.name}
        viewportBlockSize={230}
      />,
    );
    const tree = screen.getByRole("tree");
    fireEvent.keyDown(tree, { key: "End", ctrlKey: true });
    expect(document.getElementById(tree.getAttribute("aria-activedescendant")!)?.textContent).toContain("Node 49999");
    expect(document.getElementById(tree.getAttribute("aria-activedescendant")!)).not.toBeNull();
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(40);
  });

  it("flattens iteratively with stable sibling metadata and cycle protection", () => {
    const leaf = new TreeNode({ id: "leaf", value: report, indexPath: IndexPath.from(0, 0), parentId: "root", children: [] });
    const root = new TreeNode({ id: "root", value: documents, indexPath: IndexPath.from(0), parentId: null, children: [leaf] });
    expect(flattenVisibleTree([root], new Set(["root"]))).toEqual([
      expect.objectContaining({ id: "root", row: 0, level: 1, positionInSet: 1, setSize: 1 }),
      expect.objectContaining({ id: "leaf", row: 1, level: 2, parentId: "root", positionInSet: 1, setSize: 1 }),
    ]);

    const cyclic = { id: "cycle", value: documents, indexPath: IndexPath.from(0), parentId: null, children: [] as unknown[] };
    cyclic.children.push(cyclic);
    expect(flattenVisibleTree([cyclic as never], new Set(["cycle"]))).toHaveLength(1);
  });
});
