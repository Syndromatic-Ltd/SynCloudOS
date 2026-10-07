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

import { TFXTextTab } from "./TFXTextTab";

export interface TFXParagraphStyleOptions {
  readonly alignment?: "natural" | "left" | "right" | "center" | "justified";
  readonly firstLineHeadIndent?: number;
  readonly headIndent?: number;
  readonly tailIndent?: number;
  readonly lineSpacing?: number;
  readonly paragraphSpacing?: number;
  readonly paragraphSpacingBefore?: number;
  readonly tabStops?: readonly TFXTextTab[];
  readonly defaultTabInterval?: number;
}

export class TFXParagraphStyle {
  readonly alignment: NonNullable<TFXParagraphStyleOptions["alignment"]>;
  readonly firstLineHeadIndent: number;
  readonly headIndent: number;
  readonly tailIndent: number;
  readonly lineSpacing: number;
  readonly paragraphSpacing: number;
  readonly paragraphSpacingBefore: number;
  readonly tabStops: readonly TFXTextTab[];
  readonly defaultTabInterval: number;
  constructor(options: TFXParagraphStyleOptions = {}) {
    this.alignment = options.alignment ?? "natural";
    if (!["natural", "left", "right", "center", "justified"].includes(this.alignment)) throw new TypeError("Invalid paragraph alignment.");
    const distance = (value = 0) => {
      if (!Number.isFinite(value) || value < 0 || value > 1048576) throw new RangeError("Paragraph distances must be finite and within 0..1048576.");
      return value;
    };
    this.headIndent = distance(options.headIndent);
    this.firstLineHeadIndent = distance(options.firstLineHeadIndent ?? options.headIndent);
    this.tailIndent = distance(options.tailIndent);
    this.lineSpacing = distance(options.lineSpacing);
    this.paragraphSpacing = distance(options.paragraphSpacing);
    this.paragraphSpacingBefore = distance(options.paragraphSpacingBefore);
    const tabStops = options.tabStops ?? Array.from({ length: 12 }, (_, index) => new TFXTextTab("left", (index + 1) * 28));
    if (!Array.isArray(tabStops) || tabStops.length > 64 || tabStops.some((tab) => !(tab instanceof TFXTextTab))) throw new RangeError("Paragraph styles accept at most 64 TFXTextTab stops.");
    for (let index = 1; index < tabStops.length; index += 1) {
      if (tabStops[index]!.location <= tabStops[index - 1]!.location) throw new TypeError("Paragraph tab stops must be strictly ascending.");
    }
    this.tabStops = Object.freeze([...tabStops]);
    this.defaultTabInterval = distance(options.defaultTabInterval);
    Object.freeze(this);
  }
}
