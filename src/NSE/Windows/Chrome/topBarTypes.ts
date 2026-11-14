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
import type { SmoothSurfaceRequest } from "../../SmoothSurface";

export type TopBarVariant = "atmoCumulus" | "atmoMetal";
export type TopBarItemKind = "webspring" | "userInfo" | "settings" | "custom";
export type TopBarItemPosition = "left" | "right";
/** Chrome appearance for the metal variant. Atmo ships both light and dark chrome (Onyx is a
 *  separate theme, not a dark mode), so the metal bar follows the app's light/dark surface. */
export type NSEChromeScheme = "light" | "dark";

/**
 * Optional sidebar-aligned rail cell for the metal variant. When provided, the bar splits into a
 * rail segment (sized to the source list) and a main segment that meet at the sidebar seam, exactly
 * like a native source-list window. Omit it for a single, full-width metal bar.
 */
export interface TopBarRail {
  width?: number | string;
  content?: ReactNode;
  /** When set, the rail wordmark renders as the QuickSwitch trigger (disclosure arrow + selected
   *  state), so source-list windows surface app identity as the switch affordance. */
  titleAction?: TopBarTitleAction | null;
}

export interface TopBarItem {
  kind: TopBarItemKind;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /**
   * URL of a single-shape SVG, drawn as a CSS mask for any item kind so the theme colours it in
   * its normal, pressed and selected states. When absent, each built-in kind draws its own glyph
   * (`webspring` a house, `userInfo` a person, `settings` a gear); a `custom` item draws nothing.
   */
  icon?: string;
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

export interface TopBarTitleAction {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  controlsId?: string;
  onClick: () => void;
}

export interface TopBarProps {
  title: string;
  variant?: TopBarVariant;
  /** Chrome light/dark surface for the `atmoMetal` variant. Ignored by `atmoCumulus`. */
  scheme?: NSEChromeScheme;
  /** Sidebar-aligned rail cell for the `atmoMetal` variant (source-list windows). */
  rail?: TopBarRail;
  leadingItems?: TopBarItem[];
  trailingItems?: TopBarItem[];
  /** Replaces mapped leading items when supplied, including when explicitly null. */
  leading?: ReactNode;
  /** @internal Window-owned views beside the host’s leading controls. */
  leadingAccessory?: ReactNode;
  /** Replaces mapped trailing items when supplied, including when explicitly null. */
  trailing?: ReactNode;
  /** @internal Window-owned views beside the host’s trailing controls. */
  trailingAccessory?: ReactNode;
  titleAction?: TopBarTitleAction | null;
  /** Metal variant: `"leading"` sets the app title (and its title action) straight after the
   *  leading items, as a document window does, leaving the middle for `center`. In dark chrome
   *  the leading title glows. Defaults to `"centre"`. */
  titlePlacement?: "centre" | "leading";
  center?: ReactNode;
  className?: string;
  /** @internal The bar is a document window's titlebar: the window's represented document title sits in it. */
  documentTitlebar?: boolean;
  smoothSurface?: SmoothSurfaceRequest;
  style?: CSSProperties;
}

export interface TopBarStyleDefinition {
  /** Built-in glyph URL per item kind (single-shape SVGs used as CSS masks). */
  icons: Partial<Record<TopBarItemKind, string>>;
}
