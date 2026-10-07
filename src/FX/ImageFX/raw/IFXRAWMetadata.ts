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

export type IFXRAWCFAColor = "red" | "green" | "blue";
export type IFXRAWCFA = "rggb" | "bggr" | "grbg" | "gbrg";
export type IFXRAWOrientation = 1 | 3 | 6 | 8;
export type IFXRAWWorkingColourSpace = "linear-srgb";
export type IFXRAWOutputSampleFormat = "float32";

export interface IFXRAWDecoderDescriptor {
  readonly name: string;
  readonly version: string;
  readonly model: string;
}

export interface IFXRAWMetadataDescriptor {
  readonly format: "dng";
  readonly cameraModel: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly bitsPerSample: 16;
  readonly cfaPattern: IFXRAWCFA;
  readonly cfaPlane: readonly IFXRAWCFAColor[];
  readonly blackLevel: number;
  readonly whiteLevel: number;
  readonly orientation: IFXRAWOrientation;
  readonly asShotNeutral: readonly [number, number, number];
  readonly whiteBalanceGains: readonly [number, number, number];
  readonly colorMatrix1: readonly number[];
  readonly calibrationIlluminant: "D65";
  readonly workingColourSpace: IFXRAWWorkingColourSpace;
  readonly outputSampleFormat: IFXRAWOutputSampleFormat;
  readonly sensorIFDOffset: number;
  readonly sensorPlaneByteCount: number;
  readonly embeddedPreviewCount: number;
  readonly hasLinearizationTable: boolean;
  readonly decoder: IFXRAWDecoderDescriptor;
}

export class IFXRAWMetadata implements IFXRAWMetadataDescriptor {
  readonly format = "dng" as const;
  readonly cameraModel: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly bitsPerSample = 16 as const;
  readonly cfaPattern: IFXRAWCFA;
  readonly cfaPlane: readonly IFXRAWCFAColor[];
  readonly blackLevel: number;
  readonly whiteLevel: number;
  readonly orientation: IFXRAWOrientation;
  readonly asShotNeutral: readonly [number, number, number];
  readonly whiteBalanceGains: readonly [number, number, number];
  readonly colorMatrix1: readonly number[];
  readonly calibrationIlluminant = "D65" as const;
  readonly workingColourSpace = "linear-srgb" as const;
  readonly outputSampleFormat = "float32" as const;
  readonly sensorIFDOffset: number;
  readonly sensorPlaneByteCount: number;
  readonly embeddedPreviewCount: number;
  readonly hasLinearizationTable: boolean;
  readonly decoder: IFXRAWDecoderDescriptor;

  constructor(descriptor: IFXRAWMetadataDescriptor) {
    this.cameraModel = descriptor.cameraModel;
    this.sourceWidth = descriptor.sourceWidth;
    this.sourceHeight = descriptor.sourceHeight;
    this.cfaPattern = descriptor.cfaPattern;
    this.cfaPlane = Object.freeze([...descriptor.cfaPlane]);
    this.blackLevel = descriptor.blackLevel;
    this.whiteLevel = descriptor.whiteLevel;
    this.orientation = descriptor.orientation;
    this.asShotNeutral = Object.freeze([...descriptor.asShotNeutral]) as readonly [number, number, number];
    this.whiteBalanceGains = Object.freeze([...descriptor.whiteBalanceGains]) as readonly [number, number, number];
    this.colorMatrix1 = Object.freeze([...descriptor.colorMatrix1]);
    this.sensorIFDOffset = descriptor.sensorIFDOffset;
    this.sensorPlaneByteCount = descriptor.sensorPlaneByteCount;
    this.embeddedPreviewCount = descriptor.embeddedPreviewCount;
    this.hasLinearizationTable = descriptor.hasLinearizationTable;
    this.decoder = Object.freeze({ ...descriptor.decoder });
    Object.freeze(this);
  }
}
