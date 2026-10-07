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

import { waitForSettlement, browserTestingClock, type SettlementResult, type SettlementState } from "../../Testing/appSdkTestingPort";
import type { SynWareTestNavigation, SynWareTestSettlement } from "./testHostTypes";


export interface SynWareTestingWatchdog {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface SynWareTestingHost {
  readonly settlement: SynWareTestSettlement;
  readonly navigation: SynWareTestNavigation;
}
export interface SynWareTestingWaiter {
  readonly id: string;
  end(): boolean;
  cancel(reason?: string): boolean;
  fail(error: unknown): boolean;
}
type WaitOptions = { readonly timeoutMs?: number; readonly signal?: AbortSignal };
export interface SynWareTestingDriver {
  getSettledState(): SettlementState;
  waiter(label: string, options?: { readonly timeoutMs?: number }): SynWareTestingWaiter;
  track<T>(label: string, promise: PromiseLike<T>, options?: WaitOptions): Promise<T>;
  settled(options?: WaitOptions): Promise<SettlementResult>;
  waitForPending(options?: WaitOptions & { readonly owner?: string; readonly kind?: string }): Promise<SettlementState>;
  visit(pathname: string, options?: WaitOptions): Promise<{ readonly navigation: unknown; readonly settlement: SettlementResult }>;
  click(target: { click(): void }, options?: WaitOptions): Promise<SettlementResult>;
  dispose(): void;
}
export interface CreateSynWareTestingOptions {
  readonly defaultTimeoutMs?: number;
  /** Inject a separate progressing scheduler when module loading occurs inside fake timers. */
  readonly watchdog?: SynWareTestingWatchdog;
}
function defaultWatchdog(): SynWareTestingWatchdog {
  if (browserTestingClock.timerWasIntercepted) throw new Error("Testing watchdog was captured inside fake timers; inject an independent watchdog.");
  return browserTestingClock;
}
function reasonText(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason ?? "cancelled"); }
function abortError(signal: AbortSignal): unknown { return signal.reason ?? new DOMException("Testing wait aborted.", "AbortError"); }
function navigationFailure(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return;
  if ("outcome" in value && value.outcome !== "settled") return String(value.outcome);
  if ("status" in value && value.status !== "completed" && value.status !== "committed") return String(value.status);
  if ("postCommit" in value && value.postCommit !== "completed") return "post-commit " + String(value.postCommit);
  if ("kind" in value && value.kind === "notFound") return "not-found";
  if ("value" in value && value.value !== value) return navigationFailure(value.value);
}

/** A never-settling foreign promise retains only this empty cell after detachment. */
function observePromise<T>(promise: PromiseLike<T>, fulfilled: (value: T) => void, rejected: (error: unknown) => void): () => void {
  let callbacks: { fulfilled(value: T): void; rejected(error: unknown): void } | undefined = { fulfilled, rejected };
  void Promise.resolve(promise).then(value => callbacks?.fulfilled(value), error => callbacks?.rejected(error));
  return () => { callbacks = undefined; };
}

