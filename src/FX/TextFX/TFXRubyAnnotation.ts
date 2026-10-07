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

import type { TFXFont, TFXFontShapeOptions } from "./TFXFont";

export type TFXRubyPosition = "before" | "after" | "interCharacter" | "inline";
export type TFXRubyAlignment = "auto" | "start" | "center" | "end" | "distributeLetter" | "distributeSpace" | "lineEdge";
export type TFXRubyOverhang = "auto" | "start" | "end" | "none";
export type TFXRubyCollisionPolicy = "allow" | "lineEdge" | "reserve";

export interface TFXRubyText {
  readonly text: string;
  readonly font?: TFXFont;
  readonly language?: string;
  readonly features?: TFXFontShapeOptions["features"];
}

export type TFXRubyTextValue = string | TFXRubyText;

export interface TFXRubyAnnotationOptions {
  readonly alignment?: TFXRubyAlignment;
  readonly overhang?: TFXRubyOverhang;
  readonly sizeFactor?: number;
  readonly collisionPolicy?: TFXRubyCollisionPolicy;
  readonly text: Readonly<Partial<Record<TFXRubyPosition, TFXRubyTextValue>>>;
}

const positions: readonly TFXRubyPosition[] = Object.freeze(["before", "after", "interCharacter", "inline"]);
const alignments: readonly TFXRubyAlignment[] = Object.freeze(["auto", "start", "center", "end", "distributeLetter", "distributeSpace", "lineEdge"]);
const overhangs: readonly TFXRubyOverhang[] = Object.freeze(["auto", "start", "end", "none"]);
const collisionPolicies: readonly TFXRubyCollisionPolicy[] = Object.freeze(["allow", "lineEdge", "reserve"]);

function boundedRubyText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\r\n\u2028\u2029]/u.test(value)) {
    throw new RangeError("Ruby text must contain 1 to 256 inline UTF-16 units.");
  }
  return value;
}

function ownRubyValue(value: TFXRubyTextValue): Readonly<TFXRubyText> {
  if (typeof value === "string") return Object.freeze({ text: boundedRubyText(value) });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Ruby text must be a string or attributed ruby value.");
  const keys = Object.keys(value);
  if (keys.some((key) => !["text", "font", "language", "features"].includes(key))) throw new TypeError("Ruby text contains unsupported attributes.");
  const text = boundedRubyText(value.text);
  if (value.font !== undefined && (typeof value.font !== "object" || typeof value.font.shape !== "function")) throw new TypeError("Ruby font must be a TFXFont.");
  if (value.language !== undefined && (typeof value.language !== "string" || value.language.length > 64 || !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u.test(value.language))) {
    throw new TypeError("Ruby language must be a bounded BCP47-style tag.");
  }
  const features = value.features === undefined ? undefined : Object.freeze({ ...value.features });
  return Object.freeze({
    text,
    ...(value.font ? { font: value.font } : {}),
    ...(value.language ? { language: value.language } : {}),
    ...(features ? { features } : {}),
  });
}

/** Immutable portable counterpart of CTRubyAnnotation. */
export class TFXRubyAnnotation {
  readonly alignment: TFXRubyAlignment;
  readonly overhang: TFXRubyOverhang;
  readonly sizeFactor: number;
  readonly collisionPolicy: TFXRubyCollisionPolicy;
  readonly #text: Readonly<Partial<Record<TFXRubyPosition, Readonly<TFXRubyText>>>>;

  constructor(options: TFXRubyAnnotationOptions) {
    if (!options || typeof options !== "object") throw new TypeError("Ruby annotation options are required.");
    const alignment = options.alignment ?? "auto";
    const overhang = options.overhang ?? "auto";
    const sizeFactor = options.sizeFactor ?? 0.5;
    const collisionPolicy = options.collisionPolicy ?? (alignment === "lineEdge" ? "lineEdge" : "allow");
    if (!alignments.includes(alignment)) throw new TypeError("Invalid ruby alignment.");
    if (!overhangs.includes(overhang)) throw new TypeError("Invalid ruby overhang.");
    if (!collisionPolicies.includes(collisionPolicy)) throw new TypeError("Invalid ruby collision policy.");
    if (!Number.isFinite(sizeFactor) || sizeFactor <= 0 || sizeFactor > 1) throw new RangeError("Ruby size factor must be within (0, 1].");
    if (!options.text || typeof options.text !== "object" || Array.isArray(options.text)) throw new TypeError("Ruby text must be a position map.");
    const unknown = Object.keys(options.text).find(key => !positions.includes(key as TFXRubyPosition));
    if (unknown) throw new TypeError(`Unsupported ruby text position ${unknown}.`);
    const text: Partial<Record<TFXRubyPosition, Readonly<TFXRubyText>>> = {};
    let count = 0;
    for (const position of positions) {
      const value = options.text[position];
      if (value === undefined) continue;
      text[position] = ownRubyValue(value);
      count += 1;
    }
    if (count === 0) throw new RangeError("Ruby annotation requires text at one position.");
    this.alignment = alignment;
    this.overhang = overhang;
    this.sizeFactor = sizeFactor;
    this.collisionPolicy = collisionPolicy;
    this.#text = Object.freeze(text);
    Object.freeze(this);
  }

  textForPosition(position: TFXRubyPosition): string | null {
    if (!positions.includes(position)) throw new TypeError("Invalid ruby position.");
    return this.#text[position]?.text ?? null;
  }

  contentForPosition(position: TFXRubyPosition): Readonly<TFXRubyText> | null {
    if (!positions.includes(position)) throw new TypeError("Invalid ruby position.");
    return this.#text[position] ?? null;
  }
}
