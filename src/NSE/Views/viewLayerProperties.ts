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

import type { CSSProperties } from "react";
import type { AFXLayerCornerCurve } from "../../FX/AnimationFX/AFXLayerStyle";
import { NSEShadow, type NSEShadowOptions } from "../Graphics/NSEShadow";
import { useNSEAppearance } from "../Appearance/NSEAppearanceProvider";

/** Shared NSView.shadow and CALayer corner properties. */
export interface ViewLayerProperties {
  readonly shadow?: NSEShadow | NSEShadowOptions | null;
  readonly cornerRadius?: number;
  readonly cornerCurve?: AFXLayerCornerCurve;
}

export function nseNonNegative(value: number | undefined, name: string): number | undefined {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new RangeError(`${name} must be finite and non-negative.`);
  return value;
}

/** Project semantic properties only. The selected theme owns the drawing recipe. */
export function useNSEViewLayerProperties({ shadow, cornerRadius, cornerCurve }: ViewLayerProperties) {
  const appearance = useNSEAppearance();
  const radius = nseNonNegative(cornerRadius, "cornerRadius");
  if (cornerCurve !== undefined && cornerCurve !== "circular" && cornerCurve !== "continuous") throw new TypeError("Unknown cornerCurve.");
  const value = shadow == null ? null : shadow instanceof NSEShadow ? shadow : new NSEShadow(shadow);
  const style = {
    ...(radius !== undefined ? { "--nse-corner-radius": `${radius}px` } : {}),
    ...(value ? {
      "--nse-shadow-colour": value.shadowColour,
      "--nse-shadow-offset-x": `${value.shadowOffset.width}px`,
      "--nse-shadow-offset-y": `${-value.shadowOffset.height}px`,
      "--nse-shadow-blur": `${value.shadowBlurRadius}px`,
    } : {}),
  } as CSSProperties;
  return {
    attributes: {
      "data-nse-view-layer": value || radius !== undefined || cornerCurve ? "" : undefined,
      "data-corner-curve": cornerCurve,
      "data-nse-corner-curve": cornerCurve,
      "data-nse-shadow": value ? "true" : undefined,
      "data-nse-shadow-suppressed": value && (appearance.transparency === "reduced" || appearance.contrast === "forced") ? "true" : undefined,
    },
    style,
  };
}
