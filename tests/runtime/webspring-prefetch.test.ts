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
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("prefetch test complete");
});

async function setupPrefetchRuntime(options: Parameters<typeof createTestRuntime>[0] = {}) {
  const runtime = createTestRuntime(options);
  runtimes.push(runtime);
  const prefetch = await import("../../src/Webspring/webspringPrefetch");
  return { runtime, prefetch };
}

describe("Webspring prefetch coordinator", () => {
  it("prefetches a hovered app after a short delay", async () => {
    vi.useFakeTimers();
    const { runtime, prefetch } = await setupPrefetchRuntime();
    const loadModule = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerBundle(createTestBundle({ id: "hover-app", route: "/hover-app", policy: { public: true } }, { loadModule }));

    prefetch.scheduleWebspringAppPrefetch(runtime, "hover-app");
    await vi.advanceTimersByTimeAsync(179);

    expect(loadModule).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    expect(loadModule).toHaveBeenCalledTimes(1);
  });

  it("cancels a hover prefetch before the delay elapses", async () => {
    vi.useFakeTimers();
    const { runtime, prefetch } = await setupPrefetchRuntime();
    const loadModule = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerBundle(createTestBundle({ id: "cancel-app", route: "/cancel-app", policy: { public: true } }, { loadModule }));

    prefetch.scheduleWebspringAppPrefetch(runtime, "cancel-app");
    prefetch.cancelWebspringAppPrefetch(runtime, "cancel-app");
    await vi.advanceTimersByTimeAsync(240);

    expect(loadModule).not.toHaveBeenCalled();
  });

  it("idle-prefetches at most two likely apps and avoids duplicates", async () => {
    vi.useFakeTimers();
    const { runtime, prefetch } = await setupPrefetchRuntime();
    const restoredLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    const firstLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    const secondLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerMany([
      createTestBundle({ id: "first-app", route: "/first-app", webspring: { order: 1 }, policy: { public: true } }, { loadModule: firstLoad }),
      createTestBundle({ id: "second-app", route: "/second-app", webspring: { order: 2 }, policy: { public: true } }, { loadModule: secondLoad }),
      createTestBundle({ id: "restored-app", route: "/restored-app", webspring: { order: 3 }, policy: { public: true } }, { loadModule: restoredLoad })
    ]);
    window.sessionStorage.setItem("syncloudos:last-active-app-route", "/restored-app");

    prefetch.scheduleWebspringIdlePrefetch(runtime);
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(restoredLoad).toHaveBeenCalledTimes(1);
    expect(firstLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).not.toHaveBeenCalled();
  });

  it("skips hover and idle prefetch when save-data is enabled", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true
    });
    const { runtime, prefetch } = await setupPrefetchRuntime();
    const loadModule = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerBundle(createTestBundle({ id: "save-data-app", route: "/save-data-app", policy: { public: true } }, { loadModule }));

    prefetch.scheduleWebspringAppPrefetch(runtime, "save-data-app");
    prefetch.scheduleWebspringIdlePrefetch(runtime);
    await vi.runAllTimersAsync();

    expect(loadModule).not.toHaveBeenCalled();
  });

  it("skips disabled, external, and preload-opt-out apps", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false },
      configurable: true
    });
    const { runtime, prefetch } = await setupPrefetchRuntime();
    const disabledLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    const externalLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    const optOutLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerMany([
      createTestBundle({ id: "disabled-app", route: "/disabled-app", requiredServices: ["windowing"], policy: { public: true } }, { loadModule: disabledLoad }),
      createTestBundle({ id: "external-app", route: "/external-app", type: "external", policy: { public: true } }, { loadModule: externalLoad }),
      createTestBundle({ id: "opt-out-app", route: "/opt-out-app", lifecycle: { preload: false }, policy: { public: true } }, { loadModule: optOutLoad })
    ]);

    runtime.store.mutate((draft) => { draft.appInfo["disabled-app"].isDisabled = true; });
    prefetch.scheduleWebspringAppPrefetch(runtime, "disabled-app");
    prefetch.scheduleWebspringAppPrefetch(runtime, "external-app");
    prefetch.scheduleWebspringAppPrefetch(runtime, "opt-out-app");
    await vi.runAllTimersAsync();

    expect(disabledLoad).not.toHaveBeenCalled();
    expect(externalLoad).not.toHaveBeenCalled();
    expect(optOutLoad).not.toHaveBeenCalled();
  });

  it("requires explicit preload opt-in for hover and idle prefetch", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false },
      configurable: true
    });
    const { runtime, prefetch } = await setupPrefetchRuntime();
    const coldLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerBundle(createTestBundle({
      id: "cold-app",
      route: "/cold-app",
      lifecycle: { preload: false },
      policy: { public: true }
    }, { loadModule: coldLoad }));

    prefetch.scheduleWebspringAppPrefetch(runtime, "cold-app");
    prefetch.scheduleWebspringIdlePrefetch(runtime);
    await vi.runAllTimersAsync();

    expect(coldLoad).not.toHaveBeenCalled();
  });

  it("skips speculative prefetch on mobile and constrained hardware", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "connection", {
      value: { saveData: false },
      configurable: true
    });
    const environment = createTestRuntimeEnvironment();
    const { runtime, prefetch } = await setupPrefetchRuntime({ environment: {
      ...environment,
      layoutViewport: { getSnapshot: () => ({ width: 390, height: 844 }), subscribe: () => () => {} },
    } });
    const mobileLoad = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerBundle(createTestBundle({ id: "mobile-app", route: "/mobile-app", policy: { public: true } }, { loadModule: mobileLoad }));

    prefetch.scheduleWebspringAppPrefetch(runtime, "mobile-app");
    prefetch.scheduleWebspringIdlePrefetch(runtime);
    await vi.runAllTimersAsync();

    expect(mobileLoad).not.toHaveBeenCalled();
  });

  it("does not load apps from pending hover or idle prefetch after runtime disposal", async () => {
    vi.useFakeTimers();
    const { runtime, prefetch } = await setupPrefetchRuntime();
    const loadModule = vi.fn(() => Promise.resolve({ default: () => null }));
    runtime.apps.registerBundle(createTestBundle({ id: "disposed-app", route: "/disposed-app", policy: { public: true } }, { loadModule }));
    prefetch.scheduleWebspringAppPrefetch(runtime, "disposed-app");
    prefetch.scheduleWebspringIdlePrefetch(runtime);

    await runtime.dispose("prefetch owner test");
    await vi.advanceTimersByTimeAsync(500);
    expect(loadModule).not.toHaveBeenCalled();
  });
});
