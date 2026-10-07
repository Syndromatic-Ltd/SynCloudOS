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

import type { HFXHapticLifecycleEvent, HFXHapticPlaybackConfiguration, HFXHapticObservation } from "./HFXHapticLifecycle";
import type { AUFXAudioPCMBuffer } from "../AudioFX/AUFXAudioPCMBuffer";
import type { HFXFeedbackOptions, HFXFeedbackRequest } from "./HFXHapticEvent";
import type { HFXAudioResource, HFXHapticEngine } from "./HFXHapticEngine";
import type { HFXHapticPattern } from "./HFXHapticPattern";
import type { HFXHapticPatternPlayer } from "./HFXHapticPatternPlayer";
import type { HFXHapticAdvancedPatternPlayer } from "./HFXHapticAdvancedPatternPlayer";
/** App-facing engine authority: policy and backend operations are intentionally absent. */
export interface HFXHapticSession {
  readonly currentTime: number;
  readonly isSupported: boolean;
  readonly capabilities: HFXHapticEngine["capabilities"];
  observe(listener: (event: HFXHapticLifecycleEvent) => void): HFXHapticObservation;
  configurePlayback(configuration: HFXHapticPlaybackConfiguration): void;
  start(): Promise<void>;
  stop(): void;
  reset(): void;
  trigger(request: HFXFeedbackRequest, options?: HFXFeedbackOptions): Promise<void>;
  registerAudioResource(buffer: AUFXAudioPCMBuffer, signal?: AbortSignal): Promise<HFXAudioResource>;
  unregisterAudioResource(resource: HFXAudioResource): void;
  makePlayer(pattern: HFXHapticPattern): HFXHapticPatternPlayer;
  makeAdvancedPlayer(pattern: HFXHapticPattern): HFXHapticAdvancedPatternPlayer;
  dispose(): void;
}
