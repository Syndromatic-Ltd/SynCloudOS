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

import { useCallback, useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import "./nse-source-list-scene.css";
import { NSEAdaptiveNavigationController } from "../NSEAdaptiveNavigationController";
import { NSEHierarchyStack } from "../NSEHierarchyStack";
import { NSENavigationDestinationHost } from "../NSENavigationDestinationHost";
import { NSETabBar, NSETabBarOverflowList } from "../NSETabBar";
import { NSETabBarController, NSETabBarMoreDestinationId } from "../NSETabBarController";
import type { NSEAdaptiveNavigationSnapshot } from "../navigationTypes";
import { NSESidebar, type NSESidebarSection, type NSESidebarSurface } from "./NSESidebar";
import { NSESplitView } from "../../DataViews/Split/NSESplitView";
import { NSEStatusBar } from "../../Windows/Chrome/NSEStatusBar";
import type { NSEChromeScheme } from "../../Windows/Chrome/nseTopBarTypes";
import { useNSEAppearance } from "../../Appearance";
import { useSourceListFrame, type SourceListFrameContextValue } from "./sourceListFrameContext";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/** Footer content for a source-list window. `rail` is the seam'd cell under the sidebar; the rest
 *  fills the main footer segment, mirroring `NSEStatusBar`. */
export interface NSESourceListSceneStatus {
  rail?: ReactNode;
  leading?: ReactNode;
  center?: ReactNode;
  trailing?: ReactNode;
}

interface NSESourceListSceneSharedProps {
  /** Dynamic centre title for the system bar (e.g. the active section). Falls back to the window title. */
  title?: string;
  /** Optional seam-aligned metal status bar content. Omit for no footer. */
  status?: NSESourceListSceneStatus;
  className?: string;
  sidebarClassName?: string;
  contentClassName?: string;
  resizeLabel?: string;
}

interface NSESourceListLegacySceneProps extends NSESourceListSceneSharedProps {
  /** A caller-owned adaptive controller may project its own compact navigation.
   * Hide the desktop rail and footer while retaining the same content subtree. */
  compact?: boolean;
  /** Source-list / sidebar content (rows, dividers). Rendered in the system-owned, resizable rail. */
  sidebar: ReactNode;
  /** Main content. */
  children: ReactNode;
  projection?: never;
}

export interface NSESourceListCompactHandoff {
  readonly renderer: "tabs" | "stack";
  readonly selectedDestinationId: string;
  readonly snapshot: NSEAdaptiveNavigationSnapshot;
  readonly controller: NSETabBarController<ReactNode>;
}

/**
 * Opt-in semantic source-list projection. The caller retains the navigation
 * controllers; this scene only projects their declared sections into the
 * existing split view at non-compact sizes.
 */
export interface NSESourceListNavigationProjection {
  readonly controller: NSETabBarController<ReactNode>;
  readonly adaptiveController: NSEAdaptiveNavigationController<ReactNode>;
  readonly ariaLabel?: string;
  /** Material for the system-projected rail. Defaults to the plain surface. */
  readonly surface?: NSESidebarSurface;
  /** Colour scheme for the system-projected rail. Defaults to light. */
  readonly scheme?: NSEChromeScheme;
  /** Section ids the caller keeps collapsed. App-owned state; the scene never owns it. */
  readonly collapsedSectionIds?: readonly string[];
  /** Toggles one section id in the caller's collapsed state. */
  readonly onToggleSection?: (sectionId: string) => void;
  /** Explicit top-level application ownership for compact hierarchy/More stage chrome. */
  readonly applicationChrome?: Readonly<{ readonly ownerId: string }>;
  /**
   * Supplementary compact chrome retained for existing callers. It cannot
   * replace the system-owned tabs/stack or the stable destination host.
   */
  readonly compactContent?: (handoff: NSESourceListCompactHandoff) => ReactNode;
}

interface NSESourceListProjectionSceneProps extends NSESourceListSceneSharedProps {
  readonly projection: NSESourceListNavigationProjection;
  sidebar?: never;
  children?: never;
}

export type NSESourceListSceneProps = NSESourceListLegacySceneProps | NSESourceListProjectionSceneProps;

interface NSESourceListSceneBodyProps extends NSESourceListSceneSharedProps {
  readonly frame: SourceListFrameContextValue | null;
  readonly sidebar: ReactNode;
  readonly children: ReactNode;
  readonly compact?: boolean;
}

function NSESourceListSceneBody({
  frame,
  sidebar,
  children,
  status,
  className,
  sidebarClassName,
  contentClassName,
  resizeLabel = "Resize sidebar",
  compact = false,
}: NSESourceListSceneBodyProps) {
  const appearance = useNSEAppearance();
  const scheme = appearance.requestedColourScheme === "auto"
    ? frame?.scheme ?? appearance.resolvedColourScheme
    : appearance.resolvedColourScheme;
  const statusRailWidth = frame?.railWidth ?? frame?.defaultWidth ?? 264;

  return (
    <div className={classes("nse-source-list-scene", className)} data-mode={scheme} data-navigation-compact={compact ? "true" : "false"}>
      <NSESplitView
        className="nse-source-list-scene-split"
        sidebar={<div className={classes("nse-source-list-scene-sidebar", sidebarClassName)}>{sidebar}</div>}
        sidebarWidth={frame ? frame.railWidth : undefined}
        defaultSidebarWidth={frame?.defaultWidth ?? 264}
        minSidebarWidth={frame?.minWidth ?? 208}
        maxSidebarWidth={frame?.maxWidth ?? 460}
        onSidebarWidthChange={frame ? frame.setRailWidth : undefined}
        label={resizeLabel}
        resizable={!compact}
      >
        <div className={classes("nse-source-list-scene-content", contentClassName)}>{children}</div>
      </NSESplitView>
      {!compact && status ? (
        <NSEStatusBar
          variant="atmoMetal"
          scheme={scheme}
          className="nse-source-list-scene-status"
          rail={{ width: statusRailWidth, content: status.rail }}
          leading={status.leading}
          trailing={status.trailing}
        >
          {status.center}
        </NSEStatusBar>
      ) : null}
    </div>
  );
}

function sectionForProjection(
  controller: NSETabBarController<ReactNode>,
  collapsedSectionIds?: readonly string[],
): NSESidebarSection[] {
  return controller.sections.map((section) => ({
    id: section.id,
    label: section.label,
    navigationGroupId: section.id,
    collapsed: collapsedSectionIds?.includes(section.id),
    items: section.destinationIds.flatMap((destinationId) => {
      const destination = controller.getDestination(destinationId);
      if (!destination) return [];
      return [{
        id: destination.id,
        label: destination.label,
        ariaLabel: destination.accessibleLabel,
        glyph: destination.sidebarItem?.glyph ?? (destination.icon.kind === "vector" ? destination.icon.path : undefined),
        glyphFramed: destination.sidebarItem?.glyphFramed,
        glyphSize: destination.sidebarItem?.glyphSize,
        badge: destination.badge,
        disabled: destination.disabled,
      }];
    }),
  }));
}

function NSESourceListNavigationScene({
  frame,
  projection,
  ...props
}: NSESourceListSceneSharedProps & {
  readonly frame: SourceListFrameContextValue | null;
  readonly projection: NSESourceListNavigationProjection;
}) {
  const subscribeToTabs = useCallback(
    (listener: () => void) => projection.controller.subscribe(listener),
    [projection.controller],
  );
  const subscribeToAdaptive = useCallback(
    (listener: () => void) => projection.adaptiveController.subscribe(listener),
    [projection.adaptiveController],
  );
  const tabSnapshot = useSyncExternalStore(
    subscribeToTabs,
    projection.controller.getSnapshot,
    projection.controller.getSnapshot,
  );
  const adaptiveSnapshot = useSyncExternalStore(
    subscribeToAdaptive,
    projection.adaptiveController.getSnapshot,
    projection.adaptiveController.getSnapshot,
  );
  const contentHostId = useId().replace(/:/g, "");
  const stackController = projection.adaptiveController.stackController;
  const compact = adaptiveSnapshot.renderer === "tabs" || adaptiveSnapshot.renderer === "stack";
  const overflowOpen = tabSnapshot.moreStack?.currentDestinationId === NSETabBarMoreDestinationId;

  useEffect(() => {
    if (adaptiveSnapshot.model !== "hierarchy" || !stackController) return;
    const selectedDestinationId = adaptiveSnapshot.stack?.currentDestinationId;
    if (!selectedDestinationId || selectedDestinationId === tabSnapshot.selectedDestinationId) return;
    void projection.controller.select(selectedDestinationId, { source: "stack-sync" }).catch(() => undefined);
  }, [adaptiveSnapshot.model, adaptiveSnapshot.stack?.revision, projection.controller, stackController, tabSnapshot.selectedDestinationId]);

  const selectSourceListDestination = useCallback((destinationId: string) => {
    if (adaptiveSnapshot.model !== "hierarchy" || !stackController || !stackController.hasDestination(destinationId)) {
      void projection.controller.select(destinationId, { source: "source-list" }).catch(() => undefined);
      return;
    }
    if (destinationId === stackController.getSnapshot().rootDestinationId) {
      stackController.popToRoot();
      void projection.controller.select(destinationId, { source: "stack-root" }).catch(() => undefined);
      return;
    }
    void stackController.push(destinationId).catch(() => undefined);
  }, [adaptiveSnapshot.model, projection.controller, stackController]);
  const sidebar = (
    <NSESidebar
      aria-label={projection.ariaLabel ?? "Navigation"}
      surface={projection.surface}
      scheme={projection.scheme}
      sections={sectionForProjection(projection.controller, projection.collapsedSectionIds)}
      activeItemId={tabSnapshot.selectedDestinationId}
      collapsedSectionIds={projection.collapsedSectionIds}
      onSelectItem={(item) => selectSourceListDestination(item.id)}
      onToggleSection={(section) => projection.onToggleSection?.(section.id)}
    />
  );

  const handoff: NSESourceListCompactHandoff | null = compact ? {
    renderer: adaptiveSnapshot.renderer as "tabs" | "stack",
    selectedDestinationId: tabSnapshot.selectedDestinationId,
    snapshot: adaptiveSnapshot,
    controller: projection.controller,
  } : null;
  const compactChrome = adaptiveSnapshot.renderer === "tabs" ? (
    <NSETabBar
      controller={projection.controller}
      aria-label={projection.ariaLabel ?? "Navigation"}
      reducedMotion={adaptiveSnapshot.traits.reducedMotion}
      renderPanels={false}
      idScope={contentHostId}
    />
  ) : adaptiveSnapshot.renderer === "stack" && stackController ? (
    <NSEHierarchyStack
      controller={projection.controller}
      stackController={stackController}
      applicationChrome={projection.applicationChrome}
      aria-label={projection.ariaLabel ?? "Navigation"}
    />
  ) : null;

  return (
    <div
      className="nse-source-list-scene-projection nse-compact-bottom-chrome-owner"
      data-navigation-renderer={adaptiveSnapshot.renderer}
    >
      <NSESourceListSceneBody
        key="source-list-body"
        {...props}
        frame={frame}
        sidebar={sidebar}
        compact={compact}
      >
        <div className="nse-source-list-scene-projection-content" data-nse-source-list-overflow-open={overflowOpen ? "true" : "false"}>
          <NSENavigationDestinationHost
            controller={projection.controller}
            idScope={contentHostId}
            snapshot={tabSnapshot}
            tabSemantics={adaptiveSnapshot.renderer === "tabs"}
          />
          {adaptiveSnapshot.renderer === "tabs" ? (
            <NSETabBarOverflowList
              controller={projection.controller}
              aria-label={projection.ariaLabel ?? "Navigation"}
              idScope={contentHostId}
              applicationChrome={projection.applicationChrome}
            />
          ) : null}
        </div>
      </NSESourceListSceneBody>
      {compact ? (
        <div
          key="compact-chrome"
          className={classes(
            "nse-source-list-scene-projection-compact",
            adaptiveSnapshot.renderer === "tabs" && "nse-compact-bottom-chrome-mount",
          )}
          data-nse-source-list-compact-chrome="true"
          data-nse-compact-bottom-chrome={adaptiveSnapshot.renderer === "tabs" ? "tabs-only" : "stack-only"}
        >
          {compactChrome}
          {handoff ? projection.compactContent?.(handoff) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * App-facing body for a system-owned source-list window. The app supplies sidebar + main (+ optional
 * status) content; the system frame owns the top bar, the seam, the resizable width, and QuickSwitch.
 *
 * Reads the width from {@link useSourceListFrame} so the sidebar and the top-bar seam share one source
 * of truth. Used outside a source-list frame it degrades to a self-managed split (no shared seam).
 */
export function NSESourceListScene(props: NSESourceListSceneProps) {
  const frame = useSourceListFrame();
  const setBarTitle = frame?.setBarTitle;

  useEffect(() => {
    if (!setBarTitle) return;
    setBarTitle(props.title ?? null);
    return () => setBarTitle(null);
  }, [setBarTitle, props.title]);

  if ("projection" in props && props.projection) {
    const { projection, ...sharedProps } = props;
    return <NSESourceListNavigationScene {...sharedProps} frame={frame} projection={projection} />;
  }

  return (
    <NSESourceListSceneBody {...props} frame={frame} />
  );
}
