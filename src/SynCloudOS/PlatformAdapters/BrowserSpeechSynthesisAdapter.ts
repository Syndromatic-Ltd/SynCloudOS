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

import { AUFXSpeechSynthesizer, AUFXSpeechUtterance, type AUFXSpeechSynthesisHost } from "../../FX/AudioFX/AUFXSpeechSynthesizer";

export interface BrowserSpeechSynthesisPlatform {
  readonly synthesis: SpeechSynthesis;
  createUtterance(text: string): SpeechSynthesisUtterance;
}
interface Job {
  readonly owner: object;
  readonly utterance: SpeechSynthesisUtterance;
  readonly authorised: () => boolean;
  readonly finish: (error?: unknown) => void;
}
/** One queue per native synthesis object: native cancel() must never cancel a sibling owner. */
class SpeechQueue {
  readonly pending: Job[] = [];
  active: Job | null = null;
  paused = false;
  constructor(readonly platform: BrowserSpeechSynthesisPlatform) {}
  pump() {
    if (this.active) return;
    const job = this.pending.shift(); if (!job) return;
    if (!job.authorised()) { job.finish(new DOMException("Speech authority was revoked.", "SecurityError")); this.pump(); return; }
    this.active = job;
    const finish = (error?: unknown) => {
      if (this.active !== job) return;
      job.utterance.onend = job.utterance.onerror = null;
      this.active = null; this.paused = false;
      job.finish(error ?? (!job.authorised() ? new DOMException("Speech authority was revoked.", "SecurityError") : undefined)); this.pump();
    };
    job.utterance.onend = () => finish();
    job.utterance.onerror = event => finish(new DOMException(event.error || "Speech failed.", "OperationError"));
    try { this.platform.synthesis.speak(job.utterance); } catch (error) { finish(error); }
  }
  stop(owner: object) {
    let stopped = false;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].owner === owner) {
      stopped = true; this.pending.splice(i, 1)[0].finish(new DOMException("Speech cancelled.", "AbortError"));
    }
    const job = this.active;
    if (job?.owner === owner) {
      stopped = true; const wasPaused = this.paused; this.active = null; this.paused = false;
      job.utterance.onend = job.utterance.onerror = null;
      try { this.platform.synthesis.cancel(); } catch { /* Native cancellation failure cannot retain queued ownership. */ } finally { if (wasPaused) { try { this.platform.synthesis.resume(); } catch { /* Continue settling this owner. */ } } job.finish(new DOMException("Speech cancelled.", "AbortError")); this.pump(); }
    }
    return stopped;
  }
}
const queues = new WeakMap<SpeechSynthesis, SpeechQueue>();

export class BrowserSpeechSynthesisAdapter implements AUFXSpeechSynthesisHost {
  readonly #queue: SpeechQueue | null;
  constructor(platform: BrowserSpeechSynthesisPlatform | null) {
    if (!platform) { this.#queue = null; return; }
    let queue = queues.get(platform.synthesis);
    if (!queue) { queue = new SpeechQueue(platform); queues.set(platform.synthesis, queue); }
    this.#queue = queue;
  }
  createSynthesizer(signal: AbortSignal, authorised: () => boolean): AUFXSpeechSynthesizer {
    const queue = this.#queue, owner = {}, listeners = new Set<() => void>();
    let disposed = signal.aborted, count = 0;
    const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Observers do not own speech lifetime. */ } } };
    const live = () => !disposed && !signal.aborted;
    const status = () => !live() || !queue ? "unavailable" as const : authorised() ? "granted" as const : "denied" as const;
    const assertAuthority = () => {
      if (!live()) throw new DOMException("Speech owner ended.", "AbortError");
      if (!authorised()) throw new DOMException("SynWare capability audio.speech must be declared.", "SecurityError");
      if (!queue) throw new DOMException("Speech synthesis is unavailable.", "NotSupportedError");
    };
    const dispose = () => {
      if (disposed) return; disposed = true;
      signal.removeEventListener("abort", dispose);
      queue?.stop(owner); queue?.platform.synthesis.removeEventListener("voiceschanged", notify);
      notify(); listeners.clear();
    };
    if (!disposed) { signal.addEventListener("abort", dispose, { once: true });
      queue?.platform.synthesis.addEventListener("voiceschanged", notify); }
    return new AUFXSpeechSynthesizer({
      get capabilities() { return Object.freeze({ speechSynthesis: live() && !!queue, nativePermissionPrompt: false as const }); },
      get authorizationStatus() { return status(); },
      async requestAuthorization() { return status(); },
      get isSpeaking() { return live() && count > 0; },
      get isPaused() { return live() && queue?.active?.owner === owner && queue.paused; },
      speechVoices() {
        assertAuthority();
        return Object.freeze(queue!.platform.synthesis.getVoices().map(v => Object.freeze({ identifier: v.voiceURI, name: v.name, language: v.lang, isLocal: v.localService, isDefault: v.default })));
      },
      async speak(value) {
        assertAuthority();
        if (!(value instanceof AUFXSpeechUtterance)) throw new TypeError("Speech requires an AUFXSpeechUtterance.");
        if (count >= 32) throw new DOMException("Speech queue is full.", "QuotaExceededError");
        const utterance = queue!.platform.createUtterance(value.speechString);
        utterance.rate = value.rate; utterance.pitch = value.pitch; utterance.volume = value.volume; utterance.lang = value.language;
        if (value.voiceIdentifier !== null) {
          const voice = queue!.platform.synthesis.getVoices().find(v => v.voiceURI === value.voiceIdentifier);
          if (!voice) throw new DOMException("Requested speech voice is unavailable.", "NotFoundError");
          utterance.voice = voice;
        }
        count++;
        return new Promise<void>((resolve, reject) => {
          queue!.pending.push({ owner, utterance, authorised: () => live() && authorised(), finish(error) { count--; notify(); error === undefined ? resolve() : reject(error); } });
          notify();
          queue!.pump();
        });
      },
      pauseSpeaking() { assertAuthority(); if (queue!.active?.owner !== owner) return false; queue!.platform.synthesis.pause(); queue!.paused = true; notify(); return true; },
      continueSpeaking() { assertAuthority(); if (queue!.active?.owner !== owner) return false; queue!.platform.synthesis.resume(); queue!.paused = false; notify(); return true; },
      stopSpeaking() { return queue?.stop(owner) ?? false; },
      subscribe(listener) { if (!live()) throw new DOMException("Speech owner ended.", "AbortError"); listeners.add(listener); return () => { listeners.delete(listener); }; },
      dispose,
    });
  }
}

export function createBrowserSpeechSynthesisAdapter(browserWindow: Window | null): BrowserSpeechSynthesisAdapter {
  const native = browserWindow as (Window & { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }) | null;
  return new BrowserSpeechSynthesisAdapter(native?.speechSynthesis && native.SpeechSynthesisUtterance
    ? { synthesis: native.speechSynthesis, createUtterance: text => new native.SpeechSynthesisUtterance!(text) } : null);
}
