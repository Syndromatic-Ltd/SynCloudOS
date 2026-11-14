/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useNSEAppearance } from "../Appearance/NSEAppearanceProvider";
import { WindowLayoutContext, useNSEWindowChromeElement } from "../Layout/windowChromeObstructions";
import { useNSEViewSafeArea } from "../Layout/useNSESafeArea";
import { useContext, useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { NSEOutlineView } from "../DataViews/Outline/NSEOutlineView";
import { NSESplitView } from "../DataViews/Split/NSESplitView";
import { NSETableCellView } from "../DataViews/Table/NSETableCellView";
import { TabBar, TabBarOverflowList } from "./TabBar";
import { TabBarMoreDestinationId } from "./TabBarController";
import { getNSETabBarPanelId, getNSETabBarTabId } from "./NSENavigationDestinationHost";
import { resolveNSEBookRegions } from "./bookRegions";
import { useSourceListFrame } from "./SourceList/sourceListFrameContext";
import type { NSETabViewController } from "./NSETabViewController";
import type { NSENavigationIcon } from "./navigationTypes";
import { tabViewProjection } from "./tabViewInternals";
import "./adaptiveTabView.css";
import { useNSECompactMoreTitle } from "./compactMoreTitle";

/** @internal Plain source-list data; view controllers stay with the tab view items. */
export interface AdaptiveTabOutlineItem {
  readonly identifier: string;
  readonly label: string;
  readonly image: NSENavigationIcon | undefined;
}

type Renderer = "tabs" | "rail" | "source-list-content" | "none";
type Bounds = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

// These content budgets retain the adaptive controller's existing policy. They classify the view's
// actual allocation, never a device name or physical screen. Book regions remain canonical host facts.
const railWidth = 104;
const minimumRailContentWidth = 360;
const maximumRailHeight = 480;
const sidebarMinimumWidth = 768;

/** @internal The sidebar-adaptable theme projection of NSTabViewController's items. */
export function AdaptiveTabView({ controller, scope }: { readonly controller: NSETabViewController; readonly scope: string }) {
  const frame = useSourceListFrame();
  const { theme } = useNSEAppearance();
  const root = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);
  const layout = useContext(WindowLayoutContext);
  const safeArea = useNSEViewSafeArea(root);
  const [allocation, setAllocation] = useState<Bounds | null>(null);
  const traits = controller.traitCollection.presentation;
  const previous = useRef<Renderer>("tabs");
  const bounds = allocation ?? traits?.contentBounds;
  const bookRegions = traits && bounds ? resolveNSEBookRegions(traits, bounds) : null;
  const adaptive = controller.tabStyle === "sidebarAdaptable";
  let renderer = adaptive ? previous.current : "none";
  if (adaptive && traits?.geometryState === "current" && bounds) {
    renderer = bookRegions ? "source-list-content"
      : bounds.height <= maximumRailHeight && bounds.width > bounds.height && bounds.width - railWidth >= minimumRailContentWidth ? "rail"
      : bounds.width < sidebarMinimumWidth ? "tabs" : "source-list-content";
    previous.current = renderer;
  }
  const widthClass = renderer === "source-list-content" ? "regular" : "compact";
  const navigation = theme.navigation[widthClass];
  // Existing book/short-window projections remain framework adaptations.
  if (adaptive && navigation.placement === "block-start" && !bookRegions) renderer = "tabs";
  const placement = renderer === "source-list-content" ? "source-list" : navigation.placement;
  const flow = bookRegions || renderer === "rail" ? "in-flow" : navigation.flow;
  const showsCompactChrome = controller.tabViewItems.length > 1 && (renderer === "tabs" || renderer === "rail");
  useNSEWindowChromeElement(chrome, renderer === "rail" ? "leading" : placement === "block-start" ? "top" : "bottom", flow === "overlay", showsCompactChrome);
  useNSEWindowChromeElement(sidebar, "leading", flow === "overlay", renderer === "source-list-content");
  const compact = renderer === "tabs" || renderer === "rail";
  const selected = controller.selectedTabViewItem;
  const model = tabViewProjection(controller).control();
  const outline = tabViewProjection(controller).outline();
  // The compact bar's More list stands in for the selected panel while it is open.
  const subscribeModel = useCallback((listener: () => void) => model?.subscribe(listener) ?? (() => undefined), [model]);
  const modelSnapshot = useSyncExternalStore(subscribeModel, () => model?.getSnapshot() ?? null, () => model?.getSnapshot() ?? null);
  const moreListOpen = compact && modelSnapshot?.activeTabId === TabBarMoreDestinationId
    && modelSnapshot.moreStack?.currentDestinationId === TabBarMoreDestinationId;
  useNSECompactMoreTitle(controller.view.window, Boolean(moreListOpen), root);
  const visited = useRef(new Set<string>());
  if (selected) visited.current.add(selected.identifier);
  const navigationHadFocus = useRef(false);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = element.clientWidth;
      const height = element.clientHeight;
      // Hidden or invalid geometry cannot undo the last trustworthy allocation.
      if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || width <= 0 || height <= 0) return;
      setAllocation(old => old?.x === rect.x && old.y === rect.y && old.width === width && old.height === height
        ? old : { x: rect.x, y: rect.y, width, height });
    };
    measure();
    if (layout) return layout.observeElement(element, measure);
    const Observer = element.ownerDocument.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(measure) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [layout, traits?.revision]);

  useLayoutEffect(() => {
    if (!adaptive) return undefined;
    frame?.setCompactNavigation?.(compact ? true : null);
    return () => frame?.setCompactNavigation?.(null);
  }, [adaptive, compact, frame?.setCompactNavigation]);

  useLayoutEffect(() => {
    if (selected) outline.select([selected.identifier]);
  }, [outline, selected?.identifier]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !navigationHadFocus.current) return;
    const active = element.ownerDocument.activeElement;
    if (active && active !== element.ownerDocument.body && !element.contains(active)) return;
    const target = compact
      ? element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      : element.querySelector<HTMLElement>('.nse-outline-view[data-style="source-list"]');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [renderer]);

  return <div ref={root} className="nse-adaptive-tab-controller nse-compact-bottom-chrome-owner"
    data-nse-control="tab-view" data-nse-part="content" data-nse-style="navigation"
    data-nse-navigation-placement={placement} data-nse-navigation-flow={flow}
    data-navigation-renderer={renderer}
    style={{ ...safeArea.properties, "--nse-navigation-rail-width": `${railWidth}px` } as CSSProperties}
    onFocusCapture={event => { navigationHadFocus.current = Boolean((event.target as Element).closest('.nse-adaptive-tab-sidebar, [data-nse-adaptive-tabs-chrome]')); }}
    onBlurCapture={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) navigationHadFocus.current = false; }}>
    <NSESplitView className="nse-adaptive-tab-split"
      sidebar={<div ref={sidebar} className="nse-adaptive-tab-sidebar" hidden={renderer !== "source-list-content"} inert={renderer !== "source-list-content"}>
        <NSEOutlineView controller={outline} selectionHighlightStyle="sourceList" viewportBlockSize="fill"
          aria-label={controller.title ?? "Tabs"} selectionMode="single"
          idForItem={item => item.identifier} childrenForItem={() => []} isExpandable={() => false} labelForItem={item => item.label}
          delegate={{
            renderItem: ({ item }) => <NSETableCellView primary={item.label}
              image={item.image?.kind === "vector" ? { src: item.image.path, alt: "" } : undefined} />,
            shouldSelect: identifier => {
              controller.selectTabViewItem(identifier);
              return controller.selectedTabViewItem?.identifier === identifier;
            },
          }} />
      </div>}
      sidebarWidth={frame?.railWidth} defaultSidebarWidth={frame?.defaultWidth ?? 264}
      minSidebarWidth={frame?.minWidth ?? 208} maxSidebarWidth={frame?.maxWidth ?? 460}
      onSidebarWidthChange={frame?.setRailWidth} resizable={renderer === "source-list-content"} bookRegions={adaptive ? bookRegions : null}>
      <div className="nse-adaptive-tab-content">
        {controller.tabViewItems.filter(item => visited.current.has(item.identifier)).map(item => <div key={item.identifier}
          className="nse-adaptive-tab-panel" hidden={item !== selected || moreListOpen} inert={item !== selected || moreListOpen}
          role={compact ? "tabpanel" : undefined} data-nse-role={compact ? "tabpanel" : undefined} id={getNSETabBarPanelId(scope, item.identifier)}
          aria-labelledby={compact ? getNSETabBarTabId(scope, item.identifier) : undefined}>
          <item.viewController.view />
        </div>)}
        {model && compact && modelSnapshot && modelSnapshot.overflowDestinationIds.length > 0
          ? <TabBarOverflowList controller={model} aria-label={controller.title ?? "Tabs"} idScope={scope} />
          : null}
      </div>
    </NSESplitView>
    <div ref={chrome} className={`nse-adaptive-tab-chrome${renderer === "tabs" && placement === "block-end" && flow === "overlay" ? " nse-compact-bottom-chrome-mount" : ""}`}
      hidden={!showsCompactChrome} inert={!showsCompactChrome} data-nse-adaptive-tabs-chrome="true"
      data-nse-compact-bottom-chrome={renderer === "tabs" && placement === "block-end" && flow === "overlay" ? "tabs-only" : undefined}>
      {model ? <TabBar controller={model} aria-label={controller.title ?? "Tabs"} renderPanels={false}
        orientation={renderer === "rail" ? "vertical" : "horizontal"} reducedMotion={controller.traitCollection.reducedMotion} idScope={scope} /> : null}
    </div>
  </div>;
}
