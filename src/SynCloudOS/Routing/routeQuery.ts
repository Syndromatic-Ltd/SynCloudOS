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

import type {
  SynWareRouteDefinition,
  SynWareRouteQueryCodec,
  SynWareRouteQueryIssue,
  SynWareRouteQueryRefresh,
  SynWareRouteQuerySchema,
} from "./appRouteTypes";

export type RouteQueryParseResult<TValue extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; issues: readonly SynWareRouteQueryIssue[] }>;

export class QueryValidationError extends TypeError {
  readonly issues: readonly SynWareRouteQueryIssue[];

  constructor(issues: readonly SynWareRouteQueryIssue[]) {
    super(`Route query validation failed: ${issues.map((issue) => `${issue.urlKey} ${issue.message}`).join("; ")}`);
    this.name = "QueryValidationError";
    this.issues = issues;
  }
}

type ScalarOptions<T> = Readonly<{
  defaultValue: T;
  alias?: string;
  refresh?: SynWareRouteQueryRefresh;
}>;

type StringOptions = ScalarOptions<string> & Readonly<{
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}>;

type NumericOptions<T extends number> = ScalarOptions<T> & Readonly<{
  min?: number;
  max?: number;
}>;

type ArrayOptions<T> = ScalarOptions<readonly T[]> & Readonly<{
  minItems?: number;
  maxItems: number;
}>;

type CustomOptions<T> = ScalarOptions<T> & Readonly<{
  id: string;
  multiple?: boolean;
  maxValues?: number;
  parse(values: readonly string[]): T;
  serialize(value: T): readonly string[];
  equals?(left: T, right: T): boolean;
}>;

const queryKeyPattern = /^[A-Za-z0-9._~-]+$/u;
const integerPattern = /^-?(?:0|[1-9]\d*)$/u;
const finiteNumberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

function freezeCodec<T>(codec: SynWareRouteQueryCodec<T>): SynWareRouteQueryCodec<T> {
  return Object.freeze(codec);
}

function validateAlias(alias: string | undefined): string | undefined {
  if (alias === undefined) return undefined;
  if (!queryKeyPattern.test(alias)) throw new TypeError(`Route query alias "${alias}" is invalid.`);
  return alias;
}

function validateRefresh(refresh: SynWareRouteQueryRefresh | undefined): SynWareRouteQueryRefresh {
  return refresh ?? "none";
}

function scalarValues(values: readonly string[], label: string): string {
  if (values.length !== 1) throw new TypeError(`${label} requires exactly one value.`);
  return values[0]!;
}

function stableEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => stableEqual(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftEntries = Object.entries(left as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const rightEntries = Object.entries(right as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return leftEntries.length === rightEntries.length
      && leftEntries.every(([key, value], index) => key === rightEntries[index]?.[0] && stableEqual(value, rightEntries[index]?.[1]));
  }
  return false;
}

function issue(key: string, urlKey: string, code: SynWareRouteQueryIssue["code"], message: string): SynWareRouteQueryIssue {
  return Object.freeze({ key, urlKey, code, message });
}

function invalidPercentEncoding(search: string): boolean {
  for (let index = 0; index < search.length; index += 1) {
    if (search[index] !== "%") continue;
    if (!/^[0-9A-Fa-f]{2}$/u.test(search.slice(index + 1, index + 3))) return true;
    index += 2;
  }
  return false;
}

function schemaEntries(schema: SynWareRouteQuerySchema) {
  return Object.entries(schema).map(([key, codec]) => {
    if (!queryKeyPattern.test(key)) throw new TypeError(`Route query key "${key}" is invalid.`);
    if (!isRouteQueryCodec(codec)) throw new TypeError(`Route query "${key}" must use a routeQuery codec.`);
    const urlKey = codec.alias ?? key;
    return Object.freeze({ key, urlKey, codec });
  });
}

function isRouteQueryCodec(value: unknown): value is SynWareRouteQueryCodec<unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SynWareRouteQueryCodec<unknown>>;
  return (
    (candidate.kind === "scalar" || candidate.kind === "array")
    && typeof candidate.id === "string"
    && typeof candidate.refresh === "string"
    && Number.isSafeInteger(candidate.maxValues)
    && (candidate.maxValues ?? 0) >= 1
    && typeof candidate.parse === "function"
    && typeof candidate.serialize === "function"
    && "defaultValue" in candidate
  );
}

