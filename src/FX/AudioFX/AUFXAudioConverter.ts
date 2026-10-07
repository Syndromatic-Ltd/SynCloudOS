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
import { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
export class AUFXAudioConverter {
  static convert(source: AUFXAudioPCMBuffer, format: AUFXAudioFormat, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const frames = Math.round(source.frameLength * format.sampleRate / source.format.sampleRate);
    const result = new AUFXAudioPCMBuffer(format, frames); result.frameLength = frames;
    for (let frame = 0; frame < frames; frame++) {
      if (frame % 1024 === 0) signal?.throwIfAborted();
      const position = frame * source.format.sampleRate / format.sampleRate;
      const lower = Math.min(source.frameLength - 1, Math.floor(position));
      const upper = Math.min(source.frameLength - 1, lower + 1);
      for (let channel = 0; channel < format.channelCount; channel++) {
        const read = (index: number) => {
          if (format.channelCount === 1 && source.format.channelCount > 1) {
            let sum = 0; for (let c = 0; c < source.format.channelCount; c++) sum += source.getSample(c, index);
            return sum / source.format.channelCount;
          }
          return source.getSample(Math.min(channel, source.format.channelCount - 1), index);
        };
        result.setSample(channel, frame, read(lower) + (read(upper) - read(lower)) * (position - lower));
      }
    }
    return result;
  }
}
