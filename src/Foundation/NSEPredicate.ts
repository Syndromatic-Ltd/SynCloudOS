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

export type NSEPredicateScalar = string | number | boolean | null;
export type NSEPredicateLiteral =
  | NSEPredicateScalar
  | readonly NSEPredicateLiteral[];

export type NSEPredicateComparisonOperator =
  | "equals"
  | "notEquals"
  | "lessThan"
  | "lessThanOrEqual"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "contains"
  | "beginsWith"
  | "endsWith"
  | "in"
  | "between"
  | "isNull"
  | "isNotNull";

export interface NSEPredicateTextOptions {
  readonly caseInsensitive?: boolean;
  readonly diacriticInsensitive?: boolean;
}

export type NSEPredicateExpression =
  | {
      readonly kind: "comparison";
      readonly field: string;
      readonly operator: NSEPredicateComparisonOperator;
      readonly value?: NSEPredicateLiteral;
      readonly options?: NSEPredicateTextOptions;
    }
  | {
      readonly kind: "compound";
      readonly operator: "all" | "any" | "none";
      readonly children: readonly NSEPredicateExpression[];
    }
  | { readonly kind: "constant"; readonly value: boolean };

export interface NSEPredicateField<T> {
  readonly type: "string" | "number" | "boolean" | "date" | "enum";
  readonly nullable?: boolean;
  readonly read: (value: T) => unknown;
}

export interface NSEPredicateSchema<T> {
  readonly id: string;
  readonly fields: Readonly<Record<string, NSEPredicateField<T>>>;
}

export class NSEPredicateValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NSEPredicateValidationError";
  }
}

type ComparisonExpression = Extract<
  NSEPredicateExpression,
  { readonly kind: "comparison" }
>;

const FORBIDDEN_FIELD_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);
const TEXT_OPERATORS = new Set<NSEPredicateComparisonOperator>([
  "contains",
  "beginsWith",
  "endsWith",
]);
const VALUELESS_OPERATORS = new Set<NSEPredicateComparisonOperator>([
  "isNull",
  "isNotNull",
]);
const MAX_PREDICATE_DEPTH = 64;
const MAX_PREDICATE_TERMS = 1_000;
const MAX_PREDICATE_ARRAY_ITEMS = 1_000;

const operatorsByFieldType = {
  string: new Set<NSEPredicateComparisonOperator>([
    "equals",
    "notEquals",
    "lessThan",
    "lessThanOrEqual",
    "greaterThan",
    "greaterThanOrEqual",
    "contains",
    "beginsWith",
    "endsWith",
    "in",
    "between",
    "isNull",
    "isNotNull",
  ]),
  number: new Set<NSEPredicateComparisonOperator>([
    "equals",
    "notEquals",
    "lessThan",
    "lessThanOrEqual",
    "greaterThan",
    "greaterThanOrEqual",
    "in",
    "between",
    "isNull",
    "isNotNull",
  ]),
  boolean: new Set<NSEPredicateComparisonOperator>([
    "equals",
    "notEquals",
    "in",
    "isNull",
    "isNotNull",
  ]),
  date: new Set<NSEPredicateComparisonOperator>([
    "equals",
    "notEquals",
    "lessThan",
    "lessThanOrEqual",
    "greaterThan",
    "greaterThanOrEqual",
    "in",
    "between",
    "isNull",
    "isNotNull",
  ]),
  enum: new Set<NSEPredicateComparisonOperator>([
    "equals",
    "notEquals",
    "in",
    "isNull",
    "isNotNull",
  ]),
} satisfies Record<
  NSEPredicateField<unknown>["type"],
  ReadonlySet<NSEPredicateComparisonOperator>
>;

function normaliseText(
  value: unknown,
  options: NSEPredicateTextOptions = {},
): string | null {
  if (typeof value !== "string") return null;
  let text = value;
  if (options.diacriticInsensitive) {
    text = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }
  return options.caseInsensitive ? text.toLocaleLowerCase("en-GB") : text;
}

