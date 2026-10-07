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

import { describe, expect, it } from "vitest";
import { createMemoryUserNotificationPersistence } from "../../src/SynCloudOS/NotificationCenter/NotificationPersistence";
import { createTestRuntime } from "./helpers";

function delivery(permission: "granted" | "denied" | "default" = "granted") {
  return {
    id: "test-delivery",
    permission: () => permission,
    requestPermission: async () => "granted" as const,
    deliver: async () => ({ status: "delivered" as const }),
    dispose: () => undefined,
  };
}

describe("runtime user notification persistence", () => {
  it("persists an approved notification, coalesces idempotent posts, and restores records", async () => {
    const persistence = createMemoryUserNotificationPersistence();
    const runtime = createTestRuntime({ id: "runtime:notification:restart", userNotifications: { persistence, delivery: delivery() } });
    const actions: string[] = [];
    runtime.notifications.registerAction?.("open", async ({ notificationId }: { notificationId: string }) => {
      actions.push(notificationId);
    });

    const posted = await runtime.notifications.post({
      idempotencyKey: "build:finished:42",
      title: "Build complete",
      body: "SynCloudOS is ready.",
      actions: [{ id: "open", title: "Open" }],
      delivery: "browser-if-authorised",
    });
    expect(posted).toMatchObject({ status: "delivered" });
    const duplicate = await runtime.notifications.post({
      idempotencyKey: "build:finished:42",
      title: "Duplicate",
      body: "Ignored",
      delivery: "in-app",
    });
    expect(duplicate).toMatchObject({ status: "delivered", notification: { id: posted.notification.id } });
    await runtime.notifications.invokeAction(posted.notification.id, "open");
    expect(actions).toEqual([posted.notification.id]);
    expect(await persistence.load()).toHaveLength(1);

    const restored = createTestRuntime({ id: "runtime:notification:restart", userNotifications: { persistence, delivery: delivery() } });
    await restored.boot();
    expect(restored.notifications.getUserNotificationHistory()).toHaveLength(1);
    expect(restored.notifications.getUserNotificationHistory()[0].id).toBe(posted.notification.id);
    await restored.dispose();
    await runtime.dispose();
  });

  it("retains an in-app record without implicitly requesting browser permission", async () => {
    let requested = 0;
    const browser = {
      ...delivery("default"),
      requestPermission: async () => { requested += 1; return "granted" as const; },
    };
    const runtime = createTestRuntime({ userNotifications: { persistence: createMemoryUserNotificationPersistence(), delivery: browser } });
    const result = await runtime.notifications.post({
      idempotencyKey: "permission:default",
      title: "Background",
      body: "No prompt",
      delivery: "browser-if-authorised",
    });
    expect(result).toMatchObject({ status: "delivered", notification: { state: "delivered" } });
    expect(requested).toBe(0);
  });
});
