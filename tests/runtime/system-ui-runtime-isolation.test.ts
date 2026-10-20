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
import { createTestRuntime } from "./helpers";

type SystemUIRuntimeProbe = {
  preferencePanes?: {
    getSnapshot(): readonly { id: string; bundleIdentifier: string; order: number }[];
  };
  systemUI?: {
    getSnapshot(): { preferencesPane: string | null; aboutAppId: string | null; logOutOpen: boolean };
    subscribe(listener: () => void): () => void;
    preferences: { open(pane?: string): void };
    about: { open(appId: string): void };
    session: { requestLogOut(): void };
  };
  settings?: {
    get(): { soundEnabled: boolean; notificationsEnabled: boolean };
    set(key: "soundEnabled" | "notificationsEnabled", value: boolean): void;
  };
};

describe("runtime-owned system UI", () => {
  it("keeps Preferences, About, and Log Out state isolated between runtime roots", () => {
    const first = createTestRuntime({ id: "runtime:system-ui:first" }) as typeof createTestRuntime extends (...args: never[]) => infer T ? T & SystemUIRuntimeProbe : never;
    const second = createTestRuntime({ id: "runtime:system-ui:second" }) as typeof first;
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    expect(first.systemUI).toBeDefined();
    expect(second.systemUI).toBeDefined();
    expect(first.settings).toBeDefined();
    expect(second.settings).toBeDefined();
    expect(first.preferencePanes).toBeDefined();
    expect(second.preferencePanes).toBeDefined();
    expect(first.preferencePanes).not.toBe(second.preferencePanes);
    const unsubscribeFirst = first.systemUI!.subscribe(firstListener);
    const unsubscribeSecond = second.systemUI!.subscribe(secondListener);

    first.systemUI!.preferences.open("motion");
    first.systemUI!.about.open("software");
    first.systemUI!.session.requestLogOut();
    first.settings!.set("soundEnabled", false);
    first.settings!.set("notificationsEnabled", false);

    expect(first.systemUI!.getSnapshot()).toEqual({
      preferencesPane: "motion",
      aboutAppId: "software",
      logOutOpen: true,
      returnDecision: null
    });
    expect(second.systemUI!.getSnapshot()).toEqual({
      preferencesPane: null,
      aboutAppId: null,
      logOutOpen: false,
      returnDecision: null
    });
    expect(first.settings!.get()).toMatchObject({ soundEnabled: false, notificationsEnabled: false });
    expect(second.settings!.get()).toMatchObject({ soundEnabled: true, notificationsEnabled: true });
    expect(firstListener).toHaveBeenCalledTimes(3);
    expect(secondListener).not.toHaveBeenCalled();

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("keeps a muted app out of the visible notification store without leaking the choice to another root", async () => {
    const first = createTestRuntime({ id: "runtime:settings:first" });
    const second = createTestRuntime({ id: "runtime:settings:second" });
    first.settings.setNotificationsAllowed("com.example.mail", false);

    const muted = await first.notifications.post({
      idempotencyKey: "settings:muted",
      appId: "com.example.mail",
      title: "Muted mail",
      body: "Do not present",
      delivery: "in-app",
    });
    const allowed = await second.notifications.post({
      idempotencyKey: "settings:allowed",
      appId: "com.example.mail",
      title: "Allowed mail",
      body: "Present here",
      delivery: "in-app",
    });

    expect(muted.status).toBe("denied");
    expect(first.store.getSnapshot().notifications).toEqual([]);
    expect(allowed.status).toBe("delivered");
    expect(second.store.getSnapshot().notifications).toHaveLength(1);
  });
});
