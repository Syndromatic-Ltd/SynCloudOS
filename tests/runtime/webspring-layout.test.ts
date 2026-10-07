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
import {
  DESKTOP_DIAL_APP_LIMIT,
  WEBSPRING_BOARD_PROJECTION_VERSION,
  createWebspringBoardProjection,
  WEBSPRING_LAYOUT_PREFERENCE_KEY,
  getDefaultWebspringOrder,
  getDesktopWebspringSlots,
  getKeyboardReorderIndex,
  getMobileWebspringGrid,
  moveWebspringAppToIndex,
  reconcileWebspringOrder,
  resetWebspringOrder
} from "../../src/Webspring/webspringLayout";
import { readWebspringLayoutPreference } from "../../src/SynCloudOS/WebspringState/webspringStateProjection";
import type { WebspringLayoutPersistence } from "../../src/SynCloudOS/WebspringState/webspringStateProjection";
import { getWebspringDragReorderTarget } from "../../src/Webspring/webspringDragReorder";
import { createTestRuntime, createTestManifest, createRuntimeHarness, createTestRuntimeEnvironment } from "./helpers";

function createBrowserPersistenceRuntime() {
  return createTestRuntime({
    persistenceNamespace: "SynCloudOS4",
    environment: { ...createTestRuntimeEnvironment(), localStorage: window.localStorage },
  });
}

function createProjectionPersistence(canonical: unknown = null) {
  const keys: string[] = [];
  const persistence: WebspringLayoutPersistence = {
    getPreference<T>(key: string, fallback: T) {
      keys.push(key);
      return key === WEBSPRING_LAYOUT_PREFERENCE_KEY && canonical !== null ? canonical as T : fallback;
    }
  };

  return { persistence, keys };
}

function createOrderedManifest(id: string, order: number, visible = true) {
  return createTestManifest({
    id,
    route: `/${id}`,
    webspring: {
      visible,
      order,
      dialPosition: 999 - order,
      selectorAngle: 999 - order
    }
  });
}

describe("Webspring layout helpers", () => {
  it("seeds order from visible manifest order and reconciles persisted preferences", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createOrderedManifest("alpha", 20),
      createOrderedManifest("beta", 5),
      createOrderedManifest("hidden", 1, false),
      createOrderedManifest("gamma", 30)
    ]);

    const apps = AppRegistry.getAllApps();

    expect(getDefaultWebspringOrder(apps)).toEqual(["beta", "alpha", "gamma"]);
    expect(reconcileWebspringOrder(apps, ["missing", "gamma", "gamma", "beta"])).toEqual([
      "gamma",
      "beta",
      "alpha"
    ]);
    expect(resetWebspringOrder(apps)).toEqual(["beta", "alpha", "gamma"]);
  });

  it("computes a five-column mobile grid with a four-column narrow fallback", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany([
      createOrderedManifest("one", 1),
      createOrderedManifest("two", 2),
      createOrderedManifest("three", 3),
      createOrderedManifest("four", 4),
      createOrderedManifest("five", 5)
    ]);

    expect(getMobileWebspringGrid(AppRegistry.getAllApps(), { width: 480 }).columns).toBe(5);
    expect(getMobileWebspringGrid(AppRegistry.getAllApps(), { width: 360 }).columns).toBe(4);
    expect(getMobileWebspringGrid(AppRegistry.getAllApps(), { width: 480 }).slots.at(-1)).toMatchObject({
      appId: "five",
      row: 0,
      column: 4
    });
  });

  it("limits the desktop dial to seven apps and places overflow deterministically", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    AppRegistry.registerMany(Array.from({ length: 9 }, (_unused, index) =>
      createOrderedManifest(`app-${index + 1}`, index + 1)
    ));

    const desktop = getDesktopWebspringSlots(AppRegistry.getAllApps());

    expect(desktop.dialSlots).toHaveLength(DESKTOP_DIAL_APP_LIMIT);
    expect(desktop.overflowSlots.map((slot) => slot.appId)).toEqual(["app-8", "app-9"]);
    expect(desktop.dialSlots.map((slot) => slot.angle)).not.toContain(998);
    expect(desktop.overflowSlots[0]).toMatchObject({
      region: "overflow",
      angle: null,
      indicatorPosition: null
    });
  });

  it("moves apps by pointer index and keyboard grid intent", () => {
    const order = ["alpha", "beta", "gamma", "delta"];

    expect(moveWebspringAppToIndex(order, "alpha", 2)).toEqual(["beta", "gamma", "alpha", "delta"]);
    expect(getKeyboardReorderIndex(order, "alpha", "ArrowDown", 2)).toBe(2);
    expect(getKeyboardReorderIndex(order, "delta", "End", 2)).toBe(3);
  });

  it("projects the canonical order into a versioned stable dock and pages", () => {
    const apps = Array.from({ length: 11 }, (_unused, index) => ({ id: `app-${index + 1}` }));
    const projection = createWebspringBoardProjection(apps, { dockSize: 3, pageSize: 4 });

    expect(projection.version).toBe(WEBSPRING_BOARD_PROJECTION_VERSION);
    expect(projection.dock.map((app) => app.id)).toEqual(["app-1", "app-2", "app-3"]);
    expect(projection.pages.map((page) => page.map((app) => app.id))).toEqual([
      ["app-4", "app-5", "app-6", "app-7"],
      ["app-8", "app-9", "app-10", "app-11"],
    ]);
    expect(projection.order).toEqual(apps.map((app) => app.id));
  });

  it("targets the nearest Webspring slot during pointer drag", () => {
    const candidates = [
      { appId: "alpha", index: 0, rect: { left: 0, top: 0, width: 80, height: 96 } },
      { appId: "beta", index: 1, rect: { left: 96, top: 0, width: 80, height: 96 } },
      { appId: "gamma", index: 2, rect: { left: 192, top: 0, width: 80, height: 96 } }
    ];

    expect(getWebspringDragReorderTarget(candidates, { x: 40, y: 48 }, "alpha")).toBeNull();
    expect(getWebspringDragReorderTarget(candidates, { x: 132, y: 48 }, "alpha")).toEqual({
      appId: "beta",
      targetIndex: 1
    });
    expect(getWebspringDragReorderTarget(candidates, { x: 232, y: 48 }, "alpha")).toEqual({
      appId: "gamma",
      targetIndex: 2
    });
  });
});