export const routeQuery = Object.freeze({
  string(options: StringOptions): SynWareRouteQueryCodec<string> {
    const alias = validateAlias(options.alias);
    const refresh = validateRefresh(options.refresh);
    const minLength = Math.max(0, options.minLength ?? 0);
    const maxLength = Math.max(minLength, options.maxLength ?? 2048);
    if (options.defaultValue.length < minLength || options.defaultValue.length > maxLength) {
      throw new TypeError("Route query string default is outside its declared length bounds.");
    }
    if (options.pattern && !options.pattern.test(options.defaultValue)) {
      throw new TypeError("Route query string default does not satisfy its declared pattern.");
    }
    return freezeCodec({
      kind: "scalar",
      id: "string",
      ...(alias === undefined ? {} : { alias }),
      defaultValue: options.defaultValue,
      refresh,
      maxValues: 1,
      parse(values) {
        const value = scalarValues(values, "String route query");
        if (value.length < minLength || value.length > maxLength) throw new TypeError("String route query is outside its declared length bounds.");
        if (options.pattern && !options.pattern.test(value)) throw new TypeError("String route query does not satisfy its declared pattern.");
        return value;
      },
      serialize(value) {
        if (typeof value !== "string") throw new TypeError("String route query requires a string value.");
        if (value.length < minLength || value.length > maxLength) throw new TypeError("String route query is outside its declared length bounds.");
        if (options.pattern && !options.pattern.test(value)) throw new TypeError("String route query does not satisfy its declared pattern.");
        return Object.freeze([value]);
      },
    });
  },

  boolean(options: ScalarOptions<boolean>): SynWareRouteQueryCodec<boolean> {
    const alias = validateAlias(options.alias);
    return freezeCodec({
      kind: "scalar",
      id: "boolean",
      ...(alias === undefined ? {} : { alias }),
      defaultValue: options.defaultValue,
      refresh: validateRefresh(options.refresh),
      maxValues: 1,
      parse(values) {
        const value = scalarValues(values, "Boolean route query");
        if (value === "true") return true;
        if (value === "false") return false;
        throw new TypeError("Boolean route query accepts only true or false.");
      },
      serialize(value) {
        if (typeof value !== "boolean") throw new TypeError("Boolean route query requires a boolean value.");
        return Object.freeze([value ? "true" : "false"]);
      },
    });
  },

  number(options: NumericOptions<number>): SynWareRouteQueryCodec<number> {
    const alias = validateAlias(options.alias);
    if (!Number.isFinite(options.defaultValue)) throw new TypeError("Route query number default must be finite.");
    const min = options.min ?? Number.NEGATIVE_INFINITY;
    const max = options.max ?? Number.POSITIVE_INFINITY;
    const validate = (value: number) => {
      if (!Number.isFinite(value) || value < min || value > max) throw new TypeError("Route query number is outside its declared bounds.");
      return value;
    };
    validate(options.defaultValue);
    return freezeCodec({
      kind: "scalar",
      id: "number",
      ...(alias === undefined ? {} : { alias }),
      defaultValue: options.defaultValue,
      refresh: validateRefresh(options.refresh),
      maxValues: 1,
      parse(values) {
        const raw = scalarValues(values, "Number route query");
        if (!finiteNumberPattern.test(raw)) throw new TypeError("Route query number is not canonical.");
        return validate(Number(raw));
      },
      serialize(value) {
        if (typeof value !== "number") throw new TypeError("Number route query requires a number value.");
        return Object.freeze([String(validate(value))]);
      },
    });
  },

  integer(options: NumericOptions<number>): SynWareRouteQueryCodec<number> {
    const alias = validateAlias(options.alias);
    const min = options.min ?? Number.MIN_SAFE_INTEGER;
    const max = options.max ?? Number.MAX_SAFE_INTEGER;
    const validate = (value: number) => {
      if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError("Route query integer is outside its declared bounds.");
      return value;
    };
    validate(options.defaultValue);
    return freezeCodec({
      kind: "scalar",
      id: "integer",
      ...(alias === undefined ? {} : { alias }),
      defaultValue: options.defaultValue,
      refresh: validateRefresh(options.refresh),
      maxValues: 1,
      parse(values) {
        const raw = scalarValues(values, "Integer route query");
        if (!integerPattern.test(raw)) throw new TypeError("Route query integer is not canonical.");
        return validate(Number(raw));
      },
      serialize(value) {
        if (typeof value !== "number") throw new TypeError("Integer route query requires a number value.");
        return Object.freeze([String(validate(value))]);
      },
    });
  },

  enum<const TValue extends string>(
    values: readonly TValue[],
    options: ScalarOptions<TValue>,
  ): SynWareRouteQueryCodec<TValue> {
    if (values.length === 0 || new Set(values).size !== values.length) throw new TypeError("Route query enum requires unique values.");
    const allowed = new Set<string>(values);
    if (!allowed.has(options.defaultValue)) throw new TypeError("Route query enum default must be one of its values.");
    const alias = validateAlias(options.alias);
    return freezeCodec({
      kind: "scalar",
      id: `enum:${values.join("|")}`,
      ...(alias === undefined ? {} : { alias }),
      defaultValue: options.defaultValue,
      refresh: validateRefresh(options.refresh),
      maxValues: 1,
      parse(rawValues) {
        const value = scalarValues(rawValues, "Enum route query");
        if (!allowed.has(value)) throw new TypeError("Route query enum value is invalid.");
        return value as TValue;
      },
      serialize(value) {
        if (!allowed.has(value)) throw new TypeError("Route query enum value is invalid.");
        return Object.freeze([value]);
      },
    });
  },

  array<T>(itemCodec: SynWareRouteQueryCodec<T>, options: ArrayOptions<T>): SynWareRouteQueryCodec<readonly T[]> {
    if (!isRouteQueryCodec(itemCodec) || itemCodec.kind !== "scalar") throw new TypeError("Route query arrays require a scalar item codec.");
    const alias = validateAlias(options.alias);
    const minItems = Math.max(0, options.minItems ?? 0);
    const maxItems = Math.max(minItems, options.maxItems);
    if (!Number.isSafeInteger(maxItems) || maxItems < 1) throw new TypeError("Route query array maxItems must be a positive safe integer.");
    if (options.defaultValue.length < minItems || options.defaultValue.length > maxItems) throw new TypeError("Route query array default is outside its declared bounds.");
    return freezeCodec({
      kind: "array",
      id: `array:${itemCodec.id}`,
      ...(alias === undefined ? {} : { alias }),
      defaultValue: Object.freeze([...options.defaultValue]),
      refresh: validateRefresh(options.refresh),
      maxValues: maxItems,
      parse(values) {
        if (values.length < minItems || values.length > maxItems) throw new TypeError("Route query array is outside its declared bounds.");
        return Object.freeze(values.map((value) => itemCodec.parse(Object.freeze([value]))));
      },
      serialize(value) {
        if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) throw new TypeError("Route query array is outside its declared bounds.");
        return Object.freeze(value.map((entry) => {
          const encoded = itemCodec.serialize(entry);
          if (encoded.length !== 1) throw new TypeError("Route query array item codecs must serialize to one value.");
          return encoded[0]!;
        }));
      },
      equals(left, right) {
        return stableEqual(left, right);
      },
    });
  },

  custom<T>(options: CustomOptions<T>): SynWareRouteQueryCodec<T> {
    if (!options.id.trim()) throw new TypeError("Custom route query codecs require a stable id.");
    const alias = validateAlias(options.alias);
    const maxValues = options.multiple ? Math.max(1, options.maxValues ?? 32) : 1;
    return freezeCodec({
      kind: options.multiple ? "array" : "scalar",
      id: options.id.trim(),
      ...(alias === undefined ? {} : { alias }),
      defaultValue: options.defaultValue,
      refresh: validateRefresh(options.refresh),
      maxValues,
      parse(values) {
        if (values.length > maxValues || (!options.multiple && values.length !== 1)) throw new TypeError("Custom route query received an invalid value count.");
        return options.parse(values);
      },
      serialize(value) {
        const encoded = Object.freeze([...options.serialize(value)]);
        if (encoded.length > maxValues || (!options.multiple && encoded.length !== 1)) throw new TypeError("Custom route query produced an invalid value count.");
        if (encoded.some((entry) => typeof entry !== "string")) throw new TypeError("Custom route query serializers must return strings.");
        return encoded;
      },
      ...(options.equals ? { equals: options.equals } : {}),
    });
  },
});

