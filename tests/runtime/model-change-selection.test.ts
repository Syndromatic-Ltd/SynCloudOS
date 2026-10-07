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

import { expect, it } from "vitest";

import {
  MAX_INCREMENTAL_COLLECTION_CHANGES,
  SelectionModel,
  diffCollection,
  emptyChangeSet,
  type CollectionChange,
} from "../../src/SynCloudOS/Models";

function applyOrderedChanges<T extends { readonly id: string }>(
  before: readonly T[],
  changes: readonly CollectionChange<string, T>[],
): readonly T[] {
  const working = [...before];
  for (const change of changes) {
    switch (change.kind) {
      case "remove":
        expect(working[change.index]?.id).toBe(change.id);
        working.splice(change.index, 1);
        break;
      case "insert":
        working.splice(change.index, 0, change.item);
        break;
      case "move": {
        expect(working[change.from]?.id).toBe(change.id);
        const [moved] = working.splice(change.from, 1);
        working.splice(change.to, 0, change.item ?? moved!);
        break;
      }
      case "update":
        expect(working[change.index]?.id).toBe(change.id);
        working[change.index] = change.item;
        break;
      case "reset":
        return [...change.items];
    }
  }
  return working;
}

it("emits an ordered patch that transforms collections by stable identity", () => {
  const before = [
    { id: "a", value: 1 },
    { id: "b", value: 2 },
    { id: "c", value: 3 },
  ];
  const after = [
    { id: "c", value: 4 },
    { id: "a", value: 1 },
    { id: "d", value: 5 },
  ];
  const changeSet = diffCollection(before, after, (item) => item.id);

  expect(changeSet.changes).toEqual([
    { kind: "remove", id: "b", index: 1, item: before[1] },
    { kind: "insert", id: "d", index: 2, item: after[2] },
    { kind: "move", id: "c", from: 1, to: 0, item: after[0] },
    {
      kind: "update",
      id: "c",
      index: 0,
      previous: before[2],
      item: after[0],
    },
  ]);
  expect(applyOrderedChanges(before, changeSet.changes)).toEqual(after);
  expect(Object.isFrozen(changeSet)).toBe(true);
  expect(Object.isFrozen(changeSet.changes)).toBe(true);
});

it("keeps every bounded mixed patch sequentially applicable", () => {
  let seed = 0x4d595df4;
  const random = () => {
    seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
    return seed;
  };
  const shuffled = (ids: readonly string[]) => {
    const result = [...ids];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = random() % (index + 1);
      [result[index], result[swap]] = [result[swap]!, result[index]!];
    }
    return result;
  };
  const ids = Array.from({ length: 20 }, (_, index) => `item-${index}`);

  for (let round = 0; round < 80; round += 1) {
    const beforeIds = shuffled(ids).slice(0, 4 + (random() % 12));
    const afterIds = shuffled(ids).slice(0, 4 + (random() % 12));
    const before = beforeIds.map((id) => ({ id, value: `${round}:${id}:before` }));
    const after = afterIds.map((id) => ({
      id,
      value: random() % 3 === 0 ? `${round}:${id}:updated` : `${round}:${id}:before`,
    }));
    const changes = diffCollection(before, after, (item) => item.id).changes;

    expect(changes.length).toBeLessThanOrEqual(MAX_INCREMENTAL_COLLECTION_CHANGES);
    expect(applyOrderedChanges(before, changes)).toEqual(after);
  }
});

it("does not treat distinct non-plain identity items as an unchanged update", () => {
  const before = [new Date("2026-08-08T00:00:00.000Z")];
  const after = [new Date("2026-08-08T00:00:00.000Z")];
  const changeSet = diffCollection(before, after, (item) => item.getTime());

  expect(changeSet.changes).toContainEqual(
    expect.objectContaining({ kind: "update", id: before[0]!.getTime() }),
  );
});

it("supports range/toggle selection and reconciles deleted identities", () => {
  const model = new SelectionModel<string>({
    mode: "multiple",
    allowsEmpty: false,
  });

  model.replace(["b"], "b");
  model.extendRange("d", ["a", "b", "c", "d", "e"]);
  expect(model.getSnapshot().selectedIds).toEqual(new Set(["b", "c", "d"]));
  model.toggle("c");
  expect(model.getSnapshot().selectedIds).toEqual(new Set(["b", "d"]));
  model.reconcile(["a", "d", "e"]);
  expect(model.getSnapshot()).toMatchObject({ anchorId: "d", focusId: "d" });
});

it("rejects duplicate stable identities before creating a change set", () => {
  expect(() =>
    diffCollection(
      [{ id: "a" }],
      [{ id: "a" }, { id: "a" }],
      (item) => item.id,
    ),
  ).toThrow(/duplicate stable identities/i);
});

it("does not expose mutable selection state", () => {
  const model = new SelectionModel<string>({
    mode: "multiple",
    allowsEmpty: true,
  });
  model.replace(["a", "b"], "b");
  const before = model.getSnapshot();

  expect(() =>
    (before.selectedIds as unknown as Set<string>).add("c"),
  ).toThrow(TypeError);
  before.selectedIds.forEach((_value, _key, selected) => {
    expect(() =>
      (selected as unknown as Set<string>).clear(),
    ).toThrow(TypeError);
  });
  expect(model.getSnapshot()).toBe(before);
  expect(model.getSnapshot().revision).toBe(1);
  expect(model.getSnapshot().selectedIds).toEqual(new Set(["a", "b"]));
});

it("retains a required selection and avoids no-op publications", () => {
  const model = new SelectionModel<string>({
    mode: "single",
    allowsEmpty: false,
  });
  let publications = 0;
  model.subscribe(() => publications += 1);

  expect(model.replace(["a", "b"], "a")).toBe(true);
  expect(model.getSnapshot().selectedIds).toEqual(new Set(["a"]));
  expect(model.replace(["a"], "a")).toBe(false);
  expect(model.clear()).toBe(false);
  expect(publications).toBe(1);
});

it("reconciles a required selection to an internally valid empty state when nothing survives", () => {
  const model = new SelectionModel<string>({
    mode: "single",
    allowsEmpty: false,
  });

  model.replace(["deleted"], "deleted", "deleted");
  const before = model.getSnapshot();

  expect(model.reconcile([])).toBe(true);
  expect(model.getSnapshot()).toMatchObject({
    revision: before.revision + 1,
    selectedIds: new Set(),
    anchorId: null,
    focusId: null,
  });
});

it("bounds large diffs with an owned reset change", () => {
  expect(emptyChangeSet<string, { id: string }>()).toEqual({
    revision: 0,
    previousRevision: 0,
    changes: [],
  });
  const after = Array.from(
    { length: MAX_INCREMENTAL_COLLECTION_CHANGES + 1 },
    (_, index) => ({ id: `item-${index}` }),
  );
  const changeSet = diffCollection([], after, (item) => item.id);

  expect(changeSet.changes).toHaveLength(1);
  expect(changeSet.changes[0]).toMatchObject({ kind: "reset" });
  if (changeSet.changes[0]?.kind === "reset") {
    expect(changeSet.changes[0].items).not.toBe(after);
    expect(Object.isFrozen(changeSet.changes[0].items)).toBe(true);
  }
});
