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

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { compilePredicateExpression, PREDICATE_OPERATOR_OPTIONS, normalisePredicateOperator } from "./predicateTemplates";
import { dataViewAllowsNavigation, dataViewIsBusy, dataViewPresentsContent } from "../Core";
import { NSEChoiceControl } from "./NSEChoiceControl";
import { NSEPushButton } from "../../Controls/Buttons/NSEButtons";
import { NSETextField } from "../../Controls/Fields/NSEFields";
import type { NSEPredicateOperatorOption, NSEPredicateTemplate, NSERuleEditorProps, NSERuleEditorValue, NSERuleRow } from "./ruleEditorTypes";
import "./nse-rule-editor.css";

const matchOptions = Object.freeze([
  Object.freeze({ id: "all", label: "all" }),
  Object.freeze({ id: "any", label: "any" }),
  Object.freeze({ id: "none", label: "none" }),
]);

const EMPTY_VALUE: NSERuleEditorValue = Object.freeze({ root: Object.freeze({ id: "root", kind: "group", operator: "all", children: Object.freeze([]) }) });

function collectIds(row: NSERuleRow, ids = new Set<string>()): Set<string> {
  ids.add(row.id); if (row.kind === "group") for (const child of row.children) collectIds(child, ids); return ids;
}

function nextRuleId(root: NSERuleRow, prefix = "rule"): string {
  const ids = collectIds(root); let index = 1; while (ids.has(`${prefix}-${index}`)) index += 1; return `${prefix}-${index}`;
}

function replaceAtPath(rows: readonly NSERuleRow[], path: readonly number[], replacement: NSERuleRow | null): readonly NSERuleRow[] {
  const [index, ...rest] = path;
  if (index === undefined) return rows;
  if (rest.length === 0) return replacement === null ? rows.filter((_, candidate) => candidate !== index) : rows.map((row, candidate) => candidate === index ? Object.freeze(replacement) : row);
  return rows.map((row, candidate) => candidate === index && row.kind === "group" ? Object.freeze({ ...row, children: Object.freeze(replaceAtPath(row.children, rest, replacement)) }) : row);
}

function transformChildren(rows: readonly NSERuleRow[], groupPath: readonly number[], transform: (children: readonly NSERuleRow[]) => readonly NSERuleRow[]): readonly NSERuleRow[] {
  const [index, ...rest] = groupPath;
  if (index === undefined) return Object.freeze([...transform(rows)]);
  return rows.map((row, candidate) => candidate === index && row.kind === "group"
    ? Object.freeze({ ...row, children: Object.freeze(transformChildren(row.children, rest, transform)) })
    : row);
}

