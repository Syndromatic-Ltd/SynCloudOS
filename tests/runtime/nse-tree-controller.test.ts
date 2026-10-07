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

import { afterAll, afterEach, expect, it, vi } from "vitest";

import { IndexPath, Predicate, SortDescriptor } from "../../src/SynCloudOS/Models";
import { createUndoManager } from "../../src/SynCloudOS/Undo";
import { NSETreeController } from "../../src/NSE/Controllers";
import { createTestRuntime } from "./helpers";

interface Item {
  readonly id: string;
  readonly label: string;
  readonly children: readonly Item[];
}

const controllers: NSETreeController<Item, string>[] = [];
const runtime = createTestRuntime({ id: "runtime:tree-controller" });
afterAll(() => runtime.dispose("test"));
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

function createController(
  content: readonly Item[],
  loadChildren?: (item: Item, signal: AbortSignal) => Promise<readonly Item[]>,
) {
  const controller = new NSETreeController<Item, string>({
    id: "projects",
    content,
    getId: (item) => item.id,
    getChildren: (item) => item.children,
    withChildren: (item, children) => ({ ...item, children: [...children] }),
    loadChildren,
    selection: { mode: "multiple", allowsEmpty: true },
  });
  controllers.push(controller);
  return controller;
}

it("arranges, expands, moves and selects trees by identity", () => {
  const controller = createController([
    {
      id: "projects",
      label: "Projects",
      children: [
        { id: "cloud", label: "Cloud", children: [] },
        { id: "power", label: "Power", children: [] },
      ],
    },
  ]);
  const collapsedRoots = controller.getSnapshot().roots;
  controller.expand("projects");
  expect(controller.getSnapshot().roots).toBe(collapsedRoots);
  expect(controller.getSnapshot().visibleNodes.map(({ id }) => id)).toEqual([
    "projects",
    "cloud",
    "power",
  ]);
  expect(() =>
    (controller.getSnapshot().expandedIds as Set<string>).add("unsafe"),
  ).toThrow(TypeError);
  expect(() =>
    (controller.getSnapshot().errors as Map<string, string>).set("root", "unsafe"),
  ).toThrow(TypeError);
  expect(controller.nodeAt(IndexPath.from(0, 1))?.id).toBe("power");
  controller.select(["power"]);
  const beforeSelection = controller.getSnapshot();
  controller.select(["cloud", "power"]);
  expect(controller.getSnapshot().roots).toBe(beforeSelection.roots);
  expect(controller.getSnapshot().visibleNodes).toBe(beforeSelection.visibleNodes);
  expect(controller.getSnapshot().changeSet).toBe(beforeSelection.changeSet);

  controller.beginEditing({ id: "move-power", actionName: "Move project" });
  controller.move(["power"], { parentId: null, index: 1 });
  expect(controller.getSnapshot().roots.map(({ id }) => id)).toEqual([
    "projects",
    "power",
  ]);
  expect(controller.getSnapshot().selection.selectedIds).toEqual(
    new Set(["cloud", "power"]),
  );
  expect(controller.commitEditing()).toMatchObject({
    status: "committed",
    transactionId: "move-power",
  });
});

it("replays committed tree content and selection through one undo action", async () => {
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "tree" },
    maxEntries: 20,
  });
  const controller = createController([
    { id: "a", label: "A", children: [] },
    { id: "b", label: "B", children: [] },
  ]);
  controller.select(["b"]);
  controller.beginEditing({
    id: "remove-b",
    actionName: "Remove node",
    undoManager: undo,
  });
  controller.remove(["b"]);
  expect(controller.commitEditing()).toMatchObject({
    status: "committed",
    undoActionId: expect.any(String),
  });
  expect(controller.getSnapshot().roots.map(({ id }) => id)).toEqual(["a"]);
  await undo.undo();
  expect(controller.getSnapshot().roots.map(({ id }) => id)).toEqual(["a", "b"]);
  expect(controller.getSnapshot().selection.selectedIds).toEqual(new Set(["b"]));
  await undo.redo();
  expect(controller.getSnapshot().roots.map(({ id }) => id)).toEqual(["a"]);
  undo.dispose();
});

it("filters ancestors, sorts siblings and rejects duplicate identities", () => {
  const controller = createController([
    {
      id: "root",
      label: "Container",
      children: [
        { id: "z", label: "Zulu", children: [] },
        { id: "a", label: "Alpha", children: [] },
      ],
    },
  ]);
  controller.setSortDescriptors([
    new SortDescriptor({ id: "label", select: (item: Item) => item.label }),
  ]);
  const schema = {
    id: "tree",
    fields: {
      label: { type: "string", read: (item: Item) => item.label },
    },
  } as const;
  controller.setPredicate(
    Predicate.compile(schema, {
      kind: "comparison",
      field: "label",
      operator: "contains",
      value: "Alpha",
    }),
  );
  controller.expand("root");
  expect(controller.getSnapshot().visibleNodes.map(({ id }) => id)).toEqual([
    "root",
    "a",
  ]);

  const before = controller.getSnapshot();
  expect(() =>
    controller.setContent([
      { id: "same", label: "One", children: [] },
      { id: "same", label: "Two", children: [] },
    ]),
  ).toThrow(/duplicate stable identities/);
  expect(controller.getSnapshot()).toBe(before);
});

