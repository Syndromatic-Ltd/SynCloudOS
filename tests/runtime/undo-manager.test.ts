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

import { describe, expect, it, vi } from "vitest";
import { createUndoManager, defineAwaitUndoAction, defineSyncUndoAction } from "../../src/SynCloudOS/Undo";

const owner = { kind: "document" as const, id: "document:one" };
const runtimeId = "runtime:undo" as never;

describe("UndoManager", () => {
  it("defers lease retirement until an in-flight undo has settled", async () => {
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    const lease = manager.createRegistrationLease();
    let startedResolve!: () => void;
    const started = new Promise<void>((resolve) => { startedResolve = resolve; });
    let releaseUndo!: () => void;
    const gate = new Promise<void>((resolve) => { releaseUndo = resolve; });
    let cleanups = 0;
    lease.register(defineAwaitUndoAction({
      name: "Deferred undo",
      asyncPolicy: "await",
      undo: async () => {
        startedResolve();
        await gate;
      },
      redo: async () => undefined,
      cleanup: () => { cleanups += 1; },
    }));

    const pending = manager.undo();
    await started;
    lease.revoke();
    expect(cleanups).toBe(0);
    releaseUndo();

    await expect(pending).resolves.toMatchObject({ status: "cancelled", direction: "undo" });
    expect(manager.inspect()).toMatchObject({ cursor: 0, entries: [] });
    expect(cleanups).toBe(1);
  });

  it("defers a revoked in-flight redo, compensates it, and retains a valid empty cursor", async () => {
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    const lease = manager.createRegistrationLease();
    let value = "after";
    let startedResolve!: () => void;
    const started = new Promise<void>((resolve) => { startedResolve = resolve; });
    let releaseRedo!: () => void;
    const gate = new Promise<void>((resolve) => { releaseRedo = resolve; });
    let cleanups = 0;
    lease.register(defineAwaitUndoAction({
      name: "Deferred redo",
      asyncPolicy: "await",
      undo: async () => { value = "before"; },
      redo: async () => {
        value = "after";
        startedResolve();
        await gate;
      },
      cleanup: () => { cleanups += 1; },
    }));
    await expect(manager.undo()).resolves.toMatchObject({ status: "completed", direction: "undo" });
    expect(value).toBe("before");

    const pending = manager.redo();
    await started;
    lease.revoke();
    expect(cleanups).toBe(0);
    releaseRedo();

    await expect(pending).resolves.toMatchObject({ status: "cancelled", direction: "redo" });
    expect(value).toBe("before");
    expect(manager.inspect()).toMatchObject({ cursor: 0, entries: [] });
    expect(cleanups).toBe(1);
  });

  it("re-partitions a mixed group after one lease is revoked so the surviving mount owns its remaining history", async () => {
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    const first = manager.createRegistrationLease();
    const second = manager.createRegistrationLease();
    let value = 11;
    manager.beginGroup("mixed mounted edits");
    first.register(defineSyncUndoAction({ name: "First", asyncPolicy: "forbid", undo: () => { value -= 1; }, redo: () => { value += 1; } }));
    second.register(defineSyncUndoAction({ name: "Second", asyncPolicy: "forbid", undo: () => { value -= 10; }, redo: () => { value += 10; } }));
    manager.endGroup();

    expect(first.canUndo).toBe(false);
    expect(second.canUndo).toBe(false);
    first.revoke();

    expect(second.canUndo).toBe(true);
    expect(second.undoTitle).toBe("Undo mixed mounted edits");
    await expect(second.undo()).resolves.toMatchObject({ status: "completed", direction: "undo" });
    expect(value).toBe(1);
    expect(manager.inspect()).toMatchObject({ cursor: 0, entries: [expect.objectContaining({ actionCount: 1 })] });
  });

  it("keeps registration, reservation, execution, and cleanup transactional when an observer throws", async () => {
    const observerErrors = vi.fn();
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10, observeListenerError: observerErrors });
    const healthyObserver = vi.fn();
    const cleanup = vi.fn();
    let value = "after";
    manager.subscribe(() => { throw new Error("observer failure"); });
    manager.subscribe(healthyObserver);

    expect(() => manager.register(defineSyncUndoAction({
      name: "Observer-safe edit",
      asyncPolicy: "forbid",
      undo: () => { value = "before"; },
      redo: () => { value = "after"; },
      cleanup,
    }))).not.toThrow();
    expect(manager.canUndo).toBe(true);

    await expect(manager.undo()).resolves.toMatchObject({ status: "completed" });
    expect(value).toBe("before");
    expect(manager.isExecuting).toBe(false);
    expect(healthyObserver).toHaveBeenCalled();
    expect(observerErrors).toHaveBeenCalled();

    const reservation = manager.reserve();
    expect(() => reservation.commit(defineSyncUndoAction({
      name: "Reserved observer-safe edit",
      asyncPolicy: "forbid",
      undo: () => { value = "before"; },
      redo: () => { value = "after"; },
      cleanup,
    }))).not.toThrow();
    manager.clear();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("undoes and redoes symmetric actions with nested grouping", async () => {
    let value = 0;
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 50 });
    manager.beginGroup("Adjust value");
    value = 1;
    manager.register(defineSyncUndoAction({ name: "Set value to 1", asyncPolicy: "forbid", undo: () => { value = 0; }, redo: () => { value = 1; } }));
    manager.beginGroup("Fine adjustment");
    value = 2;
    manager.register(defineSyncUndoAction({ name: "Set value to 2", asyncPolicy: "forbid", undo: () => { value = 1; }, redo: () => { value = 2; } }));
    manager.endGroup();
    manager.endGroup();
    await expect(manager.undo()).resolves.toMatchObject({ status: "completed", actionName: "Adjust value" });
    expect(value).toBe(0);
    await manager.redo();
    expect(value).toBe(2);
  });

  it("cancels groups, coalesces only adjacent automatic boundaries, and clears redo with cleanup", async () => {
    let value = "";
    const cleanup = vi.fn();
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 50 });
    manager.beginGroup("Cancelled");
    manager.register(defineSyncUndoAction({ name: "Discarded", asyncPolicy: "forbid", undo: () => {}, redo: () => {}, cleanup }));
    manager.cancelGroup();
    expect(manager.canUndo).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
    for (const [letter, boundaryId] of [["a", "typing:1"], ["b", "typing:1"], ["c", "typing:2"]] as const) {
      const before = value;
      value += letter;
      const after = value;
      manager.register(defineSyncUndoAction({ name: "Typing", asyncPolicy: "forbid", undo: () => { value = before; }, redo: () => { value = after; }, cleanup }), { automaticGroup: { kind: "typing", key: "editor", boundaryId } });
    }
    await manager.undo();
    expect(value).toBe("ab");
    await manager.undo();
    expect(value).toBe("");
    await manager.redo();
    expect(value).toBe("ab");
    manager.register(defineSyncUndoAction({ name: "Replacement", asyncPolicy: "forbid", undo: () => {}, redo: () => {} }));
    expect(manager.canRedo).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("invalidates and discards open groups when document replacement clears history", () => {
    const cleanup = vi.fn();
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 50 });
    manager.beginGroup("Old document edit");
    manager.register(defineSyncUndoAction({
      name: "Old document typing",
      asyncPolicy: "forbid",
      undo: () => {},
      redo: () => {},
      cleanup,
    }));
    expect(manager.isDirty).toBe(true);

    manager.clear();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(manager.inspect()).toMatchObject({ groupDepth: 0, cursor: 0, isDirty: false });
    expect(manager.canUndo).toBe(false);
    expect(() => manager.endGroup()).toThrow("No undo group is open.");
    expect(manager.canUndo).toBe(false);
    expect(manager.isDirty).toBe(false);
  });

  it("evicts by count and bytes with cleanup exactly once", async () => {
    const cleaned: string[] = [];
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 2, maxEstimatedBytes: 5 });
    for (const name of ["one", "two", "three"]) manager.register(defineSyncUndoAction({ name, asyncPolicy: "forbid", estimatedBytes: 3, undo: () => {}, redo: () => {}, cleanup: () => cleaned.push(name) }));
    expect(manager.inspect().entries.map(({ name }) => name)).toEqual(["three"]);
    expect(cleaned).toEqual(["one", "two"]);
    manager.dispose();
    expect(cleaned).toEqual(["one", "two", "three"]);
  });

  it("restores before/after state and tracks the clean cursor across undo and redo", async () => {
    const restored: unknown[] = [];
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    manager.markClean();
    manager.register(defineSyncUndoAction({
      name: "Move selection",
      asyncPolicy: "forbid",
      undo: () => {},
      redo: () => {},
      restoration: { before: { responderId: "before", viewport: { x: 1, y: 2 } }, after: { responderId: "after", selection: { anchor: 3 } }, restore: (snapshot) => { restored.push(snapshot); } },
    }));
    expect(manager.isDirty).toBe(true);
    await manager.undo();
    expect(manager.isDirty).toBe(false);
    expect(restored.at(-1)).toMatchObject({ responderId: "before" });
    await manager.redo();
    expect(manager.isDirty).toBe(true);
    expect(restored.at(-1)).toMatchObject({ responderId: "after" });
  });

  it("treats markClean as an automatic coalescing boundary", async () => {
    let value = "";
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    const type = (letter: string) => {
      const before = value;
      value += letter;
      const after = value;
      manager.register(defineSyncUndoAction({
        name: "Typing",
        asyncPolicy: "forbid",
        undo: () => { value = before; },
        redo: () => { value = after; },
      }), { automaticGroup: { kind: "typing", key: "editor", boundaryId: "typing:one" } });
    };

    type("a");
    type("b");
    manager.markClean();
    type("c");

    expect(value).toBe("abc");
    expect(manager.isDirty).toBe(true);
    await manager.undo();
    expect(value).toBe("ab");
    expect(manager.isDirty).toBe(false);
    await manager.redo();
    expect(value).toBe("abc");
    expect(manager.isDirty).toBe(true);
  });

  it("serialises await actions and prevents nested undo", async () => {
    const order: string[] = [];
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    manager.register(defineAwaitUndoAction({ name: "Async", asyncPolicy: "await", undo: async () => { order.push("start"); await Promise.resolve(); order.push("end"); }, redo: async () => { order.push("redo"); } }));
    const first = manager.undo();
    await expect(manager.undo()).resolves.toMatchObject({ status: "busy" });
    await expect(first).resolves.toMatchObject({ status: "completed" });
    expect(order).toEqual(["start", "end"]);
  });

  it("rejects registration while redo is executing so the history frontier cannot move underneath it", async () => {
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    let startedResolve!: () => void;
    const started = new Promise<void>((resolve) => { startedResolve = resolve; });
    let releaseRedo!: () => void;
    const gate = new Promise<void>((resolve) => { releaseRedo = resolve; });
    manager.register(defineAwaitUndoAction({
      name: "Deferred edit",
      asyncPolicy: "await",
      undo: async () => undefined,
      redo: async () => {
        startedResolve();
        await gate;
      },
    }));
    await expect(manager.undo()).resolves.toMatchObject({ status: "completed", direction: "undo" });

    const pendingRedo = manager.redo();
    await started;
    expect(() => manager.register(defineSyncUndoAction({
      name: "Concurrent edit",
      asyncPolicy: "forbid",
      undo: () => undefined,
      redo: () => undefined,
    }))).toThrow("Undo history is executing an action.");
    releaseRedo();

    await expect(pendingRedo).resolves.toMatchObject({ status: "completed", direction: "redo" });
    expect(manager.inspect()).toMatchObject({
      cursor: 1,
      entries: [expect.objectContaining({ name: "Deferred edit" })],
    });
  });

  it("rejects thenables escaping the sync type without moving the cursor", async () => {
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    const bad = defineSyncUndoAction({ name: "Bad", asyncPolicy: "forbid", undo: (() => Promise.resolve()) as any, redo: () => {} });
    manager.register(bad);
    const before = manager.inspect().cursor;
    await expect(manager.undo()).resolves.toMatchObject({ status: "failed", code: "undo-async-policy-violation" });
    expect(manager.inspect().cursor).toBe(before);
    expect(manager.canUndo).toBe(false);
    expect(manager.isDirty).toBe(true);
    await expect(manager.undo()).resolves.toMatchObject({ status: "failed", code: "undo-entry-poisoned" });
  });

  it("compensates completed sibling actions when grouped undo or redo fails partway through", async () => {
    let value = 2;
    const calls: string[] = [];
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    manager.beginGroup("Two steps");
    manager.register(defineSyncUndoAction({
      name: "First",
      asyncPolicy: "forbid",
      undo: () => { calls.push("undo:first"); throw new Error("first undo failed"); },
      redo: () => { calls.push("redo:first"); value = 1; },
    }));
    manager.register(defineSyncUndoAction({
      name: "Second",
      asyncPolicy: "forbid",
      undo: () => { calls.push("undo:second"); value = 1; },
      redo: () => { calls.push("redo:second"); value = 2; },
    }));
    manager.endGroup();

    await expect(manager.undo()).resolves.toMatchObject({ status: "failed", code: "undo-action-failed" });
    expect(value).toBe(2);
    expect(calls).toEqual(["undo:second", "undo:first", "redo:second"]);
    expect(manager.inspect().cursor).toBe(1);
    expect(manager.canUndo).toBe(false);

    const redoManager = createUndoManager({ runtimeId, owner: { kind: "document", id: "redo" }, maxEntries: 10 });
    let redoValue = 2;
    const redoCalls: string[] = [];
    redoManager.beginGroup("Two redo steps");
    redoManager.register(defineSyncUndoAction({ name: "First", asyncPolicy: "forbid", undo: () => { redoCalls.push("undo:first"); redoValue = 0; }, redo: () => { redoCalls.push("redo:first"); redoValue = 1; } }));
    redoManager.register(defineSyncUndoAction({ name: "Second", asyncPolicy: "forbid", undo: () => { redoCalls.push("undo:second"); redoValue = 1; }, redo: () => { redoCalls.push("redo:second"); throw new Error("second redo failed"); } }));
    redoManager.endGroup();
    await redoManager.undo();
    redoCalls.length = 0;

    await expect(redoManager.redo()).resolves.toMatchObject({ status: "failed", code: "undo-action-failed" });
    expect(redoValue).toBe(0);
    expect(redoCalls).toEqual(["redo:first", "redo:second", "undo:first"]);
    expect(redoManager.inspect().cursor).toBe(0);
    expect(redoManager.canRedo).toBe(false);
  });

  it("poisons an entry when restoration or compensation cannot establish a safe history state", async () => {
    let value = 1;
    const manager = createUndoManager({ runtimeId, owner, maxEntries: 10 });
    manager.register(defineSyncUndoAction({
      name: "Restoration",
      asyncPolicy: "forbid",
      undo: () => { value = 0; },
      redo: () => { value = 1; },
      restoration: {
        before: { responderId: "before" },
        after: { responderId: "after" },
        restore: (snapshot) => {
          if (snapshot.responderId === "before") throw new Error("before restoration failed");
        },
      },
    }));
    manager.markClean();
    await expect(manager.undo()).resolves.toMatchObject({ status: "failed", code: "undo-action-failed" });
    expect(value).toBe(1);
    expect(manager.isDirty).toBe(true);
    expect(manager.canUndo).toBe(false);

    const poisoned = createUndoManager({ runtimeId, owner: { kind: "document", id: "compensation" }, maxEntries: 10 });
    let poisonedValue = 2;
    poisoned.beginGroup("Cannot compensate");
    poisoned.register(defineSyncUndoAction({ name: "First", asyncPolicy: "forbid", undo: () => { throw new Error("first undo failed"); }, redo: () => { poisonedValue = 1; } }));
    poisoned.register(defineSyncUndoAction({ name: "Second", asyncPolicy: "forbid", undo: () => { poisonedValue = 1; }, redo: () => { throw new Error("redo compensation failed"); } }));
    poisoned.endGroup();
    await expect(poisoned.undo()).resolves.toMatchObject({ status: "failed", code: "undo-compensation-failed" });
    expect(poisoned.inspect().entries[0]).toMatchObject({ poisoned: true });
    expect(poisoned.isDirty).toBe(true);
    expect(poisoned.canUndo).toBe(false);
    await expect(poisoned.undo()).resolves.toMatchObject({ status: "failed", code: "undo-entry-poisoned" });
  });
});
