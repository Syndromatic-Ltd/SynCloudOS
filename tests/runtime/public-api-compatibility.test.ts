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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createSynCloudOSFacade } from "../../src/SynCloudOS/SynCloudOS";
import { createTestBundle, createTestManifest, createTestRuntime } from "./helpers";

describe("SynCloudOS public API compatibility", () => {
  it("preserves SynCloudOS.Something namespace calls as projections of an explicit runtime", () => {
    const runtime = createTestRuntime();
    const SynCloudOS = createSynCloudOSFacade(runtime);
    const RuntimeController = SynCloudOS.Runtime;

    SynCloudOS.ServiceRegistry.register({ id: "webspring", availability: "available" });

    expect(SynCloudOS.statechart.gotoState("active.webspring", { source: "compat.lowercase" })).toMatchObject({
      to: "active.webspring",
      ok: true
    });
    expect(SynCloudOS.Statechart.gotoState("active.webspring", { source: "compat.uppercase" })).toMatchObject({
      to: "active.webspring",
      ok: true
    });

    const app = SynCloudOS.AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.compat-api",
      route: "/compat-api"
    }));

    expect(app).toMatchObject({ bundleIdentifier: "com.example.compat-api" });
    expect(SynCloudOS.AppManager.initializeAppManagers().map((manager) => manager.bundleIdentifier)).toContain("com.example.compat-api");

    SynCloudOS.WebspringState.selectApp("com.example.compat-api");
    expect(RuntimeController.getSnapshot().webspring.selectedAppId).toBe("com.example.compat-api");
    expect(SynCloudOS).not.toHaveProperty("Spring" + "boardState");
  });

  it("uses one canonical route, snapshot, state, and facade vocabulary", () => {
    const runtime = createTestRuntime();
    const SynCloudOS = createSynCloudOSFacade(runtime);
    const RouteManager = SynCloudOS.RouteManager;
    const RuntimeController = SynCloudOS.Runtime;
    const legacySnapshotKey = ["spring", "board"].join("");
    const legacyRoute = `/${legacySnapshotKey}`;

    expect(RouteManager.resolveRoute("/")).toMatchObject({ kind: "webspring", pathname: "/" });
    expect(RouteManager.resolveRoute(legacyRoute)).toMatchObject({ kind: "notFound", pathname: legacyRoute });
    expect(RuntimeController.getSnapshot()).toHaveProperty("webspring");
    expect(RuntimeController.getSnapshot()).not.toHaveProperty(legacySnapshotKey);
    expect(SynCloudOS).toHaveProperty("WebspringState");
    expect(SynCloudOS).not.toHaveProperty("Spring" + "boardState");
    expect(SynCloudOS.Statechart.gotoState("active.webspring", { source: "test" })).toMatchObject({
      to: "active.webspring",
      ok: true
    });
  });

  it("caches one compatibility adapter graph and reuses canonical locale and persistence services", () => {
    const runtime = createTestRuntime();
    const first = createSynCloudOSFacade(runtime);
    const second = createSynCloudOSFacade(runtime);
    const source = readFileSync(resolve(process.cwd(), "src/SynCloudOS/SynCloudOS.ts"), "utf8");

    expect(second).toBe(first);
    expect(first.LocaleServices).toBe(runtime.locale);
    expect(source).not.toContain("window.localStorage");
  });

  it("projects the one runtime-owned service graph through both facade directions", async () => {
    const runtime = createTestRuntime();
    const facade = createSynCloudOSFacade(runtime);
    const facadeBundle = createTestBundle({ bundleIdentifier: "com.example.facade-owned", route: "/facade-owned" });
    const runtimeBundle = createTestBundle({ bundleIdentifier: "com.example.runtime-owned", route: "/runtime-owned" });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    for (const id of ["webspring", "routing", "windowing"]) {
      runtime.services.register({ id, availability: "available" });
    }

    facade.AppRegistry.registerBundle(facadeBundle);
    await facade.BundleLoader.loadBundle("com.example.facade-owned");
    expect(runtime.apps.getApp("com.example.facade-owned")).toMatchObject({ bundleIdentifier: "com.example.facade-owned" });
    expect(runtime.bundles.getBundle("com.example.facade-owned")).toMatchObject({ manifest: { bundleIdentifier: "com.example.facade-owned" } });
    expect(facade.BundleLoader.getBundle("com.example.facade-owned")).toBe(runtime.bundles.getBundle("com.example.facade-owned"));
    expect(runtime.bundles.getLoadedBundle("com.example.facade-owned")).not.toBeNull();
    await expect(runtime.routes.openRoute("/facade-owned", { source: "cross-seam", syncRoute: false }).result)
      .resolves.toMatchObject({ status: "completed", value: { appId: "com.example.facade-owned" } });

    runtime.apps.registerBundle(runtimeBundle);
    expect(facade.AppRegistry.getApp("com.example.runtime-owned")).toMatchObject({ bundleIdentifier: "com.example.runtime-owned" });
    expect(facade.BundleLoader.getBundle("com.example.runtime-owned")).toBe(runtime.bundles.getBundle("com.example.runtime-owned"));
    await facade.BundleLoader.loadBundle("com.example.runtime-owned");
    expect(runtime.bundles.getLoadedBundle("com.example.runtime-owned")).not.toBeNull();

    expect(facade.EventBus).toBe(runtime.events);
    expect(facade.Statechart).toBe(runtime.statechart);
    expect(facade.ServiceRegistry).toBe(runtime.services);
    expect(facade.AppRegistry).toBe(runtime.apps);
    expect(facade.BundleLoader).toBe(runtime.bundles);
    expect(facade.PolicyKit).toBe(runtime.policy);
    expect(facade.Lifecycle).toBe(runtime.lifecycle);
    expect(facade.LaunchServices).toBe(runtime.launchServices);
    expect(facade.RouteManager).toBe(runtime.routes);
    expect(facade.WindowManager).toBe(runtime.windows);
    expect(facade.ErrorManager).toBe(runtime.errors);
    expect(facade.NotificationCenter).toBe(runtime.notifications);
    expect(facade.WebspringState).toBe(runtime.webspring);
    expect(facade.WebspringChoreography).toBe(runtime.webspringChoreography);
    expect(facade.LoginServices).toBe(runtime.login);
    expect(facade.LocaleServices).toBe(runtime.locale);
    expect(facade.Settings).toBe(runtime.settings);
    expect(facade.Appearance).toBe(runtime.appearance);
    expect(facade.Inspector).toBe(runtime.inspector);
    expect(facade.PermissionManager).toBe(runtime.permissions);
    expect(facade.Persistence).toBe(runtime.persistence);
    expect(facade.Documents).toBe(runtime.documents);
    expect(facade.DocumentStore).toBe(runtime.documentStore);
    expect(facade.AppManager).toBe(runtime.appManager);
    expect(facade.BootManager).toBe(runtime.bootManager);
    expect(facade.GlobalWatchdog).toBe(runtime.globalWatchdog);
    expect(facade.PluginRegistry).toBe(runtime.pluginRegistry);
    expect(facade.ResponsiveModeManager).toBe(runtime.responsiveModeManager);
    expect(facade.WebspringChoreography).toBe(runtime.webspringChoreography);
  });

  it("keeps cached adapters stable without sharing authority between runtimes", () => {
    const firstRuntime = createTestRuntime({ id: "facade-first" });
    const secondRuntime = createTestRuntime({ id: "facade-second" });
    const first = createSynCloudOSFacade(firstRuntime);
    const repeated = createSynCloudOSFacade(firstRuntime);
    const second = createSynCloudOSFacade(secondRuntime);

    expect(repeated).toBe(first);
    expect(repeated.BootManager).toBe(first.BootManager);
    expect(repeated.AppManager).toBe(first.AppManager);
    expect(repeated.GlobalWatchdog).toBe(first.GlobalWatchdog);
    expect(repeated.PluginRegistry).toBe(first.PluginRegistry);
    expect(repeated.ResponsiveModeManager).toBe(first.ResponsiveModeManager);
    expect(repeated.Runtime).toBe(first.Runtime);
    expect(second).not.toBe(first);
    expect(second.BootManager).not.toBe(first.BootManager);

    first.AppRegistry.register(createTestManifest({ bundleIdentifier: "com.example.first-only", route: "/first-only" }));
    expect(firstRuntime.apps.getApp("com.example.first-only")).not.toBeNull();
    expect(secondRuntime.apps.getApp("com.example.first-only")).toBeNull();
    expect(second.AppRegistry.getApp("com.example.first-only")).toBeNull();
  });

  it("does not construct classic stateful services inside the runtime facade", () => {
    const source = readFileSync(resolve(process.cwd(), "src/SynCloudOS/SynCloudOS.ts"), "utf8");
    expect(source.match(/createClassic[A-Za-z]+/g) ?? []).toEqual([]);
  });

  it("exposes the complete runtime-owned command, responder, focus, binding, and undo APIs", () => {
    const runtime = createTestRuntime();
    expect(Object.keys(runtime.commands).sort()).toEqual([
      "dispatch", "dispose", "getDeclarations", "inspect", "prepareDispatch", "register", "runtimeId", "validate", "validateMany",
    ].sort());
    expect(Object.keys(runtime.responders).sort()).toEqual([
      "dispose", "generation", "get", "getGeneration", "has", "inspect", "isEnabled", "register", "remove", "resolveChain", "runtimeId",
    ].sort());
    expect(Object.keys(runtime.focus).sort()).toEqual([
      "closeScope", "dispose", "getActiveAnchors", "getFocusedResponderId", "getGeneration", "handleRespondersRemoved", "inspect", "isScopeWithin", "openScope", "requestFocus", "runtimeId", "setActiveAnchors",
    ].sort());
    expect(Object.keys(runtime.keyBindings).sort()).toEqual([
      "claimKeyboardEvent", "clearOverride", "dispose", "handleKeyboardEvent", "inspect", "inspectCollisions", "resolve", "setOverride",
    ].sort());
    expect(Object.keys(runtime.undo).sort()).toEqual([
      "create", "dispose", "get", "inspect", "remove", "resolveForResponder", "runtimeId",
    ].sort());

    for (const path of [
      "src/SynCloudOS/Commands/index.ts",
      "src/SynCloudOS/Responders/index.ts",
      "src/SynCloudOS/Focus/index.ts",
      "src/SynCloudOS/KeyBindings/index.ts",
      "src/SynCloudOS/Undo/index.ts",
    ]) {
      expect(readFileSync(resolve(process.cwd(), path), "utf8"), path).not.toContain("export default");
    }
  });
});