describe("WebspringState layout preference persistence", () => {
  it("persists committed order, suppresses launch in edit mode, and resets to manifest order", async () => {
    const { AppRegistry, RuntimeController, SynCloudOS } = createRuntimeHarness(createBrowserPersistenceRuntime());
    const { WebspringState } = SynCloudOS;
    AppRegistry.registerMany([
      createOrderedManifest("alpha", 1),
      createOrderedManifest("beta", 2),
      createOrderedManifest("gamma", 3)
    ]);

    WebspringState.hydrateLayoutPreference();
    WebspringState.resetLayoutOrder();
    WebspringState.startDraggingApp("gamma");

    expect(RuntimeController.getSnapshot().webspring.layout).toMatchObject({
      isEditing: true,
      draggingAppId: "gamma"
    });
    expect("layoutOrder" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect("editMode" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect("draggingAppId" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect(WebspringState.isLaunchSuppressed()).toBe(true);

    expect(WebspringState.reorderApp("gamma", 0, false)).toBe(true);
    expect(AppRegistry.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha", "beta"]);
    WebspringState.finishDraggingApp(false);
    expect(RuntimeController.getSnapshot().webspring.layout.preference.order).toEqual(["alpha", "beta", "gamma"]);
    expect(AppRegistry.getDisplayApps().map((app) => app.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toBeNull();

    WebspringState.startDraggingApp("gamma");
    expect(WebspringState.reorderApp("gamma", 0, false)).toBe(true);
    WebspringState.finishDraggingApp(true);
    expect(AppRegistry.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha", "beta"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toContain("gamma");

    WebspringState.resetLayoutOrder();

    expect(AppRegistry.getDisplayApps().map((app) => app.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toBeNull();
  });
  it("finishes an active drag when edit mode closes without leaking its rollback into the next drag", () => {
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([
      createOrderedManifest("alpha", 1),
      createOrderedManifest("beta", 2),
      createOrderedManifest("gamma", 3),
    ]);
    runtime.webspring.resetLayoutOrder();
    runtime.webspring.beginDrag("gamma");
    runtime.webspring.reorderApp("gamma", 0, false);
    runtime.webspring.exitEditMode(true);
    expect(runtime.store.getSnapshot().webspring.layout).toMatchObject({ isEditing: false, draggingAppId: null });
    runtime.webspring.beginDrag("alpha");
    runtime.webspring.reorderApp("alpha", 0, false);
    runtime.webspring.endDrag(false);
    expect(runtime.apps.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha", "beta"]);
    runtime.webspring.hydrateLayoutPreference();
    expect(runtime.apps.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha", "beta"]);
  });
});

describe("Webspring canonical layout preference projection", () => {
  it("reads and validates a canonical v3 value without changing board settings", () => {
    const fake = createProjectionPersistence({
      version: 3,
      order: ["gamma", "gamma", "alpha", ""],
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    });

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toMatchObject({
      source: "webspring",
      preference: {
        version: 3,
        order: ["gamma", "alpha"],
        board: { version: 1, pageSize: 12, dockSize: 5 },
        updatedAt: 20,
        source: "persisted"
      }
    });
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it("seeds an empty v3 preference when canonical storage is absent", () => {
    const fake = createProjectionPersistence();

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toEqual({
      source: "seed",
      preference: {
        version: 3,
        order: [],
        board: { version: 1, pageSize: 20, dockSize: 4 },
        updatedAt: null,
        source: "seed"
      }
    });
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it("normalises malformed canonical data without writing a replacement", () => {
    const fake = createProjectionPersistence(["duplicate", "duplicate"]);

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toEqual({
      source: "webspring",
      preference: {
        version: 3,
        order: [],
        board: { version: 1, pageSize: 20, dockSize: 4 },
        updatedAt: null,
        source: "seed"
      }
    });
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it("hydrates canonical v3 preferences through runtime state repeatedly", () => {
    window.localStorage.setItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`, JSON.stringify({
      version: 3,
      order: ["gamma", "alpha"],
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    }));
    const { AppRegistry, SynCloudOS } = createRuntimeHarness(createBrowserPersistenceRuntime());
    AppRegistry.registerMany([
      createOrderedManifest("alpha", 1),
      createOrderedManifest("gamma", 2)
    ]);

    const first = SynCloudOS.WebspringState.hydrateLayoutPreference();
    const second = SynCloudOS.WebspringState.hydrateLayoutPreference();

    expect(first).toMatchObject({
      version: 3,
      order: ["gamma", "alpha"],
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    });
    expect(second).toEqual(first);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toContain('"version":3');
  });
});
