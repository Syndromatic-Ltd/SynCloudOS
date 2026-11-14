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
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { NSEChildViewControllerView } from "../../Application/viewControllerRenderer";
import { NSEButton } from "../../Controls/Buttons/NSEButton";
import { dataViewAllowsMutation, dataViewIsBusy, dataViewPresentsContent } from "../Core";
import { NSESplitView } from "./NSESplitView";
import { nseSplitViewLayout, type NSESplitViewController } from "./NSESplitViewController";
import type { NSESplitViewItem } from "./NSESplitViewItem";
import { useSourceListFrame } from "../../Navigation/SourceList/sourceListFrameContext";
import { NSEControllerNavigationChromeBoundary, useNSEControllerNavigationChrome } from "../../Navigation/NSEApplicationNavigationChrome";
import "./splitViewController.css";
import { WindowTitleSlotContext } from "../../Windows/windowTitlebarContext";

/**
 * Places an item's persistent host element in whichever layout slot currently shows the item. Moving
 * the host moves the item's DOM (a canvas keeps its context); React keeps the item's view mounted
 * through its portal.
 */
function PaneSlot({ host }: { readonly host: HTMLDivElement }) {
  const slot = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const node = slot.current;
    if (!node) return undefined;
    if (host.parentNode !== node) node.appendChild(host);
    return () => { if (host.parentNode === node) node.removeChild(host); };
  }, [host]);
  return <div ref={slot} data-nse-part="split-pane-slot" style={{ display: "contents" }} />;
}

const labelOf = (item: NSESplitViewItem) => item.viewController.title ?? item.identifier;

