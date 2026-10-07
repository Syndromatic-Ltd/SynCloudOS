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

export type AUFXClockDomain = "source" | "render" | "output";

export interface AUFXClockObservationInit {
  readonly samplePosition: number;
  readonly sampleRate: number;
  readonly domain: AUFXClockDomain;
  readonly hostAnchorSeconds: number | null;
  readonly uncertaintySeconds: number;
  readonly discontinuityGeneration: number;
}

/**
 * A point observation that correlates an AUFX sample position with a named
 * clock domain. This intentionally remains separate from AUFXAudioTime: most
 * sample-time values do not need host correlation or discontinuity metadata.
 */
export class AUFXClockObservation {
  readonly samplePosition: number;
  readonly sampleRate: number;
  readonly domain: AUFXClockDomain;
  readonly hostAnchorSeconds: number | null;
  readonly uncertaintySeconds: number;
  readonly discontinuityGeneration: number;

  constructor(init: AUFXClockObservationInit) {
    if (!Number.isSafeInteger(init.samplePosition) || init.samplePosition < 0) throw new RangeError("Invalid AUFX clock sample position.");
    if (!Number.isFinite(init.sampleRate) || init.sampleRate <= 0) throw new RangeError("Invalid AUFX clock sample rate.");
    if (!["source", "render", "output"].includes(init.domain)) throw new RangeError("Invalid AUFX clock domain.");
    if (init.hostAnchorSeconds !== null && !Number.isFinite(init.hostAnchorSeconds)) throw new RangeError("Invalid AUFX host clock anchor.");
    if (!Number.isFinite(init.uncertaintySeconds) || init.uncertaintySeconds < 0) throw new RangeError("Invalid AUFX clock uncertainty.");
    if (!Number.isSafeInteger(init.discontinuityGeneration) || init.discontinuityGeneration < 0) throw new RangeError("Invalid AUFX discontinuity generation.");
    this.samplePosition = init.samplePosition;
    this.sampleRate = init.sampleRate;
    this.domain = init.domain;
    this.hostAnchorSeconds = init.hostAnchorSeconds;
    this.uncertaintySeconds = init.uncertaintySeconds;
    this.discontinuityGeneration = init.discontinuityGeneration;
    Object.freeze(this);
  }

  get seconds() { return this.samplePosition / this.sampleRate; }
}
