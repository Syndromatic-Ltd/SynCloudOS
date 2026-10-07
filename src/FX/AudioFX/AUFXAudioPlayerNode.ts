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
import { createAUFXRealtimeNotifier, registerAUFXRealtimeNode, type AUFXRenderEvent } from "./AUFXAudioRenderPlan";
export type AUFXAudioScheduleResult = Readonly<{ status: "rendered"; endSampleTime: number }> | Readonly<{ status: "cancelled" }>;
export interface AUFXAudioSchedule { readonly completed: Promise<AUFXAudioScheduleResult>; cancel(): void; }
type ScheduledBuffer = { id: number; buffer: AUFXAudioPCMBuffer | null; planar: readonly Float32Array[] | null; time: number; loop: boolean; completed: boolean; finish(result: AUFXAudioScheduleResult): void };
export class AUFXAudioPlayerNode extends AUFXAudioNode {
  #schedule: ScheduledBuffer[] = [];
  #disposed = false;
  #nextScheduleId = 1;
  #positionRevision = 0;
  #retainForTimeline = false;
  retainTimelineSchedules(): () => void {
    this.assertActive();
    if (this.#retainForTimeline) throw new DOMException("Audio timeline schedules already have an owner.", "InvalidStateError");
    this.#retainForTimeline = true; this.#touch();
    let released = false;
    return () => {
      if (released) return; released = true; this.#retainForTimeline = false;
      for (const item of [...this.#schedule]) if (item.completed) item.finish({ status: "cancelled" });
      this.#touch();
    };
  }
  readonly #realtime = createAUFXRealtimeNotifier();
  get currentTime() { return this.#position; }
  private assertActive() { if (this.#disposed) throw new Error("Audio player is disposed."); }
  #playing = false;
  #position = 0;
  #rate = 1;
  get playbackRate() { return this.#rate; }
  set playbackRate(value: number) { if (!Number.isFinite(value) || value <= 0 || value > 4) throw new RangeError("Invalid playback rate."); this.#rate = value; this.#touch(); }
  get isPlaying() { return this.#playing; }
  constructor(format: AUFXAudioNode["format"]) {
    super(format);
    registerAUFXRealtimeNode(this, { snapshot: () => ({ kind: "player", positionRevision: this.#positionRevision, playing: this.#playing, position: this.#position, rate: this.#rate, retainForTimeline: this.#retainForTimeline, schedules: Object.freeze(this.#schedule.filter(item => item.buffer).map(item => Object.freeze({ id: item.id, time: item.time, loop: item.loop, channels: this.#planar(item) }))) }), subscribe: listener => this.#realtime.subscribe(listener), receive: event => this.#receiveRealtime(event) });
  }
  #touch(positionChanged = false) { if (positionChanged) this.#positionRevision++; this.#realtime.changed(); }
  #planar(item: ScheduledBuffer) { if (!item.planar) item.planar = Object.freeze(Array.from({ length: this.format.channelCount }, (_, channel) => { const data = new Float32Array(item.buffer!.frameLength); for (let frame = 0; frame < data.length; frame++) data[frame] = item.buffer!.getSample(channel, frame); return data; })); return item.planar; }
  #receiveRealtime(event: AUFXRenderEvent) {
    if (event.type === "state") { const state = event.players[0]; if (state) this.#position = state.position; }
    else if (event.type === "complete") this.#schedule.find(item => item.id === event.scheduleId)?.finish({ status: "rendered", endSampleTime: event.endSampleTime });
  }
  scheduleBuffer(buffer: AUFXAudioPCMBuffer, atTime = this.#position, loop = false, completion?: (result: AUFXAudioScheduleResult) => void): AUFXAudioSchedule {
    return this.scheduleSegment(buffer, 0, buffer.frameLength, atTime, loop, completion);
  }
  scheduleSegment(buffer: AUFXAudioPCMBuffer, startFrame: number, frameCount: number, atTime = this.#position, loop = false, completion?: (result: AUFXAudioScheduleResult) => void): AUFXAudioSchedule {
    this.assertActive();
    const retained = this.#schedule.reduce((sum, item) => sum + (item.buffer?.frameLength ?? 0) * this.format.channelCount, 0);
    if (!this.format.isEqual(buffer.format) || !Number.isSafeInteger(startFrame) || !Number.isSafeInteger(frameCount) || startFrame < 0 || frameCount <= 0 || startFrame + frameCount > buffer.frameLength || !Number.isFinite(atTime) || atTime < 0 || (atTime + frameCount / this.format.sampleRate) * this.format.sampleRate > Number.MAX_SAFE_INTEGER || (!loop && atTime + frameCount / this.format.sampleRate <= this.#position) || typeof loop !== "boolean" || this.#schedule.length >= 256 || retained + frameCount * this.format.channelCount > 16777216) throw new RangeError("Invalid scheduled segment or scheduling budget exceeded.");
    const owned = new AUFXAudioPCMBuffer(this.format, frameCount); owned.frameLength = frameCount;
    for (let channel = 0; channel < this.format.channelCount; channel++) for (let frame = 0; frame < frameCount; frame++) owned.setSample(channel, frame, buffer.getSample(channel, startFrame + frame));
    let resolve!: (result: AUFXAudioScheduleResult) => void, settled = false;
    const completed = new Promise<AUFXAudioScheduleResult>(done => { resolve = done; });
    const item: ScheduledBuffer = { id: this.#nextScheduleId++, buffer: owned, planar: null, time: atTime, loop, completed: false, finish: result => {
      if (result.status === "cancelled" || !this.#retainForTimeline) { item.buffer = null; item.planar = null; this.#schedule = this.#schedule.filter(candidate => candidate !== item); }
      if (settled) { if (result.status === "cancelled") this.#touch(); return; }
      settled = true; item.completed = result.status === "rendered";
      // Retained completion changes no render-plan data. Publishing a new plan
      // here could supersede a queued, acknowledged timeline transition.
      if (result.status === "cancelled" || !this.#retainForTimeline) this.#touch();
      const value = Object.freeze(result); resolve(value); const notify = completion; completion = undefined; try { notify?.(value); } catch { /* Completion observers cannot corrupt the render loop. */ }
    } };
    this.#schedule.push(item); this.#touch(); return Object.freeze({ completed, cancel: () => item.finish({ status: "cancelled" }) });
  }
  play() { this.assertActive(); this.#playing = true; this.#touch(); }
  pause() { this.assertActive(); this.#playing = false; this.#touch(); }
  stop() { this.#playing = false; this.#position = 0; for (const item of [...this.#schedule]) item.finish({ status: "cancelled" }); this.#touch(true); }
  seek(seconds: number) { this.assertActive(); if (!Number.isFinite(seconds) || seconds < 0 || seconds * this.format.sampleRate > Number.MAX_SAFE_INTEGER) throw new RangeError("Invalid playback position."); this.#position = seconds; if (!this.#retainForTimeline) for (const item of [...this.#schedule]) if (!item.loop && item.time + item.buffer!.frameLength / this.format.sampleRate <= seconds) item.finish({ status: "cancelled" }); this.#touch(true); }
  override reset() { this.stop(); }
  override dispose() { if (this.#disposed) return; this.#disposed = true; this.stop(); }
  render(_inputs: readonly AUFXAudioPCMBuffer[], frames: number, _startTime: number, signal?: AbortSignal) {
    this.assertActive(); const output = this.buffer(frames); if (!this.#playing) return output;
    for (let frame = 0; frame < frames; frame++) {
      if (frame % 1024 === 0) signal?.throwIfAborted();
      const time = this.#position + frame * this.#rate / this.format.sampleRate;
      for (const item of this.#schedule) {
        const buffer = item.buffer!;
        const position = (time - item.time) * this.format.sampleRate;
        if (position < 0 || (!item.loop && position >= buffer.frameLength)) continue;
        const index = Math.floor(position) % buffer.frameLength;
        const next = item.loop ? (index + 1) % buffer.frameLength : Math.min(index + 1, buffer.frameLength - 1);
        for (let channel = 0; channel < this.format.channelCount; channel++) {
          const a = buffer.getSample(channel, index), b = buffer.getSample(channel, next);
          output.setSample(channel, frame, output.getSample(channel, frame) + a + (b - a) * (position - Math.floor(position)));
        }
      }
    }
    const blockStartPosition = this.#position; this.#position += frames * this.#rate / this.format.sampleRate;
    const finished = this.#schedule.filter(item => !item.loop && item.time + item.buffer!.frameLength / this.format.sampleRate <= this.#position + 1e-12).map(item => ({ item, endSampleTime: Math.round(_startTime * this.format.sampleRate) + Math.min(frames, Math.max(0, Math.ceil(((item.time - blockStartPosition) * this.format.sampleRate + item.buffer!.frameLength) / this.#rate - 1e-9))) }));
    for (const completion of finished) completion.item.finish({ status: "rendered", endSampleTime: completion.endSampleTime });
    return output;
  }
}
