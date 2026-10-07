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

import type { GFXPoint, GFXRect } from "../../GraphicsFX/GFXGeometry";

export type IFXFeatureKind = "rectangle" | "qr" | "text-region" | "face";

export interface IFXFeatureBase {
  readonly kind: IFXFeatureKind;
  readonly bounds: GFXRect;
  readonly corners: readonly GFXPoint[];
  readonly confidence: number;
  readonly backend: string;
  readonly backendVersion: number;
}

export interface IFXRectangleFeature extends IFXFeatureBase {
  readonly kind: "rectangle";
}

export interface IFXQRCodeFeature extends IFXFeatureBase {
  readonly kind: "qr";
  readonly payload: string;
  readonly rawBytes: Uint8Array;
}

export interface IFXTextRegionFeature extends IFXFeatureBase {
  readonly kind: "text-region";
}

export interface IFXFaceFeature extends IFXFeatureBase {
  readonly kind: "face";
  readonly landmarks?: Readonly<Record<string, GFXPoint>>;
}

export type IFXFeature = IFXRectangleFeature | IFXQRCodeFeature | IFXTextRegionFeature | IFXFaceFeature;
