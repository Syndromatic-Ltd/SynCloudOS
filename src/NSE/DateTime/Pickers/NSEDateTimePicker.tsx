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

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { NSEPopover, useOptionalNSEOverlayProvider } from "../../Overlays";
import { NSECalendarView, NSEClockView } from "../Calendar";
import { NSEChoiceControl } from "../../Menus/NSEChoiceControl";
import { civilToEpochDay, comparePlainDates, resolveZonedDateTime } from "../calendarArithmetic";
import { formatPlainDate, parsePlainDate, plainDateToday } from "../dateTimeFormatting";
import type { NSECalendarMonth, NSEPlainDate } from "../dateTimeTypes";
import type { NSEDateTimePickerMode, NSEDateTimePickerProps, NSEDateTimePickerValue } from "./datePickerTypes";
import { serializePlainDate } from "./NSEDatePicker";
import { serializePlainTime } from "./NSETimePicker";
import { createPickerTransaction, reducePickerTransaction } from "./pickerTransaction";
import { nseAppearanceSlot, useNSEAppearanceSlot } from "../../Appearance";
import { NSEPushButton } from "../../Controls/Buttons/NSEButtons";

const emptyValue = (timeZone: string): NSEDateTimePickerValue => ({
  date: plainDateToday(timeZone),
  time: { hour: 0, minute: 0, second: 0 },
  timeZone,
  disambiguation: "earlier",
});

const sameDateTime = (left: NSEDateTimePickerValue | null, right: NSEDateTimePickerValue | null) => left === right || Boolean(left && right
  && comparePlainDates(left.date, right.date) === 0
  && left.time.hour === right.time.hour
  && left.time.minute === right.time.minute
  && left.time.second === right.time.second
  && left.timeZone === right.timeZone
  && left.disambiguation === right.disambiguation);

const textForValue = (value: NSEDateTimePickerValue | null, locale: string) => value
  ? `${formatPlainDate(value.date, locale)} ${String(value.time.hour).padStart(2, "0")}:${String(value.time.minute).padStart(2, "0")}`
  : "";

/** The trigger's display: the locale's medium date and short time (no
 * seconds), in the picker's hour cycle, e.g. "28 Mar 2026, 12:30". */
const displayForValue = (value: NSEDateTimePickerValue, locale: string, hourCycle: "h12" | "h24") => new Intl.DateTimeFormat(locale, {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: hourCycle === "h12" ? "h12" : "h23",
  timeZone: "UTC",
  calendar: "gregory",
}).format(civilToEpochDay(value.date) * 86_400_000 + value.time.hour * 3_600_000 + value.time.minute * 60_000);

const parseTextValue = (text: string, locale: string, baseline: NSEDateTimePickerValue): NSEDateTimePickerValue | null => {
  const match = /^(.*\S)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const date = parsePlainDate(match[1], locale);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? 0);
  if (!date.ok || hour > 23 || minute > 59 || second > 59) return null;
  return { ...baseline, date: date.value, time: { hour, minute, second } };
};

