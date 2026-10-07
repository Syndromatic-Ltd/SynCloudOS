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
import { createTestBundle, createTestRuntime, createRuntimeHarness, flushMultiSwitchLaunch } from "./helpers";

type RuntimeLoginSurface = {
  readonly runtimeId: string;
  getSessionSnapshot(): unknown;
  hydrateSession(): unknown;
  hasAuthorisedSession(): boolean;
  isLocked(): boolean;
  isUnlocked(): boolean;
};

type LegacyNotificationInput = {
  readonly kind: string;
  readonly title: string;
  readonly message: string;
};

type DurableNotificationInput = {
  readonly idempotencyKey: string;
  readonly title: string;
  readonly body: string;
  readonly delivery: "in-app" | "browser-if-authorised";
};

type LegacyNotificationRecord = {
  readonly id: string;
  readonly runtimeId?: string;
  readonly title?: string;
  readonly status?: string;
};

type DurableNotificationRecord = {
  readonly status: string;
  readonly runtimeId: string;
  readonly notification: {
    readonly id: string;
    readonly runtimeId: string;
    readonly idempotencyKey: string;
    readonly state: string;
    readonly request: {
      readonly body: string;
      readonly delivery: string;
    };
  };
};

type NotificationCenterSurface = {
  post(input: LegacyNotificationInput, options?: unknown): LegacyNotificationRecord | null;
  post(input: DurableNotificationInput, options?: unknown): Promise<DurableNotificationRecord>;
  getHistory(): LegacyNotificationRecord[];
  dismiss(
    id: string,
    reason?: string,
  ): LegacyNotificationRecord | DurableNotificationRecord["notification"] | null | Promise<LegacyNotificationRecord | DurableNotificationRecord["notification"] | null>;
};

type RuntimeResponsiveSurface = {
  readonly runtimeId: string;
  sync(): void;
};

type RuntimeChoreographySurface = {
  readonly runtimeId: string;
  getMultiSwitchSettleFallbackMs(): number;
};

type RuntimeWatchdogSurface = {
  readonly runtimeId: string;
  getStatus(): { readonly installed: boolean };
  install(): unknown;
};

