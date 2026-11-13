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

export { SmoothSurface } from "./SmoothSurfaceView";
export { useSmoothSurface } from "./useSmoothSurface";
export type { SmoothSurfaceGeometry } from "./useSmoothSurface";
export {
  generateSmoothSurfaceClipPath,
  generateSmoothSurfacePath,
  getSmoothSurfaceRadiusNumber,
  resolveSmoothSurfaceCorners
} from "./smoothSurfacePath";
export {
  SmoothSurfaceAPI,
  getSmoothSurfaceClassName,
  getSmoothSurfacePhysicalityShadow,
  getSmoothSurfaceProps,
  getSmoothSurfaceRadiusValue,
  getSmoothSurfaceStyle,
  getOptionalSmoothSurfaceProps,
  normaliseSmoothSurfaceOptions,
  normaliseSmoothSurfaceRequest,
  nseAppSmoothSurfaceDefaultOptions,
  nseSmoothSurfaceClassNames,
  nseSmoothSurfaceDefaultOptions,
  resolveSmoothSurface
} from "./smoothSurface";
export {
  nseSmoothSurfaceDefaultPhysicality,
  nseSmoothSurfaceFocusTokens,
  nseSmoothSurfaceOverflowTokens,
  nseSmoothSurfacePerformanceTokens,
  nseSmoothSurfaceRadiusTokens,
  nseSmoothSurfaceScrollTokens,
  nseSmoothSurfaceShadowTokens,
  nseSmoothSurfaceTokens
} from "./smoothSurfaceTokens";
export type {
  SmoothSurfaceBorderConfig,
  SmoothSurfaceBorderStyle,
  SmoothSurfaceComponentProps,
  SmoothSurfaceCorner,
  SmoothSurfaceCornerConfig,
  SmoothSurfaceCurve,
  SmoothSurfaceEffectsConfig,
  SmoothSurfaceFocus,
  SmoothSurfaceOptions,
  SmoothSurfaceOverflow,
  SmoothSurfacePerCornerConfig,
  SmoothSurfacePerformance,
  SmoothSurfacePhysicality,
  SmoothSurfacePhysicalityConfig,
  SmoothSurfacePhysicalityStop,
  SmoothSurfaceProps,
  SmoothSurfaceRadius,
  SmoothSurfaceRequest,
  SmoothSurfaceResolution,
  SmoothSurfaceResolvedCorner,
  SmoothSurfaceResolvedCorners,
  SmoothSurfaceResolvedOptions,
  SmoothSurfaceScroll,
  SmoothSurfaceShadow,
  SmoothSurfaceShadowConfig,
  SmoothSurfaceStyle,
  SmoothSurfaceStyleValue,
  NSEOptionalSmoothSurfaceProps
} from "./smoothSurfaceTypes";
