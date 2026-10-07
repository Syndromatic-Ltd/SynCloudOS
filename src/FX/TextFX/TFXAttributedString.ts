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

import { TFXParagraphStyle } from "./TFXParagraphStyle";
import { TFXFontCollection } from "./TFXFontCollection";
import { TFXFont } from "./TFXFont";
import { TFXRunDelegate } from "./TFXRunDelegate";
import { TFXRubyAnnotation } from "./TFXRubyAnnotation";
import type { TFXLineBreakPolicy, TFXTextCombine, TFXVerticalOrientation } from "./TFXVerticalOrientation";

export interface TFXTextAttributes {
  readonly start: number;
  readonly end: number;
  readonly font: TFXFont;
  readonly language?: string;
  readonly paragraphStyle?: TFXParagraphStyle;
  readonly fallbackFonts?: TFXFontCollection;
  readonly features?: Readonly<Record<string, number>>;
  /** Selects font-provided vertical forms when a vertical frame shapes this run. */
  readonly verticalForms?: boolean;
  /** Explicit portable vertical-orientation policy. Legacy verticalForms remains supported. */
  readonly verticalOrientation?: TFXVerticalOrientation;
  /** Optional tate-chu-yoko policy for vertical layout. */
  readonly textCombine?: TFXTextCombine;
  /** Locale-sensitive line-break policy. "auto" preserves the existing Unicode breaker. */
  readonly lineBreakPolicy?: TFXLineBreakPolicy;
  /** Replaces one U+FFFC object marker with immutable attachment metrics and content. */
  readonly runDelegate?: TFXRunDelegate;
  /** Shapes immutable ruby text with the run's existing font and ownership. */
  readonly rubyAnnotation?: TFXRubyAnnotation;
}

export function isTFXStringBoundary(text: string, index: number): boolean {
  return Number.isSafeInteger(index) && index >= 0 && index <= text.length &&
    !(index > 0 && index < text.length && /[\uD800-\uDBFF]/.test(text[index - 1]) && /[\uDC00-\uDFFF]/.test(text[index]));
}