function RuleComparisonControls({ row, label, fields, operators, templates, locale, readOnly, disabled, onChange }: {
  readonly row: Extract<NSERuleRow, { kind: "comparison" }>;
  readonly label: string;
  readonly fields: readonly string[];
  readonly operators: readonly NSEPredicateOperatorOption[];
  readonly templates: readonly NSEPredicateTemplate<unknown>[];
  readonly locale: string;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly onChange: (row: Extract<NSERuleRow, { kind: "comparison" }>) => void;
}) {
  const template = templates.find((candidate) => candidate.field === row.field);
  const available = template?.operators ?? operators;
  const option = available.find((candidate) => candidate.operator === row.operator) ?? operators.find((candidate) => candidate.operator === row.operator);
  const textFor = (value: unknown) => template?.formatter.editingText(value, { locale }) ?? String(value ?? "");
  const [parts, setParts] = useState<readonly string[]>(() => Array.isArray(row.value) ? row.value.map(textFor) : [textFor(row.value)]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setParts(Array.isArray(row.value) ? row.value.map(textFor) : [textFor(row.value)]), [row.value, template, locale]);
  const parse = (text: string) => {
    try {
      if (!template) return { ok: true as const, value: text };
      const parsed = template.formatter.parse(text.trim(), { locale });
      if (!parsed.ok) return parsed;
      return template.validate(parsed.value);
    } catch (cause) {
      return { ok: false as const, error: { code: "predicate-value", message: cause instanceof Error ? cause.message : "Invalid value", input: text } };
    }
  };
  const publishParts = (next: readonly string[]) => {
    const parsed = next.map(parse);
    const invalid = parsed.find((candidate) => !candidate.ok);
    if (invalid && !invalid.ok) { setError(invalid.error.message); return; }
    setError(null);
    const values = parsed.map((candidate) => candidate.ok ? candidate.value : undefined);
    onChange({ ...row, value: row.operator === "between" || row.operator === "in" ? values as never : values[0] as never });
  };
  const locked = readOnly || disabled;
  const compatibleOptions = (candidate: NSEPredicateTemplate<unknown> | undefined, operator: string) => candidate?.acceptsTextOptions === true && ["equals", "notEquals", "contains", "beginsWith", "endsWith", "in"].includes(operator) ? row.options : undefined;
  return <>
    <NSEChoiceControl label={`Field ${label}`} labelHidden value={row.field} disabled={locked} options={fields.map((id) => ({ id, label: templates.find((candidate) => candidate.field === id)?.label ?? id }))} onChange={(field) => {
      const nextTemplate = templates.find((candidate) => candidate.field === field);
      const operator = nextTemplate?.operators[0]?.operator ?? available[0]?.operator ?? "equals";
      const options = compatibleOptions(nextTemplate, operator);
      onChange({ ...row, field, operator, value: operator === "between" ? ["", ""] : operator === "in" ? [] : undefined, ...(options === undefined ? { options: undefined } : { options }) });
    }} />
    <NSEChoiceControl label={`Operator ${label}`} labelHidden value={row.operator} disabled={locked} options={available.map(({ operator: id, label: text }) => ({ id, label: text }))} onChange={(nextId) => {
      const operator = normalisePredicateOperator(nextId);
      const arity = available.find((candidate) => candidate.operator === operator)?.arity;
      const prior = row.value;
      const value = operator === "between" ? (Array.isArray(prior) ? [prior[0], prior[1] ?? prior[0]] : [prior, prior])
        : operator === "in" ? (Array.isArray(prior) ? prior : [prior])
          : Array.isArray(prior) ? prior[0] : prior;
      const options = compatibleOptions(template, operator);
      onChange(arity === 0
        ? { ...row, operator, value: undefined, options: undefined }
        : { ...row, operator, value: value as never, ...(options === undefined ? { options: undefined } : { options }) });
    }} />
    {row.operator === "between" ? <>
      <NSETextField className="nse-rule-value" aria-label={`Lower value rule ${row.id}`} value={parts[0] ?? ""} readOnly={readOnly} disabled={disabled} onChange={(event) => { const next = [event.target.value, parts[1] ?? ""]; setParts(next); if (next[1] !== "") publishParts(next); }} />
      <NSETextField className="nse-rule-value" aria-label={`Upper value rule ${row.id}`} value={parts[1] ?? ""} readOnly={readOnly} disabled={disabled} onChange={(event) => { const next = [parts[0] ?? "", event.target.value]; setParts(next); if (next[0] !== "") publishParts(next); }} />
    </> : row.operator === "in" ? <NSETextField className="nse-rule-value" aria-label={`Values rule ${row.id}`} value={parts.join(", ")} readOnly={readOnly} disabled={disabled} onChange={(event) => { const next = event.target.value.split(","); setParts(next); publishParts(next); }} />
      : option?.arity !== 0 ? <NSETextField className="nse-rule-value" aria-label={`Value ${label}`} value={parts[0] ?? ""} readOnly={readOnly} disabled={disabled} onChange={(event) => { const next = [event.target.value]; setParts(next); publishParts(next); }} /> : null}
    {error && <span role="alert" className="nse-rule-error">{error}</span>}
  </>;
}

