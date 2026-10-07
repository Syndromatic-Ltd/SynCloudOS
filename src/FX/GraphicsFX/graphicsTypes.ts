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

import type { GFXImage, GFXInterpolation } from "./GFXImage";
import type { GFXColour } from "./GFXColour";
import type { GFXAffineTransform, GFXPoint, GFXRect, GFXSize } from "./GFXGeometry";
import type { GFXTransparencyGroup } from "./GFXTransparencyGroup";
export type GFXPathCommand = Readonly<{
    kind: "move";
    point: GFXPoint;
}> | Readonly<{
    kind: "line";
    point: GFXPoint;
}> | Readonly<{
    kind: "quad";
    control: GFXPoint;
    point: GFXPoint;
}> | Readonly<{
    kind: "curve";
    control1: GFXPoint;
    control2: GFXPoint;
    point: GFXPoint;
}> | Readonly<{
    kind: "close";
}>;
/** A mounted AppSDK image client supplies an opaque issuer. The recorder
 * proves host ownership at its runtime boundary before accepting it. */
export type GFXIdentifiers = object;
export type { GFXAffineTransform } from "./GFXGeometry";
export interface GFXGradientStop {
    readonly offset: number;
    readonly colour: GFXColour;
}
export type GFXGradientGeometry = Readonly<{
    kind: "linear";
    start: GFXPoint;
    end: GFXPoint;
}> | Readonly<{
    kind: "radial";
    centre: GFXPoint;
    radius: number;
}>;
export interface GFXShadowValue {
    readonly offset: GFXPoint;
    readonly blur: number;
    readonly spread: number;
    readonly colour: GFXColour;
}
export interface GFXTextFont {
    readonly family: string;
    readonly size: number;
    readonly weight?: number;
    readonly style?: "normal" | "italic";
}
export type GFXBlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
    | "source-in" | "source-out" | "source-atop" | "destination-in" | "destination-out" | "destination-atop" | "xor" | "copy" | "clear";
export type GFXLineCap = "butt" | "round" | "square";
export type GFXLineJoin = "miter" | "round" | "bevel";
export interface GFXTextAttributes {
    readonly letterSpacing: number;
    readonly alignment: "start" | "middle" | "end";
}
export interface GFXPaintColour {
    readonly kind: "colour";
    readonly css: string;
}
export type GFXFillRule = "nonzero" | "evenodd";
export interface GFXPaintGradient {
    readonly units: "objectBoundingBox" | "userSpaceOnUse";
    readonly transform: GFXAffineTransform;
    readonly kind: "gradient";
    readonly id: string;
    readonly stops: readonly Readonly<{
        offset: number;
        css: string;
    }>[];
    readonly geometry: GFXGradientGeometry;
}
export interface GFXPaintPattern {
    readonly interpolation: GFXInterpolation;
    readonly kind: "pattern";
    readonly id: string;
    readonly image: GFXImage;
    readonly transform: GFXAffineTransform;
}
export interface GFXImageMask {
    readonly id: string;
    readonly image: GFXImage;
    readonly rect: GFXRect;
    readonly transform: GFXAffineTransform;
}
export type GFXPaint = GFXPaintColour | GFXPaintGradient | GFXPaintPattern;
/** Immutable, explicit recorder state captured with every display command.
 * The renderer never reads mutable context state after recording. */
export interface GFXCommandState {
    readonly interpolation: GFXInterpolation;
    readonly clipRules: readonly GFXFillRule[];
    readonly lineDashPhase: number;
    readonly miterLimit: number;
    readonly masks: readonly GFXImageMask[];
    readonly transform: GFXAffineTransform;
    /** Legacy projection of the most recently pushed clip path. */
    readonly clipPathData: string | null;
    /** Every active clip, in application order; renderers intersect this chain. */
    readonly clipPathDataChain: readonly string[];
    readonly alpha: number;
    readonly blendMode: GFXBlendMode;
    readonly patternPhase: GFXPoint;
    readonly paintSamplingScale: number;
    readonly fill: GFXPaint;
    readonly stroke: GFXPaint;
    readonly lineWidth: number;
    readonly lineCap: GFXLineCap;
    readonly lineJoin: GFXLineJoin;
    readonly lineDash: readonly number[];
    readonly shadow: Readonly<{
        readonly offset: GFXPoint;
        readonly blur: number;
        readonly spread: number;
        readonly css: string;
    }> | null;
    readonly textAttributes: GFXTextAttributes;
}
export type GFXCommand = Readonly<{
    kind: "image";
    image: GFXImage;
    destination: GFXRect;
    state: GFXCommandState;
}> | Readonly<{
    kind: "fill-path";
    fillRule: GFXFillRule;
    path: readonly GFXPathCommand[];
    pathData: string;
    paint: GFXPaint;
    opacity: number;
    transform: GFXAffineTransform;
    clipPathData: string | null;
    clipPathDataChain: readonly string[];
    blendMode: GFXBlendMode;
    state: GFXCommandState;
}> | Readonly<{
    kind: "stroke-path";
    path: readonly GFXPathCommand[];
    pathData: string;
    paint: GFXPaint;
    opacity: number;
    transform: GFXAffineTransform;
    clipPathData: string | null;
    clipPathDataChain: readonly string[];
    blendMode: GFXBlendMode;
    lineWidth: number;
    lineCap: GFXLineCap;
    lineJoin: GFXLineJoin;
    lineDash: readonly number[];
    state: GFXCommandState;
}> | Readonly<{
    kind: "text";
    text: string;
    origin: GFXPoint;
    font: Required<GFXTextFont>;
    paint: GFXPaint;
    opacity: number;
    transform: GFXAffineTransform;
    clipPathData: string | null;
    clipPathDataChain: readonly string[];
    blendMode: GFXBlendMode;
    textAttributes: GFXTextAttributes;
    state: GFXCommandState;
}> | Readonly<{
    kind: "transparency-group";
    group: GFXTransparencyGroup;
    commands: readonly GFXCommand[];
}>;
export interface GFXDisplayList {
    readonly size: GFXSize;
    readonly commands: readonly GFXCommand[];
}
export type { GFXPoint, GFXRect, GFXSize };
