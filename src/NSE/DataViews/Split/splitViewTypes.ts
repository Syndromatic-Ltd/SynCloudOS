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

import type { NSEViewControllerOptions } from "../../Application/NSEViewController";
import type { NSEUserDefaultsController } from "../../Controllers";
import type { NSEDataViewState } from "../Core";
import type { NSESplitViewItem } from "./NSESplitViewItem";
import type { NSEBookRegions } from "../../Navigation/bookRegions";

/** One item's place in the split view: its thickness along the split, and whether it is collapsed. */
export interface NSESplitViewItemSnapshot {
  readonly identifier: string;
  readonly thickness: number;
  readonly isCollapsed: boolean;
}

export interface NSESplitViewSnapshot {
  readonly revision: number;
  /** NSSplitView.isVertical: `true` places the items side by side, divided by vertical dividers. */
  readonly isVertical: boolean;
  /** `"single-pane"` in a compact width, where the outermost split view shows one item at a time. */
  readonly presentation: "split" | "single-pane";
  /** Current usable foldable allocations. Null when geometry or posture is unavailable. */
  readonly bookRegions: NSEBookRegions | null;
  readonly items: readonly NSESplitViewItemSnapshot[];
  /** The item a compact width shows, and that keyboard focus returns to when the split comes back. */
  readonly activeItemIdentifier: string;
  readonly availableSize: number;
  readonly state: NSEDataViewState;
}

/** The divider positions and collapsed items a split view restores, as NSSplitView.autosaveName keeps them. */
export interface NSESplitViewPreferences {
  readonly sizes: Readonly<Record<string, number>>;
  readonly collapsedPaneIds: readonly string[];
  readonly activePaneId: string | null;
}

export interface NSESplitViewControllerOptions extends NSEViewControllerOptions {
  readonly id: string;
  /** NSSplitView.isVertical; `true` (the default) places the items side by side. */
  readonly isVertical?: boolean;
  readonly splitViewItems?: readonly NSESplitViewItem[];
  readonly preferences?: NSEUserDefaultsController<NSESplitViewPreferences>;
}
