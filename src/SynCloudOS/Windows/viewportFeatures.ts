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

/** Immutable canonical geometry needed by both native window presentation and
 * NSE projections; this is a pure calculation, not another screen service. */
export interface ViewportRegionGeometry {
  readonly geometryState: "current" | "retained" | "unavailable";
  readonly viewportFeatures?: RuntimeViewportFeaturesSnapshot;
  readonly hostViewportBounds: WindowBounds;
  readonly visualViewportBounds: WindowBounds;
  readonly safeAreaInsets: Readonly<{ blockStart: number; inlineEnd: number; blockEnd: number; inlineStart: number }>;
}
export interface ViewportBookRegions { readonly left: WindowBounds; readonly right: WindowBounds; }
type Bounds = WindowBounds;

export function resolveViewportBookRegions(traits: ViewportRegionGeometry, bounds: WindowBounds,
  minimumPaneSize: Readonly<{ width: number; height: number }> = { width: 280, height: 160 }): ViewportBookRegions | null {
  if (![minimumPaneSize.width, minimumPaneSize.height].every(value => Number.isFinite(value) && value > 0)) return null;
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
  if (![left, right].every(rect => rect.width >= minimumPaneSize.width && rect.height >= minimumPaneSize.height)) return null;
  return Object.freeze({ left, right });
}

function validRegionOwner(bounds: WindowBounds | null | undefined): bounds is WindowBounds {
  return Boolean(bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width >= 0 && bounds.height >= 0);
}
function regionOverlap(a: WindowBounds, b: WindowBounds): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

export function selectViewportBookRegion(geometry: ViewportRegionGeometry, owner: WindowBounds,
  origin?: WindowBounds | null, direction: "ltr" | "rtl" = "ltr"): WindowBounds | null {
  if (!validRegionOwner(owner) || owner.width <= 0 || owner.height <= 0) return null;
  const host = geometry.hostViewportBounds;
  const pair = resolveViewportBookRegions(geometry, host);
  if (!pair) return null;
  const regions = [pair.left, pair.right].map(rect => Object.freeze({ ...rect, x: rect.x + host.x, y: rect.y + host.y }));
  const target = validRegionOwner(origin) && regionOverlap({ ...origin, width: Math.max(1, origin.width), height: Math.max(1, origin.height) }, host) > 0 ? origin : owner;
  const scores = regions.map(rect => regionOverlap(rect, target));
  if (scores[0] !== scores[1]) return regions[scores[0]! > scores[1]! ? 0 : 1]!;
  const ownerScores = regions.map(rect => regionOverlap(rect, owner));
  if (ownerScores[0] !== ownerScores[1]) return regions[ownerScores[0]! > ownerScores[1]! ? 0 : 1]!;
  return regions[direction === "rtl" ? 1 : 0]!;
}

export function screenViewportRegionGeometry(screen: Pick<import("./ScreenService").ScreenSnapshot,
  "geometryState" | "viewportFeatures" | "layoutViewport" | "visualViewport" | "safeAreaInsets">): ViewportRegionGeometry {
  return { geometryState: screen.geometryState, viewportFeatures: screen.viewportFeatures,
    hostViewportBounds: screen.layoutViewport, visualViewportBounds: screen.visualViewport, safeAreaInsets: screen.safeAreaInsets };
}
