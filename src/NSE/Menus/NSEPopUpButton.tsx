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

import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { useOptionalNSEOverlayProvider } from "../Overlays";
import { NSEListboxPopup, type NSEListboxOption } from "../Overlays/NSEListboxPopup";
import type { NSEPopupPresentation } from "../Overlays/NSEPopup";
import { NSEButton, type NSEButtonProps } from "../Controls/Buttons/NSEButton";
import { classes, sizedControlStyle, useControllableState, useNSEControlFeedback } from "../Controls/Core/nseControlsShared";
import { NSEActionResponderContext, useNSEActionBinding } from "../Controls/Core/useNSEControlAction";
import type { NSEActionReference } from "../Controls/Core/actionReference";
import type { NSEControlActionProps } from "../Controls/Core/controlTypes";
import { useNSEControlCommand, type NSEControlCommandState } from "../Controls/Core/useNSEControlCommand";
import { useNSEValueBinding } from "../Controls/Core/useNSEValueBinding";
import type { NSEBoundValueProps } from "../Bindings/bindingTypes";
import { NSEMenuView } from "./NSEMenuView";
import type { NSEMenu } from "./NSEMenu";
import { NSEMenuOverlay } from "./NSEMenuOverlay";
import type { NSEMenuOverlayOptions } from "./menuTypes";

/**
 * An item of an NSEPopUpButton's menu (NSMenuItem). A choice item has a
 * `value`; an item with its own `action` is a command ("Show Fonts…") that runs
 * rather than becoming the value; `isSeparatorItem` draws a rule.
 */
export type NSEPopUpButtonItem<Payload = unknown> =
  | { readonly isSeparatorItem: true }
  | {
      readonly isSeparatorItem?: false;
      readonly title: ReactNode;
      readonly value?: string;
      readonly image?: ReactNode;
      readonly isEnabled?: boolean;
      readonly action?: string | NSEActionReference<Payload>;
      readonly actionPayload?: NoInfer<Payload>;
    };

export interface NSEPopUpButtonProps<Payload = unknown> extends Omit<HTMLAttributes<HTMLSpanElement>, "onChange" | "title">, NSEControlActionProps<Payload> {
  /** The menu's items. A pull-down button with a command `menu` takes no items. */
  readonly items?: readonly NSEPopUpButtonItem[];
  /** NSPopUpButton.pullsDown: the button keeps its `title` and its items run commands. */
  readonly pullsDown?: boolean;
  /** A pull-down button's title. A pop-up button shows its selected item instead. */
  readonly title?: ReactNode;
  /** A pull-down button's command menu, validated along the responder chain. */
  readonly menu?: NSEMenu;
  /** The selected item's value. */
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** The caption beside the button. */
  readonly label?: ReactNode;
  readonly labelHidden?: boolean;
  /** Spoken name when it should say more than the visible caption. */
  readonly accessibleLabel?: string;
  readonly isEnabled?: boolean;
  /** NSView.appearance of a pull-down button's bezel. */
  readonly appearance?: NSEButtonProps["appearance"];
  /** "small" is the size inspectors and panels use (24px). */
  readonly controlSize?: "regular" | "small";
  /** An explicit height in CSS pixels; the bezel keeps its proportions. */
  readonly height?: number;
  /** An explicit width (CSS pixels, or any CSS length). */
  readonly width?: number | string;
  /** Overlay provenance for the menu, when the nearest responder is not its parent. */
  readonly overlay?: NSEMenuOverlayOptions;
  readonly parentResponderId?: string;
  readonly presentation?: NSEPopupPresentation;
  readonly direction?: "ltr" | "rtl";
}

type NSEPopUpButtonChoiceItem = Exclude<NSEPopUpButtonItem, { readonly isSeparatorItem: true }>;
interface NSEPopUpButtonRow {
  readonly rowId: string;
  readonly item: NSEPopUpButtonChoiceItem;
  readonly separatorBefore: boolean;
}

