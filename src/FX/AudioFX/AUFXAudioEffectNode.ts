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
import type { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import { AUFXAudioFormat } from "./AUFXAudioFormat";
import { createAUFXRealtimeNotifier, registerAUFXRealtimeNode } from "./AUFXAudioRenderPlan";
import { createAUFXEffectRenderState, renderAUFXEffectBlock } from "./AUFXAudioRenderRuntime.js";
export type AUFXAudioEffect =
  | { readonly type: "delay"; readonly delayTime: number; readonly feedback: number; readonly wet: number }
  | { readonly type: "lowpass" | "highpass"; readonly frequency: number }
  | { readonly type: "bandpass" | "notch"; readonly frequency: number; readonly q?: number }
  | { readonly type: "equalizer"; readonly bands: readonly Readonly<{ frequency: number; gain: number; q: number }>[] }
  | { readonly type: "reverb"; readonly decayTime: number; readonly wet: number; readonly damping?: number }
  | { readonly type: "compression"; readonly threshold: number; readonly ratio: number; readonly attackTime?: number; readonly releaseTime?: number; readonly knee?: number; readonly makeupGain?: number };
const bounded = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
export class AUFXAudioEffectNode extends AUFXAudioNode {
  readonly effect: AUFXAudioEffect;
  private state: any;
  override get processingCost() { return this.effect.type === "equalizer" ? Math.max(1, this.effect.bands.length * 10) : this.effect.type === "reverb" ? 40 : this.effect.type === "compression" ? 16 : this.effect.type === "bandpass" || this.effect.type === "notch" ? 8 : 4; }
  constructor(format: AUFXAudioFormat, effect: AUFXAudioEffect) {
    super(format);
    if (effect.type === "delay") { if (!bounded(effect.delayTime, 1 / format.sampleRate, 10) || !bounded(effect.feedback, 0, 1 - Number.EPSILON) || !bounded(effect.wet, 0, 1) || Math.round(effect.delayTime * format.sampleRate) * format.channelCount > 8388608) throw new RangeError("Invalid delay or storage budget."); }
    else if (effect.type === "lowpass" || effect.type === "highpass") { if (!bounded(effect.frequency, Number.MIN_VALUE, format.sampleRate / 2) || effect.frequency >= format.sampleRate / 2) throw new RangeError("Invalid filter frequency."); }
    else if (effect.type === "bandpass" || effect.type === "notch") { if (!bounded(effect.frequency, Number.MIN_VALUE, format.sampleRate / 2) || effect.frequency >= format.sampleRate / 2 || !bounded(effect.q ?? Math.SQRT1_2, 0.1, 30)) throw new RangeError("Invalid biquad filter."); }
    else if (effect.type === "equalizer") { if (!Array.isArray(effect.bands) || effect.bands.length > 32 || effect.bands.some(band => !bounded(band.frequency, Number.MIN_VALUE, format.sampleRate / 2) || band.frequency >= format.sampleRate / 2 || !bounded(band.gain, -24, 24) || !bounded(band.q, 0.1, 30))) throw new RangeError("Invalid equalizer bands."); }
    else if (effect.type === "reverb") { if (!bounded(effect.decayTime, 0.1, 20) || !bounded(effect.wet, 0, 1) || !bounded(effect.damping ?? 0.3, 0, 0.99) || format.sampleRate * format.channelCount * 0.2 > 8388608) throw new RangeError("Invalid reverb or storage budget."); }
    else if (effect.type === "compression" && (!bounded(effect.threshold, Number.MIN_VALUE, 1) || !bounded(effect.ratio, 1, 100) || !bounded(effect.attackTime ?? 0.003, 0, 1) || !bounded(effect.releaseTime ?? 0.25, 0, 5) || !bounded(effect.knee ?? 6, 0, 40) || !bounded(effect.makeupGain ?? 0, -24, 24))) throw new RangeError("Invalid compressor.");
    this.effect = effect.type === "equalizer" ? Object.freeze({ ...effect, bands: Object.freeze(effect.bands.map(band => Object.freeze({ ...band }))) }) : Object.freeze({ ...effect }); this.state = createAUFXEffectRenderState(format, this.effect as unknown as Readonly<Record<string, unknown>>);
    const realtime = createAUFXRealtimeNotifier(); registerAUFXRealtimeNode(this, { snapshot: () => ({ kind: "effect", effect: this.effect as unknown as Readonly<Record<string, unknown>> }), subscribe: listener => realtime.subscribe(listener) });
  }
  override reset() { this.state = createAUFXEffectRenderState(this.format, this.effect as unknown as Readonly<Record<string, unknown>>); }
  render(inputs: readonly AUFXAudioPCMBuffer[], frames: number, _startTime: number, signal?: AbortSignal) { const result = this.buffer(frames), channels = Array.from({ length: this.format.channelCount }, (_, channel) => { const data = new Float32Array(frames); for (let frame = 0; frame < frames; frame++) { if (frame % 128 === 0) signal?.throwIfAborted(); for (const input of inputs) data[frame]! += input.getSample(channel, frame); } return data; }); renderAUFXEffectBlock(this.format, this.effect as unknown as Readonly<Record<string, unknown>>, this.state, channels, frames); for (let channel = 0; channel < channels.length; channel++) for (let frame = 0; frame < frames; frame++) result.setSample(channel, frame, channels[channel]![frame]!); return result; }
}
