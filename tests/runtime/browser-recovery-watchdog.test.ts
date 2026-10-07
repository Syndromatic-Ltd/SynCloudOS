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

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserRecoveryWatchdog } from "../../src/SynCloudOS/PlatformAdapters/BrowserRecoveryWatchdog";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

class WorkerDouble {
  sent: any[] = [];
  listeners = new Map<string, Set<(event: any) => void>>();
  terminated = false;
  postMessage(message: unknown) { this.sent.push(message); }
  addEventListener(type: string, listener: (event: any) => void) { const group = this.listeners.get(type) ?? new Set(); group.add(listener); this.listeners.set(type, group); }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
  terminate() { this.terminated = true; }
  emit(data: unknown) { for (const listener of this.listeners.get("message") ?? []) listener({ data }); }
}
const cleanups: Array<() => void | Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks(); });
function fixture() {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ environment });
  const worker = new WorkerDouble();
  const watchdog = createBrowserRecoveryWatchdog(runtime, { getSiteName: () => "Example Site", createWorker: () => worker });
  cleanups.push(() => runtime.dispose({ reason: "watchdog test", inFlight: "cancel" }), () => watchdog.dispose());
  return { runtime, worker, watchdog, environment };
}

describe("browser recovery watchdog ownership", () => {
  it("preserves queued startup stall evidence when readiness arrives after a main-thread block", () => {
    const { runtime, worker, watchdog } = fixture();
    watchdog.install();
    const epoch = worker.sent.at(-1).epoch;
    worker.emit({ kind: "ready" });
    worker.emit({ kind: "ready" });
    worker.emit({ kind: "ping", epoch, id: 1 });
    worker.emit({ kind: "stalled", epoch, id: 1, durationMs: 11000 });
    expect(runtime.errors.getLatest()).toMatchObject({ code: "SITE_NOT_RESPONDING", context: { durationMs: 11000 } });
  });

  it("reports a shared-thread stall on the site rather than blaming the selected app", () => {
    const { runtime, worker, watchdog } = fixture();
    runtime.store.mutate(draft => { draft.application.activeAppId = "notes"; });
    watchdog.install();
    worker.emit({ kind: "ready" });
    const epoch = worker.sent.at(-1).epoch;
    worker.emit({ kind: "ping", epoch, id: 1 });
    expect(worker.sent.at(-1)).toMatchObject({ kind: "pong", epoch, id: 1 });
    worker.emit({ kind: "stalled", epoch, id: 1, durationMs: 10000 });
    expect(runtime.errors.getLatest()).toMatchObject({ code: "SITE_NOT_RESPONDING", title: "Example Site has stopped responding.", context: { scope: "site", reason: "main-thread-stall", activeAppId: "notes" } });
    expect(runtime.errors.getLatest()?.appId).toBeUndefined();
  });

  it("ignores hidden/stale messages and releases its worker and listeners", () => {
    const { runtime, worker, watchdog } = fixture();
    watchdog.install();
    worker.emit({ kind: "ready" });
    const epoch = worker.sent.at(-1).epoch;
    vi.mocked(Object.getOwnPropertyDescriptor(document, "visibilityState")!.get!).mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    worker.emit({ kind: "stalled", epoch, id: 1, durationMs: 10000 });
    expect(runtime.errors.getHistory()).toEqual([]);
    watchdog.dispose();
    worker.emit({ kind: "stalled", epoch: worker.sent.at(-1).epoch, id: 2, durationMs: 10000 });
    expect(runtime.errors.getHistory()).toEqual([]);
    expect(worker.terminated).toBe(true);
  });

  it("offers an actual authentication refresh for a remote deadline and clears the alert on success", async () => {
    const { runtime, worker } = fixture();
    let snapshot: any = { status: "error", error: "Deadline exceeded", errorCode: "REQUEST_TIMEOUT" };
    let listener = () => {};
    const refresh = vi.fn(async () => { snapshot = { status: "anonymous", error: null }; listener(); return snapshot; });
    const watchdog = createBrowserRecoveryWatchdog(runtime, { getSiteName: () => "Example Site", createWorker: () => worker,
      authentication: { getSnapshot: () => snapshot, subscribe: (fn: () => void) => { listener = fn; return () => { listener = () => {}; }; }, refresh } });
    cleanups.push(() => watchdog.dispose());
    watchdog.install();
    expect(runtime.errors.getLatest()).toMatchObject({ code: "SITE_NOT_RESPONDING", context: { reason: "request-timeout" } });
    await runtime.errors.getLatest()?.retry?.();
    expect(refresh).toHaveBeenCalledOnce();
    expect(runtime.errors.getHistory()).toEqual([]);
  });

  it("does not convert protocol errors into connection failures", () => {
    const { runtime, worker } = fixture();
    const watchdog = createBrowserRecoveryWatchdog(runtime, { getSiteName: () => "Example Site", createWorker: () => worker,
      authentication: { getSnapshot: () => ({ status: "error", error: "Unauthorised" } as any), subscribe: () => () => {}, refresh: vi.fn() } });
    cleanups.push(() => watchdog.dispose());
    watchdog.install();
    expect(runtime.errors.getHistory()).toEqual([]);
  });

  it("reports one offline episode and leaves passive online revalidation to the authentication owner", () => {
    const { runtime, worker, environment } = fixture();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const unrelated = runtime.errors.capture({ code: "UNKNOWN_RUNTIME_ERROR", title: "Other failure", message: "Unrelated" });
    const refresh = vi.fn(async () => ({ status: "anonymous", error: null } as any));
    const watchdog = createBrowserRecoveryWatchdog(runtime, { getSiteName: () => "Example Site", createWorker: () => worker,
      authentication: { getSnapshot: () => ({ status: "anonymous", error: null } as any), subscribe: () => () => {}, refresh } });
    cleanups.push(() => watchdog.dispose());
    watchdog.install();
    const listener = (type: "offline" | "online") => vi.mocked(environment.addWindowListener).mock.calls.find(call => call[0] === type)![1] as () => void;
    online.mockReturnValue(false);
    listener("offline")(); listener("offline")();
    expect(runtime.errors.getHistory().filter(error => error.code === "CONNECTION_ERROR")).toHaveLength(1);
    expect(runtime.errors.getLatest()?.context?.reason).toBe("offline");
    online.mockReturnValue(true);
    listener("online")();
    expect(refresh).not.toHaveBeenCalled();
    expect(runtime.errors.getHistory()).toEqual([unrelated]);
  });

  it("falls back after worker failure and releases the long-task observation", () => {
    const { runtime, worker, environment } = fixture();
    let report = (_duration: number) => {};
    const release = vi.fn();
    Object.assign(environment, { observeLongTasks: (listener: typeof report) => { report = listener; return release; } });
    const watchdog = createBrowserRecoveryWatchdog(runtime, { getSiteName: () => "Example Site", createWorker: () => worker });
    cleanups.push(() => watchdog.dispose());
    watchdog.install();
    for (const listener of worker.listeners.get("error") ?? []) listener(new Event("error", { cancelable: true }));
    expect(watchdog.getStatus().responsiveness).toBe("long-task");
    expect(worker.terminated).toBe(true);
    report(5000);
    expect(runtime.errors.getHistory()).toEqual([]);
    report(10000);
    expect(runtime.errors.getLatest()?.code).toBe("SITE_NOT_RESPONDING");
    watchdog.dispose();
    expect(release).toHaveBeenCalledOnce();
    runtime.errors.clear(); report(10000);
    expect(runtime.errors.getHistory()).toEqual([]);
  });
});
