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
  WEBSPRING_BOARD_PROJECTION_VERSION,
  createWebspringBoardProjection,
} from "../../src/Webspring/webspringLayout";
import {
  DESKTOP_DIAL_ITEM_LIMIT,
  EMPTY_WEBSPRING_FOLDER_CONFIGURATION,
  WEBSPRING_LAYOUT_PREFERENCE_KEY,
  createWebspringFolderId,
  getDesktopWebspringSlots,
  getKeyboardReorderIndex,
  moveWebspringEntryToIndex,
  readWebspringLayoutPreference,
  reconcileWebspringLayout,
} from "../../src/SynCloudOS/WebspringState/webspringStateProjection";
import type { WebspringLayoutInput, WebspringLayoutPersistence } from "../../src/SynCloudOS/WebspringState/webspringStateProjection";
import type { RuntimeSnapshot } from "../../src/SynCloudOS/SynCloudOS";
import type { SynCloudOSWebspringFolderConfiguration } from "../../src/SynCloudOS/WebspringState/webspringStateTypes";
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
    bundleIdentifier: id,
    route: `/${id.split(".").at(-1)}`,
    webspring: {
      visible,
      order,
      dialPosition: 999 - order,
      selectorAngle: 999 - order
    }
  });
}

function registerApps(...entries: [string, number, boolean?][]) {
  const { AppRegistry } = createRuntimeHarness(createTestRuntime());
  AppRegistry.registerMany(entries.map(([id, order, visible]) => createOrderedManifest(id, order, visible)));
  return AppRegistry.getAllApps();
}

function folders(editable: boolean, ...initial: [string, number, string[]][]): SynCloudOSWebspringFolderConfiguration {
  return { editable, initial: initial.map(([id, order, apps]) => ({ id, order, apps })) };
}

function userLayout(order: string[], layoutFolders: Record<string, string[]>): WebspringLayoutInput {
  return {
    order,
    folders: Object.fromEntries(Object.entries(layoutFolders).map(([id, apps]) => [id, { apps }])),
    source: "user",
  };
}

const persisted = (order: string[]): WebspringLayoutInput => ({ order, folders: {}, source: "persisted" });

describe("Webspring layout helpers", () => {
  it("seeds order from visible manifest order and reconciles persisted preferences", () => {
    const apps = registerApps(["com.example.alpha", 20], ["com.example.beta", 5], ["com.example.hidden", 1, false], ["com.example.gamma", 30]);

    expect(reconcileWebspringLayout(apps, null, EMPTY_WEBSPRING_FOLDER_CONFIGURATION).order).toEqual(["com.example.beta", "com.example.alpha", "com.example.gamma"]);
    expect(reconcileWebspringLayout(apps, persisted(["com.example.missing", "com.example.gamma", "com.example.gamma", "com.example.beta"]), EMPTY_WEBSPRING_FOLDER_CONFIGURATION).order).toEqual([
      "com.example.gamma",
      "com.example.beta",
      "com.example.alpha"
    ]);
  });

  it("limits the desktop dial to seven entries and places overflow deterministically", () => {
    const desktop = getDesktopWebspringSlots(Array.from({ length: 9 }, (_unused, index) => `app-${index + 1}`));

    expect(desktop.dialSlots).toHaveLength(DESKTOP_DIAL_ITEM_LIMIT);
    expect(desktop.overflowSlots.map((slot) => slot.id)).toEqual(["app-8", "app-9"]);
    expect(desktop.overflowSlots[0]).toMatchObject({
      region: "overflow",
      index: 7,
      angle: null,
      indicatorPosition: null
    });
  });

  it("moves entries by pointer index and keyboard grid intent", () => {
    const order = ["com.example.alpha", "com.example.beta", "com.example.gamma", "com.example.delta"];

    expect(moveWebspringEntryToIndex(order, "com.example.alpha", 2)).toEqual(["com.example.beta", "com.example.gamma", "com.example.alpha", "com.example.delta"]);
    expect(getKeyboardReorderIndex(order, "com.example.alpha", "ArrowDown", 2)).toBe(2);
    expect(getKeyboardReorderIndex(order, "com.example.delta", "End", 2)).toBe(3);
  });

  it("names user folders in the folder namespace", () => {
    expect(createWebspringFolderId(36 ** 3, () => 0.5)).toMatch(/^folder\.user-[a-z0-9]+$/u);
    expect(createWebspringFolderId(1, () => 0.1)).not.toBe(createWebspringFolderId(1, () => 0.2));
  });

  it("projects the canonical order into a versioned stable dock and pages", () => {
    const apps = Array.from({ length: 11 }, (_unused, index) => ({ id: `app-${index + 1}` }));
    const projection = createWebspringBoardProjection(apps, { dockSize: 3, pageSize: 4 });

    expect(projection.version).toBe(WEBSPRING_BOARD_PROJECTION_VERSION);
    expect(projection.dock.map((item) => item.id)).toEqual(["app-1", "app-2", "app-3"]);
    expect(projection.pages.map((page) => page.map((item) => item.id))).toEqual([
      ["app-4", "app-5", "app-6", "app-7"],
      ["app-8", "app-9", "app-10", "app-11"],
    ]);
    expect(projection.order).toEqual(apps.map((item) => item.id));
  });

  it("targets the nearest Webspring slot during pointer drag", () => {
    const candidates = [
      { itemId: "com.example.alpha", index: 0, rect: { left: 0, top: 0, width: 80, height: 96 } },
      { itemId: "com.example.beta", index: 1, rect: { left: 96, top: 0, width: 80, height: 96 } },
      { itemId: "com.example.gamma", index: 2, rect: { left: 192, top: 0, width: 80, height: 96 } }
    ];

    expect(getWebspringDragReorderTarget(candidates, { x: 40, y: 48 }, "com.example.alpha")).toBeNull();
    expect(getWebspringDragReorderTarget(candidates, { x: 132, y: 48 }, "com.example.alpha")).toEqual({
      itemId: "com.example.beta",
      targetIndex: 1
    });
    expect(getWebspringDragReorderTarget(candidates, { x: 232, y: 48 }, "com.example.alpha")).toEqual({
      itemId: "com.example.gamma",
      targetIndex: 2
    });
  });
});