export function NSEDateTimePicker({ value, defaultValue = null, mode = "combined", onValueChange, ...props }: NSEDateTimePickerProps) {
  const controlled = value !== undefined;
  const [stored, setStored] = useState(defaultValue);
  const current = controlled ? value : stored;
  const [transaction, dispatchTransaction] = useReducer(reducePickerTransaction<NSEDateTimePickerValue | null>, current, createPickerTransaction);
  const draft = transaction.draft;
  const open = transaction.open;
  const [textDraft, setTextDraft] = useState(() => textForValue(current, props.locale));
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastPublishedRef = useRef<NSEDateTimePickerValue | null | undefined>(undefined);
  const instanceId = useId().replace(/:/g, "");
  const overlay = useOptionalNSEOverlayProvider();
  if (mode === "automatic" && !overlay) throw new Error("Automatic date-time pickers require an NSEOverlayProvider.");
  const localeHourCycle = new Intl.DateTimeFormat(props.locale, { hour: "numeric" }).resolvedOptions().hourCycle;
  const hourCycle = props.hourCycle ?? (localeHourCycle === "h11" || localeHourCycle === "h12" ? "h12" : "h24");

  useEffect(() => {
    if (!controlled) return;
    if (lastPublishedRef.current !== undefined && sameDateTime(current, lastPublishedRef.current)) {
      lastPublishedRef.current = undefined;
      return;
    }
    dispatchTransaction({ type: "replace", value: current });
    setTextDraft(textForValue(current, props.locale));
    setError("");
  }, [controlled, current, props.locale]);

  useEffect(() => {
    const form = triggerRef.current?.form ?? triggerRef.current?.closest("form") ?? null;
    if (!form || controlled) return;
    const reset = () => {
      setStored(defaultValue);
      dispatchTransaction({ type: "replace", value: defaultValue });
      setTextDraft(textForValue(defaultValue, props.locale));
      setError("");
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue, props.locale]);

  const resolutionFor = (candidate: NSEDateTimePickerValue) => resolveZonedDateTime({ date: candidate.date, time: candidate.time }, candidate.timeZone, candidate.disambiguation);
  const validationError = (candidate: NSEDateTimePickerValue): string => {
    const resolution = resolutionFor(candidate);
    if (resolution.kind !== "resolved") return resolution.kind === "nonexistent" ? "This local time does not exist." : "This local time is ambiguous.";
    if ((props.minimum && resolution.value.epochMilliseconds < props.minimum.epochMilliseconds) || (props.maximum && resolution.value.epochMilliseconds > props.maximum.epochMilliseconds)) return "This appointment is outside the allowed range.";
    return "";
  };
  const outsideBounds = (candidate: NSEDateTimePickerValue): boolean => {
    const resolution = resolutionFor(candidate);
    return resolution.kind === "resolved" && Boolean((props.minimum && resolution.value.epochMilliseconds < props.minimum.epochMilliseconds) || (props.maximum && resolution.value.epochMilliseconds > props.maximum.epochMilliseconds));
  };
  const preview = (next: NSEDateTimePickerValue) => {
    if (props.disabled || props.readOnly || outsideBounds(next)) return;
    dispatchTransaction({ type: "preview", value: next });
    setTextDraft(textForValue(next, props.locale));
    setError("");
    lastPublishedRef.current = next;
    onValueChange?.(next, "preview");
  };
  const commit = (candidate = draft) => {
    if (!candidate || props.disabled || props.readOnly) return false;
    const nextError = validationError(candidate);
    if (nextError) { setError(nextError); return false; }
    setError("");
    dispatchTransaction({ type: "commit", value: candidate });
    setTextDraft(textForValue(candidate, props.locale));
    if (!controlled) setStored(candidate);
    lastPublishedRef.current = candidate;
    onValueChange?.(candidate, "commit");
    return true;
  };
  const clear = () => {
    if (props.disabled || props.readOnly || props.required) return false;
    setError("");
    dispatchTransaction({ type: "commit", value: null });
    setTextDraft("");
    if (!controlled) setStored(null);
    lastPublishedRef.current = null;
    onValueChange?.(null, "commit");
    return true;
  };
  const applyEditor = () => {
    if (showText) {
      if (!textDraft.trim()) return clear();
      const parsed = parseTextValue(textDraft, props.locale, editorValue);
      if (!parsed) { setError("Enter a valid date and time."); return false; }
      return commit(parsed);
    }
    return commit();
  };
  const cancel = () => {
    const baseline = transaction.hasOpening ? transaction.opening : transaction.draft;
    dispatchTransaction({ type: "cancel" });
    setTextDraft(textForValue(baseline, props.locale));
    setError("");
    if (transaction.previewed) {
      lastPublishedRef.current = baseline;
      onValueChange?.(baseline, "preview");
    }
    queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  const begin = () => {
    if (props.disabled || props.readOnly) return;
    const next = current ?? emptyValue(props.timeZone);
    dispatchTransaction({ type: "begin", value: current, draft: next });
    setTextDraft(textForValue(next, props.locale));
  };

  const editorValue = draft ?? emptyValue(props.timeZone);
  // Paging the calendar moves the view, never the chosen date.
  const [visibleMonth, setVisibleMonth] = useState<NSECalendarMonth>({ year: editorValue.date.year, month: editorValue.date.month });
  useEffect(() => { setVisibleMonth({ year: editorValue.date.year, month: editorValue.date.month }); }, [editorValue.date.year, editorValue.date.month, open]);
  const editorMode: Exclude<NSEDateTimePickerMode, "automatic"> = mode === "automatic" ? "combined" : mode;
  const showText = editorMode === "text";
  const showCalendar = editorMode === "calendar" || editorMode === "calendar-clock" || editorMode === "combined";
  const showClock = editorMode === "clock" || editorMode === "calendar-clock" || editorMode === "combined";
  const showZone = editorMode === "calendar-clock" || editorMode === "combined";
  const editor = <section data-testid="date-time-editor" data-nse-part="date-time-editor" data-editor-mode={editorMode}>
    {showText ? <input aria-label={`${props["aria-label"]} date and time`} type="text" value={textDraft} disabled={props.disabled} readOnly={props.readOnly} required={props.required} aria-invalid={Boolean(error) || undefined} onChange={(event) => { if (!props.readOnly) { setTextDraft(event.currentTarget.value); setError(""); } }} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const parsed = parseTextValue(textDraft, props.locale, editorValue);
      if (!parsed) { setError("Enter a valid date and time."); return; }
      commit(parsed);
    }} /> : null}
    {showCalendar ? <NSECalendarView
      aria-label={`${props["aria-label"]} calendar`}
      locale={props.locale}
      timeZone={editorValue.timeZone}
      visibleMonth={visibleMonth}
      selection={{ kind: "single", value: editorValue.date }}
      isDateDisabled={(date: NSEPlainDate) => outsideBounds({ ...editorValue, date })}
      onVisibleMonthChange={setVisibleMonth}
      onSelectionChange={(selection) => { if (selection.kind === "single") preview({ ...editorValue, date: selection.value }); }}
    /> : null}
    {showClock ? <NSEClockView aria-label={props["aria-label"]} locale={props.locale} timeZone={editorValue.timeZone} date={editorValue.date} value={editorValue.time} disambiguation={editorValue.disambiguation} disabled={props.disabled || props.readOnly} showValidationMessage={false} hourCycle={hourCycle} onValueChange={(time) => preview({ ...editorValue, time })} /> : null}
    {showZone ? <>
      <NSEChoiceControl label="Time zone" accessibleLabel={`${props["aria-label"]} time zone`} value={editorValue.timeZone} disabled={props.disabled || props.readOnly} options={[{ id: props.timeZone, label: props.timeZone }, ...(props.timeZone !== "UTC" ? [{ id: "UTC", label: "UTC" }] : [])]} onChange={(timeZone) => preview({ ...editorValue, timeZone })} />
      <NSEChoiceControl label="Disambiguation" accessibleLabel={`${props["aria-label"]} disambiguation`} value={editorValue.disambiguation} disabled={props.disabled || props.readOnly} options={[{ id: "earlier", label: "Earlier" }, { id: "later", label: "Later" }, { id: "reject", label: "Reject" }]} onChange={(disambiguation) => preview({ ...editorValue, disambiguation: disambiguation as NSEDateTimePickerValue["disambiguation"] })} />
    </> : null}
    <div data-nse-part="actions">
      <NSEPushButton ref={mode === "automatic" ? undefined : triggerRef} tone="affirmative" aria-label={`Apply ${props["aria-label"].toLowerCase()}`} disabled={props.disabled || props.readOnly || (props.required && !draft)} onClick={() => { if (applyEditor()) queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true })); }}>Apply</NSEPushButton>
      <NSEPushButton tone="light" aria-label={`Clear ${props["aria-label"].toLowerCase()}`} disabled={props.disabled || props.readOnly || props.required} onClick={clear}>Clear</NSEPushButton>
      <NSEPushButton tone="light" aria-label={`Cancel ${props["aria-label"].toLowerCase()}`} disabled={props.disabled} onClick={cancel}>Cancel</NSEPushButton>
    </div>
    {error ? <span role="alert">{error}</span> : null}
  </section>;

  const titleId = `date-time-picker-title-${instanceId}`;
  const valueId = `date-time-picker-value-${instanceId}`;
  const appearanceState = error ? "invalid" : props.disabled ? "disabled" : focused || open ? "focused" : "normal";
  const appearance = useNSEAppearanceSlot(nseAppearanceSlot("date-time-picker", "select", appearanceState));
  return <span data-nse-control="date-time-picker" data-state={error ? "invalid" : props.disabled ? "disabled" : props.readOnly ? "read-only" : current ? "ready" : "empty"} {...appearance.attributes} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    {mode === "automatic" ? <><button ref={triggerRef} type="button" aria-label={props["aria-label"]} aria-describedby={current ? valueId : undefined} aria-expanded={open} disabled={props.disabled || props.readOnly} onClick={begin}><span id={valueId} data-nse-part="value">{current ? displayForValue(current, props.locale, hourCycle) : props["aria-label"]}</span></button><NSEPopover id={`date-time-picker-${instanceId}`} open={open} anchor={triggerRef.current} parentWindowControllerId="date-time-picker-window" presentation={{ mode: "automatic" }} surface="overlay" labelledBy={titleId} onOpenChange={(next) => { if (!next && open) cancel(); }}><section data-nse-part="calendar-sheet"><h2 id={titleId}>{props["aria-label"]}</h2>{editor}</section></NSEPopover></> : editor}
    {props.name ? <><input type="hidden" name={props.name} value={`${serializePlainDate(current?.date ?? null)}${current ? `T${serializePlainTime(current.time)}` : ""}`} /><input type="hidden" name={`${props.name}.timeZone`} value={current?.timeZone ?? ""} /><input type="hidden" name={`${props.name}.disambiguation`} value={current?.disambiguation ?? ""} /></> : null}
  </span>;
}
