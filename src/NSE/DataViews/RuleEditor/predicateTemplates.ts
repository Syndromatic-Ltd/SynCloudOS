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

import type { Formatter, PredicateComparisonOperator, PredicateExpression, PredicateField, PredicateLiteral, PredicateSchema } from "../../../SynCloudOS/Models";
import type { NSEPredicateOperatorOption, NSEPredicateTemplate, NSERuleEditorValue, NSERuleRow } from "./ruleEditorTypes";

export const PREDICATE_OPERATOR_OPTIONS: readonly NSEPredicateOperatorOption[] = Object.freeze([
  { operator: "equals", label: "equals", arity: 1 },
  { operator: "notEquals", label: "does not equal", arity: 1 },
  { operator: "lessThan", label: "is less than", arity: 1 },
  { operator: "lessThanOrEqual", label: "is at most", arity: 1 },
  { operator: "greaterThan", label: "is greater than", arity: 1 },
  { operator: "greaterThanOrEqual", label: "is at least", arity: 1 },
  { operator: "contains", label: "contains", arity: 1 },
  { operator: "beginsWith", label: "begins with", arity: 1 },
  { operator: "endsWith", label: "ends with", arity: 1 },
  { operator: "in", label: "is in", arity: 1 },
  { operator: "between", label: "is between", arity: 2 },
  { operator: "isNull", label: "is null", arity: 0 },
  { operator: "isNotNull", label: "is not null", arity: 0 },
]);

