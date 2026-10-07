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

import { useEffect, useMemo, useState } from "react";

import type { PredicateExpression } from "../../../SynCloudOS/Models";
import { compilePredicateExpression, mergePredicateTemplates, PREDICATE_OPERATOR_OPTIONS, normalisePredicateOperator, ruleRowFromExpression } from "./predicateTemplates";
import { NSERuleEditor } from "./NSERuleEditor";
import { NSEPushButton } from "../../Controls/Buttons/NSEButtons";
import { NSETextField } from "../../Controls/Fields/NSEFields";
import { NSEChoiceControl } from "./NSEChoiceControl";
import { dataViewAllowsNavigation, dataViewIsBusy, dataViewPresentsContent } from "../Core";
import type { NSEPredicateEditorProps, NSEPredicateTemplate } from "./ruleEditorTypes";
import "./nse-rule-editor.css";

interface ComparisonEditorProps<T> {
  readonly expression: Extract<PredicateExpression, { kind: "comparison" }>;
  readonly templates: readonly NSEPredicateTemplate<T>[];
  readonly publish: (value: PredicateExpression) => void;
  readonly readOnly: boolean;
  readonly disabled: boolean;
  readonly locale: string;
}

function NSEComparisonPredicateEditor<T>({ expression, templates, publish, readOnly, disabled, locale }: ComparisonEditorProps<T>) {
  const template = templates.find(({ field }) => field === expression.field) ?? templates[0];
  const operator = normalisePredicateOperator(expression.operator);
  const option = template?.operators.find((candidate) => candidate.operator === operator) ?? PREDICATE_OPERATOR_OPTIONS.find((candidate) => candidate.operator === operator)!;
  const [text, setText] = useState(() => template?.formatter.editingText(expression.value, { locale }) ?? String(expression.value ?? ""));
  const [parts, setParts] = useState<readonly string[]>(() => Array.isArray(expression.value) ? expression.value.map((item) => template?.formatter.editingText(item, { locale }) ?? String(item ?? "")) : []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(template?.formatter.editingText(expression.value, { locale }) ?? String(expression.value ?? ""));
    setParts(Array.isArray(expression.value) ? expression.value.map((item) => template?.formatter.editingText(item, { locale }) ?? String(item ?? "")) : []);
  }, [expression.value, locale, template]);
  const locked = disabled || readOnly;
  const acceptsOptions = (candidate: NSEPredicateTemplate<T> | undefined, candidateOperator: string) => candidate?.acceptsTextOptions === true && ["equals", "notEquals", "contains", "beginsWith", "endsWith", "in"].includes(candidateOperator);
  const compatibleOptions = (candidate: NSEPredicateTemplate<T> | undefined, candidateOperator: string) => acceptsOptions(candidate, candidateOperator) && expression.options !== undefined ? { options: expression.options } : {};
  const parsePart = (candidate: string) => {
    const parsed = template!.formatter.parse(candidate.trim(), { locale });
    if (!parsed.ok) { setError(parsed.error.message); return parsed; }
    const validated = template!.validate(parsed.value);
    if (!validated.ok) setError(validated.error.message);
    return validated;
  };
  const publishParts = (nextParts: readonly string[]) => {
    const parsed = nextParts.map(parsePart);
    if (parsed.some((result) => !result.ok)) return;
    setError(null);
    publish({ kind: "comparison", field: expression.field, operator, value: parsed.map((result) => result.ok ? result.value : undefined) as never, ...compatibleOptions(template, operator) });
  };
  return <>
    <NSEChoiceControl label="Field" labelHidden part="field" value={template?.id ?? ""} disabled={locked} options={templates.map(({ id, label }) => ({ id, label }))} onChange={(nextId) => {
        const nextTemplate = templates.find(({ id }) => id === nextId);
        if (!nextTemplate) return;
        const nextOperator = nextTemplate.operators[0]?.operator ?? "equals";
        setError(null); setText("");
        publish({ kind: "comparison", field: nextTemplate.field, operator: nextOperator, value: nextOperator === "between" ? ["", ""] : nextOperator === "in" ? [] : undefined, ...compatibleOptions(nextTemplate, nextOperator) });
      }} />
    <NSEChoiceControl label="Operator" labelHidden value={operator} disabled={locked} options={(template?.operators ?? []).map(({ operator: id, label }) => ({ id, label }))} onChange={(nextId) => {
        const nextOperator = normalisePredicateOperator(nextId);
        const nextOption = template?.operators.find((candidate) => candidate.operator === nextOperator);
        const previous = expression.value;
        const nextValue = nextOperator === "between" ? (Array.isArray(previous) ? [previous[0], previous[1] ?? previous[0]] : [previous, previous])
          : nextOperator === "in" ? (Array.isArray(previous) ? previous : [previous])
            : Array.isArray(previous) ? previous[0] : previous;
        publish(nextOption?.arity === 0 ? { kind: "comparison", field: expression.field, operator: nextOperator } : { kind: "comparison", field: expression.field, operator: nextOperator, value: nextValue as never, ...compatibleOptions(template, nextOperator) });
      }} />
    {operator === "between" ? <>
      <NSETextField className="nse-rule-value" aria-label="Lower value" value={parts[0] ?? ""} readOnly={readOnly} disabled={disabled} onChange={(event) => { const next = [event.target.value, parts[1] ?? ""]; setParts(next); if (next[1] !== "") publishParts(next); }} />
      <NSETextField className="nse-rule-value" aria-label="Upper value" value={parts[1] ?? ""} readOnly={readOnly} disabled={disabled} onChange={(event) => { const next = [parts[0] ?? "", event.target.value]; setParts(next); if (next[0] !== "") publishParts(next); }} />
    </> : operator === "in" ? <NSETextField className="nse-rule-value" aria-label="Values" value={parts.join(", ")} readOnly={readOnly} disabled={disabled} onChange={(event) => { const next = event.target.value.split(","); setParts(next); publishParts(next); }} />
      : option.arity > 0 && <NSETextField className="nse-rule-value" aria-label="Value" value={text} readOnly={readOnly} disabled={disabled} aria-invalid={error !== null} onChange={(event) => {
        const nextText = event.target.value; setText(nextText);
        const parsed = template!.formatter.parse(nextText, { locale });
        if (!parsed.ok) { setError(parsed.error.message); return; }
        const validated = template!.validate(parsed.value);
        if (!validated.ok) { setError(validated.error.message); return; }
        setError(null); publish({ kind: "comparison", field: expression.field, operator, value: validated.value as never, ...compatibleOptions(template, operator) });
      }} />}
    {error && <div role="alert" className="nse-rule-error">{error}</div>}
  </>;
}

