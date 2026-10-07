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

import { TFXFont } from "./TFXFont";
import type { TFXFontDescriptor } from "./TFXFontDescriptor";

/** Immutable, ordered cascade of explicitly supplied fonts; no ambient system-font lookup. */
export class TFXFontCollection {
  readonly fonts: readonly TFXFont[];
  constructor(fonts: readonly TFXFont[]) {
    if (fonts.length > 64 || fonts.some(font => !(font instanceof TFXFont))) throw new RangeError("A font collection accepts at most 64 font objects.");
    this.fonts = Object.freeze([...new Set(fonts)]);
    Object.freeze(this);
  }
  matchingFontDescriptors(query: Readonly<{ family?: string; size?: number }> = {}): readonly TFXFontDescriptor[] {
    if (query.size !== undefined && (!Number.isFinite(query.size) || query.size <= 0)) throw new RangeError("Invalid font size query.");
    return Object.freeze(this.fonts.filter(font =>
      (query.family === undefined || font.familyName.toLocaleLowerCase("en") === query.family.toLocaleLowerCase("en")) &&
      (query.size === undefined || font.descriptor.size === query.size),
    ).map(font => font.descriptor));
  }
  fontForText(text: string, preferred?: TFXFont): TFXFont | null {
    if (typeof text !== "string" || text.length > 65536) throw new RangeError("Font fallback input exceeds its work limit.");
    const candidates = preferred ? [preferred, ...this.fonts.filter(font => font !== preferred)] : this.fonts;
    return candidates.find(font => font.supportsText(text)) ?? null;
  }
}
