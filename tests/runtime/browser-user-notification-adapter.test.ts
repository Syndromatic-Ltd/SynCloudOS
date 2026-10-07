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
import { createBrowserUserNotificationDeliveryAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserUserNotificationDeliveryAdapter";

describe("browser user notification delivery adapter", () => {
  it("delegates permission and display through the injected browser port", async () => {
    const shown: unknown[] = [];
    const port = {
      permission: () => "granted" as const,
      requestPermission: async () => "granted" as const,
      show: async (title: string, options: unknown) => { shown.push({ title, options }); },
    };
    const adapter = createBrowserUserNotificationDeliveryAdapter(port);
    const result = await adapter.deliver({
      runtimeId: "runtime:notifications" as never,
      id: "notification:one",
      idempotencyKey: "one",
      request: { idempotencyKey: "one", title: "Hello", body: "World", delivery: "browser-if-authorised" },
      state: "pending",
      policyDecisionId: "policy:one",
      deliveryAttempts: [],
      createdAt: 0,
      updatedAt: 0,
    }, new AbortController().signal);
    expect(result).toMatchObject({ status: "delivered" });
    expect(shown).toHaveLength(1);
    expect(await adapter.requestPermission({ userGesture: true })).toBe("granted");
  });
});
