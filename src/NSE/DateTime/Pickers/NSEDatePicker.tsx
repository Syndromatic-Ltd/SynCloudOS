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

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { NSEPopover, useOptionalNSEOverlayProvider } from "../../Overlays";
import { clampPlainDate, comparePlainDates, daysInMonth } from "../calendarArithmetic";
import { formatPlainDate, parsePlainDate, plainDatePlaceholder, plainDateToday } from "../dateTimeFormatting";
import type { NSECalendarMonth, NSEPlainDate } from "../dateTimeTypes";
import { NSECalendarView } from "../Calendar";
import { NSEChoiceControl } from "../../Menus/NSEChoiceControl";
import { nseAppearanceSlot, useNSEAppearanceSlot } from "../../Appearance";
import type { NSEDatePickerEditorMode, NSEDatePickerField, NSEDatePickerProps } from "./datePickerTypes";

export const serializePlainDate = (value: NSEPlainDate | null) => value ? `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}` : "";
const range = (minimum: number, maximum: number) => {
  const values: number[] = [];
  for (let value = minimum; value <= maximum; value += 1) values.push(value);
  return values;
};

const datePartOrder = (locale: string): readonly NSEDatePickerField[] => {
  try {
    const parts = new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC", calendar: "gregory" })
      .formatToParts(Date.UTC(2026, 10, 22))
      .map((part) => part.type)
      .filter((part): part is NSEDatePickerField => part === "month" || part === "day" || part === "year");
    const unique = [...new Set(parts)];
    return unique.length === 3 ? unique : ["month", "day", "year"];
  } catch {
    return ["month", "day", "year"];
  }
};

interface NSEDateSegmentEditorProps {
  readonly value: NSEPlainDate | null;
  readonly fallback: NSEPlainDate;
  readonly minimum?: NSEPlainDate;
  readonly maximum?: NSEPlainDate;
  readonly locale: string;
  readonly hiddenFields: readonly NSEDatePickerField[];
  readonly label: string;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  onCommit(value: NSEPlainDate): void;
}

function NSEDateSegmentEditor({
  value,
  fallback,
  minimum,
  maximum,
  locale,
  hiddenFields,
  label,
  disabled,
  readOnly,
  onCommit,
}: NSEDateSegmentEditorProps) {
  const active = value ?? fallback;
  const parts = datePartOrder(locale);
  const hidden = new Set(hiddenFields);
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC", calendar: "gregory" });
  const minimumYear = minimum?.year ?? 1900;
  const maximumYear = maximum?.year ?? 2099;
  const yearValues = range(Math.min(minimumYear, active.year), Math.max(maximumYear, active.year));
  const editors: Record<NSEDatePickerField, ReactNode> = {
    month: <NSEChoiceControl key="month" className="nse-extended-inline-picker" label="Month" labelHidden value={String(active.month)} disabled={disabled || readOnly}
      options={range(1, 12).map((month) => ({ id: String(month), label: monthFormatter.format(Date.UTC(active.year, month - 1, 1)) }))}
      onChange={(next) => { const month = Number(next); onCommit({ ...active, month, day: Math.min(active.day, daysInMonth(active.year, month)) }); }} />,
    day: <NSEChoiceControl key="day" className="nse-extended-inline-picker" label="Day" labelHidden value={String(active.day)} disabled={disabled || readOnly}
      options={range(1, daysInMonth(active.year, active.month)).map((day) => ({ id: String(day), label: String(day) }))}
      onChange={(next) => onCommit({ ...active, day: Number(next) })} />,
    year: <NSEChoiceControl key="year" className="nse-extended-inline-picker" label="Year" labelHidden value={String(active.year)} disabled={disabled || readOnly}
      options={yearValues.map((year) => ({ id: String(year), label: String(year) }))}
      onChange={(next) => { const year = Number(next); onCommit({ ...active, year, day: Math.min(active.day, daysInMonth(year, active.month)) }); }} />,
  };

  return (
    <span role="group" aria-label={label} data-value={serializePlainDate(active)} data-locale-order={parts.join("-")} data-field-editor="segments">
      {parts.filter((part) => !hidden.has(part)).map((part) => editors[part])}
    </span>
  );
}

