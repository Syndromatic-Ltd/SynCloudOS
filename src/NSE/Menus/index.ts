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
export { MenuView } from "./MenuView";
export { nseMenuModel } from "./menuTypes";
export { NSEPopUpButton } from "./NSEPopUpButton";
export { ApplicationMenu } from "./ApplicationMenu";
export { createApplicationMenuModel } from "./createApplicationMenuModel";
export type { ApplicationMenuLabels, ApplicationMenuModelOptions } from "./createApplicationMenuModel";
export { NSEMenuBar } from "./NSEMenuBar";
export { MenuOverlay } from "./MenuOverlay";
export type {
  MenuDismissReason,
  MenuEntry,
  NSEMenuItem,
  MenuItemDefinition,
  MenuKeyEquivalent,
  MenuKeyEquivalentClaim,
  MenuKeyEquivalentResult,
  MenuModel,
  MenuModelOptions,
  NSEMenuOptions,
  MenuOverlayOptions,
  MenuPresentedEntry,
  NSEMenuRuntimePort,
  MenuSection,
  NSEMenuSnapshot,
} from "./menuTypes";
export type { CommandMenuProps, ItemMenuProps, NSEMenuProps } from "./MenuView";
export type { NSEPopUpButtonItem, NSEPopUpButtonProps } from "./NSEPopUpButton";
export type { ApplicationMenuProps } from "./ApplicationMenu";
export type { NSEMenuBarOverlayOptions, NSEMenuBarProps } from "./NSEMenuBar";
export { AppMenuSurface } from "./AppMenuSurface";
export type { AppMenuSurfaceProps } from "./AppMenuSurface";
