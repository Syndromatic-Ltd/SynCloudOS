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

import { AUFXAudioNode } from "./AUFXAudioNode";
import { AUFXAudioFormat } from "./AUFXAudioFormat";
import type { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import { createAUFXRealtimeNotifier, registerAUFXRealtimeNode } from "./AUFXAudioRenderPlan";
import { createAUFXFIRRenderState, renderAUFXFIRBlock } from "./AUFXAudioRenderRuntime.js";
/** Custom bounded FIR processor: finite coefficients, finite work and no arbitrary host-code execution. */
export class AUFXAudioProcessor extends AUFXAudioNode {
  readonly coefficients: readonly number[];
  #state: any;
  constructor(format: AUFXAudioFormat, coefficients: readonly number[]) {
    super(format);
    if (!coefficients.length || coefficients.length > 512 || coefficients.some(value => !Number.isFinite(value) || Math.abs(value) > 16)) throw new RangeError("Invalid FIR kernel.");
    this.coefficients = Object.freeze([...coefficients]); this.#state = createAUFXFIRRenderState(format, this.coefficients);
    const realtime = createAUFXRealtimeNotifier(); registerAUFXRealtimeNode(this, { snapshot: () => ({ kind: "fir", coefficients: this.coefficients }), subscribe: listener => realtime.subscribe(listener) });
  }
  override get processingCost() { return this.coefficients.length; }
  override reset() { this.#state = createAUFXFIRRenderState(this.format, this.coefficients); }
  render(inputs: readonly AUFXAudioPCMBuffer[], frames: number, _startTime: number, signal?: AbortSignal) {
    const result = this.buffer(frames), channels = Array.from({ length: this.format.channelCount }, (_, channel) => { const data = new Float32Array(frames); for (let frame = 0; frame < frames; frame++) { if (frame % 128 === 0) signal?.throwIfAborted(); for (const input of inputs) data[frame]! += input.getSample(channel, frame); } return data; });
    renderAUFXFIRBlock(this.coefficients, this.#state, channels, frames); for (let channel = 0; channel < channels.length; channel++) for (let frame = 0; frame < frames; frame++) result.setSample(channel, frame, channels[channel]![frame]!);
    return result;
  }
}
