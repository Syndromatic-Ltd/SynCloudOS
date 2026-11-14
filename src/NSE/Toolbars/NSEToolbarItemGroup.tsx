/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { NSEObject } from "../Objects/NSEObject";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import { ToolButtonGroup } from "../Controls/Buttons/NSEButtonFamilies";
import { useNSEActionBinding } from "../Controls/Core/useNSEControlAction";
import { useNSEControlCommand } from "../Controls/Core/useNSEControlCommand";
import { NSEPopUpButton } from "../Menus/NSEPopUpButton";
import { useNSEMenuOverlayPresentationScope } from "../Menus/menuPresentationContext";
import type { NSEToolbarItemInput } from "./toolbarTypes";

/** NSToolbarItemGroup.SelectionMode. */
export type NSEToolbarItemGroupSelectionMode = "selectOne" | "selectAny" | "momentary";
/** NSToolbarItemGroup.ControlRepresentation. */
export type NSEToolbarItemGroupControlRepresentation = "automatic" | "expanded" | "collapsed";
export type NSEToolbarGroupSubitem = Extract<NSEToolbarItemInput, { readonly kind: "command" }>;

export interface NSEToolbarItemGroupOptions {
  readonly identifier: string;
  readonly label: string;
  readonly subitems: readonly NSEToolbarGroupSubitem[];
  readonly selectionMode?: NSEToolbarItemGroupSelectionMode;
  readonly controlRepresentation?: NSEToolbarItemGroupControlRepresentation;
  /** Stable geometry for the toolbar's custom-item allocation. */
  readonly minimumWidth?: number;
  readonly idealWidth?: number;
}

function validateSubitems(items: readonly NSEToolbarGroupSubitem[]): readonly NSEToolbarGroupSubitem[] {
  const ids = new Set<string>();
  return Object.freeze(items.map(item => {
    if (item.kind !== "command" || !item.id?.trim() || !item.label?.trim() || ids.has(item.id)) {
      throw new TypeError("Toolbar group subitems need unique identifiers, labels and command or action definitions.");
    }
    if ("action" in item ? item.action == null || (typeof item.action === "string" && !item.action.trim()) : !item.commandId?.trim()) {
      throw new TypeError("A toolbar group subitem needs a command or action.");
    }
    ids.add(item.id);
    return Object.freeze({ ...item });
  }));
}

/** NSToolbarItemGroup: selectable command subitems using the toolbar's existing custom-view contract. */
export class NSEToolbarItemGroup extends NSEObject {
  readonly kind = "custom" as const;
  readonly id: string;
  readonly label: string;
  readonly minimumWidth: number;
  readonly idealWidth: number;
  readonly showsLabel = false;
  #subitems: readonly NSEToolbarGroupSubitem[];
  #selectionMode: NSEToolbarItemGroupSelectionMode;
  #controlRepresentation: NSEToolbarItemGroupControlRepresentation;
  #selected = new Set<string>();
  #lastSelected: string | null = null;

