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

export interface TFXFontDescriptorOptions {
  readonly size: number;
  readonly family?: string;
  readonly faceIndex?: number;
  readonly variations?: Readonly<Record<string, number>>;
}

export class TFXFontDescriptor {
  readonly size: number;
  readonly family: string | null;
  readonly faceIndex: number;
  readonly variations: Readonly<Record<string, number>>;

  constructor(options: TFXFontDescriptorOptions) {
    if (!Number.isFinite(options.size) || options.size <= 0 || options.size > 16384) throw new RangeError("Font size must be finite and within (0, 16384].");
    const index = options.faceIndex ?? 0;
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("Font face index must be a non-negative integer.");
    this.size = options.size;
    this.family = options.family ?? null;
    this.faceIndex = index;
    const variations: Record<string, number> = Object.create(null);
    for (const [tag, value] of Object.entries(options.variations ?? {})) {
      if (!/^[\x20-\x7e]{4}$/.test(tag) || !Number.isFinite(value)) throw new TypeError("Font variation must have a four-character tag and finite value.");
      variations[tag] = value;
    }
    this.variations = Object.freeze(variations);
    Object.freeze(this);
  }
}