function ItemActionBinding({ id, action, payload, onState }: {
  readonly id: string;
  readonly action: string | NSEActionReference;
  readonly payload: unknown;
  readonly onState: (id: string, state: NSEControlCommandState<unknown> | null) => void;
}) {
  const binding = useNSEActionBinding(action, payload);
  const command = useNSEControlCommand(binding);
  useEffect(() => {
    onState(id, command);
    return () => onState(id, null);
  }, [command, id, onState]);
  return null;
}

function available(command: NSEControlCommandState<unknown> | undefined): boolean {
  const presentation = command?.presentation;
  return Boolean(presentation?.enabled && !presentation.denied && !presentation.hidden && !presentation.stale);
}

/**
 * NSPopUpButton. A pop-up button shows its selected item and lets the user
 * choose another; a pull-down button (`pullsDown`) keeps its title and runs the
 * command chosen from its menu. The menu is always drawn by the shared overlay
 * stack. Outside an overlay host a pop-up button falls back to a native select,
 * the one intentional native surface.
 */
export function NSEPopUpButton<Payload = unknown>(props: NSEBoundValueProps<string, NSEPopUpButtonProps<Payload>, "value" | "defaultValue" | "onValueChange" | "undoManager">) {
  return <NSEPopUpButtonControl {...useNSEValueBinding<string, NSEPopUpButtonProps<Payload>, "value" | "defaultValue" | "onValueChange" | "undoManager">(props, { fallback: "", disableReadOnly: true })} />;
}

