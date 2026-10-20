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
import { asPolicySubject, createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

const publicNotificationSubject = {
  user: {
    id: "public.test",
    displayName: "Public Test Visitor",
    role: "public" as const,
    isAuthenticated: false,
    isAnonymous: true
  },
  role: "public" as const,
  capabilities: [],
  isAuthenticated: false
};

describe("NotificationCenter runtime foundations", () => {
  it("preserves post/latest while producing presenter, queue, action, group, and badge snapshots", async () => {
    const { AppRegistry, RuntimeController, ServiceRegistry, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    ServiceRegistry.ensureDefaults();
    AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.journal",
      route: "/journal",
      requiredServices: ["webspring", "notifications"],
      notifications: { showsNotifications: true, badgeCount: 0 }
    }));

    const notification = SynCloudOS.NotificationCenter.post({
      kind: "publishing",
      title: "Post published",
      message: "Your release note is now live.",
      appId: "com.example.journal",
      priority: "timeSensitive",
      requiresAction: true,
      badgeCount: 3,
      threadKey: "release-note",
      actions: [
        { id: "open", kind: "openRoute", title: "Open", route: "/journal/release-note", primary: true },
        { id: "later", kind: "dismiss", title: "Later" }
      ]
    });

    expect(notification).toMatchObject({
      kind: "publishing",
      category: "publishing",
      status: "displayed",
      priority: "timeSensitive",
      behaviours: ["requiresAction"]
    });
    expect(SynCloudOS.NotificationCenter.latest()?.id).toBe(notification?.id);

    const presenter = SynCloudOS.NotificationCenter.getPresenterSnapshot();
    expect(presenter.banner?.id).toBe(notification?.id);
    expect(presenter.liveRegionText).toBe("Post published. Your release note is now live.");
    expect(presenter.queue[0]).toMatchObject({ position: 0, channel: "banner", interruptible: false });
    expect(presenter.groups[0]).toMatchObject({
      appId: "com.example.journal",
      kind: "publishing",
      threadKey: "release-note",
      unreadCount: 1
    });
    expect(presenter.badges.byAppId["com.example.journal"]).toMatchObject({ count: 3, notificationIds: [notification?.id] });
    expect(RuntimeController.getSnapshot().appInfo["com.example.journal"].notifications.badgeCount).toBe(3);
  });

  it("dismisses active notifications into history and derives app badges from notification state", async () => {
    const { AppRegistry, RuntimeController, ServiceRegistry, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    ServiceRegistry.ensureDefaults();
    AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.journal",
      route: "/journal",
      requiredServices: ["webspring", "notifications"],
      notifications: { showsNotifications: true, badgeCount: 0 }
    }));

    const first = SynCloudOS.NotificationCenter.post({
      kind: "app",
      title: "First",
      message: "One unread note.",
      appId: "com.example.journal"
    });
    const second = SynCloudOS.NotificationCenter.post({
      kind: "app",
      title: "Second",
      message: "Another unread note.",
      appId: "com.example.journal"
    });

    expect(SynCloudOS.NotificationCenter.latest()?.id).toBe(second?.id);
    expect(RuntimeController.getSnapshot().appInfo["com.example.journal"].notifications.badgeCount).toBe(2);

    const dismissedSecond = SynCloudOS.NotificationCenter.dismiss(second?.id ?? "");
    expect(dismissedSecond).toMatchObject({ id: second?.id, status: "dismissed" });
    expect(SynCloudOS.NotificationCenter.latest()?.id).toBe(first?.id);
    expect(RuntimeController.getSnapshot().appInfo["com.example.journal"].notifications.badgeCount).toBe(1);

    SynCloudOS.NotificationCenter.dismiss(first?.id ?? "");
    expect(SynCloudOS.NotificationCenter.latest()).toBeNull();
    expect(RuntimeController.getSnapshot().appInfo["com.example.journal"].notifications.badgeCount).toBe(0);
    expect(SynCloudOS.NotificationCenter.getHistory().map((item) => item.status)).toEqual([
      "dismissed",
      "dismissed"
    ]);
  });

  it("supports coalescing, deduplication, and explicit grouping without adding dependencies", async () => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());

    const firstProgress = SynCloudOS.NotificationCenter.post({
      kind: "progress",
      title: "Syncing",
      message: "Uploading 1 item.",
      appId: "com.example.journal",
      coalesceKey: "journal-sync"
    });
    const secondProgress = SynCloudOS.NotificationCenter.post({
      kind: "progress",
      title: "Syncing",
      message: "Uploading 2 items.",
      appId: "com.example.journal",
      coalesceKey: "journal-sync"
    });

    expect(secondProgress?.id).toBe(firstProgress?.id);
    expect(secondProgress).toMatchObject({ message: "Uploading 2 items.", coalescedCount: 2 });

    const unique = SynCloudOS.NotificationCenter.post({
      kind: "system",
      title: "Only once",
      message: "The first body survives duplicate posts.",
      dedupeKey: "system-once"
    });
    const duplicate = SynCloudOS.NotificationCenter.post({
      kind: "system",
      title: "Only once",
      message: "This body should not replace the first.",
      dedupeKey: "system-once"
    });

    expect(duplicate?.id).toBe(unique?.id);
    expect(duplicate?.message).toBe("The first body survives duplicate posts.");

    SynCloudOS.NotificationCenter.post({
      kind: "app",
      title: "Thread A",
      message: "First grouped item.",
      groupKey: "journal:thread-a"
    });
    SynCloudOS.NotificationCenter.post({
      kind: "app",
      title: "Thread A",
      message: "Second grouped item.",
      groupKey: "journal:thread-a"
    });

    expect(SynCloudOS.NotificationCenter.getHistory()).toHaveLength(4);
    expect(SynCloudOS.NotificationCenter.getGroups().find((group) => group.key === "journal:thread-a")).toMatchObject({
      count: 2,
      unreadCount: 2
    });
  });

  it("records action lifecycle and expiration without routing from the runtime foundation", async () => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());

    const actionable = SynCloudOS.NotificationCenter.post({
      kind: "app",
      title: "Review draft",
      message: "A draft is ready to inspect.",
      actions: [{ id: "open-draft", kind: "openRoute", title: "Open", route: "/journal/drafts/1" }]
    });
    const acted = SynCloudOS.NotificationCenter.act(actionable?.id ?? "", "open-draft");

    expect(acted?.action).toMatchObject({ kind: "openRoute", route: "/journal/drafts/1" });
    expect(acted?.notification).toMatchObject({ status: "acted" });

    const expiring = SynCloudOS.NotificationCenter.post({
      kind: "system",
      title: "Temporary",
      message: "This should expire.",
      ttlMs: 10
    });

    expect(SynCloudOS.NotificationCenter.sweepExpired((expiring?.createdAt ?? Date.now()) + 20)).toEqual([expiring?.id]);
    expect(SynCloudOS.NotificationCenter.getHistory().find((item) => item.id === expiring?.id)).toMatchObject({
      status: "expired"
    });
  });

  it("keeps silent items in centre history and clears active grouped notifications", async () => {
    const { AppRegistry, RuntimeController, ServiceRegistry, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    ServiceRegistry.ensureDefaults();
    AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.journal",
      route: "/journal",
      requiredServices: ["webspring", "notifications"],
      notifications: { showsNotifications: true, badgeCount: 0 }
    }));

    const visible = SynCloudOS.NotificationCenter.post({
      kind: "app",
      title: "Visible",
      message: "This one should use the banner queue.",
      appId: "com.example.journal",
      groupKey: "journal:thread"
    });
    const silent = SynCloudOS.NotificationCenter.post({
      kind: "backgroundTask",
      title: "Quiet sync",
      message: "This should only appear in Notification Centre.",
      appId: "com.example.journal",
      silent: true,
      groupKey: "journal:thread"
    });

    const presenter = SynCloudOS.NotificationCenter.getPresenterSnapshot();
    expect(presenter.queue.map((item) => item.notification.id)).toEqual([visible?.id]);
    expect(presenter.history.map((item) => item.id)).toEqual([silent?.id, visible?.id]);
    expect(presenter.groups.find((group) => group.key === "journal:thread")).toMatchObject({
      count: 2,
      unreadCount: 2
    });

    expect(SynCloudOS.NotificationCenter.clearGroup("journal:thread")).toEqual([silent?.id, visible?.id]);
    expect(SynCloudOS.NotificationCenter.getPresenterSnapshot()).toMatchObject({
      activeCount: 0,
      unreadCount: 0,
      banner: null
    });
    expect(RuntimeController.getSnapshot().appInfo["com.example.journal"].notifications.badgeCount).toBe(0);
  });

  it("can enforce PolicyKit denial for unprivileged notification posting", async () => {
    const { PolicyKit, RuntimeController, SynCloudOS } = createRuntimeHarness(createTestRuntime());

    const denied = SynCloudOS.NotificationCenter.post(
      {
        kind: "system",
        title: "Denied",
        message: "This unprivileged post should not be stored."
      },
      {
        policy: "enforce",
        origin: "test",
        ...asPolicySubject(PolicyKit, publicNotificationSubject)
      }
    );

    expect(denied).toBeNull();
    expect(RuntimeController.getSnapshot().notifications).toEqual([]);
    expect(PolicyKit.getAuditLog().at(-1)).toMatchObject({
      action: "notification.post",
      allowed: false,
      origin: "test"
    });
  });
});
