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

import type { LFXAccuracy, LFXAuthorizationStatus } from "./LFXCapabilities";
import type { LFXLocation } from "./LFXLocation";

export interface LFXLocationRequestOptions {
  readonly accuracy?: LFXAccuracy;
  readonly maximumAgeSeconds?: number;
  readonly timeoutSeconds?: number;
  readonly signal?: AbortSignal;
}

export interface LFXLocationWatchOptions {
  readonly accuracy?: LFXAccuracy;
  readonly maximumAgeSeconds?: number;
  readonly minimumIntervalSeconds?: number;
  readonly signal?: AbortSignal;
}

export interface LFXLocationWatch {
  dispose(): void;
}

/** A mount/owner-scoped foreground location manager. Construction is passive. */
export interface LFXLocationManager {
  getAuthorizationStatus(): Promise<LFXAuthorizationStatus>;
  current(options?: LFXLocationRequestOptions): Promise<LFXLocation>;
  watch(options: LFXLocationWatchOptions, listener: (location: LFXLocation) => void): LFXLocationWatch;
  dispose(): void;
}

export interface LFXLocationClient {
  createManager(signal?: AbortSignal): LFXLocationManager;
}