function NSEPopUpButtonControl(props: NSEPopUpButtonProps) {
  const {
    items = [],
    pullsDown = false,
    title,
    menu,
    value,
    defaultValue,
    onValueChange,
    action,
    actionPayload,
    label,
    labelHidden = false,
    accessibleLabel,
    isEnabled = true,
    appearance,
    controlSize = "regular",
    height,
    width,
    overlay,
    parentResponderId,
    presentation,
    direction = "ltr",
    className,
    id,
    style,
    ...htmlAttributes
  } = props;
  if (menu && !pullsDown) throw new TypeError("NSEPopUpButton takes a command menu only when it pullsDown.");
  if (menu && items.length) throw new TypeError("NSEPopUpButton takes either items or a command menu, not both.");
  const disabled = !isEnabled;
  const provider = useOptionalNSEOverlayProvider();
  const nearestResponderId = useContext(NSEActionResponderContext);
  const hasActionPayload = Object.prototype.hasOwnProperty.call(props, "actionPayload");
  const [itemCommands, setItemCommands] = useState<ReadonlyMap<string, NSEControlCommandState<unknown>>>(() => new Map());
  const receiveItemCommand = useCallback((rowId: string, command: NSEControlCommandState<unknown> | null) => {
    setItemCommands((current) => {
      const next = new Map(current);
      if (command) next.set(rowId, command); else next.delete(rowId);
      return next;
    });
  }, []);
  const generatedId = useId().replace(/:/g, "");
  const baseId = id ?? `nse-popup-button:${generatedId}`;
  const buttonId = `${baseId}-button`;
  const listboxId = `${baseId}-listbox`;
  const labelId = label ? `${baseId}-label` : undefined;
  const accessibleLabelId = `${baseId}-accessible-label`;
  const resolvedParentResponderId = parentResponderId ?? overlay?.parentResponderId ?? nearestResponderId ?? provider?.defaultParentResponderId;
  const resolvedOverlay = useMemo(() => {
    if (overlay) return overlay;
    if (!resolvedParentResponderId) return null;
    return { id: `${baseId}:overlay`, parentResponderId: resolvedParentResponderId };
  }, [overlay, baseId, resolvedParentResponderId]);
  const hosted = Boolean(provider && resolvedOverlay);
  if (!hosted && pullsDown) throw new Error("A pull-down NSEPopUpButton needs an overlay host: overlay provenance or an NSEStandaloneControlHost.");

  // A separator item becomes a rule above the next row.
  const rows = useMemo(() => {
    const result: NSEPopUpButtonRow[] = [];
    let rule = false;
    items.forEach((item, index) => {
      if (item.isSeparatorItem) { rule = result.length > 0; return; }
      if (item.action === undefined && item.value === undefined) throw new TypeError("An NSEPopUpButton item needs a value or an action.");
      result.push({ rowId: item.action === undefined ? item.value! : `nse-popup-button-item:${index}`, item, separatorBefore: rule });
      rule = false;
    });
    return result;
  }, [items]);
  const choiceRows = rows.filter((row) => row.item.action === undefined);
  const fallbackValue = defaultValue ?? choiceRows.find((row) => row.item.isEnabled !== false)?.item.value ?? "";
  const [selectedValue, setSelectedValue] = useControllableState({ value, defaultValue, fallback: fallbackValue, onChange: onValueChange });
  const [open, setOpen] = useState(false);
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const selectedRow = choiceRows.find((row) => row.item.value === selectedValue) ?? choiceRows.find((row) => row.item.isEnabled !== false);
  const rowEnabled = useCallback((row: NSEPopUpButtonRow) => {
    if (row.item.isEnabled === false) return false;
    if (row.item.action !== undefined) return available(itemCommands.get(row.rowId));
    return action === undefined || available(itemCommands.get(row.rowId));
  }, [action, itemCommands]);
  const actionAvailable = menu !== undefined || action === undefined || rows.some(rowEnabled);
  const actionHidden = action !== undefined && choiceRows.length > 0 && choiceRows.every((row) => itemCommands.get(row.rowId)?.presentation?.hidden);
  const { triggerNSEControlHaptic } = useNSEControlFeedback();
  const listboxOptions = useMemo<readonly NSEListboxOption<string>[]>(() => rows
    .filter((row) => !(row.item.action === undefined && action !== undefined && itemCommands.get(row.rowId)?.presentation?.hidden))
    .map((row) => ({
      id: row.rowId,
      label: row.item.image
        ? <span className="nse-extended-option"><span className="nse-extended-option-icon">{row.item.image}</span><span className="nse-extended-option-label">{row.item.title}</span></span>
        : row.item.title,
      value: row.item.value,
      disabled: !rowEnabled(row),
      separatorBefore: row.separatorBefore,
      kind: pullsDown || row.item.action !== undefined ? "action" as const : undefined,
    })), [action, itemCommands, pullsDown, rowEnabled, rows]);
  const select = useCallback((option: NSEListboxOption<string>) => {
    if (option.disabled || disabled || !actionAvailable) return;
    const row = rows.find((candidate) => candidate.rowId === option.id);
    if (!row) return;
    if (row.item.action !== undefined) {
      void itemCommands.get(row.rowId)?.dispatch();
      return;
    }
    const chosen = row.item.value!;
    const commit = () => {
      if (pullsDown) onValueChange?.(chosen);
      else setSelectedValue(chosen);
      void triggerNSEControlHaptic("selection");
    };
    if (action === undefined) commit();
    else void itemCommands.get(row.rowId)?.dispatch().then((result) => { if (result?.status === "executed") commit(); });
  }, [action, actionAvailable, disabled, itemCommands, onValueChange, pullsDown, rows, setSelectedValue, triggerNSEControlHaptic]);

  const bindings = rows.map((row) => {
    if (row.item.action !== undefined) {
      return <ItemActionBinding key={row.rowId} id={row.rowId} action={row.item.action} payload={row.item.actionPayload} onState={receiveItemCommand} />;
    }
    if (action === undefined) return null;
    return <ItemActionBinding key={row.rowId} id={row.rowId} action={action} payload={hasActionPayload ? actionPayload : row.item.value} onState={receiveItemCommand} />;
  });

  if (!hosted) {
    return (
      <label id={id} className={classes("nse-choice-control", className)} data-nse-choice="native" style={sizedControlStyle(style, height, width)} {...(htmlAttributes as HTMLAttributes<HTMLLabelElement>)}>
        {bindings}
        {label ? (labelHidden ? <span className="nse-control-visually-hidden">{label}</span> : label) : null}
        <select
          aria-label={accessibleLabel ?? (typeof label === "string" ? label : undefined)}
          value={selectedRow?.item.value ?? ""}
          disabled={disabled || !actionAvailable}
          onChange={(event) => {
            const option = listboxOptions.find((candidate) => candidate.value === event.currentTarget.value);
            if (option) select(option);
          }}
        >
          {choiceRows.map((row) => <option key={row.rowId} value={row.item.value} disabled={!rowEnabled(row)}>{typeof row.item.title === "string" ? row.item.title : row.item.value}</option>)}
        </select>
      </label>
    );
  }

  const overlayOptions = resolvedOverlay!;
  return (
    <span
      id={id}
      hidden={actionHidden || undefined}
      className={classes(pullsDown ? "nse-popup-button" : "nse-control-picker", className)}
      data-nse-choice="picker"
      data-pulls-down={pullsDown ? "true" : undefined}
      data-size={height !== undefined ? "custom" : controlSize === "small" ? "small" : undefined}
      style={sizedControlStyle(style, height, width)}
      {...htmlAttributes}
    >
      {bindings}
      {/* Name sources for aria-labelledby only are `hidden`: they still name
          the button and listbox, but are not read again as loose text. */}
      {label ? (
        <span id={labelId} className={labelHidden ? undefined : "nse-control-picker-label"} hidden={labelHidden || undefined}>
          {label}
        </span>
      ) : null}
      {pullsDown ? null : (
        <span id={accessibleLabelId} hidden>
          {accessibleLabel ?? label} {selectedRow?.item.title}
        </span>
      )}
      <NSEButton
        title={pullsDown ? title : <>
          <span className="nse-control-picker-caption">{selectedRow?.item.title ?? "Select"}</span>
          <span className="nse-control-picker-arrow" aria-hidden="true" />
        </>}
        appearance={appearance}
        isHighlighted={pullsDown ? open : itemCommands.get(selectedValue)?.presentation?.state === "on"}
        isEnabled={!(disabled || !actionAvailable)}
        ref={anchorRef}
        id={buttonId}
        className={pullsDown ? undefined : "nse-control-picker-button"}
        controlSize={pullsDown && controlSize === "small" ? "small" : undefined}
        haptic="soft"
        aria-label={pullsDown ? accessibleLabel : undefined}
        aria-haspopup={menu ? "menu" : "listbox"}
        aria-expanded={open}
        aria-controls={menu ? undefined : listboxId}
        aria-labelledby={pullsDown ? undefined : accessibleLabelId}
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.currentTarget.disabled || event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setInitialFocus(menu && event.key === "ArrowUp" ? "last" : "first");
            setOpen(true);
          }
        }}
        onClick={() => {
          setInitialFocus("first");
          setOpen((current) => !current);
        }}
      />
      {menu ? (
        <NSEMenuOverlay overlay={overlayOptions} controller={menu} open={open} anchor={anchorRef.current} labelledBy={buttonId} onOpenChange={setOpen}>
          <NSEMenuView model={menu.model} controller={menu} open={open} labelledBy={buttonId} onOpenChange={setOpen} direction={direction} initialFocus={initialFocus} />
        </NSEMenuOverlay>
      ) : (
        <NSEListboxPopup
          id={listboxId}
          open={open}
          anchor={anchorRef.current}
          parentResponderId={overlayOptions.parentResponderId}
          parentId={overlayOptions.parentId}
          parentScopeId={overlayOptions.parentScopeId}
          options={listboxOptions}
          selectedId={pullsDown ? undefined : selectedValue}
          labelledBy={labelId ?? (pullsDown ? buttonId : accessibleLabelId)}
          presentation={presentation}
          popupAlign="right"
          controlSize={controlSize === "small" || height !== undefined ? "small" : "regular"}
          onOpenChange={setOpen}
          onSelect={select}
        />
      )}
    </span>
  );
}
