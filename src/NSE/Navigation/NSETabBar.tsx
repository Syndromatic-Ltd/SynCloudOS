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

import { useNSEMoreTitle } from "./compactMoreTitle";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { NSELabelHelp } from "../Tooltips/NSELabelHelp";
import { useNSEAppearance } from "../Appearance";
import { useOptionalNSETooltipProvider } from "../Tooltips/NSETooltipProvider";
import {
  getNSETabBarPanelId,
  getNSETabBarTabId,
  NSENavigationDestinationHost,
} from "./NSENavigationDestinationHost";
import { NSEMetalSurface } from "../Material/NSEMetalSurface";
import { NSEGroupedList } from "../Controls/Selection/NSEGroupedList";
import { NSEListItem } from "../Controls/Selection/NSEListItem";
import { NSEHierarchyStack } from "./NSEHierarchyStack";
import { NSETabBarMoreDestinationId, NSETabBarController } from "./NSETabBarController";
import {
  projectNSENavigationIcon,
  type NSENavigationIcon,
  type NSENavigationPresentationState,
} from "./navigationTypes";
import tabBarMoreIcon from "./nse-tab-bar-more.svg";

const nseTabBarMoreIcon: NSENavigationIcon = Object.freeze({ kind: "vector", path: tabBarMoreIcon });

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function asText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "destination";
}

function tabPresentationState({
  disabled,
  selected,
  pressed,
  focused,
  hovered,
}: {
  readonly disabled: boolean;
  readonly selected: boolean;
  readonly pressed: boolean;
  readonly focused: boolean;
  readonly hovered: boolean;
}): NSENavigationPresentationState {
  if (disabled) return "disabled";
  if (pressed) return "pressed";
  if (selected) return "selected";
  if (focused) return "focused";
  if (hovered) return "hover";
  return "normal";
}

type NSETabChromeSegment = "only" | "first" | "middle" | "last";

function tabChromeSegment(index: number, count: number): NSETabChromeSegment {
  if (count <= 1) return "only";
  if (index === 0) return "first";
  if (index === count - 1) return "last";
  return "middle";
}

type NSETabIconStyle = CSSProperties & {
  readonly "--nse-tab-icon-source": string;
};

function tabIconStyle(icon: NSENavigationIcon): NSETabIconStyle | undefined {
  if (icon.kind !== "vector") return undefined;
  const source = `url("${icon.path.replaceAll('"', '\\"')}")`;
  // The stylesheet masks with the source; an inline mask would outrank an
  // appearance that paints the icon in layers of its own (Atmo's ring).
  return { "--nse-tab-icon-source": source } as NSETabIconStyle;
}

function tabVisualState(
  state: NSENavigationPresentationState,
  selected: boolean,
  pressed: boolean,
) {
  return selected && pressed ? "selected-pressed" : state;
}

type NSETabChromeState = "up" | "down" | "sel" | "seldown" | "dis";

function tabChromeState(
  state: NSENavigationPresentationState,
  selected: boolean,
  pressed: boolean,
): NSETabChromeState {
  if (state === "disabled") return "dis";
  if (selected && pressed) return "seldown";
  if (selected) return "sel";
  if (pressed) return "down";
  return "up";
}

function tabChromeMetadata(
  segment: NSETabChromeSegment,
  state: NSETabChromeState,
) {
  return {
    "data-nse-tab-chrome-family": "grouped-toolbutton",
    "data-nse-tab-chrome-variant": "tall",
    "data-nse-tab-chrome-segment": segment,
    "data-nse-tab-chrome-state": state,
    "data-nse-tab-chrome-active": "true",
  };
}

/**
 * The tall-chrome icon material, as the Atmo UserInfo glyph paints it: the
 * ring and glyph are 75% translucent, with a soft white rim just inside every
 * edge and a drop shadow that is knocked out from under the body (so the bar
 * shows through rather than the shadow). CSS masks can paint the body but not
 * an inner rim, so Atmo reaches this filter through `--nse-tab-icon-material`.
 */
