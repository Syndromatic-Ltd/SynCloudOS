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

// @vitest-environment jsdom
import { installNSEScrollIntoViewFixture } from "../fixtures/browser";
installNSEScrollIntoViewFixture();

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Predicate, type Formatter, type PredicateComparisonOperator, type PredicateExpression, type PredicateSchema } from "../../../src/SynCloudOS/Models";
import {
  NSEPredicateEditor,
  NSERuleEditor,
  PREDICATE_OPERATOR_OPTIONS,
  compilePredicateExpression,
  mergePredicateTemplates,
  normalisePredicateOperator,
  ruleRowFromExpression,
  type NSEPredicateTemplate,
  type NSERuleEditorValue,
} from "../../../src/NSE/DataViews/RuleEditor";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

interface Person { readonly name: string; readonly age: number }

const schema: PredicateSchema<Person> = {
  id: "person",
  fields: {
    name: { type: "string", read: (person) => person.name },
    age: { type: "number", read: (person) => person.age },
  },
};

const numberFormatter: Formatter<unknown> = {
  format: (value) => String(value),
  editingText: (value) => String(value),
  parse: (text) => Number.isFinite(Number(text)) ? { ok: true, value: Number(text) } : { ok: false, error: { code: "number", message: "Enter a number", input: text } },
  validatePartial: (text) => Number.isFinite(Number(text)) ? { valid: true } : { valid: false, error: { code: "number", message: "Enter a number", input: text } },
};

afterEach(cleanup);

const workArea = Object.freeze({ width: 800, height: 600, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const presentation = createStaticPresentationPort({ width: 800, height: 600 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:rule-editor-tests", signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; }, clearTimeout: () => undefined,
    },
    restoreFocus: (_id: string, anchor: HTMLElement | null) => anchor?.focus(), reportPlacementFailure: vi.fn(), wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), []);
  return <NSEOverlayProvider runtimePort={runtimePort} defaultParentResponderId="workspace">{children}</NSEOverlayProvider>;
}