function compareOrdered(left: unknown, right: unknown): number | null {
  if (typeof left === "number" && typeof right === "number") {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return null;
}

function equalValues(
  left: unknown,
  right: unknown,
  options?: NSEPredicateTextOptions,
): boolean {
  return options && typeof left === "string" && typeof right === "string"
    ? normaliseText(left, options) === normaliseText(right, options)
    : Object.is(left, right);
}

function evaluateComparison(
  value: unknown,
  expression: ComparisonExpression,
): boolean {
  const expected = expression.value;
  const ordered = compareOrdered(value, expected);

  switch (expression.operator) {
    case "equals":
      return equalValues(value, expected, expression.options);
    case "notEquals":
      return !equalValues(value, expected, expression.options);
    case "lessThan":
      return ordered !== null && ordered < 0;
    case "lessThanOrEqual":
      return ordered !== null && ordered <= 0;
    case "greaterThan":
      return ordered !== null && ordered > 0;
    case "greaterThanOrEqual":
      return ordered !== null && ordered >= 0;
    case "contains":
    case "beginsWith":
    case "endsWith": {
      const actual = normaliseText(value, expression.options);
      const expectedText = normaliseText(expected, expression.options);
      if (actual === null || expectedText === null) return false;
      if (expression.operator === "contains") return actual.includes(expectedText);
      if (expression.operator === "beginsWith") return actual.startsWith(expectedText);
      return actual.endsWith(expectedText);
    }
    case "in":
      return (
        Array.isArray(expected) &&
        expected.some((candidate) =>
          equalValues(value, candidate, expression.options),
        )
      );
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      const lower = compareOrdered(value, expected[0]);
      const upper = compareOrdered(value, expected[1]);
      return lower !== null && upper !== null && lower >= 0 && upper <= 0;
    }
    case "isNull":
      return value == null;
    case "isNotNull":
      return value != null;
  }
}