  constructor(options: NSEToolbarItemGroupOptions) {
    super();
    if (!options.identifier.trim() || !options.label.trim()) throw new TypeError("A toolbar group needs an identifier and label.");
    this.id = options.identifier;
    this.label = options.label;
    this.#subitems = validateSubitems(options.subitems);
    this.minimumWidth = options.minimumWidth ?? 36;
    this.idealWidth = options.idealWidth ?? Math.max(this.minimumWidth, this.#subitems.reduce((width, item) => width + (item.idealWidth ?? item.minimumWidth ?? 36), 0));
    if (!Number.isFinite(this.minimumWidth) || this.minimumWidth < 0 || !Number.isFinite(this.idealWidth) || this.idealWidth < this.minimumWidth) {
      throw new RangeError("Toolbar group widths must be finite, nonnegative and ordered minimum to ideal.");
    }
    this.#selectionMode = "selectOne";
    this.#controlRepresentation = "automatic";
    this.selectionMode = options.selectionMode ?? "selectOne";
    this.controlRepresentation = options.controlRepresentation ?? "automatic";
  }

  get subitems(): readonly NSEToolbarGroupSubitem[] { return this.#subitems; }
  set subitems(items: readonly NSEToolbarGroupSubitem[]) {
    this.#subitems = validateSubitems(items);
    const ids = new Set(this.#subitems.map(item => item.id));
    this.#selected = new Set([...this.#selected].filter(id => ids.has(id)));
    if (this.#lastSelected !== null && !ids.has(this.#lastSelected)) this.#lastSelected = null;
    this.notifyObservers();
  }

  get selectionMode(): NSEToolbarItemGroupSelectionMode { return this.#selectionMode; }
  set selectionMode(mode: NSEToolbarItemGroupSelectionMode) {
    if (!["selectOne", "selectAny", "momentary"].includes(mode)) throw new TypeError("Toolbar group selectionMode must be selectOne, selectAny or momentary.");
    if (mode === this.#selectionMode) return;
    this.#selectionMode = mode;
    if (mode === "momentary") this.#selected.clear();
    else if (mode === "selectOne" && this.#selected.size > 1) {
      const id = this.#lastSelected !== null && this.#selected.has(this.#lastSelected) ? this.#lastSelected : this.#selected.values().next().value!;
      this.#selected = new Set([id]);
      this.#lastSelected = id;
    }
    this.notifyObservers();
  }

  get controlRepresentation(): NSEToolbarItemGroupControlRepresentation { return this.#controlRepresentation; }
  set controlRepresentation(value: NSEToolbarItemGroupControlRepresentation) {
    if (!["automatic", "expanded", "collapsed"].includes(value)) throw new TypeError("Toolbar group controlRepresentation must be automatic, expanded or collapsed.");
    if (value === this.#controlRepresentation) return;
    this.#controlRepresentation = value;
    this.notifyObservers();
  }

  /** The most recently selected subitem, including momentary activations (NSToolbarItemGroup.selectedIndex). */
  get selectedIndex(): number { return this.#subitems.findIndex(item => item.id === this.#lastSelected); }
  set selectedIndex(index: number) {
    if (index === -1) { this.#lastSelected = null; this.#selected.clear(); this.notifyObservers(); return; }
    this.setSelected(true, index);
  }
  isSelected(index: number): boolean { return this.#selected.has(this.#itemAt(index).id); }
  setSelected(selected: boolean, index: number): void {
    const item = this.#itemAt(index);
    this.#lastSelected = item.id;
    if (this.#selectionMode === "momentary") this.#selected.clear();
    else if (selected) {
      if (this.#selectionMode === "selectOne") this.#selected.clear();
      this.#selected.add(item.id);
    } else this.#selected.delete(item.id);
    this.notifyObservers();
  }
  #itemAt(index: number): NSEToolbarGroupSubitem {
    if (!Number.isInteger(index) || index < 0 || index >= this.#subitems.length) throw new RangeError("A toolbar group subitem index must be in range.");
    return this.#subitems[index]!;
  }
  readonly render = () => <ToolbarItemGroupView group={this} />;
}

interface SubitemActivation {
  readonly enabled: boolean;
  readonly hidden: boolean;
  activate(): void;
}

function GroupSubitem({ group, item, index, collapsed, register, tabIndex, onFocus }: {
  readonly group: NSEToolbarItemGroup;
  readonly item: NSEToolbarGroupSubitem;
  readonly index: number;
  readonly collapsed: boolean;
  readonly register: (id: string, activation: SubitemActivation | null) => void;
  readonly tabIndex: number;
  readonly onFocus: () => void;
}) {
  const action = useNSEActionBinding("action" in item ? item.action : undefined, item.payload);
  const binding = useMemo(() => "action" in item ? action : { id: item.commandId, payload: item.payload }, [action, item]);
  const command = useNSEControlCommand(binding);
  const enabled = Boolean(command.presentation?.enabled && !command.presentation.denied && !command.presentation.hidden && !command.presentation.stale);
  const hidden = command.presentation?.hidden === true;
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const activate = useCallback(() => {
    if (!enabled) return;
    void command.dispatch().then(result => {
      if (result?.status !== "executed" || !live.current || group.subitems[index] !== item) return;
      group.setSelected(group.selectionMode === "selectAny" ? !group.isSelected(index) : true, index);
    });
  }, [command.dispatch, enabled, group, index, item]);
  const activation = useMemo(() => ({ enabled, hidden, activate }), [enabled, hidden, activate]);
  useEffect(() => { register(item.id, activation); return () => register(item.id, null); }, [activation, item.id, register]);
  if (collapsed) return null;
  return <NSEButton title={item.label} image={item.icon == null ? undefined : <span aria-hidden="true">{item.icon}</span>} imagePosition={item.icon == null ? "noImage" : "imageOnly"}
    toolTip={item.label} bezelStyle="texturedRounded" buttonType={group.selectionMode === "momentary" ? "momentaryPushIn" : "pushOnPushOff"}
    state={group.isSelected(index) ? "on" : "off"} isEnabled={enabled} hidden={hidden} onClick={activate} onFocus={onFocus}
    tabIndex={tabIndex} data-toolbar-group-subitem={item.id}
    style={{ minWidth: item.minimumWidth ?? 32, width: item.idealWidth }} />;
}

function ToolbarItemGroupView({ group }: { readonly group: NSEToolbarItemGroup }) {
  useSyncExternalStore(group.subscribe, () => group.getSnapshot(), () => group.getSnapshot());
  const menuScope = useNSEMenuOverlayPresentationScope();
  const collapsed = group.controlRepresentation === "collapsed" || (group.controlRepresentation === "automatic" && menuScope.portaled);
  const [activations, setActivations] = useState<ReadonlyMap<string, SubitemActivation>>(() => new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const register = useCallback((id: string, activation: SubitemActivation | null) => {
    setActivations(previous => {
      if (previous.get(id) === activation || (activation === null && !previous.has(id))) return previous;
      const next = new Map(previous);
      if (activation) next.set(id, activation); else next.delete(id);
      return next;
    });
  }, []);
  const enabledItems = group.subitems.filter(item => activations.get(item.id)?.enabled && !activations.get(item.id)?.hidden);
  const tabStop = enabledItems.find(item => item.id === activeId)?.id ?? enabledItems[0]?.id;
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (collapsed || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-toolbar-group-subitem]:not([disabled]):not([hidden])"));
    const index = buttons.findIndex(button => button === event.target);
    if (index < 0 || buttons.length === 0) return;
    const rtl = event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget).direction === "rtl";
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : event.key === (rtl ? "ArrowLeft" : "ArrowRight") ? (index + 1) % buttons.length
      : event.key === (rtl ? "ArrowRight" : "ArrowLeft") ? (index + buttons.length - 1) % buttons.length : null;
    if (next === null) return;
    event.preventDefault(); event.stopPropagation(); buttons[next]?.focus({ preventScroll: true });
  };
  return <ToolButtonGroup label={group.label} role="group" onKeyDown={moveFocus} data-nse-toolbar-item-group={group.id}>
    {group.subitems.map((item, index) => <GroupSubitem key={item.id} group={group} item={item} index={index} collapsed={collapsed}
      register={register} tabIndex={item.id === tabStop ? 0 : -1} onFocus={() => setActiveId(item.id)} />)}
    {collapsed && <NSEPopUpButton pullsDown title={group.label} accessibleLabel={group.label} bezelStyle="texturedRounded"
      isEnabled={enabledItems.length > 0} value={group.subitems[group.selectedIndex]?.id ?? ""}
      items={group.subitems.flatMap((item, index) => activations.get(item.id)?.hidden ? [] : [{
        title: `${group.isSelected(index) ? "✓ " : ""}${item.label}`, value: item.id, isEnabled: activations.get(item.id)?.enabled ?? false,
      }])}
      onValueChange={id => activations.get(id)?.activate()} />}
  </ToolButtonGroup>;
}
