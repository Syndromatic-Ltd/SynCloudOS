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

import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useNSEApplicationNavigationChrome } from "./NSEApplicationNavigationChrome";
import { NSENavigationStackController } from "./NSENavigationStackController";
import { NSETabBarController } from "./NSETabBarController";

function destinationLabel(destination: { readonly accessibleLabel?: string; readonly label: ReactNode } | null): string {
  if (!destination) return "destination";
  if (destination.accessibleLabel) return destination.accessibleLabel;
  return typeof destination.label === "string" || typeof destination.label === "number"
    ? String(destination.label)
    : "destination";
}

export interface NSEHierarchyStackProps {
  readonly controller: NSETabBarController<ReactNode>;
  readonly stackController: NSENavigationStackController;
  readonly "aria-label": string;
  readonly className?: string;
  /** App-owned root title for the shared application stage chrome. */
  readonly rootTitle?: string;
  /** App-owned current-detail title for shared stage chrome. */
  readonly title?: string;
  /** App-owned shared-chrome Back label when a synthetic hierarchy root has no user-facing destination. */
  readonly backLabel?: string;
  /** Optional owner transition for a synthetic hierarchy page. */
  readonly onBack?: () => void;
  /** Explicit application-boundary claim for shared stage chrome. Local and embedded stacks omit it. */
  readonly applicationChrome?: Readonly<{ readonly ownerId: string }>;
}

/** Compact hierarchy state bridge. The application stage owns visible chrome. */
export function NSEHierarchyStack({
  controller,
  stackController,
  className,
  rootTitle,
  title,
  backLabel,
  onBack,
  applicationChrome,
}: NSEHierarchyStackProps) {
  const subscribe = useCallback((listener: () => void) => stackController.subscribe(listener), [stackController]);
  const snapshot = useSyncExternalStore(subscribe, stackController.getSnapshot, stackController.getSnapshot);
  const previousPathLength = useRef(snapshot.path.length);
  const focusReturnTarget = useRef<HTMLElement | null>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const restoreFocusAfterBack = useRef(false);
  const currentDestination = snapshot.currentDestinationId ? controller.getDestination(snapshot.currentDestinationId) : null;
  const backDestination = snapshot.backDestinationId ? controller.getDestination(snapshot.backDestinationId) : null;

  // A stack push can synchronously hide the initiating source control before
  // this component's post-render effect observes the new path. Remember the
  // most recent focused element while the source is still visible, so Back
  // returns to the actual initiating control rather than the document body.
  useLayoutEffect(() => {
    const rememberFocusedElement = (event: FocusEvent) => {
      lastFocusedElement.current = event.target instanceof HTMLElement ? event.target : null;
    };
    document.addEventListener("focusin", rememberFocusedElement, true);
    return () => document.removeEventListener("focusin", rememberFocusedElement, true);
  }, []);

  const popAndRestoreCurrentDestinationFocus = useCallback(() => {
    restoreFocusAfterBack.current = true;
    stackController.pop();
  }, [stackController]);

  useLayoutEffect(() => {
    const priorPathLength = previousPathLength.current;
    const currentPathLength = snapshot.path.length;
    if (currentPathLength > priorPathLength) {
      focusReturnTarget.current = lastFocusedElement.current
        ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    if (restoreFocusAfterBack.current && currentPathLength < priorPathLength) {
      const target = focusReturnTarget.current;
      restoreFocusAfterBack.current = false;
      focusReturnTarget.current = null;
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
    previousPathLength.current = currentPathLength;
  }, [snapshot.path.length, snapshot.revision]);

  const isPushed = Boolean(snapshot.backDestinationId);
  useNSEApplicationNavigationChrome(applicationChrome ? {
    ownerId: applicationChrome.ownerId,
    title: isPushed ? title ?? destinationLabel(currentDestination) : rootTitle ?? destinationLabel(currentDestination),
    back: isPushed ? {
      label: backLabel ?? `Back to ${destinationLabel(backDestination)}`,
      onActivate: onBack ?? popAndRestoreCurrentDestinationFocus,
    } : null,
  } : null);

  return (
    <span
      className={["nse-hierarchy-stack-bridge", className].filter(Boolean).join(" ")}
      data-nse-hierarchy-stack="true"
      data-nse-hierarchy-current-destination={snapshot.currentDestinationId ?? undefined}
      hidden
    />
  );
}
