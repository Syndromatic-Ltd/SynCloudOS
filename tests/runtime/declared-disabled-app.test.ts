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
import { AppInfo } from "../../src/SynCloudOS/AppInfo/AppInfo";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { createTestBundle, createTestManifest, createTestRuntime, unlockRuntime } from "./helpers";

const reason = "This application is being prepared.";
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
function createRuntime() {
  const runtime = createTestRuntime();
  runtimes.push(runtime);
  return runtime;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("declared-disabled-app-test");
});

describe("declared disabled applications", () => {
  it("projects the author declaration into AppInfo without hiding the icon", () => {
    const definition = createSynWare({
      manifest: {
        schemaVersion: 1, id: "fixture.preparing", title: "Preparing", version: "1.0.0",
        runtime: { disabled: true, disabledReason: reason },
        lifecycle: { preload: true },
        webspring: { visible: true },
      },
      root: () => null,
    });
    const bundle = createSynWareBundle(definition);
    expect(bundle.manifest).toMatchObject({ disabled: true, disabledReason: reason, lifecycle: { preload: true } });
    const runtime = createRuntime();
    const app = runtime.apps.registerBundle(bundle)!;
    expect(app).toMatchObject({ isDisabled: true, disabled: true, disabledReason: reason, hasAccessToRequiredServices: true });
    expect(AppInfo.explain(app)).toMatchObject({ status: "disabled", reason });
    expect(runtime.apps.getDisplayApps().map(app => app.id)).toContain(app.id);
    expect(runtime.store.getSnapshot().lifecycle[app.id]).toBe("disabled");
  });

  it("keeps declaration and unsafe-route failures disabled when required services recover", () => {
    const runtime = createRuntime();
    runtime.services.registerService({ id: "fixture.service", displayName: "Fixture", description: "Fixture service", availability: "unavailable" });
    runtime.apps.registerMany([
      { ...createTestManifest({ id: "declared", requiredServices: ["fixture.service"] }), disabled: true, disabledReason: reason },
      createTestManifest({ id: "unsafe", route: "javascript:alert(1)", type: "external", requiredServices: ["fixture.service"] }),
      createTestManifest({ id: "recoverable", requiredServices: ["fixture.service"] }),
    ]);
    expect(runtime.apps.getApp("declared")?.hasAccessToRequiredServices).toBe(false);
    runtime.services.startService("fixture.service");
    for (const id of ["declared", "unsafe"]) {
      expect(runtime.apps.getApp(id)).toMatchObject({ hasAccessToRequiredServices: true, isDisabled: true });
      expect(runtime.store.getSnapshot().lifecycle[id]).toBe("disabled");
      expect(runtime.store.getSnapshot().managers[id].disabled).toBe(true);
    }
    expect(runtime.apps.getApp("declared")?.disabledReason).toBe(reason);
    expect(AppInfo.explain(runtime.apps.getApp("declared")!)).toMatchObject({ status: "disabled", reason });
    expect(runtime.apps.getApp("recoverable")?.isDisabled).toBe(false);
    expect(runtime.store.getSnapshot().lifecycle.recoverable).toBe("registered");
  });

  it.each(["route", "launch", "preload", "hover"] as const)("rejects a direct %s request before importing a disabled app", async (entry) => {
    const runtime = createRuntime();
    const loadModule = vi.fn(() => Promise.resolve({ default: () => null }));
    const manifest = { ...createTestManifest({ id: "preparing", policy: { public: true } }), disabled: true, disabledReason: reason };
    runtime.apps.registerBundle(createTestBundle(manifest, { loadModule }));
    unlockRuntime(runtime);
    if (entry === "route") {
      await expect(runtime.routes.openRoute("/preparing").result).resolves.toMatchObject({ status: "failed", committed: false });
    } else if (entry === "launch") {
      await expect(runtime.lifecycle.launch("preparing").result).resolves.toMatchObject({ status: "failed", committed: false });
    } else if (entry === "preload") {
      await expect(runtime.launchServices.preloadApp("preparing")).resolves.toBeNull();
    } else {
      vi.useFakeTimers();
      const prefetch = await import("../../src/Webspring/webspringPrefetch");
      prefetch.scheduleWebspringAppPrefetch(runtime, "preparing");
      prefetch.scheduleWebspringIdlePrefetch(runtime);
      await vi.runAllTimersAsync();
    }
    expect(loadModule).not.toHaveBeenCalled();
    expect(runtime.apps.getApp("preparing")?.isDisabled).toBe(true);
  });

  it("keeps preload false enabled and permits an explicit launch", async () => {
    const definition = createSynWare({
      manifest: {
        schemaVersion: 1, id: "fixture.cold", title: "Cold", version: "1.0.0",
        permissions: ["app.open.public"], lifecycle: { preload: false },
      },
      root: () => null,
    });
    const loadModule = vi.fn(() => Promise.resolve({ default: definition }));
    const runtime = createRuntime();
    runtime.apps.registerBundle(createSynWareBundle(definition, { loadModule }));
    unlockRuntime(runtime);
    expect(runtime.apps.getApp(definition.manifest.id)).toMatchObject({ isDisabled: false, lifecycle: { preload: false } });
    vi.useFakeTimers();
    const prefetch = await import("../../src/Webspring/webspringPrefetch");
    prefetch.scheduleWebspringAppPrefetch(runtime, definition.manifest.id);
    prefetch.scheduleWebspringIdlePrefetch(runtime);
    await vi.runAllTimersAsync();
    expect(loadModule).not.toHaveBeenCalled();
    vi.useRealTimers();
    await expect(runtime.lifecycle.launch(definition.manifest.id).result).resolves.toMatchObject({ status: "completed" });
    expect(loadModule).toHaveBeenCalledTimes(1);
  });
});