export function assertRouteQuerySchema(schema: SynWareRouteQuerySchema | undefined, label = "Route query schema"): void {
  if (schema === undefined) return;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new TypeError(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(schema);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  const seenUrlKeys = new Set<string>();
  for (const { key, urlKey } of schemaEntries(schema)) {
    if (seenUrlKeys.has(urlKey)) throw new TypeError(`${label} query alias "${urlKey}" collision.`);
    seenUrlKeys.add(urlKey);
    if (key !== urlKey && Object.prototype.hasOwnProperty.call(schema, urlKey)) {
      throw new TypeError(`${label} query alias "${urlKey}" collision.`);
    }
  }
}

export function collectBranchQuerySchema(branch: readonly SynWareRouteDefinition[]): SynWareRouteQuerySchema {
  const result: Record<string, SynWareRouteQueryCodec<unknown>> = {};
  const urlOwners = new Map<string, string>();
  for (const definition of branch) {
    assertRouteQuerySchema(definition.query, `Route ${definition.name}`);
    for (const { key, urlKey, codec } of schemaEntries(definition.query ?? Object.freeze({}))) {
      const priorLogical = result[key];
      if (priorLogical) throw new TypeError(`Route query key "${key}" collision on branch "${definition.name}".`);
      const priorUrl = urlOwners.get(urlKey);
      if (priorUrl) throw new TypeError(`Route query alias "${urlKey}" collision between "${priorUrl}" and "${key}".`);
      result[key] = codec;
      urlOwners.set(urlKey, key);
    }
  }
  return Object.freeze(result);
}

export function parseRouteQuery<TSchema extends SynWareRouteQuerySchema>(
  schema: TSchema,
  search: string,
): RouteQueryParseResult<Readonly<{ [K in keyof TSchema]: TSchema[K] extends SynWareRouteQueryCodec<infer TValue> ? TValue : never }>> {
  assertRouteQuerySchema(schema);
  const issues: SynWareRouteQueryIssue[] = [];
  if (invalidPercentEncoding(search)) {
    issues.push(issue("", "", "invalid-encoding", "contains malformed percent encoding"));
    return Object.freeze({ ok: false as const, issues: Object.freeze(issues) });
  }
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const entries = schemaEntries(schema);
  const byUrlKey = new Map(entries.map((entry) => [entry.urlKey, entry] as const));
  const grouped = new Map<string, string[]>();
  for (const [urlKey, value] of params.entries()) {
    const target = byUrlKey.get(urlKey);
    if (!target) {
      issues.push(issue(urlKey, urlKey, "unknown-key", "is not declared for this route"));
      continue;
    }
    const values = grouped.get(urlKey) ?? [];
    values.push(value);
    grouped.set(urlKey, values);
  }

  const parsed: Record<string, unknown> = {};
  for (const { key, urlKey, codec } of entries) {
    const values = grouped.get(urlKey);
    if (!values || values.length === 0) {
      parsed[key] = codec.defaultValue;
      continue;
    }
    if (codec.kind === "scalar" && values.length > 1) {
      issues.push(issue(key, urlKey, "duplicate-scalar", "must not be repeated"));
      continue;
    }
    if (values.length > codec.maxValues) {
      issues.push(issue(key, urlKey, "too-many-values", `accepts at most ${codec.maxValues} value(s)`));
      continue;
    }
    try {
      parsed[key] = codec.parse(Object.freeze([...values]));
    } catch (error) {
      issues.push(issue(key, urlKey, "invalid-value", error instanceof Error ? error.message : String(error)));
    }
  }
  if (issues.length) return Object.freeze({ ok: false as const, issues: Object.freeze(issues) });
  return Object.freeze({ ok: true as const, value: Object.freeze(parsed) }) as RouteQueryParseResult<Readonly<{ [K in keyof TSchema]: TSchema[K] extends SynWareRouteQueryCodec<infer TValue> ? TValue : never }>>;
}

export function serializeRouteQuery(
  schema: SynWareRouteQuerySchema,
  values: Readonly<Record<string, unknown>>,
): string {
  assertRouteQuerySchema(schema);
  const known = new Set(Object.keys(schema));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) throw new QueryValidationError(Object.freeze([issue(key, key, "unknown-key", "is not declared for this route")]));
  }
  const encoded: Array<readonly [string, string]> = [];
  const issues: SynWareRouteQueryIssue[] = [];
  for (const { key, urlKey, codec } of schemaEntries(schema)) {
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : codec.defaultValue;
    const equals = codec.equals ?? stableEqual;
    if (equals(value, codec.defaultValue)) continue;
    try {
      const serialized = codec.serialize(value);
      if (serialized.length > codec.maxValues) throw new TypeError(`accepts at most ${codec.maxValues} value(s)`);
      for (const item of serialized) encoded.push(Object.freeze([urlKey, item] as const));
    } catch (error) {
      issues.push(issue(key, urlKey, "invalid-value", error instanceof Error ? error.message : String(error)));
    }
  }
  if (issues.length) throw new QueryValidationError(Object.freeze(issues));
  encoded.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyOrder = leftKey.localeCompare(rightKey);
    if (keyOrder !== 0) return keyOrder;
    // Preserve declared array order for repeated keys. Stable Array#sort keeps
    // equal-key entries in insertion order; the value comparison is therefore
    // deliberately omitted.
    void leftValue;
    void rightValue;
    return 0;
  });
  if (!encoded.length) return "";
  const params = new URLSearchParams();
  for (const [key, value] of encoded) params.append(key, value);
  return `?${params.toString()}`;
}

export function queryRefreshKeysForBranch(branch: readonly SynWareRouteDefinition[]): readonly string[] {
  const keys: string[] = [];
  for (const definition of branch) {
    for (const [key, codec] of Object.entries(definition.query ?? {})) {
      if (codec.refresh === "route") keys.push(key);
    }
  }
  return Object.freeze(keys);
}

export function routeQueryValueEquals(codec: SynWareRouteQueryCodec<unknown>, left: unknown, right: unknown): boolean {
  return (codec.equals ?? stableEqual)(left, right);
}
