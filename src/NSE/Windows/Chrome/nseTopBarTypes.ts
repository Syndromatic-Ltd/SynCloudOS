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

import type { CSSProperties, ReactNode } from "react";
import type { HFXFeedbackRequest } from "../../Feedback";
import type { NSESmoothSurfaceRequest } from "../../SmoothSurface";

export type NSETopBarVariant = "atmoCumulus" | "atmoMetal";
export type NSETopBarItemKind = "webspring" | "userInfo" | "settings" | "custom";
export type NSETopBarItemPosition = "left" | "right";
/** Chrome appearance for the metal variant. Atmo ships both light and dark chrome (Onyx is a
 *  separate theme, not a dark mode), so the metal bar follows the app's light/dark surface. */
export type NSEChromeScheme = "light" | "dark";

/**
 * Optional sidebar-aligned rail cell for the metal variant. When provided, the bar splits into a
 * rail segment (sized to the source list) and a main segment that meet at the sidebar seam, exactly
 * like a native source-list window. Omit it for a single, full-width metal bar.
 */
export interface NSETopBarRail {
  width?: number | string;
  content?: ReactNode;
  /** When set, the rail wordmark renders as the QuickSwitch trigger (disclosure arrow + selected
   *  state), so source-list windows surface app identity as the switch affordance. */
  titleAction?: NSETopBarTitleAction | null;
}

export interface NSETopBarItem {
  kind: NSETopBarItemKind;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  icon?: string;
  selectedIcon?: string;
  haptic?: HFXFeedbackRequest;
  onClick?: () => void;
  /** The item opens a menu; `selected` then reports whether it is open. */
  opensMenu?: boolean;
  /**
   * Optional host-owned anchor handoff. It lets a canonical overlay retain
   * the real top-bar control without querying the browser document.
   */
  onElementChange?: (element: HTMLButtonElement | null) => void;
}

export interface NSETopBarTitleAction {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  controlsId?: string;
  onClick: () => void;
}

export interface NSETopBarProps {
  title: string;
  variant?: NSETopBarVariant;
  /** Chrome light/dark surface for the `atmoMetal` variant. Ignored by `atmoCumulus`. */
  scheme?: NSEChromeScheme;
  /** Sidebar-aligned rail cell for the `atmoMetal` variant (source-list windows). */
  rail?: NSETopBarRail;
  leadingItems?: NSETopBarItem[];
  trailingItems?: NSETopBarItem[];
  /** Replaces mapped leading items when supplied, including when explicitly null. */
  leading?: ReactNode;
  /** Replaces mapped trailing items when supplied, including when explicitly null. */
  trailing?: ReactNode;
  titleAction?: NSETopBarTitleAction | null;
  /** Metal variant: `"leading"` sets the app title (and its title action) straight after the
   *  leading items, as a document window does, leaving the middle for `center`. In dark chrome
   *  the leading title glows. Defaults to `"centre"`. */
  titlePlacement?: "centre" | "leading";
  center?: ReactNode;
  className?: string;
  smoothSurface?: NSESmoothSurfaceRequest;
  style?: CSSProperties;
}

export interface NSETopBarStyleDefinition {
  height: number;
  icons: Partial<Record<NSETopBarItemKind, { normal: string; selected: string }>>;
}
