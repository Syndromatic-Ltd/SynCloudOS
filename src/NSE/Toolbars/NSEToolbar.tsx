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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { NSESmoothSurfaceRequest } from "../SmoothSurface";
import { classes, getControlSmoothSurfaceProps } from "../Controls/Core/nseControlsShared";
import {
  nseAppearanceSlot,
  projectNSEAppearanceSlot,
  useNSEAppearance,
} from "../Appearance";
import {
  NSEChromeBevel,
  NSEChromeCap,
  NSEChromeGloss,
  NSEChromeInnerShadow,
  NSEChromeSeparator,
  NSEChromeSplice,
  NSEChromeSurface,
  type NSEChromeVisualState,
} from "../Appearance/NSEChromePrimitives";
import { allocateNSEToolbarItems } from "./toolbarLayout";
import { NSEToolbarOverflowMenu } from "./NSEToolbarOverflowMenu";
import type { NSEToolbarController } from "./NSEToolbarController";

export interface NSEToolbarInteraction {
  readonly overflowOverlayId: string;
  readonly parentResponderId: string;
  readonly parentScopeId?: string;
}

type NSEToolbarChildrenProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  readonly composition: "children";
  readonly position?: "top" | "bottom" | "inline";
  readonly grouped?: boolean;
  readonly fadeOnKeyboard?: boolean;
  readonly smoothSurface?: NSESmoothSurfaceRequest;
  readonly children?: ReactNode;
  readonly controller?: never;
  readonly width?: never;
  readonly interaction?: never;
  readonly direction?: never;
};

type NSEToolbarConfiguredProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "role"> & {
  readonly composition: "configured";
  readonly controller: NSEToolbarController;
  /** Layout geometry is supplied by the host/runtime measurement boundary. */
  readonly width: number;
  readonly interaction: NSEToolbarInteraction;
  readonly direction?: "ltr" | "rtl";
  readonly children?: never;
  readonly position?: never;
  readonly grouped?: never;
  readonly fadeOnKeyboard?: never;
  readonly smoothSurface?: never;
};

export type NSEToolbarProps = NSEToolbarChildrenProps | NSEToolbarConfiguredProps;