it("rejects descendant destinations and adjusts same-sibling moves", () => {
  const controller = createController([
    {
      id: "parent",
      label: "Parent",
      children: [{ id: "child", label: "Child", children: [] }],
    },
    { id: "b", label: "B", children: [] },
    { id: "c", label: "C", children: [] },
    { id: "d", label: "D", children: [] },
  ]);
  controller.beginEditing({ id: "moves", actionName: "Move nodes" });
  expect(() =>
    controller.move(["parent"], { parentId: "child", index: 0 }),
  ).toThrow(/descendant/);
  controller.move(["b"], { parentId: null, index: 3 });
  expect(controller.getSnapshot().roots.map(({ id }) => id)).toEqual([
    "parent",
    "c",
    "b",
    "d",
  ]);
  controller.discardEditing();
  expect(controller.getSnapshot().roots.map(({ id }) => id)).toEqual([
    "parent",
    "b",
    "c",
    "d",
  ]);
});

it("owns child-load cancellation and ignores stale completion", async () => {
  const resolvers: Array<(items: readonly Item[]) => void> = [];
  const signals: AbortSignal[] = [];
  const loader = vi.fn((_item: Item, signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<readonly Item[]>((resolve) => resolvers.push(resolve));
  });
  const controller = createController(
    [{ id: "root", label: "Root", children: [] }],
    loader,
  );
  const first = controller.loadChildren("root");
  const second = controller.loadChildren("root");
  expect(signals[0]?.aborted).toBe(true);
  resolvers[0]?.([{ id: "stale", label: "Stale", children: [] }]);
  await first;
  expect(controller.node("stale")).toBeNull();
  resolvers[1]?.([{ id: "fresh", label: "Fresh", children: [] }]);
  await second;
  controller.expand("root");
  expect(controller.getSnapshot().visibleNodes.map(({ id }) => id)).toEqual([
    "root",
    "fresh",
  ]);

  const third = controller.loadChildren("root");
  controller.dispose();
  controllers.splice(controllers.indexOf(controller), 1);
  expect(signals[2]?.aborted).toBe(true);
  resolvers[2]?.([{ id: "disposed", label: "Disposed", children: [] }]);
  await third;
});

it("invalidates child loads across removed and same-id content replacement", async () => {
  const resolvers: Array<(items: readonly Item[]) => void> = [];
  const controller = createController(
    [{ id: "root", label: "Original", children: [] }],
    () => new Promise<readonly Item[]>((resolve) => resolvers.push(resolve)),
  );

  const removed = controller.loadChildren("root");
  expect(controller.getSnapshot().loadingIds).toEqual(new Set(["root"]));
  controller.setContent([{ id: "replacement", label: "Replacement", children: [] }]);
  expect(controller.getSnapshot().loadingIds).toEqual(new Set());
  resolvers[0]?.([{ id: "stale-removed", label: "Stale", children: [] }]);
  await removed;
  expect(controller.node("stale-removed")).toBeNull();

  controller.setContent([{ id: "root", label: "Fresh root", children: [] }]);
  const replaced = controller.loadChildren("root");
  controller.setContent([{ id: "root", label: "Replacement root", children: [] }]);
  resolvers[1]?.([{ id: "stale-same-id", label: "Stale", children: [] }]);
  await replaced;
  expect(controller.node("root")?.value.label).toBe("Replacement root");
  expect(controller.node("stale-same-id")).toBeNull();
  expect(controller.getSnapshot().loadingIds).toEqual(new Set());
});

it("rejects direct and indirect cyclic tree input before recursive ownership", () => {
  const direct = { id: "direct", label: "Direct", children: [] as Item[] };
  direct.children.push(direct);
  expect(() => createController([direct])).toThrow(/cycle/i);

  const parent = { id: "parent", label: "Parent", children: [] as Item[] };
  const child = { id: "child", label: "Child", children: [] as Item[] };
  parent.children.push(child);
  child.children.push(parent);
  expect(() => createController([parent])).toThrow(/cycle/i);
});

