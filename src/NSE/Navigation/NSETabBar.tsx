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
import {
  nseThemeSlot,
  projectNSEThemeRecipe,
  useNSEVisualEnvironment,
} from "../Appearance";
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
import { neutralPeerNavigation, type NSEPeerNavigationPresentation } from "./peerNavigationPresentation";
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
  layered: boolean,
  segment: NSETabChromeSegment,
  state: NSETabChromeState,
) {
  return {
    "data-nse-tab-chrome-family": layered ? "grouped-toolbutton" : undefined,
    "data-nse-tab-chrome-variant": layered ? "tall" : undefined,
    "data-nse-tab-chrome-segment": segment,
    "data-nse-tab-chrome-state": state,
    "data-nse-tab-chrome-active": layered ? "true" : "false",
  };
}

/** CSS timing sampled for scrollLeft, which WAAPI cannot animate directly. */
function headerMotionProgress(progress: number, easing: string): number {
  if (easing === "linear") return progress;
  const [x1, y1, x2, y2] = easing === "decelerate" ? [.1, .9, .2, 1]
    : easing === "ease-in-out" ? [.42, 0, .58, 1] : [0, 0, .58, 1];
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    if (curve(mid, x1, x2) < progress) low = mid; else high = mid;
  }
  return curve((low + high) / 2, y1, y2);
}

/** Never scroll an ancestor (scrollIntoView can also jump the document). */
function revealHeader(viewport: HTMLDivElement | null, tab: HTMLButtonElement | undefined) {
  if (!viewport || !tab) return;
  const outer = viewport.getBoundingClientRect(), inner = tab.getBoundingClientRect();
  if (inner.left < outer.left) viewport.scrollLeft += inner.left - outer.left;
  else if (inner.right > outer.right) viewport.scrollLeft += inner.right - outer.right;
}

