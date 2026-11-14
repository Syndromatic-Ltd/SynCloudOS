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

import type { ResolvedKeyBinding } from "../../SynCloudOS/SynCloudOS";
import { nseFlashMenuSelection } from "./menuSelectionFlash";
import { Children, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { CommandDispatchAcceptance, CommandPresentation } from "../../SynCloudOS/SynCloudOS";
import { NSEAppearanceNineSlice } from "../Appearance/NSEAppearanceNineSlice";
import { useNSEAppearanceProjection } from "../Appearance";
import { sizedControlStyle, useNSEControlFeedback } from "../Controls/Core/nseControlsShared";
import { NSEButton, nseButtonToneProps, type ButtonTone, type NSEButtonProps } from "../Controls/Buttons/NSEButton";
import { useNSEOverlayProvider } from "../Overlays";
import { MenuOverlay } from "./MenuOverlay";
import { createReactOwnedNSEMenu, nseRefreshMenuPresentation, type NSEMenu } from "./NSEMenu";
import { useMenuLifetime } from "./useMenuLifetime";
import { nseMenuModel } from "./menuTypes";
import type {
  MenuEntry,
  MenuItemDefinition,
  MenuModel,
  MenuOverlayOptions,
  MenuPresentedEntry,
  NSEMenuRuntimePort,
} from "./menuTypes";
import { useNSEMenuOverlayPresentationScope } from "./menuPresentationContext";
import { ActionResponderContext } from "../Controls/Core/useNSEControlAction";
import "./nse-menus.css";

function classNames(...values: readonly (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

/** Whether two nodes draw the same thing: `<Glyph />` written inline is a new element on every render. */
function sameNode(a: ReactNode, b: ReactNode): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((node, index) => sameNode(node, b[index]));
  }
  if (!isValidElement(a) || !isValidElement(b) || a.type !== b.type || a.key !== b.key) return false;
  const aProps = a.props as Record<string, unknown>;
  const bProps = b.props as Record<string, unknown>;
  const keys = Object.keys(aProps);
  return keys.length === Object.keys(bProps).length && keys.every((key) => (
    key === "children" ? sameNode(aProps[key] as ReactNode, bProps[key] as ReactNode) : Object.is(aProps[key], bProps[key])
  ));
}

function sameMenuItems(a: readonly MenuItemDefinition[], b: readonly MenuItemDefinition[]): boolean {
  return a.length === b.length && a.every((item, index) => {
    const other = b[index]!;
    return item.value === other.value &&
      item.disabled === other.disabled &&
      item.hidden === other.hidden &&
      item.disabledReason === other.disabledReason &&
      item.checked === other.checked &&
      item.separator === other.separator &&
      sameNode(item.label, other.label) &&
      sameNode(item.icon, other.icon) &&
      sameNode(item.shortcut, other.shortcut) &&
      sameMenuItems(item.children ?? [], other.children ?? []);
  });
}

/**
 * Keeps the previous value while the next one is equivalent. A menu's model
 * and controller are built from its items, so a parent that writes its items
 * inline (a new array every render) must not rebuild, and so close, an open
 * menu each time it re-renders.
 */
function useEquivalentValue<T>(value: T, equivalent: (a: T, b: T) => boolean): T {
  const ref = useRef(value);
  if (ref.current !== value && !equivalent(ref.current, value)) ref.current = value;
  return ref.current;
}

export interface CommandMenuProps {
  readonly model: MenuModel;
  readonly controller: NSEMenu;
  readonly open: boolean;
  readonly labelledBy?: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly direction?: "ltr" | "rtl";
  readonly initialFocus?: "first" | "last";
  /** Uses the injected runtime scheduler when the host wants pointer aim delay. */
  readonly submenuDelayMs?: number;
  /** Uses the curated application-menu row recipe without changing generic NSE menus. */
  readonly appearance?: "default" | "application-menu";
}

export interface ItemMenuProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onSelect" | "children"> {
  readonly label: ReactNode;
  readonly items: readonly MenuItemDefinition[];
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSelect?: (value: string) => void;
  readonly menuOverlay?: MenuOverlayOptions;
  readonly parentResponderId?: string;
  readonly tone?: ButtonTone;
  readonly pressHaptic?: NSEButtonProps["haptic"];
  readonly selectionHaptic?: NSEButtonProps["haptic"];
  readonly smoothSurface?: boolean;
  readonly initialFocus?: "first" | "last";
  readonly submenuDelayMs?: number;
  /** The trigger's family: a push button, or a tool capsule, as a pull-down
   * action (gear) menu draws among a panel's tool buttons. */
  readonly trigger?: "push" | "tool";
  /** The trigger's accessible name when its label is a glyph. */
  readonly triggerLabel?: string;
  /** A tool trigger's size, as the other tool capsules: small is 24px. */
  readonly controlSize?: "regular" | "small";
  /** A tool trigger's explicit band height in CSS pixels. */
  readonly height?: number;
}