export function NSEDatePicker({
  value, defaultValue = null, mode = "automatic", parentResponderId, onValueChange,
  name, editor, hiddenFields, locale, timeZone, minimum, maximum, disabled, readOnly, required, renderEditor, normalizeValue,
  "aria-label": label, onFocusCapture, onBlurCapture, ...hostProps
}: NSEDatePickerProps) {
  const controlled = value !== undefined;
  const [stored, setStored] = useState<NSEPlainDate | null>(defaultValue);
  const current = controlled ? value : stored;
  const [draft, setDraft] = useState(current ? formatPlainDate(current, locale) : "");
  const [calendarDraft, setCalendarDraft] = useState<NSEPlainDate | null>(current);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const instanceId = useId().replace(/:/g, "");
  const overlay = useOptionalNSEOverlayProvider();
  if (mode === "automatic" && !overlay) throw new Error("Automatic date pickers require an NSEOverlayProvider.");
  useEffect(() => {
    if (!controlled) return;
    setDraft(current ? formatPlainDate(current, locale) : "");
    setCalendarDraft(current);
  }, [controlled, current, open, locale]);
  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form || controlled) return;
    const reset = () => {
      setStored(defaultValue);
      setDraft(defaultValue ? formatPlainDate(defaultValue, locale) : "");
      setCalendarDraft(defaultValue);
      setInvalid(false);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue, locale]);
  const apply = (next: NSEPlainDate | null, phase: "preview" | "commit") => { const normalized = next && normalizeValue ? normalizeValue(next, current) : next; if (!controlled) setStored(normalized); onValueChange?.(normalized, phase); };
  const commitText = () => {
    if (disabled || readOnly) return;
    if (!draft && !required) { setInvalid(false); apply(null, "commit"); return; }
    const parsed = parsePlainDate(draft, locale);
    if (!parsed.ok) { setInvalid(true); return; }
    const normalized = normalizeValue ? normalizeValue(parsed.value, current) : parsed.value;
    if ((minimum && comparePlainDates(normalized, minimum) < 0) || (maximum && comparePlainDates(normalized, maximum) > 0)) { setInvalid(true); return; }
    setInvalid(false); apply(normalized, "commit"); setDraft(formatPlainDate(normalized, locale));
  };
  const calendarValue = calendarDraft ?? current;
  // The calendar pages freely (header, PageUp/PageDown); it re-seeds to the
  // value's month when the value moves or the popover opens.
  const seedMonth = (): NSECalendarMonth => { const seed = calendarValue ?? minimum ?? plainDateToday(timeZone); return { year: seed.year, month: seed.month }; };
  const [visibleMonth, setVisibleMonth] = useState<NSECalendarMonth>(seedMonth);
  useEffect(() => { setVisibleMonth(seedMonth()); }, [calendarValue?.year, calendarValue?.month, open]);
  const closeCalendar = () => {
    setOpen(false);
    setCalendarDraft(current);
    queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  const commitCalendar = (date: NSEPlainDate) => {
    if (disabled || readOnly) return;
    const next = clampPlainDate(date, minimum, maximum);
    apply(next, "commit");
    setDraft(formatPlainDate(next, locale));
    setInvalid(false);
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  const calendar = <NSECalendarView aria-label={`${label} calendar`} locale={locale} timeZone={timeZone} visibleMonth={visibleMonth} onVisibleMonthChange={setVisibleMonth} selection={calendarValue ? { kind: "single", value: calendarValue } : { kind: "none" }} isDateDisabled={(date) => Boolean((minimum && comparePlainDates(date, minimum) < 0) || (maximum && comparePlainDates(date, maximum) > 0))} onSelectionChange={(selection) => {
    if (selection.kind !== "single" || disabled || readOnly) return;
    const next = clampPlainDate(selection.value, minimum, maximum);
    // Inline (graphical) calendars are live, as NSDatePicker's are. In the
    // popover, clicking a day, Enter on it, or Today commits and closes;
    // arrow keys only move the draft so the popover survives navigation.
    if (!open) { setCalendarDraft(next); commitEditor(next); return; }
    if (selection.reason === "pointer" || selection.reason === "today") commitCalendar(next);
    else setCalendarDraft(next);
  }} />;
  const commitEditor = (next: NSEPlainDate | null) => {
    if (disabled || readOnly) return;
    if (!next) { if (!required) apply(null, "commit"); return; }
    const normalized = clampPlainDate(next, minimum, maximum);
    apply(normalized, "commit");
    setDraft(formatPlainDate(normalized, locale));
    setInvalid(false);
  };
  const editorMode: NSEDatePickerEditorMode = editor ?? "text";
  const segmentEditor = editorMode === "segments" ? (
    <NSEDateSegmentEditor
      value={current}
      fallback={minimum ?? plainDateToday(timeZone)}
      minimum={minimum}
      maximum={maximum}
      locale={locale}
      hiddenFields={hiddenFields ?? []}
      label={label}
      disabled={Boolean(disabled)}
      readOnly={Boolean(readOnly)}
      onCommit={commitEditor}
    />
  ) : null;
  const showCalendar = mode === "calendar";
  const titleId = `date-picker-title-${instanceId}`;
  const appearanceState = invalid ? "invalid" : disabled ? "disabled" : focused || open ? "focused" : "normal";
  const appearance = useNSEAppearanceSlot(nseAppearanceSlot("date-picker", "select", appearanceState));
  return <span {...hostProps} data-nse-control="date-picker" data-state={invalid ? "invalid" : disabled ? "disabled" : readOnly ? "read-only" : open ? "open" : "ready"} {...appearance.attributes} onFocusCapture={(event) => { setFocused(true); onFocusCapture?.(event); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); onBlurCapture?.(event); }}>
    {mode === "automatic" ? <button ref={triggerRef} type="button" aria-label={`Choose ${label.toLocaleLowerCase()}`} aria-expanded={open} disabled={disabled || readOnly} onClick={() => { setCalendarDraft(current); setOpen(true); }}>▦</button> : null}
    {renderEditor ? renderEditor({ value: current, disabled: Boolean(disabled), readOnly: Boolean(readOnly), commit: commitEditor }) : segmentEditor ?? (!showCalendar ? <input data-nse-part="date-entry" aria-label={label} type="text" inputMode="numeric" placeholder={plainDatePlaceholder(locale)} value={draft} disabled={disabled} readOnly={readOnly} required={required} aria-invalid={invalid || undefined} onChange={(event) => { if (readOnly) return; setDraft(event.currentTarget.value); setInvalid(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitText(); } else if (event.key === "Escape") { if (invalid || draft !== (current ? formatPlainDate(current, locale) : "")) event.preventDefault(); setInvalid(false); setDraft(current ? formatPlainDate(current, locale) : ""); } }} onBlur={commitText} /> : null)}
    {showCalendar && !renderEditor ? calendar : null}
    {mode === "automatic" ? <NSEPopover id={`date-picker-${instanceId}`} open={open} anchor={triggerRef.current} parentWindowControllerId="date-picker-window" parentResponderId={parentResponderId} presentation={{ mode: "automatic" }} surface="overlay" labelledBy={titleId} onOpenChange={(next) => { if (!next) closeCalendar(); }}><section data-nse-part="calendar-sheet"><h2 id={titleId} className="nse-control-visually-hidden">{label} calendar</h2>{calendar}</section></NSEPopover> : null}
    <input ref={hiddenRef} type="hidden" {...(name ? { name: name } : {})} value={serializePlainDate(current)} />
    {invalid ? <span role="alert">Enter a valid date within the allowed range.</span> : null}
  </span>;
}
