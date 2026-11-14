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

import type { CSSProperties, ElementType, ReactNode } from "react";

export type SmoothSurfaceRadius = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "app" | "pill" | number;

export type SmoothSurfaceCurve = "arc" | "squircle" | "superellipse" | "clothoid";

export type SmoothSurfaceFocus = "none" | "ring" | "within" | "inset";

export type SmoothSurfaceOverflow = "visible" | "hidden" | "clip" | "auto" | "scroll";

export type SmoothSurfaceScroll = "none" | "contained" | "momentum" | "panel";

export type SmoothSurfaceShadow = "none" | "hairline" | "soft" | "raised" | "floating" | "inset" | "physical";

export type SmoothSurfacePerformance = "auto" | "static" | "transform" | "paint" | "strict";

export type SmoothSurfaceStyleValue = string | number;

export type SmoothSurfaceStyle = Record<string, SmoothSurfaceStyleValue>;

export interface SmoothSurfaceCornerConfig {
  radius: SmoothSurfaceRadius;
  curve?: SmoothSurfaceCurve;
  smoothing?: number;
  exponent?: number;
  preserveSmoothing?: boolean;
}

export type SmoothSurfaceCorner = SmoothSurfaceRadius | SmoothSurfaceCornerConfig;

export interface SmoothSurfacePerCornerConfig {
  topLeft?: SmoothSurfaceCorner;
  topRight?: SmoothSurfaceCorner;
  bottomRight?: SmoothSurfaceCorner;
  bottomLeft?: SmoothSurfaceCorner;
}

export interface SmoothSurfacePhysicalityStop {
  offsetX?: number;
  offsetY: number;
  blur?: number;
  spread?: number;
  color: string;
  opacity: number;
}

export interface SmoothSurfacePhysicalityConfig {
  top?: SmoothSurfacePhysicalityStop;
  bottom?: SmoothSurfacePhysicalityStop;
}

export type SmoothSurfacePhysicality = "off" | false | SmoothSurfacePhysicalityConfig;

export type SmoothSurfaceBorderStyle = "solid" | "dashed" | "dotted" | "double" | "groove" | "ridge";

export interface SmoothSurfaceBorderConfig {
  width: number;
  color: string;
  opacity: number;
  style?: SmoothSurfaceBorderStyle;
  dash?: number;
  gap?: number;
  lineCap?: "butt" | "round" | "square";
}

export interface SmoothSurfaceShadowConfig {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
}

export interface SmoothSurfaceEffectsConfig {
  innerBorder?: SmoothSurfaceBorderConfig;
  outerBorder?: SmoothSurfaceBorderConfig;
  middleBorder?: SmoothSurfaceBorderConfig;
  innerShadow?: SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[];
  shadow?: SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[];
}

export interface SmoothSurfaceOptions extends SmoothSurfacePerCornerConfig {
  radius?: SmoothSurfaceRadius;
  curve?: SmoothSurfaceCurve;
  smoothing?: number;
  exponent?: number;
  preserveSmoothing?: boolean;
  focus?: SmoothSurfaceFocus;
  overflow?: SmoothSurfaceOverflow;
  scroll?: SmoothSurfaceScroll;
  shadow?: SmoothSurfaceShadow | SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[];
  physicality?: SmoothSurfacePhysicality;
  performance?: SmoothSurfacePerformance;
  autoEffects?: boolean;
  innerBorder?: SmoothSurfaceBorderConfig;
  outerBorder?: SmoothSurfaceBorderConfig;
  middleBorder?: SmoothSurfaceBorderConfig;
  innerShadow?: SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[];
  className?: string;
  style?: SmoothSurfaceStyle;
}

export type SmoothSurfaceRequest = SmoothSurfaceOptions | SmoothSurfaceRadius | "off" | false | null | undefined;

export interface SmoothSurfaceResolvedCorner {
  radius: number;
  curve: SmoothSurfaceCurve;
  smoothing: number;
  exponent: number;
  preserveSmoothing: boolean;
}

export interface SmoothSurfaceResolvedCorners {
  topLeft: SmoothSurfaceResolvedCorner;
  topRight: SmoothSurfaceResolvedCorner;
  bottomRight: SmoothSurfaceResolvedCorner;
  bottomLeft: SmoothSurfaceResolvedCorner;
}

export interface SmoothSurfaceResolvedOptions {
  radius: SmoothSurfaceRadius;
  curve: SmoothSurfaceCurve;
  smoothing: number;
  exponent: number;
  preserveSmoothing: boolean;
  focus: SmoothSurfaceFocus;
  overflow: SmoothSurfaceOverflow;
  scroll: SmoothSurfaceScroll;
  shadow: SmoothSurfaceShadow | SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[];
  physicality: SmoothSurfacePhysicality;
  performance: SmoothSurfacePerformance;
  autoEffects: boolean;
  corners: SmoothSurfaceResolvedCorners;
  innerBorder?: SmoothSurfaceBorderConfig;
  outerBorder?: SmoothSurfaceBorderConfig;
  middleBorder?: SmoothSurfaceBorderConfig;
  innerShadow?: SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[];
  dropShadow?: SmoothSurfaceShadowConfig | SmoothSurfaceShadowConfig[];
}

export interface SmoothSurfaceResolution {
  readonly className: string;
  readonly style: SmoothSurfaceStyle;
  readonly options: SmoothSurfaceResolvedOptions;
}

export interface SmoothSurfaceProps {
  readonly className: string;
  readonly style: SmoothSurfaceStyle;
}

export interface OptionalSmoothSurfaceProps {
  readonly className?: string;
  readonly style?: SmoothSurfaceStyle;
}

export interface SmoothSurfaceComponentProps {
  as?: ElementType;
  children?: ReactNode;
  smoothSurface?: SmoothSurfaceRequest;
  className?: string;
  style?: CSSProperties;
  autoEffects?: boolean;
  role?: string;
  "aria-label"?: string;
}
