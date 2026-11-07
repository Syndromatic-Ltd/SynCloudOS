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

import type { VFXPresentationAuthorizationStatus } from "./VFXPictureInPictureController";
export type VFXRouteConnectionState = "unknown" | "disconnected" | "connecting" | "connected";
export interface VFXRouteDetector {
  readonly capabilities: Readonly<{ remotePlayback: boolean }>;
  readonly areRoutesAvailable: boolean | null;
  readonly connectionState: VFXRouteConnectionState;
  authorizationStatus(): VFXPresentationAuthorizationStatus;
  requestAuthorization(): VFXPresentationAuthorizationStatus;
  startDiscovery(): Promise<void>;
  stopDiscovery(): void;
  /** Delegates to the browser chooser; call directly from a user gesture. */
  prompt(): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
