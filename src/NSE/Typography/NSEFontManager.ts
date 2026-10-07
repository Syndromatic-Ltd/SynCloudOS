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

import { normaliseFontDescriptor, type NSEFontDescriptor, type NSEFontFamily, type NSEFontPreset } from "../Text/fontDescriptors";
import { sharedNSEFontLibrary, type NSEFontLibrary } from "./NSEFontLibrary";
import {
  normaliseFontCommandPayload,
  normaliseParagraphStyleMutation,
  type NSEFontCommandPayload,
  type NSEParagraphStyle,
} from "./typographyTypes";

function descriptorFamilies(preset: Pick<NSEFontPreset, "family">): readonly string[] {
  return Object.freeze(preset.family.split(",").map((family) => family.trim().replace(/^(?:"|')|(?:"|')$/g, "")));
}

function quoteFamily(family: string): string {
  return /\s/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
}

function metadataRecord(value: unknown, label: string, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain data object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError(`${label} must not contain symbol properties.`);
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!fields.includes(key) || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError(`${label} contains unsupported or non-data property ${key}.`);
    if (descriptor.value !== undefined) result[key] = descriptor.value;
  }
  return result;
}

function metadataArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 4096) throw new TypeError(`${label} must be a bounded plain array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(descriptors).some(key => key !== "length" && (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) throw new TypeError(`${label} contains unsupported properties.`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError(`${label} must contain dense data properties, not accessors.`);
    result.push(descriptor.value);
  }
  return result;
}

function metadataLabel(value: unknown): string {
  if (typeof value !== "string" || !/^[^\u0000-\u001f\u007f]{1,128}$/.test(value.trim())) throw new TypeError("Font labels must be bounded non-empty strings.");
  return value.trim();
}

function captureFamilies(value: unknown): readonly NSEFontFamily[] {
  const familyIds = new Set<string>(), presetIds = new Set<string>();
  const families = metadataArray(value, "Font families").map(rawFamily => {
    const family = metadataRecord(rawFamily, "Font family", ["id", "label", "defaultPresetId", "presets"]);
    const id = normaliseFontCommandPayload({ fontId: family.id, size: 12 }).fontId;
    if (familyIds.has(id)) throw new TypeError(`Duplicate font family ${id}.`);
    familyIds.add(id);
    const presets = metadataArray(family.presets, "Font presets").map(rawPreset => {
      const preset = metadataRecord(rawPreset, "Font preset", ["id", "label", "familyId", "family", "weight", "style"]);
      const presetId = normaliseFontCommandPayload({ fontId: preset.id, size: 12 }).fontId;
      if (presetIds.has(presetId)) throw new TypeError(`Duplicate font preset ${presetId}.`);
      presetIds.add(presetId);
      if (presetIds.size > 4096) throw new TypeError("Font metadata exceeds its face limit.");
      if (preset.familyId !== id) throw new TypeError("Font preset must belong to its containing family.");
      if (typeof preset.family !== "string") throw new TypeError("Font preset requires a CSS family stack.");
      if (preset.style !== undefined && preset.style !== "normal" && preset.style !== "italic") throw new TypeError("Unsupported font preset style.");
      const descriptor = normaliseFontDescriptor({ families: descriptorFamilies({ family: preset.family }), size: 12, weight: preset.weight === undefined ? 400 : preset.weight, style: preset.style ?? "normal", stretch: "normal" });
      return Object.freeze({ id: presetId, label: metadataLabel(preset.label), familyId: id, family: preset.family,
        ...(preset.weight === undefined ? {} : { weight: descriptor.weight }), ...(preset.style === undefined ? {} : { style: preset.style }),
      });
    });
    if (!presets.some(preset => preset.id === family.defaultPresetId)) throw new TypeError("Font family default preset must be one of its faces.");
    return Object.freeze({ id, label: metadataLabel(family.label), defaultPresetId: family.defaultPresetId as string, presets: Object.freeze(presets) });
  });
  return Object.freeze(families);
}

export interface NSEFontManagerOptions {
  /** Metadata for fonts supplied or registered by the host. No font files
   * are loaded by the manager. Empty by default. */
  readonly families?: readonly NSEFontFamily[];
  /** Imported fonts and collections; the shared library by default, or
   * null to offer only the supplied families. */
  readonly library?: NSEFontLibrary | null;
}

export class NSEFontManager {
  /** Captured host-supplied metadata. Imported faces are in allFamilies(). */
  readonly availableFamilies: readonly NSEFontFamily[];
  readonly #presets: ReadonlyMap<string, NSEFontPreset>;
  readonly #libraryOption: NSEFontLibrary | null | undefined;

  constructor(options: NSEFontManagerOptions = {}) {
    const supplied = metadataRecord(options, "Font manager options", ["families", "library"]);
    this.availableFamilies = captureFamilies(supplied.families === undefined ? [] : supplied.families);
    this.#presets = new Map(this.availableFamilies.flatMap((family) => family.presets).map((preset) => [preset.id, preset]));
    this.#libraryOption = supplied.library as NSEFontLibrary | null | undefined;
  }

  /** Resolved on first use, so constructing a manager touches no browser
   * font, storage or database API. */
  get library(): NSEFontLibrary | null {
    return this.#libraryOption === undefined ? sharedNSEFontLibrary() : this.#libraryOption;
  }

  /** Supplied families followed by successfully registered imported faces. */
  allFamilies(): readonly NSEFontFamily[] {
    const user = this.library?.getSnapshot().userFamilies ?? [];
    const familyIds = new Set(this.availableFamilies.map(family => family.id)), presetIds = new Set(this.#presets.keys());
    for (const family of user) {
      if (familyIds.has(family.id)) throw new TypeError(`Duplicate font family ${family.id}.`);
      familyIds.add(family.id);
      for (const preset of family.presets) {
        if (presetIds.has(preset.id)) throw new TypeError(`Duplicate font preset ${preset.id}.`);
        presetIds.add(preset.id);
      }
    }
    return user.length === 0 ? this.availableFamilies : Object.freeze([...this.availableFamilies, ...user]);
  }

  isUserFont(id: string): boolean {
    return this.getPreset(id) !== null && !this.#presets.has(id);
  }

  getPreset(id: string): NSEFontPreset | null {
    const families = this.allFamilies();
    return this.#presets.get(id) ?? families.flatMap(family => family.presets).find(preset => preset.id === id) ?? null;
  }

  getFamily(id: string): NSEFontFamily | null {
    return this.allFamilies().find((family) => family.id === id) ?? null;
  }

  descriptorForPreset(id: string, size = 12): NSEFontDescriptor {
    const preset = this.getPreset(id);
    if (!preset) throw new TypeError(`Unknown font ${id}.`);
    return normaliseFontDescriptor({
      families: descriptorFamilies(preset),
      size,
      weight: preset.weight ?? 400,
      style: preset.style ?? "normal",
      stretch: "normal",
    });
  }

  fontCommand(id: string, size: number): NSEFontCommandPayload {
    if (!this.getPreset(id)) throw new TypeError(`Unknown font ${id}.`);
    return normaliseFontCommandPayload({ fontId: id, size });
  }

  paragraphCommand(value: unknown): NSEParagraphStyle {
    return normaliseParagraphStyleMutation(value);
  }

  cssForDescriptor(value: unknown): Readonly<{ fontFamily: string; fontSize: string; fontWeight: number; fontStyle: string; fontStretch: string }> {
    const descriptor = normaliseFontDescriptor(value);
    return Object.freeze({
      fontFamily: descriptor.families.map(quoteFamily).join(", "),
      fontSize: `${descriptor.size}px`,
      fontWeight: descriptor.weight,
      fontStyle: descriptor.style,
      fontStretch: descriptor.stretch,
    });
  }
}
