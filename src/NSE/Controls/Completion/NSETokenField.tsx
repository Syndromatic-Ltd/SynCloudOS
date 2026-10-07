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

import { useEffect, useId, useRef, useState } from "react";
import { NSEListboxPopup, useOptionalNSEOverlayProvider } from "../../Overlays";
import { readNSEClipboardText, writeNSEClipboardText, writeNSEDragRepresentations } from "../../Drag";
import type { NSETokenFieldProps, NSETokenValue } from "./completionTypes";

export function NSETokenField<T, TId extends string | number>(props: NSETokenFieldProps<T, TId>) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(-1);
  const [suggestions, setSuggestions] = useState<readonly NSETokenValue<TId, T>[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [menuTokenId, setMenuTokenId] = useState<TId | null>(null);
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const inputRef = useRef<HTMLInputElement>(null);
  const disclosureRefs = useRef(new Map<string, HTMLButtonElement>());
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const composing = useRef(false);
  const overlay = useOptionalNSEOverlayProvider();
  const instanceId = useId().replace(/:/g, "");
  if ((props.dataSource || props.tokenMenu) && !overlay) throw new Error("Token completion and menus require an NSEOverlayProvider.");
  const popupId = props.id ?? `token-completion-${instanceId}`;
  const separators = props.separators?.length ? props.separators : [",", ";", "\n"];
  const cancelQuery = () => { generation.current += 1; request.current?.abort(); request.current = null; setActiveSuggestion(-1); };
  useEffect(() => () => cancelQuery(), []);
  useEffect(() => { cancelQuery(); setSuggestions([]); }, [props.dataSource, props.disabled, props.readOnly]);
  const append = (tokens: readonly NSETokenValue<TId, T>[], reason: "paste" | "create") => {
    if (props.disabled || props.readOnly) return;
    const existing = new Set(props.values.map((value) => String(value.id)));
    const additions = tokens.filter((token) => token.label && !existing.has(String(token.id)) && (existing.add(String(token.id)), true));
    if (additions.length) props.onValuesChange([...props.values, ...additions], reason);
  };
  const addLabels = (labels: readonly string[], reason: "paste" | "create") => append(labels.map((label) => props.createToken(label.trim())), reason);
  const split = (text: string) => { let values = [text]; for (const separator of separators) values = values.flatMap((value) => value.split(separator)); return values; };
  const query = (text: string) => {
    cancelQuery();
    if (!props.dataSource || !text || props.disabled || props.readOnly || composing.current) { setSuggestions([]); return; }
    const abort = new AbortController(); request.current = abort; const current = generation.current;
    let result: Promise<readonly NSETokenValue<TId, T>[]>;
    try { result = Promise.resolve(props.dataSource.query(text, abort.signal)); }
    catch { setSuggestions([]); return; }
    void result.then((items) => { if (!abort.signal.aborted && current === generation.current) { setSuggestions(Object.freeze([...items])); setActiveSuggestion(-1); } }, () => { if (!abort.signal.aborted && current === generation.current) setSuggestions([]); });
  };
  const reorder = (index: number, direction: -1 | 1) => {
    if (props.disabled || props.readOnly) return;
    const target = index + direction;
    if (target < 0 || target >= props.values.length) return;
    const next = [...props.values], [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    props.onRequestReorder?.(moved.id, next[target + 1]?.id ?? null);
    props.onValuesChange(Object.freeze(next), "reorder");
    queueMicrotask(() => refs.current.get(target)?.focus({ preventScroll: true }));
  };
  const menuToken = menuTokenId === null ? null : props.values.find((token) => token.id === menuTokenId) ?? null;
  const menuItems = menuToken && props.tokenMenu ? props.tokenMenu(menuToken) : [];
  const beginEditing = (token: NSETokenValue<TId, T>) => {
    if (props.disabled || props.readOnly) return;
    setDraft(token.label);
    props.onValuesChange(props.values.filter((item) => item.id !== token.id), "edit");
    queueMicrotask(() => inputRef.current?.focus({ preventScroll: true }));
  };
  const inputId = `${popupId}-input`;
  const activeItem = activeSuggestion >= 0 ? suggestions[activeSuggestion] : undefined;
  const activeOptionId = activeItem && props.dataSource ? `${popupId}-option-${props.dataSource.idForItem(activeItem)}` : undefined;
  const acceptSuggestion = (item: NSETokenValue<TId, T>) => { append([item], "create"); setDraft(""); cancelQuery(); setSuggestions([]); inputRef.current?.focus({ preventScroll: true }); };
  return <div data-nse-control="token-field" data-state={props.disabled ? "disabled" : props.readOnly ? "read-only" : menuToken ? "menu" : suggestions.length ? "completing" : "ready"} data-appearance-recipe="token-field">{props.values.map((token, index) => <span key={String(token.id)} data-nse-part="token"><button data-nse-part="token-label" type="button" ref={(node) => { if (node) refs.current.set(index, node); else refs.current.delete(index); }} tabIndex={focused === index ? 0 : -1} aria-label={`${token.label}, token`} disabled={props.disabled} aria-readonly={props.readOnly || undefined} draggable={!props.disabled && !props.readOnly} onCopy={(event) => { writeNSEClipboardText(event, token.label); event.preventDefault(); }} onCut={(event) => { if (props.disabled || props.readOnly) return; writeNSEClipboardText(event, token.label); event.preventDefault(); props.onValuesChange(props.values.filter((item) => item.id !== token.id), "delete"); }} onDragStart={(event) => { if (props.disabled || props.readOnly) { event.preventDefault(); return; } writeNSEDragRepresentations(event, [{ type: "text/plain", value: token.label }, { type: "application/x-syncloudos-token", value: { id: String(token.id), label: token.label } }]); }} onFocus={() => setFocused(index)} onDoubleClick={() => beginEditing(token)} onKeyDown={(event) => { if (event.key === "Enter" && !props.readOnly) { event.preventDefault(); beginEditing(token); } else if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowLeft")) { event.preventDefault(); reorder(index, event.key === "ArrowRight" ? 1 : -1); } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") { const next = Math.max(0, Math.min(props.values.length - 1, index + (event.key === "ArrowRight" ? 1 : -1))); refs.current.get(next)?.focus(); } else if (!props.readOnly && (event.key === "Delete" || event.key === "Backspace")) props.onValuesChange(props.values.filter((item) => item.id !== token.id), "delete"); }}>{token.label}</button>{props.tokenMenu?.(token).length ? <button data-nse-part="token-disclosure" ref={(node) => { if (node) disclosureRefs.current.set(String(token.id), node); else disclosureRefs.current.delete(String(token.id)); }} type="button" aria-label={`More options for ${token.label}`} aria-expanded={menuTokenId === token.id} disabled={props.disabled || props.readOnly} onClick={() => setMenuTokenId((current) => current === token.id ? null : token.id)}>▾</button> : null}</span>)}<input ref={inputRef} id={inputId} role="combobox" aria-label={props["aria-label"]} aria-expanded={suggestions.length > 0} aria-controls={suggestions.length ? popupId : undefined} aria-activedescendant={activeOptionId} value={draft} disabled={props.disabled} readOnly={props.readOnly} onCompositionStart={() => { composing.current = true; cancelQuery(); }} onCompositionEnd={(event) => { composing.current = false; setDraft(event.currentTarget.value); query(event.currentTarget.value); }} onChange={(event) => { if (props.disabled || props.readOnly) return; setDraft(event.currentTarget.value); if (!composing.current) query(event.currentTarget.value); }} onKeyDown={(event) => { if (props.disabled || props.readOnly || composing.current || event.nativeEvent.isComposing) return; if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setActiveSuggestion((value) => Math.min(suggestions.length - 1, value + 1)); } else if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setActiveSuggestion((value) => Math.max(0, value - 1)); } else if (event.key === "Enter" && activeItem) { event.preventDefault(); acceptSuggestion(activeItem); } else if ((event.key === "Enter" || separators.includes(event.key)) && draft.trim()) { event.preventDefault(); addLabels([draft], "create"); setDraft(""); cancelQuery(); setSuggestions([]); } else if (event.key === "Escape") { cancelQuery(); setSuggestions([]); setMenuTokenId(null); } else if (event.key === "Backspace" && !draft && props.values.length) props.onValuesChange(props.values.slice(0, -1), "delete"); }} onPaste={(event) => { if (props.disabled || props.readOnly) return; event.preventDefault(); addLabels(split(readNSEClipboardText(event)), "paste"); }} />{props.name ? <input type="hidden" name={props.name} value={props.values.map((item) => item.id).join(",")} /> : null}{props.dataSource && overlay ? <NSEListboxPopup id={popupId} open={suggestions.length > 0} anchor={inputRef.current} parentResponderId={props.parentResponderId} labelledBy={inputId} options={suggestions.map((item) => ({ id: props.dataSource!.idForItem(item), label: props.dataSource!.labelForItem(item), value: item }))} selectedId={activeItem ? props.dataSource.idForItem(activeItem) : null} onOpenChange={(open) => { if (!open) { setSuggestions([]); setActiveSuggestion(-1); } }} onSelect={(option) => { if (option.value) acceptSuggestion(option.value); }} /> : null}{menuToken && menuItems.length ? <NSEListboxPopup id={`token-menu-${instanceId}`} open anchor={disclosureRefs.current.get(String(menuToken.id)) ?? null} parentResponderId={props.parentResponderId} options={menuItems.map((item) => ({ id: item.id, label: item.label, value: item.id, disabled: item.disabled }))} onOpenChange={(open) => { if (!open) setMenuTokenId(null); }} onSelect={(option) => { if (option.value && !props.disabled && !props.readOnly) props.onTokenMenuAction?.(menuToken.id, option.value); }} /> : null}</div>;
}
