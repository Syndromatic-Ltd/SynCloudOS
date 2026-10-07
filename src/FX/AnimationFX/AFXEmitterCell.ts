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

import { GFXColour } from "../GraphicsFX/GFXColour";
import { GFXImage } from "../GraphicsFX/GFXImage";

const finite = (value: number, name: string, minimum?: number, maximum = 1_000_000) => {
  if (!Number.isFinite(value) || Math.abs(value) > maximum || (minimum !== undefined && value < minimum))
    throw new RangeError(`${name} is outside its finite range.`);
  return value;
};

export interface AFXEmitterCellOptions {
  readonly contents: GFXImage;
  readonly name?: string;
  readonly enabled?: boolean;
  readonly childCells?: readonly AFXEmitterCell[];
  readonly birthRate?: number;
  readonly lifetime?: number;
  readonly lifetimeRange?: number;
  readonly velocity?: number;
  readonly velocityRange?: number;
  readonly emissionLongitude?: number;
  readonly emissionRange?: number;
  readonly emissionLatitude?: number;
  readonly emissionLatitudeRange?: number;
  readonly xAcceleration?: number;
  readonly yAcceleration?: number;
  readonly zAcceleration?: number;
  readonly renderOrder?: number;
  readonly colour?: GFXColour;
  readonly redRange?: number;
  readonly greenRange?: number;
  readonly blueRange?: number;
  readonly alphaRange?: number;
  readonly redSpeed?: number;
  readonly greenSpeed?: number;
  readonly blueSpeed?: number;
  readonly alphaSpeed?: number;
  readonly scale?: number;
  readonly scaleRange?: number;
  readonly scaleSpeed?: number;
  readonly spin?: number;
  readonly spinRange?: number;
}

/** Immutable portable particle recipe backed by decoded canonical GFX pixels. */
export class AFXEmitterCell {
  readonly contents: GFXImage;
  readonly name: string;
  readonly enabled: boolean;
  readonly childCells: readonly AFXEmitterCell[];
  readonly birthRate: number;
  readonly lifetime: number;
  readonly lifetimeRange: number;
  readonly velocity: number;
  readonly velocityRange: number;
  readonly emissionLongitude: number;
  readonly emissionRange: number;
  readonly emissionLatitude: number;
  readonly emissionLatitudeRange: number;
  readonly xAcceleration: number;
  readonly yAcceleration: number;
  readonly zAcceleration: number;
  readonly renderOrder: number;
  readonly colour: GFXColour;
  readonly redRange: number;
  readonly greenRange: number;
  readonly blueRange: number;
  readonly alphaRange: number;
  readonly redSpeed: number;
  readonly greenSpeed: number;
  readonly blueSpeed: number;
  readonly alphaSpeed: number;
  readonly scale: number;
  readonly scaleRange: number;
  readonly scaleSpeed: number;
  readonly spin: number;
  readonly spinRange: number;

  constructor(options: AFXEmitterCellOptions) {
    if (!options || !(options.contents instanceof GFXImage))
      throw new TypeError("Emitter cell contents require a GFXImage.");
    if (options.name !== undefined && typeof options.name !== "string")
      throw new TypeError("Emitter cell name must be a string.");
    if (options.enabled !== undefined && typeof options.enabled !== "boolean")
      throw new TypeError("Emitter cell enabled must be boolean.");
    if (
      options.childCells !== undefined &&
      (!Array.isArray(options.childCells) ||
        options.childCells.some((cell) => !(cell instanceof AFXEmitterCell)))
    )
      throw new TypeError("Emitter child cells require AFXEmitterCell values.");
    if (options.colour !== undefined && !(options.colour instanceof GFXColour))
      throw new TypeError("Emitter cell colour requires GFXColour.");
    this.contents = options.contents;
    this.name = options.name ?? "";
    this.enabled = options.enabled ?? true;
    this.childCells = Object.freeze([...(options.childCells ?? [])]);
    this.birthRate = finite(options.birthRate ?? 0, "Birth rate", 0, 100_000);
    this.lifetime = finite(options.lifetime ?? 0, "Lifetime", 0, 3_600);
    this.lifetimeRange = finite(options.lifetimeRange ?? 0, "Lifetime range", 0, 3_600);
    this.velocity = finite(options.velocity ?? 0, "Velocity");
    this.velocityRange = finite(options.velocityRange ?? 0, "Velocity range", 0);
    this.emissionLongitude = finite(options.emissionLongitude ?? 0, "Emission longitude");
    this.emissionRange = finite(options.emissionRange ?? 0, "Emission range", 0);
    this.emissionLatitude = finite(options.emissionLatitude ?? 0, "Emission latitude");
    this.emissionLatitudeRange = finite(
      options.emissionLatitudeRange ?? 0,
      "Emission latitude range",
      0,
    );
    this.xAcceleration = finite(options.xAcceleration ?? 0, "X acceleration");
    this.yAcceleration = finite(options.yAcceleration ?? 0, "Y acceleration");
    this.zAcceleration = finite(options.zAcceleration ?? 0, "Z acceleration");
    const renderOrder = options.renderOrder ?? 0;
    if (!Number.isSafeInteger(renderOrder) || Math.abs(renderOrder) > 1_000_000)
      throw new RangeError("Emitter render order must be a bounded safe integer.");
    this.renderOrder = renderOrder;
    this.colour = options.colour ?? GFXColour.rgba(1, 1, 1, 1);
    this.redRange = finite(options.redRange ?? 0, "Red range", 0, 2);
    this.greenRange = finite(options.greenRange ?? 0, "Green range", 0, 2);
    this.blueRange = finite(options.blueRange ?? 0, "Blue range", 0, 2);
    this.alphaRange = finite(options.alphaRange ?? 0, "Alpha range", 0, 2);
    this.redSpeed = finite(options.redSpeed ?? 0, "Red speed", undefined, 100);
    this.greenSpeed = finite(options.greenSpeed ?? 0, "Green speed", undefined, 100);
    this.blueSpeed = finite(options.blueSpeed ?? 0, "Blue speed", undefined, 100);
    this.alphaSpeed = finite(options.alphaSpeed ?? 0, "Alpha speed", undefined, 100);
    this.scale = finite(options.scale ?? 1, "Scale", 0, 1_024);
    this.scaleRange = finite(options.scaleRange ?? 0, "Scale range", 0, 2_048);
    this.scaleSpeed = finite(options.scaleSpeed ?? 0, "Scale speed", undefined, 1_024);
    this.spin = finite(options.spin ?? 0, "Spin", undefined, 1_024);
    this.spinRange = finite(options.spinRange ?? 0, "Spin range", 0, 2_048);
    Object.freeze(this);
  }
}
