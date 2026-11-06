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

export { NSEApplication } from "./NSEApplication";
export type { NSEApplicationClass, NSEApplicationContext, NSEOpenWindowOptions } from "./NSEApplication";
export { NSEWindowController } from "./NSEWindowController";
export { NSEAlert, NSEAlertButton, NSEModalResponse } from "./NSEAlert";
export type { NSEAlertStyle } from "./NSEAlert";
export type {
  NSEAnyWindowController,
  NSEWindow,
  NSEWindowCloseOutcome,
  NSEWindowControllerClass,
  NSEWindowControllerContext,
  NSEWindowControllerOptions,
  NSEWindowDocument,
} from "./NSEWindowController";
export { NSEViewController } from "./NSEViewController";
export type {
  NSEControllerView,
  NSEViewComponent,
  NSEViewControllerClass,
  NSEViewControllerOptions,
  NSETraitCollection,
} from "./NSEViewController";
export type { NSEViewControllerFX, NSEViewControllerFXClients } from "./viewControllerFX";
export { outlet } from "./viewOutlet";
export type { NSEViewOutlet, NSEOutletElement, NSEOutletOptions } from "./viewOutlet";
export type { NSEManagedAFXDisplayLink, NSEManagedAFXDisplayLinkOptions, NSEManagedAFXFrame, NSEManagedAFXRenderer, NSEManagedAFXRendererOptions, NSEManagedAFXRendererSnapshot } from "./managedAnimationRenderer";
