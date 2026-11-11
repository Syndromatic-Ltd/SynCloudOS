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
import { resolveNotificationMotion } from "../../src/Webspring/NotificationCentre.transitions";
import { compileNSEPresentation, type NSEPresentationSpec } from "../../src/NSE/Animation";
import { createNotificationActionPlan, getPrimaryNotificationAction } from "../../src/Webspring/notificationActions";
import type { SynCloudOSNotification } from "../../src/SynCloudOS/NotificationCenter/notificationTypes";

function createNotification(overrides: Partial<SynCloudOSNotification> = {}): SynCloudOSNotification {
  const createdAt = 1_700_000_000_000;
  return {
    id: "notification-test",
    kind: "app",
    category: "app",
    title: "Ready",
    message: "The test notification is ready.",
    appId: "com.example.journal",
    createdAt,
    updatedAt: createdAt,
    status: "displayed",
    priority: "standard",
    behaviours: [],
    lifecycle: {
      status: "displayed",
      queuedAt: createdAt,
      displayedAt: createdAt,
      updatedAt: createdAt
    },
    delivery: {
      channel: "banner",
      interruptible: true,
      queuedAt: createdAt,
      displayedAt: createdAt
    },
    actions: [],
    group: {
      key: "journal:app:general:2023-11-14",
      appId: "com.example.journal",
      kind: "app",
      dateKey: "2023-11-14"
    },
    groupKey: "journal:app:general:2023-11-14",
    dateKey: "2023-11-14",
    ...overrides
  };
}

describe("Webspring notification presenter model", () => {
  it("keeps cube and centre motion owner-local with a reduced fallback", () => {
    const standard = resolveNotificationMotion(false);
    const flip = (spec: NSEPresentationSpec | null) => compileNSEPresentation(spec!, "rotor").animations[0];
    const enter = (state: Parameters<typeof standard.rotor>[0], previous: string | null) => {
      const presentation = standard.rotor(state).enter;
      return typeof presentation === "function" ? presentation(previous) : presentation;
    };
    // The rotor waits edge-on, flips in over 0.42 s, and flips away on dismissal.
    expect(standard.rotor("hidden").style).toEqual({ transform: "translate(0px, 0px) scale(1) rotateX(92deg)" });
    expect(enter("presented", "hidden")).toMatchObject({ duration: 0.42 });
    expect(flip(enter("presented", "hidden"))).toMatchObject({ from: "translate(0px, 0px) scale(1) rotateX(92deg)", to: "none" });
    expect(flip(standard.rotorExit("presented"))).toMatchObject({ from: "none", to: "translate(0px, 0px) scale(1) rotateX(92deg)" });
    // A replacement flips the old banner away and the new one in over 0.24 s.
    expect(enter("replaced", "presented")).toMatchObject({ duration: 0.24 });
    expect(enter("presented", "incoming")).toMatchObject({ duration: 0.24 });
    expect(standard.bannerScreenFace.style).toEqual({ opacity: 0.82, filter: "brightness(0.72) saturate(0.92)" });
    expect(standard.bannerStatusStrip.style).toEqual({ opacity: 0.52, filter: "brightness(0.26)" });
    const reduced = resolveNotificationMotion(true);
    expect(reduced.rotor("hidden").style).toEqual({ opacity: 0, transform: "translate(0px, -6px) scale(1)" });
    expect(reduced.rotor("presented").style).toEqual({});
  });

  it("resolves banner clicks and centre actions into Webspring-owned action plans", () => {
    const actionable = createNotification({
      route: "/journal",
      actions: [
        { id: "later", kind: "dismiss", label: "Later" },
        { id: "open", kind: "openRoute", label: "Open", route: "/journal/release-note", primary: true },
        { id: "details", kind: "viewDetails", label: "Details" }
      ]
    });

    expect(getPrimaryNotificationAction(actionable)).toMatchObject({ id: "open", kind: "openRoute" });
    expect(createNotificationActionPlan(actionable)).toMatchObject({
      kind: "openRoute",
      notificationId: actionable.id,
      actionId: "open",
      route: "/journal/release-note",
      appId: "com.example.journal",
      shouldAct: true,
      shouldCloseCentre: true
    });

    expect(createNotificationActionPlan(actionable, actionable.actions[2])).toMatchObject({
      kind: "viewDetails",
      actionId: "details",
      shouldAct: true,
      shouldCloseCentre: false
    });
  });

  it("falls back to notification route, app, and centre plans without mutating runtime APIs", () => {
    expect(createNotificationActionPlan(createNotification({ route: "/journal", actions: [] }))).toMatchObject({
      kind: "openRoute",
      route: "/journal",
      shouldAct: false
    });
    expect(createNotificationActionPlan(createNotification({ route: undefined, actions: [] }))).toMatchObject({
      kind: "openApp",
      appId: "com.example.journal",
      shouldAct: false
    });
    expect(createNotificationActionPlan(createNotification({ appId: undefined, actions: [] }))).toMatchObject({
      kind: "openNotificationCentre",
      shouldAct: false,
      shouldCloseCentre: false
    });
    expect(createNotificationActionPlan(
      createNotification(),
      { id: "clear", kind: "clearGroup", label: "Clear" }
    )).toMatchObject({
      kind: "clearGroup",
      shouldAct: false
    });
  });
});
