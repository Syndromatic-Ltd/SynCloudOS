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

import { forwardRef, useId, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { useOptionalNSEControlRuntimePort } from "../Controls/Core/useNSEControlCommand";
import type { NSEControlRuntimePort } from "../Controls/Core/controlTypes";
import { classes } from "../Controls/Core/nseControlsShared";
import { NSEPushButton, type NSEPushButtonProps } from "../Controls/Buttons/NSEButtons";
import { NSEListItem } from "../Controls/Selection/NSEListItem";
import { NSEPopup, type NSEPopupProps } from "../Overlays";
import { NSEAppMenuSurface } from "./NSEAppMenuSurface";
import type { NSEMenuItemDefinition } from "./menuTypes";

export interface NSEAppMenuItemDefinition extends NSEMenuItemDefinition {
  readonly shortcut?: ReactNode;
}

export interface NSEAppMenuProps extends Omit<NSEPopupProps, "children" | "onSelect" | "title"> {
  readonly title?: ReactNode;
  readonly items?: readonly NSEAppMenuItemDefinition[];
  readonly onSelect?: (value: string) => void;
  /** Where the menu drops from. The default is the status-bar corner. */
  readonly placement?: "top-left" | "top-right";
  readonly children?: ReactNode;
}

export function NSEAppMenu({
  title,
  items,
  open,
  defaultOpen = false,
  onOpenChange,
  onSelect,
  id,
  anchor,
  parentResponderId,
  parentId,
  parentScopeId,
  placement = "top-left",
  children,
  className = "",
  presentation,
  ...props
}: NSEAppMenuProps) {
  const menuDescriptionId = useId();
  const fallbackAnchorRef = useRef<HTMLSpanElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? uncontrolledOpen;
  const resolvedPresentation = presentation ?? (
    placement === "top-right"
      ? { mode: "viewport-block-start-inline-end" as const }
      : { mode: "anchored" as const, placement: "block-end-inline-start" as const }
  );
  const requestOpen = (nextOpen: boolean, reason: Parameters<NonNullable<NSEPopupProps["onOpenChange"]>>[1]) => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen, reason);
  };
  return (
    <span className="nse-app-menu-anchor" ref={fallbackAnchorRef} data-nse-app-menu-anchor="true">
      <NSEPopup
        className={classes("nse-extended-app-menu-popup", className)}
        data-app-menu-placement={placement}
        id={id}
        open={resolvedOpen}
        defaultOpen={defaultOpen}
        anchor={anchor ?? fallbackAnchorRef.current}
        parentResponderId={parentResponderId}
        parentId={parentId}
        parentScopeId={parentScopeId}
        presentation={resolvedPresentation}
        overlayKind="menu"
        role="menu"
        exitDuration={160}
        onOpenChange={requestOpen}
        {...props}
      >
        <NSEAppMenuSurface title={title} className="nse-extended-app-menu">
          {items?.filter((item) => !item.hidden).map((item, index) => {
            if (item.separator) return <div key={`${item.value}:separator:${index}`} className="nse-menu-separator" role="separator" />;
            return (
              <NSEListItem
                key={`${item.value}:${index}`}
                role="menuitem"
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                aria-describedby={item.disabledReason ? `${menuDescriptionId}-reason-${index}` : undefined}
                trailing={item.shortcut}
                onClick={item.disabled ? undefined : () => {
                  onSelect?.(item.value);
                  requestOpen(false, "selection");
                }}
              >
                {item.label}
                {item.disabledReason ? <span id={`${menuDescriptionId}-reason-${index}`} className="nse-control-menu-disabled-reason">{item.disabledReason}</span> : null}
              </NSEListItem>
            );
          })}
          {children}
        </NSEAppMenuSurface>
      </NSEPopup>
    </span>
  );
}

