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

export { NSEMenu, orderMenuEntries } from "./NSEMenu";
export { NSEMenuView } from "./NSEMenuView";
export { nseMenuModel } from "./menuTypes";
export { NSEPopUpButton } from "./NSEPopUpButton";
export { NSEApplicationMenu } from "./NSEApplicationMenu";
export { createNSEApplicationMenuModel } from "./createApplicationMenuModel";
export type { NSEApplicationMenuLabels, NSEApplicationMenuModelOptions } from "./createApplicationMenuModel";
export { NSEMenuBar } from "./NSEMenuBar";
export { NSEMenuOverlay } from "./NSEMenuOverlay";
export type {
  NSEMenuDismissReason,
  NSEMenuEntry,
  NSEMenuItem,
  NSEMenuItemDefinition,
  NSEMenuKeyEquivalent,
  NSEMenuKeyEquivalentClaim,
  NSEMenuKeyEquivalentResult,
  NSEMenuModel,
  NSEMenuModelOptions,
  NSEMenuOptions,
  NSEMenuOverlayOptions,
  NSEMenuPresentedEntry,
  NSEMenuRuntimePort,
  NSEMenuSection,
  NSEMenuSnapshot,
} from "./menuTypes";
export type { NSECommandMenuProps, NSEItemMenuProps, NSEMenuProps } from "./NSEMenuView";
export type { NSEPopUpButtonItem, NSEPopUpButtonProps } from "./NSEPopUpButton";
export type { NSEApplicationMenuProps } from "./NSEApplicationMenu";
export type { NSEMenuBarOverlayOptions, NSEMenuBarProps } from "./NSEMenuBar";
export { NSEAppMenuSurface } from "./NSEAppMenuSurface";
export type { NSEAppMenuSurfaceProps } from "./NSEAppMenuSurface";
