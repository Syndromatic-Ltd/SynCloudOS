/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { NWFXError } from "../../FX/NetworkFX/NWFXError";
import { networkFailure, type NetworkPathAdapter, type NetworkPort } from "../../FX/NetworkFX/internal/networkPort";
/** Private per-mount authority. Access generations cannot revive after false -> true. */
export function createMountedNetworkPort(adapter: NetworkPathAdapter, signal: AbortSignal,
  permissions: () => readonly string[], authorise: (capability: "network.read") => boolean,
  observeAccess: (listener: () => void) => () => void): NetworkPort {
  let generation = 0; let subscriptions = 0;
  const observers = new Set<() => void>();
  const allowed = () => { try { return !signal.aborted && permissions().includes("network.read") && authorise("network.read"); } catch { return false; } };
  const changed = () => { if (!allowed()) { generation++; for (const listener of [...observers]) listener(); } };
  const unobserve = observeAccess(changed);
  const abort = () => { changed(); unobserve(); observers.clear(); };
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const assertAccess = (expected = generation) => {
    if (!allowed() || expected !== generation) throw NWFXError.posix(13, "The network.read entitlement or application access was revoked or denied.");
  };
  return Object.freeze({
    get generation() { return generation; }, assertAccess,
    observeAccessLoss(listener: () => void) { observers.add(listener); if (!allowed()) listener(); return () => { observers.delete(listener); }; },
    currentPath() { assertAccess(); try { return adapter.currentPath(); } catch (error) { throw networkFailure(error); } },
    subscribe(listener: Parameters<NetworkPathAdapter["subscribe"]>[0]) {
      assertAccess(); if (subscriptions >= 8) throw NWFXError.posix(24, "The application network monitor limit was reached.");
      subscriptions++; let disposed = false; let native: { dispose(): void } | undefined;
      const acquiredGeneration = generation;
      const dispose = () => { if (disposed) return; disposed = true; subscriptions--; observers.delete(dispose); native?.dispose(); };
      observers.add(dispose);
      try {
        native = adapter.subscribe(path => {
          if (disposed) return;
          try { assertAccess(acquiredGeneration); } catch { dispose(); return; }
          listener(path);
        });
        if (disposed) native.dispose();
      } catch (error) { dispose(); throw networkFailure(error); }
      return Object.freeze({ dispose });
    },
  });
}
