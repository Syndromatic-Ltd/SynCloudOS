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

import { resolveViewportBookRegions } from "../../SynCloudOS/SynCloudOS";
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
  return resolveViewportBookRegions(traits, bounds, { width: NSEBookRegionMetrics.minimumPaneWidth, height: NSEBookRegionMetrics.minimumPaneHeight });
}