function NSETabIconMaterial({ id }: { readonly id: string }) {
  return (
    <svg className="nse-tab-bar-icon-material" aria-hidden="true" focusable="false" width="0" height="0">
      <filter id={id} x="-20%" y="-20%" width="140%" height="150%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .78 0" result="body" />
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.75" result="soft" />
        <feComposite in="SourceAlpha" in2="soft" operator="out" result="edge" />
        <feFlood floodColor="#fff" floodOpacity="0.85" />
        <feComposite in2="edge" operator="in" result="rim" />
        <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
        <feOffset dy="1.2" result="drop" />
        <feFlood floodColor="#000" floodOpacity="0.62" />
        <feComposite in2="drop" operator="in" />
        <feComposite in2="SourceAlpha" operator="out" result="shadow" />
        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="body" />
          <feMergeNode in="rim" />
        </feMerge>
      </filter>
    </svg>
  );
}

export interface NSETabBarProps {
  /** The semantic owner. This renderer never creates or disposes it. */
  readonly controller: NSETabBarController<ReactNode>;
  readonly "aria-label": string;
  readonly className?: string;
  readonly dir?: "ltr" | "rtl";
  /** Same tabs and retained panels, projected into an independently scrollable rail. */
  readonly orientation?: "horizontal" | "vertical";
  /** Structural hook only in NavigationFoundation; appearance work is deferred to AppearanceAuthority. */
  readonly reducedMotion?: boolean;
  /** A source-list projection supplies one external stable host instead. */
  readonly renderPanels?: boolean;
  /** Internal shared scope for an external destination host and this tab strip. */
  readonly idScope?: string;
}

/**
 * Functional projection of a semantic tab controller. Appearance adds only
 * optional paint layers; navigation, retention, safe-area and accessibility
 * contracts remain controller-owned.
 */
