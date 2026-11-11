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
import { createTestRuntime, createRuntimeHarness } from "./helpers";

describe("SynCal reminder notification actions", () => {
  it("preserves snooze metadata when NotificationCenter emits action events", async () => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const events: unknown[] = [];
    const unsubscribe = SynCloudOS.EventBus.subscribe("notification.action", (event: { payload?: unknown }) => events.push(event.payload));

    const notification = SynCloudOS.NotificationCenter.post({
      kind: "app",
      appId: "com.example.syncal",
      title: "Calendar alarm",
      message: "Product review starts soon.",
      actions: [
        {
          id: "snooze:syncal-reminder-1",
          kind: "snooze",
          label: "Snooze",
          metadata: { reminderId: "syncal-reminder-1", eventId: "syncal-event-1", snoozeMinutes: 5 }
        }
      ],
      data: { reminderId: "syncal-reminder-1", source: "syncal.reminders" }
    });
    const acted = SynCloudOS.NotificationCenter.act(notification?.id ?? "", "snooze:syncal-reminder-1");
    unsubscribe();

    expect(acted?.action).toMatchObject({ kind: "snooze" });
    expect(acted?.notification).toMatchObject({ status: "acted" });
    expect(events.at(-1)).toMatchObject({
      notificationId: notification?.id,
      actionKind: "snooze",
      metadata: { reminderId: "syncal-reminder-1", eventId: "syncal-event-1", snoozeMinutes: 5 },
      data: { reminderId: "syncal-reminder-1", source: "syncal.reminders" }
    });
  });
});
