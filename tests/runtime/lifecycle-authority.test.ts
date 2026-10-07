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

import { describe, expect, it, vi } from "vitest";
import { createTestRuntime, createTestBundle, createTestManifest, createRuntimeHarness } from "./helpers";

function authoriseRuntime(runtime: ReturnType<typeof createTestRuntime>) {
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
}

function eventAppId(payload: unknown) {
  return payload && typeof payload === "object" && "appId" in payload
    ? (payload as { appId?: string }).appId
    : undefined;
}

describe("runtime lifecycle authority", () => {
  it("removes application and window undo owners on app unregistration without replacing a live app owner", async () => {
    const runtime = createTestRuntime();
    const { AppRegistry, AppManagerController, WindowManager } = createRuntimeHarness(runtime);
    AppRegistry.register(createTestManifest({ id: "owned-app", presentation: "windowedView" }));
    const owner = { kind: "application" as const, id: "owned-app" };
    const original = runtime.undo.get(owner);
    expect(original).not.toBeNull();
    AppManagerController.createManagerForApp(runtime.apps.getApp("owned-app"));
    expect(runtime.undo.get(owner)).toBe(original);
    const window = await WindowManager.openApplicationWindow("owned-app");
    expect(window).not.toBeNull();
    expect(runtime.undo.get({ kind: "window", id: window!.id })).not.toBeNull();

    await AppRegistry.unregister("owned-app");

    expect(runtime.undo.get(owner)).toBeNull();
    expect(runtime.undo.get({ kind: "window", id: window!.id })).toBeNull();
  });
  it("delegates AppManager.transition to the canonical Lifecycle writer", async () => {
    const { AppRegistry, AppManagerController, Lifecycle, RuntimeController } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestManifest({ id: "delegated-lifecycle" }));
    const manager = AppManagerController.getManagerForApp("delegated-lifecycle");
    const transition = vi.spyOn(Lifecycle, "transition");

    expect(manager?.transition("loading", "prepare")).toBe(true);

    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith("delegated-lifecycle", "loading", {
      reason: "prepare",
      source: "SynCloudOS.AppManager.transition"
    });
    expect(RuntimeController.getSnapshot().lifecycle["delegated-lifecycle"]).toBe("loading");
  });

  it("emits a single app lifecycle event per delegated transition", async () => {
    const { AppRegistry, AppManagerController, RuntimeController } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestManifest({ id: "single-event-app" }));
    const manager = AppManagerController.getManagerForApp("single-event-app");

    expect(manager?.transition("loading", "prepare")).toBe(true);

    const snapshot = RuntimeController.getSnapshot();
    const lifecycleEvents = snapshot.lifecycleEvents.filter((event) => event.appId === "single-event-app");
    const runtimeEvents = RuntimeController.getEventHistory().filter(
      (event) => event.type === "app.lifecycle.transition" && eventAppId(event.payload) === "single-event-app"
    );

    expect(lifecycleEvents).toHaveLength(1);
    expect(runtimeEvents).toHaveLength(1);
    expect(runtimeEvents[0]?.payload).toMatchObject({
      appId: "single-event-app",
      from: "registered",
      to: "loading",
      reason: "prepare",
      source: "SynCloudOS.AppManager.transition"
    });
  });

  it("rejects invalid transitions without writing lifecycle state or compatibility events", async () => {
    const { AppRegistry, AppManagerController, RuntimeController } = createRuntimeHarness(createTestRuntime());
    AppRegistry.register(createTestManifest({ id: "invalid-transition-app" }));
    const manager = AppManagerController.getManagerForApp("invalid-transition-app");

    expect(manager?.transition("active", "direct jump")).toBe(false);

    const snapshot = RuntimeController.getSnapshot();
    expect(snapshot.lifecycle["invalid-transition-app"]).toBe("registered");
    expect(snapshot.lifecycleEvents.filter((event) => event.appId === "invalid-transition-app")).toEqual([]);
    expect(
      RuntimeController.getEventHistory().filter(
        (event) => event.type === "app.lifecycle.transition" && eventAppId(event.payload) === "invalid-transition-app"
      )
    ).toHaveLength(0);
    expect(RuntimeController.getEventHistory().filter((event) => event.type === "lifecycle.transition.failed")).toHaveLength(1);
    expect(snapshot.errors.at(-1)).toMatchObject({
      code: "APP_LAUNCH_FAILED",
      appId: "invalid-transition-app",
      source: "SynCloudOS.AppManager.transition"
    });
  });

  it("keeps compatibility lifecycle calls returning booleans", async () => {
    const runtime = createTestRuntime();
    authoriseRuntime(runtime);
    const { AppRegistry, AppManagerController, RuntimeController } = createRuntimeHarness(runtime);
    AppRegistry.register(createTestManifest({ id: "compatibility-app" }));
    const manager = AppManagerController.getManagerForApp("compatibility-app");

    expect(manager?.markReady()).toBe(false);
    expect(manager?.transition("loading", "prepare")).toBe(true);
    expect(manager?.markReady()).toBe(true);
    expect(manager?.resume()).toBe(true);
    await vi.waitFor(() => expect(manager?.getState()).toBe("active"));
    expect(manager?.fail(new Error("boom"))).toBe(true);

    expect(RuntimeController.getSnapshot().lifecycle["compatibility-app"]).toBe("failed");
  });

  it("uses current RuntimeStore AppInfo when stale managers explain and launch", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    authoriseRuntime(runtime);
    const { AppRegistry, AppManagerController, ServiceRegistry } = createRuntimeHarness(runtime);
    ServiceRegistry.ensureDefaults();
    ServiceRegistry.stopService("windowing");
    AppRegistry.registerBundle(createTestBundle({ id: "restored-service-app", requiredServices: ["windowing"] }));
    const manager = AppManagerController.getManagerForApp("restored-service-app");

    expect(manager?.explainLaunch()).toMatchObject({ canLaunch: false, disabled: true });

    ServiceRegistry.startService("windowing");

    expect(manager?.explainLaunch()).toMatchObject({ canLaunch: true, disabled: false });
    const launch = manager?.launch();
    await vi.advanceTimersByTimeAsync(80);
    await vi.advanceTimersByTimeAsync(220);

    await expect(launch).resolves.toBe(manager);
    expect(manager?.getState()).toBe("active");
  });
});