describe("Webspring folder reconciliation", () => {
  const apps = () => registerApps(["com.example.alpha", 1], ["com.example.beta", 2], ["com.example.gamma", 3], ["com.example.delta", 4]);
  const tools = folders(true, ["folder.tools", 2, ["com.example.beta", "com.example.delta"]]);

  it("seeds manifest folders among the apps by order, folders first on a tie", () => {
    const projection = reconcileWebspringLayout(apps(), null, tools);

    expect(projection).toEqual({
      order: ["com.example.alpha", "folder.tools", "com.example.gamma"],
      folders: { "folder.tools": ["com.example.beta", "com.example.delta"] },
      appOrder: ["com.example.alpha", "com.example.beta", "com.example.delta", "com.example.gamma"],
      folderOfApp: { "com.example.beta": "folder.tools", "com.example.delta": "folder.tools" },
    });
    expect(reconcileWebspringLayout(apps(), null, folders(true, ["folder.tools", 1, ["com.example.beta"]])).order)
      .toEqual(["folder.tools", "com.example.alpha", "com.example.gamma", "com.example.delta"]);
  });

  it("takes editable membership from a visitor's layout", () => {
    const projection = reconcileWebspringLayout(apps(), userLayout(
      ["com.example.gamma", "folder.user-x", "com.example.alpha"],
      { "folder.user-x": ["com.example.alpha", "com.example.beta"], "folder.tools": ["com.example.delta"] },
    ), tools);

    expect(projection.order).toEqual(["com.example.gamma", "folder.user-x", "folder.tools"]);
    expect(projection.folders).toEqual({ "folder.user-x": ["com.example.alpha", "com.example.beta"], "folder.tools": ["com.example.delta"] });
  });

  it("keeps fixed membership from the manifest and only the order from a visitor", () => {
    const fixed = folders(false, ["folder.tools", 2, ["com.example.beta", "com.example.delta"]]);
    const projection = reconcileWebspringLayout(apps(), userLayout(
      ["com.example.gamma", "folder.tools", "com.example.alpha"],
      { "folder.user-x": ["com.example.alpha", "com.example.gamma"] },
    ), fixed);

    expect(projection.order).toEqual(["com.example.gamma", "folder.tools", "com.example.alpha"]);
    expect(projection.folders).toEqual({ "folder.tools": ["com.example.beta", "com.example.delta"] });
  });

  it("gives an app listed twice to the first folder in display order and drops emptied folders", () => {
    const projection = reconcileWebspringLayout(apps(), userLayout(
      ["folder.b", "folder.a", "com.example.alpha", "com.example.delta"],
      { "folder.a": ["com.example.beta"], "folder.b": ["com.example.beta", "com.example.gamma"] },
    ), folders(true));

    expect(projection.order).toEqual(["folder.b", "com.example.alpha", "com.example.delta"]);
    expect(projection.folders).toEqual({ "folder.b": ["com.example.beta", "com.example.gamma"] });
  });

  it("places new apps in their surviving manifest folder, otherwise at the top level", () => {
    const projection = reconcileWebspringLayout(
      registerApps(["com.example.alpha", 1], ["com.example.beta", 2], ["com.example.gamma", 3], ["com.example.epsilon", 0], ["com.example.zeta", 5]),
      userLayout(["com.example.alpha", "folder.tools", "com.example.gamma"], { "folder.tools": ["com.example.beta"] }),
      folders(true, ["folder.tools", 2, ["com.example.beta", "com.example.epsilon"]], ["folder.gone", 6, ["com.example.zeta"]]),
    );

    expect(projection.order).toEqual(["com.example.alpha", "folder.tools", "com.example.gamma", "com.example.zeta"]);
    expect(projection.folders).toEqual({ "folder.tools": ["com.example.beta", "com.example.epsilon"] });
  });

  it("treats folder IDs that name Object.prototype members as ordinary IDs", () => {
    const projection = reconcileWebspringLayout(
      registerApps(["com.example.constructor", 1], ["com.example.alpha", 2], ["com.example.beta", 3]),
      userLayout(["com.example.constructor", "toString"], { toString: ["com.example.alpha", "com.example.beta"] }),
      folders(true),
    );

    expect(projection.order).toEqual(["com.example.constructor", "toString"]);
    expect(projection.appOrder).toEqual(["com.example.constructor", "com.example.alpha", "com.example.beta"]);
    expect(projection.folders.toString).toEqual(["com.example.alpha", "com.example.beta"]);
    expect(projection.folderOfApp["com.example.alpha"]).toBe("toString");
    expect(projection.folderOfApp.constructor).toBeUndefined();
    expect(projection.folderOfApp.toString).toBeUndefined();
  });

  it("omits folders whose members are all hidden", () => {
    const projection = reconcileWebspringLayout(
      registerApps(["com.example.alpha", 1], ["com.example.beta", 2, false]),
      null,
      folders(true, ["folder.hidden", 1, ["com.example.beta"]]),
    );

    expect(projection.order).toEqual(["com.example.alpha"]);
    expect(projection.folders).toEqual({});
  });
});

