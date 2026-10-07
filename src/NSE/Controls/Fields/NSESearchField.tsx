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

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { NSEListboxPopup, useOptionalNSEOverlayProvider } from "../../Overlays";
import { useNSEControlCommand, useOptionalNSEControlRuntimePort, type NSEControlCommandBinding } from "../Core";
import { sizedControlStyle } from "../Core/nseControlsShared";
import type { NSESearchFieldController, NSESearchFieldSnapshot } from "./NSESearchFieldController";

const emptySnapshot: NSESearchFieldSnapshot = Object.freeze({ revision: 0, recents: Object.freeze([]) });
const emptySubscribe = () => () => undefined;
const getEmptySnapshot = () => emptySnapshot;

export interface NSESearchFieldProps {
  readonly "aria-label"?: string;
  readonly value?: string;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly name?: string;
  readonly id?: string;
  readonly className?: string;
  /** Italic prompt shown while the field is empty. Defaults to "search something…"; pass "" for none. */
  readonly placeholder?: string;
  readonly label?: ReactNode;
  readonly clearLabel?: string;
  /** The accessible name used when the field has no label or aria-label. */
  readonly searchLabel?: string;
  /** Hide the trailing clear button for fully incremental search surfaces. */
  readonly showsAffordance?: boolean;
  /** Show a magnifying-glass glyph before the text. Off by default. */
  readonly showsSearchIcon?: boolean;
  readonly controller?: NSESearchFieldController;
  readonly privateMode?: boolean;
  /** "small" is the size inspectors and panels use (26px). */
  readonly controlSize?: "regular" | "small";
  /** An explicit height in CSS pixels; the capsule keeps its proportions. */
  readonly height?: number;
  /** An explicit width (CSS pixels, or any CSS length). */
  readonly width?: number | string;
  readonly parentResponderId?: string;
  readonly debounceMs?: number;
  readonly command?: NSEControlCommandBinding<{ readonly query: string }>;
  onValueChange?(value: string): void;
  onSearch?(value: string): void;
  onQuery?(value: string, signal: AbortSignal): void | Promise<void>;
  onCancel?(): void;
  onClear?(): void;
  onInput?(event: FormEvent<HTMLInputElement>): void;
  onChange?(event: ChangeEvent<HTMLInputElement>): void;
}

export function NSESearchField(props: NSESearchFieldProps) {
  const controlled = props.value !== undefined;
  const [stored, setStored] = useState(props.defaultValue ?? "");
  const current = controlled ? props.value! : stored;
  const showsAffordance = props.showsAffordance ?? true;
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ readonly abort: AbortController; readonly handle: unknown | null } | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const instanceId = useId().replace(/:/g, "");
  const overlay = useOptionalNSEOverlayProvider();
  const runtime = useOptionalNSEControlRuntimePort();
  const snapshot = useSyncExternalStore(props.controller?.subscribe ?? emptySubscribe, props.controller?.getSnapshot ?? getEmptySnapshot, props.controller?.getSnapshot ?? getEmptySnapshot);
  const commandBinding = useMemo(() => props.command ? { ...props.command, payload: { query: current } } : undefined, [current, props.command]);
  const command = useNSEControlCommand(commandBinding);
  const cancelPending = () => {
    const work = pending.current;
    if (!work) return;
    work.abort.abort();
    if (work.handle !== null) runtime?.scheduler?.clearTimeout(work.handle);
    pending.current = null;
  };
  useEffect(() => () => cancelPending(), [runtime]);
  const query = (value: string) => {
    cancelPending();
    if (!props.onQuery || props.disabled || props.readOnly) return;
    const abort = new AbortController();
    const execute = () => { if (!abort.signal.aborted) void Promise.resolve(props.onQuery?.(value, abort.signal)).catch(() => undefined); };
    const delay = Math.max(0, props.debounceMs ?? 0);
    const handle = delay > 0 && runtime?.scheduler ? runtime.scheduler.setTimeout(execute, delay) : null;
    pending.current = { abort, handle };
    if (handle === null) execute();
  };
  const set = (value: string) => { if (!controlled) setStored(value); props.onValueChange?.(value); query(value); setRecentOpen(Boolean(!value && snapshot.recents.length)); };
  const rememberAndNotify = (value: string) => { props.controller?.rememberQuery(value, { privateMode: props.privateMode }); props.onSearch?.(value); setRecentOpen(false); };
  const submit = async (value = current) => {
    if (props.disabled || props.readOnly || composing.current) return;
    cancelPending();
    if (props.command) {
      const result = await command.dispatch({ query: value });
      if (result?.status !== "executed") return;
    }
    rememberAndNotify(value);
  };
  const clear = () => { if (props.disabled || props.readOnly) return; cancelPending(); if (!controlled) setStored(""); props.onValueChange?.(""); props.onClear?.(); props.onCancel?.(); setRecentOpen(snapshot.recents.length > 0); inputRef.current?.focus({ preventScroll: true }); };
  const accessibleName = props["aria-label"] ?? (typeof props.label === "string" ? props.label : props.placeholder ?? props.searchLabel ?? "Search");
  const popupId = `search-recents-${instanceId}`;
  return <label className={["nse-control-search-field", props.className].filter(Boolean).join(" ")} data-nse-control="search-field" data-size={props.height !== undefined ? "custom" : props.controlSize === "small" ? "small" : undefined} style={sizedControlStyle(undefined, props.height, props.width)} data-state={props.disabled ? "disabled" : props.readOnly ? "read-only" : current ? "populated" : "empty"}>{props.label ? <span className="nse-control-field-label">{props.label}</span> : null}<span className="nse-control-search-frame" data-affordance={showsAffordance ? "visible" : "hidden"} data-search-icon={props.showsSearchIcon ? "visible" : undefined}>{props.showsSearchIcon ? <span className="nse-control-search-icon" aria-hidden="true" /> : null}<input ref={inputRef} id={props.id ?? `search-input-${instanceId}`} type="search" aria-label={accessibleName} aria-controls={recentOpen && overlay ? popupId : undefined} aria-expanded={recentOpen && Boolean(overlay)} name={props.name} placeholder={props.placeholder ?? "search something…"} value={current} disabled={props.disabled} readOnly={props.readOnly} onFocus={() => setRecentOpen(Boolean(!current && snapshot.recents.length && overlay))} onCompositionStart={() => { composing.current = true; cancelPending(); }} onCompositionEnd={(event) => { composing.current = false; set(event.currentTarget.value); }} onInput={props.onInput} onChange={(event) => { props.onChange?.(event); if (!composing.current) set(event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !composing.current) { event.preventDefault(); void submit(); } else if (event.key === "Escape") { if (current) clear(); else setRecentOpen(false); } }} />{showsAffordance && current ? <button className="nse-control-search-affordance" type="button" data-state="clear" aria-label={props.clearLabel ?? "Clear search"} disabled={props.disabled || props.readOnly} onClick={clear}>×</button> : null}</span>{overlay && props.controller ? <NSEListboxPopup id={popupId} open={recentOpen && snapshot.recents.length > 0} anchor={inputRef.current} parentResponderId={props.parentResponderId} labelledBy={props.id ?? `search-input-${instanceId}`} options={snapshot.recents.map((recent) => ({ id: recent.id, label: recent.query, value: recent }))} onOpenChange={setRecentOpen} onSelect={(option) => { const recent = option.value; if (!recent) return; if (!controlled) setStored(recent.query); props.onValueChange?.(recent.query); void submit(recent.query); }} /> : null}</label>;
}
