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
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { NSEChildViewControllerView } from "../../Application/viewControllerRenderer";
import { dataViewAllowsMutation, dataViewIsBusy, dataViewPresentsContent } from "../Core";
import { NSESplitView } from "./NSESplitView";
import { nseSplitViewLayout, type NSESplitViewController } from "./NSESplitViewController";
import type { NSESplitViewItem } from "./NSESplitViewItem";

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

/** A split view inside another split view's item never collapses to one item; the outermost one does. */
function isNestedSplit(controller: NSESplitViewController): boolean {
  for (let ancestor = controller.parent; ancestor; ancestor = ancestor.parent) {
    if ((ancestor as { readonly [nseSplitViewLayout]?: unknown })[nseSplitViewLayout] !== undefined) return true;
  }
  return false;
}

const labelOf = (item: NSESplitViewItem) => item.viewController.title ?? item.identifier;

/** @internal The view an `NSESplitViewController` renders. */
export function NSESplitViewControllerView({ controller }: { readonly controller: NSESplitViewController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const layout = controller[nseSplitViewLayout];
  const items = controller.splitViewItems;
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

  // Items divide the space the split view actually occupies: a split nested inside another item is
  // smaller than the window, so the window's content bounds are only the fallback before measurement.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<{ readonly width: number; readonly height: number } | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => setRoot(node), []);
  useLayoutEffect(() => {
    if (!root) return undefined;
    const read = () => {
      const width = Math.round(root.clientWidth);
      const height = Math.round(root.clientHeight);
      if (width <= 0 && height <= 0) return;
      setMeasured((previous) => previous && previous.width === width && previous.height === height ? previous : { width, height });
    };
    read();
    const View = root.ownerDocument.defaultView;
    if (!View || typeof View.ResizeObserver !== "function") return undefined;
    const observer = new View.ResizeObserver(read);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);
  const presentation = controller.traitCollection.presentation;
  // Until the split view is measured or has content bounds it keeps the size it has.
  const bounds = measured ?? presentation?.contentBounds ?? null;
  const compact = presentation?.horizontalSizeClass === "compact" && !isNestedSplit(controller);

  const availableSize = bounds ? (snapshot.isVertical ? bounds.width : bounds.height) : null;
  useLayoutEffect(() => {
    if (availableSize !== null) layout.resize(availableSize);
    layout.setPresentation(compact ? "single-pane" : "split");
  }, [layout, compact, availableSize]);

  useEffect(() => {
    const live = new Set(items.map(({ identifier }) => identifier));
    for (const identifier of [...paneHosts.current.keys()]) if (!live.has(identifier)) paneHosts.current.delete(identifier);
  }, [items]);

  useEffect(() => {
    if (previousPresentation.current === "single-pane" && snapshot.presentation === "split") {
      paneNodes.current.get(snapshot.activeItemIdentifier)?.focus();
    }
    previousPresentation.current = snapshot.presentation;
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
  const common = {
    ref: rootRef,
    className: "nse-split-view-controller-view",
    "aria-label": ariaLabel,
    "aria-disabled": hostDisabled || undefined,
    "data-nse-control": "split-view",
    "data-state": state.kind,
  } as const;

  // Denied, loading and error states expose no item views at all.
  const keepAlive = presentsContent && ownerDocument
    ? items.map((item) => createPortal(<NSEChildViewControllerView controller={item.viewController} />, hostFor(item.identifier)!, item.identifier))
    : null;
  return <>{keepAlive}{renderPresentation()}</>;

  function renderPresentation() {
    if (!presentsContent) {
      return <div {...common} aria-busy={dataViewIsBusy(state) || undefined} data-presentation={snapshot.presentation} tabIndex={-1}>
        {stateFeedback}
      </div>;
    }

    if (snapshot.presentation === "single-pane") {
      return (
        <div {...common} data-presentation="single-pane">
          <div role="tablist" aria-label={`${ariaLabel} panes`}>
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
          </div>
          <div role="tabpanel" data-pane-id={snapshot.activeItemIdentifier}>
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
          minSidebarWidth={0}
          maxSidebarWidth={snapshot.availableSize}
          label={`Resize ${labelOf(definitions.get(first.identifier)!)} and ${labelOf(definitions.get(second.identifier)!)}`}
          onSidebarWidthChange={(width) => {
            if (!allowsMutation) return;
            if (width === null) layout.resetSizes();
            else layout.moveDivider(0, width - first.thickness);
          }}
        >
          <div ref={paneRef(second.identifier)} tabIndex={-1} data-pane-id={second.identifier} data-nse-part="split-pane">
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
