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

export type NSESmoothSurfaceRadius = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "app" | "pill" | number;

export type NSESmoothSurfaceCurve = "arc" | "squircle" | "superellipse" | "clothoid";

export type NSESmoothSurfaceFocus = "none" | "ring" | "within" | "inset";

export type NSESmoothSurfaceOverflow = "visible" | "hidden" | "clip" | "auto" | "scroll";

export type NSESmoothSurfaceScroll = "none" | "contained" | "momentum" | "panel";

export type NSESmoothSurfaceShadow = "none" | "hairline" | "soft" | "raised" | "floating" | "inset" | "physical";

export type NSESmoothSurfacePerformance = "auto" | "static" | "transform" | "paint" | "strict";

export type NSESmoothSurfaceStyleValue = string | number;

export type NSESmoothSurfaceStyle = Record<string, NSESmoothSurfaceStyleValue>;

export interface NSESmoothSurfaceCornerConfig {
  radius: NSESmoothSurfaceRadius;
  curve?: NSESmoothSurfaceCurve;
  smoothing?: number;
  exponent?: number;
  preserveSmoothing?: boolean;
}

export type NSESmoothSurfaceCorner = NSESmoothSurfaceRadius | NSESmoothSurfaceCornerConfig;

export interface NSESmoothSurfacePerCornerConfig {
  topLeft?: NSESmoothSurfaceCorner;
  topRight?: NSESmoothSurfaceCorner;
  bottomRight?: NSESmoothSurfaceCorner;
  bottomLeft?: NSESmoothSurfaceCorner;
}

export interface NSESmoothSurfacePhysicalityStop {
  offsetX?: number;
  offsetY: number;
  blur?: number;
  spread?: number;
  color: string;
  opacity: number;
}

export interface NSESmoothSurfacePhysicalityConfig {
  top?: NSESmoothSurfacePhysicalityStop;
  bottom?: NSESmoothSurfacePhysicalityStop;
}

export type NSESmoothSurfacePhysicality = "off" | false | NSESmoothSurfacePhysicalityConfig;

export type NSESmoothSurfaceBorderStyle = "solid" | "dashed" | "dotted" | "double" | "groove" | "ridge";

export interface NSESmoothSurfaceBorderConfig {
  width: number;
  color: string;
  opacity: number;
  style?: NSESmoothSurfaceBorderStyle;
  dash?: number;
  gap?: number;
  lineCap?: "butt" | "round" | "square";
}

export interface NSESmoothSurfaceShadowConfig {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
}

export interface NSESmoothSurfaceEffectsConfig {
  innerBorder?: NSESmoothSurfaceBorderConfig;
  outerBorder?: NSESmoothSurfaceBorderConfig;
  middleBorder?: NSESmoothSurfaceBorderConfig;
  innerShadow?: NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[];
  shadow?: NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[];
}

export interface NSESmoothSurfaceOptions extends NSESmoothSurfacePerCornerConfig {
  radius?: NSESmoothSurfaceRadius;
  curve?: NSESmoothSurfaceCurve;
  smoothing?: number;
  exponent?: number;
  preserveSmoothing?: boolean;
  focus?: NSESmoothSurfaceFocus;
  overflow?: NSESmoothSurfaceOverflow;
  scroll?: NSESmoothSurfaceScroll;
  shadow?: NSESmoothSurfaceShadow | NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[];
  physicality?: NSESmoothSurfacePhysicality;
  performance?: NSESmoothSurfacePerformance;
  autoEffects?: boolean;
  innerBorder?: NSESmoothSurfaceBorderConfig;
  outerBorder?: NSESmoothSurfaceBorderConfig;
  middleBorder?: NSESmoothSurfaceBorderConfig;
  innerShadow?: NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[];
  className?: string;
  style?: NSESmoothSurfaceStyle;
}

export type NSESmoothSurfaceRequest = NSESmoothSurfaceOptions | NSESmoothSurfaceRadius | "off" | false | null | undefined;

export interface NSESmoothSurfaceResolvedCorner {
  radius: number;
  curve: NSESmoothSurfaceCurve;
  smoothing: number;
  exponent: number;
  preserveSmoothing: boolean;
}

export interface NSESmoothSurfaceResolvedCorners {
  topLeft: NSESmoothSurfaceResolvedCorner;
  topRight: NSESmoothSurfaceResolvedCorner;
  bottomRight: NSESmoothSurfaceResolvedCorner;
  bottomLeft: NSESmoothSurfaceResolvedCorner;
}

export interface NSESmoothSurfaceResolvedOptions {
  radius: NSESmoothSurfaceRadius;
  curve: NSESmoothSurfaceCurve;
  smoothing: number;
  exponent: number;
  preserveSmoothing: boolean;
  focus: NSESmoothSurfaceFocus;
  overflow: NSESmoothSurfaceOverflow;
  scroll: NSESmoothSurfaceScroll;
  shadow: NSESmoothSurfaceShadow | NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[];
  physicality: NSESmoothSurfacePhysicality;
  performance: NSESmoothSurfacePerformance;
  autoEffects: boolean;
  corners: NSESmoothSurfaceResolvedCorners;
  innerBorder?: NSESmoothSurfaceBorderConfig;
  outerBorder?: NSESmoothSurfaceBorderConfig;
  middleBorder?: NSESmoothSurfaceBorderConfig;
  innerShadow?: NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[];
  dropShadow?: NSESmoothSurfaceShadowConfig | NSESmoothSurfaceShadowConfig[];
}

export interface NSESmoothSurfaceResolution {
  readonly className: string;
  readonly style: NSESmoothSurfaceStyle;
  readonly options: NSESmoothSurfaceResolvedOptions;
}

export interface NSESmoothSurfaceProps {
  readonly className: string;
  readonly style: NSESmoothSurfaceStyle;
}

export interface NSEOptionalSmoothSurfaceProps {
  readonly className?: string;
  readonly style?: NSESmoothSurfaceStyle;
}

export interface NSESmoothSurfaceComponentProps {
  as?: ElementType;
  children?: ReactNode;
  smoothSurface?: NSESmoothSurfaceRequest;
  className?: string;
  style?: CSSProperties;
  autoEffects?: boolean;
  role?: string;
  "aria-label"?: string;
}