export interface NSETabBarProps {
  /** The semantic owner. This renderer never creates or disposes it. */
  readonly controller: NSETabBarController<ReactNode>;
  readonly presentation?: NSEPeerNavigationPresentation;
  readonly "aria-label": string;
  readonly className?: string;
  readonly dir?: "ltr" | "rtl";
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
  reducedMotion = false,
  renderPanels = true,
  idScope,
  presentation: explicitPresentation,
}: NSETabBarProps) {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const snapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
  const appearance = useNSEVisualEnvironment();
  const presentation = explicitPresentation ?? appearance.theme?.presentation?.peerNavigation?.compact ?? neutralPeerNavigation;
  const overflow = presentation.overflow;
  useLayoutEffect(() => {
    controller.setOverflowPolicy(overflow);
  }, [controller, overflow.kind, overflow.kind === "more" ? overflow.maximumVisibleItems : 0]);
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
  const [focusedTabId, setFocusedTabId] = useState(snapshot.activeTabId);
  const [paintFocusedTabId, setPaintFocusedTabId] = useState<string | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [pressedTabId, setPressedTabId] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const headerViewportRef = useRef<HTMLDivElement>(null);
  const headerListRef = useRef<HTMLDivElement>(null);
  const headerTailRef = useRef<HTMLSpanElement>(null);
  const headerFrameRef = useRef<number | null>(null);
  const previousHeaderId = useRef(snapshot.activeTabId);
  const alignHeaderStart = presentation.selectedHeaderAlignment === "start" && overflow.kind === "scroll";
  const headerMotion = appearance.theme?.presentation.motion?.peerNavigation;
  const controlsKey = controls.join("\0");
  const cancelHeaderMotion = useCallback(() => {
    if (headerFrameRef.current !== null) cancelAnimationFrame(headerFrameRef.current);
    headerFrameRef.current = null;
  }, []);
  useLayoutEffect(() => {
    const viewport = headerViewportRef.current, list = headerListRef.current, tail = headerTailRef.current;
    const changed = previousHeaderId.current !== snapshot.activeTabId;
    previousHeaderId.current = snapshot.activeTabId;
    if (!viewport || !list) return;
    const media = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    const align = (animate: boolean) => {
      cancelHeaderMotion();
      const tab = tabRefs.current.get(snapshot.activeTabId);
      if (!tab) return;
      if (!alignHeaderStart) {
        revealHeader(viewport, tab);
        return;
      }
      // Measure only the real labels, excluding our trailing scroll room.
      // No clones or reordered tabs: focus, ids and retained panels stay stable.
      const width = viewport.clientWidth;
      const overflowing = list.scrollWidth > width + 1;
      const last = list.lastElementChild as HTMLElement | null;
      if (tail) tail.style.width = overflowing ? `${Math.max(0, width - (last?.getBoundingClientRect().width ?? width))}px` : "0px";
      const rtl = (dir ?? getComputedStyle(viewport).direction) === "rtl";
      const outer = viewport.getBoundingClientRect(), inner = tab.getBoundingClientRect();
      const from = viewport.scrollLeft;
      const target = overflowing ? from + (rtl ? inner.right - outer.right : inner.left - outer.left) : 0;
      const duration = animate && !reducedMotion && !media?.matches && headerMotion?.kind !== "none" ? headerMotion?.durationMs ?? 0 : 0;
      if (!duration || Math.abs(target - from) < .5) { viewport.scrollLeft = target; return; }
      const started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - started) / duration));
        viewport.scrollLeft = progress === 1 ? target : from + (target - from) * headerMotionProgress(progress, headerMotion?.easing ?? "ease-out");
        if (progress < 1) headerFrameRef.current = requestAnimationFrame(tick);
        else headerFrameRef.current = null;
      };
      headerFrameRef.current = requestAnimationFrame(tick);
    };
    align(changed);
    const remeasure = () => align(false);
    let measuredWidth = viewport.clientWidth, measuredContent = list.scrollWidth;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      // The observer's initial delivery must not cancel a just-started selection.
      if (measuredWidth === viewport.clientWidth && measuredContent === list.scrollWidth) return;
      measuredWidth = viewport.clientWidth; measuredContent = list.scrollWidth;
      remeasure();
    }) : null;
    observer?.observe(viewport); observer?.observe(list);
    media?.addEventListener?.("change", remeasure);
    return () => { cancelHeaderMotion(); observer?.disconnect(); media?.removeEventListener?.("change", remeasure); };
  }, [snapshot.activeTabId, controlsKey, alignHeaderStart, dir, reducedMotion, headerMotion?.kind, headerMotion?.durationMs, headerMotion?.easing, cancelHeaderMotion]);
  const detachedFocusedTab = useRef<HTMLButtonElement | null>(null);
  const registerTab = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (node) { tabRefs.current.set(id, node); return; }
    const previous = tabRefs.current.get(id);
    if (previous && previous.ownerDocument.activeElement === previous) detachedFocusedTab.current = previous;
    tabRefs.current.delete(id);
  }, []);
  useLayoutEffect(() => {
    const previous = detachedFocusedTab.current;
    detachedFocusedTab.current = null;
    if (!previous || previous.isConnected) return;
    const document = previous.ownerDocument;
    if (document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
    const next = tabRefs.current.get(snapshot.activeTabId);
    next?.focus({ preventScroll: true });
    if (!alignHeaderStart) revealHeader(headerViewportRef.current, next);
  });

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
    setFocusedTabId(NSETabBarMoreDestinationId);
    void controller.openOverflow({ source }).catch(() => undefined);
  }, [controller]);

  const closeOverflow = useCallback(() => {
    controller.closeOverflow();
  }, [controller]);

  const focusControl = useCallback((controlId: string, source: string, activate: boolean) => {
    setFocusedTabId(controlId);
    tabRefs.current.get(controlId)?.focus({ preventScroll: true });
    if (!alignHeaderStart) revealHeader(headerViewportRef.current, tabRefs.current.get(controlId));
    if (!activate) return;
    if (controlId === NSETabBarMoreDestinationId) {
      openOverflow(source);
      return;
    }
    selectDestination(controlId, source);
  }, [openOverflow, selectDestination, alignHeaderStart]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, controlId: string) => {
    const enabledControls = controls.filter((id) => {
      if (id === NSETabBarMoreDestinationId) return true;
      return !controller.getDestination(id)?.disabled;
    });
    const currentIndex = enabledControls.indexOf(controlId);
    const index = currentIndex < 0 ? 0 : currentIndex;
    const nextForDelta = (delta: number) => enabledControls[(index + delta + enabledControls.length) % enabledControls.length];

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const direction = dir ?? getComputedStyle(event.currentTarget).direction;
      const forward = event.key === "ArrowRight" ? direction !== "rtl" : direction === "rtl";
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
  const moreSelected = snapshot.activeTabId === NSETabBarMoreDestinationId;
  const morePressed = pressedTabId === NSETabBarMoreDestinationId;
  const moreState = stateForTab(NSETabBarMoreDestinationId, moreSelected, false);
  const moreAppearance = projectNSEThemeRecipe(
    nseThemeSlot("tab-bar", "tab", moreState),
    appearance,
  );
  const moreLabelAppearance = projectNSEThemeRecipe(
    nseThemeSlot("tab-bar", "label", moreState),
    appearance,
  );
  const moreIconAppearance = projectNSEThemeRecipe(
    nseThemeSlot("tab-bar", "icon", moreState),
    appearance,
  );
  const moreIcon = projectNSENavigationIcon(nseTabBarMoreIcon, moreState);
  const moreIconStyle = tabIconStyle(nseTabBarMoreIcon);
  const unresolvedChromeSlots = [
    ...directDestinations.map((destination) => {
      const selected = snapshot.activeTabId === destination.id;
      const state = stateForTab(destination.id, selected, Boolean(destination.disabled));
      return projectNSEThemeRecipe(nseThemeSlot("tab-bar", "tab", state), appearance);
    }),
    ...(overflowDestinations.length > 0 ? [moreAppearance] : []),
  ].filter((projection) => projection.recipeId === null)
    .map((projection) => projection.slot);
  const unresolvedChromeSlotList = [...new Set(unresolvedChromeSlots)];
  const usesTallTabChrome = appearance.theme?.presentation?.tabStyle === "layered";
  const chromeStatus = unresolvedChromeSlotList.length > 0 ? "unresolved" : "resolved";
  const tabListStyle = {
    "--nse-tab-visible-count": controls.length,
    "--nse-tab-visible-minimum-width": `${controls.length * 64}px`,
    "--nse-navigation-bar-block-size": `${Math.max(44, appearance.theme?.presentation?.metrics?.navigation?.barBlockSize ?? 48)}px`,
    "--nse-navigation-edge-gap": `${appearance.theme?.presentation?.metrics?.navigation?.edgeGap ?? 0}px`,
  } as CSSProperties;

  return (
    <>
      {presentation.kind !== "panorama" ? <div
        className={classes("nse-tab-bar-safe-area", className)}
        data-nse-tab-bar="true"
        data-navigation-placement={presentation.placement}
        data-navigation-flow={presentation.flow}
        data-navigation-content={presentation.content}
        data-navigation-overflow={overflow.kind}
        data-safe-area-wrapper="true"
        data-reduced-motion={reducedMotion ? "true" : "false"}
        data-nse-tab-chrome-status={chromeStatus}
        data-nse-tab-unresolved-chrome-slots={unresolvedChromeSlotList.join(",") || undefined}
        dir={dir}
        style={tabListStyle}
      >
        <div ref={headerViewportRef} className="nse-tab-bar-scroll-viewport" data-nse-tab-scroll-viewport="true" data-selected-header-alignment={presentation.selectedHeaderAlignment ?? "nearest"} onPointerDown={cancelHeaderMotion} onWheel={cancelHeaderMotion}>
        <div
          ref={headerListRef}
          className={classes("nse-tab-bar", usesTallTabChrome && "nse-control-toolbar")}
          role="tablist"
          aria-label={ariaLabel}
          data-position={usesTallTabChrome ? "inline" : undefined}
          data-grouped={usesTallTabChrome ? "true" : undefined}
          data-nse-tab-layout={`${presentation.flow}-${presentation.placement}`}
          data-nse-tab-chrome-family={usesTallTabChrome ? "grouped-toolbutton" : undefined}
          data-nse-tab-chrome-variant={usesTallTabChrome ? "tall" : undefined}
          data-nse-tab-chrome-size={usesTallTabChrome ? "tall" : undefined}
          data-nse-tab-chrome-active={usesTallTabChrome ? "true" : "false"}
          data-nse-tab-visible-item-count={controls.length}
          data-nse-tab-overflow-count={overflowDestinations.length}
          data-nse-tab-overflow-open={overflowOpen ? "true" : "false"}
          data-reduced-motion={reducedMotion ? "true" : "false"}
          data-nse-tab-chrome-status={chromeStatus}
          data-nse-tab-unresolved-chrome-slots={unresolvedChromeSlotList.join(",") || undefined}
          style={alignHeaderStart ? { ...tabListStyle, flexShrink: 0 } : tabListStyle}
        >
        {directDestinations.map((destination, index) => {
          const selected = snapshot.activeTabId === destination.id;
          const pressed = pressedTabId === destination.id;
          const state = stateForTab(destination.id, selected, Boolean(destination.disabled));
          const tabAppearance = projectNSEThemeRecipe(
            nseThemeSlot("tab-bar", "tab", state),
            appearance,
          );
          const iconAppearance = projectNSEThemeRecipe(
            nseThemeSlot("tab-bar", "icon", state),
            appearance,
          );
          const labelAppearance = projectNSEThemeRecipe(
            nseThemeSlot("tab-bar", "label", state),
            appearance,
          );
          const badgeAppearance = destination.badge === undefined
            ? null
            : projectNSEThemeRecipe(nseThemeSlot("tab-bar", "badge", state), appearance);
          const icon = projectNSENavigationIcon(destination.icon, state);
          const iconStyle = tabIconStyle(destination.icon);
          const segment = tabChromeSegment(index, controls.length);
          const chromeState = tabChromeState(state, selected, pressed);
          return (
            <button
              className={classes("nse-tab-bar-tab", usesTallTabChrome && "nse-control-button")}
              key={destination.id}
              type="button"
              role="tab"
              id={getNSETabBarTabId(resolvedIdScope, destination.id)}
              ref={node => registerTab(destination.id, node)}
              aria-label={destination.accessibleLabel}
              aria-controls={getNSETabBarPanelId(resolvedIdScope, destination.id)}
              aria-selected={selected}
              aria-disabled={destination.disabled || undefined}
              tabIndex={destination.disabled ? -1 : focusedTabId === destination.id ? 0 : -1}
              disabled={destination.disabled}
              data-selected={selected ? "true" : "false"}
              data-pressed={pressed ? "true" : "false"}
              data-nse-tab-destination={destination.id}
              data-nse-tab-presentation-state={state}
              data-nse-tab-visual-state={tabVisualState(state, selected, pressed)}
              {...tabChromeMetadata(usesTallTabChrome, segment, chromeState)}
              {...tabAppearance.attributes}
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
                  className="nse-tab-bar-chrome-surface"
                  aria-hidden="true"
                  data-nse-tab-chrome-surface="true"
                />
              ) : null}
              <span className="nse-tab-bar-content" data-nse-tab-content="true">
                <span
                  className="nse-tab-bar-icon"
                  aria-hidden="true"
                  data-icon-kind={icon.kind}
                  data-nse-tab-icon-source={icon.source}
                  data-nse-tab-icon-ready={icon.kind === "vector" ? "true" : "false"}
                  data-nse-tab-icon-state={icon.state}
                  style={iconStyle}
                  {...iconAppearance.attributes}
                >
                  <span className="nse-tab-bar-icon-glyph" data-nse-tab-icon-glyph="true" />
                </span>
                <span className="nse-tab-bar-label" {...labelAppearance.attributes}>{destination.compactLabel ?? destination.label}</span>
                {destination.badge !== undefined && badgeAppearance ? (
                  <span className="nse-tab-bar-badge" data-nse-tab-badge="true" aria-hidden="true" {...badgeAppearance.attributes}>{destination.badge}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {overflowDestinations.length > 0 ? (
          <button
            className={classes("nse-tab-bar-tab", "nse-tab-bar-more", usesTallTabChrome && "nse-control-button")}
            type="button"
            role="tab"
            id={getNSETabBarTabId(resolvedIdScope, NSETabBarMoreDestinationId)}
            ref={node => registerTab(NSETabBarMoreDestinationId, node)}
            aria-label="More destinations"
            aria-controls={moreSelected && !overflowOpen
              ? getNSETabBarPanelId(resolvedIdScope, snapshot.selectedDestinationId) : morePanelId}
            aria-expanded={overflowOpen}
            aria-selected={moreSelected}
            tabIndex={focusedTabId === NSETabBarMoreDestinationId ? 0 : -1}
            data-selected={moreSelected ? "true" : "false"}
            data-pressed={morePressed ? "true" : "false"}
            data-nse-tab-presentation-state={moreState}
            data-nse-tab-visual-state={tabVisualState(moreState, moreSelected, morePressed)}
            {...tabChromeMetadata(
              usesTallTabChrome,
              tabChromeSegment(controls.length - 1, controls.length),
              tabChromeState(moreState, moreSelected, morePressed),
            )}
            {...moreAppearance.attributes}
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
                className="nse-tab-bar-chrome-surface"
                aria-hidden="true"
                data-nse-tab-chrome-surface="true"
              />
            ) : null}
            <span className="nse-tab-bar-content" data-nse-tab-content="true">
              <span
                className="nse-tab-bar-icon"
                aria-hidden="true"
                data-icon-kind={moreIcon.kind}
                data-nse-tab-icon-source={moreIcon.source}
                data-nse-tab-icon-ready="true"
                data-nse-tab-icon-state={moreIcon.state}
                style={moreIconStyle}
                {...moreIconAppearance.attributes}
              >
                <span className="nse-tab-bar-icon-glyph" data-nse-tab-icon-glyph="true" />
              </span>
              <span className="nse-tab-bar-label" {...moreLabelAppearance.attributes}>More</span>
            </span>
          </button>
        ) : null}
          </div>
        {alignHeaderStart ? <span ref={headerTailRef} aria-hidden="true" data-nse-tab-scroll-tail="true" style={{ flex: "0 0 auto", width: 0, pointerEvents: "none" }} /> : null}
        </div>
      </div> : null}

      {renderPanels ? <NSENavigationDestinationHost panorama={presentation.kind === "panorama" ? { title: ariaLabel } : undefined} controller={controller} idScope={resolvedIdScope} snapshot={snapshot} reducedMotion={reducedMotion} dir={dir} /> : null}
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
  const appearance = useNSEVisualEnvironment();
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
          mode={appearance.resolvedAppearance}
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
                  disabled={Boolean(destination.disabled)}
                  aria-label={destination.accessibleLabel ?? asText(destination.label)}
                  aria-current={selected ? "page" : undefined}
                  tabIndex={destination.disabled ? -1 : focusedDestinationId === destination.id ? 0 : -1}
                  data-nse-tab-overflow-destination={destination.id}
                  data-nse-list-presentation-state={state}
                  data-pressed={pressed ? "true" : "false"}
                  leading={(
                    <span
                      className="nse-tab-bar-icon"
                      aria-hidden="true"
                      data-icon-kind={icon.kind}
                      data-nse-tab-icon-source={icon.source}
                      data-nse-tab-icon-ready={icon.kind === "vector" ? "true" : "false"}
                      data-nse-tab-icon-state={icon.state}
                      style={iconStyle}
                    />
                  )}
                  trailing={destination.badge !== undefined ? (
                    <span className="nse-tab-bar-badge" data-nse-tab-badge="true">{destination.badge}</span>
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