function isPredicateScalar(value: unknown): value is NSEPredicateScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function scalarMatchesField(
  field: NSEPredicateField<unknown>,
  value: NSEPredicateScalar,
): boolean {
  if (value === null) return field.nullable === true;
  switch (field.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "number" || typeof value === "string";
    case "enum":
      return (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
  }
}

function validateScalar(
  field: NSEPredicateField<unknown>,
  value: unknown,
  fieldName: string,
): asserts value is NSEPredicateScalar {
  if (!isPredicateScalar(value)) {
    throw new NSEPredicateValidationError(
      "predicate.literal",
      `NSEPredicate field "${fieldName}" requires a finite scalar value.`,
    );
  }
  if (value === null && field.nullable !== true) {
    throw new NSEPredicateValidationError(
      "predicate.null",
      `NSEPredicate field "${fieldName}" does not allow null.`,
    );
  }
  if (!scalarMatchesField(field, value)) {
    throw new NSEPredicateValidationError(
      "predicate.literalType",
      `NSEPredicate value for "${fieldName}" does not match ${field.type}.`,
    );
  }
}

function validateOptions(expression: ComparisonExpression): void {
  if (expression.options === undefined) return;
  if (
    Object.keys(expression.options).some(
      (key) =>
        key !== "caseInsensitive" && key !== "diacriticInsensitive",
    ) ||
    (expression.options.caseInsensitive !== undefined &&
      typeof expression.options.caseInsensitive !== "boolean") ||
    (expression.options.diacriticInsensitive !== undefined &&
      typeof expression.options.diacriticInsensitive !== "boolean")
  ) {
    throw new NSEPredicateValidationError(
      "predicate.options",
      "NSEPredicate text options must contain only boolean normalisation flags.",
    );
  }
  if (
    !TEXT_OPERATORS.has(expression.operator) &&
    expression.operator !== "equals" &&
    expression.operator !== "notEquals" &&
    expression.operator !== "in"
  ) {
    throw new NSEPredicateValidationError(
      "predicate.options",
      `NSEPredicate operator ${expression.operator} does not accept text options.`,
    );
  }
}

function validatePredicateLiteral<T>(
  field: NSEPredicateField<T>,
  expression: ComparisonExpression,
): void {
  validateOptions(expression);
  const hasValue = Object.hasOwn(expression, "value");

  if (VALUELESS_OPERATORS.has(expression.operator)) {
    if (hasValue) {
      throw new NSEPredicateValidationError(
        "predicate.unexpectedValue",
        `NSEPredicate operator ${expression.operator} does not accept a value.`,
      );
    }
    return;
  }
  if (!hasValue || expression.value === undefined) {
    throw new NSEPredicateValidationError(
      "predicate.missingValue",
      `NSEPredicate operator ${expression.operator} requires a value.`,
    );
  }

  const untypedField = field as NSEPredicateField<unknown>;
  if (expression.operator === "between") {
    if (!Array.isArray(expression.value) || expression.value.length !== 2) {
      throw new NSEPredicateValidationError(
        "predicate.between",
        "Between predicates require exactly two bounds.",
      );
    }
    for (const value of expression.value) {
      validateScalar(untypedField, value, expression.field);
    }
    return;
  }
  if (expression.operator === "in") {
    if (!Array.isArray(expression.value)) {
      throw new NSEPredicateValidationError(
        "predicate.in",
        "In predicates require an array of scalar values.",
      );
    }
    for (const value of expression.value) {
      validateScalar(untypedField, value, expression.field);
    }
    return;
  }
  if (Array.isArray(expression.value)) {
    throw new NSEPredicateValidationError(
      "predicate.literal",
      `NSEPredicate operator ${expression.operator} requires a scalar value.`,
    );
  }
  validateScalar(untypedField, expression.value, expression.field);
}

interface PredicateRecord {
  readonly values: ReadonlyMap<string, unknown>;
}

function predicateFailure(code: string, message: string): never {
  throw new NSEPredicateValidationError(code, message);
}

function dataRecord(value: unknown, code: string, message: string): PredicateRecord {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return predicateFailure(code, message);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return predicateFailure(code, message);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const values = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") return predicateFailure(code, message);
      const descriptor = descriptors[key]!;
      if (!Object.hasOwn(descriptor, "value")) return predicateFailure(code, message);
      values.set(key, descriptor.value);
    }
    return { values };
  } catch (error) {
    if (error instanceof NSEPredicateValidationError) throw error;
    return predicateFailure(code, message);
  }
}

function dataArray(value: unknown, code: string, message: string): readonly unknown[] {
  try {
    if (!Array.isArray(value)) return predicateFailure(code, message);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0) {
      return predicateFailure(code, message);
    }
    if (length > MAX_PREDICATE_ARRAY_ITEMS) {
      return predicateFailure(
        "predicate.terms",
        `NSEPredicate arrays must not contain more than ${MAX_PREDICATE_ARRAY_ITEMS} items.`,
      );
    }
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        return predicateFailure(code, message);
      }
      items.push(descriptor.value);
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length") continue;
      if (
        typeof key !== "string" ||
        !/^(?:0|[1-9]\d*)$/u.test(key) ||
        Number(key) >= length
      ) {
        return predicateFailure(code, message);
      }
    }
    return items;
  } catch (error) {
    if (error instanceof NSEPredicateValidationError) throw error;
    return predicateFailure(code, message);
  }
}

function isSerialisableData(value: unknown): boolean {
  const seen = new WeakSet<object>();
  const pending: unknown[] = [value];
  let nodes = 0;
  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (isPredicateScalar(current)) continue;
      if (typeof current !== "object" || current === null) return false;
      if (seen.has(current)) return false;
      seen.add(current);
      nodes += 1;
      if (nodes > MAX_PREDICATE_TERMS) return false;
      if (Array.isArray(current)) {
        pending.push(...dataArray(current, "predicate.serialisable", ""));
      } else {
        pending.push(
          ...dataRecord(current, "predicate.serialisable", "").values.values(),
        );
      }
    }
    return true;
  } catch {
    return false;
  }
}

