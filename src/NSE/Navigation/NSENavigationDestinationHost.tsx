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

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { NSETabBarMoreDestinationId, NSETabBarController } from "./NSETabBarController";
import { panoramaSlot, usePanoramaNavigation } from "./usePanoramaNavigation";
import "./nse-panorama.css";
import { usePeerNavigationMotion } from "./usePeerNavigationMotion";
import type { NSETabBarControllerSnapshot } from "./navigationTypes";

function idToken(value: string): string {
  return encodeURIComponent(value).replaceAll("%", "_");
}

export function getNSETabBarTabId(idScope: string, destinationId: string): string {
  return `nse-tab-bar-${idToken(idScope)}-tab-${idToken(destinationId)}`;
}

export function getNSETabBarPanelId(idScope: string, destinationId: string): string {
  return `nse-tab-bar-${idToken(idScope)}-panel-${idToken(destinationId)}`;
}

export interface NSENavigationDestinationHostProps {
  /** Semantic content owner. It is intentionally shared with surrounding chrome. */
  readonly controller: NSETabBarController<ReactNode>;
  /** Shared with the tab strip so tabs and panels keep truthful relationships. */
  readonly idScope: string;
  /** False when a source list or hierarchy, rather than tabs, is the active chrome. */
  readonly tabSemantics?: boolean;
  /** Reuse a surrounding renderer's subscription instead of creating another lease. */
  readonly snapshot?: NSETabBarControllerSnapshot;
  readonly className?: string;
  readonly reducedMotion?: boolean;
  readonly dir?: "ltr" | "rtl";
  /** Framework-owned panoramic layers; never a theme executable renderer. */
  readonly panorama?: { readonly title: string };
}

/**
 * The one mounted parent for lazy destination content. Renderer changes may
 * hide destinations, but must not relocate or recreate their React trees.
 */
