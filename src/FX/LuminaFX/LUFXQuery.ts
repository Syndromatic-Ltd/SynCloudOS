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

export interface LUFXQueryDescriptor {
  readonly text: string;
  readonly domains?: readonly string[];
  readonly contentTypes?: readonly string[];
  readonly limit?: number;
  readonly asOf?: number;
  readonly locale?: string;
  readonly prefix?: boolean;
  readonly fuzzy?: boolean;
  readonly filter?: LUFXQueryFilter;
  readonly maximumBytes?: number;
}

export type LUFXQueryFilter =
  | Readonly<{ kind: "and" | "or"; filters: readonly LUFXQueryFilter[] }>
  | Readonly<{ kind: "domain" | "content-type"; values: readonly string[] }>
  | Readonly<{ kind: "created-at" | "modified-at"; minimum?: number; maximum?: number }>;

import { canonicalLUFXLocale } from "./LUFXTokenizer";

const encoder = new TextEncoder();

function values(value: readonly string[] | undefined, label: string): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 32) throw new RangeError(`${label} count must be at most 32.`);
  const result = value.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0 || encoder.encode(entry).byteLength > 256) {
      throw new TypeError(`${label} entries must be non-empty strings of at most 256 bytes.`);
    }
    return entry;
  });
  if (new Set(result).size !== result.length) throw new TypeError(`${label} cannot contain duplicate values.`);
  return Object.freeze(result);
}

function finiteBound(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}

function dataRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be plain data.`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} cannot contain symbol fields.`);
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor)) throw new TypeError(`${label} fields must be data descriptors.`);
    output[key] = descriptor.value;
  }
  return output;
}

function filterTree(value: unknown, depth = 0, budget = { nodes: 0 }): LUFXQueryFilter | undefined {
  if (value === undefined) return undefined;
  if (depth > 6 || ++budget.nodes > 64) throw new RangeError("Lumina query filter exceeds its complexity limit.");
  const data = dataRecord(value, "Lumina query filter");
  if (typeof data.kind !== "string") throw new TypeError("Lumina query filter requires a kind.");
  if (data.kind === "and" || data.kind === "or") {
    if (!Array.isArray(data.filters) || data.filters.length === 0 || data.filters.length > 32) throw new RangeError("Lumina compound query filter requires 1 through 32 children.");
    for (const key of Object.keys(data)) if (key !== "kind" && key !== "filters") throw new TypeError(`Lumina query filter has an unknown field: ${key}.`);
    return Object.freeze({ kind: data.kind, filters: Object.freeze(data.filters.map((entry) => filterTree(entry, depth + 1, budget)!)) });
  }
  if (data.kind === "domain" || data.kind === "content-type") {
    for (const key of Object.keys(data)) if (key !== "kind" && key !== "values") throw new TypeError(`Lumina query filter has an unknown field: ${key}.`);
    return Object.freeze({ kind: data.kind, values: values(data.values as readonly string[] | undefined, `Lumina ${data.kind} filter`) });
  }
  if (data.kind === "created-at" || data.kind === "modified-at") {
    for (const key of Object.keys(data)) if (key !== "kind" && key !== "minimum" && key !== "maximum") throw new TypeError(`Lumina query filter has an unknown field: ${key}.`);
    const minimum = finiteBound(data.minimum, `Lumina ${data.kind} minimum`);
    const maximum = finiteBound(data.maximum, `Lumina ${data.kind} maximum`);
    if (minimum === undefined && maximum === undefined) throw new TypeError(`Lumina ${data.kind} filter requires a minimum or maximum.`);
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) throw new RangeError(`Lumina ${data.kind} filter minimum cannot exceed maximum.`);
    return Object.freeze({ kind: data.kind, ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }) });
  }
  throw new TypeError(`Lumina query filter has an unsupported kind: ${data.kind}.`);
}

export class LUFXQuery {
  readonly text: string;
  readonly domains: readonly string[];
  readonly contentTypes: readonly string[];
  readonly limit: number;
  readonly asOf?: number;
  readonly locale: string;
  readonly prefix: boolean;
  readonly fuzzy: boolean;
  readonly filter?: LUFXQueryFilter;
  readonly maximumBytes: number;

  constructor(value: LUFXQueryDescriptor) {
    if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new TypeError("Lumina query must be plain data.");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor)) throw new TypeError("Lumina query fields must be data descriptors.");
      if (!["text", "domains", "contentTypes", "limit", "asOf", "locale", "prefix", "fuzzy", "filter", "maximumBytes"].includes(key)) throw new TypeError(`Lumina query has an unknown field: ${key}.`);
    }
    if (typeof descriptors.text?.value !== "string") throw new TypeError("Lumina query text must be a string.");
    if (encoder.encode(descriptors.text.value).byteLength > 4_096) throw new RangeError("Lumina query text exceeds its 4096-byte limit.");
    const limit = descriptors.limit?.value ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Lumina query limit must be an integer from 1 through 100.");
    const asOf = descriptors.asOf?.value;
    if (asOf !== undefined && (typeof asOf !== "number" || !Number.isFinite(asOf))) throw new RangeError("Lumina query asOf must be finite.");
    const prefix = descriptors.prefix?.value ?? false;
    const fuzzy = descriptors.fuzzy?.value ?? false;
    if (typeof prefix !== "boolean" || typeof fuzzy !== "boolean") throw new TypeError("Lumina query prefix and fuzzy flags must be booleans.");
    const maximumBytes = descriptors.maximumBytes?.value ?? 1_048_576;
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 512 * 1_024 || maximumBytes > 8 * 1_024 * 1_024) {
      throw new RangeError("Lumina query maximumBytes must be an integer from 524288 through 8388608.");
    }
    this.text = descriptors.text.value;
    this.domains = values(descriptors.domains?.value as readonly string[] | undefined, "Lumina query domains");
    this.contentTypes = values(descriptors.contentTypes?.value as readonly string[] | undefined, "Lumina query content types");
    this.limit = limit;
    this.asOf = asOf;
    this.locale = canonicalLUFXLocale(descriptors.locale?.value as string | undefined);
    this.prefix = prefix;
    this.fuzzy = fuzzy;
    this.filter = filterTree(descriptors.filter?.value);
    this.maximumBytes = maximumBytes;
    Object.freeze(this);
  }

  toJSON(): LUFXQueryDescriptor {
    return {
      text: this.text,
      ...(this.domains.length === 0 ? {} : { domains: [...this.domains] }),
      ...(this.contentTypes.length === 0 ? {} : { contentTypes: [...this.contentTypes] }),
      limit: this.limit,
      ...(this.asOf === undefined ? {} : { asOf: this.asOf }),
      locale: this.locale,
      prefix: this.prefix,
      fuzzy: this.fuzzy,
      maximumBytes: this.maximumBytes,
      ...(this.filter === undefined ? {} : { filter: this.filter }),
    };
  }
}