function requireNodeKeys(
  node: PredicateRecord,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of node.values.keys()) {
    if (!allowedKeys.has(key)) {
      if (!isSerialisableData(node.values.get(key))) {
        throw new NSEPredicateValidationError(
          "predicate.serialisable",
          "NSEPredicate expressions must be JSON-serialisable values.",
        );
      }
      throw new NSEPredicateValidationError(
        "predicate.shape",
        `NSEPredicate node contains unknown property: ${key}.`,
      );
    }
  }
}

function normaliseLiteral(value: unknown): NSEPredicateLiteral {
  if (isPredicateScalar(value)) return value;
  const values = dataArray(
    value,
    "predicate.literal",
    "NSEPredicate literals must be finite scalar values or scalar arrays.",
  );
  return values.map((item) => {
    if (!isPredicateScalar(item)) {
      throw new NSEPredicateValidationError(
        "predicate.literal",
        "NSEPredicate literals must be finite scalar values or scalar arrays.",
      );
    }
    return item;
  });
}

function normaliseOptions(
  value: unknown,
  operator: NSEPredicateComparisonOperator,
): NSEPredicateTextOptions {
  const options = dataRecord(
    value,
    "predicate.options",
    "NSEPredicate text options must contain only boolean normalisation flags.",
  );
  requireNodeKeys(options, ["caseInsensitive", "diacriticInsensitive"]);
  const caseInsensitive = options.values.get("caseInsensitive");
  const diacriticInsensitive = options.values.get("diacriticInsensitive");
  if (
    (caseInsensitive !== undefined && typeof caseInsensitive !== "boolean") ||
    (diacriticInsensitive !== undefined && typeof diacriticInsensitive !== "boolean") ||
    (!TEXT_OPERATORS.has(operator) &&
      operator !== "equals" &&
      operator !== "notEquals" &&
      operator !== "in")
  ) {
    throw new NSEPredicateValidationError(
      "predicate.options",
      !TEXT_OPERATORS.has(operator) &&
      operator !== "equals" &&
      operator !== "notEquals" &&
      operator !== "in"
        ? `NSEPredicate operator ${operator} does not accept text options.`
        : "NSEPredicate text options must contain only boolean normalisation flags.",
    );
  }
  return {
    ...(caseInsensitive === undefined ? {} : { caseInsensitive }),
    ...(diacriticInsensitive === undefined ? {} : { diacriticInsensitive }),
  };
}

function normaliseSchema<T>(schema: NSEPredicateSchema<T>): {
  readonly id: string;
  readonly fields: ReadonlyMap<string, NSEPredicateField<T>>;
} {
  const record = dataRecord(
    schema,
    "predicate.schema",
    "NSEPredicate schema must be an own-data record.",
  );
  requireNodeKeys(record, ["id", "fields"]);
  const id = record.values.get("id");
  const fieldsValue = record.values.get("fields");
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new NSEPredicateValidationError(
      "predicate.schema",
      "NSEPredicate schema id must not be empty.",
    );
  }
  const fieldsRecord = dataRecord(
    fieldsValue,
    "predicate.schema",
    "NSEPredicate schema fields must be an own-data record.",
  );
  const fields = new Map<string, NSEPredicateField<T>>();
  for (const [name, fieldValue] of fieldsRecord.values) {
    const field = dataRecord(
      fieldValue,
      "predicate.schema",
      `NSEPredicate field "${name}" must be an own-data record.`,
    );
    requireNodeKeys(field, ["type", "nullable", "read"]);
    const type = field.values.get("type");
    const nullable = field.values.get("nullable");
    const read = field.values.get("read");
    if (
      (type !== "string" &&
        type !== "number" &&
        type !== "boolean" &&
        type !== "date" &&
        type !== "enum") ||
      (nullable !== undefined && typeof nullable !== "boolean") ||
      typeof read !== "function"
    ) {
      throw new NSEPredicateValidationError(
        "predicate.schema",
        `NSEPredicate field "${name}" is invalid.`,
      );
    }
    fields.set(name, { type, nullable, read: read as (value: T) => unknown });
  }
  return { id, fields };
}

