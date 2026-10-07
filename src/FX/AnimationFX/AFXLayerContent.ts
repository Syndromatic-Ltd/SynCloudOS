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

import type { TFXGlyphOutline } from "../TextFX/TFXGlyphDrawing";
import type { GFXPath } from "../GraphicsFX/GFXPath";
import type { GFXColour } from "../GraphicsFX/GFXColour";
import type { GFXGradient } from "../GraphicsFX/GFXGradient";
import type { GFXImage } from "../GraphicsFX/GFXImage";
import type { GFXPoint, GFXRect } from "../GraphicsFX/GFXGeometry";
import type { VFXFrame } from "../VideoFX/VFXFrame";
import type { IFXShader } from '../ImageFX/IFXShader';
export interface AFXShaderContent {
  readonly kind: 'shader';
  readonly shader: IFXShader;
}
export interface AFXShapeContent {
  readonly kind: "shape";
  readonly path: GFXPath | null;
  readonly fillColour: GFXColour | null;
  readonly strokeColour: GFXColour | null;
  readonly fillRule: "nonzero" | "evenodd";
  readonly lineWidth: number;
  readonly lineCap: "butt" | "round" | "square";
  readonly lineJoin: "miter" | "round" | "bevel";
  readonly miterLimit: number;
  readonly lineDashPattern: readonly number[];
  readonly lineDashPhase: number;
  readonly strokeStart: number;
  readonly strokeEnd: number;
}
export interface AFXGradientContent {
  readonly kind: "gradient";
  readonly gradient: GFXGradient | null;
}
export interface AFXImageContent {
  readonly kind: "image";
  readonly image: GFXImage;
}
export interface AFXVideoLayerContent {
  readonly kind: "video";
  readonly video: VFXFrame;
}
export interface AFXTextContent {
  readonly kind: "text";
  readonly glyphs: readonly TFXGlyphOutline[];
  readonly foregroundColour: GFXColour;
}
export interface AFXEmitterParticle {
  readonly id: number;
  readonly contents: GFXImage;
  readonly position: GFXPoint;
  readonly zPosition: number;
  readonly renderOrder: number;
  readonly colour: GFXColour;
  readonly scale: number;
  readonly rotation: number;
}
export interface AFXEmitterContent {
  readonly kind: "emitter";
  readonly particles: readonly AFXEmitterParticle[];
}
export interface AFXTileContent {
  readonly key: string;
  readonly rect: GFXRect;
  readonly image: GFXImage;
  readonly scale: number;
  readonly level: number;
  readonly fadeDuration: number;
}
export interface AFXTiledContent {
  readonly kind: "tiled";
  readonly tiles: readonly AFXTileContent[];
}
export type AFXLayerContent =
  | AFXShaderContent
  | AFXShapeContent
  | AFXGradientContent
  | AFXImageContent
  | AFXVideoLayerContent
  | AFXTextContent
  | AFXEmitterContent
  | AFXTiledContent;
