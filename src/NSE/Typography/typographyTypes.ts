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

export { normaliseFontDescriptor } from "../Text/fontDescriptors";
export type { NSEFontDescriptor, NSEFontStyle, NSEFontStretch } from "../Text/fontDescriptors";
import { normaliseTextShadow, type NSETextShadow } from "../Text/textAttributes";
export { normaliseTextShadow };
export type { NSETextShadow };

export interface NSEFontCommandPayload {
  readonly fontId: string;
  readonly size: number;
}

export type NSEParagraphAlignment = "start" | "centre" | "end" | "justify";

export interface NSEParagraphStyle {
  readonly alignment: NSEParagraphAlignment;
  readonly firstLineIndent: number;
  readonly headIndent: number;
  readonly tailIndent: number;
  readonly lineHeight: number | "normal";
  readonly tabStops: readonly number[];
}

const fontIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const alignments = new Set<NSEParagraphAlignment>(["start", "centre", "end", "justify"]);

function dataRecord(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain data-only object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data-only object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must not contain symbol properties.`);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!allowed.includes(key)) throw new TypeError(`${label} contains unsupported property ${key}.`);
    if (!("value" in descriptor)) throw new TypeError(`${label} must not contain accessors.`);
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}

function denseArray(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must be a dense plain array.`);
  if (value.length > maximum) throw new TypeError(`${label} exceeds its item limit.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must not contain symbol properties.`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new TypeError(`${label} must be a dense data-only array.`);
  }
  const unexpected = Object.keys(descriptors).find((key) => key !== "length" && !/^(?:0|[1-9]\d*)$/.test(key));
  if (unexpected) throw new TypeError(`${label} contains unsupported property ${unexpected}.`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) result.push(descriptors[String(index)]!.value);
  return result;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a finite number from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function normaliseFontCommandPayload(value: unknown): NSEFontCommandPayload {
  const record = dataRecord(value, "Font command", ["fontId", "size"]);
  if (typeof record.fontId !== "string" || !fontIdPattern.test(record.fontId)) throw new TypeError("Font command requires a stable font ID.");
  return Object.freeze({ fontId: record.fontId, size: finiteNumber(record.size, "Font size", 1, 512) });
}

export function normaliseParagraphStyle(value: unknown): NSEParagraphStyle {
  const record = dataRecord(value, "Paragraph style", ["alignment", "firstLineIndent", "headIndent", "tailIndent", "lineHeight", "tabStops"]);
  const alignment = record.alignment ?? "start";
  if (!alignments.has(alignment as NSEParagraphAlignment)) throw new TypeError("Unsupported paragraph alignment.");
  const firstLineIndent = finiteNumber(record.firstLineIndent ?? 0, "First-line indent", 0, 100_000);
  const headIndent = finiteNumber(record.headIndent ?? 0, "Head indent", 0, 100_000);
  const tailIndent = finiteNumber(record.tailIndent ?? 0, "Tail indent", 0, 100_000);
  const lineHeight = record.lineHeight ?? "normal";
  if (lineHeight !== "normal") finiteNumber(lineHeight, "Line height", 0.5, 100);
  const rawStops = record.tabStops === undefined ? [] : denseArray(record.tabStops, "Tab stops", 64);
  const tabStops = rawStops.map((stop) => finiteNumber(stop, "Tab stop", 0, 100_000));
  for (let index = 1; index < tabStops.length; index += 1) {
    if (tabStops[index]! <= tabStops[index - 1]!) throw new TypeError("Tab stops must be strictly ascending.");
  }
  return Object.freeze({ alignment: alignment as NSEParagraphAlignment, firstLineIndent, headIndent, tailIndent, lineHeight: lineHeight as number | "normal", tabStops: Object.freeze(tabStops) });
}

export function normaliseParagraphStyleMutation(value: unknown): NSEParagraphStyle {
  return normaliseParagraphStyle(value);
}

/**
 * The font panel's changeAttributes: a partial mutation of the selection's
 * text effects. A key left out is left alone; null clears that effect.
 * documentColour is the text view's background, not the selection's.
 */
export interface NSETextAttributesMutation {
  readonly underline?: boolean;
  readonly strike?: boolean;
  readonly foregroundColour?: string | null;
  readonly shadow?: NSETextShadow | null;
  readonly documentColour?: string | null;
}

const hexColourPattern = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

function optionalColour(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !hexColourPattern.test(value)) throw new TypeError(`${label} must be #RRGGBB or #RRGGBBAA, or null.`);
  return value.toLowerCase();
}

export function normaliseTextAttributesMutation(value: unknown): NSETextAttributesMutation {
  const record = dataRecord(value, "Text attributes", ["underline", "strike", "foregroundColour", "shadow", "documentColour"]);
  if (Object.keys(record).length === 0) throw new TypeError("Text attributes must change at least one effect.");
  const mutation: { -readonly [K in keyof NSETextAttributesMutation]: NSETextAttributesMutation[K] } = {};
  for (const key of ["underline", "strike"] as const) {
    if (!(key in record)) continue;
    if (typeof record[key] !== "boolean") throw new TypeError(`${key} must be boolean.`);
    mutation[key] = record[key] as boolean;
  }
  if ("foregroundColour" in record) mutation.foregroundColour = optionalColour(record.foregroundColour, "Text colour");
  if ("documentColour" in record) mutation.documentColour = optionalColour(record.documentColour, "Document colour");
  if ("shadow" in record) mutation.shadow = record.shadow === null ? null : normaliseTextShadow(record.shadow);
  return Object.freeze(mutation);
}

/** A CSS text-shadow for a normalised shadow. */
export function cssForTextShadow(shadow: NSETextShadow): string {
  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.colour}`;
}
