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

import { createContext, useContext, type PropsWithChildren } from "react";
import { generateNSESmoothSurfaceClipPath, generateNSESmoothSurfacePath, getNSESmoothSurfaceRadiusNumber } from "../NSE/SmoothSurface";
import type { WebspringFolderAppearance, WebspringFolderCornerRadius, WebspringFolderSmoothSurface } from "./webspringTypes";

/** Squircle corners spanning the same extent as a continuous-corner app icon's. */
export const defaultWebspringFolderSmoothSurface: Readonly<Required<WebspringFolderSmoothSurface>> = Object.freeze({
  radius: "36%",
  curve: "squircle",
  smoothing: 0.6,
});

export const defaultWebspringFolderAppearance: WebspringFolderAppearance = Object.freeze({
  shape: Object.freeze({ kind: "roundedRect" as const, smoothSurface: defaultWebspringFolderSmoothSurface }),
  fill: "inset" as const,
});

const FolderAppearanceContext = createContext<WebspringFolderAppearance>(defaultWebspringFolderAppearance);

export function WebspringFolderAppearanceProvider({ value, children }: PropsWithChildren<{ value: WebspringFolderAppearance }>) {
  return <FolderAppearanceContext.Provider value={value}>{children}</FolderAppearanceContext.Provider>;
}

/** The definition's folder appearance, for a view drawing folder-shaped artwork of its own. */
export function useWebspringFolderAppearance(): WebspringFolderAppearance {
  return useContext(FolderAppearanceContext);
}

/** The outline of a folder tile laid out at `width` by `height` pixels. */
export interface WebspringFolderTileGeometry {
  /** SVG path data, in the tile's own pixels. */
  readonly path: string;
  /** The tile's CSS `clip-path`. */
  readonly clipPath: string;
}

export function resolveWebspringFolderTileGeometry(
  shape: WebspringFolderAppearance["shape"],
  width: number,
  height: number,
): WebspringFolderTileGeometry {
  if (shape.kind === "circle") {
    const radius = Math.min(width, height) / 2;
    // Four decimal places, as the smooth-surface paths are written.
    const [left, right, middle, r] = [width / 2 - radius, width / 2 + radius, height / 2, radius].map((value) => Number(value.toFixed(4)));
    return {
      path: `M ${left} ${middle} A ${r} ${r} 0 1 0 ${right} ${middle} A ${r} ${r} 0 1 0 ${left} ${middle} Z`,
      clipPath: "circle(closest-side)",
    };
  }
  const { radius, curve, smoothing } = shape.smoothSurface;
  const options = {
    // A percentage is of the tile's shorter side; pixels and tokens are absolute.
    radius: typeof radius === "string" && radius.endsWith("%")
      ? Number.parseFloat(radius) / 100 * Math.min(width, height)
      : getNSESmoothSurfaceRadiusNumber(radius as Exclude<WebspringFolderCornerRadius, `${number}%`>),
    curve,
    smoothing,
  };
  return {
    path: generateNSESmoothSurfacePath(width, height, options),
    clipPath: generateNSESmoothSurfaceClipPath(width, height, options),
  };
}
