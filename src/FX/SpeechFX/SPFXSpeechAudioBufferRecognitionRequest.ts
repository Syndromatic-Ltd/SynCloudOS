/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { SPFXSpeechRecognitionRequest } from "./SPFXSpeechRecognitionRequest";
import { AUFXAudioPCMBuffer } from "../AudioFX/AUFXAudioPCMBuffer";
import type { AUFXAudioFormat } from "../AudioFX/AUFXAudioFormat";
import { MEFXSampleBuffer } from "../MediaFX/MEFXSampleBuffer";
import { audioRequests, appendAudio, endAudio } from "./internal/audioRequests";
import { unsupportedSpeech } from "./internal/speechPort";
/** Supplied audio only: this request never opens a microphone. */
export class SPFXSpeechAudioBufferRecognitionRequest extends SPFXSpeechRecognitionRequest {
  constructor() { super(); audioRequests.set(this, { buffers: [], samples: new Set(), byteCount: 0, ended: false, used: false }); }
  append(audioPCMBuffer: AUFXAudioPCMBuffer): void { appendAudio(this, audioPCMBuffer); }
  appendAudioSampleBuffer(sampleBuffer: MEFXSampleBuffer): void { appendAudio(this, sampleBuffer); }
  endAudio(): void { endAudio(this); }
  /** Available after a capable recognition service attaches; web Speech cannot expose it. */
  get nativeAudioFormat(): AUFXAudioFormat { return audioRequests.get(this)!.format ?? unsupportedSpeech("nativeAudioFormat"); }
}
