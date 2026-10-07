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

import type { GFXBlendMode } from "./graphicsTypes";

export interface GFXTransparencyGroupOptions {
  readonly alpha?: number;
  readonly blendMode?: GFXBlendMode;
}

/** Opaque scope token returned by a graphics context for one isolated composition group. */
export class GFXTransparencyGroup {
  readonly id: string;
  readonly alpha: number;
  readonly blendMode: GFXBlendMode;

  constructor(id: string, alpha: number, blendMode: GFXBlendMode) {
    if (!id || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("Invalid transparency group.");
    this.id = id;
    this.alpha = alpha;
    this.blendMode = blendMode;
    Object.freeze(this);
  }
}