function classNames(...values: readonly (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

/**
 * Configured toolbars project command authority through the preference-backed
 * controller. Child-composed toolbars use the same public component with an
 * explicit composition discriminant and keep their standalone surface behaviour here.
 */
function NSEConfiguredToolbar({
  controller,
  width,
  interaction,
  direction = "ltr",
  className,
  onKeyDown,
  ...htmlAttributes
}: NSEToolbarConfiguredProps) {
  if (!interaction.overflowOverlayId.trim()) throw new TypeError("NSE toolbars require a stable overflow overlay ID.");
  if (!interaction.parentResponderId.trim()) throw new TypeError("NSE toolbars require a parent responder ID.");
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const snapshot = useSyncExternalStore(subscribe, () => controller.snapshot, () => controller.snapshot);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const initialRefreshStarted = useRef(false);
  const initialRefreshController = useRef(controller);
  if (initialRefreshController.current !== controller) {
    initialRefreshController.current = controller;
    initialRefreshStarted.current = false;
  }
  const layout = useMemo(() => allocateNSEToolbarItems(snapshot.items, width, {
    displayMode: snapshot.displayMode,
    sizeMode: snapshot.sizeMode,
    direction,
  }), [direction, snapshot.displayMode, snapshot.items, snapshot.sizeMode, width]);
  // Do not establish a Tab stop from the disabled pre-validation projection.
  // Once command authority has published a generation, the first usable command (or the
  // overflow branch) becomes the initial roving item.
  const rovingReady = snapshot.generation > 0 && !snapshot.validating && snapshot.diagnostic === null;
  const focusableIds = useMemo(() => Object.freeze(rovingReady ? [
    ...layout.entries.filter((entry) => entry.item.kind === "command" && entry.item.enabled).map((entry) => entry.instanceId),
    ...(layout.overflowRequired ? ["overflow"] : []),
  ] : []), [layout.entries, layout.overflowRequired, rovingReady]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [pressedItemId, setPressedItemId] = useState<string | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const resolvedActiveItemId = focusableIds.includes(activeItemId ?? "")
    ? activeItemId
    : focusableIds[0] ?? null;

  useEffect(() => {
    if (initialRefreshStarted.current || snapshot.validating || snapshot.generation !== 0) return;
    initialRefreshStarted.current = true;
    void controller.refresh();
  }, [controller, snapshot.generation, snapshot.validating]);
  useEffect(() => {
    setActiveItemId((current) => focusableIds.includes(current ?? "") ? current : focusableIds[0] ?? null);
  }, [focusableIds]);

  const moveFocus = (currentId: string, delta: -1 | 1) => {
    const current = focusableIds.indexOf(currentId);
    if (current < 0 || focusableIds.length === 0) return;
    const next = focusableIds[(current + delta + focusableIds.length) % focusableIds.length]!;
    setActiveItemId(next);
    itemRefs.current.get(next)?.focus({ preventScroll: true });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.getModifierState("AltGraph")) return;
    const target = event.target as { closest?: (selector: string) => HTMLButtonElement | null } | null;
    const toolbarTarget = target?.closest?.("button[data-nse-toolbar-item-id]") ?? null;
    const currentId = toolbarTarget?.dataset.nseToolbarItemId;
    if (!currentId || focusableIds.length === 0) return;
    const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) {
      event.preventDefault();
      moveFocus(currentId, 1);
    } else if (event.key === backward) {
      event.preventDefault();
      moveFocus(currentId, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = focusableIds[0]!;
      setActiveItemId(first);
      itemRefs.current.get(first)?.focus({ preventScroll: true });
    } else if (event.key === "End") {
      event.preventDefault();
      const last = focusableIds[focusableIds.length - 1]!;
      setActiveItemId(last);
      itemRefs.current.get(last)?.focus({ preventScroll: true });
    }
  };
  const appearance = useNSEAppearance();
  const toolbarAppearance = projectNSEAppearanceSlot(
    nseAppearanceSlot("toolbar", "surface", snapshot.diagnostic ? "disabled" : "normal"),
    appearance,
  );
  const toolbarChromeState: NSEChromeVisualState = snapshot.diagnostic ? "disabled" : "normal";

  return (
    <div
      {...htmlAttributes}
      className={classNames("nse-toolbar", className)}
      role="toolbar"
      dir={direction}
      data-nse-control="toolbar"
      data-nse-part="root"
      data-state={snapshot.validating ? "loading" : snapshot.diagnostic ? "error" : "ready"}
      {...toolbarAppearance.attributes}
      data-nse-toolbar-owner={controller.configuration.owner.kind}
      data-nse-toolbar-identifier={controller.configuration.identifier}
      data-nse-toolbar-display-mode={snapshot.displayMode}
      data-nse-toolbar-size-mode={snapshot.sizeMode}
      data-nse-toolbar-validating={snapshot.validating ? "true" : undefined}
      data-nse-toolbar-overflow={layout.overflowRequired ? "true" : undefined}
      data-nse-toolbar-clipped={layout.clipped ? "true" : undefined}
      onKeyDown={handleKeyDown}
    >
      <NSEChromeSurface slot={toolbarAppearance} state={toolbarChromeState} />
      <NSEChromeBevel slot={toolbarAppearance} state={toolbarChromeState} />
      <NSEChromeGloss slot={toolbarAppearance} state={toolbarChromeState} />
      <NSEChromeInnerShadow slot={toolbarAppearance} state={toolbarChromeState} />
      {snapshot.diagnostic === "validation-failed" ? (
        <p
          role="status"
          className="nse-toolbar-validation-status"
          data-nse-part="validation-status"
          data-state="error"
          data-appearance-recipe="toolbar.validation.error"
        >
          Toolbar commands are temporarily unavailable.
        </p>
      ) : null}
      {layout.entries.map((entry) => {
        const item = entry.item;
        const geometry = { inlineSize: `${entry.allocatedWidth}px` };
        if (item.kind === "space" || item.kind === "flexible-space") {
          return <span key={entry.instanceId} className="nse-toolbar-space" style={geometry} aria-hidden="true" data-nse-part={item.kind} data-appearance-recipe={`toolbar.${item.kind}`} />;
        }
        if (item.kind === "separator") {
          const separatorAppearance = projectNSEAppearanceSlot(
            nseAppearanceSlot("toolbar", "separator", "normal"),
            appearance,
          );
          return <span key={entry.instanceId} className="nse-toolbar-separator" style={geometry} aria-hidden="true" data-nse-part="separator" {...separatorAppearance.attributes}><NSEChromeSeparator slot={separatorAppearance} state="normal" /></span>;
        }
        if (item.kind === "custom") {
          const customAppearance = projectNSEAppearanceSlot(
            nseAppearanceSlot("toolbar", "item", "normal"),
            appearance,
          );
          return (
            <span key={entry.instanceId} className="nse-toolbar-custom" style={geometry} role="group" aria-label={item.label} data-nse-control="toolbar-item" data-nse-part="custom" data-state="ready" data-nse-toolbar-item-id={entry.instanceId} data-nse-toolbar-labelled={item.showsLabel && snapshot.displayMode !== "icon-only" ? "true" : undefined} {...customAppearance.attributes}>
              <NSEChromeSurface slot={customAppearance} state="normal" />
              <NSEChromeBevel slot={customAppearance} state="normal" />
              <NSEChromeGloss slot={customAppearance} state="normal" />
              {item.showsLabel && snapshot.displayMode !== "icon-only" ? <>
                <span className="nse-toolbar-custom-view">{item.render()}</span>
                <span className="nse-toolbar-item-label" aria-hidden="true">{item.label}</span>
              </> : item.render()}
            </span>
          );
        }
        const itemAppearanceState: NSEChromeVisualState = !item.enabled
          ? "disabled"
          : item.checked === "on" || item.checked === "mixed"
            ? "selected"
            : pressedItemId === entry.instanceId
              ? "pressed"
              : focusedItemId === entry.instanceId
                ? "focused"
                : hoveredItemId === entry.instanceId
                  ? "hover"
                  : "normal";
        const itemAppearance = projectNSEAppearanceSlot(
          nseAppearanceSlot("toolbar", "item", itemAppearanceState),
          appearance,
        );
        return (
          <button
            key={entry.instanceId}
            ref={(element) => {
              if (element) itemRefs.current.set(entry.instanceId, element);
              else itemRefs.current.delete(entry.instanceId);
            }}
            type="button"
            className="nse-toolbar-item"
            // The allocation is the item's whole slot: its inline margins come out of it, so a
            // row of items fills exactly the width the layout gave it.
            style={{ inlineSize: `calc(${entry.allocatedWidth}px - 2 * var(--nse-toolbar-item-inline-margin, 0px))` }}
            data-nse-control="toolbar-item"
            data-nse-toolbar-item-id={entry.instanceId}
            data-nse-toolbar-command={item.commandId}
            data-nse-toolbar-state={item.checked}
            data-nse-toolbar-bordered={item.bordered ? undefined : "false"}
            data-nse-part="item"
            data-state={!item.enabled ? "disabled" : item.checked === "on" || item.checked === "mixed" ? "selected" : "normal"}
            {...itemAppearance.attributes}
            aria-label={item.label}
            aria-pressed={item.checked === "mixed" ? "mixed" : item.checked === "on"}
            aria-disabled={!item.enabled || undefined}
            disabled={!item.enabled}
            tabIndex={resolvedActiveItemId === entry.instanceId ? 0 : -1}
            title={item.disabledReason}
            onFocus={() => {
              setActiveItemId(entry.instanceId);
              setFocusedItemId(entry.instanceId);
            }}
            onBlur={() => setFocusedItemId((current) => current === entry.instanceId ? null : current)}
            onPointerEnter={() => setHoveredItemId(entry.instanceId)}
            onPointerLeave={() => setHoveredItemId((current) => current === entry.instanceId ? null : current)}
            onPointerDown={() => setPressedItemId(entry.instanceId)}
            onPointerUp={() => setPressedItemId((current) => current === entry.instanceId ? null : current)}
            onPointerCancel={() => setPressedItemId((current) => current === entry.instanceId ? null : current)}
            onClick={() => void controller.dispatch(entry.instanceId)}
          >
            <NSEChromeSurface slot={itemAppearance} state={itemAppearanceState} />
            <NSEChromeBevel slot={itemAppearance} state={itemAppearanceState} />
            <NSEChromeCap slot={itemAppearance} state={itemAppearanceState} />
            <NSEChromeSplice slot={itemAppearance} state={itemAppearanceState} />
            <NSEChromeGloss slot={itemAppearance} state={itemAppearanceState} />
            <NSEChromeInnerShadow slot={itemAppearance} state={itemAppearanceState} />
            {snapshot.displayMode !== "label-only" ? <span className="nse-toolbar-item-icon" aria-hidden="true">{item.icon}</span> : null}
            {snapshot.displayMode !== "icon-only" ? <span className="nse-toolbar-item-label">{item.label}</span> : null}
          </button>
        );
      })}
      {layout.overflowRequired ? (
        <NSEToolbarOverflowMenu
          controller={controller}
          entries={layout.overflowEntries}
          overlayId={interaction.overflowOverlayId}
          parentResponderId={interaction.parentResponderId}
          parentScopeId={interaction.parentScopeId}
          tabIndex={resolvedActiveItemId === "overflow" ? 0 : -1}
          onFocus={() => setActiveItemId("overflow")}
          triggerRef={(element) => {
            if (element) itemRefs.current.set("overflow", element);
            else itemRefs.current.delete("overflow");
          }}
        />
      ) : null}
    </div>
  );
}
function NSEChildrenToolbar({
  composition: _composition,
  position = "bottom",
  grouped = false,
  fadeOnKeyboard = false,
  smoothSurface = false,
  className = "",
  children,
  style,
  ...props
}: NSEToolbarChildrenProps) {
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    if (!fadeOnKeyboard || typeof document === "undefined") {
      setKeyboardUp(false);
      return;
    }
    let pendingFrame: number | null = null;
    const cancelPendingFrame = () => {
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    };
    const onFocusIn = (event: FocusEvent) => {
      cancelPendingFrame();
      if (isKeyboardField(event.target as Element)) setKeyboardUp(true);
    };
    const onFocusOut = () => {
      cancelPendingFrame();
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        setKeyboardUp(isKeyboardField(document.activeElement));
      });
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelPendingFrame();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [fadeOnKeyboard]);

  const surfaceProps = getControlSmoothSurfaceProps(smoothSurface, className, style);

  return (
    <div
      className={classes("nse-control-toolbar", keyboardUp && "nse-control-toolbar-fade-in", surfaceProps.className)}
      data-position={position}
      data-grouped={grouped ? "true" : "false"}
      data-fade-on-keyboard={fadeOnKeyboard ? "true" : undefined}
      role="toolbar"
      style={surfaceProps.style}
      {...props}
    >
      {children}
    </div>
  );
}

