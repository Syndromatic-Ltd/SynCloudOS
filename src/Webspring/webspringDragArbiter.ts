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

import { getWebspringDragNearestCandidate } from "./webspringDragReorder";

/** A rest's pending timer, held opaquely so the host's timer kind does not leak. */
type WebspringDragTimer = unknown;

/** How long an icon rests between two slots before it takes the nearer one. */
export const WEBSPRING_DRAG_REORDER_REST_MS = 150;
/** How long a dragged app rests on another app's artwork to make a folder. */
export const WEBSPRING_DRAG_MERGE_REST_MS = 350;
/** How long a dragged app rests on a folder's artwork to join it. */
export const WEBSPRING_DRAG_FOLDER_REST_MS = 200;
/** How far beyond a folder's artwork the drop still catches, as a fraction of its size. */
export const WEBSPRING_DRAG_FOLDER_CATCH_MARGIN = 0.2;
/** How long a dragged app rests on a folder before it springs open. */
export const WEBSPRING_DRAG_SPRING_OPEN_MS = 800;

export interface WebspringDragPoint {
  readonly x: number;
  readonly y: number;
}

export interface WebspringDragRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface WebspringDragEntry {
  readonly id: string;
  readonly kind: "app" | "folder";
  /** The entry's position in its container. */
  readonly index: number;
  /** The icon's artwork alone: its well or tile, without the label. */
  readonly artwork: WebspringDragRect;
}

/** Where the dragged icon's centre is, and what it can see there. */
export interface WebspringDragView {
  /** The container under the icon: the Board's top level, or an open folder. */
  readonly container: "board" | "folder";
  /** The open folder, when the drag is inside one. */
  readonly folderId?: string | null;
  /** The container's entries, in order. */
  readonly entries: readonly WebspringDragEntry[];
  /** The open folder's panel; a drag that leaves it closes the folder. */
  readonly panel?: WebspringDragRect | null;
  /** The folder's own cell on the Board; the link from the icon into its panel. */
  readonly origin?: WebspringDragRect | null;
}

/** What a drag asks its view to do as it changes its mind. */
export interface WebspringDragHandlers {
  /** The icon rested on `index`: move it there. */
  reorder(index: number): void;
  /** The resting app's drop well appears (`targetId`) or withdraws (`null`). */
  merge(targetId: string | null): void;
  /** The app has rested on a folder long enough for it to open under the drag. */
  springOpen(folderId: string): void;
  /** The icon left the open folder's panel: close it and return to the Board. */
  leavePanel(folderId: string): void;
}

export interface WebspringDragArbiterOptions extends WebspringDragHandlers {
  /** The app or folder being dragged. */
  readonly itemId: string;
  readonly kind: "app" | "folder";
  /** Whether this drag may merge. Folders never merge; a view with fixed folders passes false. */
  readonly canMerge?: boolean;
}

export interface WebspringDragResult {
  /** The drop well armed when the drag ended, or null. */
  readonly mergeTargetId: string | null;
  /** The folder the release falls into, or null. */
  readonly folderId: string | null;
  /** The position inside that folder, or null when the app joins at the end. */
  readonly dropIndex: number | null;
}

export interface WebspringDragArbiter {
  /** Reports the dragged icon's centre, measured with the grab offset kept. */
  update(point: WebspringDragPoint, view: WebspringDragView): void;
  /** Drops the pending rests and any armed drop well, keeping the drag under way. */
  clear(): void;
  /** Ends the drag: stops the rests and reports what the release falls on. */
  end(): WebspringDragResult;
}

function insideRect(rect: WebspringDragRect, point: WebspringDragPoint, margin = 0): boolean {
  const insetX = rect.width * margin;
  const insetY = rect.height * margin;
  return point.x >= rect.left - insetX && point.x <= rect.left + rect.width + insetX &&
    point.y >= rect.top - insetY && point.y <= rect.top + rect.height + insetY;
}

