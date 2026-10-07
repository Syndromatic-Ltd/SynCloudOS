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

export { NSEMenuController, orderMenuEntries } from "./NSEMenuController";
export { NSEMenu } from "./NSEMenu";
export { NSEPicker } from "./NSEPicker";
export { NSEChoiceControl } from "./NSEChoiceControl";
export type { NSEChoiceControlProps, NSEChoiceOption } from "./NSEChoiceControl";
export { NSEApplicationMenu } from "./NSEApplicationMenu";
export { createNSEApplicationMenuModel } from "./createApplicationMenuModel";
export type { NSEApplicationMenuLabels, NSEApplicationMenuModelOptions } from "./createApplicationMenuModel";
export { NSEMenuBar } from "./NSEMenuBar";
export { NSEContextMenu } from "./NSEContextMenu";
export { NSEPopupButton } from "./NSEPopupButton";
export { NSEMenuOverlay } from "./NSEMenuOverlay";
export type {
  NSEMenuControllerOptions,
  NSEMenuDismissReason,
  NSEMenuEntry,
  NSEMenuItemDefinition,
  NSEMenuKeyEquivalent,
  NSEMenuKeyEquivalentClaim,
  NSEMenuKeyEquivalentResult,
  NSEMenuModel,
  NSEMenuOverlayOptions,
  NSEMenuPresentedEntry,
  NSEMenuRuntimePort,
  NSEMenuSection,
  NSEMenuSnapshot,
} from "./menuTypes";
export type { NSECommandMenuProps, NSEItemMenuProps, NSEMenuProps } from "./NSEMenu";
export type { NSEPickerAction, NSEPickerOption, NSEPickerProps } from "./NSEPicker";
export type { NSEMenuOverlayProps } from "./NSEMenuOverlay";
export type { NSEApplicationMenuProps } from "./NSEApplicationMenu";
export type { NSEMenuBarItem, NSEMenuBarOverlayOptions, NSEMenuBarProps } from "./NSEMenuBar";
export type { NSEContextMenuProps } from "./NSEContextMenu";
export { NSEAppMenuSurface } from "./NSEAppMenuSurface";
export type { NSEAppMenuSurfaceProps } from "./NSEAppMenuSurface";
export {
  NSEAppMenu,
  NSEEditMenu,
  NSEHelpMenu,
} from "./NSEApplicationMenuControls";
export type {
  NSEAppMenuItemDefinition,
  NSEAppMenuProps,
  NSEEditMenuProps,
  NSEHelpMenuProps,
} from "./NSEApplicationMenuControls";
export type { NSEPopupButtonProps } from "./NSEPopupButton";