const OPERATOR_SET = new Set(PREDICATE_OPERATOR_OPTIONS.map(({ operator }) => operator));
const TYPE_OPERATORS: Record<PredicateField<unknown>["type"], readonly PredicateComparisonOperator[]> = {
  string: ["equals", "notEquals", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual", "contains", "beginsWith", "endsWith", "in", "between", "isNull", "isNotNull"],
  number: ["equals", "notEquals", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual", "in", "between", "isNull", "isNotNull"],
  boolean: ["equals", "notEquals", "in", "isNull", "isNotNull"],
  date: ["equals", "notEquals", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual", "in", "between", "isNull", "isNotNull"],
  enum: ["equals", "notEquals", "in", "isNull", "isNotNull"],
};

export function normalisePredicateOperator(value: unknown): PredicateComparisonOperator {
  if (typeof value !== "string" || !OPERATOR_SET.has(value as PredicateComparisonOperator)) {
    throw new TypeError(typeof value === "string" ? `Unsupported predicate comparison operator: ${value}` : `Unsupported predicate comparison operator of type ${typeof value}.`);
  }
  return value as PredicateComparisonOperator;
}

function comparisonOptions(value: unknown): { readonly caseInsensitive?: boolean; readonly diacriticInsensitive?: boolean } | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new NSEPredicateCompilationError("shape", "Predicate comparison options must be an object.");
  let descriptors: PropertyDescriptorMap;
  try { descriptors = Object.getOwnPropertyDescriptors(value); } catch { throw new NSEPredicateCompilationError("shape", "Predicate comparison options must expose own data properties."); }
  const result: { caseInsensitive?: boolean; diacriticInsensitive?: boolean } = {};
  for (const key of Object.keys(descriptors)) {
    if (key !== "caseInsensitive" && key !== "diacriticInsensitive") throw new NSEPredicateCompilationError("shape", "Predicate comparison options contain an unsupported property.");
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || typeof descriptor.value !== "boolean") throw new NSEPredicateCompilationError("shape", "Predicate comparison options must be boolean data properties.");
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function formatterFor(type: PredicateField<unknown>["type"]): Formatter<unknown> {
  const parse = (text: string) => {
    if (type === "number") return Number.isFinite(Number(text))
      ? { ok: true as const, value: Number(text) }
      : { ok: false as const, error: { code: "number", message: "Enter a number", input: text } };
    if (type === "boolean") return text === "true" || text === "false"
      ? { ok: true as const, value: text === "true" }
      : { ok: false as const, error: { code: "boolean", message: "Enter true or false", input: text } };
    return { ok: true as const, value: text };
  };
  return Object.freeze({
    format: (value: unknown) => String(value ?? ""),
    editingText: (value: unknown) => String(value ?? ""),
    parse,
    validatePartial: (text: string) => {
      const result = parse(text);
      return result.ok ? { valid: true as const } : { valid: false as const, error: result.error };
    },
  });
}

export function templatesFromPredicateSchema<T>(schema: PredicateSchema<T>): readonly NSEPredicateTemplate<T>[] {
  return Object.freeze(Object.entries(schema.fields).map(([field, definition]) => {
    const formatter = formatterFor(definition.type);
    return Object.freeze({
      id: `${schema.id}:${field}`,
      field: field as keyof T & string,
      label: field,
      operators: Object.freeze(TYPE_OPERATORS[definition.type].map((operator) => PREDICATE_OPERATOR_OPTIONS.find((option) => option.operator === operator)!)),
      acceptsTextOptions: definition.type === "string",
      formatter,
      validate: (value: unknown) => ({ ok: true as const, value }),
    });
  }));
}

export function mergePredicateTemplates<T>(schema: PredicateSchema<T>, explicit: readonly NSEPredicateTemplate<T>[] = []): readonly NSEPredicateTemplate<T>[] {
  const generated = templatesFromPredicateSchema(schema);
  const overrides = new Map(explicit.map((template) => [template.id, template]));
  const merged = generated.map((template) => {
    const override = overrides.get(template.id);
    return override === undefined ? template : { ...override, acceptsTextOptions: override.acceptsTextOptions ?? template.acceptsTextOptions };
  });
  const generatedIds = new Set(generated.map(({ id }) => id));
  for (const template of explicit) if (!generatedIds.has(template.id)) merged.push(template);
  return Object.freeze(merged.map((template) => Object.freeze({ ...template, operators: Object.freeze([...template.operators]) })));
}

export class NSEPredicateCompilationError extends TypeError {
  readonly code: "cycle" | "depth" | "nodes" | "shape";
  constructor(code: NSEPredicateCompilationError["code"], message: string) { super(message); this.name = "NSEPredicateCompilationError"; this.code = code; }
}

function ownDataDescriptors(value: unknown, label: string): PropertyDescriptorMap {
  if (!value || typeof value !== "object") throw new NSEPredicateCompilationError("shape", `${label} must be an object.`);
  let descriptors: PropertyDescriptorMap;
  try { descriptors = Object.getOwnPropertyDescriptors(value); } catch { throw new NSEPredicateCompilationError("shape", `${label} must expose own data properties.`); }
  for (const [name, descriptor] of Object.entries(descriptors)) if (!("value" in descriptor)) throw new NSEPredicateCompilationError("shape", `${label} property ${name} must be a data property.`);
  return descriptors;
}

function requiredData(descriptors: PropertyDescriptorMap, name: string, label: string): unknown {
  const descriptor = descriptors[name];
  if (!descriptor || !("value" in descriptor)) throw new NSEPredicateCompilationError("shape", `${label} requires an own ${name} data property.`);
  return descriptor.value;
}

function denseArrayValues(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new NSEPredicateCompilationError("shape", `${label} must be an array.`);
  const descriptors = ownDataDescriptors(value, label);
  const length = requiredData(descriptors, "length", label);
  if (!Number.isSafeInteger(length) || (length as number) < 0) throw new NSEPredicateCompilationError("shape", `${label} has an invalid length.`);
  const result: unknown[] = [];
  for (let index = 0; index < (length as number); index += 1) result.push(requiredData(descriptors, String(index), label));
  return result;
}

function validateLiteral(value: unknown, allowArray: boolean): void {
  if (value === undefined) return;
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
  if (!allowArray) throw new NSEPredicateCompilationError("shape", "Predicate values must contain finite scalar literals.");
  for (const item of denseArrayValues(value, "Predicate value arrays")) validateLiteral(item, false);
}

function compileRow(row: unknown, ancestors: Set<object>, depth: number, count: { value: number }): PredicateExpression {
  const descriptors = ownDataDescriptors(row, "Predicate rule rows");
  if (depth > 64) throw new NSEPredicateCompilationError("depth", "Predicate rule depth exceeds the supported limit.");
  if (++count.value > 10_000) throw new NSEPredicateCompilationError("nodes", "Predicate rule count exceeds the supported limit.");
  const object = row as object;
  if (ancestors.has(object)) throw new NSEPredicateCompilationError("cycle", "Predicate rule graph contains a cycle.");
  const id = requiredData(descriptors, "id", "Predicate rule rows");
  if (typeof id !== "string" || !id) throw new NSEPredicateCompilationError("shape", "Predicate rule ids must be non-empty strings.");
  const kind = requiredData(descriptors, "kind", "Predicate rule rows");
  if (kind === "group") {
    const operator = requiredData(descriptors, "operator", "Predicate groups");
    if (operator !== "all" && operator !== "any" && operator !== "none") throw new NSEPredicateCompilationError("shape", "Predicate groups require an all, any, or none operator.");
    const childValues = denseArrayValues(requiredData(descriptors, "children", "Predicate groups"), "Predicate group child arrays");
    ancestors.add(object);
    try { return Object.freeze({ kind: "compound", operator, children: Object.freeze(childValues.map((child) => compileRow(child, ancestors, depth + 1, count))) }); }
    finally { ancestors.delete(object); }
  }
  if (kind === "constant") {
    const constant = requiredData(descriptors, "value", "Predicate constants");
    if (typeof constant !== "boolean") throw new NSEPredicateCompilationError("shape", "Predicate constants require a boolean value.");
    return Object.freeze({ kind: "constant", value: constant });
  }
  if (kind !== "comparison") throw new NSEPredicateCompilationError("shape", "Predicate rules require a supported row kind.");
  const field = requiredData(descriptors, "field", "Predicate comparisons");
  if (typeof field !== "string") throw new NSEPredicateCompilationError("shape", "Predicate comparisons require a string field.");
  const operator = normalisePredicateOperator(requiredData(descriptors, "operator", "Predicate comparisons"));
  const option = PREDICATE_OPERATOR_OPTIONS.find((candidate) => candidate.operator === operator)!;
  const value = descriptors.value && "value" in descriptors.value ? descriptors.value.value : undefined;
  if (operator === "between" && denseArrayValues(value, "Between bounds").length !== 2) throw new NSEPredicateCompilationError("shape", "Between requires exactly two bounds.");
  if (operator === "in") denseArrayValues(value, "In values");
  validateLiteral(value, operator === "between" || operator === "in");
  const options = descriptors.options && "value" in descriptors.options ? comparisonOptions(descriptors.options.value) : undefined;
  const expression = option.arity === 0
    ? { kind: "comparison" as const, field, operator }
    : { kind: "comparison" as const, field, operator, value, ...(options === undefined ? {} : { options }) };
  return Object.freeze(expression);
}

export function compilePredicateExpression(value: NSERuleEditorValue): PredicateExpression {
  if (!value || typeof value !== "object") throw new NSEPredicateCompilationError("shape", "Predicate editor values must be objects.");
  const root = Object.getOwnPropertyDescriptor(value, "root");
  if (!root || root.get || root.set) throw new NSEPredicateCompilationError("shape", "Predicate editor roots must be data properties.");
  return compileRow(root.value as NSERuleRow, new Set(), 0, { value: 0 });
}

function rowFromExpression(expression: unknown, id: string, ancestors: Set<object>, depth: number, count: { value: number }): NSERuleRow {
  const descriptors = ownDataDescriptors(expression, "Predicate expressions");
  if (depth > 64) throw new NSEPredicateCompilationError("depth", "Predicate expression depth exceeds the supported limit.");
  if (++count.value > 10_000) throw new NSEPredicateCompilationError("nodes", "Predicate expression count exceeds the supported limit.");
  const object = expression as object;
  if (ancestors.has(object)) throw new NSEPredicateCompilationError("cycle", "Predicate expression graph contains a cycle.");
  const kind = requiredData(descriptors, "kind", "Predicate expressions");
  if (kind === "compound") {
    const operator = requiredData(descriptors, "operator", "Compound predicates");
    if (operator !== "all" && operator !== "any" && operator !== "none") throw new NSEPredicateCompilationError("shape", "Compound predicates require an all, any, or none operator.");
    const childValues = denseArrayValues(requiredData(descriptors, "children", "Compound predicates"), "Compound predicate child arrays");
    ancestors.add(object);
    try { return Object.freeze({ id, kind: "group", operator, children: Object.freeze(childValues.map((child, index) => rowFromExpression(child, `${id}-${index + 1}`, ancestors, depth + 1, count))) }); }
    finally { ancestors.delete(object); }
  }
  if (kind === "constant") {
    const constant = requiredData(descriptors, "value", "Predicate constants");
    if (typeof constant !== "boolean") throw new NSEPredicateCompilationError("shape", "Predicate constants require a boolean value.");
    return Object.freeze({ id, kind: "constant", value: constant });
  }
  if (kind !== "comparison") throw new NSEPredicateCompilationError("shape", "Predicate expressions require a supported kind.");
  const field = requiredData(descriptors, "field", "Predicate comparisons");
  if (typeof field !== "string") throw new NSEPredicateCompilationError("shape", "Predicate comparisons require a string field.");
  const operator = normalisePredicateOperator(requiredData(descriptors, "operator", "Predicate comparisons"));
  const value = descriptors.value && "value" in descriptors.value ? descriptors.value.value as PredicateLiteral : undefined;
  const options = descriptors.options && "value" in descriptors.options ? comparisonOptions(descriptors.options.value) : undefined;
  return Object.freeze({ id, kind: "comparison", field, operator, value, ...(options === undefined ? {} : { options }) });
}

export function ruleRowFromExpression(expression: PredicateExpression, id = "rule-1"): NSERuleRow {
  return rowFromExpression(expression, id, new Set(), 0, { value: 0 });
}
