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

import type { WindowBounds } from "./windowTypes";

/** Current browser-reported facts in layout-viewport CSS pixels. Null means
 * unavailable/unreadable, never an inferred posture or a fabricated region. */
export interface RuntimeViewportFeaturesSnapshot {
  readonly posture: "continuous" | "folded" | null;
  readonly segments: readonly WindowBounds[] | null;
}

export const unavailableViewportFeatures: RuntimeViewportFeaturesSnapshot = Object.freeze({ posture: null, segments: null });

export function sameViewportFeatures(left: RuntimeViewportFeaturesSnapshot | undefined, right: RuntimeViewportFeaturesSnapshot | undefined): boolean {
  if (left === right) return true;
  const a = left ?? unavailableViewportFeatures;
  const b = right ?? unavailableViewportFeatures;
  return a.posture === b.posture && (a.segments === b.segments || Boolean(a.segments && b.segments &&
    a.segments.length === b.segments.length && a.segments.every((rect, index) => {
      const other = b.segments![index]!;
      return rect.x === other.x && rect.y === other.y && rect.width === other.width && rect.height === other.height;
    })));
}

/** Never retain old hinge coordinates against new or unavailable geometry. */
export function validateViewportFeatures(source: RuntimeViewportFeaturesSnapshot | undefined, viewport: WindowBounds): RuntimeViewportFeaturesSnapshot {
  if (!source) return unavailableViewportFeatures;
  const posture = source.posture === "folded" || source.posture === "continuous" ? source.posture : null;
  const segments = source.segments;
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 8 || !segments.every(rect =>
    rect && [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0 && rect.x >= viewport.x && rect.y >= viewport.y &&
    rect.x + rect.width <= viewport.x + viewport.width + 1 && rect.y + rect.height <= viewport.y + viewport.height + 1)) {
    return Object.freeze({ posture, segments: null });
  }
  return Object.freeze({ posture, segments: Object.freeze(segments.map(rect => Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }))) });
}
