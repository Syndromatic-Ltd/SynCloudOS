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

import { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
export class AUFXAudioAnalyser {
  static level(buffer: AUFXAudioPCMBuffer) {
    let squares = 0, peak = 0;
    for (let c = 0; c < buffer.format.channelCount; c++) for (let f = 0; f < buffer.frameLength; f++) { const value = buffer.getSample(c, f); peak = Math.max(peak, Math.abs(value)); squares += value * value; }
    return Object.freeze({ peak, rms: buffer.frameLength ? Math.sqrt(squares / (buffer.frameLength * buffer.format.channelCount)) : 0 });
  }
  static spectrum(buffer: AUFXAudioPCMBuffer, fftSize = 1024, channel = 0) {
    if (!Number.isInteger(fftSize) || fftSize < 32 || fftSize > 32768 || (fftSize & (fftSize - 1)) !== 0 || !Number.isInteger(channel) || channel < 0 || channel >= buffer.format.channelCount) throw new RangeError("Invalid spectrum dimensions.");
    const real = new Float64Array(fftSize), imaginary = new Float64Array(fftSize); let windowSum = 0;
    for (let index = 0; index < fftSize; index++) { const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (fftSize - 1)); windowSum += window; real[index] = index < buffer.frameLength ? buffer.getSample(channel, index) * window : 0; }
    for (let index = 1, reversed = 0; index < fftSize; index++) {
      let bit = fftSize >> 1; for (; reversed & bit; bit >>= 1) reversed ^= bit; reversed ^= bit;
      if (index < reversed) [real[index], real[reversed]] = [real[reversed]!, real[index]!];
    }
    for (let size = 2; size <= fftSize; size *= 2) {
      const angle = -2 * Math.PI / size;
      for (let start = 0; start < fftSize; start += size) for (let index = 0; index < size / 2; index++) {
        const cosine = Math.cos(angle * index), sine = Math.sin(angle * index), even = start + index, odd = even + size / 2;
        const re = real[odd]! * cosine - imaginary[odd]! * sine, im = real[odd]! * sine + imaginary[odd]! * cosine;
        real[odd] = real[even]! - re; imaginary[odd] = imaginary[even]! - im; real[even] += re; imaginary[even] += im;
      }
    }
    const magnitudes = new Float32Array(fftSize / 2 + 1);
    for (let bin = 0; bin < magnitudes.length; bin++) magnitudes[bin] = Math.hypot(real[bin]!, imaginary[bin]!) / windowSum * (bin === 0 || bin === fftSize / 2 ? 1 : 2);
    return Object.freeze({ magnitudes, binWidth: buffer.format.sampleRate / fftSize, fftSize });
  }
}