it("owns nested mutable values exposed by immutable tree nodes", () => {
  interface RichItem extends Item {
    readonly metadata: {
      readonly tags: Set<string>;
      readonly lookup: Map<string, number>;
      readonly savedAt: Date;
    };
  }

  const source: RichItem = {
    id: "rich",
    label: "Rich",
    children: [],
    metadata: {
      tags: new Set(["owned"]),
      lookup: new Map([["first", 1]]),
      savedAt: new Date("2026-08-08T12:00:00.000Z"),
    },
  };
  const controller = new NSETreeController<RichItem, string>({
    id: "rich-tree",
    content: [source],
    getId: (item) => item.id,
    getChildren: (item) => item.children,
    withChildren: (item, children) => ({ ...item, children: [...children] }),
  });
  const metadata = controller.node("rich")!.value.metadata;
  source.metadata.tags.add("external");
  source.metadata.lookup.set("external", 2);
  source.metadata.savedAt.setUTCDate(9);

  expect(metadata.tags.has("external")).toBe(false);
  expect(metadata.lookup.has("external")).toBe(false);
  expect(metadata.savedAt.toISOString()).toBe("2026-08-08T12:00:00.000Z");
  expect(() => metadata.tags.add("unsafe")).toThrow(TypeError);
  expect(() => metadata.lookup.set("unsafe", 3)).toThrow(TypeError);
  expect(() => metadata.savedAt.setUTCDate(1)).toThrow(TypeError);
  controller.dispose();
});

it("keeps a tree draft intact when undo registration rejects", () => {
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "tree-registration" },
    maxEntries: 10,
  });
  undo.dispose();
  const controller = createController([
    { id: "a", label: "A", children: [] },
    { id: "b", label: "B", children: [] },
  ]);
  controller.beginEditing({
    id: "tree-registration",
    actionName: "Remove node",
    undoManager: undo,
  });
  controller.remove(["b"]);
  const before = controller.getSnapshot();

  expect(() => controller.commitEditing()).toThrow(/undo manager is disposed/i);
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.isEditing).toBe(true);
  expect(controller.getSnapshot().roots.map(({ id }) => id)).toEqual(["a"]);
  controller.discardEditing();
});

it("retains unrelated branch identities when a child load replaces one branch", async () => {
  let resolve: ((items: readonly Item[]) => void) | undefined;
  const controller = createController(
    [
      { id: "loaded", label: "Loaded", children: [] },
      { id: "sibling", label: "Sibling", children: [] },
      { id: "later", label: "Later", children: [] },
    ],
    () => new Promise<readonly Item[]>((next) => {
      resolve = next;
    }),
  );
  const beforeSibling = controller.getSnapshot().content[1]!;
  const beforeLater = controller.getSnapshot().content[2]!;

  const loading = controller.loadChildren("loaded");
  resolve?.([{ id: "child", label: "Child", children: [] }]);
  await loading;

  expect(controller.getSnapshot().content[1]).toBe(beforeSibling);
  expect(controller.getSnapshot().content[2]).toBe(beforeLater);
});

it("settles a caller abort even when its child loader never observes the signal", async () => {
  let resolve: ((items: readonly Item[]) => void) | undefined;
  const controller = createController(
    [{ id: "root", label: "Root", children: [] }],
    () => new Promise<readonly Item[]>((next) => {
      resolve = next;
    }),
  );
  const caller = new AbortController();
  const loading = controller.loadChildren("root", caller.signal);
  caller.abort();

  const outcome = await Promise.race([
    loading.then(() => "settled"),
    new Promise<string>((finish) => setTimeout(() => finish("timed-out"), 25)),
  ]);
  expect(outcome).toBe("settled");
  expect(controller.getSnapshot().loadingIds).toEqual(new Set());

  resolve?.([{ id: "late", label: "Late", children: [] }]);
  await Promise.resolve();
  await Promise.resolve();
  expect(controller.node("late")).toBeNull();
});

it("reports bounded tree depth or a cycle before recursive overflow", () => {
  const makeChain = (cycle: boolean): Item => {
    const root = { id: "node-0", label: "0", children: [] as Item[] };
    let current = root;
    for (let index = 1; index <= 12_001; index += 1) {
      const child = { id: `node-${index}`, label: String(index), children: [] as Item[] };
      current.children.push(child);
      current = child;
    }
    if (cycle) current.children.push(root);
    return root;
  };

  expect(() => createController([makeChain(true)])).toThrow(/cycle|depth/i);
  expect(() => createController([makeChain(false)])).toThrow(/depth/i);
});

it("clears required selection metadata when removing the final tree node", () => {
  const controller = new NSETreeController<Item, string>({
    id: "tree-required-selection",
    content: [{ id: "only", label: "Only", children: [] }],
    getId: (item) => item.id,
    getChildren: (item) => item.children,
    withChildren: (item, children) => ({ ...item, children: [...children] }),
    selection: { mode: "single", allowsEmpty: false },
  });
  controller.select(["only"]);
  controller.beginEditing({ id: "remove-only-tree", actionName: "Remove only node" });
  controller.remove(["only"]);

  expect(controller.getSnapshot().selection).toMatchObject({
    selectedIds: new Set(),
    anchorId: null,
    focusId: null,
  });
  controller.discardEditing();
  controller.dispose();
});
