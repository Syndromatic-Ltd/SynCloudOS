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

import type { SynCloudOSPresentationTraits } from "../../SynCloudOS/SynCloudOS";

type Bounds = SynCloudOSPresentationTraits["contentBounds"];

/** Physical left/right allocations, local to the measured scene. A reader
 * can use them as page frames; navigation maps its leading pane for RTL. */
export interface NSEBookRegions {
  readonly left: Bounds;
  readonly right: Bounds;
}

export const NSEBookRegionMetrics = Object.freeze({ minimumPaneWidth: 280, minimumPaneHeight: 160 });

/** Explicit posture AND two current, usable, side-by-side regions are needed.
 * A wide window, posture alone, stacked regions or a window on one side never
 * invents book mode. Pane minima are content budgets, not device rules. */
export function resolveNSEBookRegions(traits: SynCloudOSPresentationTraits, bounds: Bounds = traits.contentBounds): NSEBookRegions | null {
  const features = traits.viewportFeatures;
  if (traits.geometryState !== "current" || features?.posture !== "folded" || features.segments?.length !== 2 ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return null;
  const [a, b] = [...features.segments].sort((left, right) => left.x - right.x);
  if (!a || !b || ![a, b].every(rect => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0) ||
    a.x + a.width > b.x || Math.abs(a.y - b.y) > 1 || Math.abs(a.height - b.height) > 1) return null;
  const host = traits.hostViewportBounds;
  if (![a, b].every(rect => rect.x >= host.x && rect.y >= host.y && rect.x + rect.width <= host.x + host.width + 1 && rect.y + rect.height <= host.y + host.height + 1)) return null;
  const visible = traits.visualViewportBounds;
  // Pinch zoom/visual panning uses the existing single-region experience.
  if (visible.width < host.width - 1 || visible.x > host.x + 1) return null;
  const safe = traits.safeAreaInsets;
  const x0 = Math.max(bounds.x, visible.x, host.x + safe.inlineStart);
  const x1 = Math.min(bounds.x + bounds.width, visible.x + visible.width, host.x + host.width - safe.inlineEnd);
  const y0 = Math.max(bounds.y, visible.y, a.y, b.y, host.y + safe.blockStart);
  const y1 = Math.min(bounds.y + bounds.height, visible.y + visible.height, a.y + a.height, b.y + b.height, host.y + host.height - safe.blockEnd);
  const clip = (rect: Bounds): Bounds => Object.freeze({ x: Math.max(x0, rect.x) - bounds.x, y: y0 - bounds.y,
    width: Math.min(x1, rect.x + rect.width) - Math.max(x0, rect.x), height: y1 - y0 });
  const left = clip(a), right = clip(b);
  if (![left, right].every(rect => rect.width >= NSEBookRegionMetrics.minimumPaneWidth && rect.height >= NSEBookRegionMetrics.minimumPaneHeight)) return null;
  return Object.freeze({ left, right });
}
