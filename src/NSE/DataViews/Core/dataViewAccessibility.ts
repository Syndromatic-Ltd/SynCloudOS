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

import type { NSEDataViewState } from "./dataViewTypes";

export function dataViewAnnouncement(state: NSEDataViewState): string {
  return state.kind === "ready" ? "" : state.message;
}

export function dataViewIsBusy(state: NSEDataViewState): boolean {
  return state.kind === "loading" || state.kind === "interrupted";
}

export function dataViewIsDisabled(state: NSEDataViewState): boolean {
  return state.kind === "disabled" || state.kind === "denied" || state.kind === "invalid";
}

export function dataViewAllowsNavigation(state: NSEDataViewState): boolean {
  return state.kind === "ready" || state.kind === "read-only";
}

export function dataViewAllowsMutation(state: NSEDataViewState): boolean {
  return state.kind === "ready";
}

export function dataViewPresentsContent(state: NSEDataViewState): boolean {
  return state.kind === "ready" || state.kind === "disabled" || state.kind === "read-only" || state.kind === "invalid";
}

export function dataViewEventIsComposing(event: { readonly keyCode?: number; readonly nativeEvent?: { readonly isComposing?: boolean } }): boolean {
  return event.keyCode === 229 || event.nativeEvent?.isComposing === true;
}