/** The merge zone: an app's artwork exactly, a folder's artwork with its catch margin. */
function mergeZone(entry: WebspringDragEntry): WebspringDragRect {
  if (entry.kind !== "folder") return entry.artwork;
  const insetX = entry.artwork.width * WEBSPRING_DRAG_FOLDER_CATCH_MARGIN;
  const insetY = entry.artwork.height * WEBSPRING_DRAG_FOLDER_CATCH_MARGIN;
  return {
    left: entry.artwork.left - insetX,
    top: entry.artwork.top - insetY,
    width: entry.artwork.width + insetX * 2,
    height: entry.artwork.height + insetY * 2
  };
}

/** Whether the icon is still with the folder: inside its panel, or in the band
 *  that links the folder's cell on the Board to the panel's top edge. */
function insideFolderArea(
  panel: WebspringDragRect,
  origin: WebspringDragRect | null | undefined,
  point: WebspringDragPoint
): boolean {
  if (insideRect(panel, point)) return true;
  if (!origin) return false;
  return point.y >= Math.min(origin.top, panel.top) && point.y <= panel.top &&
    point.x >= Math.min(origin.left, panel.left) &&
    point.x <= Math.max(origin.left + origin.width, panel.left + panel.width);
}

/**
 * The one drag arbiter the Board and any custom launcher view share. It holds
 * no geometry of its own: the view reports the dragged icon's centre and the
 * entries around it, and the arbiter times the rests that reorder, merge and
 * spring a folder open.
 */
