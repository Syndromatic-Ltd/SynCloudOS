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

import type { SettlementRegistryOptions, SettlementResult, SettlementState } from "./settlementTypes";

type Source = { getState(): SettlementState; subscribe(listener: () => void): () => void };
type Watchdog = Pick<SettlementRegistryOptions, "setTimeout" | "clearTimeout">;

/** One candidate owns its revision. Notifications must never rewrite a queued checkpoint. */
export function waitForSettlement(source: Source, watchdog: Watchdog, options: {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}): Promise<SettlementResult> {
  const { timeoutMs, signal } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) return Promise.reject(new RangeError("Settlement timeout must be nonnegative and finite."));
  return new Promise(resolve => {
    let done = false;
    let queued = false;
    let timer: unknown;
    let hasTimer = false;
    let unsubscribe = () => {};
    const finish = (status: SettlementResult["status"], reason?: string) => {
      if (done) return;
      const state = source.getState();
      done = true;
      if (hasTimer) watchdog.clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", onAbort);
      resolve(Object.freeze({ status, pending: state.pending, excluded: state.excluded,
        ...(state.recent.some(item => item.status === "failed") ? { failures: Object.freeze(state.recent.filter(item => item.status === "failed")) } : {}),
        ...(reason === undefined ? {} : { reason }),
      }));
    };
    const onAbort = () => finish("cancelled", signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason ?? "cancelled"));
    const check = () => {
      if (done) return;
      const state = source.getState();
      if (state.disposed) { finish("cancelled", "runtime-disposed"); return; }
      if (state.pending.length || queued) return;
      queued = true;
      const revision = state.revision;
      queueMicrotask(() => queueMicrotask(() => {
        queued = false;
        if (done) return;
        const next = source.getState();
        if (next.disposed) { finish("cancelled", "runtime-disposed"); return; }
        if (next.pending.length === 0 && next.revision === revision) finish("settled");
        else check();
      }));
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener("abort", onAbort, { once: true });
    const remove = source.subscribe(check);
    unsubscribe = remove;
    // A source is permitted to notify synchronously while subscribing.
    if (done) { remove(); return; }
    timer = watchdog.setTimeout(() => finish("timed-out"), timeoutMs);
    hasTimer = true;
    if (done) watchdog.clearTimeout(timer);
    else check();
  });
}
