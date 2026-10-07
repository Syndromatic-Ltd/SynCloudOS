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

import type { SynCloudOSPresentationTraits } from "../../src/SynCloudOS/SynCloudOS";

export interface StaticPresentationTraitsInput {
  readonly width: number;
  readonly height: number;
  readonly reducedMotion?: boolean;
  readonly reducedTransparency?: boolean;
  readonly forcedColours?: boolean;
  readonly safeArea?: Readonly<{ readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }>;
  readonly primaryPointer?: "fine" | "coarse" | "none";
  readonly hover?: boolean;
  readonly touch?: boolean;
}

/**
 * Test-only mounted-content projection.  Fixtures name their content bounds
 * explicitly instead of supplying the retired responsive classifier.
 */
export function createStaticPresentationTraits(input: StaticPresentationTraitsInput): SynCloudOSPresentationTraits {
  const safeArea = input.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const horizontalSizeClass = input.width < 768 ? "compact" : input.width < 1280 ? "regular" : "wide";
  const orientation = input.height > input.width ? "portrait" : "landscape";
  const bounds = Object.freeze({ x: 0, y: 0, width: input.width, height: input.height });
  return Object.freeze({
    revision: 1,
    contentBounds: bounds,
    hostViewportBounds: bounds,
    horizontalSizeClass,
    orientation,
    workArea: bounds,
    visualViewportBounds: bounds,
    safeAreaInsets: Object.freeze({
      blockStart: safeArea.top,
      inlineEnd: safeArea.right,
      blockEnd: safeArea.bottom,
      inlineStart: safeArea.left,
    }),
    virtualKeyboardInset: 0,
    devicePixelRatio: 1,
    primaryPointer: input.primaryPointer ?? "fine",
    hover: input.hover ?? true,
    touch: input.touch ?? false,
    reducedMotion: input.reducedMotion ?? false,
    reducedTransparency: input.reducedTransparency ?? false,
    forcedColours: input.forcedColours ?? false,
  });
}

export function createStaticPresentationPort(input: StaticPresentationTraitsInput) {
  const snapshot = createStaticPresentationTraits(input);
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (_listener: () => void) => () => undefined,
  });
}
