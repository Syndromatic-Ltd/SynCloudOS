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
import { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import { createAUFXRealtimeNotifier, registerAUFXRealtimeNode } from "./AUFXAudioRenderPlan";
import {
  createAUFXTimePitchRenderState,
  renderAUFXTimePitchBlock,
  renderAUFXTimePitchBuffer,
} from "./AUFXAudioRenderRuntime.js";

export interface AUFXAudioTimePitchOptions {
  /** Pitch offset in semitones. Portable range: -12...+12. */
  readonly pitchSemitones?: number;
  /** Output duration divided by input duration for finite-buffer processing. Portable range: 0.5...2. */
  readonly timeScale?: number;
}

/**
 * Portable time/pitch processor.
 *
 * The fixed-rate graph supports duration-preserving pitch shift. Non-unit time
 * stretch is deliberately a finite-buffer operation because a perpetual
 * fixed-rate realtime graph cannot consume an upstream stream at a different
 * long-term rate without unbounded buffering or dropping source time.
 */
export class AUFXAudioTimePitchNode extends AUFXAudioNode {
  readonly pitchSemitones: number;
  readonly pitchRatio: number;
  readonly timeScale: number;
  readonly windowFrames: number;
  #state: any;

  constructor(format: AUFXAudioFormat, options: AUFXAudioTimePitchOptions = {}) {
    super(format);
    const pitchSemitones = options.pitchSemitones ?? 0, timeScale = options.timeScale ?? 1;
    if (!Number.isFinite(pitchSemitones) || pitchSemitones < -12 || pitchSemitones > 12) throw new RangeError("Pitch offset must be between -12 and +12 semitones.");
    if (!Number.isFinite(timeScale) || timeScale < 0.5 || timeScale > 2) throw new RangeError("Time scale must be between 0.5 and 2.");
    this.pitchSemitones = pitchSemitones;
    this.pitchRatio = 2 ** (pitchSemitones / 12);
    this.timeScale = timeScale;
    this.windowFrames = Math.max(128, Math.min(2_048, Math.round(format.sampleRate * 0.04)));
    this.#state = createAUFXTimePitchRenderState(format, this.snapshot());
    const realtime = createAUFXRealtimeNotifier();
    registerAUFXRealtimeNode(this, { snapshot: () => this.snapshot(), subscribe: listener => realtime.subscribe(listener) });
  }

  override get processingCost() { return 48; }
  get algorithmLatency() { return this.pitchRatio === 1 ? 0 : this.windowFrames / this.format.sampleRate; }
  get tailTime() { return this.algorithmLatency; }

  private snapshot() {
    return Object.freeze({ kind: "timePitch" as const, pitchRatio: this.pitchRatio, timeScale: this.timeScale, windowFrames: this.windowFrames });
  }

  override reset() { this.#state = createAUFXTimePitchRenderState(this.format, this.snapshot()); }

  render(inputs: readonly AUFXAudioPCMBuffer[], frames: number, _startTime: number, signal?: AbortSignal) {
    if (this.timeScale !== 1) throw new RangeError("Non-unit time stretch requires finite-buffer processing.");
    const result = this.buffer(frames);
    const channels = Array.from({ length: this.format.channelCount }, (_, channel) => {
      const data = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame++) {
        if ((frame & 127) === 0) signal?.throwIfAborted();
        for (const input of inputs) data[frame]! += input.getSample(channel, frame);
      }
      return data;
    });
    renderAUFXTimePitchBlock(this.snapshot(), this.#state, channels, frames);
    for (let channel = 0; channel < channels.length; channel++) for (let frame = 0; frame < frames; frame++) result.setSample(channel, frame, channels[channel]![frame]!);
    return result;
  }

  processBuffer(input: AUFXAudioPCMBuffer) {
    if (!input.format.isEqual(this.format)) throw new RangeError("Time-pitch buffer format does not match the node format.");
    const channels = Array.from({ length: this.format.channelCount }, (_, channel) => {
      const data = new Float32Array(input.frameLength);
      for (let frame = 0; frame < input.frameLength; frame++) data[frame] = input.getSample(channel, frame);
      return data;
    });
    const transformed = renderAUFXTimePitchBuffer(this.format, { pitchRatio: this.pitchRatio, timeScale: this.timeScale }, channels);
    const result = new AUFXAudioPCMBuffer(this.format, transformed.frameLength); result.frameLength = transformed.frameLength;
    for (let channel = 0; channel < this.format.channelCount; channel++) for (let frame = 0; frame < transformed.frameLength; frame++) result.setSample(channel, frame, transformed.channels[channel]![frame]!);
    return result;
  }
}
