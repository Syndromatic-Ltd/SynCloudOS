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

import { GFXColour } from "../GraphicsFX/GFXColour";
import type { GFXPoint } from "../GraphicsFX/GFXGeometry";
export type AFXLayerCorner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";
/** CALayer's independent edge flags; combine flags with bitwise OR. */
export const AFXEdgeAntialiasingMask = Object.freeze({
  layerLeftEdge: 1, layerRightEdge: 2, layerBottomEdge: 4, layerTopEdge: 8,
} as const);
export type AFXEdgeAntialiasingMask = number;
export interface AFXLayerStyle {
  readonly hidden: boolean;
  readonly doubleSided: boolean;
  readonly allowsEdgeAntialiasing: boolean;
  readonly edgeAntialiasingMask: AFXEdgeAntialiasingMask;
  readonly backgroundColour: GFXColour | null;
  readonly borderColour: GFXColour | null;
  readonly borderWidth: number;
  readonly cornerRadius: number;
  readonly maskedCorners: readonly AFXLayerCorner[];
  readonly shadowColour: GFXColour | null;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly shadowOffset: GFXPoint;
}
export const defaultAFXLayerStyle: AFXLayerStyle = Object.freeze({
  hidden: false,
  doubleSided: true,
  allowsEdgeAntialiasing: false,
  edgeAntialiasingMask: 15,
  backgroundColour: null,
  borderColour: null,
  borderWidth: 0,
  cornerRadius: 0,
  maskedCorners: Object.freeze([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ] as const),
  shadowColour: null,
  shadowOpacity: 0,
  shadowRadius: 3,
  shadowOffset: Object.freeze({ x: 0, y: -3 }),
});
export function layerFinite(
  value: number,
  name: string,
  minimum = -1e9,
  maximum = 1e9,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${name} is outside supported bounds.`);
  return value;
}
export function layerColour(value: GFXColour | null): GFXColour | null {
  if (value !== null && !(value instanceof GFXColour))
    throw new TypeError("Layer colours require GFXColour or null.");
  return value;
}
