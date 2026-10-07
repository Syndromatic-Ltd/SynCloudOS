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
import { createMemoryUserNotificationPersistence } from "../../src/SynCloudOS/NotificationCenter/NotificationPersistence";
import { createTestRuntime } from "./helpers";

describe("runtime user notification actions", () => {
  it("returns typed unavailable results and persists acknowledgement/dismissal", async () => {
    const persistence = createMemoryUserNotificationPersistence();
    const runtime = createTestRuntime({ userNotifications: { persistence } });
    const posted = await runtime.notifications.post({
      idempotencyKey: "action:test",
      title: "Action",
      body: "Choose",
      actions: [{ id: "dismiss", title: "Dismiss", dismissOnSuccess: true }],
      delivery: "in-app",
    });
    await expect(runtime.notifications.invokeAction(posted.notification.id, "missing")).resolves.toMatchObject({ status: "unavailable" });
    await expect(runtime.notifications.acknowledge(posted.notification.id)).resolves.toMatchObject({ state: "acknowledged" });
    await expect(runtime.notifications.dismiss(posted.notification.id, "user")).resolves.toMatchObject({ state: "dismissed" });
    expect((await persistence.load())[0]).toMatchObject({ state: "dismissed" });
  });

  it("does not leak sensitive notification bodies into diagnostics", async () => {
    const runtime = createTestRuntime({ userNotifications: { persistence: createMemoryUserNotificationPersistence() } });
    await runtime.notifications.post({
      idempotencyKey: "sensitive:test",
      title: "Private",
      body: "secret-body-should-not-appear",
      sensitive: true,
      delivery: "in-app",
    });
    expect(JSON.stringify(runtime.inspector.getRuntimeReport())).not.toContain("secret-body-should-not-appear");
  });

  it("locks concurrent invocations so one irreversible action runs once", async () => {
    const runtime = createTestRuntime({ userNotifications: { persistence: createMemoryUserNotificationPersistence() } });
    const posted = await runtime.notifications.post({
      idempotencyKey: "action:concurrent",
      title: "Concurrent",
      body: "Choose once",
      actions: [{ id: "commit", title: "Commit", dismissOnSuccess: true }],
      delivery: "in-app",
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const handler = vi.fn(async () => held);
    runtime.notifications.registerAction?.("commit", handler);

    const first = runtime.notifications.invokeAction(posted.notification.id, "commit");
    const second = runtime.notifications.invokeAction(posted.notification.id, "commit");
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: "completed" }),
      expect.objectContaining({ status: "completed" }),
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("uses the runtime disposal signal and awaits delivery adapter teardown", async () => {
    let releaseDelivery!: () => void;
    const deliveryHeld = new Promise<void>((resolve) => { releaseDelivery = resolve; });
    let markDeliveryStarted!: () => void;
    const deliveryStarted = new Promise<void>((resolve) => { markDeliveryStarted = resolve; });
    let releaseDispose!: () => void;
    const disposeHeld = new Promise<void>((resolve) => { releaseDispose = resolve; });
    let deliverySignal: AbortSignal | null = null;
    const runtime = createTestRuntime({
      userNotifications: {
        persistence: createMemoryUserNotificationPersistence(),
        delivery: {
          id: "delayed",
          permission: () => "granted",
          requestPermission: async () => "granted",
          async deliver(_record, signal) {
            deliverySignal = signal;
            markDeliveryStarted();
            await deliveryHeld;
            return { status: "delivered" };
          },
          dispose: () => disposeHeld,
        },
      },
    });

    const posting = runtime.notifications.post({
      idempotencyKey: "delivery:dispose",
      title: "Delayed",
      body: "Delivery",
      delivery: "browser-if-authorised",
    });
    await deliveryStarted;
    expect(deliverySignal).toBe(runtime.signal);
    const runtimeAborted = new Promise<void>((resolve) => runtime.signal.addEventListener("abort", () => resolve(), { once: true }));
    const disposing = runtime.dispose({ reason: "notification-race", inFlight: "cancel" });
    await runtimeAborted;
    expect(runtime.signal.aborted).toBe(true);
    let disposed = false;
    void disposing.then(() => { disposed = true; });
    await Promise.resolve();
    expect(disposed).toBe(false);

    releaseDelivery();
    releaseDispose();
    await expect(disposing).resolves.toMatchObject({ status: "disposed" });
    await expect(posting).rejects.toThrow(/disposed|cancel/i);
  });
});
