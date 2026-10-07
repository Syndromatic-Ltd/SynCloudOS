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

export interface HFXFeedbackVibration {
  duration: number;
  intensity?: number;
  delay?: number;
}

export type HFXFeedbackPresetName =
  | "success"
  | "warning"
  | "error"
  | "light"
  | "medium"
  | "heavy"
  | "soft"
  | "rigid"
  | "selection"
  | "nudge"
  | "buzz";

export type HFXFeedbackPattern = number[] | HFXFeedbackVibration[];

export interface HFXFeedbackPreset {
  pattern: HFXFeedbackVibration[];
}

export type HFXFeedbackInput = number | string | HFXFeedbackPattern | HFXFeedbackPreset;
export type HFXFeedbackRequest = HFXFeedbackInput | false | null | undefined;

export interface HFXFeedbackTriggerOptions {
  intensity?: number;
  audio?: HFXFeedbackAudioMode;
  buttonSound?: boolean;
  debug?: boolean;
  navigator?: HFXFeedbackNavigatorLike | null;
  document?: Document | null;
  requestAnimationFrame?: ((callback: FrameRequestCallback) => number) | null;
  cancelAnimationFrame?: ((handle: number) => void) | null;
  audioContextFactory?: (() => AudioContext | null) | null;
  warn?: ((message: string) => void) | null;
}

export type HFXFeedbackAudioMode = boolean | "desktop" | "fallback" | "always" | "debug" | "off";

export interface HFXFeedbackOptions {
  debug?: boolean;
  showSwitch?: boolean;
  audio?: HFXFeedbackAudioMode;
  buttonSound?: boolean;
  navigator?: HFXFeedbackNavigatorLike | null;
  document?: Document | null;
  requestAnimationFrame?: ((callback: FrameRequestCallback) => number) | null;
  cancelAnimationFrame?: ((handle: number) => void) | null;
  audioContextFactory?: (() => AudioContext | null) | null;
  warn?: ((message: string) => void) | null;
}

export interface HFXFeedbackNavigatorLike {
  vibrate?: (pattern: number | number[]) => boolean;
}

export type HFXFeedbackSupportReason = "vibration-api" | "no-navigator" | "no-vibration-api";

export interface HFXFeedbackSupportSnapshot {
  readonly supported: boolean;
  readonly reason: HFXFeedbackSupportReason;
}