/** @internal The view an `NSESplitViewController` renders. */
export function SplitViewControllerView({ controller }: { readonly controller: NSESplitViewController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const titleSlot = useContext(WindowTitleSlotContext);
  const ownsTitleSlot = titleSlot?.root === controller && controller.splitViewItems[0]?.behavior === "sidebar";
  const titleSlotView = ownsTitleSlot ? <div ref={titleSlot.setSlot} className="nse-window-title-slot" /> : null;
  const layout = controller[nseSplitViewLayout];
  const items = controller.splitViewItems;
  const sourceListFrame = useSourceListFrame();
  const frame = items[0]?.behavior === "sidebar" ? sourceListFrame : null;
  const state = snapshot.state;
  const allowsMutation = dataViewAllowsMutation(state);
  const ariaLabel = controller.title ?? "Split view";
  const paneNodes = useRef(new Map<string, HTMLDivElement>());
  // One host per item for the view's lifetime. Split, compact and n-item presentations are different
  // trees; without stable hosts every size-class change or collapse would remount each item's view.
  const paneHosts = useRef(new Map<string, HTMLDivElement>());
  const ownerDocument = typeof document === "undefined" ? null : document;
  const hostFor = (identifier: string): HTMLDivElement | null => {
    if (!ownerDocument) return null;
    let host = paneHosts.current.get(identifier);
    if (!host) {
      host = ownerDocument.createElement("div");
      host.className = "nse-split-view-pane-host";
      host.style.display = "contents";
      host.dataset.paneHost = identifier;
      paneHosts.current.set(identifier, host);
    }
    return host;
  };
  const dragRef = useRef<{ divider: number; coordinate: number } | null>(null);
  const previousPresentation = useRef(snapshot.presentation);
  const previousActive = useRef(snapshot.activeItemIdentifier);
  const lastFocused = useRef<HTMLElement | null>(null);
  const focusReturnTargets = useRef(new Map<string, HTMLElement>());
  const restoreFocus = useRef(false);

  // Items divide the space the split view actually occupies: a split nested inside another item is
  // smaller than the window, so the window's content bounds are only the fallback before measurement.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const liveRoot = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => { liveRoot.current = node; setRoot(node); }, []);
  // Claim the actual rendered allocation before measuring it. The controller's inherited layout
  // callback measures its managed wrapper only when a custom view has no default split renderer.
  useLayoutEffect(() => controller[nseSplitViewLayout].claimBoundsAuthority(), [controller]);
  // Pane contents are persistent portals, so their React event path is a sibling of this root.
  // Listen to the document's native focus path while the initiating control is still attached.
  useLayoutEffect(() => {
    if (!root) return;
    const remember = (event: globalThis.FocusEvent) => {
      if (event.target instanceof HTMLElement) lastFocused.current = liveRoot.current?.contains(event.target) ? event.target : null;
    };
    root.ownerDocument.addEventListener("focusin", remember, true);
    return () => root.ownerDocument.removeEventListener("focusin", remember, true);
  }, [root]);
  useLayoutEffect(() => {
    if (!root) return undefined;
    const read = () => {
      const width = Math.round(root.clientWidth);
      const height = Math.round(root.clientHeight);
      if (width <= 0 || height <= 0) return;
      const { x, y } = root.getBoundingClientRect();
      setMeasured((previous) => previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height ? previous : { x, y, width, height });
    };
    read();
    const View = root.ownerDocument.defaultView;
    if (!View || typeof View.ResizeObserver !== "function") return undefined;
    const observer = new View.ResizeObserver(read);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root, controller.traitCollection.presentation?.revision]);
  // The controller may already have measured a custom outer view. An unmeasured inner view
  // cannot replace that allocation with the host's larger fallback on every render.
  const availableSize = measured ? (snapshot.isVertical ? measured.width : measured.height)
    : snapshot.availableSize > 0 ? snapshot.availableSize : null;
  useLayoutEffect(() => {
    if (availableSize !== null) layout.resize(availableSize);
    if (measured) layout.updateBounds(measured);
  }, [layout, measured, availableSize]);

  const setCompactNavigation = frame?.setCompactNavigation;
  useLayoutEffect(() => {
    setCompactNavigation?.(snapshot.presentation === "single-pane" ? true : null);
    return () => setCompactNavigation?.(null);
  }, [setCompactNavigation, snapshot.presentation]);

  const frameRailWidth = frame?.railWidth;
  useLayoutEffect(() => {
    if (frameRailWidth !== undefined && snapshot.presentation === "split" && !snapshot.bookRegions && snapshot.availableSize > 0) {
      controller.setPosition(frameRailWidth, 0);
    }
  }, [controller, frameRailWidth, snapshot.presentation, snapshot.availableSize, snapshot.bookRegions]);

  useEffect(() => {
    const live = new Set(items.map(({ identifier }) => identifier));
    for (const identifier of [...paneHosts.current.keys()]) if (!live.has(identifier)) paneHosts.current.delete(identifier);
  }, [items]);

  useLayoutEffect(() => {
    const currentRoot = liveRoot.current;
    const active = currentRoot?.ownerDocument.activeElement;
    const retained = lastFocused.current;
    if (currentRoot && retained?.isConnected && currentRoot.contains(retained) && retained.closest("[data-pane-host]") && !retained.closest("[hidden],[inert]")) {
      if (active === currentRoot.ownerDocument.body) retained.focus({ preventScroll: true });
    } else if (previousPresentation.current === "single-pane" && snapshot.presentation === "split"
      && (!active || active === currentRoot?.ownerDocument.body || currentRoot?.contains(active))) {
      paneHosts.current.get(snapshot.activeItemIdentifier)?.parentElement?.parentElement?.focus({ preventScroll: true });
    }
    previousPresentation.current = snapshot.presentation;
  }, [root, snapshot.activeItemIdentifier, snapshot.presentation]);

  useLayoutEffect(() => {
    if (snapshot.presentation === "single-pane" && previousActive.current !== snapshot.activeItemIdentifier) {
      if (restoreFocus.current) {
        restoreFocus.current = false;
        const target = focusReturnTargets.current.get(snapshot.activeItemIdentifier);
        if (target?.isConnected) target.focus({ preventScroll: true });
        else paneNodes.current.get(snapshot.activeItemIdentifier)?.focus({ preventScroll: true });
      } else {
        const target = lastFocused.current;
        if (target && paneHosts.current.get(previousActive.current)?.contains(target)) focusReturnTargets.current.set(previousActive.current, target);
        paneNodes.current.get(snapshot.activeItemIdentifier)?.focus({ preventScroll: true });
      }
    }
    previousActive.current = snapshot.activeItemIdentifier;
  }, [snapshot.activeItemIdentifier, snapshot.presentation]);

  const definitions = new Map(items.map((item) => [item.identifier, item]));
  const paneContent = (identifier: string) => {
    const host = hostFor(identifier);
    const item = definitions.get(identifier);
    return host ? <PaneSlot host={host} /> : item ? <NSEChildViewControllerView controller={item.viewController} /> : null;
  };
  const paneRef = (identifier: string) => (node: HTMLDivElement | null) => {
    if (node) paneNodes.current.set(identifier, node);
    else paneNodes.current.delete(identifier);
  };
  const visible = snapshot.items.filter(({ isCollapsed, identifier }) => !isCollapsed && definitions.has(identifier));
  const presentsContent = dataViewPresentsContent(state);
  const stateFeedback = state.kind === "ready" ? null : <>
    <span role="status">{state.message}</span>
    {(state.kind === "denied" || state.kind === "error") && state.retry && <button type="button" aria-disabled={state.kind === "denied" ? false : undefined} onClick={state.retry}>Retry</button>}
    {state.kind === "interrupted" && state.resume && <button type="button" onClick={state.resume}>Resume</button>}
  </>;
  const recoveryAvailable = ((state.kind === "denied" || state.kind === "error") && state.retry !== undefined) || (state.kind === "interrupted" && state.resume !== undefined);
  const hostDisabled = state.kind === "denied" || (!allowsMutation && !recoveryAvailable);
  const hierarchy = items.some(({ behavior }) => behavior === "sidebar" || behavior === "contentList");
  const activeIndex = visible.findIndex(({ identifier }) => identifier === snapshot.activeItemIdentifier);
  const backItem = visible[activeIndex - 1];
  const goBack = useCallback(() => {
    if (!allowsMutation || !backItem) return;
    restoreFocus.current = true;
    controller.compactItem = controller.splitViewItems.find(item => item.identifier === backItem.identifier)!;
  }, [controller, allowsMutation, backItem?.identifier]);
  const chromeId = useId();
  const stageOwnsChrome = useNSEControllerNavigationChrome(presentsContent && hierarchy && visible.length > 1 && snapshot.presentation === "single-pane" ? {
    ownerId: `split:${chromeId}`,
    title: activeIndex > 0 && controller.compactItem ? labelOf(controller.compactItem) : controller.title ?? (controller.compactItem ? labelOf(controller.compactItem) : "Split view"),
    back: backItem && allowsMutation ? { label: `Back to ${labelOf(definitions.get(backItem.identifier)!)}`, onActivate: goBack } : null,
  } : null);
  const common = {
    ref: rootRef,
    className: "nse-split-view-controller-view",
    "aria-label": ariaLabel,
    "aria-disabled": hostDisabled || undefined,
    "data-nse-control": "split-view", "data-nse-part": "background", "data-nse-enabled": hostDisabled ? "false" : undefined,
    "data-state": state.kind,
    onFocusCapture: (event: FocusEvent<HTMLDivElement>) => { lastFocused.current = event.target; },
  } as const;

  // Denied, loading and error states expose no item views at all.
  const keepAlive = presentsContent && ownerDocument
    ? items.map((item) => createPortal(<NSEChildViewControllerView controller={item.viewController} />, hostFor(item.identifier)!, item.identifier))
    : null;
  return <NSEControllerNavigationChromeBoundary>{keepAlive}{renderPresentation()}</NSEControllerNavigationChromeBoundary>;

  function renderPresentation() {
    if (!presentsContent) {
      return <div {...common} aria-busy={dataViewIsBusy(state) || undefined} data-presentation={snapshot.presentation} tabIndex={-1}>
        {stateFeedback}
      </div>;
    }

    if (snapshot.presentation === "single-pane") {
      return (
        <div {...common} data-presentation="single-pane">
          {titleSlotView}
          {hierarchy ? backItem && !stageOwnsChrome ? <div data-nse-part="split-compact-chrome">
            <NSEButton title={`Back to ${labelOf(definitions.get(backItem.identifier)!)}`} isEnabled={allowsMutation}
              onClick={goBack} />
          </div> : null : <div role="tablist" aria-label={`${ariaLabel} panes`}>
            {visible.map((item) => (
              <button
                key={item.identifier}
                type="button"
                role="tab"
                aria-selected={item.identifier === snapshot.activeItemIdentifier}
                disabled={!allowsMutation}
                onClick={() => { if (allowsMutation) controller.setActiveItem(item.identifier); }}
              >
                {labelOf(definitions.get(item.identifier)!)}
              </button>
            ))}
          </div>}
          <div ref={paneRef(snapshot.activeItemIdentifier)} role={hierarchy ? "region" : "tabpanel"}
            aria-label={hierarchy && controller.compactItem ? labelOf(controller.compactItem) : undefined}
            tabIndex={-1} data-nse-part="split-pane" data-pane-id={snapshot.activeItemIdentifier}>
            {definitions.has(snapshot.activeItemIdentifier) ? paneContent(snapshot.activeItemIdentifier) : null}
          </div>
          {stateFeedback}
        </div>
      );
    }

    if (visible.length === 2 && snapshot.isVertical) {
      const first = visible[0]!;
      const second = visible[1]!;
      return (
        <NSESplitView
          {...common}
          sidebar={(
            <div ref={paneRef(first.identifier)} tabIndex={-1} data-pane-id={first.identifier} data-nse-part="split-pane">
              {paneContent(first.identifier)}
            </div>
          )}
          sidebarWidth={first.thickness}
          minSidebarWidth={frame?.minWidth ?? 0}
          maxSidebarWidth={frame?.maxWidth ?? snapshot.availableSize}
          bookRegions={snapshot.bookRegions}
          label={`Resize ${labelOf(definitions.get(first.identifier)!)} and ${labelOf(definitions.get(second.identifier)!)}`}
          onSidebarWidthChange={(width) => {
            if (!allowsMutation) return;
            frame?.setRailWidth(width);
            if (width === null) layout.resetSizes();
            else layout.moveDivider(0, width - first.thickness);
          }}
        >
          <div ref={paneRef(second.identifier)} tabIndex={-1} data-pane-id={second.identifier} data-nse-part="split-pane">
            {titleSlotView}
            {paneContent(second.identifier)}
            {stateFeedback}
          </div>
        </NSESplitView>
      );
    }

    const orientation = snapshot.isVertical ? "horizontal" : "vertical";
    const rtl = root?.closest("[dir]")?.getAttribute("dir") === "rtl";
    const coordinate = (event: ReactPointerEvent) => snapshot.isVertical ? event.clientX : event.clientY;
    const logicalDelta = (delta: number) => snapshot.isVertical && rtl ? -delta : delta;
    const handleDividerKey = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
      if (!allowsMutation) return;
      const backwards = snapshot.isVertical ? "ArrowLeft" : "ArrowUp";
      const forwards = snapshot.isVertical ? "ArrowRight" : "ArrowDown";
      if (event.key === backwards) layout.moveDivider(index, logicalDelta(-16));
      else if (event.key === forwards) layout.moveDivider(index, logicalDelta(16));
      else if (event.key === "Home") layout.moveDividerTo(index, "minimum");
      else if (event.key === "End") layout.moveDividerTo(index, "maximum");
      else return;
      event.preventDefault();
    };

    return (
      <div
        {...common}
        data-presentation="split"
        data-orientation={orientation}
        style={{ display: "flex", flexDirection: snapshot.isVertical ? "row" : "column" }}
      >
        {visible.map((item, index) => {
          const next = visible[index + 1];
          return (
            <div key={item.identifier} style={{ display: "contents" }}>
              <div
                ref={paneRef(item.identifier)}
                tabIndex={-1}
                data-pane-id={item.identifier}
                data-nse-part="split-pane"
                style={{ flex: `0 0 ${item.thickness}px` }}
              >
                {paneContent(item.identifier)}
              </div>
              {next ? (
                <div
                  role="separator"
                  data-nse-part="split-divider"
                  data-orientation={orientation}
                  tabIndex={allowsMutation ? 0 : -1}
                  aria-label={`Resize ${labelOf(definitions.get(item.identifier)!)} and ${labelOf(definitions.get(next.identifier)!)}`}
                  aria-orientation={snapshot.isVertical ? "vertical" : "horizontal"}
                  onKeyDown={(event) => handleDividerKey(event, index)}
                  onPointerDown={(event) => {
                    if (!allowsMutation || event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragRef.current = { divider: index, coordinate: coordinate(event) };
                  }}
                  onPointerMove={(event) => {
                    const drag = dragRef.current;
                    if (!drag || drag.divider !== index) return;
                    const nextCoordinate = coordinate(event);
                    layout.moveDivider(index, logicalDelta(nextCoordinate - drag.coordinate));
                    drag.coordinate = nextCoordinate;
                  }}
                  onPointerUp={(event) => {
                    dragRef.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { dragRef.current = null; }}
                />
              ) : null}
            </div>
          );
        })}
        {stateFeedback}
      </div>
    );
  }
}
