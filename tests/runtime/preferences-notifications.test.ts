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

import { afterEach, describe, expect, it } from "vitest";
import { createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

/**
 * The Notifications preference is the only setting in the panel that silences
 * something rather than restyling it, so its enforcement is worth pinning:
 * a switch that only changes its own appearance is worse than no switch.
 */
describe("Notifications preference", () => {
  afterEach(async () => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());
    SynCloudOS.Settings.set("notificationsEnabled", true);
  });

  it("keeps each app's own choice readable while the master switch is off", async () => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const settings = SynCloudOS.Settings;

    settings.setNotificationsAllowed("com.example.muted-app", false);
    expect(settings.appNotificationsAllowed("com.example.muted-app")).toBe(false);
    expect(settings.appNotificationsAllowed("allowed-app")).toBe(true);

    settings.set("notificationsEnabled", false);
    // Resolved answer: silenced. Own choice: untouched, so switching the master
    // back on restores exactly what was there before.
    expect(settings.notificationsAllowed("allowed-app")).toBe(false);
    expect(settings.appNotificationsAllowed("allowed-app")).toBe(true);
    expect(settings.notificationsAllowed("com.example.muted-app")).toBe(false);
    expect(settings.appNotificationsAllowed("com.example.muted-app")).toBe(false);

    settings.set("notificationsEnabled", true);
    expect(settings.notificationsAllowed("allowed-app")).toBe(true);
    expect(settings.notificationsAllowed("com.example.muted-app")).toBe(false);

    settings.setNotificationsAllowed("com.example.muted-app", true);
    expect(settings.notificationsAllowed("com.example.muted-app")).toBe(true);
  });

  it("drops a muted app's notification at post rather than hiding it later", async () => {
    const { AppRegistry, ServiceRegistry, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    ServiceRegistry.ensureDefaults();
    AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.muted-app",
      route: "/muted-app",
      requiredServices: ["webspring", "notifications"],
      notifications: { showsNotifications: true, badgeCount: 0 }
    }));

    SynCloudOS.Settings.setNotificationsAllowed("com.example.muted-app", false);
    const suppressed = SynCloudOS.NotificationCenter.post({
      kind: "publishing",
      title: "Should never arrive",
      message: "Muted by the application preference.",
      appId: "com.example.muted-app"
    });
    expect(suppressed).toBeNull();
    // Not merely unseen: it must not be in the history either.
    expect(
      SynCloudOS.NotificationCenter.getSnapshot().history.some((entry) => entry.appId === "com.example.muted-app")
    ).toBe(false);

    SynCloudOS.Settings.setNotificationsAllowed("com.example.muted-app", true);
    expect(SynCloudOS.NotificationCenter.post({
      kind: "publishing",
      title: "Arrives once allowed",
      message: "Allowed by the application preference.",
      appId: "com.example.muted-app"
    })).not.toBeNull();
  });

  it("lets the system speak even with every app silenced", async () => {
    const { ServiceRegistry, SynCloudOS } = createRuntimeHarness(createTestRuntime());
    ServiceRegistry.ensureDefaults();
    SynCloudOS.Settings.set("notificationsEnabled", false);

    // No appId — this is the system's own voice, not an app's, so the master
    // switch does not reach it. A boot failure must still be able to say so.
    expect(SynCloudOS.NotificationCenter.post({
      kind: "system",
      title: "Storage is full",
      message: "System delivery is independent of application preferences."
    })).not.toBeNull();
  });
});
