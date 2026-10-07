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
import { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import { AUFXAudioParameter, observeAUFXParameter, snapshotAUFXParameter } from "./AUFXAudioParameter";
import { createAUFXRealtimeNotifier, registerAUFXRealtimeNode } from "./AUFXAudioRenderPlan";
export class AUFXAudioMixerNode extends AUFXAudioNode {
  override get inputBusCount() { return 32; }
  readonly volume = new AUFXAudioParameter();
  private readonly realtime = createAUFXRealtimeNotifier();
  private _muted = false;
  get muted() { return this._muted; }
  set muted(value: boolean) { if (typeof value !== "boolean") throw new TypeError("Muted must be boolean."); this._muted = value; this.realtime.changed(); }
  constructor(format: AUFXAudioNode["format"]) {
    super(format); observeAUFXParameter(this.volume, () => this.realtime.changed());
    registerAUFXRealtimeNode(this, { snapshot: () => ({ kind: "mixer", muted: this._muted, volume: snapshotAUFXParameter(this.volume, this.format.sampleRate) }), subscribe: listener => this.realtime.subscribe(listener) });
  }
  render(inputs: readonly AUFXAudioPCMBuffer[], frames: number, startTime: number, signal?: AbortSignal) {
    const output = this.buffer(frames);
    for (let frame = 0; frame < frames; frame++) {
      if (frame % 1024 === 0) signal?.throwIfAborted();
      const gain = this.muted ? 0 : this.volume.valueAt(startTime + frame / this.format.sampleRate);
      for (let channel = 0; channel < this.format.channelCount; channel++) {
        let sum = 0; for (const input of inputs) sum += input.getSample(channel, frame);
        output.setSample(channel, frame, sum * gain);
      }
    }
    return output;
  }
}
