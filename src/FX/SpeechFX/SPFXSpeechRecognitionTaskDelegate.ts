/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { SPFXSpeechRecognitionTask } from "./SPFXSpeechRecognitionTask";
import type { SPFXSpeechRecognitionResult } from "./SPFXSpeechRecognitionResult";
import type { SPFXTranscription } from "./SPFXTranscription";
export interface SPFXSpeechRecognitionTaskDelegate {
  speechRecognitionDidDetectSpeech?(task: SPFXSpeechRecognitionTask): void;
  speechRecognitionTaskFinishedReadingAudio?(task: SPFXSpeechRecognitionTask): void;
  speechRecognitionTaskDidHypothesizeTranscription?(task: SPFXSpeechRecognitionTask, transcription: SPFXTranscription): void;
  speechRecognitionTaskDidFinishRecognition?(task: SPFXSpeechRecognitionTask, recognitionResult: SPFXSpeechRecognitionResult): void;
  speechRecognitionTaskDidFinishSuccessfully?(task: SPFXSpeechRecognitionTask, successfully: boolean): void;
  speechRecognitionTaskDidProcessAudioDuration?(task: SPFXSpeechRecognitionTask, duration: number): void;
  speechRecognitionTaskWasCancelled?(task: SPFXSpeechRecognitionTask): void;
}