export function NSEPredicateEditor<T>({ schema, templates: explicit, value, defaultValue, onChange, state, readOnly = false, disabled = false, locale = "en-GB", className = "", ...props }: NSEPredicateEditorProps<T>) {
  const templates = useMemo(() => mergePredicateTemplates(schema, explicit), [explicit, schema]);
  const fallback: PredicateExpression = defaultValue ?? { kind: "comparison", field: templates[0]?.field ?? "", operator: templates[0]?.operators[0]?.operator ?? "equals", value: undefined };
  const [internal, setInternal] = useState<PredicateExpression>(fallback);
  const expression = value ?? internal;
  const effectiveState = state ?? (disabled ? { kind: "disabled", message: "Disabled" } : readOnly ? { kind: "read-only", message: "Read only" } : { kind: "ready" });
  const effectiveReadOnly = readOnly || effectiveState.kind === "read-only";
  const effectiveDisabled = disabled || !dataViewAllowsNavigation(effectiveState);
  const presentsContent = dataViewPresentsContent(effectiveState);
  const hostDisabled = disabled || effectiveState.kind === "disabled" || effectiveState.kind === "invalid" || (effectiveState.kind === "denied" && !effectiveState.retry);
  const validatedRoot = ruleRowFromExpression(expression, "root");
  compilePredicateExpression({ root: validatedRoot });
  const publish = (next: PredicateExpression) => {
    if (value === undefined) setInternal(next);
    onChange?.(Object.freeze(next));
  };
  if (expression.kind !== "comparison") {
    const ruleValue = { root: validatedRoot };
    return (<div {...props} aria-disabled={hostDisabled || undefined} aria-busy={dataViewIsBusy(effectiveState) || undefined} className={`nse-predicate-editor ${className}`.trim()} data-nse-control="predicate-editor" data-expression-kind={expression.kind} data-state={effectiveState.kind}>
      {presentsContent && <NSERuleEditor aria-label="Predicate expression" value={ruleValue} fields={templates.map(({ field }) => field)} templates={templates as readonly NSEPredicateTemplate<unknown>[]} locale={locale} state={effectiveState} readOnly={effectiveReadOnly} disabled={effectiveDisabled} onChange={(next) => publish(compilePredicateExpression(next))} />}
      {!presentsContent && <span role="status">{"message" in effectiveState ? effectiveState.message : effectiveState.kind}</span>}
      {!presentsContent && (effectiveState.kind === "denied" || effectiveState.kind === "error") && effectiveState.retry && <NSEPushButton tone="light" onClick={effectiveState.retry}>Retry</NSEPushButton>}
      {!presentsContent && effectiveState.kind === "interrupted" && effectiveState.resume && <NSEPushButton tone="light" onClick={effectiveState.resume}>Resume</NSEPushButton>}
    </div>);
  }
  return (<div {...props} aria-disabled={hostDisabled || undefined} aria-busy={dataViewIsBusy(effectiveState) || undefined} className={`nse-predicate-editor ${className}`.trim()} data-nse-control="predicate-editor" data-expression-kind="comparison" data-state={effectiveState.kind}>
    {presentsContent && <NSEComparisonPredicateEditor expression={expression} templates={templates} publish={publish} readOnly={effectiveReadOnly} disabled={effectiveDisabled} locale={locale} />}
    {effectiveState.kind !== "ready" && <span role="status">{effectiveState.message}</span>}
    {(effectiveState.kind === "denied" || effectiveState.kind === "error") && effectiveState.retry && <NSEPushButton tone="light" onClick={effectiveState.retry}>Retry</NSEPushButton>}
    {effectiveState.kind === "interrupted" && effectiveState.resume && <NSEPushButton tone="light" onClick={effectiveState.resume}>Resume</NSEPushButton>}
  </div>);
}
