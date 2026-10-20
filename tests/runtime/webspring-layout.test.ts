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
    const apps = registerApps(["alpha", 20], ["beta", 5], ["hidden", 1, false], ["gamma", 30]);

    expect(reconcileWebspringLayout(apps, null, EMPTY_WEBSPRING_FOLDER_CONFIGURATION).order).toEqual(["beta", "alpha", "gamma"]);
    expect(reconcileWebspringLayout(apps, persisted(["missing", "gamma", "gamma", "beta"]), EMPTY_WEBSPRING_FOLDER_CONFIGURATION).order).toEqual([
      "gamma",
      "beta",
      "alpha"
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
    const order = ["alpha", "beta", "gamma", "delta"];

    expect(moveWebspringEntryToIndex(order, "alpha", 2)).toEqual(["beta", "gamma", "alpha", "delta"]);
    expect(getKeyboardReorderIndex(order, "alpha", "ArrowDown", 2)).toBe(2);
    expect(getKeyboardReorderIndex(order, "delta", "End", 2)).toBe(3);
  });

  it("names user folders in the folder namespace", () => {
    expect(createWebspringFolderId(36 ** 3, () => 0.5)).toMatch(/^folder\.user-[a-z0-9]+$/u);
    expect(createWebspringFolderId(1, () => 0.1)).not.toBe(createWebspringFolderId(1, () => 0.2));
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
      { itemId: "alpha", index: 0, rect: { left: 0, top: 0, width: 80, height: 96 } },
      { itemId: "beta", index: 1, rect: { left: 96, top: 0, width: 80, height: 96 } },
      { itemId: "gamma", index: 2, rect: { left: 192, top: 0, width: 80, height: 96 } }
    ];

    expect(getWebspringDragReorderTarget(candidates, { x: 40, y: 48 }, "alpha")).toBeNull();
    expect(getWebspringDragReorderTarget(candidates, { x: 132, y: 48 }, "alpha")).toEqual({
      itemId: "beta",
      targetIndex: 1
    });
    expect(getWebspringDragReorderTarget(candidates, { x: 232, y: 48 }, "alpha")).toEqual({
      itemId: "gamma",
      targetIndex: 2
    });
  });
});

describe("Webspring folder reconciliation", () => {
  const apps = () => registerApps(["alpha", 1], ["beta", 2], ["gamma", 3], ["delta", 4]);
  const tools = folders(true, ["folder.tools", 2, ["beta", "delta"]]);

  it("seeds manifest folders among the apps by order, folders first on a tie", () => {
    const projection = reconcileWebspringLayout(apps(), null, tools);

    expect(projection).toEqual({
      order: ["alpha", "folder.tools", "gamma"],
      folders: { "folder.tools": ["beta", "delta"] },
      appOrder: ["alpha", "beta", "delta", "gamma"],
      folderOfApp: { beta: "folder.tools", delta: "folder.tools" },
    });
    expect(reconcileWebspringLayout(apps(), null, folders(true, ["folder.tools", 1, ["beta"]])).order)
      .toEqual(["folder.tools", "alpha", "gamma", "delta"]);
  });

  it("takes editable membership from a visitor's layout", () => {
    const projection = reconcileWebspringLayout(apps(), userLayout(
      ["gamma", "folder.user-x", "alpha"],
      { "folder.user-x": ["alpha", "beta"], "folder.tools": ["delta"] },
    ), tools);

    expect(projection.order).toEqual(["gamma", "folder.user-x", "folder.tools"]);
    expect(projection.folders).toEqual({ "folder.user-x": ["alpha", "beta"], "folder.tools": ["delta"] });
  });

  it("keeps fixed membership from the manifest and only the order from a visitor", () => {
    const fixed = folders(false, ["folder.tools", 2, ["beta", "delta"]]);
    const projection = reconcileWebspringLayout(apps(), userLayout(
      ["gamma", "folder.tools", "alpha"],
      { "folder.user-x": ["alpha", "gamma"] },
    ), fixed);

    expect(projection.order).toEqual(["gamma", "folder.tools", "alpha"]);
    expect(projection.folders).toEqual({ "folder.tools": ["beta", "delta"] });
  });

  it("gives an app listed twice to the first folder in display order and drops emptied folders", () => {
    const projection = reconcileWebspringLayout(apps(), userLayout(
      ["folder.b", "folder.a", "alpha", "delta"],
      { "folder.a": ["beta"], "folder.b": ["beta", "gamma"] },
    ), folders(true));

    expect(projection.order).toEqual(["folder.b", "alpha", "delta"]);
    expect(projection.folders).toEqual({ "folder.b": ["beta", "gamma"] });
  });

  it("places new apps in their surviving manifest folder, otherwise at the top level", () => {
    const projection = reconcileWebspringLayout(
      registerApps(["alpha", 1], ["beta", 2], ["gamma", 3], ["epsilon", 0], ["zeta", 5]),
      userLayout(["alpha", "folder.tools", "gamma"], { "folder.tools": ["beta"] }),
      folders(true, ["folder.tools", 2, ["beta", "epsilon"]], ["folder.gone", 6, ["zeta"]]),
    );

    expect(projection.order).toEqual(["alpha", "folder.tools", "gamma", "zeta"]);
    expect(projection.folders).toEqual({ "folder.tools": ["beta", "epsilon"] });
  });

  it("treats app IDs that name Object.prototype members as ordinary IDs", () => {
    const projection = reconcileWebspringLayout(
      registerApps(["constructor", 1], ["toString", 2], ["alpha", 3]),
      userLayout(["constructor", "folder.user-x"], { "folder.user-x": ["toString", "alpha"] }),
      folders(true),
    );

    expect(projection.order).toEqual(["constructor", "folder.user-x"]);
    expect(projection.appOrder).toEqual(["constructor", "toString", "alpha"]);
    expect(projection.folderOfApp.constructor).toBeUndefined();
    expect(projection.folderOfApp.toString).toBe("folder.user-x");
  });

  it("omits folders whose members are all hidden", () => {
    const projection = reconcileWebspringLayout(
      registerApps(["alpha", 1], ["beta", 2, false]),
      null,
      folders(true, ["folder.hidden", 1, ["beta"]]),
    );

    expect(projection.order).toEqual(["alpha"]);
    expect(projection.folders).toEqual({});
  });
});

