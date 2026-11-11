/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { SPFXError } from "../../FX/SpeechFX/SPFXError";
import { speechCancelled, speechDenied, speechFailure, unsupportedSpeech, type SpeechAdapter, type SpeechPort, type SpeechSession, type SpeechAuthorization } from "../../FX/SpeechFX/internal/speechPort";
/** Private mounted authority. A lost lease remains invalid after consent restoration. */
export function createMountedSpeechPort(adapter: SpeechAdapter | undefined, signal: AbortSignal,
  entitlements: () => readonly string[], authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort, observeAccess: (listener: () => void) => () => void = () => () => {}): SpeechPort {
  let generation = 0; let active = 0;
  const observers = new Set<() => void>();
  const allowed = () => { try { return !signal.aborted && entitlements().includes("speech.recognize") && authorise("speech.recognize"); } catch { return false; } };
  const invalidate = () => { generation++; for (const listener of [...observers]) listener(); };
  let releasePrivacy: (() => void) | undefined;
  const bindPrivacy = () => { if (privacy && !releasePrivacy) releasePrivacy = privacy.bindResource(() => { releasePrivacy = undefined; invalidate(); }); };
  const unobserve = observeAccess(() => { if (!allowed()) invalidate(); });
  const abort = () => { invalidate(); unobserve(); releasePrivacy?.(); releasePrivacy = undefined; observers.clear(); };
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const assertAccess = (expected = generation) => {
    if (signal.aborted) throw speechCancelled();
    if (!allowed() || expected !== generation) throw speechDenied();
    try { privacy?.assertRequestAllowed(); } catch (error) { throw speechFailure(error); }
  };
  const status = (): SpeechAuthorization => {
    if (signal.aborted) return "unavailable";
    if (!allowed()) return "denied";
    const observed = adapter?.authorizationStatus() ?? "unavailable";
    const combined = privacy?.observe(observed) ?? observed;
    if (combined === "denied" || combined === "unavailable") { if (observers.size) invalidate(); }
    return combined;
  };
  return Object.freeze<SpeechPort>({
    get generation() { return generation; }, assertAccess,
    observeAccessLoss(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
    authorizationStatus: status,
    async requestAuthorization(requestSignal) {
      assertAccess(); const captured = generation;
      const wasBound = !!releasePrivacy; bindPrivacy();
      const owner = new AbortController();
      const revoked = () => owner.abort(); observers.add(revoked);
      const combined = AbortSignal.any([signal, requestSignal, owner.signal]);
      try {
        const operation = async (lease: AbortSignal) => {
          let result: SpeechAuthorization;
          try { result = await (adapter?.requestAuthorization(lease) ?? Promise.resolve("unavailable" as const)); }
          catch (error) {
            const nativeDenial = typeof error === "object" && error !== null && "name" in error && error.name === "NotAllowedError";
            const speechDenial = error instanceof SPFXError && error.domain === "kAFAssistantErrorDomain" && error.code === 1700;
            if (!nativeDenial && !speechDenial) throw error;
            // Commit the observed refusal through Privacy.requestAuthorization's
            // denial path before normalization. That path retires this completed
            // lease before revoking other resources, preserving its denied reply.
            result = "denied";
          }
          assertAccess(captured); lease.throwIfAborted();
          observers.delete(revoked);
          if (result !== "granted" && !wasBound) { releasePrivacy?.(); releasePrivacy = undefined; }
          return result;
        };
        const result = privacy ? await privacy.requestAuthorization(operation, { signal: combined }) : await operation(combined);
        if (result === "granted") { assertAccess(captured); bindPrivacy(); }
        return result;
      } catch (error) { throw speechFailure(error); }
      finally { observers.delete(revoked); }
    },
    isAvailable(locale) { return !signal.aborted && !!adapter?.isAvailable(locale); },
    supportsOnDeviceRecognition(locale) { return !signal.aborted && !!adapter?.supportsOnDeviceRecognition(locale); },
    supportedLocales() { if (signal.aborted) throw speechCancelled(); return adapter?.supportedLocales() ?? unsupportedSpeech("supportedLocales"); },
    subscribeAvailability(locale, listener) { assertAccess(); bindPrivacy(); return adapter?.subscribeAvailability?.(locale, listener) ?? (() => {}); },
    async start(request, listener, requestSignal) {
      assertAccess();
      if (!adapter || adapter.authorizationStatus() === "unavailable") unsupportedSpeech("recognitionTask");
      status(); assertAccess(); bindPrivacy();
      if (active >= 8) throw speechFailure(new Error("The application speech task limit was reached."));
      active++; const captured = generation;
      const controller = new AbortController(); const operationSignal = AbortSignal.any([signal, requestSignal, controller.signal]);
      let native: SpeechSession | undefined; let released = false;
      const release = () => { if (released) return; released = true; active--; observers.delete(cancel); operationSignal.removeEventListener("abort", cancel); };
      const cancel = () => { if (released) return; release(); controller.abort(); try { native?.cancel(); } catch { /* Native teardown must not restore authority. */ } };
      observers.add(cancel); operationSignal.addEventListener("abort", cancel, { once: true });
      try {
        const operation = async (lease: AbortSignal) => {
          assertAccess(captured); lease.throwIfAborted();
          const value = await (adapter?.start(request, event => { if (released) return; try { assertAccess(captured); operationSignal.throwIfAborted(); } catch { cancel(); return; } listener(event); }, lease) ?? unsupportedSpeech("recognitionTask"));
          if (released || lease.aborted || captured !== generation) { try { value.cancel(); } catch { /* Late resource cleanup. */ } throw speechCancelled(); }
          native = value; return value;
        };
        if (privacy) await privacy.request(operation, { signal: operationSignal, dispose: value => value.cancel() });
        else await operation(operationSignal);
        assertAccess(captured); operationSignal.throwIfAborted();
        return { nativeAudioFormat: native!.nativeAudioFormat,
          append(buffer) { assertAccess(captured); operationSignal.throwIfAborted(); native!.append(buffer); },
          endAudio() { assertAccess(captured); operationSignal.throwIfAborted(); native!.endAudio(); },
          finish() { native!.finish(); }, cancel,
        };
      } catch (error) { cancel(); throw speechFailure(error); }
    },
  });
}
