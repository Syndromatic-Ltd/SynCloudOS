/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { SPFXSpeechAudioBufferRecognitionRequest } from "../SPFXSpeechAudioBufferRecognitionRequest";
import { AUFXAudioPCMBuffer } from "../../AudioFX/AUFXAudioPCMBuffer";
import { MEFXSampleBuffer } from "../../MediaFX/MEFXSampleBuffer";
import { MEFXBlockBuffer } from "../../MediaFX/MEFXBlockBuffer";
import type { AUFXAudioFormat } from "../../AudioFX/AUFXAudioFormat";
import { speechFailure, type SpeechAudio } from "./speechPort";
export const audioRequests = new WeakMap<
  SPFXSpeechAudioBufferRecognitionRequest,
  {
    buffers: SpeechAudio[];
    samples: Set<MEFXSampleBuffer>;
    byteCount: number;
    ended: boolean;
    used: boolean;
    format?: AUFXAudioFormat;
    append?: (buffer: SpeechAudio) => void;
    end?: () => void;
    failure?: Error;
  }
>();
function copySample(sample: MEFXSampleBuffer): MEFXSampleBuffer {
  if (sample.state !== "ready" || sample.format.mediaType !== "audio")
    throw speechFailure(new Error("Speech requires ready audio sample data."));
  const bytes = new Uint8Array(sample.byteLength);
  const sizes: number[] = [];
  const timings = [];
  for (let index = 0, offset = 0; index < sample.sampleCount; index++) {
    const block = sample.sampleBlock(index);
    const size = sample.sampleSizeAt(index);
    try {
      block.copyTo(bytes.subarray(offset, offset + size));
    } finally {
      block.close();
    }
    sizes.push(size);
    timings.push(sample.timingAt(index));
    offset += size;
  }
  const payload = new MEFXBlockBuffer(bytes);
  try {
    return new MEFXSampleBuffer({
      payload,
      format: sample.format,
      sampleCount: sample.sampleCount,
      sampleSizes: sizes,
      timings,
      attachments: sample.attachments,
    });
  } finally {
    payload.close();
  }
}
export function appendAudio(request: SPFXSpeechAudioBufferRecognitionRequest, audio: SpeechAudio): void {
  const state = audioRequests.get(request)!;
  if (state.failure) throw state.failure;
  if (state.ended) throw speechFailure(new Error("The speech request has ended its audio input."));
  if (!(audio instanceof AUFXAudioPCMBuffer) && !(audio instanceof MEFXSampleBuffer))
    throw speechFailure(new Error("append requires an audio buffer."));
  if (!state.append && state.buffers.length >= 256) throw speechFailure(new Error("Pending speech audio buffer limit reached."));
  const byteCount = audio instanceof AUFXAudioPCMBuffer ? audio.frameCapacity * audio.format.channelCount * 4 : audio.byteLength;
  if (state.byteCount + byteCount > 64 * 1024 * 1024) throw speechFailure(new Error("The speech request audio limit is 64 MiB."));
  let snapshot: SpeechAudio;
  try {
    snapshot = audio instanceof AUFXAudioPCMBuffer ? audio.copy() : copySample(audio);
  } catch (error) {
    throw speechFailure(error);
  }
  state.byteCount += byteCount;
  if (snapshot instanceof MEFXSampleBuffer) state.samples.add(snapshot);
  if (state.append) state.append(snapshot);
  else state.buffers.push(snapshot);
}
export function endAudio(request: SPFXSpeechAudioBufferRecognitionRequest): void {
  const state = audioRequests.get(request)!;
  if (state.ended) return;
  state.ended = true;
  state.end?.();
}
