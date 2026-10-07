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

export { NSESmoothSurface } from "./NSESmoothSurface";
export { useNSESmoothSurface } from "./useNSESmoothSurface";
export type { NSESmoothSurfaceGeometry } from "./useNSESmoothSurface";
export {
  generateNSESmoothSurfaceClipPath,
  generateNSESmoothSurfacePath,
  getNSESmoothSurfaceRadiusNumber,
  resolveNSESmoothSurfaceCorners
} from "./smoothSurfacePath";
export {
  NSESmoothSurfaceAPI,
  getNSESmoothSurfaceClassName,
  getNSESmoothSurfacePhysicalityShadow,
  getNSESmoothSurfaceProps,
  getNSESmoothSurfaceRadiusValue,
  getNSESmoothSurfaceStyle,
  getOptionalNSESmoothSurfaceProps,
  normaliseNSESmoothSurfaceOptions,
  normaliseNSESmoothSurfaceRequest,
  nseAppSmoothSurfaceDefaultOptions,
  nseSmoothSurfaceClassNames,
  nseSmoothSurfaceDefaultOptions,
  resolveNSESmoothSurface
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
  NSESmoothSurfaceBorderConfig,
  NSESmoothSurfaceBorderStyle,
  NSESmoothSurfaceComponentProps,
  NSESmoothSurfaceCorner,
  NSESmoothSurfaceCornerConfig,
  NSESmoothSurfaceCurve,
  NSESmoothSurfaceEffectsConfig,
  NSESmoothSurfaceFocus,
  NSESmoothSurfaceOptions,
  NSESmoothSurfaceOverflow,
  NSESmoothSurfacePerCornerConfig,
  NSESmoothSurfacePerformance,
  NSESmoothSurfacePhysicality,
  NSESmoothSurfacePhysicalityConfig,
  NSESmoothSurfacePhysicalityStop,
  NSESmoothSurfaceProps,
  NSESmoothSurfaceRadius,
  NSESmoothSurfaceRequest,
  NSESmoothSurfaceResolution,
  NSESmoothSurfaceResolvedCorner,
  NSESmoothSurfaceResolvedCorners,
  NSESmoothSurfaceResolvedOptions,
  NSESmoothSurfaceScroll,
  NSESmoothSurfaceShadow,
  NSESmoothSurfaceShadowConfig,
  NSESmoothSurfaceStyle,
  NSESmoothSurfaceStyleValue,
  NSEOptionalSmoothSurfaceProps
} from "./smoothSurfaceTypes";