describe("predicate template contracts", () => {
  it("preserves every exact camelCase comparison operator and rejects parallel vocabularies", () => {
    const expected: readonly PredicateComparisonOperator[] = [
      "equals", "notEquals", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual",
      "contains", "beginsWith", "endsWith", "in", "between", "isNull", "isNotNull",
    ];
    expect(PREDICATE_OPERATOR_OPTIONS.map(({ operator }) => operator)).toEqual(expected);
    for (const operator of expected) expect(normalisePredicateOperator(operator)).toBe(operator);
    expect(() => normalisePredicateOperator("greater-than")).toThrow("Unsupported predicate comparison operator: greater-than");
  });

  it("merges explicit templates deterministically by stable ID", () => {
    const explicit: NSEPredicateTemplate<Person>[] = [{
      id: "person:age", field: "age", label: "Years", operators: [{ operator: "greaterThan", label: "After", arity: 1 }], formatter: numberFormatter, validate: (value) => ({ ok: true, value }),
    }];
    const merged = mergePredicateTemplates(schema, explicit);
    expect(merged.map(({ id, label }) => [id, label])).toEqual([["person:name", "name"], ["person:age", "Years"]]);
    expect(Object.isFrozen(merged)).toBe(true);
  });

  it("compiles nested all/any/none groups immutably and rejects hostile operators", () => {
    const value: NSERuleEditorValue = { root: { id: "root", kind: "group", operator: "none", children: [
      { id: "a", kind: "comparison", field: "name", operator: "contains", value: "bot" },
      { id: "b", kind: "group", operator: "any", children: [{ id: "c", kind: "comparison", field: "age", operator: "greaterThan", value: 40 }] },
    ] } };
    expect(compilePredicateExpression(value)).toEqual({ kind: "compound", operator: "none", children: [
      { kind: "comparison", field: "name", operator: "contains", value: "bot" },
      { kind: "compound", operator: "any", children: [{ kind: "comparison", field: "age", operator: "greaterThan", value: 40 }] },
    ] });
    expect(Object.isFrozen(compilePredicateExpression(value))).toBe(true);
    expect(() => compilePredicateExpression({ root: { id: "bad", kind: "comparison", field: "age", operator: "greater-than" as PredicateComparisonOperator, value: 1 } })).toThrow();
  });

  it("rejects cyclic and excessively deep rule graphs with structured errors", () => {
    const cyclic: { root: NSERuleEditorValue["root"] } = { root: { id: "cycle", kind: "group", operator: "all", children: [] } };
    (cyclic.root as { children: NSERuleEditorValue["root"][] }).children.push(cyclic.root);
    expect(() => compilePredicateExpression(cyclic)).toThrow(expect.objectContaining({ name: "NSEPredicateCompilationError", code: "cycle" }));
    let row: NSERuleEditorValue["root"] = { id: "leaf", kind: "comparison", field: "age", operator: "equals", value: 1 };
    for (let depth = 0; depth < 80; depth += 1) row = { id: `group-${depth}`, kind: "group", operator: "all", children: [row] };
    expect(() => compilePredicateExpression({ root: row })).toThrow(expect.objectContaining({ name: "NSEPredicateCompilationError", code: "depth" }));
  });

  it("rejects unsupported group operators and sparse child arrays with structured shape errors", () => {
    expect(() => compilePredicateExpression({ root: { id: "bad", kind: "group", operator: "xor" as "all", children: [] } })).toThrow(expect.objectContaining({ name: "NSEPredicateCompilationError", code: "shape" }));
    const sparse: NSERuleEditorValue["root"][] = new Array(2);
    sparse[1] = { id: "leaf", kind: "comparison", field: "age", operator: "equals", value: 1 };
    expect(() => compilePredicateExpression({ root: { id: "sparse", kind: "group", operator: "all", children: sparse } })).toThrow(expect.objectContaining({ name: "NSEPredicateCompilationError", code: "shape" }));
  });

  it("requires own data descriptors and never invokes inherited or accessor predicate properties", () => {
    const inherited = Object.assign(Object.create({ kind: "comparison" }), { id: "inherited", field: "age", operator: "equals", value: 1 });
    expect(() => compilePredicateExpression({ root: inherited as NSERuleEditorValue["root"] })).toThrow(expect.objectContaining({ code: "shape" }));
    const getter = vi.fn(() => "comparison");
    const accessor = { id: "accessor", field: "age", operator: "equals", value: 1 } as Record<string, unknown>;
    Object.defineProperty(accessor, "kind", { enumerable: true, get: getter });
    expect(() => compilePredicateExpression({ root: accessor as NSERuleEditorValue["root"] })).toThrow(expect.objectContaining({ code: "shape" }));
    expect(getter).not.toHaveBeenCalled();
  });

  it("preserves predicate constants instead of converting them to comparisons", () => {
    expect(ruleRowFromExpression({ kind: "constant", value: true })).toEqual({ id: "rule-1", kind: "constant", value: true });
    expect(compilePredicateExpression({ root: ruleRowFromExpression({ kind: "constant", value: false }) })).toEqual({ kind: "constant", value: false });
  });

  it("round-trips valid text comparison options losslessly", () => {
    const expression: PredicateExpression = { kind: "comparison", field: "name", operator: "contains", value: "ada", options: { caseInsensitive: true, diacriticInsensitive: true } };
    expect(compilePredicateExpression({ root: ruleRowFromExpression(expression) })).toEqual(expression);
  });
});

