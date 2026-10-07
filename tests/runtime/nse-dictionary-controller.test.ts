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

import { afterAll, expect, it } from "vitest";

import { createUndoManager } from "../../src/SynCloudOS/Undo";
import { NSEDictionaryController } from "@syndromatic/syncloudos/nse";
import { createTestRuntime } from "./helpers";

const runtime = createTestRuntime({ id: "runtime:dictionary-controller" });
afterAll(() => runtime.dispose("test"));

it("edits deterministic dictionary rows without KVC and replays one transaction through undo", async () => {
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "metadata" },
    maxEntries: 50,
  });
  const controller = new NSEDictionaryController<string>({
    id: "metadata",
    content: { name: "SynCloud", phone: "020 0000 0000" },
    includedKeys: ["city"],
    excludedKeys: ["phone"],
    initialKey: "key",
    initialValue: "",
    selection: { mode: "single", allowsEmpty: true },
  });

  expect(controller.getSnapshot().entries.map(({ key }) => key)).toEqual([
    "city",
    "name",
  ]);
  expect(controller.getSnapshot().entries[0]).toMatchObject({
    key: "city",
    value: undefined,
    present: false,
    isExplicitlyIncluded: true,
  });

  controller.beginEditing({
    id: "metadata-edit-1",
    actionName: "Edit metadata",
    undoManager: undo,
  });
  const insertedKey = controller.insert();
  expect(insertedKey).toBe("key");
  expect(controller.setValue("key", "Europe/London")).toEqual({
    status: "updated",
    key: "key",
  });
  expect(controller.renameKey("key", "region")).toEqual({
    status: "renamed",
    previousKey: "key",
    key: "region",
  });
  controller.select(["region"]);
  const beforeConflict = controller.getSnapshot();
  expect(controller.renameKey("region", "name")).toEqual({
    status: "conflict",
    key: "name",
  });
  expect(controller.getSnapshot()).toBe(beforeConflict);
  expect(controller.getSnapshot().draftContent?.region).toBe("Europe/London");
  expect(controller.commitEditing()).toMatchObject({
    status: "committed",
    transactionId: "metadata-edit-1",
    undoActionId: expect.any(String),
  });
  expect(controller.getSnapshot().content).toEqual({
    name: "SynCloud",
    phone: "020 0000 0000",
    region: "Europe/London",
  });

  await undo.undo();
  expect(controller.getSnapshot().content).toEqual({
    name: "SynCloud",
    phone: "020 0000 0000",
  });
  await undo.redo();
  expect(controller.getSnapshot().content.region).toBe("Europe/London");
  controller.dispose();
  undo.dispose();
});

it("applies exclusion last, retains unchanged rows and generates fresh values", () => {
  let generated = 0;
  const controller = new NSEDictionaryController<{ count: number }>({
    id: "values",
    content: { key: { count: 1 }, hidden: { count: 2 } },
    includedKeys: ["hidden", "missing"],
    excludedKeys: ["hidden"],
    initialValue: () => ({ count: ++generated }),
    selection: { mode: "multiple", allowsEmpty: true },
  });
  expect(controller.getSnapshot().entries.map(({ key }) => key)).toEqual([
    "key",
    "missing",
  ]);
  const retained = controller.getSnapshot().entries[0];
  controller.setIncludedKeys(["hidden", "missing", "other"]);
  expect(controller.getSnapshot().entries.find(({ key }) => key === "key")).toBe(
    retained,
  );

  controller.beginEditing({ id: "insert", actionName: "Insert values" });
  expect(controller.insert()).toBe("key1");
  expect(controller.insert()).toBe("key2");
  expect(controller.getSnapshot().draftContent?.key1).toEqual({ count: 1 });
  expect(controller.getSnapshot().draftContent?.key2).toEqual({ count: 2 });
  controller.discardEditing();
  expect(controller.getSnapshot().content).not.toHaveProperty("key1");
  expect(controller.getSnapshot().content.hidden).toEqual({ count: 2 });
  controller.dispose();
});

it("rejects unsafe keys and requires explicit edits without partial publication", () => {
  const controller = new NSEDictionaryController<number>({
    id: "safe-metadata",
    content: { alpha: 1 },
  });
  expect(() => controller.setValue("alpha", 2)).toThrow(/Begin editing/);
  controller.beginEditing({ id: "safe-edit", actionName: "Safe edit" });
  const before = controller.getSnapshot();
  expect(controller.renameKey("alpha", "__proto__")).toMatchObject({
    status: "invalid",
  });
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.setValue("missing", 2)).toEqual({
    status: "missing",
    key: "missing",
  });
  expect(controller.getSnapshot()).toBe(before);
  controller.discardEditing();
  controller.dispose();
});

