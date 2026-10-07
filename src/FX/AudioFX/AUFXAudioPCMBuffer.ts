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

import { AUFXAudioFormat } from "./AUFXAudioFormat";
export class AUFXAudioPCMBuffer {
  private length = 0;
  private readonly storage: Float32Array;
  constructor(readonly format: AUFXAudioFormat, readonly frameCapacity: number) {
    if (!Number.isSafeInteger(frameCapacity) || frameCapacity < 0 || frameCapacity * format.channelCount > 16777216) throw new RangeError("PCM capacity exceeds bounds.");
    this.storage = new Float32Array(frameCapacity * format.channelCount);
  }
  get frameLength() { return this.length; }
  set frameLength(value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > this.frameCapacity) throw new RangeError("Invalid frame length.");
    this.length = value;
  }
  private offset(channel: number, frame: number) {
    if (!Number.isInteger(channel) || channel < 0 || channel >= this.format.channelCount || !Number.isInteger(frame) || frame < 0 || frame >= this.length) throw new RangeError("PCM index out of bounds.");
    return this.format.isInterleaved ? frame * this.format.channelCount + channel : channel * this.frameCapacity + frame;
  }
  getSample(channel: number, frame: number) { return this.storage[this.offset(channel, frame)]!; }
  setSample(channel: number, frame: number, sample: number) {
    if (!Number.isFinite(sample)) throw new RangeError("Sample must be finite.");
    this.storage[this.offset(channel, frame)] = sample;
  }
  copy() { const result = new AUFXAudioPCMBuffer(this.format, this.frameCapacity); result.length = this.length; result.storage.set(this.storage); return result; }
}