describe("NSEPredicateEditor", () => {
  it("uses the runtime-owned listbox when an overlay provider is present", async () => {
    const onChange = vi.fn();
    render(<OverlayHarness><NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={{ kind: "comparison", field: "name", operator: "equals", value: "Ada" }} onChange={onChange} /></OverlayHarness>);
    expect(screen.queryByRole("combobox", { name: "Field" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Field / }));
    fireEvent.click(await screen.findByRole("option", { name: "age" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "comparison", field: "age" }));
  });
  it("switches field/operator/value templates and parses typed values", () => {
    const onChange = vi.fn();
    const initial: PredicateExpression = { kind: "comparison", field: "name", operator: "contains", value: "Ada" };
    const view = render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={initial} onChange={onChange} templates={[{ id: "person:age", field: "age", label: "Age", operators: [{ operator: "greaterThan", label: "greater than", arity: 1 }], formatter: numberFormatter, validate: (value) => ({ ok: true, value }) }]} />);
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "person:age" } });
    const ageExpression: PredicateExpression = { kind: "comparison", field: "age", operator: "greaterThan", value: undefined };
    expect(onChange).toHaveBeenLastCalledWith(ageExpression);
    view.rerender(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={ageExpression} onChange={onChange} templates={[{ id: "person:age", field: "age", label: "Age", operators: [{ operator: "greaterThan", label: "greater than", arity: 1 }], formatter: numberFormatter, validate: (value) => ({ ok: true, value }) }]} />);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "40" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "comparison", field: "age", operator: "greaterThan", value: 40 });
  });

  it("reports live invalid input without publishing an invalid expression", () => {
    const onChange = vi.fn();
    render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={{ kind: "comparison", field: "age", operator: "equals", value: 2 }} onChange={onChange} templates={[{ id: "person:age", field: "age", label: "Age", operators: PREDICATE_OPERATOR_OPTIONS.filter(({ operator }) => operator === "equals"), formatter: numberFormatter, validate: (value) => ({ ok: true, value }) }]} />);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "nope" } });
    expect(screen.getByRole("alert").textContent).toBe("Enter a number");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("publishes typed between bounds and in-list arrays only after every value validates", () => {
    const onChange = vi.fn();
    const template: NSEPredicateTemplate<Person> = { id: "person:age", field: "age", label: "Age", operators: PREDICATE_OPERATOR_OPTIONS.filter(({ operator }) => operator === "between" || operator === "in"), formatter: numberFormatter, validate: (value) => ({ ok: true, value }) };
    const view = render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={{ kind: "comparison", field: "age", operator: "between", value: [1, 2] }} onChange={onChange} templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Lower value"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Upper value"), { target: { value: "20" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "comparison", field: "age", operator: "between", value: [10, 20] });
    view.rerender(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={{ kind: "comparison", field: "age", operator: "in", value: [1] }} onChange={onChange} templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Values"), { target: { value: "1, 2, 3" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "comparison", field: "age", operator: "in", value: [1, 2, 3] });
  });

  it("normalises value shape atomically when the operator changes", () => {
    const onChange = vi.fn();
    const template: NSEPredicateTemplate<Person> = { id: "person:age", field: "age", label: "Age", operators: PREDICATE_OPERATOR_OPTIONS.filter(({ operator }) => ["equals", "between", "in", "isNull"].includes(operator)), formatter: numberFormatter, validate: (value) => ({ ok: true, value }) };
    const view = render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={{ kind: "comparison", field: "age", operator: "equals", value: 5 }} onChange={onChange} templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Operator"), { target: { value: "between" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "comparison", field: "age", operator: "between", value: [5, 5] });
    view.rerender(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={{ kind: "comparison", field: "age", operator: "equals", value: 5 }} onChange={onChange} templates={[template]} />);
    fireEvent.change(screen.getByLabelText("Operator"), { target: { value: "in" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "comparison", field: "age", operator: "in", value: [5] });
    fireEvent.change(screen.getByLabelText("Operator"), { target: { value: "isNull" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "comparison", field: "age", operator: "isNull" });
  });

  it("preserves compatible text options through actual field, operator and value publications", () => {
    const onChange = vi.fn();
    const initial: PredicateExpression = { kind: "comparison", field: "name", operator: "contains", value: "eva", options: { caseInsensitive: true, diacriticInsensitive: true } };
    const view = render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={initial} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "elo" } });
    const valueEdit = onChange.mock.calls.at(-1)![0] as PredicateExpression;
    expect(valueEdit).toEqual({ ...initial, value: "elo" });
    expect(Predicate.compile(schema, valueEdit).test({ name: "ÉLODIE", age: 30 })).toBe(true);

    view.rerender(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={initial} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Operator"), { target: { value: "beginsWith" } });
    const operatorEdit = onChange.mock.calls.at(-1)![0] as PredicateExpression;
    expect(operatorEdit).toEqual({ ...initial, operator: "beginsWith" });
    expect(Predicate.compile(schema, operatorEdit).test({ name: "ÉVA Green", age: 30 })).toBe(true);

    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "person:age" } });
    expect(onChange.mock.calls.at(-1)![0]).not.toHaveProperty("options");
  });

  it("renders compound and constant controlled values without substituting a comparison", () => {
    const value: PredicateExpression = { kind: "compound", operator: "all", children: [{ kind: "constant", value: true }, { kind: "comparison", field: "age", operator: "greaterThan", value: 18 }] };
    render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={value} onChange={() => undefined} />);
    expect(screen.getByLabelText("People filter").getAttribute("data-expression-kind")).toBe("compound");
    expect(screen.getByText("Always true")).not.toBeNull();
  });

  it("edits compound comparisons with schema formatters and allowed arity", () => {
    const onChange = vi.fn();
    const value: PredicateExpression = { kind: "compound", operator: "all", children: [{ kind: "comparison", field: "age", operator: "between", value: [18, 65] }] };
    render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={value} onChange={onChange} templates={[{ id: "person:age", field: "age", label: "Age", operators: PREDICATE_OPERATOR_OPTIONS.filter(({ operator }) => operator === "between"), formatter: numberFormatter, validate: (candidate) => ({ ok: true, value: candidate }) }]} />);
    fireEvent.change(screen.getByLabelText("Lower value rule root-1"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Upper value rule root-1"), { target: { value: "60" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "compound", operator: "all", children: [{ kind: "comparison", field: "age", operator: "between", value: [21, 60] }] });
  });

  it("enforces controlled read-only state", () => {
    const onChange = vi.fn();
    render(<NSEPredicateEditor<Person> aria-label="People filter" schema={schema} value={{ kind: "comparison", field: "name", operator: "equals", value: "Ada" }} onChange={onChange} readOnly />);
    expect((screen.getByLabelText("Field") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Operator") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Value") as HTMLInputElement).readOnly).toBe(true);
  });
});