describe("runtime controller, inspector, and transaction contracts", () => {
  it("returns cloned inspection snapshots", async () => {
    const { RuntimeController } = createRuntimeHarness(createTestRuntime());
    RuntimeController.markBooted();

    const inspected = RuntimeController.inspect();
    inspected.booted = false;
    inspected.webspring.isBooted = false;

    expect(RuntimeController.getSnapshot().booted).toBe(true);
    expect(RuntimeController.getSnapshot().webspring.isBooted).toBe(true);
  });
  it("commits transactions, records history, and flushes post-commit effects", async () => {
    const { RuntimeController } = createRuntimeHarness(createTestRuntime());
    const afterCommit = vi.fn();
    RuntimeController.afterCommit(afterCommit);

    const result = await RuntimeController.transaction("test.commit", (context) => {
      context.mutate((draft) => {
        draft.booted = true;
      });
      return "committed";
    });

    expect(result).toBe("committed");
    expect(RuntimeController.getSnapshot().booted).toBe(true);
    expect(RuntimeController.getHistory().map((entry) => entry.status)).toContain("committed");
    expect(afterCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps login aliases on the effective runtime-owned service", async () => {
    const runtime = createTestRuntime({ id: "runtime:login-contract" });
    const login = runtime.login as unknown as RuntimeLoginSurface;

    try {
      expect(login.runtimeId).toBe(runtime.runtimeId);
      expect(login.getSessionSnapshot()).toMatchObject({ isAuthorised: false, status: "locked" });
      expect(login.hydrateSession()).toMatchObject({ isAuthorised: false, status: "locked" });
      expect(login.hasAuthorisedSession()).toBe(false);
      expect(login.isLocked()).toBe(true);
      expect(login.isUnlocked()).toBe(false);

      runtime.store.mutate((draft) => {
        draft.loginServices.isAuthorised = true;
        draft.loginServices.status = "unlocked";
      });

      expect(login.getSessionSnapshot()).toMatchObject({ isAuthorised: true, status: "unlocked" });
      expect(login.hasAuthorisedSession()).toBe(true);
      expect(login.isLocked()).toBe(false);
      expect(login.isUnlocked()).toBe(true);
    } finally {
      await runtime.dispose("login contract test");
    }
  });

  it("keeps lifecycle state and app manager identity aligned after an app route opens", async () => {
    const runtime = createTestRuntime({ id: "runtime:lifecycle-contract" });
    const { AppManagerController, Lifecycle } = createRuntimeHarness(runtime);

    try {
      const app = runtime.apps.registerBundle(createTestBundle({
        id: "lifecycle-contract-app",
        route: "/lifecycle-contract-app",
        requiredServices: [],
      }));
      if (!app) throw new Error("The lifecycle contract app did not register.");
      runtime.store.mutate((draft) => {
        draft.loginServices.isAuthorised = true;
        draft.loginServices.status = "unlocked";
      });

      expect(Lifecycle.runtimeId).toBe(runtime.runtimeId);
      expect(Lifecycle.getState(app.id)).toBe("registered");
      const route = runtime.routes.openRoute(app.route);
      await expect(route.result).resolves.toMatchObject({
        status: "completed",
        committed: true,
        value: {
          runtimeId: runtime.runtimeId,
          appId: app.id,
        },
      });
      const lifecycleManager = Lifecycle.getManager(app.id);
      expect(lifecycleManager).toBe(AppManagerController.getManagerForApp(app.id));
      expect(lifecycleManager).toMatchObject({ appId: app.id });
      expect(lifecycleManager.getState()).toBe("active");
      expect(AppManagerController.runtimeId).toBe(runtime.runtimeId);
    } finally {
      await runtime.dispose("lifecycle contract test");
    }
  });

  it("keeps Webspring edit, keyboard reorder, and drag rollback state on the runtime instance", async () => {
    const runtime = createTestRuntime({ id: "runtime:webspring-contract" });

    try {
      runtime.apps.registerMany([
        createTestBundle({
          id: "webspring-contract-one",
          route: "/webspring-contract-one",
          requiredServices: [],
          webspring: { visible: true, order: 1 },
        }),
        createTestBundle({
          id: "webspring-contract-two",
          route: "/webspring-contract-two",
          requiredServices: [],
          webspring: { visible: true, order: 2 },
        }),
      ]);
      runtime.webspring.resetLayoutOrder();
      expect(runtime.store.getSnapshot().webspring.layout.preference.order).toEqual([
        "webspring-contract-one",
        "webspring-contract-two",
      ]);

      runtime.webspring.enterEditMode("webspring-contract-one");
      expect(runtime.store.getSnapshot().webspring.layout.isEditing).toBe(true);
      expect(runtime.webspring.isLaunchSuppressed()).toBe(true);
      expect(runtime.webspring.moveEditingAppByKeyboard("webspring-contract-one", "ArrowRight", 1)).toBe(true);
      expect(runtime.store.getSnapshot().webspring.layout.preference.order).toEqual([
        "webspring-contract-two",
        "webspring-contract-one",
      ]);
      runtime.webspring.exitEditMode(true);
      expect(runtime.store.getSnapshot().webspring.layout.isEditing).toBe(false);
      const committedOrder = runtime.store.getSnapshot().webspring.layout.preference.order;

      runtime.webspring.enterEditMode("webspring-contract-one");
      runtime.webspring.startDraggingApp("webspring-contract-one");
      expect(runtime.webspring.reorderDraggedAppBefore("webspring-contract-two", false)).toBe(true);
      expect(runtime.store.getSnapshot().webspring.layout.preference.order).toEqual([
        "webspring-contract-one",
        "webspring-contract-two",
      ]);
      runtime.webspring.exitEditMode(true);
      expect(runtime.store.getSnapshot().webspring.layout.preference.order).toEqual([
        "webspring-contract-one",
        "webspring-contract-two",
      ]);

      runtime.webspring.startDraggingApp("webspring-contract-two");
      expect(runtime.webspring.reorderDraggedAppBefore("webspring-contract-one", false)).toBe(true);
      runtime.webspring.finishDraggingApp(false);
      expect(runtime.store.getSnapshot().webspring.layout.preference.order).toEqual([
        "webspring-contract-one",
        "webspring-contract-two",
      ]);
      expect(committedOrder).toEqual([
        "webspring-contract-two",
        "webspring-contract-one",
      ]);
    } finally {
      await runtime.dispose("Webspring contract test");
    }
  });

  it("keeps legacy and durable notifications on the same runtime-owned centre", async () => {
    const runtime = createTestRuntime({ id: "runtime:notification-contract" });
    const { SynCloudOS } = createRuntimeHarness(runtime);
    const NotificationCenter = SynCloudOS.NotificationCenter as unknown as NotificationCenterSurface;

    try {
      expect(NotificationCenter).toBe(runtime.notifications);
      const legacy = NotificationCenter.post({
        kind: "news",
        title: "Legacy notification",
        message: "The legacy presentation contract is still runtime-scoped.",
      });
      if (!legacy) throw new Error("The legacy notification contract did not post.");
      expect(legacy).toMatchObject({ runtimeId: runtime.runtimeId });
      expect(NotificationCenter.getHistory()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: legacy.id, title: "Legacy notification", status: expect.any(String) }),
      ]));
      const dismissedLegacy = await Promise.resolve(NotificationCenter.dismiss(legacy.id, "contract test"));
      expect(dismissedLegacy).toMatchObject({ id: legacy.id, status: "dismissed" });

      const durable = await NotificationCenter.post({
        idempotencyKey: "runtime-notification-contract",
        title: "Durable notification",
        body: "The durable notification contract is runtime-scoped.",
        delivery: "in-app",
      });
      expect(durable).toMatchObject({
        status: "delivered",
        runtimeId: runtime.runtimeId,
        notification: {
          runtimeId: runtime.runtimeId,
          idempotencyKey: "runtime-notification-contract",
          state: "delivered",
          request: { body: "The durable notification contract is runtime-scoped.", delivery: "in-app" },
        },
      });
      const dismissedDurable = await Promise.resolve(NotificationCenter.dismiss(durable.notification.id, "contract test"));
      expect(dismissedDurable).toMatchObject({
        runtimeId: runtime.runtimeId,
        state: "dismissed",
      });
    } finally {
      await runtime.dispose("notification contract test");
    }
  });

  it("keeps replacement managers runtime-owned and uninstalls their host resources on disposal", async () => {
    const runtime = createTestRuntime({ id: "runtime:replacement-contract" });
    const { PluginRegistry } = createRuntimeHarness(runtime);
    const responsive = runtime.responsiveModeManager as unknown as RuntimeResponsiveSurface;
    const choreography = runtime.webspringChoreography as unknown as RuntimeChoreographySurface;
    const watchdog = runtime.globalWatchdog as unknown as RuntimeWatchdogSurface;

    try {
      responsive.sync();
      expect(runtime.store.getSnapshot().responsive).toMatchObject({
        mode: "desktop",
        width: 1440,
        height: 900,
      });
      expect(responsive.runtimeId).toBe(runtime.runtimeId);
      expect(choreography.runtimeId).toBe(runtime.runtimeId);
      expect(choreography.getMultiSwitchSettleFallbackMs()).toBeGreaterThan(0);
      expect(runtime.appManager.runtimeId).toBe(runtime.runtimeId);
      expect(runtime.bootManager.runtimeId).toBe(runtime.runtimeId);
      expect(runtime.globalWatchdog.runtimeId).toBe(runtime.runtimeId);
      expect(runtime.pluginRegistry.runtimeId).toBe(runtime.runtimeId);
      expect(PluginRegistry).toBe(runtime.pluginRegistry);

      expect(watchdog.getStatus()).toMatchObject({ installed: false });
      expect(watchdog.install()).toMatchObject({ installed: true });
      const plugin = { id: "runtime-contract-plugin", name: "Runtime Contract Plugin", version: "1.0.0" };
      await expect(PluginRegistry.register(plugin)).resolves.toMatchObject({
        status: "enabled",
        plugin,
      });
      expect(PluginRegistry.getPlugins()).toEqual([
        expect.objectContaining({ plugin, status: "enabled" }),
      ]);
      await expect(PluginRegistry.disable(plugin.id)).resolves.toMatchObject({
        status: "disabled",
        plugin,
      });

      await expect(runtime.dispose("replacement contract test")).resolves.toMatchObject({
        status: "disposed",
        runtimeId: runtime.runtimeId,
      });
      expect(runtime.disposalState).toBe("disposed");
      expect(watchdog.getStatus()).toMatchObject({ installed: false });
    } finally {
      await runtime.dispose("replacement contract test cleanup");
    }
  });

  it("settles a runtime MultiSwitch through its fallback", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime({ id: "runtime:multiswitch-fallback-contract" });
    const choreography = runtime.webspringChoreography as unknown as RuntimeChoreographySurface;

    try {
      runtime.apps.registerMany([
        createTestBundle({
          id: "multiswitch-fallback-one",
          route: "/multiswitch-fallback-one",
          requiredServices: [],
        }),
        createTestBundle({
          id: "multiswitch-fallback-two",
          route: "/multiswitch-fallback-two",
          requiredServices: [],
        }),
      ]);
      runtime.store.mutate((draft) => {
        draft.loginServices.isAuthorised = true;
        draft.loginServices.status = "unlocked";
      });
      await expect(runtime.routes.openRoute("/multiswitch-fallback-one").result).resolves.toMatchObject({
        status: "completed",
        committed: true,
      });
      await expect(runtime.routes.openRoute("/multiswitch-fallback-two").result).resolves.toMatchObject({
        status: "completed",
        committed: true,
      });
      const switching = runtime.store.getSnapshot().application.multiSwitch;
      expect(switching).toMatchObject({
        status: "switching",
        fromAppId: "multiswitch-fallback-one",
        toAppId: "multiswitch-fallback-two",
      });

      await flushMultiSwitchLaunch();
      const fallbackMs = choreography.getMultiSwitchSettleFallbackMs();
      await vi.advanceTimersByTimeAsync(fallbackMs + 1);
      expect(runtime.store.getSnapshot().application.multiSwitch).toMatchObject({
        id: switching.id,
        status: "idle",
      });
    } finally {
      await runtime.dispose("multiswitch fallback contract cleanup");
      vi.useRealTimers();
    }
  });

  it("cancels a pending MultiSwitch fallback when the runtime is disposed", async () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime({ id: "runtime:multiswitch-disposal-contract" });
    const choreography = runtime.webspringChoreography as unknown as RuntimeChoreographySurface;
    const completeMultiSwitch = vi.spyOn(runtime.launchServices, "completeMultiSwitch");
    let completionEvents = 0;
    const unsubscribe = runtime.events.subscribe("multiswitch.complete", () => {
      completionEvents += 1;
    });

    try {
      runtime.apps.registerMany([
        createTestBundle({
          id: "multiswitch-disposal-one",
          route: "/multiswitch-disposal-one",
          requiredServices: [],
        }),
        createTestBundle({
          id: "multiswitch-disposal-two",
          route: "/multiswitch-disposal-two",
          requiredServices: [],
        }),
      ]);
      runtime.store.mutate((draft) => {
        draft.loginServices.isAuthorised = true;
        draft.loginServices.status = "unlocked";
      });
      await expect(runtime.routes.openRoute("/multiswitch-disposal-one").result).resolves.toMatchObject({
        status: "completed",
        committed: true,
      });
      await expect(runtime.routes.openRoute("/multiswitch-disposal-two").result).resolves.toMatchObject({
        status: "completed",
        committed: true,
      });
      const switching = runtime.store.getSnapshot().application.multiSwitch;
      expect(switching).toMatchObject({
        status: "switching",
        fromAppId: "multiswitch-disposal-one",
        toAppId: "multiswitch-disposal-two",
      });

      await flushMultiSwitchLaunch();
      const fallbackMs = choreography.getMultiSwitchSettleFallbackMs();
      await runtime.dispose("multiswitch disposal contract test");
      await vi.advanceTimersByTimeAsync(fallbackMs + 100);
      expect(completeMultiSwitch).not.toHaveBeenCalled();

      expect(completionEvents).toBe(0);
      expect(runtime.store.getSnapshot().application.multiSwitch).toMatchObject({
        id: switching.id,
        status: "switching",
      });
    } finally {
      completeMultiSwitch.mockRestore();
      unsubscribe();
      await runtime.dispose("multiswitch disposal contract cleanup");
      vi.useRealTimers();
    }
  });


  it("exposes real Inspector runtime reports", async () => {
    const { Inspector, RuntimeController } = createRuntimeHarness(createTestRuntime());
    RuntimeController.markBooted();

    const report = Inspector.getRuntimeReport();

    expect(report.boot).toBeNull();
    expect(report.routing.table).toEqual([]);
    expect(report.services.serviceCount).toBeGreaterThan(0);
    expect(report.windows.ok).toBe(true);
    expect(report.statechart.currentState).toBe("booting");
    expect(report.transactions).toEqual(RuntimeController.getTransactionHistory());
  });

  it("boots to LoginWindow by default when no session is authorised", async () => {
    const { BootManager, RuntimeController } = createRuntimeHarness(createTestRuntime());

    BootManager.boot();

    expect(RuntimeController.getSnapshot().statechart.currentState).toBe("locked.loginWindow");
  });

  it("rolls back failed transactions and reports runtime errors", async () => {
    const { RuntimeController } = createRuntimeHarness(createTestRuntime());

    const result = await RuntimeController.transaction("test.rollback", (context) => {
      context.mutate((draft) => {
        draft.booted = true;
      });
      throw new Error("snap back");
    });

    expect(result).toBeUndefined();
    expect(RuntimeController.getSnapshot().booted).toBe(false);
    expect(RuntimeController.getHistory().at(-1)?.status).toBe("rolledBack");
    expect(RuntimeController.getSnapshot().errors.at(-1)?.code).toBe("RUNTIME_TRANSACTION_FAILED");
  });

  it("keeps legacy run transactions usable for sync commands", async () => {
    const { run, RuntimeController } = createRuntimeHarness(createTestRuntime());

    const result = run(() => {
      RuntimeController.commit((draft) => {
        draft.booted = true;
      });
      return 4;
    }, "legacy.run");

    expect(result).toBe(4);
    expect(RuntimeController.getSnapshot().booted).toBe(true);
    expect(RuntimeController.getEventHistory().map((event) => event.type)).toEqual([
      "runtime.transaction.begin",
      "runtime.transaction.commit"
    ]);
  });

  it("asserts cross-runtime invariants for active apps", async () => {
    const { RuntimeController } = createRuntimeHarness(createTestRuntime());

    RuntimeController.commit((draft) => {
      draft.application.activeAppId = "missing-app";
    });

    expect(() => RuntimeController.assertInvariant()).toThrow("missing-app");
  });

});