export function createSynWareTesting(host: SynWareTestingHost, options: CreateSynWareTestingOptions = {}): SynWareTestingDriver {
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 5_000;
  const bounded = (value?: number) => {
    const timeoutMs = value ?? defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("Testing deadline must be positive and finite.");
    return timeoutMs;
  };
  bounded();
  const watchdog = options.watchdog ?? defaultWatchdog();
  if (!Number.isFinite(watchdog.now())) throw new Error("Testing watchdog must provide finite monotonic time.");
  const lifetime = new AbortController();
  const owned = new Set<SynWareTestingWaiter>();
  let removeHost = () => {};
  const dispose = (reason = "testing-driver-disposed") => {
    if (lifetime.signal.aborted) return;
    lifetime.abort(new Error(reason));
    for (const waiter of [...owned]) waiter.cancel(reason);
    removeHost();
  };
  const observeHost = () => { if (host.settlement.getState().disposed) dispose("runtime-disposed"); };
  removeHost = host.settlement.subscribe(observeHost);
  observeHost();
  if (lifetime.signal.aborted) removeHost();
  const assertLive = () => { if (lifetime.signal.aborted) throw abortError(lifetime.signal); };
  const signalFor = (signal?: AbortSignal) => signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
  const actionSignal = (signal?: AbortSignal) => {
    assertLive();
    const combined = signalFor(signal);
    if (combined.aborted) throw abortError(combined);
    return combined;
  };

  const makeWaiter = (label: string, timeoutMs: number, onTerminal?: (status: "completed" | "cancelled" | "failed", error?: unknown) => void): SynWareTestingWaiter => {
    assertLive();
    if (!label.trim()) throw new TypeError("Testing waiter label is required.");
    const handle = host.settlement.begin({ owner: "app-waiter", kind: "waiter", label });
    if (lifetime.signal.aborted) {
      handle.cancel(reasonText(lifetime.signal.reason));
      throw abortError(lifetime.signal);
    }
    let live = true;
    let timer: unknown;
    let hasTimer = false;
    const finish = (status: "completed" | "cancelled" | "failed", error?: unknown) => {
      if (!live) return false;
      live = false;
      if (hasTimer) watchdog.clearTimeout(timer);
      owned.delete(waiter);
      const changed = status === "completed" ? handle.complete()
        : status === "cancelled" ? handle.cancel(reasonText(error)) : handle.fail(error);
      onTerminal?.(status, error);
      return changed;
    };
    const waiter: SynWareTestingWaiter = Object.freeze({
      id: handle.id, end: () => finish("completed"),
      cancel: (reason = "cancelled") => finish("cancelled", new Error(reason)),
      fail: (error: unknown) => finish("failed", error),
    });
    owned.add(waiter);
    try {
      timer = watchdog.setTimeout(() => finish("failed", new Error("Waiter timed out after " + timeoutMs + "ms: " + label)), timeoutMs);
      hasTimer = true;
      if (!live) watchdog.clearTimeout(timer);
    } catch (error) { finish("failed", error); throw error; }
    return waiter;
  };
  const stable = (timeoutMs: number, signal?: AbortSignal) =>
    waitForSettlement(host.settlement, watchdog, { timeoutMs, signal: signalFor(signal) });

  const awaitNavigation = (source: PromiseLike<unknown>, pathname: string, timeoutMs: number, signal: AbortSignal) =>
    new Promise<unknown>((resolve, reject) => {
      let done = false;
      let timer: unknown;
      let detach = () => {};
      const finish = (value: unknown, failed: boolean) => {
        if (done) return;
        done = true;
        watchdog.clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        detach();
        if (failed) reject(value); else resolve(value);
      };
      const onAbort = () => finish(abortError(signal), true);
      timer = watchdog.setTimeout(() => finish(new Error("Navigation timed out after " + timeoutMs + "ms: " + pathname, {
        cause: host.settlement.getState(),
      }), true), timeoutMs);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) { onAbort(); return; }
      detach = observePromise(source, value => finish(value, false), error => finish(error, true));
    });

  const driver: SynWareTestingDriver = {
    getSettledState: () => host.settlement.getState(),
    waiter(label, waiterOptions = {}) { return makeWaiter(label, bounded(waiterOptions.timeoutMs)); },
    track<T>(label: string, promise: PromiseLike<T>, trackOptions: WaitOptions = {}) {
      const timeoutMs = bounded(trackOptions.timeoutMs);
      const signal = actionSignal(trackOptions.signal);
      return new Promise<T>((resolve, reject) => {
        let detach = () => {};
        let onAbort = () => {};
        const cleanup = () => { detach(); signal.removeEventListener("abort", onAbort); };
        const waiter = makeWaiter(label, timeoutMs, (status, error) => {
          cleanup();
          if (status !== "completed") reject(error);
        });
        onAbort = () => waiter.cancel(reasonText(abortError(signal)));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) { onAbort(); return; }
        detach = observePromise(promise, value => { waiter.end(); resolve(value); }, error => waiter.fail(error));
      });
    },
    settled(settledOptions = {}) { return stable(bounded(settledOptions.timeoutMs), settledOptions.signal); },
    waitForPending(pendingOptions = {}) {
      const timeoutMs = bounded(pendingOptions.timeoutMs);
      const signal = actionSignal(pendingOptions.signal);
      return new Promise<SettlementState>((resolve, reject) => {
        let done = false;
        let timer: unknown;
        let unsubscribe = () => {};
        const finish = (state?: SettlementState, error?: unknown) => {
          if (done) return;
          done = true;
          watchdog.clearTimeout(timer);
          unsubscribe();
          signal.removeEventListener("abort", onAbort);
          if (state) resolve(state); else reject(error);
        };
        const onAbort = () => finish(undefined, abortError(signal));
        const check = () => {
          if (done) return;
          const state = host.settlement.getState();
          if (state.pending.some(item => (!pendingOptions.owner || item.owner === pendingOptions.owner) && (!pendingOptions.kind || item.kind === pendingOptions.kind))) finish(state);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        timer = watchdog.setTimeout(() => finish(undefined, new Error("No matching pending framework work appeared within " + timeoutMs + "ms.", { cause: host.settlement.getState() })), timeoutMs);
        unsubscribe = host.settlement.subscribe(check);
        if (done) unsubscribe(); else check();
      });
    },
    async visit(pathname, visitOptions = {}) {
      const timeoutMs = bounded(visitOptions.timeoutMs);
      const signal = actionSignal(visitOptions.signal);
      const startedAt = watchdog.now();
      const opened = host.navigation.openRoute(pathname, { signal });
      const source = opened && typeof opened === "object" && "result" in opened ? opened.result : opened;
      const navigation = await awaitNavigation(Promise.resolve(source), pathname, timeoutMs, signal);
      const failure = navigationFailure(navigation);
      if (failure) throw new Error("Navigation did not complete: " + pathname + " (" + failure + ")", { cause: navigation });
      const remaining = Math.max(0, timeoutMs - Math.max(0, watchdog.now() - startedAt));
      return Object.freeze({ navigation, settlement: await stable(remaining, signal) });
    },
    async click(target, clickOptions = {}) {
      const timeoutMs = bounded(clickOptions.timeoutMs);
      const signal = actionSignal(clickOptions.signal);
      target.click();
      return stable(timeoutMs, signal);
    },
    dispose: () => dispose(),
  };
  return Object.freeze(driver);
}
