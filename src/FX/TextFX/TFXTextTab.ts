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

export type TFXTextTabAlignment = "left" | "right" | "center" | "natural";

export interface TFXTextTabOptions {
  readonly columnTerminators?: string;
}

export class TFXTextTab {
  readonly textAlignment: TFXTextTabAlignment;
  readonly location: number;
  readonly options: Readonly<Required<TFXTextTabOptions>>;

  constructor(textAlignment: TFXTextTabAlignment, location: number, options: TFXTextTabOptions = {}) {
    if (!["left", "right", "center", "natural"].includes(textAlignment)) throw new TypeError("Invalid text-tab alignment.");
    if (!Number.isFinite(location) || location <= 0 || location > 1048576) throw new RangeError("Text-tab locations must be finite and within 0..1048576.");
    const columnTerminators = options.columnTerminators ?? "";
    if (typeof columnTerminators !== "string" || columnTerminators.length > 64) throw new RangeError("Text-tab column terminators must contain at most 64 UTF-16 units.");
    this.textAlignment = textAlignment;
    this.location = location;
    this.options = Object.freeze({ columnTerminators });
    Object.freeze(this);
  }
}
