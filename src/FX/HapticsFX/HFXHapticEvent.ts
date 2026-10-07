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

export type HFXFeedbackPresetName = "success" | "warning" | "error" | "light" | "medium" | "heavy" | "soft" | "rigid" | "selection" | "nudge" | "buzz";
export type HFXFeedbackRequest = HFXFeedbackPresetName | false | null | undefined;
export interface HFXFeedbackOptions { readonly intensity?: number; readonly audio?: boolean | "desktop" | "fallback" | "always" | "debug" | "off"; }
export interface HFXHapticEvent {
  readonly type: "transient" | "continuous" | "audio" | "audioContinuous";
  readonly relativeTime: number;
  readonly duration?: number;
  readonly intensity?: number;
  readonly sharpness?: number;
  readonly attackTime?: number;
  readonly decayTime?: number;
  readonly releaseTime?: number;
  readonly sustained?: boolean;
  readonly audioUseVolumeEnvelope?: boolean;
  readonly audioBrightness?: number;
  readonly audioLoop?: boolean;
  readonly audioPan?: number;
  readonly audioPitch?: number;
  readonly name?: string;
  readonly audioResource?: string;
}
export type HFXHapticParameterID = "intensity" | "sharpness" | "audioVolume" | "audioPan" | "audioPitch" | "audioBrightness" | "hapticAttackTime" | "hapticDecayTime" | "hapticReleaseTime" | "audioAttackTime" | "audioDecayTime" | "audioReleaseTime";
export interface HFXHapticDynamicParameter { readonly parameterID: HFXHapticParameterID; readonly value: number; readonly relativeTime: number; }