export function NSETabBar({
  controller,
  "aria-label": ariaLabel,
  className,
  dir,
  orientation = "horizontal",
  reducedMotion = false,
  renderPanels = true,
  idScope,
}: NSETabBarProps) {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);

  const generatedIdScope = useId().replace(/:/g, "");
  const resolvedIdScope = idScope ?? generatedIdScope;
  const directDestinations = snapshot.directDestinationIds.flatMap((id) => {
    const destination = controller.getDestination(id);
    return destination ? [destination] : [];
  });
  const overflowDestinations = snapshot.overflowDestinationIds.flatMap((id) => {
    const destination = controller.getDestination(id);
    return destination ? [destination] : [];
  });
  const controls = [
    ...directDestinations.map(({ id }) => id),
    ...(overflowDestinations.length > 0 ? [NSETabBarMoreDestinationId] : []),
  ];
  const overflowOpen = snapshot.moreStack?.currentDestinationId === NSETabBarMoreDestinationId;
  const tooltips = useOptionalNSETooltipProvider();
  const [focusedTabId, setFocusedTabId] = useState(snapshot.activeTabId);
  const [paintFocusedTabId, setPaintFocusedTabId] = useState<string | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [pressedTabId, setPressedTabId] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    setFocusedTabId(snapshot.activeTabId);
  }, [snapshot.activeTabId]);

  const selectDestination = useCallback((destinationId: string, source: string, focusControlId = destinationId) => {
    const destination = controller.getDestination(destinationId);
    if (!destination || destination.disabled) return;
    setFocusedTabId(focusControlId);
    void controller.select(destinationId, { source }).catch(() => undefined);
  }, [controller]);

  const openOverflow = useCallback((source: string) => {
    tooltips?.dismissActive();
    setFocusedTabId(NSETabBarMoreDestinationId);
    void controller.openOverflow({ source }).catch(() => undefined);
  }, [controller, tooltips]);

  const closeOverflow = useCallback(() => {
    tooltips?.dismissActive();
    controller.closeOverflow();
  }, [controller, tooltips]);

  const focusControl = useCallback((controlId: string, source: string, activate: boolean) => {
    setFocusedTabId(controlId);
    const control = tabRefs.current.get(controlId);
    // Keyboard roving retains visible intent even after programmatic entry.
    control?.focus({ focusVisible: true } as FocusOptions);
    if (orientation === "vertical") control?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (!activate) return;
    if (controlId === NSETabBarMoreDestinationId) {
      openOverflow(source);
      return;
    }
    selectDestination(controlId, source);
  }, [openOverflow, orientation, selectDestination]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, controlId: string) => {
    const enabledControls = controls.filter((id) => {
      if (id === NSETabBarMoreDestinationId) return true;
      return !controller.getDestination(id)?.disabled;
    });
    const currentIndex = enabledControls.indexOf(controlId);
    const index = currentIndex < 0 ? 0 : currentIndex;
    const nextForDelta = (delta: number) => enabledControls[(index + delta + enabledControls.length) % enabledControls.length];

    const vertical = orientation === "vertical";
    if (vertical ? event.key === "ArrowDown" || event.key === "ArrowUp" : event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
      const forward = vertical ? event.key === "ArrowDown" : event.key === "ArrowRight" ? !rtl : rtl;
      const target = nextForDelta(forward ? 1 : -1);
      if (target) focusControl(target, "keyboard", true);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? enabledControls[0] : enabledControls.at(-1);
      if (target) focusControl(target, "keyboard", true);
      return;
    }
    if (controlId === NSETabBarMoreDestinationId && (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (overflowOpen) closeOverflow();
      else openOverflow("keyboard");
      return;
    }
    if (event.key === "Escape" && controlId === NSETabBarMoreDestinationId && overflowOpen) {
      event.preventDefault();
      closeOverflow();
    }
  };

  const activateTouch = (event: ReactPointerEvent<HTMLButtonElement>, destinationId: string) => {
    if (event.pointerType !== "touch") return;
    event.preventDefault();
    selectDestination(destinationId, "touch");
  };
  const morePanelId = getNSETabBarPanelId(resolvedIdScope, NSETabBarMoreDestinationId);
  const stateForTab = (
    controlId: string,
    selected: boolean,
    disabled: boolean,
  ): NSENavigationPresentationState => tabPresentationState({
    disabled,
    selected,
    pressed: pressedTabId === controlId,
    focused: paintFocusedTabId === controlId,
    hovered: hoveredTabId === controlId,
  });
  const moreTitle = useNSEMoreTitle();
  const moreSelected = snapshot.activeTabId === NSETabBarMoreDestinationId;
  const morePressed = pressedTabId === NSETabBarMoreDestinationId;
  const moreState = stateForTab(NSETabBarMoreDestinationId, moreSelected, false);


  const moreIcon = projectNSENavigationIcon(nseTabBarMoreIcon, moreState);
  const moreIconStyle = tabIconStyle(nseTabBarMoreIcon);

  const usesTallTabChrome = true;
  const iconMaterialId = `${resolvedIdScope.replace(/[^\w-]/g, "")}-nse-tab-icon-material`;
  const tabListStyle = {
    "--nse-tab-visible-count": controls.length,
    "--nse-tab-visible-minimum-width": `${controls.length * 64}px`,
    ...(usesTallTabChrome ? { "--nse-tab-icon-material": `url("#${iconMaterialId}")` } : {}),
  } as CSSProperties;

  return (
    <>
      <div
        className={classes("nse-tab-bar-safe-area", className)}
        data-nse-control="tab-view" data-nse-part="background" data-nse-style="navigation" data-nse-orientation={orientation}
        data-nse-tab-bar="true"
        data-orientation={orientation}
        data-safe-area-wrapper="true"
        data-reduced-motion={reducedMotion ? "true" : "false"}
        dir={dir}
        style={tabListStyle}
      >
        {usesTallTabChrome ? <NSETabIconMaterial id={iconMaterialId} /> : null}
        <div className="nse-tab-bar-scroll-viewport" data-nse-part="viewport" data-nse-tab-scroll-viewport="true">
        <div
          className={classes("nse-tab-bar", usesTallTabChrome && "nse-control-toolbar")}
          data-nse-part="header" data-nse-control-size={usesTallTabChrome ? "large" : "regular"} role="tablist"
          aria-orientation={orientation}
          aria-label={ariaLabel}
          data-position={usesTallTabChrome ? "inline" : undefined}
          data-grouped={usesTallTabChrome ? "true" : undefined}
          data-nse-tab-layout={orientation === "vertical" ? "side-rail" : "floating-bottom"}
          data-nse-tab-chrome-family={usesTallTabChrome ? "grouped-toolbutton" : undefined}
          data-nse-tab-chrome-variant={usesTallTabChrome ? "tall" : undefined}
          data-nse-tab-chrome-size={usesTallTabChrome ? "tall" : undefined}
          data-nse-tab-chrome-active={usesTallTabChrome ? "true" : "false"}
          data-nse-tab-visible-item-count={controls.length}
          data-nse-tab-overflow-count={overflowDestinations.length}
          data-nse-tab-overflow-open={overflowOpen ? "true" : "false"}
          data-reduced-motion={reducedMotion ? "true" : "false"}
          style={tabListStyle}
        >
        {directDestinations.map((destination, index) => {
          const selected = snapshot.activeTabId === destination.id;
          const pressed = pressedTabId === destination.id;
          const state = stateForTab(destination.id, selected, Boolean(destination.disabled));


          const icon = projectNSENavigationIcon(destination.icon, state);
          const iconStyle = tabIconStyle(destination.icon);
          const segment = tabChromeSegment(index, orientation === "vertical" ? 1 : controls.length);
          const chromeState = tabChromeState(state, selected, pressed);
          return (
            <NSELabelHelp key={destination.id} label={destination.accessibleLabel ?? destination.label}><button
              className={classes("nse-tab-bar-tab", usesTallTabChrome && "nse-control-button")}
              key={destination.id}
              type="button"
              role="tab"
              id={getNSETabBarTabId(resolvedIdScope, destination.id)}
              ref={(node) => {
                if (node) tabRefs.current.set(destination.id, node);
                else tabRefs.current.delete(destination.id);
              }}
              aria-label={destination.accessibleLabel}
              aria-controls={getNSETabBarPanelId(resolvedIdScope, destination.id)}
              data-nse-part="cell" data-nse-role="tab" data-nse-control-size={usesTallTabChrome ? "large" : "regular"} data-nse-position={segment} data-nse-selected={selected ? "" : undefined} data-nse-highlighted={pressed ? "" : undefined} data-nse-enabled={destination.disabled ? "false" : undefined} data-nse-hovered={hoveredTabId === destination.id ? "" : undefined} data-nse-focused={paintFocusedTabId === destination.id ? "" : undefined}
              aria-selected={selected}
              aria-disabled={destination.disabled || undefined}
              tabIndex={destination.disabled ? -1 : focusedTabId === destination.id ? 0 : -1}
              disabled={destination.disabled}
              data-selected={selected ? "true" : "false"}
              data-pressed={pressed ? "true" : "false"}
              data-nse-tab-destination={destination.id}
              data-nse-tab-presentation-state={state}
              data-nse-tab-visual-state={tabVisualState(state, selected, pressed)}
              {...tabChromeMetadata(segment, chromeState)}

              onFocus={() => {
                setFocusedTabId(destination.id);
                setPaintFocusedTabId(destination.id);
              }}
              onBlur={() => setPaintFocusedTabId((current) => current === destination.id ? null : current)}
              onPointerEnter={() => setHoveredTabId(destination.id)}
              onPointerLeave={() => {
                setHoveredTabId((current) => current === destination.id ? null : current);
                setPressedTabId((current) => current === destination.id ? null : current);
              }}
              onPointerDown={() => setPressedTabId(destination.id)}
              onPointerUp={(event) => {
                setPressedTabId((current) => current === destination.id ? null : current);
                activateTouch(event, destination.id);
              }}
              onPointerCancel={() => setPressedTabId((current) => current === destination.id ? null : current)}
              onClick={() => selectDestination(destination.id, "pointer")}
              onKeyDown={(event) => handleKeyDown(event, destination.id)}
            >
              {usesTallTabChrome ? (
                <span
                  data-nse-part="bezel" className="nse-tab-bar-chrome-surface"
                  aria-hidden="true"
                  data-nse-tab-chrome-surface="true"
                />
              ) : null}
              <span data-nse-part="content" className="nse-tab-bar-content" data-nse-tab-content="true">
                <span
                  data-nse-part="image" data-nse-type={icon.kind} className="nse-tab-bar-icon"
                  aria-hidden="true"
                  data-icon-kind={icon.kind}
                  data-nse-tab-icon-source={icon.source}
                  data-nse-tab-icon-ready={icon.kind === "vector" ? "true" : "false"}
                  data-nse-tab-icon-state={icon.state}
                  style={iconStyle}

                >
                  <span data-nse-part="indicator" className="nse-tab-bar-icon-glyph" data-nse-tab-icon-glyph="true" />
                </span>
                <span data-nse-part="title" className="nse-tab-bar-label" >{destination.compactLabel ?? destination.label}</span>
                {destination.badge !== undefined ? (
                  <span data-nse-part="badge" className="nse-tab-bar-badge" data-nse-tab-badge="true" aria-hidden="true" >{destination.badge}</span>
                ) : null}
              </span>
            </button></NSELabelHelp>
          );
        })}
        {overflowDestinations.length > 0 ? (
          <NSELabelHelp label="More destinations"><button
            className={classes("nse-tab-bar-tab", "nse-tab-bar-more", usesTallTabChrome && "nse-control-button")}
            type="button"
            role="tab"
            id={getNSETabBarTabId(resolvedIdScope, NSETabBarMoreDestinationId)}
            ref={(node) => {
              if (node) tabRefs.current.set(NSETabBarMoreDestinationId, node);
              else tabRefs.current.delete(NSETabBarMoreDestinationId);
            }}
            aria-label="More destinations"
            aria-controls={morePanelId}
            aria-expanded={overflowOpen}
            data-nse-part="cell" data-nse-role="tab" data-nse-control-size={usesTallTabChrome ? "large" : "regular"} data-nse-position={tabChromeSegment(controls.length - 1, orientation === "vertical" ? 1 : controls.length)} data-nse-selected={moreSelected ? "" : undefined} data-nse-highlighted={morePressed ? "" : undefined} data-nse-hovered={hoveredTabId === NSETabBarMoreDestinationId ? "" : undefined} data-nse-focused={paintFocusedTabId === NSETabBarMoreDestinationId ? "" : undefined}
            aria-selected={moreSelected}
            tabIndex={focusedTabId === NSETabBarMoreDestinationId ? 0 : -1}
            data-selected={moreSelected ? "true" : "false"}
            data-pressed={morePressed ? "true" : "false"}
            data-nse-tab-presentation-state={moreState}
            data-nse-tab-visual-state={tabVisualState(moreState, moreSelected, morePressed)}
            {...tabChromeMetadata(
              tabChromeSegment(controls.length - 1, orientation === "vertical" ? 1 : controls.length),
              tabChromeState(moreState, moreSelected, morePressed),
            )}

            onFocus={() => {
              setFocusedTabId(NSETabBarMoreDestinationId);
              setPaintFocusedTabId(NSETabBarMoreDestinationId);
            }}
            onBlur={() => setPaintFocusedTabId((current) => current === NSETabBarMoreDestinationId ? null : current)}
            onPointerEnter={() => setHoveredTabId(NSETabBarMoreDestinationId)}
            onPointerLeave={() => {
              setHoveredTabId((current) => current === NSETabBarMoreDestinationId ? null : current);
              setPressedTabId((current) => current === NSETabBarMoreDestinationId ? null : current);
            }}
            onPointerDown={() => setPressedTabId(NSETabBarMoreDestinationId)}
            onPointerUp={() => setPressedTabId((current) => current === NSETabBarMoreDestinationId ? null : current)}
            onPointerCancel={() => setPressedTabId((current) => current === NSETabBarMoreDestinationId ? null : current)}
            onClick={() => {
              if (overflowOpen) closeOverflow();
              else openOverflow("pointer");
            }}
            onKeyDown={(event) => handleKeyDown(event, NSETabBarMoreDestinationId)}
          >
            {usesTallTabChrome ? (
              <span
                data-nse-part="bezel" className="nse-tab-bar-chrome-surface"
                aria-hidden="true"
                data-nse-tab-chrome-surface="true"
              />
            ) : null}
            <span data-nse-part="content" className="nse-tab-bar-content" data-nse-tab-content="true">
              <span
                data-nse-part="image" data-nse-type="vector" className="nse-tab-bar-icon"
                aria-hidden="true"
                data-icon-kind={moreIcon.kind}
                data-nse-tab-icon-source={moreIcon.source}
                data-nse-tab-icon-ready="true"
                data-nse-tab-icon-state={moreIcon.state}
                style={moreIconStyle}

              >
                <span data-nse-part="indicator" className="nse-tab-bar-icon-glyph" data-nse-tab-icon-glyph="true" />
              </span>
              <span data-nse-part="title" className="nse-tab-bar-label" >{moreTitle}</span>
            </span>
          </button></NSELabelHelp>
        ) : null}
          </div>
        </div>
      </div>

      {renderPanels ? <NSENavigationDestinationHost controller={controller} idScope={resolvedIdScope} snapshot={snapshot} /> : null}
    </>
  );
}

