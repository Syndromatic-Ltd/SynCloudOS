/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the
 * GNU Affero General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWebspringDragGrabOffset } from "../../src/Webspring/WebspringDragProxy";
import {
  WEBSPRING_DRAG_FOLDER_REST_MS,
  WEBSPRING_DRAG_MERGE_REST_MS,
  WEBSPRING_DRAG_REORDER_REST_MS,
  WEBSPRING_DRAG_SPRING_OPEN_MS,
  createWebspringDragArbiter,
  type WebspringDragEntry,
  type WebspringDragView,
} from "../../src/Webspring/webspringDragArbiter";

/** An 80 x 80 artwork at `left`, its label below and outside the artwork. */
function entry(id: string, index: number, left: number, kind: "app" | "folder" = "app"): WebspringDragEntry {
  return { id, index, kind, artwork: { left, top: 0, width: 80, height: 80 } };
}

const board: WebspringDragView = {
  container: "board",
  entries: [entry("alpha", 0, 0), entry("beta", 1, 100), entry("tools", 2, 200, "folder")],
};

/** The open Tools panel: a member "member" at slot 0 and "other" at slot 1. */
const memberPanel: WebspringDragView = {
  container: "folder",
  folderId: "tools",
  panel: { left: 200, top: 0, width: 320, height: 200 },
  entries: [entry("member", 0, 220), entry("other", 1, 300)],
};

function createArbiter(overrides: {
  itemId?: string;
  kind?: "app" | "folder";
  canMerge?: boolean;
  view?: WebspringDragView;
} = {}) {
  const reorder = vi.fn();
  const merge = vi.fn();
  const springOpen = vi.fn();
  const leavePanel = vi.fn();
  const arbiter = createWebspringDragArbiter({
    itemId: overrides.itemId ?? "dragged",
    kind: overrides.kind ?? "app",
    canMerge: overrides.canMerge,
    reorder,
    merge,
    springOpen,
    leavePanel,
  });
  return { arbiter, reorder, merge, springOpen, leavePanel, view: overrides.view ?? board };
}

