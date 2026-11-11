import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { XRFXError } from "../../FX/XRFX/XRFXError";
import { isXRDenial, xrFailure, type XRAdapter, type XRPort, type XRRun } from "../../FX/XRFX/internal/xrPort";
/** Private application boundary. Every async result retains its original access generation. */
export function createMountedXRPort(adapter: XRAdapter | undefined, signal: AbortSignal, entitlements: () => readonly string[], authorise: (capability: string) => boolean, privacy?: PrivacyApplicationPort, observeAccess: (listener: () => void) => () => void = () => () => {}): XRPort {
  let generation = 0, releasePrivacy: (() => void) | undefined;
  let previousAuthorization = privacy?.authorizationStatus();
  const observers = new Set<() => void>(), live = new Set<() => void>();
  const allowed = () => { try { return !signal.aborted && entitlements().includes("xr.session") && authorise("xr.session"); } catch { return false; } };
  const invalidate = () => { generation++; for (const stop of [...live]) stop(); for (const observer of [...observers]) observer(); };
  const releaseAccess = observeAccess(() => {
    const authorization = privacy?.authorizationStatus();
    const lost = authorization !== previousAuthorization && authorization !== "granted";
    previousAuthorization = authorization;
    if (!allowed() || lost) invalidate();
  });
  const abort = () => { invalidate(); releaseAccess(); releasePrivacy?.(); releasePrivacy = undefined; observers.clear(); };
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const assertAccess = (captured: number, granted = false) => {
    if (signal.aborted || captured !== generation) throw new XRFXError("requestFailed", "XR application lifetime ended.");
    if (!allowed()) throw new XRFXError("cameraUnauthorized", "The xr.session launch entitlement or authorization is missing.");
    try { privacy?.assertRequestAllowed(); if (granted && privacy && privacy.authorizationStatus() !== "granted") throw new DOMException("XR consent is required.", "NotAllowedError"); }
    catch (error) { throw xrFailure(error); }
  };
  const bindAccessLifetime = () => {
    if (!privacy || releasePrivacy) return;
    try { releasePrivacy = privacy.bindResource(() => { releasePrivacy = undefined; previousAuthorization = privacy.authorizationStatus(); invalidate(); }); }
    catch { /* Denied construction is passive; the independent access observer remains owned. */ }
  };
  return Object.freeze<XRPort>({
    get generation() { return generation; }, assertAccess, bindAccessLifetime,
    observeAccessLoss(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
    async isSupported(kind, requestSignal = signal) {
      const captured = generation;
      if (signal.aborted || requestSignal.aborted || !allowed() || !adapter) return false;
      try { const result = await adapter.isSupported(kind); if (captured !== generation || signal.aborted || requestSignal.aborted) throw new XRFXError("requestFailed", "XR support query ended."); return result; }
      catch (error) { if (captured === generation && !signal.aborted && !requestSignal.aborted && isXRDenial(error)) privacy?.observe("denied"); throw xrFailure(error); }
    },
    async start(configuration, requestSignal, callbacks) {
      const captured = generation; assertAccess(captured); requestSignal.throwIfAborted(); bindAccessLifetime();
      if (!adapter) throw new XRFXError("sensorUnavailable", "XR is unavailable.");
      if (live.size >= 2) throw new XRFXError("sensorUnavailable", "The application XR session limit was reached.");
      const owner = new AbortController(), combined = AbortSignal.any([signal, requestSignal, owner.signal]);
      let raw: XRRun | undefined, closing: Promise<void> | undefined, nativeEnded = false;
      const current = () => captured === generation && !combined.aborted && !nativeEnded;
      const check = (granted = true) => { assertAccess(captured, granted); combined.throwIfAborted(); };
      const failure = (error: unknown) => { if (current() && isXRDenial(error)) privacy?.observe("denied"); return xrFailure(error); };
      const close = (report: boolean): Promise<void> => {
        if (!raw || nativeEnded) return Promise.resolve();
        if (!closing) {
          // Publish the closing promise before entering native code or privacy callbacks.
          let done!: () => void, fail!: (error: unknown) => void;
          closing = new Promise<void>((resolve, reject) => { done = resolve; fail = reject; });
          void (async () => { try { await raw!.pause(); if (report) check(); } catch (error) { if (report) throw failure(error); } })().then(done, fail);
        }
        return closing;
      };
      const stop = () => { live.delete(stop); combined.removeEventListener("abort", stop); owner.abort(); void close(false).catch(() => {}); };
      live.add(stop); combined.addEventListener("abort", stop, { once: true });
      const deliver = (work: () => void) => { if (!current()) return; try { check(); work(); } catch (error) { failure(error); } };
      const perform = async <T>(work: () => Promise<T>): Promise<T> => { try { check(); const result = await work(); check(); return result; } catch (error) { throw failure(error); } };
      const operation = async (lease: AbortSignal) => {
        try {
          check(false); lease.throwIfAborted();
          raw = await adapter.start(configuration, lease, {
            frame: value => deliver(() => callbacks.frame(value)),
            interrupted: () => deliver(callbacks.interrupted),
            interruptionEnded: () => deliver(callbacks.interruptionEnded),
            failed: error => { if (!current()) return; const converted = failure(error); if (current()) callbacks.failed(converted); },
            ended: () => {
              if (!current()) return;
              nativeEnded = true;
              live.delete(stop);
              combined.removeEventListener("abort", stop);
              try { callbacks.ended(); } finally { owner.abort(); }
            },
          });
          check(false); lease.throwIfAborted();
          return raw;
        } catch (error) { const converted = failure(error); await close(false); stop(); throw converted; }
      };
      try { if (privacy) await privacy.request(operation, { signal: combined }); else await operation(combined); check(); }
      catch (error) { const converted = failure(error); stop(); throw converted; }
      return Object.freeze<XRRun>({
        add: anchor => perform(() => raw!.add(anchor)), remove: anchor => perform(() => raw!.remove(anchor)), raycast: query => perform(() => raw!.raycast(query)),
        async pause() { try { check(); await close(true); } finally { stop(); } },
      });
    },
  });
}
