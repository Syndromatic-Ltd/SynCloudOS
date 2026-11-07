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

import type { CNFXContact } from "./CNFXContact";

export type CNFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
export type CNFXContactProperty = "name" | "email" | "tel";

export interface CNFXCapabilities {
  readonly contactPicker: boolean;
  readonly persistentAccess: false;
}

export interface CNFXContactRequest {
  readonly properties?: readonly CNFXContactProperty[];
  readonly multiple?: boolean;
  readonly signal?: AbortSignal;
}

/** Each request opens the browser's picker. No address-book enumeration or lasting grant. */
export interface CNFXContactStore {
  getCapabilities(): CNFXCapabilities;
  getAuthorizationStatus(): Promise<CNFXAuthorizationStatus>;
  requestAccess(options?: CNFXContactRequest): Promise<readonly CNFXContact[]>;
  dispose(): void;
}

export interface CNFXContactsClient {
  getCapabilities(): CNFXCapabilities;
  createContactStore(signal?: AbortSignal): CNFXContactStore;
}
