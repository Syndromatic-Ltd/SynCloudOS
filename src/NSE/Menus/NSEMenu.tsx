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

import { Children, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { CommandDispatchAcceptance, CommandPresentation } from "../../SynCloudOS/SynCloudOS";
import { NSEAppearanceNineSlice } from "../Appearance/NSEAppearanceNineSlice";
import { useNSEAppearanceProjection } from "../Appearance";
import { sizedControlStyle, useNSEControlFeedback } from "../Controls/Core/nseControlsShared";
import { NSEPushButton, type NSEButtonTone, type NSEPushButtonProps } from "../Controls/Buttons/NSEButtons";
import { useNSEOverlayProvider } from "../Overlays";
import { NSEMenuOverlay } from "./NSEMenuOverlay";
import { NSEMenuController, type NSEMenuController as NSEMenuControllerType } from "./NSEMenuController";
import type {
  NSEMenuEntry,
  NSEMenuItemDefinition,
  NSEMenuModel,
  NSEMenuOverlayOptions,
  NSEMenuPresentedEntry,
  NSEMenuRuntimePort,
} from "./menuTypes";
import { useNSEMenuOverlayPresentationScope } from "./menuPresentationContext";
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

function sameMenuItems(a: readonly NSEMenuItemDefinition[], b: readonly NSEMenuItemDefinition[]): boolean {
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

export interface NSECommandMenuProps {
  readonly model: NSEMenuModel;
  readonly controller: NSEMenuControllerType;
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

export interface NSEItemMenuProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onSelect" | "children"> {
  readonly label: ReactNode;
  readonly items: readonly NSEMenuItemDefinition[];
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSelect?: (value: string) => void;
  readonly menuOverlay?: NSEMenuOverlayOptions;
  readonly parentResponderId?: string;
  readonly tone?: NSEButtonTone;
  readonly pressHaptic?: NSEPushButtonProps["haptic"];
  readonly selectionHaptic?: NSEPushButtonProps["haptic"];
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

export type NSEMenuProps = NSECommandMenuProps | NSEItemMenuProps;

function isFocusable(entry: NSEMenuPresentedEntry): entry is Exclude<NSEMenuPresentedEntry, { readonly kind: "separator" | "custom" }> {
  return entry.kind !== "separator" && entry.kind !== "custom" && entry.enabled;
}

function roleFor(entry: NSEMenuPresentedEntry): "menuitem" | "menuitemcheckbox" | "menuitemradio" {
  if (entry.kind !== "command") return "menuitem";
  if (entry.selectionKind === "radio") return "menuitemradio";
  // Existing command presentations already use off/on/mixed as their
  // checked-state contract. Preserve that projection unless a caller
  // explicitly asks for a radio group.
  return entry.selectionKind === "checkbox" || entry.checked !== "off" ? "menuitemcheckbox" : "menuitem";
}

function entryLabel(entry: Exclude<NSEMenuPresentedEntry, { readonly kind: "separator" }>): string {
  return Children.toArray(entry.label).reduce<string>((text, child) => {
    if (typeof child === "string" || typeof child === "number") return `${text}${child}`;
    return text;
  }, "");
}

/** Semantic command menu surface. Its parent chooses portal/popover/sheet presentation. */
function NSECommandMenuSurface({
  model,
  controller,
  open,
  labelledBy,
  onOpenChange,
  direction = "ltr",
  initialFocus = "first",
  submenuDelayMs = 180,
  appearance = "default",
}: NSECommandMenuProps) {
  const applicationAppearance = appearance === "application-menu";
  const appearanceProjection = useNSEAppearanceProjection();
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const snapshot = useSyncExternalStore(subscribe, () => controller.snapshot, () => controller.snapshot);
  const portalPresentation = useNSEMenuOverlayPresentationScope();
  const [activeId, setActiveId] = useState<string | null>(null);
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
    if (!snapshot.open || !activeId) return;
    itemRefs.current.get(activeId)?.focus({ preventScroll: true });
  }, [activeId, snapshot.generation, snapshot.open]);

  const activate = (entry: NSEMenuPresentedEntry, delayed = false) => {
    if (entry.kind === "submenu") {
      if (!entry.enabled) return;
      void controller.openSubmenu(entry.id, delayed ? submenuDelayMs : 0);
      return;
    }
    if (entry.kind === "command" && entry.enabled) void controller.dispatch(entry.id);
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

  if (!open || !snapshot.open) return null;
  return (
    <div
      className={`nse-menu${applicationAppearance ? " nse-application-menu-list" : ""}`}
      role="menu"
      aria-labelledby={labelledBy}
      aria-busy={snapshot.validating || undefined}
      data-nse-menu-id={model.id}
      data-nse-menu-generation={snapshot.generation}
      {...appearanceProjection}
      data-nse-menu-variant={applicationAppearance ? "application-menu" : "popup"}
      dir={direction}
      onKeyDown={handleKeyDown}
    >
      <NSEAppearanceNineSlice kind="menu-surface" className="nse-menu__surface-layer" />
      {snapshot.branchPath.length > 0 ? (
        <button
          className={`nse-menu-item nse-menu-back${applicationAppearance ? " nse-control-list-item" : ""}`}
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
      {snapshot.entries.map((entry) => {
        if (entry.kind === "separator") return <div key={entry.id} className="nse-menu-separator" role="separator" />;
        if (entry.kind === "custom") return <div key={entry.id} className="nse-menu-custom" role="presentation">{entry.render()}</div>;
        const role = roleFor(entry);
        const checked = entry.kind === "command" ? entry.checked : undefined;
        return (
          <button
            key={entry.id}
            ref={(element) => {
              if (element) itemRefs.current.set(entry.id, element);
              else itemRefs.current.delete(entry.id);
            }}
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
            tabIndex={activeId === entry.id ? 0 : -1}
            title={entry.disabledReason}
            onFocus={() => setActiveId(entry.id)}
            onPointerEnter={() => entry.kind === "submenu" && activate(entry, true)}
            onPointerLeave={() => controller.cancelPendingSubmenu()}
            onClick={() => activate(entry)}
          >
            {applicationAppearance ? (
              <>
                {(entry.kind === "command" && entry.checked !== "off") || entry.icon ? (
                  <span className="nse-control-list-leading" data-nse-part="leading" aria-hidden="true">
                    {entry.kind === "command" && entry.checked !== "off" ? <span className="nse-menu-state-column" data-state={entry.checked} /> : entry.icon}
                  </span>
                ) : null}
                <span className="nse-control-list-body">
                  <span className="nse-control-list-primary nse-menu-item-label">{entry.label}</span>
                </span>
                {(entry.kind === "command" && entry.shortcut) || entry.kind === "submenu" ? (
                  <span className="nse-control-list-trailing">
                    {entry.kind === "command" && entry.shortcut ? <span className="nse-menu-shortcut" data-nse-part="shortcut-column">{entry.shortcut}</span> : null}
                    {entry.kind === "submenu" ? <span className="nse-menu-submenu-arrow" data-nse-part="submenu-arrow" data-direction={direction} aria-hidden="true" /> : null}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                {entry.kind === "command" ? (
                  <span className="nse-menu-state-column" data-nse-part="state-column" data-state={entry.checked} aria-hidden="true" />
                ) : <span className="nse-menu-state-column" data-nse-part="state-column" aria-hidden="true" />}
                <span className="nse-menu-item-icon" data-nse-part="icon-column" aria-hidden="true">{entry.icon}</span>
                <span className="nse-menu-item-label">{entry.label}</span>
                {entry.kind === "command" && entry.shortcut ? <span className="nse-menu-shortcut" data-nse-part="shortcut-column">{entry.shortcut}</span> : null}
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
  readonly item: NSEMenuItemDefinition;
  readonly commandId: string;
}

interface LocalItemMenuModel {
  readonly model: NSEMenuModel;
  readonly records: ReadonlyMap<string, LocalMenuItemRecord>;
}

function buildLocalItemMenuModel(
  id: string,
  label: ReactNode,
  items: readonly NSEMenuItemDefinition[],
): LocalItemMenuModel {
  const records = new Map<string, LocalMenuItemRecord>();
  const buildEntries = (entries: readonly NSEMenuItemDefinition[], path: string): readonly NSEMenuEntry[] => entries.map((item, index) => {
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

function NSEItemMenu({
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
}: NSEItemMenuProps) {
  const provider = useNSEOverlayProvider();
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
  const resolvedParentResponderId = menuOverlay?.parentResponderId ?? parentResponderId ?? provider.defaultParentResponderId;
  const localRuntime = useMemo(() => createLocalItemMenuRuntime(
    runtimeSource,
    localMenu.records,
    resolvedParentResponderId ?? "",
    (value) => {
      if (selectionHaptic) void triggerNSEControlHaptic(selectionHaptic);
      selectedRef.current?.(value);
    },
  ), [localMenu.records, resolvedParentResponderId, runtimeSource, selectionHaptic, triggerNSEControlHaptic]);
  const controller = useMemo(() => new NSEMenuController({ ownerSignal: localRuntime.signal, model: localMenu.model, runtime: localRuntime }), [localMenu.model, localRuntime]);
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
    <span className={classNames("nse-menu-trigger-host", className)} data-nse-menu-smooth-surface={smoothSurface ? "true" : undefined} {...htmlAttributes}>
      <NSEPushButton
        ref={anchorRef}
        id={triggerId}
        tone={trigger === "tool" ? "dark" : tone}
        haptic={pressHaptic}
        // A menu button stays lit (its selected art) while its menu is showing.
        pressed={isOpen}
        {...(trigger === "tool" ? {
          className: "nse-extended-tool-button",
          icon: label,
          "data-size": height !== undefined ? "custom" : controlSize === "small" ? "small" : undefined,
          style: sizedControlStyle(undefined, height, undefined),
        } : {})}
        aria-label={triggerLabel}
        title={triggerLabel}
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
      >
        {trigger === "tool" ? <span className="nse-control-visually-hidden">{triggerLabel}</span> : label}
      </NSEPushButton>
      <NSEMenuOverlay
        overlay={resolvedOverlay}
        controller={controller}
        open={isOpen}
        anchor={anchorRef.current}
        labelledBy={triggerId}
        onOpenChange={(nextOpen) => requestOpen(nextOpen)}
      >
        <NSECommandMenuSurface
          model={localMenu.model}
          controller={controller}
          open={isOpen}
          labelledBy={triggerId}
          onOpenChange={(nextOpen) => requestOpen(nextOpen)}
          initialFocus={keyboardInitialFocus ?? initialFocus}
          submenuDelayMs={submenuDelayMs}
        />
      </NSEMenuOverlay>
    </span>
  );
}

export function NSEMenu(props: NSEMenuProps) {
  if ("model" in props) return <NSECommandMenuSurface {...props} />;
  return <NSEItemMenu {...props} />;
}
