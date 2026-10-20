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

import { useId, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import { NSEListboxPopup, useOptionalNSEOverlayProvider } from "../../Overlays";
import { useNSEControlCommand } from "../Core";
import { useNSEActionBinding } from "../Core/useNSEControlAction";
import type { NSESegmentedControlProps, NSESegmentedItem, NSESegmentedSelection } from "./valueControlTypes";

interface SegmentButtonProps {
  readonly item: NSESegmentedItem;
  readonly selected: boolean;
  readonly tabIndex: number;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly refs: MutableRefObject<Map<string, HTMLButtonElement>>;
  onActivate(): void;
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void;
}

function SegmentButton({ item, selected, tabIndex, disabled, readOnly, refs, onActivate, onKeyDown }: SegmentButtonProps) {
  const actionBinding = useNSEActionBinding(item.action, item.actionPayload);
  const binding = useMemo(() => item.commandId ? { id: item.commandId, payload: item.commandPayload } : actionBinding, [actionBinding, item.commandId, item.commandPayload]);
  const command = useNSEControlCommand(binding);
  const commandEnabled = !binding || Boolean(command.presentation?.enabled && !command.presentation.denied && !command.presentation.hidden && !command.presentation.stale);
  const activate = () => {
    if (disabled || readOnly) return;
    if (!binding) { onActivate(); return; }
    void command.dispatch().then((result) => { if (result?.status === "executed") onActivate(); });
  };
  return <button type="button" ref={(node) => { if (node) refs.current.set(item.id, node); else refs.current.delete(item.id); }} tabIndex={tabIndex} aria-label={item.accessibleLabel ?? (typeof item.label === "string" ? item.label : item.id)} title={typeof item.label === "string" ? undefined : item.accessibleLabel} aria-pressed={selected} aria-readonly={readOnly || undefined} disabled={disabled || item.disabled || !commandEnabled} data-command-id={binding?.id} onKeyDown={onKeyDown} onClick={activate}>{item.label}</button>;
}

export function NSESegmentedControl(props: NSESegmentedControlProps) {
  const instanceId = useId().replace(/:/g, "");
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const menuRefs = useRef(new Map<string, HTMLButtonElement>());
  const overflowRef = useRef<HTMLButtonElement>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overlay = useOptionalNSEOverlayProvider();
  const selected = props.items.find((item) => props.selection.selectedIds.has(item.id) && !item.disabled)?.id ?? props.items.find((item) => !item.disabled)?.id;
  const maximumVisible = Math.max(1, Math.floor(props.maximumVisibleSegments ?? props.items.length));
  const initialVisible = props.items.slice(0, maximumVisible);
  const selectedItem = props.items.find((item) => item.id === selected);
  const visible = selectedItem && !initialVisible.some((item) => item.id === selectedItem.id) ? [...initialVisible.slice(0, -1), selectedItem] : initialVisible;
  const visibleIds = new Set(visible.map((item) => item.id));
  const overflow = props.items.filter((item) => !visibleIds.has(item.id));
  const hasMenus = props.items.some((item) => item.menu?.length);
  if ((hasMenus || overflow.length) && !overlay) throw new Error("Segment menus and overflow require an NSEOverlayProvider.");

  const select = (id: string) => {
    if (props.disabled || props.readOnly) return;
    const item = props.items.find((candidate) => candidate.id === id);
    if (!item || item.disabled) return;
    const ids = new Set(props.selection.selectedIds);
    // A momentary segment acts and springs back (NSSegmentedControl sets
    // selectedSegment for its action): the change names the segment pressed,
    // and the host goes on passing an empty selection.
    if (props.selection.mode === "momentary") { ids.clear(); ids.add(id); }
    else if (props.selection.mode === "select-one") { if (ids.has(id) && props.selection.allowsEmpty) ids.clear(); else { ids.clear(); ids.add(id); } }
    else if (ids.has(id)) ids.delete(id); else ids.add(id);
    props.onSelectionChange({ ...props.selection, selectedIds: ids } as NSESegmentedSelection);
  };
  const move = (id: string, direction: 1 | -1) => {
    const enabled = props.items.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.id === id);
    const next = enabled[(index + direction + enabled.length) % enabled.length];
    if (next) refs.current.get(next.id)?.focus();
  };
  const activeMenu = menuId ? props.items.find((item) => item.id === menuId) : null;

  return <div role="group" aria-label={props["aria-label"]} data-nse-control="segmented-control" data-state={props.disabled ? "disabled" : props.readOnly ? "read-only" : overflow.length ? "overflow" : "ready"} data-appearance-recipe="segmented-control" data-distribution={props.distribution === "fill-equally" ? "fill-equally" : undefined} data-size={props.height !== undefined ? "custom" : props.controlSize === "small" ? "small" : undefined} style={props.height !== undefined ? { ["--nse-control-height" as string]: `${props.height}px` } : undefined}>
    {visible.map((item) => <span key={item.id} data-nse-part="segment">
      <SegmentButton item={item} selected={props.selection.selectedIds.has(item.id)} tabIndex={item.id === selected ? 0 : -1} disabled={Boolean(props.disabled)} readOnly={Boolean(props.readOnly)} refs={refs} onActivate={() => select(item.id)} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(item.id, 1); } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(item.id, -1); } }} />
      {item.menu?.length ? <button ref={(node) => { if (node) menuRefs.current.set(item.id, node); else menuRefs.current.delete(item.id); }} type="button" aria-label={`More options for ${typeof item.label === "string" ? item.label : item.id}`} aria-expanded={menuId === item.id} disabled={props.disabled || props.readOnly || item.disabled} onClick={() => setMenuId((current) => current === item.id ? null : item.id)}>▾</button> : null}
    </span>)}
    {overflow.length ? <button ref={overflowRef} type="button" aria-label={`More ${props["aria-label"]}`} aria-expanded={overflowOpen} disabled={props.disabled || props.readOnly} onClick={() => setOverflowOpen((open) => !open)}>…</button> : null}
    {activeMenu?.menu?.length ? <NSEListboxPopup id={`segment-menu-${instanceId}-${activeMenu.id}`} open anchor={menuRefs.current.get(activeMenu.id) ?? null} parentResponderId={props.parentResponderId} options={activeMenu.menu.map((item) => ({ id: item.id, label: item.label, value: item.id, disabled: item.disabled }))} onOpenChange={(open) => { if (!open) setMenuId(null); }} onSelect={(option) => { if (option.value && !props.readOnly && !props.disabled) props.onMenuAction?.(activeMenu.id, option.value); }} /> : null}
    {overflow.length ? <NSEListboxPopup id={`segment-overflow-${instanceId}`} open={overflowOpen} anchor={overflowRef.current} parentResponderId={props.parentResponderId} options={overflow.map((item) => ({ id: item.id, label: item.label, value: item.id, disabled: item.disabled }))} selectedId={selected} onOpenChange={setOverflowOpen} onSelect={(option) => { if (option.value) select(option.value); }} /> : null}
    {props.name ? <input type="hidden" name={props.name} value={[...props.selection.selectedIds].join(",")} /> : null}
  </div>;
}
