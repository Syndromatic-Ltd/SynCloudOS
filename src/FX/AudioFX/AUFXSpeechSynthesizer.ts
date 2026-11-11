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

export type AUFXSpeechAuthorizationStatus = "granted" | "denied" | "unavailable";
export interface AUFXSpeechVoice {
  readonly identifier: string;
  readonly name: string;
  readonly language: string;
  readonly isLocal: boolean;
  readonly isDefault: boolean;
}
export interface AUFXSpeechUtteranceOptions {
  readonly rate?: number;
  readonly pitch?: number;
  readonly volume?: number;
  readonly language?: string;
  readonly voiceIdentifier?: string;
}
/** Immutable AVSpeechUtterance analogue. Rate uses the browser's multiplier. */
export class AUFXSpeechUtterance {
  readonly speechString: string;
  readonly rate: number;
  readonly pitch: number;
  readonly volume: number;
  readonly language: string;
  readonly voiceIdentifier: string | null;
  constructor(text: string, options: AUFXSpeechUtteranceOptions = {}) {
    if (typeof text !== "string" || !text.trim() || text.length > 32_768) throw new TypeError("Speech requires 1 to 32768 characters.");
    const bounded = (n: number, min: number, max: number) => { if (!Number.isFinite(n) || n < min || n > max) throw new RangeError("Speech parameter is outside its supported range."); return n; };
    if (options.language !== undefined && (typeof options.language !== "string" || options.language.length > 128)) throw new TypeError("Speech language must be a string of at most 128 characters.");
    if (options.voiceIdentifier !== undefined && (typeof options.voiceIdentifier !== "string" || options.voiceIdentifier.length > 1024)) throw new TypeError("Speech voice identifier must be a string of at most 1024 characters.");
    this.speechString = text;
    this.rate = bounded(options.rate ?? 1, 0.1, 10);
    this.pitch = bounded(options.pitch ?? 1, 0, 2);
    this.volume = bounded(options.volume ?? 1, 0, 1);
    this.language = options.language ?? "";
    this.voiceIdentifier = options.voiceIdentifier ?? null;
    Object.freeze(this);
  }
}
export interface AUFXSpeechSynthesizerPort {
  readonly capabilities: Readonly<{ speechSynthesis: boolean; nativePermissionPrompt: false }>;
  readonly isSpeaking: boolean;
  readonly isPaused: boolean;
  readonly authorizationStatus: AUFXSpeechAuthorizationStatus;
  requestAuthorization(): Promise<AUFXSpeechAuthorizationStatus>;
  speechVoices(): readonly AUFXSpeechVoice[];
  speak(utterance: AUFXSpeechUtterance): Promise<void>;
  pauseSpeaking(): boolean;
  continueSpeaking(): boolean;
  stopSpeaking(): boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
export interface AUFXSpeechSynthesisHost {
  createSynthesizer(signal: AbortSignal, authorised: () => boolean): AUFXSpeechSynthesizer;
}
export interface AUFXSpeechClient { createSynthesizer(signal?: AbortSignal): AUFXSpeechSynthesizer; }
/** Session-issued AVSpeechSynthesizer analogue; disposal releases only its own speech. */
export class AUFXSpeechSynthesizer {
  readonly #port: AUFXSpeechSynthesizerPort;
  constructor(port: AUFXSpeechSynthesizerPort) { this.#port = port; }
  get capabilities() { return this.#port.capabilities; }
  get authorizationStatus() { return this.#port.authorizationStatus; }
  get isSpeaking() { return this.#port.isSpeaking; }
  get isPaused() { return this.#port.isPaused; }
  requestAuthorization() { return this.#port.requestAuthorization(); }
  speechVoices() { return this.#port.speechVoices(); }
  speak(utterance: AUFXSpeechUtterance) { return this.#port.speak(utterance); }
  pauseSpeaking() { return this.#port.pauseSpeaking(); }
  continueSpeaking() { return this.#port.continueSpeaking(); }
  stopSpeaking() { return this.#port.stopSpeaking(); }
  subscribe(listener: () => void) { return this.#port.subscribe(listener); }
  dispose() { this.#port.dispose(); }
}
