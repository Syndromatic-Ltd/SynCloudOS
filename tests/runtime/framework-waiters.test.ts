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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettlementRegistry } from "../../src/SynCloudOS/Testing/SettlementRegistry";
import { createSynWareTesting } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTesting";

import type { SynWareTestingWatchdog } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTesting";

afterEach(() => vi.useRealTimers());

function watchdogClock() {
  let now = 0;
  let serial = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const watchdog: SynWareTestingWatchdog = {
    now: () => now,
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(handle) { timers.delete(handle as number); },
  };
  return { watchdog, timers, advance(ms: number) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.callback();
  } };
}

function fixture(watchdog?: SynWareTestingWatchdog) {
  const registry = createSettlementRegistry({
    runtimeId: "runtime:waiters" as never,
    now: () => 0,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const host = {
    settlement: {
      getState: () => registry.getState(),
      subscribe: (listener: () => void) => registry.subscribe(listener),
      settled: (options: { timeoutMs: number; signal?: AbortSignal }) => registry.settled(options),
      begin: (input: Parameters<typeof registry.begin>[0]) => registry.begin(input),
      exclude: (input: Parameters<typeof registry.exclude>[0]) => registry.exclude(input),
    },
    navigation: {
      openRoute: vi.fn(() => ({ result: Promise.resolve({ status: "completed", committed: true }) })),
    },
  };
  return { registry, host, testing: createSynWareTesting(host, { defaultTimeoutMs: 40, watchdog }) };
}

describe("SynWare bounded testing waiters", () => {
  it("cancels active observations and tracked promises on disposal and releases every watchdog timer", async () => {
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    const tracked = f.testing.track("never resolves", new Promise(() => undefined));
    const rejected = expect(tracked).rejects.toThrow(/disposed/);
    const settling = f.testing.settled();
    f.testing.dispose();
    expect(clock.timers.size).toBe(0);
    await rejected;
    await expect(settling).resolves.toMatchObject({ status: "cancelled", reason: "testing-driver-disposed" });
    expect(f.registry.getState().pending).toEqual([]);
    f.registry.dispose();
  });

  it("releases a waitForPending subscription on disposal", async () => {
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    const waiting = f.testing.waitForPending();
    const rejected = expect(waiting).rejects.toThrow(/disposed/);
    f.testing.dispose();
    expect(clock.timers.size).toBe(0);
    await rejected;
    f.registry.dispose();
  });

  it("bounds navigation itself and rejects denied results instead of treating them as successful visits", async () => {
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    f.host.navigation.openRoute.mockReturnValueOnce({ result: new Promise(() => undefined) });
    const visit = f.testing.visit("/stuck", { timeoutMs: 10 });
    const rejected = expect(visit).rejects.toThrow(/timed out.*stuck/i);
    clock.advance(10);
    await rejected;
    expect(clock.timers.size).toBe(0);
    f.host.navigation.openRoute.mockReturnValueOnce({ result: Promise.resolve({ status: "denied", reason: "policy" }) } as never);
    await expect(f.testing.visit("/private")).rejects.toMatchObject({ cause: { status: "denied", reason: "policy" } });
    f.testing.dispose();
    f.registry.dispose();
  });

  it("does not perform pre-aborted or invalid actions", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort(new Error("already cancelled"));
    await expect(f.testing.visit("/skip", { signal: controller.signal })).rejects.toThrow("already cancelled");
    expect(f.host.navigation.openRoute).not.toHaveBeenCalled();
    const click = vi.fn();
    await expect(f.testing.click({ click }, { timeoutMs: -1 })).rejects.toThrow(/deadline/);
    expect(click).not.toHaveBeenCalled();
    f.testing.dispose();
    f.registry.dispose();
  });

  it("does not acquire a waiter after a reentrant driver disposal during registration", () => {
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    const remove = f.registry.subscribe(() => { if (f.registry.getState().pending.length) f.testing.dispose(); });
    expect(() => f.testing.waiter("reentrant")).toThrow(/disposed/);
    expect(clock.timers.size).toBe(0);
    expect(f.registry.getState().pending).toEqual([]);
    remove(); f.registry.dispose();
  });

  it("expires independently with application time frozen and cleans successful and aborted watchdogs", async () => {
    vi.useFakeTimers();
    const applicationTime = Date.now();
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    f.testing.waiter("leaked", { timeoutMs: 10 });
    clock.advance(10);
    expect(Date.now()).toBe(applicationTime);
    expect(f.registry.getState().recent).toEqual([expect.objectContaining({ status: "failed", label: "leaked" })]);
    await expect(f.testing.settled()).resolves.toMatchObject({ status: "settled" });
    expect(clock.timers.size).toBe(0);
    const token = f.testing.waiter("busy");
    const controller = new AbortController();
    const waiting = f.testing.settled({ signal: controller.signal });
    controller.abort();
    await waiting;
    token.end();
    expect(clock.timers.size).toBe(0);
    f.testing.dispose();
    f.registry.dispose();
  });

  it("balances waiter tokens and makes repeated end idempotent", async () => {
    const f = fixture();
    const waiter = f.testing.waiter("load catalogue");
    expect(f.testing.getSettledState().pending).toEqual([
      expect.objectContaining({ owner: "app-waiter", label: "load catalogue" }),
    ]);
    expect(waiter.end()).toBe(true);
    expect(waiter.end()).toBe(false);
    await expect(f.testing.settled()).resolves.toMatchObject({ status: "settled", pending: [] });
    expect(f.testing.getSettledState().recent.at(-1)).toMatchObject({ status: "completed" });
    f.testing.dispose();
    f.registry.dispose();
  });

  it("expires a forgotten waiter on the independent watchdog and reports the failure", async () => {
    vi.useFakeTimers();
    const applicationTime = Date.now();
    const f = fixture();
    f.testing.waiter("forgotten request", { timeoutMs: 10 });
    await expect(f.testing.settled()).resolves.toMatchObject({ failures: [expect.objectContaining({ label: "forgotten request", status: "failed" })] });
    expect(Date.now()).toBe(applicationTime);
    expect(f.testing.getSettledState()).toMatchObject({
      status: "settled",
      recent: expect.arrayContaining([
        expect.objectContaining({ owner: "app-waiter", label: "forgotten request", status: "failed", reason: expect.stringMatching(/10ms/) }),
      ]),
    });
    f.testing.dispose();
    f.registry.dispose();
  });

  it("times out and detaches a nonabortable tracked promise without accepting its late result", async () => {
    const f = fixture();
    let resolve!: (value: string) => void;
    const source = new Promise<string>(done => { resolve = done; });
    const tracked = f.testing.track("nonabortable", source, { timeoutMs: 10 });
    await expect(tracked).rejects.toThrow(/timed out/i);
    resolve("late");
    await Promise.resolve();
    expect(f.testing.getSettledState().recent.at(-1)).toMatchObject({ status: "failed", label: "nonabortable" });
    f.testing.dispose();
    f.registry.dispose();
  });

  it("aborts settlement without advancing application time and releases watchdog state", async () => {
    const f = fixture();
    const leaked = f.testing.waiter("pending");
    const controller = new AbortController();
    const settling = f.testing.settled({ timeoutMs: 500, signal: controller.signal });
    controller.abort(new DOMException("test abort", "AbortError"));
    await expect(settling).resolves.toMatchObject({
      status: "cancelled",
      reason: "test abort",
      pending: [expect.objectContaining({ label: "pending" })],
    });
    leaked.cancel();
    f.testing.dispose();
    f.registry.dispose();
  });

  it("preserves navigation errors and settles successful visits", async () => {
    const f = fixture();
    await expect(f.testing.visit("/music/artist/air")).resolves.toMatchObject({
      navigation: { status: "completed", committed: true },
      settlement: { status: "settled" },
    });
    expect(f.host.navigation.openRoute).toHaveBeenCalledWith(
      "/music/artist/air",
      expect.objectContaining({ signal: expect.anything() }),
    );

    const original = new Error("navigation exploded");
    f.host.navigation.openRoute.mockReturnValueOnce({ result: Promise.reject(original) } as never);
    await expect(f.testing.visit("/broken")).rejects.toBe(original);
    f.testing.dispose();
    f.registry.dispose();
  });

  it.each([
    { outcome: "route-error", committed: true, reason: "loader failed" },
    { outcome: "blocked", committed: false, reason: "guard" },
    { outcome: "not-found", committed: false },
    { status: "completed", committed: true, value: { kind: "notFound" } },
    { status: "completed", committed: true, postCommit: "failed", issues: [{ message: "render missing" }] },
  ])("preserves the unsuccessful navigation result as the error cause: %j", async result => {
    const f = fixture();
    f.host.navigation.openRoute.mockReturnValueOnce({ result: Promise.resolve(result) } as never);
    await expect(f.testing.visit("/error")).rejects.toMatchObject({ cause: result });
    f.testing.dispose(); f.registry.dispose();
  });

  it("uses one visit deadline across navigation and subsequent framework work", async () => {
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    let release!: (value: { status: string; committed: boolean }) => void;
    f.host.navigation.openRoute.mockReturnValueOnce({ result: new Promise(resolve => { release = resolve; }) });
    const waiter = f.testing.waiter("render", { timeoutMs: 100 });
    const visiting = f.testing.visit("/slow", { timeoutMs: 30 });
    clock.advance(20);
    release({ status: "completed", committed: true });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    clock.advance(10);
    await expect(visiting).resolves.toMatchObject({ settlement: { status: "timed-out", pending: [expect.objectContaining({ label: "render" })] } });
    waiter.end(); f.testing.dispose(); f.registry.dispose();
    expect(clock.timers.size).toBe(0);
  });

  it("filters pending owners and kinds and never lets one driver's cleanup cancel another's token", async () => {
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    const other = createSynWareTesting(f.host, { watchdog: clock.watchdog });
    const otherToken = other.waiter("other driver");
    let matched = false;
    const pending = f.testing.waitForPending({ owner: "document-adapter", kind: "cleanup" }).then(state => { matched = true; return state; });
    await Promise.resolve();
    expect(matched).toBe(false);
    const cleanup = f.registry.begin({ owner: "document-adapter", kind: "cleanup", label: "finite cleanup" });
    await pending;
    cleanup.complete();
    f.testing.dispose();
    expect(f.registry.getState().pending).toEqual([expect.objectContaining({ id: otherToken.id })]);
    otherToken.end(); other.dispose(); f.registry.dispose();
    expect(clock.timers.size).toBe(0);
  });

  it("detaches tracked work on caller abort and host disposal", async () => {
    const clock = watchdogClock();
    const f = fixture(clock.watchdog);
    const signal = new AbortController();
    let late!: (value: string) => void;
    const source = new Promise<string>(resolve => { late = resolve; });
    const tracked = f.testing.track("abortable observation", source, { signal: signal.signal });
    const rejected = expect(tracked).rejects.toThrow("caller abort");
    signal.abort(new Error("caller abort"));
    await rejected;
    late("late"); await Promise.resolve();
    expect(f.registry.getState().recent.at(-1)).toMatchObject({ status: "cancelled" });
    const waiting = f.testing.waitForPending();
    const hostRejected = expect(waiting).rejects.toThrow("runtime-disposed");
    f.registry.dispose();
    await hostRejected;
    expect(clock.timers.size).toBe(0);
    f.testing.dispose();
  });
});