describe("Webspring drag arbiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reorders only after the icon rests on the same slot for 150 ms", () => {
    const { arbiter, reorder, view } = createArbiter();
    // Between Alpha's and Beta's artwork, so no merge zone holds the icon.
    arbiter.update({ x: 85, y: 40 }, view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_REORDER_REST_MS - 1);
    expect(reorder).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reorder).toHaveBeenCalledWith(0);

    // Still in the slot it moved to: no second move.
    arbiter.update({ x: 86, y: 44 }, view);
    vi.advanceTimersByTime(500);
    expect(reorder).toHaveBeenCalledTimes(1);

    // Leaving and returning restarts the wait.
    arbiter.update({ x: 182, y: 40 }, view);
    vi.advanceTimersByTime(100);
    arbiter.update({ x: 90, y: 40 }, view);
    vi.advanceTimersByTime(100);
    arbiter.update({ x: 182, y: 40 }, view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_REORDER_REST_MS - 1);
    expect(reorder).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(reorder).toHaveBeenLastCalledWith(1);
  });

  it("merges onto another app only with the centre over its artwork for 350 ms", () => {
    const { arbiter, merge, reorder, view } = createArbiter();
    arbiter.update({ x: 40, y: 40 }, view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_MERGE_REST_MS - 1);
    expect(merge).not.toHaveBeenCalled();
    expect(reorder).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(merge).toHaveBeenCalledWith("alpha");

    // The label under the artwork is not part of the target.
    const label = createArbiter();
    label.arbiter.update({ x: 40, y: 96 }, label.view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_MERGE_REST_MS);
    expect(label.merge).not.toHaveBeenCalled();
    expect(label.reorder).toHaveBeenCalledWith(0);
  });

  it("withdraws a drop well that was armed before the icon moved away", () => {
    const { arbiter, merge, view } = createArbiter();
    arbiter.update({ x: 40, y: 40 }, view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_MERGE_REST_MS);
    expect(merge).toHaveBeenCalledWith("alpha");
    merge.mockClear();
    arbiter.update({ x: 140, y: 40 }, view);
    expect(merge).toHaveBeenCalledWith(null);
  });

  it("catches folders 20 % beyond their artwork and joins after 200 ms", () => {
    const { arbiter, merge, reorder, view } = createArbiter();
    // The folder's artwork runs 200..280, so its catch reaches 16 px out, to 184..296.
    arbiter.update({ x: 183, y: 40 }, view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_FOLDER_REST_MS + 100);
    expect(merge).not.toHaveBeenCalled();
    expect(reorder).toHaveBeenCalled();

    arbiter.update({ x: 184, y: 40 }, view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_FOLDER_REST_MS - 1);
    expect(merge).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(merge).toHaveBeenCalledWith("tools");
  });

  it("springs a rested folder open after 800 ms and continues inside its panel", () => {
    const { arbiter, merge, springOpen, reorder, leavePanel } = createArbiter();
    arbiter.update({ x: 240, y: 40 }, board);
    vi.advanceTimersByTime(WEBSPRING_DRAG_FOLDER_REST_MS);
    expect(merge).toHaveBeenCalledWith("tools");
    expect(springOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WEBSPRING_DRAG_SPRING_OPEN_MS - WEBSPRING_DRAG_FOLDER_REST_MS);
    expect(springOpen).toHaveBeenCalledWith("tools");
    // The panel replaces the drop well.
    expect(merge).toHaveBeenLastCalledWith(null);

    const panel: WebspringDragView = {
      container: "folder",
      folderId: "tools",
      panel: { left: 200, top: 0, width: 320, height: 200 },
      entries: [entry("member", 0, 220), entry("other", 1, 300)],
    };
    arbiter.update({ x: 250, y: 40 }, panel);
    // The dragged app is on the Board, not a member: it does not reorder the panel's members.
    vi.advanceTimersByTime(WEBSPRING_DRAG_REORDER_REST_MS);
    expect(reorder).not.toHaveBeenCalled();

    expect(arbiter.end()).toEqual({ mergeTargetId: null, folderId: "tools", dropIndex: 0 });
    expect(leavePanel).not.toHaveBeenCalled();
  });

  it("closes the folder when the icon leaves the panel's edge", () => {
    const { arbiter, leavePanel, reorder } = createArbiter();
    const panel: WebspringDragView = {
      container: "folder",
      folderId: "tools",
      panel: { left: 200, top: 0, width: 320, height: 200 },
      entries: [entry("member", 0, 220)],
    };
    arbiter.update({ x: 250, y: 40 }, panel);
    arbiter.update({ x: 100, y: 40 }, panel);
    expect(leavePanel).toHaveBeenCalledWith("tools");
    vi.advanceTimersByTime(WEBSPRING_DRAG_REORDER_REST_MS);
    expect(reorder).not.toHaveBeenCalled();
    expect(arbiter.end()).toEqual({ mergeTargetId: null, folderId: null, dropIndex: null });
  });

  it("closes the folder once, however far the icon travels outside the panel", () => {
    const { arbiter, leavePanel } = createArbiter();
    arbiter.update({ x: 250, y: 40 }, memberPanel);
    arbiter.update({ x: 100, y: 40 }, memberPanel);
    arbiter.update({ x: 60, y: 40 }, memberPanel);
    expect(leavePanel).toHaveBeenCalledTimes(1);
    expect(leavePanel).toHaveBeenCalledWith("tools");
  });

  it("holds a top-level app inside a panel until release, then lands it at the nearest member's slot", () => {
    const { arbiter, reorder } = createArbiter();
    arbiter.update({ x: 340, y: 40 }, memberPanel);
    vi.advanceTimersByTime(WEBSPRING_DRAG_REORDER_REST_MS * 2);
    expect(reorder).not.toHaveBeenCalled();
    expect(arbiter.end()).toEqual({ mergeTargetId: null, folderId: "tools", dropIndex: 1 });
  });

  it("reorders a member inside its panel after resting on another member", () => {
    const { arbiter, reorder } = createArbiter({ itemId: "member" });
    arbiter.update({ x: 340, y: 40 }, memberPanel);
    vi.advanceTimersByTime(WEBSPRING_DRAG_REORDER_REST_MS - 1);
    expect(reorder).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reorder).toHaveBeenCalledWith(1);
    expect(arbiter.end()).toEqual({ mergeTargetId: null, folderId: "tools", dropIndex: 1 });
  });

  it("keeps a member released on its own slot in place", () => {
    const { arbiter, reorder } = createArbiter({ itemId: "member" });
    arbiter.update({ x: 260, y: 40 }, memberPanel);
    vi.advanceTimersByTime(WEBSPRING_DRAG_REORDER_REST_MS * 2);
    expect(reorder).not.toHaveBeenCalled();
    expect(arbiter.end()).toEqual({ mergeTargetId: null, folderId: "tools", dropIndex: 0 });
  });

  it("keeps a sprung folder while the icon travels from its cell into the panel", () => {
    const { arbiter, leavePanel } = createArbiter();
    const origin = { left: 210, top: 0, width: 80, height: 96 };
    const panel: WebspringDragView = {
      container: "folder",
      folderId: "tools",
      origin,
      panel: { left: 200, top: 120, width: 320, height: 200 },
      entries: [entry("member", 0, 220)],
    };
    // Between the folder's cell and the panel's top edge.
    arbiter.update({ x: 250, y: 100 }, panel);
    expect(leavePanel).not.toHaveBeenCalled();
    arbiter.update({ x: 250, y: 150 }, panel);
    expect(leavePanel).not.toHaveBeenCalled();
    // Past the panel's side.
    arbiter.update({ x: 190, y: 150 }, panel);
    expect(leavePanel).toHaveBeenCalledWith("tools");
  });

  it("never merges a folder drag, even over artwork", () => {
    const { arbiter, merge, reorder, view } = createArbiter({ itemId: "tools", kind: "folder" });
    arbiter.update({ x: 40, y: 40 }, view);
    vi.advanceTimersByTime(1000);
    expect(merge).not.toHaveBeenCalled();
    expect(reorder).toHaveBeenCalledWith(0);
  });

  it("ends with the armed target and reports nothing for a released rest", () => {
    const { arbiter, view } = createArbiter();
    arbiter.update({ x: 40, y: 40 }, view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_MERGE_REST_MS);
    expect(arbiter.end()).toEqual({ mergeTargetId: "alpha", folderId: null, dropIndex: null });

    const second = createArbiter();
    second.arbiter.update({ x: 40, y: 40 }, second.view);
    vi.advanceTimersByTime(WEBSPRING_DRAG_MERGE_REST_MS - 1);
    expect(second.arbiter.end()).toEqual({ mergeTargetId: null, folderId: null, dropIndex: null });
  });
});

describe("Webspring drag grab offset", () => {
  it("keeps the pressed point's distance from the icon's centre", () => {
    expect(getWebspringDragGrabOffset({ x: 10, y: 10 }, { left: 0, top: 0, width: 80, height: 40 }))
      .toEqual({ x: 30, y: 10 });
  });

  it("has no offset when the artwork is unknown or empty", () => {
    expect(getWebspringDragGrabOffset({ x: 10, y: 10 }, null)).toEqual({ x: 0, y: 0 });
    expect(getWebspringDragGrabOffset({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 40 }))
      .toEqual({ x: 0, y: 0 });
  });
});