describe("WebspringState layout preference persistence", () => {
  it("persists committed order, suppresses launch in edit mode, and resets to manifest order", () => {
    const { AppRegistry, RuntimeController, SynCloudOS } = createRuntimeHarness(createBrowserPersistenceRuntime());
    const { WebspringState } = SynCloudOS;
    AppRegistry.registerMany([
      createOrderedManifest("com.example.alpha", 1),
      createOrderedManifest("com.example.beta", 2),
      createOrderedManifest("com.example.gamma", 3)
    ]);

    WebspringState.hydrateLayoutPreference();
    WebspringState.resetLayoutOrder();
    WebspringState.enterEditMode("com.example.gamma");
    WebspringState.beginDrag("com.example.gamma");

    expect(RuntimeController.getSnapshot().webspring.layout).toMatchObject({
      isEditing: true,
      draggingItemId: "com.example.gamma"
    });
    expect("layoutOrder" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect("editMode" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect("draggingItemId" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect(WebspringState.isLaunchSuppressed()).toBe(true);

    expect(WebspringState.moveItem("com.example.gamma", 0, false)).toBe(true);
    expect(AppRegistry.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.gamma", "com.example.alpha", "com.example.beta"]);
    WebspringState.finishDrag(false);
    expect(RuntimeController.getSnapshot().webspring.layout.preference.order).toEqual(["com.example.alpha", "com.example.beta", "com.example.gamma"]);
    expect(AppRegistry.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.alpha", "com.example.beta", "com.example.gamma"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toBeNull();

    WebspringState.beginDrag("com.example.gamma");
    expect(WebspringState.moveItem("com.example.gamma", 0, false)).toBe(true);
    WebspringState.finishDrag(true);
    expect(AppRegistry.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.gamma", "com.example.alpha", "com.example.beta"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toContain("com.example.gamma");

    WebspringState.resetLayoutOrder();

    expect(AppRegistry.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.alpha", "com.example.beta", "com.example.gamma"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toBeNull();
  });

  it("finishes an active drag when edit mode closes without leaking its rollback into the next drag", () => {
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([
      createOrderedManifest("com.example.alpha", 1),
      createOrderedManifest("com.example.beta", 2),
      createOrderedManifest("com.example.gamma", 3),
    ]);
    runtime.webspring.resetLayoutOrder();
    runtime.webspring.beginDrag("com.example.gamma");
    runtime.webspring.moveItem("com.example.gamma", 0, false);
    runtime.webspring.exitEditMode(true);
    expect(runtime.store.getSnapshot().webspring.layout).toMatchObject({ isEditing: false, draggingItemId: null });
    runtime.webspring.beginDrag("com.example.alpha");
    runtime.webspring.moveItem("com.example.alpha", 0, false);
    runtime.webspring.finishDrag(false);
    expect(runtime.apps.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.gamma", "com.example.alpha", "com.example.beta"]);
    runtime.webspring.hydrateLayoutPreference();
    expect(runtime.apps.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.gamma", "com.example.alpha", "com.example.beta"]);
  });

  it("refuses a top-level reorder that is not a permutation of the entries", () => {
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([createOrderedManifest("com.example.alpha", 1), createOrderedManifest("com.example.beta", 2)]);
    runtime.webspring.resetLayoutOrder();

    expect(runtime.webspring.reorder(["com.example.alpha"])).toBe(false);
    expect(runtime.webspring.reorder(["com.example.alpha", "com.example.alpha"])).toBe(false);
    expect(runtime.webspring.reorder(["com.example.beta", "com.example.alpha"])).toBe(true);
    expect(runtime.apps.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.beta", "com.example.alpha"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toContain("\"order\":[\"com.example.beta\",\"com.example.alpha\"]");
  });
});

describe("WebspringState folder actions", () => {
  function createFolderRuntime(configuration: SynCloudOSWebspringFolderConfiguration) {
    window.localStorage.clear();
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([
      createOrderedManifest("com.example.alpha", 1),
      createOrderedManifest("com.example.beta", 2),
      createOrderedManifest("com.example.gamma", 3),
    ]);
    runtime.webspring.configureFolders(configuration);
    runtime.webspring.hydrateLayoutPreference();
    return runtime;
  }
  const layout = (runtime: { store: { getSnapshot(): RuntimeSnapshot } }) => runtime.store.getSnapshot().webspring.layout.preference;
  const stored = () => window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`);

  it("creates a folder by dropping an app on an app, then adds, moves out and deletes when emptied", () => {
    const runtime = createFolderRuntime(folders(true));

    expect(runtime.webspring.dropOnItem("com.example.gamma", "com.example.alpha")).toBe(true);
    const [folderId] = layout(runtime).order;
    expect(folderId).toMatch(/^folder\.user-/u);
    expect(layout(runtime)).toMatchObject({ order: [folderId, "com.example.beta"], folders: { [folderId]: { apps: ["com.example.alpha", "com.example.gamma"] } } });
    expect(stored()).toContain(folderId);

    expect(runtime.webspring.dropOnItem("com.example.beta", folderId)).toBe(true);
    expect(layout(runtime)).toMatchObject({ order: [folderId], folders: { [folderId]: { apps: ["com.example.alpha", "com.example.gamma", "com.example.beta"] } } });
    expect(runtime.apps.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.alpha", "com.example.gamma", "com.example.beta"]);

    expect(runtime.webspring.openFolder(folderId)).toBe(true);
    expect(runtime.webspring.moveAppOutOfFolder("com.example.alpha", 1)).toBe(true);
    expect(layout(runtime)).toMatchObject({ order: [folderId, "com.example.alpha"], folders: { [folderId]: { apps: ["com.example.gamma", "com.example.beta"] } } });
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBe(folderId);

    runtime.webspring.moveAppOutOfFolder("com.example.gamma", 0);
    runtime.webspring.moveAppOutOfFolder("com.example.beta", 0);
    expect(layout(runtime).order).toEqual(["com.example.beta", "com.example.gamma", "com.example.alpha"]);
    expect(layout(runtime).folders).toEqual({});
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();
    expect(stored()).not.toContain(folderId);
  });

  it("merges on drop during a drag and commits or reverts with the drag", () => {
    const runtime = createFolderRuntime(folders(true));
    runtime.webspring.enterEditMode("com.example.gamma");
    runtime.webspring.beginDrag("com.example.gamma");
    runtime.webspring.setDropTarget("com.example.alpha");
    expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBe("com.example.alpha");

    expect(runtime.webspring.dropOnItem("com.example.gamma", "com.example.alpha")).toBe(true);
    expect(stored()).toBeNull();
    runtime.webspring.finishDrag(false);
    expect(layout(runtime).order).toEqual(["com.example.alpha", "com.example.beta", "com.example.gamma"]);

    runtime.webspring.beginDrag("com.example.gamma");
    runtime.webspring.dropOnItem("com.example.gamma", "com.example.alpha");
    runtime.webspring.finishDrag(true);
    expect(runtime.store.getSnapshot().webspring.layout).toMatchObject({ draggingItemId: null, dropTargetId: null });
    expect(Object.values(layout(runtime).folders)).toEqual([{ apps: ["com.example.alpha", "com.example.gamma"] }]);
    expect(stored()).toContain("\"apps\":[\"com.example.alpha\",\"com.example.gamma\"]");
  });

  it("does not merge folders or accept a dragged folder as a drop", () => {
    const runtime = createFolderRuntime(folders(true, ["folder.tools", 2, ["com.example.beta", "com.example.gamma"]]));
    runtime.webspring.beginDrag("folder.tools");
    runtime.webspring.setDropTarget("com.example.alpha");

    expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBeNull();
    expect(runtime.webspring.dropOnItem("folder.tools", "com.example.alpha")).toBe(false);
    expect(runtime.webspring.moveItem("folder.tools", 0)).toBe(true);
    runtime.webspring.finishDrag(true);
    expect(layout(runtime).order).toEqual(["folder.tools", "com.example.alpha"]);
  });

  it("refuses membership changes when folders are fixed", () => {
    const runtime = createFolderRuntime(folders(false, ["folder.tools", 2, ["com.example.beta", "com.example.gamma"]]));

    expect(runtime.webspring.dropOnItem("com.example.alpha", "folder.tools")).toBe(false);
    expect(runtime.webspring.moveAppOutOfFolder("com.example.beta", 0)).toBe(false);
    expect(runtime.webspring.moveItem("com.example.gamma", 0)).toBe(false);
    runtime.webspring.beginDrag("com.example.alpha");
    runtime.webspring.setDropTarget("folder.tools");
    expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBeNull();
    expect(runtime.webspring.moveItem("com.example.alpha", 1)).toBe(true);
    runtime.webspring.finishDrag(true);
    expect(layout(runtime).order).toEqual(["folder.tools", "com.example.alpha"]);
    expect(reconcileWebspringLayout(runtime.apps.getAllApps(), layout(runtime), runtime.store.getSnapshot().webspring.layout.folderConfiguration).folders)
      .toEqual({ "folder.tools": ["com.example.beta", "com.example.gamma"] });
  });

  it("merges into and out of an app whose ID names an Object.prototype member", () => {
    window.localStorage.clear();
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([createOrderedManifest("com.example.constructor", 1), createOrderedManifest("com.example.alpha", 2)]);
    runtime.webspring.configureFolders(folders(true));
    runtime.webspring.hydrateLayoutPreference();

    expect(runtime.webspring.openFolder("com.example.constructor")).toBe(false);
    expect(runtime.webspring.moveItem("com.example.constructor", 1)).toBe(true);
    expect(runtime.webspring.dropOnItem("com.example.alpha", "com.example.constructor")).toBe(true);
    const [folderId] = layout(runtime).order;
    expect(layout(runtime).folders[folderId]).toEqual({ apps: ["com.example.constructor", "com.example.alpha"] });
    expect(runtime.webspring.moveAppOutOfFolder("com.example.constructor", 0)).toBe(true);
    expect(layout(runtime).order).toEqual(["com.example.constructor", folderId]);
    expect(runtime.apps.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.constructor", "com.example.alpha"]);
  });

  it("opens one folder at a time, and during a drag only when the drag asks", () => {
    const runtime = createFolderRuntime(folders(true, ["folder.tools", 2, ["com.example.beta", "com.example.gamma"]]));

    expect(runtime.webspring.openFolder("com.example.alpha")).toBe(false);
    runtime.webspring.beginDrag("com.example.alpha");
    expect(runtime.webspring.openFolder("folder.tools")).toBe(false);
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();
    // The spring-open under a resting app is the one drag that may open a folder.
    expect(runtime.webspring.openFolder("folder.tools", { duringDrag: true })).toBe(true);
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBe("folder.tools");
    runtime.webspring.closeFolder();
    runtime.webspring.finishDrag(false);
    expect(runtime.webspring.openFolder("folder.tools")).toBe(true);
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBe("folder.tools");
    runtime.webspring.closeFolder();
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();
  });
});

describe("Webspring canonical layout preference projection", () => {
  it("resets old identifier layouts instead of reading or migrating the v4 key", () => {
    const keys: string[] = [];
    const old = { version: 4, order: ["gamma", "alpha"], folders: {}, board: { version: 1, pageSize: 12, dockSize: 5 }, updatedAt: 20, source: "persisted" };
    const persistence: WebspringLayoutPersistence = {
      getPreference<T>(key: string, fallback: T) {
        keys.push(key);
        return key === "webspring.layout.v4" ? old as T : fallback;
      },
    };
    expect(WEBSPRING_LAYOUT_PREFERENCE_KEY).toBe("webspring.layout.v5");
    expect(readWebspringLayoutPreference(persistence)).toMatchObject({ source: "seed", preference: { version: 5, order: [], folders: {} } });
    expect(keys).toEqual(["webspring.layout.v5"]);
    expect(old.order).toEqual(["gamma", "alpha"]);
  });
  it("reads and validates a canonical v5 value without changing board settings", () => {
    const fake = createProjectionPersistence({
      version: 5,
      order: ["com.example.gamma", "com.example.gamma", "com.example.alpha", ""],
      folders: { "folder.user-a": { apps: ["com.example.beta", "com.example.beta"] }, "": { apps: ["x"] }, broken: ["x"] },
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    });

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toMatchObject({
      source: "webspring",
      preference: {
        version: 5,
        order: ["com.example.gamma", "com.example.alpha"],
        folders: { "folder.user-a": { apps: ["com.example.beta"] } },
        board: { version: 1, pageSize: 12, dockSize: 5 },
        updatedAt: 20,
        source: "persisted"
      }
    });
    expect(Object.keys(result.preference.folders)).toEqual(["folder.user-a"]);
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it("seeds an empty v5 preference when canonical storage is absent", () => {
    const fake = createProjectionPersistence();

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toEqual({
      source: "seed",
      preference: {
        version: 5,
        order: [],
        folders: {},
        board: { version: 1, pageSize: 20, dockSize: 4 },
        updatedAt: null,
        source: "seed"
      }
    });
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it.each([
    ["malformed data", ["duplicate", "duplicate"]],
    ["another version", { version: 3, order: ["com.example.gamma"], board: { version: 1, pageSize: 12, dockSize: 5 }, updatedAt: 20, source: "persisted" }],
    ["previous identity layout", { version: 4, order: ["gamma", "alpha"], folders: {}, board: { version: 1, pageSize: 12, dockSize: 5 }, updatedAt: 20, source: "persisted" }],
  ])("ignores %s without writing a replacement", (_label, value) => {
    const fake = createProjectionPersistence(value);

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toEqual({
      source: "webspring",
      preference: {
        version: 5,
        order: [],
        folders: {},
        board: { version: 1, pageSize: 20, dockSize: 4 },
        updatedAt: null,
        source: "seed"
      }
    });
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it("hydrates canonical v5 preferences through runtime state repeatedly", () => {
    window.localStorage.setItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`, JSON.stringify({
      version: 5,
      order: ["com.example.gamma", "com.example.alpha"],
      folders: {},
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    }));
    const { AppRegistry, SynCloudOS } = createRuntimeHarness(createBrowserPersistenceRuntime());
    AppRegistry.registerMany([
      createOrderedManifest("com.example.alpha", 1),
      createOrderedManifest("com.example.gamma", 2)
    ]);

    const first = SynCloudOS.WebspringState.hydrateLayoutPreference();
    const second = SynCloudOS.WebspringState.hydrateLayoutPreference();

    expect(first).toMatchObject({
      version: 5,
      order: ["com.example.gamma", "com.example.alpha"],
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    });
    expect(second).toEqual(first);
    expect(AppRegistry.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.gamma", "com.example.alpha"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toContain("\"version\":5");
  });
});