function normaliseExpression<T>(
  input: unknown,
  fields: ReadonlyMap<string, NSEPredicateField<T>>,
  depth: number,
  maxDepth: number,
  maxTerms: number,
  state: { terms: number; active: WeakSet<object> },
): NSEPredicateExpression {
  if (depth > maxDepth) {
    throw new NSEPredicateValidationError(
      "predicate.depth",
      `NSEPredicate depth exceeds ${maxDepth}.`,
    );
  }
  state.terms += 1;
  if (state.terms > maxTerms) {
    throw new NSEPredicateValidationError(
      "predicate.terms",
      `NSEPredicate terms exceed ${maxTerms}.`,
    );
  }
  const objectInput = typeof input === "object" && input !== null ? input : null;
  if (objectInput && state.active.has(objectInput)) {
    throw new NSEPredicateValidationError(
      "predicate.cycle",
      "NSEPredicate expressions must not contain cycles.",
    );
  }
  if (objectInput) state.active.add(objectInput);
  try {
    const node = dataRecord(
      input,
      "predicate.kind",
      "NSEPredicate expression must be an own-data object node.",
    );
    const kind = node.values.get("kind");
    if (kind === "constant") {
      requireNodeKeys(node, ["kind", "value"]);
      const value = node.values.get("value");
      if (typeof value !== "boolean") {
        throw new NSEPredicateValidationError(
          "predicate.constant",
          "Constant predicates require a boolean value.",
        );
      }
      return { kind, value };
    }
    if (kind === "compound") {
      requireNodeKeys(node, ["kind", "operator", "children"]);
      const operator = node.values.get("operator");
      if (operator !== "all" && operator !== "any" && operator !== "none") {
        throw new NSEPredicateValidationError(
          "predicate.compoundOperator",
          "Compound predicate operator is invalid.",
        );
      }
      const children = dataArray(
        node.values.get("children"),
        "predicate.emptyCompound",
        "Compound predicates require children.",
      );
      if (children.length === 0) {
        throw new NSEPredicateValidationError(
          "predicate.emptyCompound",
          "Compound predicates require children.",
        );
      }
      return {
        kind,
        operator,
        children: children.map((child) =>
          normaliseExpression(child, fields, depth + 1, maxDepth, maxTerms, state),
        ),
      };
    }
    if (kind !== "comparison") {
      throw new NSEPredicateValidationError(
        "predicate.kind",
        "NSEPredicate expression kind is invalid.",
      );
    }
    requireNodeKeys(node, ["kind", "field", "operator", "value", "options"]);
    const fieldName = node.values.get("field");
    const operator = node.values.get("operator");
    if (
      typeof fieldName !== "string" ||
      FORBIDDEN_FIELD_SEGMENTS.has(fieldName) ||
      fieldName.split(".").some((part) => FORBIDDEN_FIELD_SEGMENTS.has(part)) ||
      !fields.has(fieldName)
    ) {
      throw new NSEPredicateValidationError(
        "predicate.unknownField",
        "Unknown predicate field.",
      );
    }
    if (
      typeof operator !== "string" ||
      !operatorsByFieldType[fields.get(fieldName)!.type].has(
        operator as NSEPredicateComparisonOperator,
      )
    ) {
      throw new NSEPredicateValidationError(
        "predicate.operator",
        `NSEPredicate operator ${String(operator)} is invalid for ${fields.get(fieldName)!.type}.`,
      );
    }
    const comparison: ComparisonExpression = {
      kind,
      field: fieldName,
      operator: operator as NSEPredicateComparisonOperator,
      ...(node.values.has("value")
        ? { value: normaliseLiteral(node.values.get("value")) }
        : {}),
      ...(node.values.has("options")
        ? {
            options: normaliseOptions(
              node.values.get("options"),
              operator as NSEPredicateComparisonOperator,
            ),
          }
        : {}),
    };
    validatePredicateLiteral(fields.get(fieldName)!, comparison);
    return comparison;
  } finally {
    if (objectInput) state.active.delete(objectInput);
  }
}

