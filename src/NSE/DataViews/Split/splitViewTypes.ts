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

import type { ReactNode } from "react";

import type { NSEViewControllerOptions } from "../../Application/NSEViewController";
import type { NSEPreferencesController } from "../../Controllers";
import type { SynCloudOSResponsiveState } from "../../../SynCloudOS/SynCloudOS";

export interface NSESplitPane {
  readonly id: string;
  readonly minimum: number;
  readonly ideal: number;
  readonly maximum: number;
  readonly collapsible: boolean;
  readonly collapsePriority: number;
}

export interface NSESplitPaneSnapshot {
  readonly id: string;
  readonly size: number;
  readonly collapsed: boolean;
}

export interface NSESplitViewSnapshot {
  readonly revision: number;
  readonly orientation: "horizontal" | "vertical";
  readonly presentation: "split" | "single-pane";
  readonly panes: readonly NSESplitPaneSnapshot[];
  readonly activePaneId: string;
  readonly availableSize: number;
}

export interface NSESplitViewPreferences {
  readonly sizes: Readonly<Record<string, number>>;
  readonly collapsedPaneIds: readonly string[];
  readonly activePaneId: string | null;
}

export interface NSESplitViewControllerOptions extends NSEViewControllerOptions {
  readonly id: string;
  readonly orientation: "horizontal" | "vertical";
  readonly panes: readonly NSESplitPane[];
  readonly preferences?: NSEPreferencesController<NSESplitViewPreferences>;
}

export interface NSESplitViewAdapterPane {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface NSESplitViewWindowBounds {
  readonly width: number;
  readonly height: number;
}

export interface NSESplitViewAdapterAuthority {
  readonly responsiveState: SynCloudOSResponsiveState;
  readonly windowBounds: NSESplitViewWindowBounds;
}
