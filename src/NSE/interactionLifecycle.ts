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

import { useEffect, useRef } from "react";

export interface NSEDisposable {
  dispose(): void;
}

export interface NSEDisposalScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface NSEMicrotaskDisposalHandle { cancelled: boolean }

/** The default scheduler: it defers a release by one microtask, which is
 * enough for React's synchronous StrictMode cleanup/setup replay to cancel
 * it, and creates no runtime-owned timers while a shell is being unmounted. */
const microtaskDisposalScheduler: NSEDisposalScheduler = Object.freeze({
  setTimeout(callback: () => void, _delayMs: number) {
    const handle: NSEMicrotaskDisposalHandle = { cancelled: false };
    queueMicrotask(() => { if (!handle.cancelled) callback(); });
    return handle;
  },
  clearTimeout(handle: unknown) {
    if (!handle || typeof handle !== "object") return;
    const candidate = handle as Partial<NSEMicrotaskDisposalHandle>;
    if (typeof candidate.cancelled === "boolean") candidate.cancelled = true;
  },
});

/**
 * Releases an interaction resource after React has had an opportunity to
 * replay an effect. Development StrictMode deliberately runs cleanup/setup as
 * a pair while preserving the component instance; disposing a memoized
 * resource in that synthetic cleanup leaves its second setup holding a dead
 * resource. The scheduler defers the release one lifecycle turn; it is not an
 * interaction timer. It defaults to a microtask; pass an app scheduler to
 * defer through runtime-owned timers instead.
 *
 * Replacement resources retain independent leases, so replacing a model still
 * disposes the old resource, while a real unmount deterministically releases
 * the final one.
 */
export function useNSEDeferredDisposal(
  resource: NSEDisposable | null | undefined,
  scheduler: NSEDisposalScheduler = microtaskDisposalScheduler,
): void {
  const pending = useRef(new Map<NSEDisposable, { readonly lease: object; handle: unknown | null }>());

  useEffect(() => {
    if (!resource) return undefined;
    const existing = pending.current.get(resource);
    if (existing) {
      if (existing.handle !== null) {
        try { scheduler.clearTimeout(existing.handle); }
        catch { /* a revoked app scheduler cannot cancel its already-owned cleanup */ }
      }
      pending.current.delete(resource);
    }
    return () => {
      const entry = { lease: {}, handle: null as unknown | null };
      pending.current.set(resource, entry);
      let handle: unknown;
      try {
        handle = scheduler.setTimeout(() => {
          if (pending.current.get(resource) !== entry) return;
          pending.current.delete(resource);
          resource.dispose();
        }, 0);
      } catch {
        // Mount revocation can invalidate an app scheduler before React's
        // StrictMode cleanup/setup replay finishes. A microtask preserves the
        // deferred-disposal contract without extending the revoked capability:
        // replay removes the lease first; a real unmount leaves it to dispose.
        queueMicrotask(() => {
          if (pending.current.get(resource) !== entry) return;
          pending.current.delete(resource);
          resource.dispose();
        });
        return;
      }
      if (pending.current.get(resource) === entry) entry.handle = handle;
      else {
        try { scheduler.clearTimeout(handle); }
        catch { /* cleanup has already run */ }
      }
    };
  }, [resource, scheduler]);
}
