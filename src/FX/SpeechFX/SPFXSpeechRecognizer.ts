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

export type SPFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";

export interface SPFXCapabilities {
  readonly recognition: boolean;
  /** Browser recognition can send audio to a remote service; local processing is not guaranteed. */
  readonly onDeviceRecognition: false;
}

export interface SPFXSpeechRecognitionRequest {
  readonly locale?: string;
  readonly reportsPartialResults?: boolean;
  readonly continuous?: boolean;
  readonly maximumAlternatives?: number;
  readonly signal?: AbortSignal;
}

export interface SPFXTranscription {
  readonly formattedString: string;
  readonly confidence: number;
}

export interface SPFXSpeechRecognitionResult {
  readonly bestTranscription: SPFXTranscription;
  readonly transcriptions: readonly SPFXTranscription[];
  readonly isFinal: boolean;
}

export interface SPFXSpeechRecognitionTask {
  readonly result: Promise<SPFXSpeechRecognitionResult>;
  /** Stop receiving audio and wait for the browser's final results. */
  finish(): void;
  cancel(): void;
}

/** Passive construction. Recognition and authorization requests require a user action. */
export interface SPFXSpeechRecognizer {
  getCapabilities(): SPFXCapabilities;
  getAuthorizationStatus(): Promise<SPFXAuthorizationStatus>;
  requestAuthorization(signal?: AbortSignal): Promise<SPFXAuthorizationStatus>;
  recognitionTask(request: SPFXSpeechRecognitionRequest, listener?: (result: SPFXSpeechRecognitionResult) => void): SPFXSpeechRecognitionTask;
  dispose(): void;
}

export interface SPFXSpeechClient {
  getCapabilities(): SPFXCapabilities;
  createRecognizer(signal?: AbortSignal): SPFXSpeechRecognizer;
}