describe("NSERuleEditor", () => {
  const initial: NSERuleEditorValue = { root: { id: "root", kind: "group", operator: "all", children: [{ id: "rule-1", kind: "comparison", field: "name", operator: "equals", value: "Ada" }] } };

  it("inserts/removes immutable rows, moves focus, and preserves no-op controlled values", () => {
    const onChange = vi.fn();
    const view = render(<NSERuleEditor aria-label="Rules" value={initial} onChange={onChange} fields={["name", "age"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    const added = onChange.mock.calls.at(-1)![0] as NSERuleEditorValue;
    expect(added.root.kind === "group" && added.root.children).toHaveLength(2);
    view.rerender(<NSERuleEditor aria-label="Rules" value={added} onChange={onChange} fields={["name", "age"]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove rule" })[1]!);
    expect(onChange.mock.calls.at(-1)![0]).toEqual(initial);
    expect(document.activeElement?.getAttribute("data-rule-id")).toBe("rule-1");
  });

  it("changes compound all/any/none and supports keyboard row movement", () => {
    const onChange = vi.fn();
    render(<NSERuleEditor aria-label="Rules" value={initial} onChange={onChange} fields={["name", "age"]} />);
    fireEvent.change(screen.getByLabelText("Match"), { target: { value: "any" } });
    expect(onChange).toHaveBeenLastCalledWith({ root: expect.objectContaining({ operator: "any" }) });
    const row = screen.getByRole("group", { name: "Rule 1" });
    fireEvent.keyDown(row, { key: "ArrowDown", altKey: true });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders and immutably edits nested groups instead of dropping them", () => {
    const nested: NSERuleEditorValue = { root: { id: "root", kind: "group", operator: "all", children: [{ id: "nested", kind: "group", operator: "none", children: [{ id: "child", kind: "comparison", field: "age", operator: "greaterThan", value: 40 }] }] } };
    const onChange = vi.fn();
    render(<NSERuleEditor aria-label="Rules" value={nested} onChange={onChange} fields={["name", "age"]} />);
    fireEvent.change(screen.getByLabelText("Match nested"), { target: { value: "any" } });
    expect(onChange).toHaveBeenLastCalledWith({ root: expect.objectContaining({ children: [expect.objectContaining({ id: "nested", operator: "any", children: [expect.objectContaining({ id: "child" })] })] }) });
    expect(screen.getByLabelText("Field child")).not.toBeNull();
  });

  it("adds, removes and moves rows inside nested groups immutably", () => {
    const nested: NSERuleEditorValue = { root: { id: "root", kind: "group", operator: "all", children: [{ id: "nested", kind: "group", operator: "any", children: [{ id: "first", kind: "comparison", field: "name", operator: "equals", value: "Ada" }] }] } };
    const onChange = vi.fn();
    const view = render(<NSERuleEditor aria-label="Rules" value={nested} onChange={onChange} fields={["name", "age"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule to nested" }));
    const added = onChange.mock.calls.at(-1)![0] as NSERuleEditorValue;
    expect(added.root.kind === "group" && added.root.children[0]?.kind === "group" && added.root.children[0].children).toHaveLength(2);
    expect(nested.root.kind === "group" && nested.root.children[0]?.kind === "group" && nested.root.children[0].children).toHaveLength(1);
    view.rerender(<NSERuleEditor aria-label="Rules" value={added} onChange={onChange} fields={["name", "age"]} />);
    fireEvent.keyDown(screen.getByRole("group", { name: "Rule rule-1" }), { key: "ArrowUp", altKey: true });
    expect((onChange.mock.calls.at(-1)![0] as NSERuleEditorValue).root).not.toBe(added.root);
  });

  it("adds a subgroup at any nested group path and repairs focus after removing its sole child", () => {
    const nested: NSERuleEditorValue = { root: { id: "root", kind: "group", operator: "all", children: [{ id: "nested", kind: "group", operator: "any", children: [{ id: "sole", kind: "constant", value: true }] }] } };
    const onChange = vi.fn();
    const view = render(<NSERuleEditor aria-label="Rules" value={nested} onChange={onChange} fields={["name"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add group to nested" }));
    const withGroup = onChange.mock.calls.at(-1)![0] as NSERuleEditorValue;
    expect(withGroup.root.kind === "group" && withGroup.root.children[0]?.kind === "group" && withGroup.root.children[0].children.at(-1)).toMatchObject({ kind: "group", operator: "all" });
    view.rerender(<NSERuleEditor aria-label="Rules" value={nested} onChange={onChange} fields={["name"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove rule" }));
    expect(document.activeElement?.getAttribute("data-rule-id") ?? document.activeElement?.getAttribute("aria-label")).toMatch(/nested|Match nested/);
  });

  it("uses the selected field template for root and nested additions", () => {
    const restricted: NSEPredicateTemplate<unknown> = {
      id: "person:age", field: "age", label: "Age",
      operators: PREDICATE_OPERATOR_OPTIONS.filter(({ operator }) => operator === "between"),
      formatter: numberFormatter, validate: (candidate) => ({ ok: true, value: candidate }),
    };
    const nested: NSERuleEditorValue = { root: { id: "root", kind: "group", operator: "all", children: [{ id: "nested", kind: "group", operator: "any", children: [] }] } };
    const onChange = vi.fn();
    const view = render(<NSERuleEditor aria-label="Rules" value={nested} onChange={onChange} fields={["age"]} templates={[restricted]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    const rootAdded = onChange.mock.calls.at(-1)![0] as NSERuleEditorValue;
    expect(rootAdded.root.kind === "group" && rootAdded.root.children.at(-1)).toEqual(expect.objectContaining({ field: "age", operator: "between", value: ["", ""] }));

    view.rerender(<NSERuleEditor aria-label="Rules" value={nested} onChange={onChange} fields={["age"]} templates={[restricted]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule to nested" }));
    const nestedAdded = onChange.mock.calls.at(-1)![0] as NSERuleEditorValue;
    expect(nestedAdded.root.kind === "group" && nestedAdded.root.children[0]?.kind === "group" && nestedAdded.root.children[0].children[0]).toEqual(expect.objectContaining({ field: "age", operator: "between", value: ["", ""] }));
  });

  it("fails closed before recursively rendering cyclic or excessively deep controlled values", () => {
    const cyclic: NSERuleEditorValue = { root: { id: "cycle", kind: "group", operator: "all", children: [] } };
    (cyclic.root as { children: NSERuleEditorValue["root"][] }).children.push(cyclic.root);
    expect(() => render(<NSERuleEditor aria-label="Rules" value={cyclic} onChange={() => undefined} fields={["name"]} />)).toThrow(expect.objectContaining({ name: "NSEPredicateCompilationError", code: "cycle" }));
  });

  it("disables popup/listbox inputs and add/remove actions when read-only", () => {
    render(<NSERuleEditor aria-label="Rules" value={initial} onChange={() => undefined} fields={["name", "age"]} readOnly />);
    expect((screen.getByLabelText("Match") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add rule" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Remove rule" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