export function NSENavigationDestinationHost({
  controller,
  idScope,
  tabSemantics = true,
  snapshot: suppliedSnapshot,
  className,
  reducedMotion = false,
  dir,
  panorama,
}: NSENavigationDestinationHostProps) {
  const subscribe = useCallback((listener: () => void) => (
    suppliedSnapshot ? () => undefined : controller.subscribe(listener)
  ), [controller, suppliedSnapshot]);
  const observedSnapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
  const snapshot = suppliedSnapshot ?? observedSnapshot;
  const [visitedDestinationIds, setVisitedDestinationIds] = useState<ReadonlySet<string>>(
    () => new Set([snapshot.selectedDestinationId]),
  );

  useEffect(() => {
    setVisitedDestinationIds((previous) => {
      if (panorama) {
        if (controller.destinations.every(({ id }) => previous.has(id))) return previous;
        return new Set([...previous, ...controller.destinations.map(({ id }) => id)]);
      }
      if (previous.has(snapshot.selectedDestinationId)) return previous;
      return new Set([...previous, snapshot.selectedDestinationId]);
    });
  }, [snapshot.selectedDestinationId, !!panorama, controller]);

  const contentFor = (destinationId: string) => (
    panorama || visitedDestinationIds.has(destinationId) || destinationId === snapshot.selectedDestinationId
      ? controller.getContent(destinationId)
      : null
  );
  const morePanelId = getNSETabBarPanelId(idScope, NSETabBarMoreDestinationId);
  const overflowPageOpen = snapshot.moreStack?.currentDestinationId === NSETabBarMoreDestinationId;
  const host = useRef<HTMLDivElement>(null);
  const panels = useRef(new Map<string, HTMLDivElement>());
  const transition = usePeerNavigationMotion({ host, panels, selectedId: snapshot.selectedDestinationId,
    destinationIds: controller.destinations.map(({ id }) => id), enabled: !panorama && tabSemantics && !overflowPageOpen, reducedMotion });

  const panoramaMotion = usePanoramaNavigation({ host, ids: controller.destinations.map(({ id }) => id),
    selectedId: snapshot.selectedDestinationId, enabled: !!panorama, reducedMotion, dir,
    disabledIds: controller.destinations.filter(item => item.disabled).map(item => item.id),
    select: id => controller.select(id, { source: "panorama" }) });
  useEffect(() => {
    if (!panorama || !host.current) return;
    const focused = document.activeElement;
    const outgoingPanel = focused instanceof Element ? focused.closest("[data-nse-tab-panel]") : null;
    const focusInHeadings = host.current.querySelector(".nse-panorama-headings")?.contains(focused);
    const focusInOutgoing = outgoingPanel && host.current.contains(outgoingPanel)
      && outgoingPanel.getAttribute("data-nse-tab-panel") !== snapshot.selectedDestinationId;
    if (!focusInHeadings && !focusInOutgoing) return;
    host.current.querySelector<HTMLElement>('.nse-panorama-headings [aria-selected="true"]')?.focus();
  }, [snapshot.selectedDestinationId, !!panorama]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleWidth = titleRef.current?.scrollWidth ?? panoramaMotion.width;
  const titleCycle = titleWidth + panoramaMotion.width;
  const titleTravel = panoramaMotion.position * panoramaMotion.stride * .22;
  // A single title leaves the clipping boundary before re-entering on the
  // opposite edge. There is no repeated title strip and no copied app content.
  const titleX = ((titleTravel + titleWidth) % titleCycle + titleCycle) % titleCycle - titleWidth;
  return (
    <div className={["nse-navigation-destination-host", className].filter(Boolean).join(" ")} data-nse-navigation-destination-host="true" dir={dir} ref={host} data-nse-peer-transition={transition ? "running" : undefined}
      data-nse-panorama={panorama ? "true" : undefined}
      data-nse-panorama-count={panorama ? controller.destinations.length : undefined}
      {...(panorama ? panoramaMotion.handlers : {})}
      style={panorama ? { "--nse-panorama-background-offset": `${-panoramaMotion.position * panoramaMotion.stride * .45 * panoramaMotion.sign}px` } as CSSProperties : undefined}>
      <div className="nse-panorama-background" aria-hidden="true" hidden={!panorama} />
      <div className="nse-panorama-title-viewport" hidden={!panorama}>
        <h1 className="nse-panorama-title" ref={titleRef} style={{ transform: `translateX(${-titleX * panoramaMotion.sign}px)` }}>{panorama?.title}</h1>
      </div>
      <nav className="nse-panorama-navigation" aria-label="Panorama sections" hidden={!panorama}>
        <button type="button" aria-label="Previous section" disabled={controller.destinations.length < 2} onClick={() => panoramaMotion.move(-1)}>‹</button>
        <span aria-live="polite">{controller.getDestination(snapshot.selectedDestinationId)?.label}</span>
        <button type="button" aria-label="Next section" disabled={controller.destinations.length < 2} onClick={() => panoramaMotion.move(1)}>›</button>
      </nav>
      <div className="nse-panorama-headings" hidden={!panorama} role="tablist" aria-label="Sections">
        {panorama && controller.destinations.map((destination, index) => <button
          key={destination.id} type="button" role="tab" id={getNSETabBarTabId(idScope, destination.id)}
          aria-controls={getNSETabBarPanelId(idScope, destination.id)} aria-selected={snapshot.selectedDestinationId === destination.id}
          tabIndex={snapshot.selectedDestinationId === destination.id ? 0 : -1} disabled={destination.disabled}
          className="nse-panorama-section-heading"
          style={{ transform: `translateX(${(panoramaSlot(index, panoramaMotion.position, controller.destinations.length) - panoramaMotion.position) * panoramaMotion.stride * panoramaMotion.sign}px)` }}
          onClick={() => { void controller.select(destination.id, { source: "panorama-heading" }).catch(() => undefined); }}
          onKeyDown={event => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault(); panoramaMotion.move((event.key === "ArrowRight" ? 1 : -1) * panoramaMotion.sign);
          }}>{destination.label}</button>)}
      </div>
      {controller.destinations.map((destination) => {
        const visible = snapshot.selectedDestinationId === destination.id && !overflowPageOpen;
        const slot = panoramaSlot(controller.destinations.indexOf(destination), panoramaMotion.position, controller.destinations.length);
        const isOverflow = snapshot.overflowDestinationIds.includes(destination.id);
        return (
          <div
            className="nse-tab-bar-panel"
            key={destination.id}
            id={getNSETabBarPanelId(idScope, destination.id)}
            role={panorama || tabSemantics ? "tabpanel" : undefined}
            aria-labelledby={panorama || tabSemantics ? getNSETabBarTabId(idScope, isOverflow ? NSETabBarMoreDestinationId : destination.id) : undefined}
            aria-hidden={!visible || undefined}
            inert={!visible}
            hidden={!panorama && !visible && transition?.from !== destination.id}
            style={panorama ? { transform: `translateX(${(slot - panoramaMotion.position) * panoramaMotion.stride * panoramaMotion.sign}px)` } : undefined}
            ref={node => { if (node) panels.current.set(destination.id, node); else panels.current.delete(destination.id); }}
            data-nse-peer-motion={transition?.from === destination.id ? "exiting" : transition?.to === destination.id ? "entering" : undefined}
            data-nse-tab-panel={destination.id}
            data-nse-more-destination={isOverflow ? destination.id : undefined}
          >
            {contentFor(destination.id)}
          </div>
        );
      })}
      <div
        className="nse-tab-bar-panel nse-tab-bar-more-panel"
        id={morePanelId}
        role={tabSemantics ? "tabpanel" : undefined}
        aria-label="More destinations"
        aria-labelledby={tabSemantics && snapshot.overflowDestinationIds.length > 0 ? getNSETabBarTabId(idScope, NSETabBarMoreDestinationId) : undefined}
        aria-hidden={!overflowPageOpen || undefined}
        inert={!overflowPageOpen}
        hidden={!overflowPageOpen}
        data-nse-tab-panel={NSETabBarMoreDestinationId}
      />
    </div>
  );
}
