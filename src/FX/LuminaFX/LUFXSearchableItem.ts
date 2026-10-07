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

import { createLUFXActivation, type LUFXActivation } from "./LUFXActivation";

export type LUFXVisibility = "app-only" | "eligible-donation";

export interface LUFXSearchableItemDescriptor {
  readonly id: string;
  readonly domain: string;
  readonly contentType: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly alternateNames?: readonly string[];
  readonly body?: string;
  readonly keywords?: readonly string[];
  readonly createdAt?: number;
  readonly modifiedAt?: number;
  readonly rankingHint?: number;
  readonly resourceReference?: string;
  readonly activation: LUFXActivation;
  readonly visibility?: LUFXVisibility;
  readonly revision: string;
}

export interface LUFXSearchableItemJSON extends LUFXSearchableItemDescriptor {
  readonly visibility: LUFXVisibility;
}

const allowedKeys = new Set<keyof LUFXSearchableItemDescriptor>([
  "id", "domain", "contentType", "title", "subtitle", "alternateNames", "body", "keywords",
  "createdAt", "modifiedAt", "rankingHint", "resourceReference", "activation", "visibility", "revision",
]);
const requiredKeys = Object.freeze(["id", "domain", "contentType", "title", "activation", "revision"] as const);
const identifierPattern = /^[^\u0000-\u001f\u007f\s]+$/u;
const encoder = new TextEncoder();

function plainData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new TypeError("Lumina searchable item must be plain data.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Lumina searchable item must be plain data with no custom prototype.");
  if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError("Lumina searchable item cannot contain symbol fields.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const data: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) throw new TypeError("Lumina searchable item fields must be data descriptors.");
    if (!allowedKeys.has(key as keyof LUFXSearchableItemDescriptor)) throw new TypeError(`Lumina searchable item has an unknown field: ${key}.`);
    data[key] = descriptor.value;
  }
  for (const key of requiredKeys) if (!Object.hasOwn(data, key)) throw new TypeError(`Lumina searchable item is missing ${key}.`);
  return data;
}

function boundedString(value: unknown, label: string, maximumBytes: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) throw new TypeError(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string.`);
  if (encoder.encode(value).byteLength > maximumBytes) throw new RangeError(`${label} exceeds its ${maximumBytes}-byte limit.`);
  return value;
}

function identifier(value: unknown, label: string): string {
  const result = boundedString(value, label, 256);
  if (!identifierPattern.test(result)) throw new TypeError(`${label} contains invalid whitespace or control characters.`);
  return result;
}

function finiteOptional(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}

function stringArray(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array of strings.`);
  if (value.length > 64) throw new RangeError(`${label} count exceeds 64.`);
  return Object.freeze(value.map((entry, index) => boundedString(entry, `${label}[${index}]`, 512)));
}

function resourceReference(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const reference = boundedString(value, "Resource reference", 512);
  if (/[?#\\\u0000-\u001f\u007f]/u.test(reference)) throw new TypeError("Resource reference contains forbidden URL/control syntax.");
  if (reference.startsWith("document:")) {
    const id = reference.slice("document:".length);
    if (!id || !/^[A-Za-z0-9._~:@-]+$/u.test(id)) throw new TypeError("Document resource reference has an invalid identifier.");
    return reference;
  }
  if (reference.startsWith("resource:")) {
    const path = reference.slice("resource:".length);
    if (!path) throw new TypeError("Resource reference path is empty.");
    for (const segment of path.split("/")) {
      if (!segment || segment === "." || segment === "..") throw new TypeError("Resource reference contains an invalid segment.");
      let decoded: string;
      try { decoded = decodeURIComponent(segment); }
      catch { throw new TypeError("Resource reference contains malformed percent encoding."); }
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
        throw new TypeError("Resource reference contains an unsafe decoded segment.");
      }
    }
    return reference;
  }
  throw new TypeError("Resource reference must use document: or resource: identity.");
}

export class LUFXSearchableItem implements LUFXSearchableItemJSON {
  readonly id: string;
  readonly domain: string;
  readonly contentType: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly alternateNames?: readonly string[];
  readonly body?: string;
  readonly keywords?: readonly string[];
  readonly createdAt?: number;
  readonly modifiedAt?: number;
  readonly rankingHint?: number;
  readonly resourceReference?: string;
  readonly activation: LUFXActivation;
  readonly visibility: LUFXVisibility;
  readonly revision: string;

  constructor(value: LUFXSearchableItemDescriptor) {
    const data = plainData(value);
    this.id = identifier(data.id, "Lumina item ID");
    this.domain = identifier(data.domain, "Lumina domain");
    this.contentType = identifier(data.contentType, "Lumina content type");
    this.title = boundedString(data.title, "Lumina title", 1_024);
    this.subtitle = data.subtitle === undefined ? undefined : boundedString(data.subtitle, "Lumina subtitle", 2_048);
    this.alternateNames = stringArray(data.alternateNames, "Lumina alternate names");
    this.body = data.body === undefined ? undefined : boundedString(data.body, "Lumina body", 256 * 1_024, true);
    this.keywords = stringArray(data.keywords, "Lumina keywords");
    this.createdAt = finiteOptional(data.createdAt, "Lumina createdAt");
    this.modifiedAt = finiteOptional(data.modifiedAt, "Lumina modifiedAt");
    this.rankingHint = finiteOptional(data.rankingHint, "Lumina ranking hint");
    if (this.rankingHint !== undefined && (this.rankingHint < -1 || this.rankingHint > 1)) throw new RangeError("Lumina ranking hint must be in [-1, 1].");
    this.resourceReference = resourceReference(data.resourceReference);
    this.activation = createLUFXActivation(data.activation);
    if (data.visibility !== undefined && data.visibility !== "app-only" && data.visibility !== "eligible-donation") {
      throw new TypeError("Lumina visibility must be app-only or eligible-donation.");
    }
    this.visibility = (data.visibility as LUFXVisibility | undefined) ?? "app-only";
    this.revision = identifier(data.revision, "Lumina revision");
    Object.freeze(this);
  }

  static fromJSON(value: unknown): LUFXSearchableItem {
    return new LUFXSearchableItem(value as LUFXSearchableItemDescriptor);
  }

  toJSON(): LUFXSearchableItemJSON {
    return {
      id: this.id,
      domain: this.domain,
      contentType: this.contentType,
      title: this.title,
      ...(this.subtitle === undefined ? {} : { subtitle: this.subtitle }),
      ...(this.alternateNames === undefined ? {} : { alternateNames: [...this.alternateNames] }),
      ...(this.body === undefined ? {} : { body: this.body }),
      ...(this.keywords === undefined ? {} : { keywords: [...this.keywords] }),
      ...(this.createdAt === undefined ? {} : { createdAt: this.createdAt }),
      ...(this.modifiedAt === undefined ? {} : { modifiedAt: this.modifiedAt }),
      ...(this.rankingHint === undefined ? {} : { rankingHint: this.rankingHint }),
      ...(this.resourceReference === undefined ? {} : { resourceReference: this.resourceReference }),
      activation: this.activation,
      visibility: this.visibility,
      revision: this.revision,
    };
  }
}
