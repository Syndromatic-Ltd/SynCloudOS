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

import type {
  SPFXAuthorizationStatus, SPFXCapabilities, SPFXSpeechClient, SPFXSpeechRecognitionRequest,
  SPFXSpeechRecognitionResult, SPFXSpeechRecognitionTask, SPFXSpeechRecognizer,
} from "../../FX/SpeechFX/SPFXSpeechRecognizer";

interface BrowserSpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string; readonly confidence: number };
}

export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: { readonly results: ArrayLike<BrowserSpeechResult>; readonly resultIndex: number }) => void) | null;
  onerror: ((event: { readonly error: string; readonly message?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface BrowserSpeechAdapterOptions {
  readonly isSecureContext: boolean;
  readonly browserWindow?: {
    readonly SpeechRecognition?: new () => BrowserSpeechRecognition;
    readonly webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
}

function snapshot(results: ArrayLike<BrowserSpeechResult>): SPFXSpeechRecognitionResult {
  const parts = Array.from(results);
  if (!parts.length || parts.some(part => !part.length)) throw new DOMException("No speech was recognized.", "NotFoundError");
  const count = Math.max(...parts.map(part => part.length));
  const transcriptions = Object.freeze(Array.from({ length: count }, (_, index) => {
    const alternatives = parts.map(part => part[Math.min(index, part.length - 1)]!);
    return Object.freeze({
      formattedString: alternatives.map(alternative => alternative.transcript).join(" "),
      confidence: alternatives.reduce((total, alternative) => total + alternative.confidence, 0) / alternatives.length,
    });
  }));
  return Object.freeze({ bestTranscription: transcriptions[0]!, transcriptions, isFinal: parts.every(part => part.isFinal) });
}

/** Web Speech recognition. Audio may be processed remotely by the browser vendor. */
export class BrowserSpeechAdapter implements SPFXSpeechClient {
  constructor(private readonly options: BrowserSpeechAdapterOptions) {}

  getCapabilities(): SPFXCapabilities {
    return Object.freeze({ recognition: this.options.isSecureContext && !!this.constructorForBrowser(), onDeviceRecognition: false });
  }

  private constructorForBrowser() {
    return this.options.browserWindow?.SpeechRecognition ?? this.options.browserWindow?.webkitSpeechRecognition;
  }

  createRecognizer(signal?: AbortSignal): SPFXSpeechRecognizer {
    const owner = new AbortController();
    const abortOwner = () => owner.abort(signal?.reason);
    signal?.addEventListener("abort", abortOwner, { once: true });
    if (signal?.aborted) abortOwner();
    let authorization: SPFXAuthorizationStatus = "unknown";
    let active = false;
    const capabilities = (): SPFXCapabilities => owner.signal.aborted
      ? Object.freeze({ recognition: false, onDeviceRecognition: false }) : this.getCapabilities();
    const run = (request: SPFXSpeechRecognitionRequest, listener?: (result: SPFXSpeechRecognitionResult) => void, authorizationOnly = false): SPFXSpeechRecognitionTask => {
      owner.signal.throwIfAborted(); request.signal?.throwIfAborted();
      if (!capabilities().recognition) throw new DOMException("Speech recognition requires a secure context and browser support.", "NotSupportedError");
      if (active) throw new DOMException("A recognition request is already active.", "InvalidStateError");
      const maxAlternatives = request.maximumAlternatives ?? 1;
      if (!Number.isSafeInteger(maxAlternatives) || maxAlternatives < 1) throw new RangeError("Maximum alternatives must be a positive safe integer.");
      const Recognition = this.constructorForBrowser()!;
      const native = new Recognition();
      native.lang = request.locale ?? "";
      native.continuous = request.continuous ?? false;
      native.interimResults = request.reportsPartialResults ?? false;
      native.maxAlternatives = maxAlternatives;
      active = true;
      let settled = false;
      let last: SPFXSpeechRecognitionResult | undefined;
      let rejectResult!: (reason: unknown) => void;
      let resolveResult!: (result: SPFXSpeechRecognitionResult) => void;
      const result = new Promise<SPFXSpeechRecognitionResult>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
      // Cancellation remains observable through result, even if the caller only uses callbacks.
      void result.catch(() => {});
      const cleanup = () => {
        active = false;
        owner.signal.removeEventListener("abort", abort);
        request.signal?.removeEventListener("abort", abort);
        native.onstart = null; native.onresult = null; native.onerror = null; native.onend = null;
      };
      const fail = (reason: unknown, stop = true) => {
        if (settled) return;
        settled = true; cleanup();
        try { if (stop) native.abort(); } catch { /* The browser may already have closed the service. */ }
        rejectResult(reason);
      };
      const abort = () => fail(owner.signal.aborted ? owner.signal.reason : request.signal?.reason);
      const succeed = (value: SPFXSpeechRecognitionResult, stop = false) => {
        if (settled) return;
        settled = true; cleanup();
        try { if (stop) native.abort(); } catch { /* Authorization was already observed. */ }
        resolveResult(value);
      };
      owner.signal.addEventListener("abort", abort, { once: true });
      request.signal?.addEventListener("abort", abort, { once: true });
      native.onstart = () => {
        if (settled) return;
        authorization = "granted";
        if (authorizationOnly) {
          const transcription = Object.freeze({ formattedString: "", confidence: 0 });
          succeed(Object.freeze({ bestTranscription: transcription, transcriptions: Object.freeze([transcription]), isFinal: true }), true);
        }
      };
      native.onresult = event => {
        if (settled) return;
        try { last = snapshot(event.results); listener?.(last); }
        catch (error) { fail(error); }
      };
      native.onerror = event => {
        if (settled) return;
        const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
        if (denied) authorization = "denied";
        const name = denied ? "NotAllowedError" : event.error === "aborted" ? "AbortError" : event.error === "no-speech" ? "NotFoundError" : "OperationError";
        fail(new DOMException(event.message || `Speech recognition failed: ${event.error}.`, name));
      };
      native.onend = () => {
        if (last) succeed(last);
        else fail(new DOMException("Speech recognition ended without a result.", "NotFoundError"), false);
      };
      try { native.start(); } catch (error) { fail(error); }
      return Object.freeze({
        result,
        finish() { if (!settled) { try { native.stop(); } catch (error) { fail(error); } } },
        cancel() { fail(new DOMException("Speech recognition was cancelled.", "AbortError")); },
      });
    };
    return Object.freeze<SPFXSpeechRecognizer>({
      getCapabilities: capabilities,
      async getAuthorizationStatus() { return capabilities().recognition ? authorization : "unavailable"; },
      async requestAuthorization(requestSignal) {
        owner.signal.throwIfAborted(); requestSignal?.throwIfAborted();
        if (!capabilities().recognition) return "unavailable";
        try { await run({ signal: requestSignal }, undefined, true).result; return "granted"; }
        catch (error) { if (error instanceof DOMException && error.name === "NotAllowedError") return "denied"; throw error; }
      },
      recognitionTask: (request, listener) => run(request, listener),
      dispose() {
        signal?.removeEventListener("abort", abortOwner);
        if (!owner.signal.aborted) owner.abort(new DOMException("Speech recognizer was disposed.", "AbortError"));
      },
    });
  }
}
