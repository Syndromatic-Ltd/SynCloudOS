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

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { NSETabBarMoreDestinationId, NSETabBarController } from "./NSETabBarController";
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
}: NSENavigationDestinationHostProps) {
  const subscribe = useCallback((listener: () => void) => (
    suppliedSnapshot ? () => undefined : controller.subscribe(listener)
  ), [controller, suppliedSnapshot]);
  const observedSnapshot = useSyncExternalStore(subscribe, controller.getSnapshot, controller.getSnapshot);
  const snapshot = suppliedSnapshot ?? observedSnapshot;
  const [visitedDestinationIds, setVisitedDestinationIds] = useState<ReadonlySet<string>>(
    () => new Set([snapshot.selectedDestinationId]),
  );
  const directDestinations = snapshot.directDestinationIds.flatMap((id) => {
    const destination = controller.getDestination(id);
    return destination ? [destination] : [];
  });
  const overflowDestinations = snapshot.overflowDestinationIds.flatMap((id) => {
    const destination = controller.getDestination(id);
    return destination ? [destination] : [];
  });

  useEffect(() => {
    setVisitedDestinationIds((previous) => {
      if (previous.has(snapshot.selectedDestinationId)) return previous;
      return new Set([...previous, snapshot.selectedDestinationId]);
    });
  }, [snapshot.selectedDestinationId]);

  const contentFor = (destinationId: string) => (
    visitedDestinationIds.has(destinationId) || destinationId === snapshot.selectedDestinationId
      ? controller.getContent(destinationId)
      : null
  );
  const morePanelId = getNSETabBarPanelId(idScope, NSETabBarMoreDestinationId);
  const overflowPageOpen = snapshot.moreStack?.currentDestinationId === NSETabBarMoreDestinationId;
  const moreSelected = snapshot.activeTabId === NSETabBarMoreDestinationId;

  return (
    <div className={["nse-navigation-destination-host", className].filter(Boolean).join(" ")} data-nse-navigation-destination-host="true">
      {directDestinations.map((destination) => {
        // More is a real peer tab whose root page temporarily replaces the
        // selected destination panel. Keep destination content visited and
        // retained, but let the active tab own which peer panel is visible.
        const visible = snapshot.activeTabId === destination.id;
        const panelId = getNSETabBarPanelId(idScope, destination.id);
        const tabId = getNSETabBarTabId(idScope, destination.id);
        return (
          <div
            className="nse-tab-bar-panel"
            key={destination.id}
            id={panelId}
            role={tabSemantics ? "tabpanel" : undefined}
            aria-labelledby={tabSemantics ? tabId : undefined}
            aria-hidden={!visible || undefined}
            inert={!visible}
            hidden={!visible}
            data-nse-tab-panel={destination.id}
          >
            {contentFor(destination.id)}
          </div>
        );
      })}

      {overflowDestinations.length > 0 ? (
        <div
          className="nse-tab-bar-panel nse-tab-bar-more-panel"
          id={morePanelId}
          role={tabSemantics ? "tabpanel" : undefined}
          aria-label={tabSemantics ? "More destinations" : undefined}
          aria-labelledby={tabSemantics ? getNSETabBarTabId(idScope, NSETabBarMoreDestinationId) : undefined}
          aria-hidden={!moreSelected || undefined}
          inert={!moreSelected}
          hidden={!moreSelected}
          data-nse-tab-panel={NSETabBarMoreDestinationId}
        >
          <div
            className="nse-tab-bar-more-stack"
            aria-hidden={overflowPageOpen || undefined}
            inert={overflowPageOpen}
            hidden={overflowPageOpen}
            data-nse-more-stack="true"
          >
            {overflowDestinations.map((destination) => {
              const selected = snapshot.selectedDestinationId === destination.id;
              const visible = selected && !overflowPageOpen;
              return (
                <div key={destination.id} hidden={!visible} aria-hidden={!visible || undefined} inert={!visible} data-nse-more-destination={destination.id}>
                  {contentFor(destination.id)}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