export class TFXAttributedString {
  readonly text: string;
  readonly runs: readonly TFXTextAttributes[];
  constructor(text: string, runs: readonly TFXTextAttributes[]) {
    if (typeof text !== "string" || text.length > 65536) throw new RangeError("Attributed text exceeds the 65536-unit limit.");
    let end = 0;
    let attachmentCount = 0, attachmentBytes = 0, rubyCount = 0, rubyTextUnits = 0;
    const attachmentImages = new Set<object>();
    const owned = runs.map(run => {
      if (run.start !== end || run.end <= run.start || !isTFXStringBoundary(text, run.start) || !isTFXStringBoundary(text, run.end) || !(run.font instanceof TFXFont)) throw new RangeError("Attributed ranges must cover text contiguously at Unicode boundaries.");
      if (run.fallbackFonts !== undefined && !(run.fallbackFonts instanceof TFXFontCollection)) throw new TypeError("Invalid font cascade.");
      if (run.paragraphStyle !== undefined && !(run.paragraphStyle instanceof TFXParagraphStyle)) throw new TypeError("Invalid paragraph style.");
      if (run.verticalForms !== undefined && typeof run.verticalForms !== "boolean") throw new TypeError("Vertical forms must be boolean.");
      if (run.language !== undefined) {
        if (typeof run.language !== "string" || run.language.length > 64 || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(run.language)) {
          throw new TypeError("Text language must be a bounded BCP47-style language tag.");
        }
      }
      if (run.verticalOrientation !== undefined && !["auto", "upright", "sideways"].includes(run.verticalOrientation)) throw new TypeError("Invalid vertical orientation.");
      if (run.textCombine !== undefined && !["none", "all", "digits2"].includes(run.textCombine)) throw new TypeError("Invalid vertical text-combine policy.");
      if (run.lineBreakPolicy !== undefined && !["auto", "strict", "normal", "loose"].includes(run.lineBreakPolicy)) throw new TypeError("Invalid line-break policy.");
      if (run.verticalForms !== undefined && run.verticalOrientation !== undefined) throw new TypeError("Use either legacy verticalForms or verticalOrientation, not both.");
      if (run.runDelegate !== undefined) {
        if (!(run.runDelegate instanceof TFXRunDelegate)) throw new TypeError("Invalid TFX run delegate.");
        if (run.end !== run.start + 1 || text.slice(run.start, run.end) !== "\uFFFC") throw new RangeError("A run delegate must cover a single U+FFFC object-replacement character.");
        if (run.fallbackFonts !== undefined) throw new TypeError("An attachment run does not accept fallback fonts.");
        if (run.features !== undefined) throw new TypeError("An attachment run does not accept font features.");
        if (run.verticalForms !== undefined) throw new TypeError("An attachment run does not accept vertical forms; its metrics follow the line orientation.");
        if (run.verticalOrientation !== undefined || run.textCombine !== undefined) throw new TypeError("An attachment run follows line orientation and does not accept vertical orientation/text combine.");
        attachmentCount += 1;
        if (attachmentCount > 1024) throw new RangeError("An attributed string accepts at most 1024 attachments.");
        const image = run.runDelegate.attachment.image;
        if (!attachmentImages.has(image)) {
          attachmentImages.add(image);
          attachmentBytes += image.bytesPerRow * image.height;
          if (attachmentBytes > 32 * 1024 * 1024) throw new RangeError("Attributed attachment pixels exceed the 32 MiB aggregate limit.");
        }
      }
      if (run.rubyAnnotation !== undefined) {
        if (!(run.rubyAnnotation instanceof TFXRubyAnnotation)) throw new TypeError("Invalid TFX ruby annotation.");
        if (run.runDelegate !== undefined) throw new TypeError("Ruby annotation cannot decorate an attachment run.");
        if (run.fallbackFonts !== undefined) throw new TypeError("Ruby base text requires one explicit font in this portable implementation.");
        if (run.end - run.start > 256 || /[\s\uFFFC]/u.test(text.slice(run.start, run.end))) throw new RangeError("Ruby base text must be a bounded non-whitespace inline range.");
        if (run.textCombine !== undefined && run.textCombine !== "none") throw new TypeError("Ruby base text cannot also be text-combined.");
        for (const position of ["before", "after", "interCharacter", "inline"] as const) rubyTextUnits += run.rubyAnnotation.textForPosition(position)?.length ?? 0;
        rubyCount += 1;
        if (rubyCount > 1024 || rubyTextUnits > 65536) throw new RangeError("Attributed ruby content exceeds its bounded work limit.");
      }
      end = run.end;
      return Object.freeze({ start: run.start, end: run.end, font: run.font, ...(run.paragraphStyle ? { paragraphStyle: run.paragraphStyle } : {}), ...(run.fallbackFonts ? { fallbackFonts: run.fallbackFonts } : {}), ...(run.features ? { features: Object.freeze({ ...run.features }) } : {}), ...(run.language ? { language: run.language } : {}), ...(run.verticalForms !== undefined ? { verticalForms: run.verticalForms } : {}), ...(run.verticalOrientation !== undefined ? { verticalOrientation: run.verticalOrientation } : {}), ...(run.textCombine !== undefined ? { textCombine: run.textCombine } : {}), ...(run.lineBreakPolicy !== undefined ? { lineBreakPolicy: run.lineBreakPolicy } : {}), ...(run.runDelegate ? { runDelegate: run.runDelegate } : {}), ...(run.rubyAnnotation ? { rubyAnnotation: run.rubyAnnotation } : {}) });
    });
    if (end !== text.length) throw new RangeError("Attributed ranges must cover all input text.");
    this.text = text;
    this.runs = Object.freeze(owned);
    Object.freeze(this);
  }
}