export function NSERuleEditor({ value, defaultValue = EMPTY_VALUE, onChange, onValidationChange, fields, operators = PREDICATE_OPERATOR_OPTIONS, templates = [], locale = "en-GB", state, readOnly = false, disabled = false, className = "", ...props }: NSERuleEditorProps) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  compilePredicateExpression(current);
  const root: Extract<NSERuleRow, { kind: "group" }> = current.root.kind === "group" ? current.root : { id: "root", kind: "group", operator: "all", children: [current.root] };
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pendingFocusId) return;
    [...(containerRef.current?.querySelectorAll<HTMLElement>("[data-rule-id]") ?? [])].find((element) => element.dataset.ruleId === pendingFocusId)?.focus();
    setPendingFocusId(null);
  }, [pendingFocusId, value]);
  useEffect(() => onValidationChange?.({ valid: true, issues: Object.freeze([]) }), [onValidationChange, current]);

  const effectiveState = state ?? (disabled ? { kind: "disabled", message: "Disabled" } : readOnly ? { kind: "read-only", message: "Read only" } : { kind: "ready" });
  const effectiveReadOnly = readOnly || effectiveState.kind === "read-only";
  const effectiveDisabled = disabled || !dataViewAllowsNavigation(effectiveState);
  const presentsContent = dataViewPresentsContent(effectiveState);
  const hostDisabled = disabled || effectiveState.kind === "disabled" || effectiveState.kind === "invalid" || (effectiveState.kind === "denied" && !effectiveState.retry);
  const publishRoot = (nextRoot: Extract<NSERuleRow, { kind: "group" }>) => {
    const next = Object.freeze({ root: Object.freeze(nextRoot) });
    compilePredicateExpression(next);
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };
  const publishChildren = (children: readonly NSERuleRow[], operator = root.operator) => publishRoot({ ...root, operator, children: Object.freeze([...children]) });
  const locked = effectiveDisabled || effectiveReadOnly;
  const addRule = (groupPath: readonly number[]) => {
    const id = nextRuleId(root);
    const field = fields[0]!;
    const template = templates.find((candidate) => candidate.field === field);
    const option = template?.operators[0] ?? operators[0];
    if (!option) return;
    const value = option.arity === 0 ? undefined : option.operator === "between" ? ["", ""] : option.operator === "in" ? [] : "";
    const row: NSERuleRow = Object.freeze({ id, kind: "comparison", field, operator: option.operator, value });
    setPendingFocusId(id); publishChildren(transformChildren(root.children, groupPath, (children) => [...children, row]));
  };
  const addGroup = (groupPath: readonly number[]) => {
    const id = nextRuleId(root, "group");
    const row: NSERuleRow = Object.freeze({ id, kind: "group", operator: "all", children: Object.freeze([]) });
    setPendingFocusId(id); publishChildren(transformChildren(root.children, groupPath, (children) => [...children, row]));
  };
  const groupIdAt = (path: readonly number[]): string => {
    let rows: readonly NSERuleRow[] = root.children;
    let current = root.id;
    for (const index of path) {
      const row = rows[index];
      if (!row || row.kind !== "group") break;
      current = row.id; rows = row.children;
    }
    return current;
  };
  const repairFocus = (rows: readonly NSERuleRow[], index: number, parentPath: readonly number[]) => setPendingFocusId(rows[index - 1]?.id ?? rows[index + 1]?.id ?? groupIdAt(parentPath));
  const move = (parentPath: readonly number[], index: number, delta: number) => {
    let movedId: string | null = null;
    const next = transformChildren(root.children, parentPath, (children) => {
      const target = index + delta; if (target < 0 || target >= children.length) return children;
      const copy = [...children]; [copy[index], copy[target]] = [copy[target]!, copy[index]!]; movedId = copy[target]!.id; return copy;
    });
    if (!movedId) return; setPendingFocusId(movedId); publishChildren(next);
  };
  const renderRows = (rows: readonly NSERuleRow[], parentPath: readonly number[] = []): ReactNode => rows.map((row, index) => {
    const path = [...parentPath, index];
    if (row.kind === "group") return <fieldset key={row.id} tabIndex={-1} data-rule-id={row.id} className="nse-rule-group" onKeyDown={(event) => {
      if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); move(parentPath, index, -1); }
      else if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); move(parentPath, index, 1); }
    }}>
      <div className="nse-rule-header">
        <NSEChoiceControl label={`Match ${row.id}`} labelHidden value={row.operator} disabled={locked} options={matchOptions} onChange={(operator) => publishChildren(replaceAtPath(root.children, path, { ...row, operator: operator as "all" | "any" | "none" }))} />
        <span className="nse-rule-phrase" aria-hidden="true">of the following are true</span>
        <NSEPushButton tone="light" className="nse-rule-remove" aria-label={`Remove group ${row.id}`} disabled={locked} onClick={() => { repairFocus(rows, index, parentPath); publishChildren(replaceAtPath(root.children, path, null)); }}>−</NSEPushButton>
      </div>
      <div className="nse-rule-rows">{renderRows(row.children, path)}</div>
      <div className="nse-rule-footer">
        <NSEPushButton tone="light" aria-label={`Add rule to ${row.id}`} disabled={locked || fields.length === 0} onClick={() => addRule(path)}>Add Rule</NSEPushButton>
        <NSEPushButton tone="light" aria-label={`Add group to ${row.id}`} disabled={locked} onClick={() => addGroup(path)}>Add Group</NSEPushButton>
      </div>
    </fieldset>;
    const label = parentPath.length === 0 ? String(index + 1) : row.id;
    if (row.kind === "constant") return <div key={row.id} role="group" aria-label={`Rule ${label}`} tabIndex={-1} data-rule-id={row.id} className="nse-rule-row">
      <NSEChoiceControl label={`Constant ${label}`} labelHidden value={String(row.value)} disabled={locked} options={[{ id: "true", label: "Always true" }, { id: "false", label: "Always false" }]} onChange={(next) => publishChildren(replaceAtPath(root.children, path, { ...row, value: next === "true" }))} />
      <NSEPushButton tone="light" className="nse-rule-remove" aria-label="Remove rule" disabled={locked} onClick={() => { repairFocus(rows, index, parentPath); publishChildren(replaceAtPath(root.children, path, null)); }}>−</NSEPushButton>
    </div>;
    return <div key={row.id} role="group" aria-label={`Rule ${label}`} tabIndex={-1} data-rule-id={row.id} className="nse-rule-row" data-appearance-recipe="rule-row" data-alternating={index % 2 === 1 || undefined} onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
      if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); move(parentPath, index, -1); }
      else if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); move(parentPath, index, 1); }
    }}>
      <RuleComparisonControls row={row} label={label} fields={fields} operators={operators} templates={templates} locale={locale} readOnly={effectiveReadOnly} disabled={effectiveDisabled} onChange={(next) => publishChildren(replaceAtPath(root.children, path, next))} />
      <NSEPushButton tone="light" className="nse-rule-remove" aria-label="Remove rule" data-appearance-recipe="rule-remove" disabled={locked} onClick={() => { repairFocus(rows, index, parentPath); publishChildren(replaceAtPath(root.children, path, null)); }}>−</NSEPushButton>
    </div>;
  });
  return <div {...props} aria-disabled={hostDisabled || undefined} aria-busy={dataViewIsBusy(effectiveState) || undefined} ref={containerRef} tabIndex={-1} data-rule-id={root.id} className={`nse-rule-editor ${className}`.trim()} data-nse-control="rule-editor" data-state={effectiveState.kind}>
    {presentsContent && <>
      {/* The Mac's sentence: Match [all] of the following conditions. */}
      <div className="nse-rule-header">
        <span className="nse-rule-phrase" aria-hidden="true">Match</span>
        <NSEChoiceControl label="Match" labelHidden value={root.operator} disabled={locked} options={matchOptions} onChange={(operator) => publishChildren(root.children, operator as "all" | "any" | "none")} />
        <span className="nse-rule-phrase" aria-hidden="true">of the following conditions</span>
      </div>
      <div role="group" aria-label="Rule rows" className="nse-rule-rows">{renderRows(root.children)}</div>
      <div className="nse-rule-footer">
        <NSEPushButton tone="light" aria-label="Add rule" data-appearance-recipe="rule-add" disabled={locked || fields.length === 0} onClick={() => addRule([])}>Add Rule</NSEPushButton>
        <NSEPushButton tone="light" aria-label="Add group" disabled={locked} onClick={() => addGroup([])}>Add Group</NSEPushButton>
      </div>
    </>}
    {effectiveState.kind !== "ready" && <span role="status">{effectiveState.message}</span>}
    {(effectiveState.kind === "denied" || effectiveState.kind === "error") && effectiveState.retry && <NSEPushButton tone="light" onClick={effectiveState.retry}>Retry</NSEPushButton>}
    {effectiveState.kind === "interrupted" && effectiveState.resume && <NSEPushButton tone="light" onClick={effectiveState.resume}>Resume</NSEPushButton>}
  </div>;
}
