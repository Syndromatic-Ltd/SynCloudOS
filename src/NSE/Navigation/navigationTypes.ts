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

import type { NSETabStripPresentation } from "./tabStrip";
import type { ReactNode } from "react";
import type { SynCloudOSPresentationTraits } from "../../SynCloudOS/SynCloudOS";

/** Semantic icon data only. NavigationFoundation does not assign final visual treatment. */
export type NSENavigationIcon =
  | { readonly kind: "template"; readonly name: string }
  | { readonly kind: "vector"; readonly path: string };

/** Optional content-art projection for source-list renderers. This is distinct
 * from `icon`: physical tabs retain their semantic template/vector icon while
 * a desktop sidebar may show app-owned artwork without treating it as control
 * chrome. */
export interface NSENavigationSidebarItemDescriptor {
  readonly glyph?: string;
  readonly glyphFramed?: boolean;
  readonly glyphSize?: "standard" | "large";
}

/** Presentation input only; navigation controllers never own this state. */
export type NSENavigationPresentationState =
  | "normal"
  | "hover"
  | "pressed"
  | "selected"
  | "focused"
  | "disabled";

/** One declared template/vector icon keeps its source identity across paint states. */
export interface NSENavigationIconPresentation {
  readonly kind: NSENavigationIcon["kind"];
  readonly source: string;
  readonly state: NSENavigationPresentationState;
}

export function projectNSENavigationIcon(
  icon: NSENavigationIcon,
  state: NSENavigationPresentationState,
): NSENavigationIconPresentation {
  return Object.freeze({
    kind: icon.kind,
    source: icon.kind === "template" ? `template:${icon.name}` : `vector:${icon.path}`,
    state,
  });
}

/** A declared destination is independent of any physical tab, source list, or
 * split pane. Its optional content factory is retained by its controller. */
export interface NSENavigationDestination<TContent = unknown> {
  readonly id: string;
  readonly restorationId?: string;
  readonly label: ReactNode;
  /** Compact physical-tab copy; `label` remains the full destination name. */
  readonly compactLabel?: ReactNode;
  readonly accessibleLabel?: string;
  readonly icon: NSENavigationIcon;
  readonly sidebarItem?: NSENavigationSidebarItemDescriptor;
  readonly groupId?: string;
  readonly disabled?: boolean;
  readonly badge?: string | number;
  readonly createContent?: () => TContent;
}

/**
 * A declared source-list grouping. It deliberately names destinations instead
 * of supplying panes: renderers project this semantic order into their own
 * physical structure.
 */
export interface NSENavigationSection {
  readonly id: string;
  readonly label?: ReactNode;
  readonly destinationIds: readonly string[];
}

export interface NSENavigationSelectionOptions {
  readonly signal?: AbortSignal;
  readonly source?: string;
}

export interface NSETabBarControllerSnapshot {
  readonly revision: number;
  readonly id: string;
  readonly selectedDestinationId: string;
  /** A real destination id or the system-owned More item. */
  readonly activeTabId: string;
  readonly directDestinationIds: readonly string[];
  readonly overflowDestinationIds: readonly string[];
  readonly moreStack: NSENavigationStackSnapshot | null;
}

export interface NSETabBarRestorationSnapshot {
  readonly selectedDestinationId?: string | null;
  readonly more?: NSENavigationStackRestorationSnapshot | null;
}

export interface NSENavigationStackSnapshot {
  readonly revision: number;
  readonly id: string;
  readonly rootDestinationId: string | null;
  readonly path: readonly string[];
  readonly currentDestinationId: string | null;
  readonly backDestinationId: string | null;
}

export interface NSENavigationStackRestorationSnapshot {
  /** Version 1 is the first persisted stack-path representation. Omit only for pre-NavigationFoundation snapshots. */
  readonly version?: 1;
  readonly path: readonly string[];
}

export type NSEAdaptiveNavigationModel = "peer" | "hierarchy";
export type NSEAdaptiveNavigationPresentation = "adaptive" | "bottom-tabs";
export type NSEAdaptiveNavigationRenderer = "tabs" | "source-list-content" | "list-detail" | "stack";

export interface NSEAdaptiveNavigationSnapshot {
  readonly revision: number;
  readonly id: string;
  readonly model: NSEAdaptiveNavigationModel;
  readonly presentation: NSEAdaptiveNavigationPresentation;
  readonly renderer: NSEAdaptiveNavigationRenderer;
  readonly traits: SynCloudOSPresentationTraits;
  readonly selectedDestinationId: string;
  readonly stack: NSENavigationStackSnapshot | null;
}


export interface NSETabItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly accessibleLabel?: string;
  /** The tab's picture when the view's tabs are drawn as icons. */
  readonly icon?: ReactNode;
  readonly panelId?: string;
  readonly ownsPanel?: boolean;
  readonly disabled?: boolean;
  readonly commandId?: string;
  readonly commandPayload?: unknown;
  readonly restorationId?: string;
  readonly closable?: boolean;
  readonly render: () => ReactNode;
}

export interface NSETabViewProps {
  readonly "aria-label": string;
  readonly items: readonly NSETabItem[];
  readonly tone?: "medium" | "light" | "dark" | "affirmative" | "negative";
  readonly selectedId?: string;
  readonly defaultSelectedId?: string;
  readonly keepAlive?: boolean;
  readonly maximumVisibleTabs?: number;
  readonly parentResponderId?: string;
  /** `tabStyle: "icons"` draws the tabs as a row of icons (the colour panel's
   * modes, a Preferences window's panes) instead of the joined capsule. */
  readonly presentation?: NSETabStripPresentation;
  onSelectedIdChange?(id: string, reason: "pointer" | "keyboard"): void;
  onRequestClose?(id: string): void;
  onRequestReorder?(id: string, toIndex: number): void;
}

export interface NSEAccordionItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly render: () => ReactNode;
}

export interface NSEAccordionViewProps {
  readonly "aria-label": string;
  readonly items: readonly NSEAccordionItem[];
  readonly expandedIds: ReadonlySet<string>;
  readonly mode: "single" | "multiple";
  readonly headingLevel?: number;
  onExpandedIdsChange(ids: ReadonlySet<string>): void;
}