it("rejects accessor-backed dictionary input without evaluating it", () => {
  let reads = 0;
  const content = Object.create(null) as Record<string, number>;
  Object.defineProperty(content, "unsafe", {
    enumerable: true,
    get: () => {
      reads += 1;
      throw new Error("dictionary accessor escaped ownership");
    },
  });

  expect(
    () => new NSEDictionaryController({ id: "accessor-dictionary", content }),
  ).toThrow(/own-data record/i);
  expect(reads).toBe(0);
});

it("owns mutable collection values in dictionary snapshots", () => {
  interface RichValue {
    readonly tags: Set<string>;
    readonly lookup: Map<string, number>;
    readonly savedAt: Date;
  }

  const source: RichValue = {
    tags: new Set(["owned"]),
    lookup: new Map([["first", 1]]),
    savedAt: new Date("2026-08-08T12:00:00.000Z"),
  };
  const controller = new NSEDictionaryController<RichValue>({
    id: "rich-dictionary",
    content: { profile: source },
  });
  const value = controller.getSnapshot().content.profile!;
  source.tags.add("external");
  source.lookup.set("external", 2);
  source.savedAt.setUTCDate(9);

  expect(value.tags.has("external")).toBe(false);
  expect(value.lookup.has("external")).toBe(false);
  expect(value.savedAt.toISOString()).toBe("2026-08-08T12:00:00.000Z");
  expect(() => value.tags.add("unsafe")).toThrow(TypeError);
  expect(() => value.lookup.set("unsafe", 3)).toThrow(TypeError);
  expect(() => value.savedAt.setUTCDate(1)).toThrow(TypeError);
  controller.dispose();
});

it("keeps a dictionary draft intact when undo registration rejects", () => {
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "dictionary-registration" },
    maxEntries: 10,
  });
  undo.dispose();
  const controller = new NSEDictionaryController<number>({
    id: "dictionary-registration",
    content: { value: 1 },
  });
  controller.beginEditing({
    id: "dictionary-registration",
    actionName: "Change value",
    undoManager: undo,
  });
  controller.setValue("value", 2);
  const before = controller.getSnapshot();

  expect(() => controller.commitEditing()).toThrow(/undo manager is disposed/i);
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.isEditing).toBe(true);
  expect(controller.getSnapshot().content.value).toBe(1);
  expect(controller.getSnapshot().draftContent?.value).toBe(2);
  controller.discardEditing();
  controller.dispose();
});

it("clears required selection metadata when removing the final dictionary row", () => {
  const controller = new NSEDictionaryController<number>({
    id: "dictionary-required-selection",
    content: { only: 1 },
    selection: { mode: "single", allowsEmpty: false },
  });
  controller.select(["only"]);
  controller.beginEditing({
    id: "remove-only-dictionary",
    actionName: "Remove only dictionary row",
  });
  controller.remove(["only"]);

  expect(controller.getSnapshot().selection).toMatchObject({
    selectedIds: new Set(),
    anchorId: null,
    focusId: null,
  });
  controller.discardEditing();
  controller.dispose();
});

it("does not consume undo or clear a dictionary draft when row comparison throws at commit", () => {
  let throwDuringCommit = false;
  const undo = createUndoManager({
    runtimeId: runtime.runtimeId,
    owner: { kind: "document", id: "dictionary-comparator" },
    maxEntries: 10,
  });
  const controller = new NSEDictionaryController<number>({
    id: "dictionary-comparator",
    content: { alpha: 1, beta: 2 },
    compareKeys: (left, right) => {
      if (throwDuringCommit) throw new Error("comparison failed");
      return left < right ? -1 : left > right ? 1 : 0;
    },
  });
  controller.beginEditing({
    id: "dictionary-comparator",
    actionName: "Change beta",
    undoManager: undo,
  });
  controller.setValue("beta", 3);
  const before = controller.getSnapshot();
  let publications = 0;
  const unsubscribe = controller.subscribe(() => publications += 1);
  throwDuringCommit = true;

  expect(() => controller.commitEditing()).toThrow("comparison failed");
  expect(controller.getSnapshot()).toBe(before);
  expect(controller.isEditing).toBe(true);
  expect(publications).toBe(0);
  expect(undo.inspect()).toMatchObject({ cursor: 0, entries: [] });
  unsubscribe();
  throwDuringCommit = false;
  controller.discardEditing();
  controller.dispose();
  undo.dispose();
});