function isKeyboardField(node: Element | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === "TEXTAREA") return true;
  if (node.tagName === "INPUT") {
    const type = (node as HTMLInputElement).type;
    return !["button", "submit", "reset", "checkbox", "radio", "range", "file", "color", "image"].includes(type);
  }
  return false;
}

/**
 * Every toolbar chooses its ownership model explicitly. The configured branch
 * must not receive child-composition props, and the child branch must not
 * receive command authority props that it could accidentally ignore.
 */
export function NSEToolbar(props: NSEToolbarProps) {
  const rawProps = props as Record<string, unknown>;
  if (rawProps.composition !== "children" && rawProps.composition !== "configured") {
    throw new TypeError("NSE toolbar composition must be 'children' or 'configured'.");
  }
  if (props.composition === "children") {
    if (rawProps.controller !== undefined || rawProps.width !== undefined || rawProps.interaction !== undefined || rawProps.direction !== undefined) {
      throw new TypeError("NSE child toolbars cannot receive configured toolbar props.");
    }
    return <NSEChildrenToolbar {...props} />;
  }
  if (rawProps.children !== undefined && rawProps.children !== null) {
    throw new TypeError("NSE configured toolbars cannot receive children.");
  }
  if (rawProps.position !== undefined || rawProps.grouped !== undefined || rawProps.fadeOnKeyboard !== undefined || rawProps.smoothSurface !== undefined) {
    throw new TypeError("NSE configured toolbars cannot receive child-composition props.");
  }
  return <NSEConfiguredToolbar {...props} />;
}
