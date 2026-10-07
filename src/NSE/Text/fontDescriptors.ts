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

import { TFXFontDescriptor, type TFXFontDescriptorOptions } from "../../FX/TextFX/TFXFontDescriptor";
import { canonicalNSETextData } from "./textValidation";
import { nseCSSPixelsToPoints, nsePointsToCSSPixels } from "./paragraphAttributes";

export type NSEFontStyle = "normal" | "italic" | "oblique";
export type NSEFontStretch = "normal" | "condensed" | "semi-condensed" | "semi-expanded" | "expanded";

export interface NSEFontDescriptor {
  readonly families: readonly string[];
  readonly size: number;
  readonly weight: number;
  readonly style: NSEFontStyle;
  readonly stretch: NSEFontStretch;
}

const familyPattern = /^[^\u0000-\u001f\u007f;{}<>\\]{1,128}$/;
const fontStyles = new Set<NSEFontStyle>(["normal", "italic", "oblique"]);
const fontStretches = new Set<NSEFontStretch>(["normal", "condensed", "semi-condensed", "semi-expanded", "expanded"]);

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

export function normaliseFontDescriptor(value: unknown): NSEFontDescriptor {
  const record = dataRecord(value, "Font descriptor", ["families", "size", "weight", "style", "stretch"]);
  const rawFamilies = denseArray(record.families, "Font families", 16);
  if (rawFamilies.length === 0) throw new TypeError("Font families must not be empty.");
  const families = rawFamilies.map((family) => {
    if (typeof family !== "string" || !familyPattern.test(family.trim())) throw new TypeError("Font family names must be bounded safe strings.");
    return family.trim();
  });
  const size = finiteNumber(record.size, "Font size", 1, 512);
  const weight = finiteNumber(record.weight, "Font weight", 1, 1000);
  const style = record.style ?? "normal";
  const stretch = record.stretch ?? "normal";
  if (!fontStyles.has(style as NSEFontStyle)) throw new TypeError("Unsupported font style.");
  if (!fontStretches.has(stretch as NSEFontStretch)) throw new TypeError("Unsupported font stretch.");
  return Object.freeze({ families: Object.freeze(families), size, weight, style: style as NSEFontStyle, stretch: stretch as NSEFontStretch });
}


export interface NSEFontPreset {
  id: string;
  label: string;
  familyId: string;
  family: string;
  weight?: number;
  style?: "normal" | "italic";
}

export interface NSEFontFamily {
  id: string;
  label: string;
  defaultPresetId: string;
  presets: readonly NSEFontPreset[];
}

export type NSEFontSizeUnit = "css-px" | "pt";
/** Requested intent, distinct from a resolved byte-backed TFXFont. */
export interface NSERequestedFontDescriptor extends TFXFontDescriptorOptions {
  readonly sizeUnit: NSEFontSizeUnit;
  readonly familyId?: string;
  readonly face?: string;
  readonly features?: Readonly<Record<string, boolean | number>>;
  readonly language?: string;
}
export interface NSEAvailableFontFace {
  readonly id: string;
  readonly family: string;
  readonly faceIndex: number;
}
export interface NSEFontResolution {
  readonly requested: NSERequestedFontDescriptor;
  readonly status: "available" | "fallback" | "unavailable";
  readonly availableFace: NSEAvailableFontFace | null;
  readonly descriptor: TFXFontDescriptor;
}

export function normaliseNSERequestedFontDescriptor(value:unknown):NSERequestedFontDescriptor {
  const data=canonicalNSETextData(value,"Requested font",{maxDepth:8,maxNodes:512,maxBytes:16_384}) as Record<string,unknown>;
  if(!data || typeof data!=="object" || Array.isArray(data) || Object.keys(data).some(key=>!["family","size","faceIndex","variations","sizeUnit","familyId","face","features","language"].includes(key))) throw new TypeError("Invalid requested font fields.");
  if(data.sizeUnit!=="css-px" && data.sizeUnit!=="pt") throw new TypeError("Requested font requires an explicit size unit.");
  if(data.family!==undefined && (typeof data.family!=="string" || !familyPattern.test(data.family))) throw new TypeError("Invalid requested font family.");
  if(data.familyId!==undefined && (typeof data.familyId!=="string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(data.familyId))) throw new TypeError("Invalid requested font family id.");
  for(const key of ["face","language"] as const) if(data[key]!==undefined && (typeof data[key]!=="string" || (data[key] as string).length>128)) throw new TypeError(`Invalid requested font ${key}.`);
  for(const key of ["variations","features"] as const) {
    const values=data[key];
    if(values!==undefined && (!values || typeof values!=="object" || Array.isArray(values) || Object.keys(values).length>64)) throw new TypeError(`Invalid font ${key}.`);
    for(const [tag,entry] of Object.entries(values ?? {})) {
      if(!/^[\x20-\x7e]{4}$/.test(tag) || (typeof entry!=="number" && !(key==="features" && typeof entry==="boolean")) || typeof entry==="number" && (!Number.isFinite(entry) || key==="features" && (!Number.isSafeInteger(entry) || entry<0 || entry>65535))) throw new TypeError(`Invalid font ${key} tag or value.`);
    }
  }
  // Reuse TFX's size/face/variation semantics; no shaping backend is acquired.
  new TFXFontDescriptor(data as unknown as TFXFontDescriptorOptions);
  return data as unknown as NSERequestedFontDescriptor;
}

export function nseFontRequestToTFXDescriptor(request:NSERequestedFontDescriptor,targetUnit:NSEFontSizeUnit="css-px",face?:NSEAvailableFontFace):TFXFontDescriptor {
  const safe=normaliseNSERequestedFontDescriptor(request);
  if(targetUnit!=="css-px" && targetUnit!=="pt") throw new TypeError("Invalid target font size unit.");
  const size=safe.sizeUnit===targetUnit ? safe.size : targetUnit==="pt" ? nseCSSPixelsToPoints(safe.size) : nsePointsToCSSPixels(safe.size);
  return new TFXFontDescriptor({size,...(face ? {family:face.family,faceIndex:face.faceIndex} : {family:safe.family,faceIndex:safe.faceIndex}),variations:safe.variations});
}
export function resolveNSEFontRequest(request:NSERequestedFontDescriptor,available:readonly NSEAvailableFontFace[],fallback?:NSEAvailableFontFace):NSEFontResolution {
  const requested=normaliseNSERequestedFontDescriptor(request);
  const faces=canonicalNSETextData(available,"Available font faces",{maxDepth:8,maxNodes:20_000,maxBytes:1024*1024});
  if(!Array.isArray(faces)) throw new TypeError("Available font faces must be an array.");
  const validate=(face:NSEAvailableFontFace)=>{
    if(!face || typeof face!=="object" || Object.keys(face).some(key=>!["id","family","faceIndex"].includes(key)) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(face.id) || typeof face.family!=="string" || !familyPattern.test(face.family) || !Number.isSafeInteger(face.faceIndex) || face.faceIndex<0) throw new TypeError("Invalid available font face.");
    return face;
  };
  faces.forEach(validate);
  const matching=faces.find(face=>(requested.familyId ? face.id===requested.familyId : requested.family!==undefined && face.family===requested.family) && face.faceIndex===(requested.faceIndex ?? 0));
  const availableFace=matching ?? (fallback ? validate(canonicalNSETextData(fallback,"Fallback font")) : null);
  return Object.freeze({requested,availableFace,status:matching ? "available" : availableFace ? "fallback" : "unavailable",descriptor:nseFontRequestToTFXDescriptor(requested,"css-px",availableFace ?? undefined)});
}
