/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { PrivacyApplicationPort } from "../HostServices/AppSDKHostServiceTypes";
import { NFXReaderError } from "../../FX/NFCFX/NFXReaderError";
import { NFXNDEFMessage } from "../../FX/NFCFX/NFXNDEFMessage";
import { isNFCDenial, nfcFailure, type NFCAdapter, type NFCPort, type NFCNativeSession, type NFCNativeTag } from "../../FX/NFCFX/internal/nfcPort";

/** Private mounted authority. Every native boundary keeps its captured generation. */
export function createMountedNFCPort(adapter: NFCAdapter | undefined, signal: AbortSignal,
  entitlements: () => readonly string[], authorise: (capability: string) => boolean,
  privacy?: PrivacyApplicationPort, observeAccess: (listener: () => void) => () => void = () => () => {}): NFCPort {
  let generation = 0; let releasePrivacy: (() => void) | undefined;
  const observers = new Set<() => void>(); const live = new Set<() => void>();
  const allowed = (write = false) => { try { return !signal.aborted && entitlements().includes(write ? "nfc.write" : "nfc.read") && authorise(write ? "nfc.write" : "nfc.read"); } catch { return false; } };
  const invalidate = () => { generation++; for (const stop of [...live]) stop(); for (const observer of [...observers]) observer(); };
  let priorWrite = allowed(true);
  const releaseAccess = observeAccess(() => { const write = allowed(true); if (!allowed() || (priorWrite && !write)) invalidate(); priorWrite = write; });
  const abort = () => { invalidate(); releaseAccess(); releasePrivacy?.(); releasePrivacy = undefined; observers.clear(); };
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const assertAccess = (captured: number, write = false) => {
    if (signal.aborted || captured !== generation) throw new NFXReaderError("readerTransceiveErrorSessionInvalidated", "The NFC lifetime has ended.");
    if (!allowed(write)) throw new NFXReaderError("readerErrorSecurityViolation", "The NFC launch entitlement or host authorization is missing.");
    try { privacy?.assertRequestAllowed(); } catch (error) { throw nfcFailure(error); }
  };
  const bindAccessLifetime = (captured: number) => { assertAccess(captured); if (privacy && !releasePrivacy) releasePrivacy = privacy.bindResource(() => { releasePrivacy = undefined; invalidate(); }); };
  return Object.freeze<NFCPort>({
    get generation() { return generation; }, assertAccess, bindAccessLifetime,
    observeAccessLoss(listener) { observers.add(listener); return () => { observers.delete(listener); }; },
    get readingAvailable() { try { assertAccess(generation); return adapter?.readingAvailable ?? false; } catch { return false; } },
    async open(requestSignal, events) {
      const captured = generation; assertAccess(captured); requestSignal.throwIfAborted(); bindAccessLifetime(captured);
      if (!adapter?.readingAvailable) throw new NFXReaderError("readerErrorUnsupportedFeature", "NFC reading is unavailable.");
      if (live.size >= 4) throw new NFXReaderError("readerSessionInvalidationErrorSystemIsBusy", "The application NFC session limit was reached.");
      const owner = new AbortController(); const combined = AbortSignal.any([signal, requestSignal, owner.signal]);
      let raw: NFCNativeSession | undefined; let closing: Promise<void> | undefined;
      const current = () => captured === generation && !combined.aborted;
      const check = (write = false) => { assertAccess(captured, write); combined.throwIfAborted(); };
      const failure = (error: unknown) => { if (current() && isNFCDenial(error)) privacy?.observe("denied"); return nfcFailure(error); };
      const closeNative = (report: boolean) => {
        if (!raw) return Promise.resolve();
        if (!closing) {
          let resolve!: () => void; let reject!: (error: unknown) => void;
          closing = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
          // Assign ownership before native code can synchronously trigger revocation.
          void (async () => { try { await raw!.invalidate(); if (report) check(); } catch (error) { if (report) throw failure(error); } })().then(resolve, reject);
        }
        return closing;
      };
      const stop = () => { owner.abort(); live.delete(stop); combined.removeEventListener("abort", stop); void closeNative(false).catch(() => {}); };
      live.add(stop); combined.addEventListener("abort", stop, { once: true });
      const perform = async <T>(operation: () => Promise<T>, write = false): Promise<T> => {
        try { check(write); const result = await operation(); check(write); return result; } catch (error) { throw failure(error); }
      };
      const tags = new WeakMap<NFCNativeTag, NFCNativeTag>();
      const wrapTag = (tag: NFCNativeTag): NFCNativeTag => {
        const wrapped: NFCNativeTag = Object.freeze({
          get isAvailable() { try { check(); return tag.isAvailable; } catch (error) { failure(error); return false; } },
          queryNDEFStatus: () => perform(() => tag.queryNDEFStatus()),
          readNDEF: () => perform(() => tag.readNDEF()).then(value => new NFXNDEFMessage(value.records)),
          writeNDEF: (message: NFXNDEFMessage) => perform(() => tag.writeNDEF(new NFXNDEFMessage(message.records)), true),
          writeLock: () => perform(() => tag.writeLock(), true),
        }); tags.set(wrapped, tag); return wrapped;
      };
      const operation = async (lease: AbortSignal) => {
        check(); lease.throwIfAborted();
        raw = await adapter.open(combined, {
          messages(values) { if (!current()) return; try { check(); events.messages(values.map(value => new NFXNDEFMessage(value.records))); } catch (error) { events.error(failure(error)); } },
          tags(values) { if (!current()) return; try { check(); events.tags(values.map(wrapTag)); } catch (error) { events.error(failure(error)); } },
          error(error) { if (current()) events.error(failure(error)); },
        });
        try { check(); lease.throwIfAborted(); } catch (error) { await closeNative(false); throw error; }
        return raw;
      };
      try {
        if (privacy) await privacy.request(operation, { signal: combined, dispose: () => { stop(); } }); else await operation(combined);
        check();
      } catch (error) { const converted = failure(error); stop(); throw converted; }
      return Object.freeze<NFCNativeSession>({
        connect(tag) { const native = tags.get(tag); return perform(() => { if (!native) throw new NFXReaderError("readerErrorInvalidParameter", "The tag does not belong to this NFC session."); return raw!.connect(native); }); },
        restartPolling() { try { check(); raw!.restartPolling(); check(); } catch (error) { throw failure(error); } },
        async invalidate() { try { check(); await closeNative(true); } finally { stop(); } },
      });
    },
  });
}
