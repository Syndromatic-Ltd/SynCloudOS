/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { AUFXAudioPCMBuffer } from "../../AudioFX/AUFXAudioPCMBuffer";
import type { AUFXAudioFormat } from "../../AudioFX/AUFXAudioFormat";
import type { MEFXSampleBuffer } from "../../MediaFX/MEFXSampleBuffer";
import type { SPFXSpeechRecognitionTaskHint } from "../SPFXSpeechRecognitionTaskHint";
import type { RecognitionObservation } from "./transcriptionValues";
import { SPFXError } from "../SPFXError";
export type SpeechAuthorization = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
export type SpeechAudio = AUFXAudioPCMBuffer | MEFXSampleBuffer;
export interface SpeechRequest { readonly locale: Intl.Locale; readonly source: "buffers" | "url"; readonly url?: URL; readonly requiresOnDeviceRecognition: boolean; readonly shouldReportPartialResults: boolean; readonly addsPunctuation: boolean; readonly taskHint: SPFXSpeechRecognitionTaskHint; readonly contextualStrings: readonly string[]; }
export type SpeechEvent = { readonly type: "speech" | "audioEnd" | "complete" } | { readonly type: "duration"; readonly duration: number } | { readonly type: "result"; readonly result: RecognitionObservation } | { readonly type: "error"; readonly error: unknown };
export interface SpeechSession { readonly nativeAudioFormat?: AUFXAudioFormat; append(buffer: SpeechAudio): void; endAudio(): void; finish(): void; cancel(): void; }
export interface SpeechAdapter {
  authorizationStatus(): SpeechAuthorization;
  requestAuthorization(signal: AbortSignal): Promise<SpeechAuthorization>;
  isAvailable(locale: Intl.Locale): boolean;
  supportsOnDeviceRecognition(locale: Intl.Locale): boolean;
  supportedLocales(): ReadonlySet<Intl.Locale>;
  subscribeAvailability?(locale: Intl.Locale, listener: (available: boolean) => void): () => void;
  start(request: SpeechRequest, listener: (event: SpeechEvent) => void, signal: AbortSignal): SpeechSession | Promise<SpeechSession>;
}
export interface SpeechPort extends SpeechAdapter {
  readonly generation: number;
  assertAccess(generation?: number): void;
  observeAccessLoss(listener: () => void): () => void;
}
const ports = new WeakMap<object, SpeechPort>();
const adapters = new WeakMap<object, SpeechAdapter>();
export function associateSpeechPort(context: object, port: SpeechPort): void { ports.set(context, port); }
export function speechPortFor(context: object): SpeechPort { return ports.get(context) ?? unsupportedSpeech("Speech service"); }
export function associateSpeechAdapter(environment: object, adapter: SpeechAdapter): void { adapters.set(environment, adapter); }
export function speechAdapterFor(environment: object): SpeechAdapter | undefined { return adapters.get(environment); }
export function unsupportedSpeech(member: string): never { throw new SPFXError("NSCocoaErrorDomain", 3328, `${member} is unavailable on this speech service.`); }
export function speechDenied(): SPFXError { return new SPFXError("kAFAssistantErrorDomain", 1700, "The speech.recognize entitlement or speech authorization was denied or revoked."); }
export function speechCancelled(): SPFXError { return new SPFXError("kAFAssistantErrorDomain", 216, "Speech recognition was cancelled."); }
export function speechFailure(error: unknown): SPFXError { return error instanceof SPFXError ? error : error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError") ? speechDenied() : error instanceof DOMException && error.name === "AbortError" ? speechCancelled() : new SPFXError("kAFAssistantErrorDomain", 203, error instanceof Error ? error.message : "Speech recognition failed."); }