export function createWebspringDragArbiter({
  itemId,
  kind,
  canMerge = kind === "app",
  reorder,
  merge,
  springOpen,
  leavePanel
}: WebspringDragArbiterOptions): WebspringDragArbiter {
  let rest: { index: number; timer: WebspringDragTimer } | null = null;
  let mergeRest: { id: string; armed: boolean; timer: WebspringDragTimer } | null = null;
  let springRest: { folderId: string; timer: WebspringDragTimer } | null = null;
  /** The folder this drag already sprang open, so it is not armed again. */
  let sprungId: string | null = null;
  /** The nearest index the icon is settled on, and whether it has already moved there. */
  let stayIndex: number | null = null;
  let stayMoved = false;
  let hoveredIndex: number | null = null;
  let view: WebspringDragView | null = null;
  let point: WebspringDragPoint | null = null;
  let leftPanel = false;

  function clearRest() {
    if (!rest) return;
    clearTimeout(rest.timer as Parameters<typeof clearTimeout>[0]);
    rest = null;
  }

  function withdrawMerge() {
    if (!mergeRest) return;
    clearTimeout(mergeRest.timer as Parameters<typeof clearTimeout>[0]);
    const armed = mergeRest.armed;
    mergeRest = null;
    if (armed) merge(null);
  }

  function clearSpring() {
    if (!springRest) return;
    clearTimeout(springRest.timer as Parameters<typeof clearTimeout>[0]);
    springRest = null;
  }

  function mergeTargetAt(entries: readonly WebspringDragEntry[], at: WebspringDragPoint): WebspringDragEntry | null {
    for (const entry of entries) {
      if (entry.id === itemId) continue;
      if (insideRect(mergeZone(entry), at)) return entry;
    }
    return null;
  }

  function armMerge(entry: WebspringDragEntry) {
    const id = entry.id;
    const wait = entry.kind === "folder" ? WEBSPRING_DRAG_FOLDER_REST_MS : WEBSPRING_DRAG_MERGE_REST_MS;
    mergeRest = {
      id,
      armed: false,
      timer: setTimeout(() => {
        if (mergeRest?.id !== id) return;
        mergeRest.armed = true;
        merge(id);
      }, wait)
    };
  }

  function armSpring(folderId: string) {
    if (springRest?.folderId === folderId) return;
    clearSpring();
    springRest = {
      folderId,
      timer: setTimeout(() => {
        springRest = null;
        sprungId = folderId;
        // The drop well gives way to the panel it opens.
        withdrawMerge();
        springOpen(folderId);
      }, WEBSPRING_DRAG_SPRING_OPEN_MS)
    };
  }

  /** Arms the reorder rest on the slot nearest the icon's centre, unless that slot is the dragged
   *  entry's own or the icon may not reorder here. Returns the nearest slot, the dragged entry's own
   *  included, which is where a release keeps it. */
  function settleReorder(entries: readonly WebspringDragEntry[], at: WebspringDragPoint, reorderable: boolean): number | null {
    const nearest = getWebspringDragNearestCandidate(
      entries.map((entry) => ({ itemId: entry.id, index: entry.index, rect: entry.artwork })),
      at
    );
    const restIndex = reorderable && nearest && nearest.itemId !== itemId ? nearest.index : null;
    if (restIndex !== stayIndex) {
      stayIndex = restIndex;
      stayMoved = false;
      clearRest();
    }
    if (restIndex !== null && !stayMoved && !rest) {
      rest = {
        index: restIndex,
        timer: setTimeout(() => {
          if (rest?.index !== restIndex) return;
          rest = null;
          stayMoved = true;
          reorder(restIndex);
        }, WEBSPRING_DRAG_REORDER_REST_MS)
      };
    }
    return nearest?.index ?? null;
  }

  function update(nextPoint: WebspringDragPoint, nextView: WebspringDragView) {
    point = nextPoint;
    view = nextView;
    const wasLeft = leftPanel;
    leftPanel = false;
    hoveredIndex = null;
    if (nextView.container === "folder") {
      clearSpring();
      withdrawMerge();
      if (nextView.panel && !insideFolderArea(nextView.panel, nextView.origin, nextPoint)) {
        clearRest();
        sprungId = null;
        leftPanel = true;
        // One departure closes the folder, however many moves arrive before the Board re-renders.
        if (!wasLeft && nextView.folderId) leavePanel(nextView.folderId);
        return;
      }
      // Only a member reorders inside its panel; an app from the Board lands where it is released.
      const member = nextView.entries.some((entry) => entry.id === itemId);
      hoveredIndex = settleReorder(nextView.entries, nextPoint, member);
      return;
    }

    if (!canMerge) {
      clearSpring();
      withdrawMerge();
      settleReorder(nextView.entries, nextPoint, true);
      return;
    }

    const target = mergeTargetAt(nextView.entries, nextPoint);
    if (!target) {
      clearSpring();
      withdrawMerge();
      settleReorder(nextView.entries, nextPoint, true);
      return;
    }

    clearRest();
    if (mergeRest?.id !== target.id) {
      withdrawMerge();
      armMerge(target);
    }
    if (target.kind === "folder") {
      if (sprungId !== target.id) armSpring(target.id);
    } else {
      clearSpring();
    }
  }

  function clear() {
    clearRest();
    withdrawMerge();
    clearSpring();
    stayIndex = null;
    stayMoved = false;
    hoveredIndex = null;
  }

  function end(): WebspringDragResult {
    const mergeTargetId = mergeRest?.armed ? mergeRest.id : null;
    const lastView = view;
    const lastPoint = point;
    clearRest();
    withdrawMerge();
    clearSpring();
    stayIndex = null;
    stayMoved = false;

    if (lastView?.container === "folder" && !leftPanel) {
      const folderId = lastView.folderId ?? null;
      sprungId = null;
      return {
        mergeTargetId,
        folderId,
        // The nearest member's slot; a panel without geometry for its members takes the app at the end.
        dropIndex: hoveredIndex ?? lastView.entries.length
      };
    }

    if (sprungId && lastView && lastPoint) {
      const sprung = lastView.entries.find((entry) => entry.id === sprungId);
      if (sprung && insideRect(mergeZone(sprung), lastPoint)) {
        sprungId = null;
        return { mergeTargetId: null, folderId: sprung.id, dropIndex: null };
      }
    }

    sprungId = null;
    return { mergeTargetId, folderId: null, dropIndex: null };
  }

  return { update, clear, end };
}
