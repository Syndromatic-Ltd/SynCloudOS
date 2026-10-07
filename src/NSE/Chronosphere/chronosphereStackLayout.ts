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

import type {
  ChronosphereVersion,
  ChronosphereDepthSlot,
  ChronosphereStackOptions
} from "./chronosphereTypes";

const DEFAULTS: Required<ChronosphereStackOptions> = {
  stepY: 86,
  stepZ: 220,
  scaleStep: 0.13,
  opacityStep: 0.26,
  detailDepth: 1
};

/** Newest-first ordering — the present version sits at index 0 (the front). */
export function sortChronosphereEntriesNewestFirst<TDetail>(
  entries: readonly ChronosphereVersion<TDetail>[]
): ChronosphereVersion<TDetail>[] {
  const currentFirst = (entry: ChronosphereVersion<TDetail>) => (entry.isCurrent ? 0 : 1);
  return [...entries].sort((a, b) => {
    const byCurrent = currentFirst(a) - currentFirst(b);
    if (byCurrent !== 0) return byCurrent;
    return b.sequence - a.sequence || (b.savedAt ?? 0) - (a.savedAt ?? 0);
  });
}

/**
 * Place each newest-first entry in the receding 3D stack relative to `activeIndex`.
 * Active card is front/centre; older cards (relativeIndex > 0) recede UP into the
 * vortex; newer cards (relativeIndex < 0) sit lower/closer to the viewer.
 */
export function computeChronosphereStack<TDetail>(
  entries: readonly ChronosphereVersion<TDetail>[],
  activeIndex: number,
  options: ChronosphereStackOptions = {}
): ChronosphereDepthSlot<TDetail>[] {
  const cfg = { ...DEFAULTS, ...options };
  const clampedActive = Math.max(0, Math.min(entries.length - 1, activeIndex));

  return entries.map((entry, index) => {
    const relativeIndex = index - clampedActive;
    const isActive = relativeIndex === 0;
    const back = Math.max(0, relativeIndex);
    const front = Math.max(0, -relativeIndex);

    // Older (back) cards recede up + away into the vortex; newer (front) cards —
    // the ones you just left as you travel back in time — fly TOWARD the viewer,
    // zoom up and fade out past the camera (never linger).
    const translateY = -back * cfg.stepY + front * cfg.stepY * 1.45;
    const translateZ = -back * cfg.stepZ + front * cfg.stepZ * 1.7;
    const scale = front > 0
      ? Math.min(1.7, 1 + front * 0.32)
      : Math.max(0.2, 1 - back * cfg.scaleStep);
    const opacity = front > 0
      ? Math.max(0, 1 - front * 1.15)
      : Math.max(0, 1 - back * cfg.opacityStep);
    const blur = back > cfg.detailDepth ? Math.min(5, (back - cfg.detailDepth) * 1.6) : 0;

    return {
      entry,
      index,
      relativeIndex,
      translateY,
      translateZ,
      scale,
      opacity,
      blur,
      zIndex: 1000 - Math.abs(relativeIndex),
      isActive,
      isPlaceholder: back > cfg.detailDepth
    };
  });
}

/** A decorative empty frame receding past the oldest entry, into the vortex. */
export interface ChronosphereBackFrame {
  key: string;
  translateY: number;
  translateZ: number;
  scale: number;
  opacity: number;
  zIndex: number;
}

/**
 * Dark, non-selectable frames that continue the stack behind the oldest real
 * entry — the Leopard Time Machine "empty windows fading into the light" depth
 * cue. Purely decorative; they hold no archive data.
 */
export function computeChronosphereBackFrames(
  entryCount: number,
  activeIndex: number,
  count: number,
  options: ChronosphereStackOptions = {}
): ChronosphereBackFrame[] {
  const cfg = { ...DEFAULTS, ...options };
  const clampedActive = Math.max(0, Math.min(entryCount - 1, activeIndex));
  const deepestBack = Math.max(0, (entryCount - 1) - clampedActive);
  const frames: ChronosphereBackFrame[] = [];

  for (let k = 1; k <= count; k += 1) {
    const back = deepestBack + k;
    frames.push({
      key: `chronosphere-backframe-${k}`,
      translateY: -back * cfg.stepY,
      translateZ: -back * cfg.stepZ,
      scale: Math.max(0.14, 1 - back * cfg.scaleStep),
      opacity: Math.max(0, 0.46 - (k - 1) * 0.14),
      zIndex: 900 - back
    });
  }

  return frames;
}