export interface NSEEditMenuProps extends HTMLAttributes<HTMLDivElement> {
  caption?: ReactNode;
  autoDisableItems?: boolean;
  selectAllDisabled?: boolean;
  cutDisabled?: boolean;
  copyDisabled?: boolean;
  pasteDisabled?: boolean;
  showShortcuts?: boolean;
  runtime?: NSEControlRuntimePort;
  onSelectAll?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
}

interface EditMenuItem {
  readonly commandId: string;
  readonly label: string;
  readonly shortcut: string;
  readonly disabled: boolean;
  readonly handler?: () => void;
}

// Spelled as the key binding manager spells a "primary" binding, so the menu
// and the bindings it advertises agree.
function primaryModifierLabel(): "Cmd" | "Ctrl" {
  if (typeof navigator === "undefined") return "Ctrl";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "Cmd" : "Ctrl";
}

async function dispatchEditCommand(runtime: NSEControlRuntimePort, item: EditMenuItem): Promise<void> {
  const preparation = await runtime.commands.prepareDispatch(item.commandId, undefined, { source: "menu" });
  if (preparation.status !== "accepted") return;
  await runtime.commands.dispatch(item.commandId, undefined, { source: "menu", acceptance: preparation.acceptance });
}

export function NSEEditMenu({
  caption = "Edit",
  autoDisableItems = true,
  selectAllDisabled = false,
  cutDisabled = false,
  copyDisabled = false,
  pasteDisabled = false,
  showShortcuts = false,
  runtime: explicitRuntime,
  onSelectAll,
  onCut,
  onCopy,
  onPaste,
  className = "",
  ...props
}: NSEEditMenuProps) {
  const contextRuntime = useOptionalNSEControlRuntimePort();
  const runtime = explicitRuntime ?? contextRuntime;
  const items: EditMenuItem[] = [
    { commandId: "text.selectAll", label: "Select All", shortcut: "A", disabled: selectAllDisabled, handler: onSelectAll },
    { commandId: "text.cut", label: "Cut", shortcut: "X", disabled: cutDisabled, handler: onCut },
    { commandId: "text.copy", label: "Copy", shortcut: "C", disabled: copyDisabled, handler: onCopy },
    { commandId: "text.paste", label: "Paste", shortcut: "V", disabled: pasteDisabled, handler: onPaste },
  ];
  return (
    <NSEAppMenuSurface
      className={classes("nse-extended-edit-menu", className)}
      role="menu"
      aria-label={typeof caption === "string" ? caption : undefined}
      {...props}
    >
      {items.map((item) => {
        const unavailable = autoDisableItems && !item.handler && !runtime;
        const disabled = unavailable || item.disabled;
        return (
          <NSEListItem
            key={item.commandId}
            role="menuitem"
            disabled={disabled}
            aria-disabled={disabled || undefined}
            trailing={showShortcuts ? `${primaryModifierLabel()}+${item.shortcut}` : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (disabled) return;
              if (item.handler) {
                item.handler();
                return;
              }
              if (runtime) void dispatchEditCommand(runtime, item);
            }}
          >
            {item.label}
          </NSEListItem>
        );
      })}
    </NSEAppMenuSurface>
  );
}

export interface NSEHelpMenuProps extends Omit<NSEPushButtonProps, "children"> {
  caption?: ReactNode;
  target?: string;
  onOpenHelp?: (target: string) => void;
  children?: ReactNode;
}

export const NSEHelpMenu = forwardRef<HTMLButtonElement, NSEHelpMenuProps>(function NSEHelpMenu(
  {
    caption = "Help",
    target = "",
    onOpenHelp,
    children,
    tone = "dark",
    className = "",
    onClick,
    ...props
  },
  ref
) {
  return (
    <NSEPushButton
      ref={ref}
      className={classes("nse-extended-help-menu", className)}
      tone={tone}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !target) return;
        if (onOpenHelp) {
          onOpenHelp(target);
          return;
        }
        window.open(target, "_blank", "noopener,noreferrer");
      }}
      {...props}
    >
      {children ?? caption}
    </NSEPushButton>
  );
});
