/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { PKFXError } from "../../FX/PassFX/PKFXError";
import { PKFXPaymentAuthorizationResult } from "../../FX/PassFX/PKFXPaymentAuthorizationResult";
import { isPaymentDenial, paymentFailure, type PaymentAdapter, type PaymentPort, type PaymentPresentation, type PaymentResponse } from "../../FX/PassFX/internal/paymentPort";
/** Private launch entitlement, native-denial and irrevocable mounted-resource authority. */
export function createMountedPaymentPort(adapter: PaymentAdapter | undefined, signal: AbortSignal,
  entitlements: () => readonly string[], authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort, observeAccess: (listener: () => void) => () => void = () => () => {}): PaymentPort {
  let generation = 0; let releasePrivacy: (() => void) | undefined; const observers = new Set<() => void>(); const live = new Set<() => void>();
  const allowed = () => { try { return !signal.aborted && entitlements().includes("payment.request") && authorise("payment.request"); } catch { return false; } };
  const invalidate = () => { generation++; for (const stop of [...live]) stop(); for (const observer of [...observers]) observer(); };
  const releaseAccess = observeAccess(() => { if (!allowed()) invalidate(); });
  const abort = () => { invalidate(); releaseAccess(); releasePrivacy?.(); releasePrivacy = undefined; observers.clear(); };
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const assertAccess = (captured = generation) => {
    if (signal.aborted || captured !== generation) throw new PKFXError("unknownError", "The payment lifetime has ended.");
    if (!allowed()) throw new PKFXError("notEntitledError", "The payment.request launch entitlement or host authorization is missing.");
    try { privacy?.assertRequestAllowed(); } catch (error) { throw paymentFailure(error); }
  };
  const bindAccessLifetime = (captured: number) => { assertAccess(captured); if (privacy && !releasePrivacy) releasePrivacy = privacy.bindResource(() => { releasePrivacy = undefined; invalidate(); }); };
  const assertAvailable = () => {
    assertAccess();
    if (!adapter) throw new PKFXError("unknownError", "PassKit payment presentation is unavailable.");
    try { adapter.assertAvailable(); } catch (error) {
      // Native denial is classified before conversion into PKPassKitError.
      if (isPaymentDenial(error)) privacy?.observe("denied");
      throw paymentFailure(error);
    }
  };
  return Object.freeze<PaymentPort>({
    get generation() { return generation; }, assertAccess, bindAccessLifetime, assertAvailable,
    observeAccessLoss(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
    canMakePayments(networks) { try { assertAccess(); return adapter?.canMakePayments(networks) ?? false; } catch { return false; } },
    open(request, requestSignal) {
      assertAccess(); assertAvailable(); requestSignal.throwIfAborted(); bindAccessLifetime(generation);
      if (live.size >= 4) throw new PKFXError("unknownError", "The application payment presentation limit was reached.");
      const captured = generation; const owner = new AbortController(); const combined = AbortSignal.any([signal, requestSignal, owner.signal]);
      let raw: PaymentPresentation | undefined; let response: PaymentResponse | undefined; let finished = false; let dismissed: Promise<void> | undefined;
      let openedResolve!: (value: PaymentPresentation) => void; let openedReject!: (error: unknown) => void;
      const opened = new Promise<PaymentPresentation>((resolve, reject) => { openedResolve = resolve; openedReject = reject; });
      const abandon = (value: PaymentResponse) => { if (finished) return; finished = true; try { void value.finish(new PKFXPaymentAuthorizationResult("failure")).catch(() => {}); } catch { /* Already closed by the native owner. */ } };
      const closeNative = () => { if (!dismissed) { try { dismissed = raw?.dismiss() ?? Promise.resolve(); } catch { dismissed = Promise.resolve(); } } return dismissed; };
      const stop = () => { owner.abort(); if (response) abandon(response); if (raw) void closeNative().catch(() => {}); live.delete(stop); combined.removeEventListener("abort", stop); };
      live.add(stop); combined.addEventListener("abort", stop, { once: true });
      const operation = async (lease: AbortSignal): Promise<PaymentResponse> => {
        assertAccess(captured); lease.throwIfAborted();
        raw = adapter!.open(request, combined); openedResolve(raw);
        response = await raw.authorized;
        try { assertAccess(captured); combined.throwIfAborted(); lease.throwIfAborted(); } catch (error) { abandon(response); throw error; }
        return response;
      };
      // This enters the native operation synchronously when the existing shared host gate allows it.
      const pending = privacy ? privacy.request(operation, { signal: combined, dispose: abandon }) : operation(combined);
      const authorized = pending.then(value => {
        assertAccess(captured); combined.throwIfAborted();
        return Object.freeze<PaymentResponse>({ payment: value.payment, async finish(result) {
          assertAccess(captured); combined.throwIfAborted(); if (finished) throw new PKFXError("unknownError", "The authorization handler was already completed.");
          finished = true;
          try { await value.finish(result); assertAccess(captured); combined.throwIfAborted(); }
          catch (error) {
            // A current native denial overrides saved consent before Apple error conversion.
            // An ended operation must not revoke the authority of its replacement.
            if (captured === generation && !combined.aborted && isPaymentDenial(error)) privacy?.observe("denied");
            throw paymentFailure(error);
          }
        } });
      }, error => { openedReject(error); stop(); throw paymentFailure(error); });
      return Object.freeze({ presented: opened.then(value => value.presented), authorized,
        dismiss() { stop(); return closeNative(); },
      });
    },
  });
}
