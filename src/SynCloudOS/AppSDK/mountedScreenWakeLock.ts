/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AppScreenWakeClient, AppScreenWakeLease, AppScreenWakeSnapshot } from "./playbackPresentationTypes";
import { browserPresentationErrorName } from "./browserPresentationError";
import type { NativeOperationActivity } from "../SynCloudOS";

export function createMountedScreenWakeLock(input: {
  readonly signal: AbortSignal;
  readonly navigator: Navigator | null;
  readonly assertLive: () => void;
  readonly isForeground: () => boolean;
  readonly isVisible: () => boolean;
  readonly subscribeOwner: (listener: () => void) => () => void;
  readonly nativeActivity?: NativeOperationActivity;
  readonly ownerEndReason?: () => "owner-ended" | "account-changed";
}): AppScreenWakeClient {
  const leases = new Set<{ retire(reason: AppScreenWakeSnapshot["reason"]): Promise<void> }>();
  const observeOwner = () => {
    if (input.isForeground() && input.isVisible()) return;
    for (const lease of [...leases]) void lease.retire(input.isVisible() ? "not-foreground" : "hidden");
  };
  const removeOwner = input.subscribeOwner(observeOwner);
  const end = () => {
    for (const lease of [...leases]) void lease.retire(input.ownerEndReason?.() ?? "owner-ended");
    removeOwner(); input.signal.removeEventListener("abort", end);
  };
  input.signal.addEventListener("abort", end, { once: true });
  if (input.signal.aborted) end();
  return Object.freeze({
    request(reason: string, signal?: AbortSignal): AppScreenWakeLease {
      input.assertLive(); input.signal.throwIfAborted(); signal?.throwIfAborted();
      if (typeof reason !== "string" || !reason.trim() || reason.length > 256 || /[\u0000-\u001f\u007f]/.test(reason)) throw new TypeError("Screen wake intent needs a bounded explicit reason.");
      if (leases.size >= 8) throw new DOMException("Screen wake lease limit reached.", "QuotaExceededError");
      const listeners = new Set<() => void>();
      let sentinel: WakeLockSentinel | null = null;
      let retired = false, terminal = false;
      let releasePromise: Promise<void> | null = null;
      let snapshot: AppScreenWakeSnapshot = Object.freeze({ state: "requesting", reason: "requested", errorName: null });
      const publish = (patch: Partial<AppScreenWakeSnapshot>) => {
        const next = Object.freeze({ ...snapshot, ...patch });
        if (JSON.stringify(snapshot) === JSON.stringify(next)) return;
        snapshot = next;
        for (const listener of [...listeners]) { try { listener(); } catch { /* observers cannot prevent release */ } }
      };
      const cleanup = () => {
        if (terminal) return;
        terminal = true; leases.delete(owned); signal?.removeEventListener("abort", abort);
        sentinel?.removeEventListener("release", browserReleased);
        listeners.clear();
      };
      const browserReleased = () => {
        if (terminal) return;
        publish({ state: retired ? "released" : "revoked", reason: retired ? snapshot.reason : "browser-released", errorName: null }); cleanup();
      };
      const owned = { retire(cause: AppScreenWakeSnapshot["reason"]): Promise<void> {
        if (releasePromise) return releasePromise;
        if (terminal) return Promise.resolve();
        retired = true;
        releasePromise = acquisition.then(async () => {
          if (!sentinel || sentinel.released) { if (!terminal) { publish({ state: "released" }); cleanup(); } return; }
          try { await (input.nativeActivity && !input.nativeActivity.signal.aborted ? input.nativeActivity.track(() => sentinel!.release()) : sentinel.release()); if (!terminal) { publish({ state: "released" }); cleanup(); } }
          catch (error) { publish({ state: "failed", reason: "release-failed", errorName: browserPresentationErrorName(error) }); releasePromise = null; }
        });
        publish({ state: "releasing", reason: cause, errorName: null });
        return releasePromise;
      } };
      const abort = () => { void owned.retire("caller-ended"); };
      let settleAcquisition!: () => void;
      const acquisition = new Promise<void>(resolve => { settleAcquisition = resolve; });
      const wake = input.navigator?.wakeLock;
      if (!wake || typeof wake.request !== "function") {
        settleAcquisition(); publish({ state: "unsupported", reason: "unavailable" }); cleanup();
      } else if (!input.isVisible() || !input.isForeground()) {
        settleAcquisition(); publish({ state: "deferred", reason: input.isVisible() ? "not-foreground" : "hidden" }); cleanup();
      } else {
        leases.add(owned); signal?.addEventListener("abort", abort, { once: true });
        let pending: Promise<WakeLockSentinel>;
        try { pending = input.nativeActivity ? input.nativeActivity.track(() => wake.request("screen")) : wake.request("screen"); }
        catch (error) { pending = Promise.reject(error); }
        void Promise.resolve(pending).then(value => {
          sentinel = value;
          sentinel.addEventListener("release", browserReleased);
          if (retired) return; // retire awaits this acquisition and releases the late sentinel
          if (sentinel.released) { browserReleased(); return; }
          if (input.signal.aborted || signal?.aborted || !input.isVisible() || !input.isForeground()) {
            // Defer to a microtask after acquisition assignment; never publish
            // held or request a replacement for an interrupted acquisition.
            queueMicrotask(() => { void owned.retire(input.signal.aborted ? "owner-ended" : signal?.aborted ? "caller-ended" : input.isVisible() ? "not-foreground" : "hidden"); });
          } else publish({ state: "held" });
        }, error => {
          if (retired) return;
          publish({ state: "failed", reason: "request-failed", errorName: browserPresentationErrorName(error) }); cleanup();
        }).finally(settleAcquisition);
        if (input.signal.aborted || signal?.aborted) abort();
      }
      return Object.freeze({ getSnapshot: () => snapshot, subscribe(listener: () => void) { if (terminal) return () => undefined; listeners.add(listener); return () => { listeners.delete(listener); }; }, release: () => owned.retire("explicit") });
    },
  });
}
