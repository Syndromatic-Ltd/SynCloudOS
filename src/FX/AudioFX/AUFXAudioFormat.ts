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

/** Portable floating-point PCM format. Public times are seconds; positions are frames. */
export class AUFXAudioFormat {
  constructor(readonly sampleRate: number, readonly channelCount: number, readonly isInterleaved = false) {
    if (!Number.isFinite(sampleRate) || sampleRate < 1 || sampleRate > 384000) throw new RangeError("Invalid sample rate.");
    if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > 32) throw new RangeError("Invalid channel count.");
    Object.freeze(this);
  }
  isEqual(other: AUFXAudioFormat) { return this.sampleRate === other.sampleRate && this.channelCount === other.channelCount && this.isInterleaved === other.isInterleaved; }
}
