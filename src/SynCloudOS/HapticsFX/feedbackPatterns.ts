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

import type { HFXFeedbackPreset, HFXFeedbackPresetName } from "./feedbackTypes";

export const defaultHFXFeedbackPatterns = {
  success: {
    pattern: [
      { duration: 30, intensity: 0.5 },
      { delay: 60, duration: 40, intensity: 1 }
    ]
  },
  warning: {
    pattern: [
      { duration: 40, intensity: 0.8 },
      { delay: 100, duration: 40, intensity: 0.6 }
    ]
  },
  error: {
    pattern: [
      { duration: 40, intensity: 0.7 },
      { delay: 40, duration: 40, intensity: 0.7 },
      { delay: 40, duration: 40, intensity: 0.9 },
      { delay: 40, duration: 50, intensity: 0.6 }
    ]
  },
  light: {
    pattern: [{ duration: 15, intensity: 0.4 }]
  },
  medium: {
    pattern: [{ duration: 25, intensity: 0.7 }]
  },
  heavy: {
    pattern: [{ duration: 35, intensity: 1 }]
  },
  soft: {
    pattern: [{ duration: 40, intensity: 0.5 }]
  },
  rigid: {
    pattern: [{ duration: 10, intensity: 1 }]
  },
  selection: {
    pattern: [{ duration: 8, intensity: 0.3 }]
  },
  nudge: {
    pattern: [
      { duration: 80, intensity: 0.8 },
      { delay: 80, duration: 50, intensity: 0.3 }
    ]
  },
  buzz: {
    pattern: [{ duration: 1000, intensity: 1 }]
  }
} as const satisfies Record<HFXFeedbackPresetName, HFXFeedbackPreset>;

export const HFX_FEEDBACK_PRESET_NAMES = Object.keys(defaultHFXFeedbackPatterns) as HFXFeedbackPresetName[];

export function isHFXFeedbackPresetName(value: unknown): value is HFXFeedbackPresetName {
  return typeof value === "string" && value in defaultHFXFeedbackPatterns;
}
