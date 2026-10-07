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

import { bindTFXFontDisposalOwner, prepareTFXFontBackend, TFXFont } from "../../FX/TextFX/TFXFont";
import { TFXFontDescriptor } from "../../FX/TextFX/TFXFontDescriptor";
import type { TFXFontClient, TFXFontFaceRegistration, TFXFontReadinessChange, TFXPackagedFontResourceLoader, TFXTextLayoutAdapter } from "../../FX/TextFX/textLayoutTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeCache, RuntimeCacheRegistry } from "../Cache";
import { decodeTFXFont, inspectTFXFontInput, type TFXFontFormat } from "./TFXFontCodec";
import { validateTFXFontResource, validateTFXFontResourcePath } from "../BundleLoader/fontResourceLoader";

const cacheId = "textfx.font.bytes";
const maximumCachedFontBytes = 64 * 1024 * 1024;
const maximumCachedFonts = 16;
const maximumRuntimeRegistrations = 32;
const maximumRuntimeDecodedBytes = 64 * 1024 * 1024;
const maximumRuntimePending = 8;
const maximumScopeRegistrations = 8;
const maximumScopeDecodedBytes = 32 * 1024 * 1024;
const maximumScopePending = 2;

interface CachedFontBytes {
  readonly source: Uint8Array;
  readonly decoded: Uint8Array;
  readonly format: TFXFontFormat;
}

export interface TFXFontHostScope extends TFXFontClient { dispose(): void; }
export interface TFXFontHost {
  readonly runtimeId: SynCloudOSRuntimeId;
  createScope(signal: AbortSignal, resourceLoader?: TFXPackagedFontResourceLoader): TFXFontHostScope;
  dispose(): void;
}

const abortError = (message: string) => new DOMException(message, "AbortError");
const quotaError = (message: string) => new DOMException(message, "QuotaExceededError");

function awaitWithAbort<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => finish(() => reject(signal.reason ?? abortError("Packaged font loading was cancelled.")));
    signal.addEventListener("abort", onAbort, { once: true });
    value.then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    );
  });
}