export interface NSETabBarOverflowListProps {
  /** The same tab controller that owns the semantic More stack. */
  readonly controller: NSETabBarController<ReactNode>;
  /** Names both the parent tab system and the return target in shared chrome. */
  readonly "aria-label": string;
  /** Must match the companion NSETabBar scope when one is supplied. */
  readonly idScope?: string;
  readonly className?: string;
  /** Explicit top-level application ownership. Embedded and fixture More stacks omit it. */
  readonly applicationChrome?: Readonly<{ readonly ownerId: string }>;
}

/**
 * The retained More stack is deliberately rendered as a hierarchy page rather
 * than a popup/listbox. This preserves a five-item bottom bar, makes its Back
 * transition stage-owned, and leaves all real destinations under the original
 * NSETabBarController.
 */
export function NSETabBarOverflowList({
  controller,
  "aria-label": ariaLabel,
  idScope,
  className,
  applicationChrome,
}: NSETabBarOverflowListProps) {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
  const appearance = useNSEAppearance();
  const generatedIdScope = useId().replace(/:/g, "");
  const resolvedIdScope = idScope ?? generatedIdScope;
  const overflowDestinations = snapshot.overflowDestinationIds.flatMap((id) => {
    const destination = controller.getDestination(id);
    return destination ? [destination] : [];
  });
  const overflowOpen = snapshot.moreStack?.currentDestinationId === NSETabBarMoreDestinationId;
  const moreHierarchyActive = Boolean(snapshot.moreStack?.path.length);
  const [focusedDestinationId, setFocusedDestinationId] = useState<string | null>(null);
  const [paintFocusedDestinationId, setPaintFocusedDestinationId] = useState<string | null>(null);
  const [hoveredDestinationId, setHoveredDestinationId] = useState<string | null>(null);
  const [pressedDestinationId, setPressedDestinationId] = useState<string | null>(null);
  const [externalPanel, setExternalPanel] = useState<HTMLElement | null>(null);
  const [ownsPanel, setOwnsPanel] = useState(false);
  const ownedPanelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<string, HTMLDivElement>());
  const overflowScrollTopRef = useRef(0);
  const moreStack = controller.moreStack;
  const morePanelId = getNSETabBarPanelId(resolvedIdScope, NSETabBarMoreDestinationId);
  const moreTabId = getNSETabBarTabId(resolvedIdScope, NSETabBarMoreDestinationId);
  const enabledOverflowDestinationIds = overflowDestinations
    .filter((destination) => !destination.disabled)
    .map((destination) => destination.id);
  const overflowKey = enabledOverflowDestinationIds.join("\u0000");

  useLayoutEffect(() => {
    const mountedPanel = document.getElementById(morePanelId);
    if (mountedPanel && mountedPanel !== ownedPanelRef.current) {
      setExternalPanel(mountedPanel);
      setOwnsPanel(false);
      return;
    }
    setExternalPanel(null);
    setOwnsPanel(true);
  }, [morePanelId]);

  useLayoutEffect(() => {
    if (!overflowOpen) return;
    const surface = document.getElementById(morePanelId)
      ?.querySelector<HTMLElement>(".nse-tab-bar-overflow-metal-surface");
    if (surface) surface.scrollTop = overflowScrollTopRef.current;
  }, [morePanelId, overflowOpen]);

  useEffect(() => {
    if (!overflowOpen) return;
    const next = enabledOverflowDestinationIds.includes(focusedDestinationId ?? "")
      ? focusedDestinationId
      : enabledOverflowDestinationIds[0] ?? null;
    setFocusedDestinationId(next);
    if (next) optionRefs.current.get(next)?.focus({ preventScroll: true });
  }, [focusedDestinationId, overflowKey, overflowOpen]);

  const restoreMoreFocus = useCallback(() => {
    controller.closeOverflow();
    queueMicrotask(() => document.getElementById(getNSETabBarTabId(resolvedIdScope, NSETabBarMoreDestinationId))?.focus());
  }, [controller, resolvedIdScope]);

  const selectOverflowDestination = useCallback((destinationId: string, source: string) => {
    const destination = controller.getDestination(destinationId);
    if (!destination || destination.disabled) return;
    void controller.select(destinationId, { source })
      .then(() => queueMicrotask(() => document.getElementById(
        getNSETabBarTabId(resolvedIdScope, NSETabBarMoreDestinationId),
      )?.focus()))
      .catch(() => undefined);
  }, [controller, resolvedIdScope]);

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLDivElement>, destinationId: string) => {
    const currentIndex = enabledOverflowDestinationIds.indexOf(destinationId);
    const index = currentIndex < 0 ? 0 : currentIndex;
    const focusDestination = (next: string | undefined) => {
      if (!next) return;
      event.preventDefault();
      setFocusedDestinationId(next);
      optionRefs.current.get(next)?.focus();
    };
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      focusDestination(enabledOverflowDestinationIds[(index + 1) % enabledOverflowDestinationIds.length]);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      focusDestination(enabledOverflowDestinationIds[(index - 1 + enabledOverflowDestinationIds.length) % enabledOverflowDestinationIds.length]);
      return;
    }
    if (event.key === "Home") {
      focusDestination(enabledOverflowDestinationIds[0]);
      return;
    }
    if (event.key === "End") {
      focusDestination(enabledOverflowDestinationIds.at(-1));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      restoreMoreFocus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOverflowDestination(destinationId, "keyboard");
    }
  };

  if (!moreStack) return null;

  const overflowPage = overflowOpen && moreHierarchyActive ? (
    <section
      className={classes("nse-tab-bar-overflow-page", !ownsPanel && className)}
      data-nse-tab-overflow-page="true"
      data-nse-tab-overflow-source-controller={controller.id}
    >
      <div className="nse-tab-bar-overflow-region" role="region" aria-label="More destinations">
        <NSEMetalSurface
          mode={appearance.resolvedColourScheme}
          className="nse-tab-bar-overflow-metal-surface"
          onScroll={(event) => {
            overflowScrollTopRef.current = event.currentTarget.scrollTop;
          }}
        >
          <NSEGroupedList className="nse-tab-bar-overflow-group" aria-label="More destinations">
            {overflowDestinations.map((destination) => {
              const selected = snapshot.selectedDestinationId === destination.id;
              const pressed = pressedDestinationId === destination.id;
              const state = tabPresentationState({
                disabled: Boolean(destination.disabled),
                selected,
                pressed,
                focused: paintFocusedDestinationId === destination.id,
                hovered: hoveredDestinationId === destination.id,
              });
              const icon = projectNSENavigationIcon(destination.icon, state);
              const iconStyle = tabIconStyle(destination.icon);
              return (
                <NSEListItem
                  key={destination.id}
                  className="nse-tab-bar-overflow-option"
                  ref={(node) => {
                    if (node) optionRefs.current.set(destination.id, node);
                    else optionRefs.current.delete(destination.id);
                  }}
                  role="button"
                  selected={selected}
                  isEnabled={!destination.disabled}
                  aria-label={destination.accessibleLabel ?? asText(destination.label)}
                  aria-current={selected ? "page" : undefined}
                  tabIndex={destination.disabled ? -1 : focusedDestinationId === destination.id ? 0 : -1}
                  data-nse-tab-overflow-destination={destination.id}
                  data-nse-list-presentation-state={state}
                  data-pressed={pressed ? "true" : "false"}
                  leading={(
                    <span
                      data-nse-part="image" data-nse-type={icon.kind} className="nse-tab-bar-icon"
                      aria-hidden="true"
                      data-icon-kind={icon.kind}
                      data-nse-tab-icon-source={icon.source}
                      data-nse-tab-icon-ready={icon.kind === "vector" ? "true" : "false"}
                      data-nse-tab-icon-state={icon.state}
                      style={iconStyle}
                    />
                  )}
                  trailing={destination.badge !== undefined ? (
                    <span data-nse-part="badge" className="nse-tab-bar-badge" data-nse-tab-badge="true">{destination.badge}</span>
                  ) : undefined}
                  onFocus={() => {
                    setFocusedDestinationId(destination.id);
                    setPaintFocusedDestinationId(destination.id);
                  }}
                  onBlur={() => setPaintFocusedDestinationId((current) => current === destination.id ? null : current)}
                  onPointerEnter={() => setHoveredDestinationId(destination.id)}
                  onPointerLeave={() => {
                    setHoveredDestinationId((current) => current === destination.id ? null : current);
                    setPressedDestinationId((current) => current === destination.id ? null : current);
                  }}
                  onPointerDown={() => setPressedDestinationId(destination.id)}
                  onPointerUp={(event) => {
                    setPressedDestinationId((current) => current === destination.id ? null : current);
                    if (event.pointerType === "touch") {
                      event.preventDefault();
                      selectOverflowDestination(destination.id, "touch");
                    }
                  }}
                  onPointerCancel={() => setPressedDestinationId((current) => current === destination.id ? null : current)}
                  onKeyDown={(event) => handleOptionKeyDown(event, destination.id)}
                  onClick={(event) => {
                    // Pointer/touch activation can synchronously hide the
                    // source row. Make it the hierarchy's explicit focus
                    // return target before the semantic destination push.
                    event.currentTarget.focus({ preventScroll: true });
                    selectOverflowDestination(destination.id, "pointer");
                  }}
                >
                  {destination.label}
                </NSEListItem>
              );
            })}
          </NSEGroupedList>
        </NSEMetalSurface>
      </div>
    </section>
  ) : null;

  return (
    <>
      {moreHierarchyActive ? (
        <NSEHierarchyStack
          controller={controller}
          stackController={moreStack}
          applicationChrome={applicationChrome}
          title={overflowOpen ? "More destinations" : undefined}
          backLabel={overflowOpen ? `Back to ${ariaLabel}` : undefined}
          onBack={overflowOpen ? restoreMoreFocus : undefined}
          aria-label={`${ariaLabel} More navigation`}
        />
      ) : null}
      {ownsPanel ? (
        <div
          ref={ownedPanelRef}
          id={morePanelId}
          className={classes("nse-tab-bar-panel nse-tab-bar-more-panel", className)}
          role="tabpanel"
          aria-label="More destinations"
          aria-labelledby={moreTabId}
          aria-hidden={snapshot.activeTabId !== NSETabBarMoreDestinationId || undefined}
          inert={snapshot.activeTabId !== NSETabBarMoreDestinationId}
          hidden={snapshot.activeTabId !== NSETabBarMoreDestinationId}
          data-nse-tab-panel={NSETabBarMoreDestinationId}
          data-nse-tab-overflow-owned-panel="true"
          data-nse-tab-overflow-page-open={overflowOpen || undefined}
        >
          {overflowPage}
        </div>
      ) : externalPanel && overflowPage ? createPortal(overflowPage, externalPanel) : null}
    </>
  );
}
