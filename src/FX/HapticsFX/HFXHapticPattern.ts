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

import type { HFXHapticEvent } from "./HFXHapticEvent";
import { HFXHapticParameterCurve } from "./HFXHapticParameterCurve";
export class HFXHapticPattern {
  readonly events: readonly HFXHapticEvent[];
  readonly curves: readonly HFXHapticParameterCurve[];
  readonly duration: number;
  constructor(events: readonly HFXHapticEvent[], curves: readonly HFXHapticParameterCurve[] = []) {
    if (!Array.isArray(events) || events.length > 4096 || curves.length > 128) throw new RangeError("Pattern exceeds limits.");
    this.events = Object.freeze(events.map(event => {
      if (!["transient", "continuous", "audio", "audioContinuous"].includes(event.type) || !Number.isFinite(event.relativeTime) || event.relativeTime < 0 || !Number.isFinite(event.duration ?? 0) || (event.duration ?? 0) < 0 || event.relativeTime + (event.duration ?? 0) > 3600) throw new RangeError("Invalid event time or type.");
      for (const value of [event.intensity, event.sharpness, event.audioBrightness, event.attackTime, event.decayTime, event.releaseTime]) if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError("Invalid event parameter.");
      if (event.sustained !== undefined && typeof event.sustained !== "boolean") throw new TypeError("Invalid envelope sustain.");
      if (event.audioUseVolumeEnvelope !== undefined && (typeof event.audioUseVolumeEnvelope !== "boolean" || event.type !== "audio")) throw new TypeError("Invalid waveform envelope option.");
      if (event.audioBrightness !== undefined && event.type !== "audio" && event.type !== "audioContinuous") throw new TypeError("Audio brightness requires audio event.");
      if (event.audioLoop !== undefined && (typeof event.audioLoop !== "boolean" || event.type !== "audio" && event.type !== "audioContinuous")) throw new TypeError("Invalid audio waveform loop.");
      for (const value of [event.audioPan, event.audioPitch]) if (value !== undefined && (!Number.isFinite(value) || value < -1 || value > 1 || event.type !== "audio" && event.type !== "audioContinuous")) throw new RangeError("Invalid audio pan/pitch parameter.");
      if (event.type === "audioContinuous" && (!(event.duration! > 0) || event.audioResource !== undefined)) throw new TypeError("Synthesized audio requires duration and no waveform resource.");
      if (event.type === "audio" && !event.audioResource) throw new TypeError("Audio event requires an owned resource.");
      return Object.freeze({ ...event });
    }).sort((a, b) => a.relativeTime - b.relativeTime));
    this.curves = Object.freeze([...curves]);
    this.duration = this.events.reduce((end, event) => Math.max(end, event.relativeTime + (event.duration ?? 0) + ((event.type !== "audio" || event.audioUseVolumeEnvelope) && event.sustained !== false ? event.releaseTime ?? 0 : 0)), 0);
    if (this.duration > 3600) throw new RangeError("Pattern envelope exceeds duration limit.");
    Object.freeze(this);
  }
}