function deepFreezePredicate(expression: NSEPredicateExpression): NSEPredicateExpression {
  if (expression.kind === "compound") {
    for (const child of expression.children) deepFreezePredicate(child);
    Object.freeze(expression.children);
  } else if (expression.kind === "comparison") {
    if (Array.isArray(expression.value)) Object.freeze(expression.value);
    if (expression.options) Object.freeze(expression.options);
  }
  return Object.freeze(expression);
}

function validateLimit(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new NSEPredicateValidationError(
      "predicate.limit",
      `NSEPredicate ${name} must be a positive safe integer.`,
    );
  }
}

export class NSEPredicate<T> {
  readonly #expression: NSEPredicateExpression | null;
  readonly #evaluate: (value: T) => boolean;

  private constructor(
    readonly schemaId: string,
    expression: NSEPredicateExpression | null,
    evaluate: (value: T) => boolean,
  ) {
    this.#expression = expression;
    this.#evaluate = evaluate;
    Object.freeze(this);
  }

  /** NSPredicate.init(block:): evaluate an object with a caller-supplied predicate. */
  static withBlock<T>(block: (value: T) => boolean): NSEPredicate<T> {
    if (typeof block !== "function") throw new TypeError("A predicate block must be a function.");
    return new NSEPredicate("block", null, block);
  }

  static compile<T>(
    schema: NSEPredicateSchema<T>,
    input: NSEPredicateExpression,
    limits: { readonly maxDepth?: number; readonly maxTerms?: number } = {},
  ): NSEPredicate<T> {
    const requestedMaxDepth = limits.maxDepth ?? 12;
    const requestedMaxTerms = limits.maxTerms ?? 100;
    validateLimit("maxDepth", requestedMaxDepth);
    validateLimit("maxTerms", requestedMaxTerms);
    const maxDepth = Math.min(requestedMaxDepth, MAX_PREDICATE_DEPTH);
    const maxTerms = Math.min(requestedMaxTerms, MAX_PREDICATE_TERMS);
    const normalisedSchema = normaliseSchema(schema);
    const expression = deepFreezePredicate(
      normaliseExpression(
        input,
        normalisedSchema.fields,
        1,
        maxDepth,
        maxTerms,
        { terms: 0, active: new WeakSet<object>() },
      ),
    );

    const visit = (
      node: NSEPredicateExpression,
      depth: number,
    ): ((value: T) => boolean) => {
      if (node.kind === "constant") {
        return () => node.value;
      }

      if (node.kind === "compound") {
        const children = node.children.map((child) =>
          visit(child, depth + 1),
        );
        if (node.operator === "all") {
          return (value) => children.every((child) => child(value));
        }
        if (node.operator === "any") {
          return (value) => children.some((child) => child(value));
        }
        return (value) => !children.some((child) => child(value));
      }

      const field = normalisedSchema.fields.get(node.field)!;
      return (value) => evaluateComparison(field.read(value), node);
    };

    return new NSEPredicate(normalisedSchema.id, expression, visit(expression, 1));
  }

  evaluate(value: T): boolean {
    return this.#evaluate(value);
  }

  toJSON(): NSEPredicateExpression {
    if (this.#expression === null) throw new TypeError("Block predicates cannot be serialized.");
    return structuredClone(this.#expression);
  }
}
