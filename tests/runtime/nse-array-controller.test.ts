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

import { afterAll, describe, expect, it } from "vitest";

import { Predicate, SortDescriptor } from "../../src/SynCloudOS/Models";
import { createUndoManager } from "../../src/SynCloudOS/Undo";
import { NSEArrayController } from "../../src/NSE/Controllers";
import { createTestRuntime } from "./helpers";

interface Item {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
}

const runtime = createTestRuntime({ id: "runtime:array-controller" });
afterAll(() => runtime.dispose("test"));

function createController(content?: readonly Item[]) {
  return new NSEArrayController<Item, string>({
    id: "items",
    content:
      content ??
      [
        { id: "a", label: "Zulu", active: true },
        { id: "b", label: "Alpha", active: false },
        { id: "c", label: "Beta", active: true },
      ],
    getId: (item) => item.id,
    selection: {
      mode: "multiple",
      allowsEmpty: false,
      preservesSelection: true,
    },
  });
}

describe("NSEArrayController", () => {
  it("preserves identity selection while filtering, sorting and editing incrementally", () => {
    const controller = createController();
    controller.setSortDescriptors([
      new SortDescriptor({
        id: "label",
        select: (item: Item) => item.label,
      }),
    ]);
    controller.select(["c"]);
    const beforeSelection = controller.getSnapshot();
    controller.select(["a", "c"]);
    expect(controller.getSnapshot().content).toBe(beforeSelection.content);
    expect(controller.getSnapshot().arranged).toBe(beforeSelection.arranged);
    expect(controller.getSnapshot().changeSet).toBe(beforeSelection.changeSet);

    const schema = {
      id: "items",
      fields: {
        active: {
          type: "boolean",
          read: (item: Item) => item.active,
        },
      },
    } as const;
    controller.setPredicate(
      Predicate.compile(schema, {
        kind: "comparison",
        field: "active",
        operator: "equals",
        value: true,
      }),
    );
    expect(controller.getSnapshot().arranged.map(({ id }) => id)).toEqual([
      "c",
      "a",
    ]);
    expect(controller.getSnapshot().selection.selectedIds).toEqual(
      new Set(["a", "c"]),
    );

    controller.beginEditing({ id: "relabel-c", actionName: "Rename item" });
    // Move past Zulu so the sort-order change is observable as a move.
    controller.update("c", (item) => ({ ...item, label: "Zzz" }));
    // The bounded diff represents the swap with one deterministic move and the
    // edited identity with a separate update.
    expect(controller.getSnapshot().changeSet.changes).toContainEqual(
      expect.objectContaining({ kind: "move" }),
    );
    expect(controller.getSnapshot().changeSet.changes).toContainEqual(
      expect.objectContaining({ kind: "update", id: "c" }),
    );
    expect(controller.commitEditing()).toMatchObject({
      status: "committed",
      transactionId: "relabel-c",
    });
    controller.dispose();
  });

  it("requires transactions, rejects duplicate identity and restores discarded drafts", () => {
    const source = [
      { id: "a", label: "Alpha", active: true },
      { id: "b", label: "Beta", active: true },
    ];
    const controller = createController(source);
    source[0] = { id: "a", label: "Mutated", active: false };
    expect(controller.getSnapshot().content[0]?.label).toBe("Alpha");
    expect(() => controller.remove(["a"])).toThrow(/Begin editing/);

    const beforeDuplicate = controller.getSnapshot();
    expect(() =>
      controller.setContent([
        { id: "same", label: "One", active: true },
        { id: "same", label: "Two", active: true },
      ]),
    ).toThrow(/duplicate stable identities/);
    expect(controller.getSnapshot()).toBe(beforeDuplicate);

    controller.select(["b"]);
    controller.beginEditing({ id: "discard", actionName: "Discard changes" });
    controller.remove(["b"]);
    controller.select(["a"]);
    controller.discardEditing();
    expect(controller.getSnapshot().content.map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
    expect(controller.getSnapshot().selection.selectedIds).toEqual(
      new Set(["b"]),
    );
    controller.dispose();
  });

  it("commits one symmetric undo action for a sequence of source edits", async () => {
    const undo = createUndoManager({
      runtimeId: runtime.runtimeId,
      owner: { kind: "document", id: "items" },
      maxEntries: 20,
    });
    const controller = createController();
    controller.select(["b"]);
    controller.beginEditing({
      id: "change-items",
      actionName: "Change items",
      undoManager: undo,
    });
    controller.insert(
      { id: "d", label: "Delta", active: true },
      { afterId: "b", select: true },
    );
    controller.update("a", (item) => ({ ...item, label: "Alpha" }));
    controller.remove(["c"]);
    expect(controller.commitEditing()).toMatchObject({
      status: "committed",
      undoActionId: expect.any(String),
    });
    expect(controller.getSnapshot().content.map(({ id }) => id)).toEqual([
      "a",
      "b",
      "d",
    ]);
    expect(controller.getSnapshot().selection.selectedIds).toEqual(
      new Set(["d"]),
    );

    await undo.undo();
    expect(controller.getSnapshot().content.map(({ id }) => id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(controller.getSnapshot().selection.selectedIds).toEqual(
      new Set(["b"]),
    );
    await undo.redo();
    expect(controller.getSnapshot().content.map(({ id }) => id)).toEqual([
      "a",
      "b",
      "d",
    ]);
    expect(controller.getSnapshot().selection.selectedIds).toEqual(
      new Set(["d"]),
    );
    controller.dispose();
    undo.dispose();
  });

  it("selects the nearest survivor and navigates in arranged identity order", () => {
    const controller = createController([
      { id: "a", label: "Alpha", active: true },
      { id: "b", label: "Beta", active: true },
      { id: "c", label: "Charlie", active: true },
    ]);
    controller.select(["b"]);
    controller.selectNext();
    expect(controller.getSnapshot().selection.focusId).toBe("c");
    controller.selectPrevious();
    expect(controller.getSnapshot().selection.focusId).toBe("b");

    controller.beginEditing({ id: "remove-b", actionName: "Remove item" });
    controller.remove(["b"]);
    expect(controller.getSnapshot().selection.selectedIds).toEqual(
      new Set(["c"]),
    );
    controller.commitEditing();
    controller.dispose();
  });

  it("keeps the committed baseline atomic when arrangement rejects replacement content", () => {
    const controller = createController([
      { id: "a", label: "Alpha", active: true },
    ]);
    const schema = {
      id: "throwing-items",
      fields: {
        label: {
          type: "string",
          read: (item: Item) => {
            if (item.label === "Bad") throw new Error("Rejected item");
            return item.label;
          },
        },
      },
    } as const;
    controller.setPredicate(
      Predicate.compile(schema, {
        kind: "comparison",
        field: "label",
        operator: "contains",
        value: "A",
      }),
    );
    const before = controller.getSnapshot();
    expect(() =>
      controller.setContent([{ id: "bad", label: "Bad", active: true }]),
    ).toThrow("Rejected item");
    expect(controller.getSnapshot()).toBe(before);

    controller.beginEditing({ id: "atomic", actionName: "Atomic content" });
    expect(() => controller.discardEditing()).not.toThrow();
    expect(controller.getSnapshot().content.map(({ id }) => id)).toEqual(["a"]);
    controller.dispose();
  });

  it("selects only visible identities when filtered selection is not preserved", () => {
    const controller = new NSEArrayController<Item, string>({
      id: "visible-items",
      content: [
        { id: "visible", label: "Visible", active: true },
        { id: "hidden", label: "Hidden", active: false },
      ],
      getId: (item) => item.id,
      selection: { mode: "multiple", allowsEmpty: true, preservesSelection: false },
    });
    controller.setPredicate(
      Predicate.compile(
        { id: "visible-items", fields: { active: { type: "boolean", read: (item: Item) => item.active } } },
        { kind: "comparison", field: "active", operator: "equals", value: true },
      ),
    );

    expect(() => controller.select(["hidden"])).toThrow(/unknown stable identity/i);
    expect(controller.select(["visible"])).toBe(true);
    controller.dispose();
  });

  it("shares untouched owned items while blocking nested collection mutation", () => {
    interface RichItem extends Item {
      readonly tags: Set<string>;
      readonly lookup: Map<string, number>;
      readonly savedAt: Date;
    }
    const controller = new NSEArrayController<RichItem, string>({
      id: "owned-items",
      content: [
        {
          id: "a",
          label: "Alpha",
          active: true,
          tags: new Set(["safe"]),
          lookup: new Map([["first", 1]]),
          savedAt: new Date("2026-08-08T12:00:00.000Z"),
        },
        {
          id: "b",
          label: "Beta",
          active: true,
          tags: new Set(),
          lookup: new Map(),
          savedAt: new Date("2026-08-08T12:00:00.000Z"),
        },
      ],
      getId: (item) => item.id,
    });
    const before = controller.getSnapshot().content[0]!;

    controller.beginEditing({ id: "rename-b", actionName: "Rename B" });
    controller.update("b", (item) => ({ ...item, label: "Bravo" }));

    const after = controller.getSnapshot().content[0]!;
    expect(after).toBe(before);
    expect(() => (after.tags as unknown as Set<string>).add("unsafe")).toThrow(TypeError);
    expect(() => (after.lookup as unknown as Map<string, number>).set("unsafe", 2)).toThrow(
      TypeError,
    );
    expect(() => after.savedAt.setTime(0)).toThrow(TypeError);
    let callbackMap: Map<string, number> | undefined;
    after.lookup.forEach((_value, _key, map) => {
      callbackMap = map;
    });
    expect(() => callbackMap?.set("unsafe-callback", 3)).toThrow(TypeError);
    expect(after.tags).toEqual(new Set(["safe"]));
    expect(after.lookup.has("unsafe-callback")).toBe(false);
    controller.dispose();
  });

  it("does not suppress updates to distinct non-plain items", () => {
    const controller = new NSEArrayController<Map<string, number>, string>({
      id: "map-items",
      content: [new Map([["value", 1]])],
      getId: () => "only",
    });
    const before = controller.getSnapshot().content[0]!;
    controller.beginEditing({ id: "replace-map", actionName: "Replace map" });
    controller.update("only", () => new Map([["value", 2]]));

    const after = controller.getSnapshot().content[0]!;
    expect(after).not.toBe(before);
    expect(after.get("value")).toBe(2);
    controller.dispose();
  });

  it("keeps an array edit intact when undo registration rejects", () => {
    const undo = createUndoManager({
      runtimeId: runtime.runtimeId,
      owner: { kind: "document", id: "array-registration" },
      maxEntries: 10,
    });
    undo.dispose();
    const controller = createController();
    controller.beginEditing({
      id: "array-registration",
      actionName: "Change items",
      undoManager: undo,
    });
    controller.update("a", (item) => ({ ...item, label: "Edited" }));
    const before = controller.getSnapshot();

    expect(() => controller.commitEditing()).toThrow(/undo manager is disposed/i);
    expect(controller.getSnapshot()).toBe(before);
    expect(controller.isEditing).toBe(true);
    expect(controller.getSnapshot().content[0]?.label).toBe("Edited");
    controller.discardEditing();
    controller.dispose();
  });

  it("keeps the newest committed baseline when a listener replaces content reentrantly", () => {
    const controller = createController([
      { id: "initial", label: "Initial", active: true },
    ]);
    let reentrant = true;
    controller.subscribeChanges((change) => {
      if (!reentrant || change.kind !== "content") return;
      reentrant = false;
      controller.setContent([{ id: "newest", label: "Newest", active: true }]);
    });

    controller.setContent([{ id: "outer", label: "Outer", active: true }]);
    expect(controller.getSnapshot().content.map(({ id }) => id)).toEqual(["newest"]);
    controller.beginEditing({ id: "newest-edit", actionName: "Edit newest" });
    controller.update("newest", (item) => ({ ...item, label: "Draft" }));
    controller.discardEditing();

    expect(controller.getSnapshot().content).toEqual([
      { id: "newest", label: "Newest", active: true },
    ]);
    controller.dispose();
  });

  it("clears required selection metadata when removing the final arranged item", () => {
    const controller = createController([
      { id: "only", label: "Only", active: true },
    ]);
    controller.select(["only"]);
    controller.beginEditing({ id: "remove-only", actionName: "Remove only" });
    controller.remove(["only"]);

    expect(controller.getSnapshot().selection).toMatchObject({
      selectedIds: new Set(),
      anchorId: null,
      focusId: null,
    });
    controller.discardEditing();
    controller.dispose();
  });
});