function fontKey(bytes: Uint8Array): string {
  let first = 0x811c9dc5, second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193);
    second = Math.imul(second ^ byte, 0x85ebca6b);
  }
  return `${bytes.byteLength}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

const safeFamilyPart = (value: string) => value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 96) || "runtime";

export function createTFXFontHost(options: {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly signal: AbortSignal;
  readonly caches: RuntimeCacheRegistry;
  readonly adapter?: Pick<TFXTextLayoutAdapter, "registerFontFace"> | null;
}): TFXFontHost {
  const byteCache: RuntimeCache<string, CachedFontBytes> = options.caches.create(cacheId, {
    resourceKind: "font",
    maxEntries: maximumCachedFonts,
    maxWeight: maximumCachedFontBytes,
    weightOf: ({ source, decoded }) => source.byteLength + decoded.byteLength,
  });
  const scopes = new Set<TFXFontHostScope>();
  let disposed = false, nextScope = 0, nextRegistration = 0;
  let runtimeLiveCount = 0, runtimeLiveBytes = 0, runtimePendingCount = 0, runtimePendingBytes = 0, runtimeResourcePendingCount = 0;

  const host: TFXFontHost = {
    runtimeId: options.runtimeId,
    createScope(ownerSignal, resourceLoader) {
      if (disposed || options.signal.aborted || ownerSignal.aborted) throw abortError("TextFX font host scope is unavailable.");
      const scopeId = ++nextScope;
      const scopeController = new AbortController();
      const registrations = new Map<string, {
        readonly font: TFXFont;
        readonly familyName: string;
        readonly decodedBytes: number;
        readonly platform: TFXFontFaceRegistration | null;
        unbindFontDisposal: () => void;
      }>();
      const listeners = new Set<(change: TFXFontReadinessChange) => void>();
      let scopeDisposed = false, generation = 0, scopeLiveBytes = 0, scopePendingCount = 0, scopePendingBytes = 0, scopeResourcePendingCount = 0;

      const publish = (id: string, familyName: string, state: TFXFontReadinessChange["state"]) => {
        generation += 1;
        const change = Object.freeze({ registrationId: id, familyName, generation, state });
        for (const listener of [...listeners]) {
          try { listener(change); }
          catch { /* A consumer cannot break host completion or suppress peer readiness. */ }
        }
      };
      const release = (id: string) => {
        const record = registrations.get(id);
        if (!record) return false;
        registrations.delete(id);
        runtimeLiveCount -= 1;
        runtimeLiveBytes -= record.decodedBytes;
        scopeLiveBytes -= record.decodedBytes;
        record.unbindFontDisposal();
        record.platform?.release();
        record.font.dispose();
        publish(id, record.familyName, "released");
        return true;
      };

      const scope: TFXFontHostScope = {
        get fontReadinessGeneration() { return generation; },
        async registerFont(source, descriptor, callerSignal) {
          if (scopeDisposed || disposed) throw abortError("TextFX font scope is disposed.");
          if (!(descriptor instanceof TFXFontDescriptor)) throw new TypeError("Font registration requires a TFXFontDescriptor.");
          const ownedSource = source.slice();
          const info = inspectTFXFontInput(ownedSource);
          const pendingBytes = info.decodedByteLength;
          if (registrations.size + scopePendingCount + scopeResourcePendingCount >= maximumScopeRegistrations || runtimeLiveCount + runtimePendingCount + runtimeResourcePendingCount >= maximumRuntimeRegistrations) throw quotaError("TextFX font registration count limit reached.");
          if (scopePendingCount + scopeResourcePendingCount >= maximumScopePending || runtimePendingCount + runtimeResourcePendingCount >= maximumRuntimePending) throw quotaError("TextFX pending font registration limit reached.");
          if (scopeLiveBytes + scopePendingBytes + pendingBytes > maximumScopeDecodedBytes || runtimeLiveBytes + runtimePendingBytes + pendingBytes > maximumRuntimeDecodedBytes) throw quotaError("TextFX decoded font byte limit reached.");
          callerSignal?.throwIfAborted();
          ownerSignal.throwIfAborted();
          options.signal.throwIfAborted();
          const signal = AbortSignal.any([options.signal, ownerSignal, scopeController.signal, ...(callerSignal ? [callerSignal] : [])]);
          const id = `${options.runtimeId}:font:${++nextRegistration}`;
          const familyName = `TFX_${safeFamilyPart(options.runtimeId)}_${scopeId}_${nextRegistration}`;
          scopePendingCount += 1;
          scopePendingBytes += pendingBytes;
          runtimePendingCount += 1;
          runtimePendingBytes += pendingBytes;
          let reservationLive = true, font: TFXFont | null = null, platform: TFXFontFaceRegistration | null = null;
          const releaseReservation = () => {
            if (!reservationLive) return;
            reservationLive = false;
            scopePendingCount -= 1;
            scopePendingBytes -= pendingBytes;
            runtimePendingCount -= 1;
            runtimePendingBytes -= pendingBytes;
          };
          try {
            await prepareTFXFontBackend(signal);
            signal.throwIfAborted();
            let key = fontKey(ownedSource), cached = byteCache.get(key), collision = 0;
            while (cached && !sameBytes(cached.source, ownedSource)) {
              key = `${fontKey(ownedSource)}:${++collision}`;
              cached = byteCache.get(key);
            }
            if (!cached) {
              const decoded = await decodeTFXFont(ownedSource, info, signal);
              signal.throwIfAborted();
              cached = Object.freeze({ source: ownedSource, decoded, format: info.format });
              byteCache.set(key, cached);
            }
            font = await TFXFont.create(cached.decoded, descriptor, signal);
            if (options.adapter?.registerFontFace) platform = await options.adapter.registerFontFace({ familyName, bytes: ownedSource, descriptor, signal });
            signal.throwIfAborted();
            if (scopeDisposed || disposed) throw abortError("TextFX font registration became stale.");
            releaseReservation();
            runtimeLiveCount += 1;
            runtimeLiveBytes += pendingBytes;
            scopeLiveBytes += pendingBytes;
            const ownedFont = font;
            const record = { font: ownedFont, familyName, decodedBytes: pendingBytes, platform, unbindFontDisposal: () => {} };
            registrations.set(id, record);
            record.unbindFontDisposal = bindTFXFontDisposalOwner(ownedFont, () => release(id));
            font = null;
            platform = null;
            const registration = Object.freeze({ id, familyName, format: info.format, font: ownedFont, dispose: () => release(id) });
            publish(id, familyName, "ready");
            if (scopeDisposed || disposed || signal.aborted || !registrations.has(id)) {
              release(id);
              throw abortError("TextFX font registration became stale.");
            }
            return registration;
          } catch (error) {
            platform?.release();
            font?.dispose();
            throw error;
          } finally {
            releaseReservation();
          }
        },
        async registerFontResource(requestedPath, descriptor, callerSignal) {
          if (scopeDisposed || disposed) throw abortError("TextFX font scope is disposed.");
          if (!resourceLoader) throw new DOMException("This TextFX font scope has no packaged-resource authority.", "NotSupportedError");
          if (!(descriptor instanceof TFXFontDescriptor)) throw new TypeError("Font registration requires a TFXFontDescriptor.");
          const path = validateTFXFontResourcePath(requestedPath);
          callerSignal?.throwIfAborted();
          ownerSignal.throwIfAborted();
          options.signal.throwIfAborted();
          if (registrations.size + scopePendingCount + scopeResourcePendingCount >= maximumScopeRegistrations || runtimeLiveCount + runtimePendingCount + runtimeResourcePendingCount >= maximumRuntimeRegistrations) throw quotaError("TextFX font registration count limit reached.");
          if (scopePendingCount + scopeResourcePendingCount >= maximumScopePending || runtimePendingCount + runtimeResourcePendingCount >= maximumRuntimePending) throw quotaError("TextFX pending font registration limit reached.");
          const signal = AbortSignal.any([options.signal, ownerSignal, scopeController.signal, ...(callerSignal ? [callerSignal] : [])]);
          scopeResourcePendingCount += 1;
          runtimeResourcePendingCount += 1;
          let reservationLive = true;
          const releaseReservation = () => {
            if (!reservationLive) return;
            reservationLive = false;
            scopeResourcePendingCount -= 1;
            runtimeResourcePendingCount -= 1;
          };
          try {
            await prepareTFXFontBackend(signal);
            signal.throwIfAborted();
            const resource = validateTFXFontResource(await awaitWithAbort(resourceLoader(path, signal), signal), path);
            signal.throwIfAborted();
            releaseReservation();
            return await scope.registerFont(resource.bytes, descriptor, signal);
          } finally {
            releaseReservation();
          }
        },
        subscribeFontReadiness(listener) {
          if (scopeDisposed) throw abortError("TextFX font scope is disposed.");
          if (typeof listener !== "function") throw new TypeError("Font-readiness listener must be a function.");
          listeners.add(listener);
          let active = true;
          return () => {
            if (!active) return;
            active = false;
            listeners.delete(listener);
          };
        },
        dispose() {
          if (scopeDisposed) return;
          scopeDisposed = true;
          scopeController.abort(abortError("TextFX font scope disposed."));
          ownerSignal.removeEventListener("abort", disposeScope);
          options.signal.removeEventListener("abort", disposeScope);
          for (const id of [...registrations.keys()]) release(id);
          listeners.clear();
          scopes.delete(scope);
        },
      };
      const disposeScope = () => scope.dispose();
      ownerSignal.addEventListener("abort", disposeScope, { once: true });
      options.signal.addEventListener("abort", disposeScope, { once: true });
      scopes.add(scope);
      return Object.freeze(scope);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const scope of [...scopes]) scope.dispose();
      byteCache.clear();
    },
  };
  return Object.freeze(host);
}
