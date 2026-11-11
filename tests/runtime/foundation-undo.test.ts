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


import { describe, expect, it } from "vitest";
import { NSEUndoManager } from "../../src/Foundation/NSEUndoManager";

describe("Foundation undo", () => {
  it("replays grouped inverses in reverse order and retains the action name", () => {
    const manager = new NSEUndoManager();
    const target = { value: 0 };
    const change = (value: number) => {
      const before = target.value;
      target.value = value;
      manager.registerUndo(target, () => change(before));
    };
    manager.beginUndoGrouping();
    change(1); change(2);
    manager.setActionName("Change");
    manager.endUndoGrouping();
    expect(manager.undoActionName).toBe("Change");
    manager.undo();
    expect(target.value).toBe(0);
    expect(manager.redoActionName).toBe("Change");
    manager.redo();
    expect(target.value).toBe(2);
  });
  it("bounds history by undo levels", () => {
    const manager = new NSEUndoManager();
    manager.levelsOfUndo = 1;
    const target = { value: 0 };
    const change = (value: number) => {
      const before = target.value;
      target.value = value;
      manager.registerUndo(target, () => change(before));
    };
    change(1); change(2); manager.undo();
    expect(target.value).toBe(1);
    expect(manager.canUndo).toBe(false);
  });
});

describe("Foundation undo target retirement", () => {
  it("removes one target from a mixed group without losing the other", () => {
    const manager = new NSEUndoManager();
    const first = { value: 1 }, second = { value: 1 };
    manager.beginUndoGrouping();
    manager.registerUndo(first, target => { target.value = 0; });
    manager.registerUndo(second, target => { target.value = 0; });
    manager.endUndoGrouping();
    manager.removeAllActionsWithTarget(first);
    manager.undo();
    expect(first.value).toBe(1);
    expect(second.value).toBe(0);
  });
});

describe("Foundation undo history boundaries", () => {
  it("discards redo when a new action is registered after undo", () => {
    const manager = new NSEUndoManager();
    const target = { value: 0 };
    const change = (value: number) => {
      const before = target.value;
      target.value = value;
      manager.registerUndo(target, () => change(before));
    };
    change(1); change(2); manager.undo();
    change(3);
    expect(manager.canRedo).toBe(false);
    manager.undo();
    expect(target.value).toBe(1);
  });
  it("combines nested groups in reverse registration order", () => {
    const manager = new NSEUndoManager();
    const order: number[] = [];
    manager.beginUndoGrouping();
    manager.registerUndo(order, target => { target.push(1); });
    manager.beginUndoGrouping();
    manager.registerUndo(order, target => { target.push(2); });
    manager.endUndoGrouping();
    manager.endUndoGrouping();
    manager.undo();
    expect(order).toEqual([2, 1]);
  });
  it("rejects invalid limits and unmatched groups", () => {
    const manager = new NSEUndoManager();
    expect(() => { manager.levelsOfUndo = -1; }).toThrow(RangeError);
    expect(() => manager.endUndoGrouping()).toThrow();
  });
});

describe("Foundation undo level changes", () => {
  it("keeps the next redo reachable when limiting a fully undone history", () => {
    const manager = new NSEUndoManager();
    const target = { value: 0 };
    const change = (value: number) => {
      const before = target.value;
      target.value = value;
      manager.registerUndo(target, () => change(before));
    };
    change(1); change(2); manager.undo(); manager.undo();
    manager.levelsOfUndo = 1;
    manager.redo();
    expect(target.value).toBe(1);
  });
});

it("rejects a thenable returned by a synchronous Foundation handler", () => {
  const manager = new NSEUndoManager();
  manager.registerUndo({}, (() => Promise.resolve()) as () => void);
  expect(() => manager.undo()).toThrow(/synchronous/i);
});
