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

import type { NWFXAuthorizationStatus, NWFXCapabilities, NWFXPath } from "./NWFXPath";
/** Host adapter, injected into mounted sessions; never exported from the SDK entry. */
export interface NWFXNetworkPathAdapter {
  capabilities(): NWFXCapabilities;
  currentPath(): NWFXPath | null;
  subscribe(listener: (path: NWFXPath) => void): { dispose(): void };
}
export interface NWFXPathMonitor {
  /** Starts once; cancellation is terminal, as with NWPathMonitor. */
  start(listener: (path: NWFXPath) => void): void;
  cancel(): void;
  dispose(): void;
}
export interface NWFXPathClient {
  capabilities(): NWFXCapabilities;
  authorizationStatus(): NWFXAuthorizationStatus;
  /** Checks host authorization only; browsers have no network permission prompt. */
  requestAuthorization(): NWFXAuthorizationStatus;
  createMonitor(signal?: AbortSignal): NWFXPathMonitor;
}