describe("WebspringState layout preference persistence", () => {
  it("persists committed order, suppresses launch in edit mode, and resets to manifest order", () => {
    const { AppRegistry, RuntimeController, SynCloudOS } = createRuntimeHarness(createBrowserPersistenceRuntime());
    const { WebspringState } = SynCloudOS;
    AppRegistry.registerMany([
      createOrderedManifest("alpha", 1),
      createOrderedManifest("beta", 2),
      createOrderedManifest("gamma", 3)
    ]);

    WebspringState.hydrateLayoutPreference();
    WebspringState.resetLayoutOrder();
    WebspringState.enterEditMode("gamma");
    WebspringState.beginDrag("gamma");

    expect(RuntimeController.getSnapshot().webspring.layout).toMatchObject({
      isEditing: true,
      draggingItemId: "gamma"
    });
    expect("layoutOrder" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect("editMode" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect("draggingItemId" in RuntimeController.getSnapshot().webspring).toBe(false);
    expect(WebspringState.isLaunchSuppressed()).toBe(true);

    expect(WebspringState.moveItem("gamma", 0, false)).toBe(true);
    expect(AppRegistry.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha", "beta"]);
    WebspringState.finishDrag(false);
    expect(RuntimeController.getSnapshot().webspring.layout.preference.order).toEqual(["alpha", "beta", "gamma"]);
    expect(AppRegistry.getDisplayApps().map((app) => app.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toBeNull();

    WebspringState.beginDrag("gamma");
    expect(WebspringState.moveItem("gamma", 0, false)).toBe(true);
    WebspringState.finishDrag(true);
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
    runtime.webspring.moveItem("gamma", 0, false);
    runtime.webspring.exitEditMode(true);
    expect(runtime.store.getSnapshot().webspring.layout).toMatchObject({ isEditing: false, draggingItemId: null });
    runtime.webspring.beginDrag("alpha");
    runtime.webspring.moveItem("alpha", 0, false);
    runtime.webspring.finishDrag(false);
    expect(runtime.apps.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha", "beta"]);
    runtime.webspring.hydrateLayoutPreference();
    expect(runtime.apps.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha", "beta"]);
  });

  it("refuses a top-level reorder that is not a permutation of the entries", () => {
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([createOrderedManifest("alpha", 1), createOrderedManifest("beta", 2)]);
    runtime.webspring.resetLayoutOrder();

    expect(runtime.webspring.reorder(["alpha"])).toBe(false);
    expect(runtime.webspring.reorder(["alpha", "alpha"])).toBe(false);
    expect(runtime.webspring.reorder(["beta", "alpha"])).toBe(true);
    expect(runtime.apps.getDisplayApps().map((app) => app.id)).toEqual(["beta", "alpha"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toContain("\"order\":[\"beta\",\"alpha\"]");
  });
});

describe("WebspringState folder actions", () => {
  function createFolderRuntime(configuration: SynCloudOSWebspringFolderConfiguration) {
    window.localStorage.clear();
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([
      createOrderedManifest("alpha", 1),
      createOrderedManifest("beta", 2),
      createOrderedManifest("gamma", 3),
    ]);
    runtime.webspring.configureFolders(configuration);
    runtime.webspring.hydrateLayoutPreference();
    return runtime;
  }
  const layout = (runtime: { store: { getSnapshot(): RuntimeSnapshot } }) => runtime.store.getSnapshot().webspring.layout.preference;
  const stored = () => window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`);

  it("creates a folder by dropping an app on an app, then adds, moves out and deletes when emptied", () => {
    const runtime = createFolderRuntime(folders(true));

    expect(runtime.webspring.dropOnItem("gamma", "alpha")).toBe(true);
    const [folderId] = layout(runtime).order;
    expect(folderId).toMatch(/^folder\.user-/u);
    expect(layout(runtime)).toMatchObject({ order: [folderId, "beta"], folders: { [folderId]: { apps: ["alpha", "gamma"] } } });
    expect(stored()).toContain(folderId);

    expect(runtime.webspring.dropOnItem("beta", folderId)).toBe(true);
    expect(layout(runtime)).toMatchObject({ order: [folderId], folders: { [folderId]: { apps: ["alpha", "gamma", "beta"] } } });
    expect(runtime.apps.getDisplayApps().map((app) => app.id)).toEqual(["alpha", "gamma", "beta"]);

    expect(runtime.webspring.openFolder(folderId)).toBe(true);
    expect(runtime.webspring.moveAppOutOfFolder("alpha", 1)).toBe(true);
    expect(layout(runtime)).toMatchObject({ order: [folderId, "alpha"], folders: { [folderId]: { apps: ["gamma", "beta"] } } });
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBe(folderId);

    runtime.webspring.moveAppOutOfFolder("gamma", 0);
    runtime.webspring.moveAppOutOfFolder("beta", 0);
    expect(layout(runtime).order).toEqual(["beta", "gamma", "alpha"]);
    expect(layout(runtime).folders).toEqual({});
    expect(runtime.store.getSnapshot().webspring.openFolderId).toBeNull();
    expect(stored()).not.toContain(folderId);
  });

  it("merges on drop during a drag and commits or reverts with the drag", () => {
    const runtime = createFolderRuntime(folders(true));
    runtime.webspring.enterEditMode("gamma");
    runtime.webspring.beginDrag("gamma");
    runtime.webspring.setDropTarget("alpha");
    expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBe("alpha");

    expect(runtime.webspring.dropOnItem("gamma", "alpha")).toBe(true);
    expect(stored()).toBeNull();
    runtime.webspring.finishDrag(false);
    expect(layout(runtime).order).toEqual(["alpha", "beta", "gamma"]);

    runtime.webspring.beginDrag("gamma");
    runtime.webspring.dropOnItem("gamma", "alpha");
    runtime.webspring.finishDrag(true);
    expect(runtime.store.getSnapshot().webspring.layout).toMatchObject({ draggingItemId: null, dropTargetId: null });
    expect(Object.values(layout(runtime).folders)).toEqual([{ apps: ["alpha", "gamma"] }]);
    expect(stored()).toContain("\"apps\":[\"alpha\",\"gamma\"]");
  });

  it("does not merge folders or accept a dragged folder as a drop", () => {
    const runtime = createFolderRuntime(folders(true, ["folder.tools", 2, ["beta", "gamma"]]));
    runtime.webspring.beginDrag("folder.tools");
    runtime.webspring.setDropTarget("alpha");

    expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBeNull();
    expect(runtime.webspring.dropOnItem("folder.tools", "alpha")).toBe(false);
    expect(runtime.webspring.moveItem("folder.tools", 0)).toBe(true);
    runtime.webspring.finishDrag(true);
    expect(layout(runtime).order).toEqual(["folder.tools", "alpha"]);
  });

  it("refuses membership changes when folders are fixed", () => {
    const runtime = createFolderRuntime(folders(false, ["folder.tools", 2, ["beta", "gamma"]]));

    expect(runtime.webspring.dropOnItem("alpha", "folder.tools")).toBe(false);
    expect(runtime.webspring.moveAppOutOfFolder("beta", 0)).toBe(false);
    expect(runtime.webspring.moveItem("gamma", 0)).toBe(false);
    runtime.webspring.beginDrag("alpha");
    runtime.webspring.setDropTarget("folder.tools");
    expect(runtime.store.getSnapshot().webspring.layout.dropTargetId).toBeNull();
    expect(runtime.webspring.moveItem("alpha", 1)).toBe(true);
    runtime.webspring.finishDrag(true);
    expect(layout(runtime).order).toEqual(["folder.tools", "alpha"]);
    expect(reconcileWebspringLayout(runtime.apps.getAllApps(), layout(runtime), runtime.store.getSnapshot().webspring.layout.folderConfiguration).folders)
      .toEqual({ "folder.tools": ["beta", "gamma"] });
  });

  it("merges into and out of an app whose ID names an Object.prototype member", () => {
    window.localStorage.clear();
    const runtime = createBrowserPersistenceRuntime();
    runtime.apps.registerMany([createOrderedManifest("constructor", 1), createOrderedManifest("alpha", 2)]);
    runtime.webspring.configureFolders(folders(true));
    runtime.webspring.hydrateLayoutPreference();

    expect(runtime.webspring.openFolder("constructor")).toBe(false);
    expect(runtime.webspring.moveItem("constructor", 1)).toBe(true);
    expect(runtime.webspring.dropOnItem("alpha", "constructor")).toBe(true);
    const [folderId] = layout(runtime).order;
    expect(layout(runtime).folders[folderId]).toEqual({ apps: ["constructor", "alpha"] });
    expect(runtime.webspring.moveAppOutOfFolder("constructor", 0)).toBe(true);
    expect(layout(runtime).order).toEqual(["constructor", folderId]);
    expect(runtime.apps.getDisplayApps().map((app) => app.id)).toEqual(["constructor", "alpha"]);
  });

  it("opens one folder at a time, and during a drag only when the drag asks", () => {
    const runtime = createFolderRuntime(folders(true, ["folder.tools", 2, ["beta", "gamma"]]));

    expect(runtime.webspring.openFolder("alpha")).toBe(false);
    runtime.webspring.beginDrag("alpha");
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
  it("reads and validates a canonical v4 value without changing board settings", () => {
    const fake = createProjectionPersistence({
      version: 4,
      order: ["gamma", "gamma", "alpha", ""],
      folders: { "folder.user-a": { apps: ["beta", "beta"] }, "": { apps: ["x"] }, broken: ["x"] },
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    });

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toMatchObject({
      source: "webspring",
      preference: {
        version: 4,
        order: ["gamma", "alpha"],
        folders: { "folder.user-a": { apps: ["beta"] } },
        board: { version: 1, pageSize: 12, dockSize: 5 },
        updatedAt: 20,
        source: "persisted"
      }
    });
    expect(Object.keys(result.preference.folders)).toEqual(["folder.user-a"]);
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it("seeds an empty v4 preference when canonical storage is absent", () => {
    const fake = createProjectionPersistence();

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toEqual({
      source: "seed",
      preference: {
        version: 4,
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
    ["another version", { version: 3, order: ["gamma"], board: { version: 1, pageSize: 12, dockSize: 5 }, updatedAt: 20, source: "persisted" }],
  ])("ignores %s without writing a replacement", (_label, value) => {
    const fake = createProjectionPersistence(value);

    const result = readWebspringLayoutPreference(fake.persistence);

    expect(result).toEqual({
      source: "webspring",
      preference: {
        version: 4,
        order: [],
        folders: {},
        board: { version: 1, pageSize: 20, dockSize: 4 },
        updatedAt: null,
        source: "seed"
      }
    });
    expect(fake.keys).toEqual([WEBSPRING_LAYOUT_PREFERENCE_KEY]);
  });

  it("hydrates canonical v4 preferences through runtime state repeatedly", () => {
    window.localStorage.setItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`, JSON.stringify({
      version: 4,
      order: ["gamma", "alpha"],
      folders: {},
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
      version: 4,
      order: ["gamma", "alpha"],
      board: { version: 1, pageSize: 12, dockSize: 5 },
      updatedAt: 20,
      source: "persisted"
    });
    expect(second).toEqual(first);
    expect(AppRegistry.getDisplayApps().map((app) => app.id)).toEqual(["gamma", "alpha"]);
    expect(window.localStorage.getItem(`SynCloudOS4:${WEBSPRING_LAYOUT_PREFERENCE_KEY}`)).toContain('"version":4');
  });
});