export type NSEMenuProps = CommandMenuProps | ItemMenuProps;

function isFocusable(entry: MenuPresentedEntry): entry is Exclude<MenuPresentedEntry, { readonly kind: "separator" | "custom" }> {
  return entry.kind !== "separator" && entry.kind !== "custom" && entry.enabled;
}

function roleFor(entry: MenuPresentedEntry): "menuitem" | "menuitemcheckbox" | "menuitemradio" {
  if (entry.kind !== "command") return "menuitem";
  if (entry.selectionKind === "radio") return "menuitemradio";
  // Existing command presentations already use off/on/mixed as their
  // checked-state contract. Preserve that projection unless a caller
  // explicitly asks for a radio group.
  return entry.selectionKind === "checkbox" || entry.checked !== "off" ? "menuitemcheckbox" : "menuitem";
}

function entryLabel(entry: Exclude<MenuPresentedEntry, { readonly kind: "separator" }>): string {
  return Children.toArray(entry.label).reduce<string>((text, child) => {
    if (typeof child === "string" || typeof child === "number") return `${text}${child}`;
    return text;
  }, "");
}

/** Semantic command menu surface. Its parent chooses portal/popover/sheet presentation. */
function CommandMenuSurface({
  model,
  controller,
  open,
  labelledBy,
  onOpenChange,
  direction = "ltr",
  initialFocus = "first",
  submenuDelayMs = 180,
  appearance = "default",
}: CommandMenuProps) {
  const appearanceProjection = useNSEAppearanceProjection();
  const applicationAppearance = appearance === "application-menu";
  const subscribe = useCallback((listener: () => void) => controller.subscribe(() => {
    if (!controller.runtime.signal.aborted) listener();
  }), [controller]);
  const snapshot = useSyncExternalStore(subscribe, () => controller.snapshot, () => controller.snapshot);
  const { portaled: portalPresentation, ready: presentationReady } = useNSEMenuOverlayPresentationScope();
  const pendingFocus = useRef<{ generation: number; prior: Element | null } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const hadOpenSnapshot = useRef(false);
  const typeahead = useRef<{ prefix: string; handle: unknown | null; token: object | null }>({ prefix: "", handle: null, token: null });
  const clearTypeahead = useCallback(() => {
    if (typeahead.current.handle !== null) controller.runtime.scheduler?.clearTimeout(typeahead.current.handle);
    typeahead.current = { prefix: "", handle: null, token: null };
  }, [controller]);

  useEffect(() => {
    if (!open) {
      controller.dismiss("programmatic");
      return undefined;
    }
    // React StrictMode deliberately replays effects. The controller belongs to
    // its host, not this view, so do not tear it down during a replay; a
    // visible branch has exactly one validation generation until dismissed.
    if (controller.snapshot.open) return undefined;
    const scheduler = controller.runtime.scheduler;
    if (!portalPresentation || !scheduler) {
      void controller.open();
      return undefined;
    }
    let live = true;
    // A portal FocusScope commits in the layout phase. Defer the first
    // visible-branch validation through the injected command scheduler so React
    // StrictMode's deliberate cleanup/setup replay cannot invalidate that
    // exact responder generation between capture and publication.
    const handle = scheduler.setTimeout(() => {
      if (live && !controller.snapshot.open) void controller.open();
    }, 0);
    return () => {
      live = false;
      scheduler.clearTimeout(handle);
    };
  }, [controller, open, portalPresentation]);

  // Controllers own cancellation/staleness. Once one closes an established
  // branch, reflect that terminal state to the presentation owner exactly once
  // so a provider-backed popup cannot remain as an empty shell.
  useEffect(() => {
    if (snapshot.open) {
      hadOpenSnapshot.current = true;
      return;
    }
    const shouldClosePresentation = hadOpenSnapshot.current && open;
    hadOpenSnapshot.current = false;
    if (shouldClosePresentation) onOpenChange?.(false);
  }, [onOpenChange, open, snapshot.open]);

  useEffect(() => clearTypeahead, [clearTypeahead]);

  const focusableEntries = snapshot.entries.filter(isFocusable);
  useEffect(() => {
    if (!snapshot.open || focusableEntries.length === 0) {
      setActiveId(null);
      return;
    }
    const fallback = initialFocus === "last" ? focusableEntries.at(-1)! : focusableEntries[0]!;
    setActiveId((current) => focusableEntries.some((entry) => entry.id === current) ? current : fallback.id);
  }, [focusableEntries, initialFocus, snapshot.open]);

  useEffect(() => {
    if (!open || !snapshot.open || !activeId) {
      pendingFocus.current = null;
      return;
    }
    const target = itemRefs.current.get(activeId);
    if (!target) return;
    // Validation can publish rows before the parent popup removes its pending
    // visibility. Focus only after that owned presentation commit, never after
    // an arbitrary frame/timer. A later external focus choice takes precedence.
    if (!presentationReady) {
      pendingFocus.current ??= { generation: snapshot.generation, prior: target.ownerDocument.activeElement };
      return;
    }
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    const current = target.ownerDocument.activeElement;
    if (pending && (pending.generation !== snapshot.generation ||
      current !== pending.prior && current !== target.ownerDocument.body && !target.closest('[role="menu"]')?.contains(current))) return;
    target.focus({ preventScroll: true });
  }, [activeId, open, presentationReady, snapshot.generation, snapshot.open]);

  const flashing = useRef(false);
  // Set once a chosen row has flashed, until the menu opens again.
  const chosen = useRef(false);
  const shownSnapshot = useRef(snapshot);
  if (open && snapshot.open && shownSnapshot.current.generation !== snapshot.generation) chosen.current = false;
  const activate = async (entry: MenuPresentedEntry, delayed = false) => {
    if (entry.kind === "submenu") {
      if (!entry.enabled) return;
      void controller.openSubmenu(entry.id, delayed ? submenuDelayMs : 0);
      return;
    }
    if (entry.kind !== "command" || !entry.enabled || !controller.snapshot.open || controller.snapshot.validating || controller.snapshot.generation !== snapshot.generation) return;
    // Entering the menu and focusing a row changes responder authority after
    // the branch was first painted. Re-present the selected branch through
    // normal validation before activation; direct stale dispatch stays fenced.
    // Retain the current branch's rows: removing the focused row would dismiss
    // its overlay before this asynchronous validation can complete.
    const path = [...snapshot.branchPath];
    const branchOpening = controller[nseRefreshMenuPresentation]();
    const generation = controller.snapshot.generation;
    const ownsBranch = (expectedPath: readonly string[]) => controller.snapshot.open
      && controller.snapshot.generation === generation
      && controller.snapshot.branchPath.length === expectedPath.length
      && controller.snapshot.branchPath.every((id, index) => id === expectedPath[index]);
    await branchOpening;
    if (!ownsBranch(path)) return;
    const current = controller.snapshot.entries.find(candidate => candidate.id === entry.id);
    if (current?.kind !== "command" || current.commandId !== entry.commandId || current.payload !== entry.payload
      || current.presentation.responderId !== entry.presentation.responderId) {
      controller.dismiss("programmatic");
      return;
    }
    if (!current.enabled || current.hidden || flashing.current) return;
    const flash = nseFlashMenuSelection(itemRefs.current.get(entry.id));
    if (flash) {
      flashing.current = true;
      try { await flash; } finally { flashing.current = false; }
      if (!ownsBranch(path)) return;
      chosen.current = true;
    }
    await controller.dispatch(current.id);
  };

  const move = (delta: number) => {
    if (focusableEntries.length === 0) return;
    const current = Math.max(0, focusableEntries.findIndex((entry) => entry.id === activeId));
    const next = focusableEntries[(current + delta + focusableEntries.length) % focusableEntries.length]!;
    setActiveId(next.id);
    itemRefs.current.get(next.id)?.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // AltGraph produces Ctrl+Alt on many layouts. It is text input, not a
    // command chord, so preserve the native/editor path before asking command authority.
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
    const keyEvent = {
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      isComposing: event.nativeEvent.isComposing,
      target: event.target,
      getModifierState: event.getModifierState.bind(event),
    };
    const keyEquivalent = controller.claimKeyEquivalent({ event: keyEvent });
    if (keyEquivalent) {
      event.preventDefault();
      void controller.dispatchKeyEquivalent({ event: keyEvent }, keyEquivalent);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const forwardKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = focusableEntries[event.key === "Home" ? 0 : focusableEntries.length - 1];
      if (target) {
        setActiveId(target.id);
        itemRefs.current.get(target.id)?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      controller.dismiss("escape");
      onOpenChange?.(false);
      return;
    }
    if (event.key === forwardKey) {
      const active = focusableEntries.find((entry) => entry.id === activeId);
      if (active?.kind === "submenu") {
        event.preventDefault();
        activate(active);
      }
      return;
    }
    if (event.key === backKey && snapshot.branchPath.length > 0) {
      event.preventDefault();
      void controller.closeSubmenu();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const active = focusableEntries.find((entry) => entry.id === activeId);
      if (!active) return;
      event.preventDefault();
      activate(active);
      return;
    }
    if (event.key.length === 1) {
      const lower = event.key.toLocaleLowerCase();
      const prefix = `${typeahead.current.prefix}${lower}`;
      const target = focusableEntries.find((entry) => entryLabel(entry).toLocaleLowerCase().startsWith(prefix))
        ?? focusableEntries.find((entry) => entryLabel(entry).toLocaleLowerCase().startsWith(lower));
      if (target) {
        event.preventDefault();
        clearTypeahead();
        const resolvedPrefix = entryLabel(target).toLocaleLowerCase().startsWith(prefix) ? prefix : lower;
        typeahead.current.prefix = resolvedPrefix;
        if (controller.runtime.scheduler) {
          const token = {};
          typeahead.current.token = token;
          const handle = controller.runtime.scheduler.setTimeout(() => {
            if (typeahead.current.token === token) typeahead.current = { prefix: "", handle: null, token: null };
          }, 500);
          // Test schedulers are allowed to fire synchronously. Only retain the
          // returned handle when its generation is still active.
          if (typeahead.current.token === token) typeahead.current.handle = handle;
        } else {
          // A pure semantic test host may not provide timer authority. It
          // still gets deterministic one-character typeahead rather than a
          // prefix that can never expire.
          typeahead.current.prefix = lower;
        }
        setActiveId(target.id);
        itemRefs.current.get(target.id)?.focus({ preventScroll: true });
      }
    }
  };

  // A menu whose row was chosen keeps drawing what it showed while its popup fades out.
  const showing = open && snapshot.open;
  if (showing) shownSnapshot.current = snapshot;
  const view = showing ? snapshot : chosen.current ? shownSnapshot.current : null;
  if (!view) return null;
  return (
    <div
      className={`nse-menu${applicationAppearance ? " nse-application-menu-list" : ""}`}
      data-nse-control="menu" data-nse-part="background"
      role="menu"
      aria-labelledby={labelledBy}
      aria-busy={view.validating || undefined}
      inert={!showing || undefined}
      data-nse-menu-id={model.id}
      data-nse-menu-generation={view.generation}
      {...appearanceProjection}
      data-nse-theme={undefined}
      data-nse-menu-variant={applicationAppearance ? "application-menu" : "popup"}
      dir={direction}
      onKeyDown={handleKeyDown}
    >
      <NSEAppearanceNineSlice kind="menu-surface" className="nse-menu__surface-layer" />
      {view.branchPath.length > 0 ? (
        <button
          data-nse-control="menu-item" data-nse-part="cell" className={`nse-menu-item nse-menu-back${applicationAppearance ? " nse-control-list-item" : ""}`}
          type="button"
          role="menuitem"
          onClick={() => void controller.closeSubmenu()}
        >
          {applicationAppearance ? (
            <>
              <span className="nse-control-list-leading nse-menu-back-indicator" data-direction={direction} data-nse-part="back-indicator" aria-hidden="true" />
              <span className="nse-control-list-body"><span className="nse-control-list-primary">Back</span></span>
            </>
          ) : (
            <>
              <span className="nse-menu-back-indicator" data-direction={direction} data-nse-part="back-indicator" aria-hidden="true" />
              Back
            </>
          )}
        </button>
      ) : null}
      {view.entries.map((entry) => {
        if (entry.kind === "separator") return <div key={entry.id} data-nse-part="separator" className="nse-menu-separator" role="separator" />;
        if (entry.kind === "custom") return <div key={entry.id} data-nse-part="content" className="nse-menu-custom" role="presentation">{entry.render()}</div>;
        const role = roleFor(entry);
        const checked = entry.kind === "command" ? entry.checked : undefined;
        return (
          <button
            key={entry.id}
            ref={(element) => {
              if (element) itemRefs.current.set(entry.id, element);
              else itemRefs.current.delete(entry.id);
            }}
            data-nse-control="menu-item" data-nse-part="cell"
            data-nse-state={checked} data-nse-enabled={entry.enabled ? undefined : "false"}
            data-nse-highlighted={activeId === entry.id ? "" : undefined} data-nse-focused={activeId === entry.id ? "" : undefined} data-nse-hovered={hoveredId === entry.id ? "" : undefined}
            className={`nse-menu-item${applicationAppearance ? " nse-control-list-item" : ""}${!entry.enabled ? " is-disabled" : ""}`}
            type="button"
            role={role}
            aria-checked={role === "menuitemcheckbox" || role === "menuitemradio" ? checked === "mixed" ? "mixed" : checked === "on" : undefined}
            aria-haspopup={entry.kind === "submenu" ? "menu" : undefined}
            aria-disabled={!entry.enabled ? true : undefined}
            disabled={!entry.enabled}
            data-nse-menu-state={entry.kind === "command" ? entry.checked : undefined}
            data-nse-menu-disabled={!entry.enabled ? "true" : undefined}
            data-nse-menu-command={entry.kind === "command" ? entry.commandId : undefined}
            aria-keyshortcuts={entry.kind === "command" ? ariaKeyShortcuts(entry.presentation?.keyBinding) : undefined}
            tabIndex={activeId === entry.id ? 0 : -1}
            title={!entry.enabled ? entry.disabledReason : undefined}
            onFocus={() => setActiveId(entry.id)}
            onPointerEnter={() => { setHoveredId(entry.id); if (entry.kind === "submenu") activate(entry, true); }}
            onPointerLeave={() => { setHoveredId(current => current === entry.id ? null : current); controller.cancelPendingSubmenu(); }}
            onClick={() => activate(entry)}
          >
            {applicationAppearance ? (
              <>
                {(entry.kind === "command" && entry.checked !== "off") || entry.icon ? (
                  <span className="nse-control-list-leading" data-nse-part="leading" aria-hidden="true">
                    {entry.kind === "command" && entry.checked !== "off" ? <span className="nse-menu-state-column" data-nse-part="state-column" data-nse-state={entry.checked} data-state={entry.checked} /> : entry.icon}
                  </span>
                ) : null}
                <span className="nse-control-list-body">
                  <span data-nse-part="title" className="nse-control-list-primary nse-menu-item-label">{entry.label}</span>
                </span>
                {(entry.kind === "command" && entry.shortcut) || entry.kind === "submenu" ? (
                  <span className="nse-control-list-trailing">
                    {entry.kind === "command" && entry.shortcut ? <span className="nse-menu-shortcut" data-nse-part="shortcut-column" aria-hidden="true">{entry.shortcut}</span> : null}
                    {entry.kind === "submenu" ? <span className="nse-menu-submenu-arrow" data-nse-part="submenu-arrow" data-direction={direction} aria-hidden="true" /> : null}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                {entry.kind === "command" ? (
                  <span className="nse-menu-state-column" data-nse-part="state-column" data-nse-state={entry.checked} data-state={entry.checked} aria-hidden="true" />
                ) : <span className="nse-menu-state-column" data-nse-part="state-column" aria-hidden="true" />}
                <span className="nse-menu-item-icon" data-nse-part="icon-column" aria-hidden="true">{entry.icon}</span>
                <span data-nse-part="title" className="nse-menu-item-label">{entry.label}</span>
                {entry.kind === "command" && entry.shortcut ? <span className="nse-menu-shortcut" data-nse-part="shortcut-column" aria-hidden="true">{entry.shortcut}</span> : null}
                {entry.kind === "submenu" ? <span className="nse-menu-submenu-arrow" data-nse-part="submenu-arrow" data-direction={direction} aria-hidden="true" /> : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
function textFromMenuNode(node: ReactNode): string {
  return Children.toArray(node).reduce<string>((text, child) => {
    if (typeof child === "string" || typeof child === "number") return `${text}${child}`;
    return text;
  }, "");
}

interface LocalMenuItemRecord {
  readonly item: MenuItemDefinition;
  readonly commandId: string;
}

interface LocalItemMenuModel {
  readonly model: MenuModel;
  readonly records: ReadonlyMap<string, LocalMenuItemRecord>;
}

function buildLocalItemMenuModel(
  id: string,
  label: ReactNode,
  items: readonly MenuItemDefinition[],
): LocalItemMenuModel {
  const records = new Map<string, LocalMenuItemRecord>();
  const buildEntries = (entries: readonly MenuItemDefinition[], path: string): readonly MenuEntry[] => entries.map((item, index) => {
    const entryId = `${path}:${index}`;
    if (item.separator) return { kind: "separator", id: `${entryId}:separator` };
    if (item.children?.length) {
      return {
        kind: "submenu",
        id: entryId,
        label: item.label,
        icon: item.icon,
        enabled: item.disabled !== true,
        disabledReason: item.disabledReason,
        entries: buildEntries(item.children, entryId),
      };
    }
    const commandId = `${id}:item:${index}:${path}`;
    records.set(commandId, { item, commandId });
    return {
      kind: "command",
      id: entryId,
      commandId,
      payload: item.value,
      labelOverride: item.label,
      iconOverride: item.icon,
      shortcutOverride: typeof item.shortcut === "string" ? item.shortcut : undefined,
      selectionKind: item.checked === undefined ? undefined : "checkbox",
    };
  });
  return {
    model: {
      id,
      label: textFromMenuNode(label) || id,
      entries: buildEntries(items, "root"),
    },
    records,
  };
}

interface LocalMenuRuntimeSource {
  readonly signal: AbortSignal;
  readonly scheduler?: {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
  };
}

function createLocalItemMenuRuntime(
  providerRuntime: LocalMenuRuntimeSource,
  records: ReadonlyMap<string, LocalMenuItemRecord>,
  parentResponderId: string,
  onSelect: (value: string) => void,
): NSEMenuRuntimePort {
  const runtime: NSEMenuRuntimePort = {
    signal: providerRuntime.signal,
    scheduler: providerRuntime.scheduler,
    commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validateMany: async (requests) => {
        const result = new Map<string, CommandPresentation>();
        for (const request of requests) {
          const record = records.get(request.commandId);
          const item = record?.item;
          result.set(request.key, {
            commandId: request.commandId,
            responderId: parentResponderId,
            title: textFromMenuNode(item?.label) || request.commandId,
            enabled: item?.disabled !== true,
            denied: false,
            hidden: item?.hidden === true,
            state: item?.checked === true ? "on" : "off",
            disabledReason: item?.disabledReason,
          });
        }
        return result;
      },
      prepareDispatch: async (commandId) => {
        const item = records.get(commandId)?.item;
        if (!item || item.disabled || item.hidden) return { status: "disabled", reason: "This menu item is not available." };
        return {
          status: "accepted",
          acceptance: { commandId, responderId: parentResponderId } as CommandDispatchAcceptance,
        };
      },
      dispatch: async (commandId) => {
        const item = records.get(commandId)?.item;
        if (!item || item.disabled || item.hidden) return { status: "disabled", commandId, responderId: parentResponderId, reason: "This menu item is not available." };
        onSelect(item.value);
        return {
          status: "executed",
          commandId,
          responderId: parentResponderId,
          operationId: `${commandId}:operation`,
          correlationId: `${commandId}:correlation`,
          value: item.value,
        };
      },
    },
  };
  return runtime;
}

function ItemMenu({
  label,
  items,
  open,
  defaultOpen = false,
  onOpenChange,
  onSelect,
  menuOverlay,
  parentResponderId,
  tone = "medium",
  pressHaptic = "soft",
  selectionHaptic = "selection",
  smoothSurface,
  initialFocus = "first",
  submenuDelayMs = 180,
  trigger = "push",
  triggerLabel,
  controlSize,
  height,
  className,
  ...htmlAttributes
}: ItemMenuProps) {
  const provider = useNSEOverlayProvider();
  const nearestResponderId = useContext(ActionResponderContext);
  const generatedId = useId().replace(/:/g, "");
  const triggerId = `nse-menu-trigger:${generatedId}`;
  const menuLabel = useEquivalentValue(label, sameNode);
  const menuItems = useEquivalentValue(items, sameMenuItems);
  const localMenu = useMemo(() => buildLocalItemMenuModel(`nse-item-menu:${generatedId}`, menuLabel, menuItems), [generatedId, menuItems, menuLabel]);
  const selectedRef = useRef(onSelect);
  selectedRef.current = onSelect;
  const { triggerNSEControlHaptic } = useNSEControlFeedback();
  const runtimeSource = useMemo(() => ({
    signal: provider.runtime.signal,
    scheduler: {
      setTimeout: (callback: () => void, delayMs: number) => provider.runtime.environment.setTimeout(callback, delayMs),
      clearTimeout: (handle: unknown) => provider.runtime.environment.clearTimeout(handle),
    },
  }), [provider.runtime]);
  const resolvedParentResponderId = menuOverlay?.parentResponderId ?? parentResponderId ?? nearestResponderId ?? provider.defaultParentResponderId;
  const localRuntime = useMemo(() => createLocalItemMenuRuntime(
    runtimeSource,
    localMenu.records,
    resolvedParentResponderId ?? "",
    (value) => {
      if (selectionHaptic) void triggerNSEControlHaptic(selectionHaptic);
      selectedRef.current?.(value);
    },
  ), [localMenu.records, resolvedParentResponderId, runtimeSource, selectionHaptic, triggerNSEControlHaptic]);
  const controller = useMemo(() => createReactOwnedNSEMenu({ ownerSignal: localRuntime.signal, [nseMenuModel]: localMenu.model, runtime: localRuntime }), [localMenu.model, localRuntime]);
  useMenuLifetime(controller);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [keyboardInitialFocus, setKeyboardInitialFocus] = useState<"first" | "last" | null>(null);
  const isOpen = open ?? uncontrolledOpen;
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const resolvedOverlay = useMemo(() => {
    if (menuOverlay) return menuOverlay;
    if (!resolvedParentResponderId) return null;
    return {
      id: `${localMenu.model.id}:overlay`,
      parentResponderId: resolvedParentResponderId,
    };
  }, [localMenu.model.id, menuOverlay, resolvedParentResponderId]);
  if (!resolvedParentResponderId || !resolvedOverlay) {
    throw new Error("NSEMenu requires menuOverlay provenance or an NSEStandaloneControlHost.");
  }
  const requestOpen = useCallback((nextOpen: boolean) => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange, open]);

  return (
    <span data-nse-control="pop-up-button" data-nse-part="background" data-nse-highlighted={isOpen ? "" : undefined} data-nse-pulls-down="true" className={classNames("nse-menu-trigger-host", className)} data-nse-menu-smooth-surface={smoothSurface ? "true" : undefined} {...htmlAttributes}>
      <NSEButton
        {...(trigger === "tool" ? {
          bezelStyle: "texturedRounded" as const,
          // A text face is the button's title; a glyph is its image, named by the trigger label.
          ...(typeof label === "string" || typeof label === "number"
            ? { title: label }
            : { title: triggerLabel, image: label, imagePosition: "imageOnly" as const }),
          controlSize: controlSize === "small" ? "small" as const : undefined,
          ...(height !== undefined ? { "data-size": "custom" } : {}),
          style: sizedControlStyle(undefined, height, undefined),
        } : { title: label, ...nseButtonToneProps(tone) })}
        isHighlighted={isOpen}
        toolTip={triggerLabel}
        ref={anchorRef}
        id={triggerId}
        haptic={pressHaptic}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={resolvedOverlay.id}
        onClick={() => { setKeyboardInitialFocus(null); requestOpen(!isOpen); }}
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setKeyboardInitialFocus(event.key === "ArrowUp" ? "last" : "first");
            requestOpen(true);
          }
        }}
      />
      <MenuOverlay
        overlay={resolvedOverlay}
        controller={controller}
        open={isOpen}
        anchor={anchorRef.current}
        labelledBy={triggerId}
        onOpenChange={(nextOpen) => requestOpen(nextOpen)}
      >
        <CommandMenuSurface
          model={localMenu.model}
          controller={controller}
          open={isOpen}
          labelledBy={triggerId}
          onOpenChange={(nextOpen) => requestOpen(nextOpen)}
          initialFocus={keyboardInitialFocus ?? initialFocus}
          submenuDelayMs={submenuDelayMs}
        />
      </MenuOverlay>
    </span>
  );
}

/**
 * The key equivalent in aria-keyshortcuts form. The visible shortcut column is
 * hidden from assistive technology, so the row's name stays its title.
 */
function ariaKeyShortcuts(binding: ResolvedKeyBinding | undefined): string | undefined {
  if (!binding) return undefined;
  const names: Record<string, string> = { Ctrl: "Control", Cmd: "Meta", Alt: "Alt", Shift: "Shift" };
  const modifiers = binding.display.split("+").slice(0, binding.modifiers.length).map((label) => names[label] ?? label);
  const key = binding.key === "+" ? "Plus" : binding.key === " " ? "Space" : binding.key.length === 1 ? binding.key.toLocaleUpperCase() : binding.key;
  return [...modifiers, key].join("+");
}

/** @internal The menu surface drawn by pop-up buttons, view menus and the menu bar. */
export function MenuView(props: NSEMenuProps) {
  if ("model" in props) return <CommandMenuSurface {...props} />;
  return <ItemMenu {...props} />;
}
