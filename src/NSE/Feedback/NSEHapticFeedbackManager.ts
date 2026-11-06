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

import type { HFXHapticEngine } from "../../FX/HapticsFX/HFXHapticEngine";
import type { HFXFeedbackPresetName } from "../../FX/HapticsFX/HFXHapticEvent";

/** NSHapticFeedbackManager.FeedbackPattern. */
export type NSEHapticFeedbackPattern = "generic" | "alignment" | "levelChange";

/** NSHapticFeedbackManager.PerformanceTime. `drawCompleted` waits for the next frame to be drawn. */
export type NSEHapticFeedbackPerformanceTime = "default" | "now" | "drawCompleted";

/** NSHapticFeedbackPerformer. */
export interface NSEHapticFeedbackPerformer {
  perform(pattern: NSEHapticFeedbackPattern, performanceTime?: NSEHapticFeedbackPerformanceTime): void;
}

const presets: Readonly<Record<NSEHapticFeedbackPattern, HFXFeedbackPresetName>> = Object.freeze({
  generic: "light",
  alignment: "selection",
  levelChange: "rigid",
});

const engines: HFXHapticEngine[] = [];

/** @internal The host registers its haptic engine while it is mounted; the latest one performs. */
export function registerNSEHapticFeedbackEngine(engine: HFXHapticEngine): () => void {
  engines.push(engine);
  return () => {
    const index = engines.lastIndexOf(engine);
    if (index !== -1) engines.splice(index, 1);
  };
}

const defaultPerformer: NSEHapticFeedbackPerformer = Object.freeze({
  perform(pattern: NSEHapticFeedbackPattern, performanceTime: NSEHapticFeedbackPerformanceTime = "default") {
    const preset = presets[pattern];
    if (!preset) throw new TypeError(`Unknown haptic feedback pattern "${String(pattern)}".`);
    if (performanceTime !== "default" && performanceTime !== "now" && performanceTime !== "drawCompleted") {
      throw new TypeError(`Unknown haptic performance time "${String(performanceTime)}".`);
    }
    // Without a haptic engine (no host, or a device that cannot vibrate) nothing happens, as on a Mac
    // without a Force Touch trackpad.
    const engine = engines.at(-1);
    if (!engine) return;
    const perform = () => { void engine.trigger(preset).catch(() => undefined); };
    if (performanceTime === "drawCompleted" && typeof requestAnimationFrame === "function") requestAnimationFrame(perform);
    else perform();
  },
});

/**
 * NSHapticFeedbackManager: haptic feedback for the person's actions. Controls perform their own; call
 * `NSEHapticFeedbackManager.defaultPerformer.perform("alignment")` when your own view snaps something
 * into place.
 */
export class NSEHapticFeedbackManager {
  private constructor() {}

  /** NSHapticFeedbackManager.defaultPerformer. */
  static get defaultPerformer(): NSEHapticFeedbackPerformer { return defaultPerformer; }
}
