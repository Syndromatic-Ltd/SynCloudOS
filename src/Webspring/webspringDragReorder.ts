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

export interface WebspringDragReorderPoint {
  x: number;
  y: number;
}

export interface WebspringDragReorderRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WebspringDragReorderCandidate {
  appId: string;
  index: number;
  rect: WebspringDragReorderRect;
}

export interface WebspringDragReorderTarget {
  appId: string;
  targetIndex: number;
}

export function getWebspringDragReorderTarget(
  candidates: readonly WebspringDragReorderCandidate[],
  point: WebspringDragReorderPoint,
  draggingAppId: string | null | undefined
): WebspringDragReorderTarget | null {
  if (!draggingAppId) return null;

  let nearest: WebspringDragReorderCandidate | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!candidate.appId || !Number.isFinite(candidate.index)) continue;
    if (candidate.rect.width <= 0 || candidate.rect.height <= 0) continue;

    const centerX = candidate.rect.left + candidate.rect.width / 2;
    const centerY = candidate.rect.top + candidate.rect.height / 2;
    const dx = (point.x - centerX) / candidate.rect.width;
    const dy = (point.y - centerY) / candidate.rect.height;
    const distance = dx * dx + dy * dy;

    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  if (!nearest || nearest.appId === draggingAppId) return null;

  return {
    appId: nearest.appId,
    targetIndex: nearest.index
  };
}

export type WebspringDragReorderSlots = ReadonlyMap<number, WebspringDragReorderRect>;

/** Slot geometry stays fixed while artwork springs between slots. */
export function captureWebspringDragReorderSlots(selector: string, root: ParentNode): WebspringDragReorderSlots {
  return new Map(Array.from(root.querySelectorAll<HTMLElement>(selector), (element) => [
    Number(element.dataset.orderIndex),
    element.getBoundingClientRect(),
  ] as const));
}

export function getWebspringDragReorderTargetFromPoint(
  selector: string,
  point: WebspringDragReorderPoint,
  draggingAppId: string | null | undefined,
  root?: ParentNode,
  slots?: WebspringDragReorderSlots,
) {
  const searchRoot = root ?? (typeof document !== "undefined" ? document : null);
  if (!searchRoot) return null;

  const candidates = Array.from(searchRoot.querySelectorAll<HTMLElement>(selector)).map((element) => {
    const rect = slots?.get(Number(element.dataset.orderIndex)) ?? element.getBoundingClientRect();
    return {
      appId: element.dataset.webspringAppId ?? "",
      index: Number(element.dataset.orderIndex),
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }
    };
  });

  return getWebspringDragReorderTarget(candidates, point, draggingAppId);
}
