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

import type { ChronosphereVersion } from "./chronosphereTypes";

/** Project a depth plane onto the same vanishing point as the Vortex core.
 * Explicit projection survives CSS flattening from opacity/overflow/isolation. */
export function projectChronosphereDepth(depth: number, front: { x: number; y: number }, core: { x: number; y: number }) {
  const scale = Math.pow(0.76, depth);
  return { x: core.x + (front.x - core.x) * scale, y: core.y + (front.y - core.y) * scale, scale };
}

/** No distance cap: every intervening document gets time in the flight. */
export function chronosphereTravelDuration(distance: number): number {
  return distance <= 0 ? 0 : 380 + Math.abs(distance) * 140;
}

/** A tenth of a document is a useful stop; small edits accumulate along the trip. */
export function significantChronosphereIndex(entries: readonly ChronosphereVersion[], start: number, direction: -1 | 1): number {
  const last = entries.length - 1;
  if (last < 0) return 0;
  let index = Math.max(0, Math.min(last, start)), magnitude = 0;
  while (index + direction >= 0 && index + direction <= last) {
    const next = index + direction;
    // Newest-first: the newer entry describes the edit across this boundary.
    const weight = entries[Math.min(index, next)].changeMagnitude;
    magnitude += weight === undefined || !Number.isFinite(weight) ? 1 : Math.max(0, Math.min(1, weight));
    index = next;
    if (magnitude >= 0.1) break;
  }
  return index;
}
