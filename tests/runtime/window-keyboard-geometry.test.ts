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

import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowBoundsScheduler } from "../../src/SynCloudOS/Windows";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";
import { createControlledFrameEnvironment } from "../fixtures/windowMoveResizeFixture";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("WindowBoundsScheduler", () => {
  it("ignores a cancelled callback retained after cancellation failure", () => {
    const callbacks = new Map<number, (timestamp: number) => void>();
    const commits: Array<{ readonly id: string; readonly x: number }> = [];
    const observed: unknown[] = [];
    let nextHandle = 0;
    const scheduler = new WindowBoundsScheduler({
      requestFrame: (callback) => {
        const handle = ++nextHandle;
        callbacks.set(handle, callback);
        return handle;
      },
      cancelFrame: () => { throw new Error("injected frame cancellation failure"); },
      readBounds: () => ({ x: 10, y: 20, width: 300, height: 200 }),
      commit: (id, bounds) => commits.push({ id, x: bounds.x }),
      observeError: (error) => observed.push(error),
    });

    scheduler.schedule("owned-window", {
      kind: "delta",
      delta: { x: 5, y: 0, width: 0, height: 0 },
      reason: "keyboard-move",
    });
    const staleEntry = callbacks.entries().next().value as [number, (timestamp: number) => void];
    const snapshot = scheduler.freeze();
    scheduler.restore(snapshot);
    const liveEntry = [...callbacks.entries()].find(([handle]) => handle !== staleEntry[0]);
    if (!liveEntry) throw new Error("Expected a replacement injected frame.");

    callbacks.delete(staleEntry[0]);
    staleEntry[1](16);
    expect(commits).toEqual([]);

    callbacks.delete(liveEntry[0]);
    liveEntry[1](32);
    expect(commits).toEqual([{ id: "owned-window", x: 15 }]);
    expect(observed).toHaveLength(1);
  });

  it("coalesces repeated keyboard deltas into one injected-frame publication", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("window-1", { bounds: { x: 80, y: 60, width: 400, height: 300 } }));
    await fixture.manager.open("window-1");
    const publication = vi.fn();
    fixture.manager.subscribe(publication);

    for (let index = 0; index < 20; index += 1) {
      fixture.manager.scheduleBoundsChange("window-1", {
        kind: "delta",
        delta: { x: 1, y: 0, width: 0, height: 0 },
        reason: "keyboard-move",
      });
    }
    expect(publication).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(1);
    frames.flushNext();
    expect(fixture.manager.select("window-1").record.bounds.x).toBe(100);
    expect(publication).toHaveBeenCalledOnce();
  });

  it("applies mixed replacements and deltas in arrival order with the latest replacement authoritative", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("window-1", { bounds: { x: 80, y: 60, width: 400, height: 300 } }));
    await fixture.manager.open("window-1");

    fixture.manager.scheduleBoundsChange("window-1", {
      kind: "replace",
      bounds: { x: 100, y: 100, width: 420, height: 320 },
      reason: "pointer-resize",
    });
    fixture.manager.scheduleBoundsChange("window-1", {
      kind: "delta",
      delta: { x: 5, y: -5, width: 10, height: 0 },
      reason: "keyboard-resize",
    });
    fixture.manager.scheduleBoundsChange("window-1", {
      kind: "replace",
      bounds: { x: 130, y: 120, width: 440, height: 340 },
      reason: "pointer-resize",
    });
    fixture.manager.scheduleBoundsChange("window-1", {
      kind: "delta",
      delta: { x: 2, y: 3, width: 4, height: 5 },
      reason: "keyboard-resize",
    });
    frames.flushNext();
    expect(fixture.manager.select("window-1").record.bounds).toEqual({ x: 132, y: 123, width: 444, height: 345 });
  });

  it("clamps accumulated keyboard resize deltas at the declared minimum", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("window-1", {
      bounds: { x: 80, y: 60, width: 400, height: 300 },
      minimumSize: { width: 240, height: 160 },
    }));
    await fixture.manager.open("window-1");

    fixture.manager.scheduleBoundsChange("window-1", {
      kind: "delta",
      delta: { x: 0, y: 0, width: -1_000, height: -1_000 },
      reason: "keyboard-resize",
    });
    frames.flushNext();
    expect(fixture.manager.select("window-1").record.bounds).toEqual({ x: 80, y: 60, width: 240, height: 160 });
  });

  it("flushes multiple windows in stable insertion order with one manager publication", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("first"));
    fixture.manager.create(standardWindow("second"));
    await fixture.manager.open("first");
    await fixture.manager.open("second");
    const publication = vi.fn();
    fixture.manager.subscribe(publication);

    fixture.manager.scheduleBoundsChange("second", {
      kind: "delta",
      delta: { x: 2, y: 0, width: 0, height: 0 },
      reason: "keyboard-move",
    });
    fixture.manager.scheduleBoundsChange("first", {
      kind: "delta",
      delta: { x: 1, y: 0, width: 0, height: 0 },
      reason: "keyboard-move",
    });
    frames.flushNext();
    expect(fixture.manager.select("second").record.bounds.x).toBe(82);
    expect(fixture.manager.select("first").record.bounds.x).toBe(81);
    expect(publication).toHaveBeenCalledOnce();
  });

  it("cancels pending work on close, compact presentation and manager disposal", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("window-1"));
    await fixture.manager.open("window-1");
    fixture.manager.scheduleBoundsChange("window-1", {
      kind: "delta",
      delta: { x: 20, y: 0, width: 0, height: 0 },
      reason: "keyboard-move",
    });
    expect(frames.pending()).toBe(1);
    await fixture.manager.requestClose("window-1", { reason: "command" });
    expect(frames.pending()).toBe(0);

    fixture.manager.create(standardWindow("window-2"));
    await fixture.manager.open("window-2");
    fixture.manager.scheduleBoundsChange("window-2", {
      kind: "delta",
      delta: { x: 20, y: 0, width: 0, height: 0 },
      reason: "keyboard-move",
    });
    fixture.manager.dispose();
    expect(frames.pending()).toBe(0);
  });

  it("drops pending desktop geometry when the presentation turns compact before the frame", async () => {
    const frames = createControlledFrameEnvironment();
    const fixture = createWindowTestDependencies({ environment: frames.environment });
    cleanups.push(fixture.cleanup);
    fixture.manager.create(standardWindow("window-1", { bounds: { x: 80, y: 60, width: 400, height: 300 } }));
    await fixture.manager.open("window-1");

    fixture.manager.scheduleBoundsChange("window-1", {
      kind: "delta",
      delta: { x: 50, y: 0, width: 0, height: 0 },
      reason: "keyboard-move",
    });
    frames.setCompact(true);
    frames.flushAll();
    expect(fixture.manager.select("window-1").record.bounds).toEqual({ x: 80, y: 60, width: 400, height: 300 });
  });
});
