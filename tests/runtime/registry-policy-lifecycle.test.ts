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
import { asPolicySubject, createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

describe("runtime registry, ConfigurationProfiles, Lifecycle, and PluginRegistry contracts", () => {
  it("registers AppInfo, manager state, display ordering, and route lookup from a manifest", async () => {
    const { AppRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());
    const first = createTestManifest({ version: "1.0.0",
      bundleIdentifier: "com.example.alpha",
      displayName: "Alpha",
      route: "/alpha",
      webspring: { order: 20 }
    });
    const second = createTestManifest({ version: "1.0.0",
      bundleIdentifier: "com.example.beta",
      displayName: "Beta",
      route: "/beta",
      webspring: { defaultSelected: true, order: 5 }
    });

    const registered = AppRegistry.registerMany([first, second]);

    expect(registered).toHaveLength(2);
    expect(AppRegistry.getApp("com.example.alpha")?.capitalizedName).toBe("Com.example.alpha");
    expect(AppRegistry.getDisplayApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.beta", "com.example.alpha"]);
    expect(AppRegistry.getAppForRoute("/beta")?.bundleIdentifier).toBe("com.example.beta");
    expect(RuntimeController.getSnapshot().lifecycle["com.example.beta"]).toBe("registered");
    expect(RuntimeController.getSnapshot().webspring.selectedAppId).toBe("com.example.beta");
    expect(RuntimeController.getHistory().map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["AppRegistry.register:com.example.alpha", "AppRegistry.register:com.example.beta"])
    );
    expect(AppRegistry.getRegistrationHistory().map((entry) => entry.action)).toEqual(["register", "register"]);
  });

  it("rejects malformed manifests without mutating the registry", async () => {
    const { AppRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());
    const invalidManifest = createTestManifest({ bundleIdentifier: "", packageName: "" });

    expect(AppRegistry.register(invalidManifest)).toBeNull();
    expect(AppRegistry.getAllApps()).toEqual([]);
    expect(RuntimeController.getSnapshot().errors[0]?.code).toBe("APP_LAUNCH_FAILED");
  });

  it("keeps ConfigurationProfiles decisions explicit for public, system, and elevated subjects", async () => {
    const { PermissionManager, ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const publicSubject = {
      user: { id: "public", displayName: "Public", role: "public", isAuthenticated: false, isAnonymous: true },
      role: "public" as const,
      capabilities: ["app.open.public"],
      isAuthenticated: false
    };
    const adminSubject = {
      user: { id: "admin", displayName: "Admin", role: "admin", isAuthenticated: true, isAnonymous: false },
      role: "admin" as const,
      capabilities: ConfigurationProfiles.getRoleCapabilities("admin"),
      isAuthenticated: true
    };

    expect(ConfigurationProfiles.authorise({ action: "runtime.mutate", ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test" })).toMatchObject({
      allowed: false,
      missingCapabilities: ["runtime.mutate"]
    });
    expect(ConfigurationProfiles.authorise({ action: "runtime.mutate", ...asPolicySubject(ConfigurationProfiles, adminSubject), origin: "test" })).toMatchObject({
      allowed: true
    });
    expect(ConfigurationProfiles.can({ action: "runtime.system", ...asPolicySubject(ConfigurationProfiles, { ...adminSubject, capabilities: ["*"], role: "system" }), origin: "test" })).toBe(true);
    expect(ConfigurationProfiles.getAuditLog()).toHaveLength(3);
    expect(PermissionManager.getRoleCapabilities("founder")).toContain("runtime.system");
  });

  it("evaluates ConfigurationProfiles access modes without hardcoding one login model", async () => {
    const { ConfigurationProfiles } = createRuntimeHarness(createTestRuntime());
    const publicSubject = {
      user: { id: "public", displayName: "Public", role: "public", isAuthenticated: false, isAnonymous: true },
      role: "public" as const,
      capabilities: ["app.open.public", "webspring.display"],
      isAuthenticated: false
    };
    const betaSubject = {
      user: { id: "beta", displayName: "Beta", role: "betaTester", isAuthenticated: true, isAnonymous: false },
      role: "betaTester" as const,
      capabilities: ConfigurationProfiles.getRoleCapabilities("betaTester"),
      isAuthenticated: true
    };
    const founderSubject = {
      user: { id: "founder", displayName: "Founder", role: "founder", isAuthenticated: true, isAnonymous: false },
      role: "founder" as const,
      capabilities: ConfigurationProfiles.getRoleCapabilities("founder"),
      isAuthenticated: true
    };
    const publicApp = createTestManifest({ bundleIdentifier: "com.example.public-mode-app", policy: { public: true } });
    const protectedApp = createTestManifest({
      bundleIdentifier: "com.example.protected-mode-app",
      policy: { requiresLogin: true, requiredCapabilities: ["app.open.protected"] }
    });
    const enterpriseApp = createTestManifest({
      bundleIdentifier: "com.example.enterprise-mode-app",
      policy: { requiresLogin: true, requiredRoles: ["founder"], requiredCapabilities: ["runtime.system"] }
    });

    ConfigurationProfiles.clearAuditLog();

    ConfigurationProfiles.setAccessMode("fullyLocked");
    expect(ConfigurationProfiles.authorise({ action: "webspring.enter", ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test" }).allowed).toBe(false);

    ConfigurationProfiles.setAccessMode("webspringVisibleAppProtected");
    expect(ConfigurationProfiles.authorise({ action: "webspring.enter", ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test" }).allowed).toBe(true);
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: publicApp, ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test" }).allowed).toBe(false);

    ConfigurationProfiles.setAccessMode("public");
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: publicApp, ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test" }).allowed).toBe(true);

    ConfigurationProfiles.setAccessMode("mixed");
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: publicApp, ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test" }).allowed).toBe(true);
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, ...asPolicySubject(ConfigurationProfiles, publicSubject), origin: "test" }).allowed).toBe(false);
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: protectedApp, ...asPolicySubject(ConfigurationProfiles, betaSubject), origin: "test" }).allowed).toBe(true);

    ConfigurationProfiles.setAccessMode("developer");
    expect(ConfigurationProfiles.authorise({ action: "statechart.goto", subject: publicSubject, origin: "developerConsole" }).allowed).toBe(true);
    expect(ConfigurationProfiles.authorise({ action: "runtime.mutate", subject: publicSubject, origin: "developerConsole" }).allowed).toBe(false);

    ConfigurationProfiles.setAccessMode("enterprisePrivate");
    expect(ConfigurationProfiles.authorise({ action: "app.launch", app: enterpriseApp, ...asPolicySubject(ConfigurationProfiles, founderSubject), origin: "test" }).allowed).toBe(true);

    expect(ConfigurationProfiles.getAuditLog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "app.launch",
          reason: expect.any(String),
          subjectRole: expect.any(String),
          resource: expect.any(String),
          mode: expect.any(String),
          at: expect.any(Number)
        })
      ])
    );
  });

  it("guards lifecycle transitions and records manager lifecycle events", async () => {
    const { AppLifecycle, AppRegistry, AppManagerController, Lifecycle, RuntimeController } = createRuntimeHarness(createTestRuntime());
    const manifest = createTestManifest({ bundleIdentifier: "com.example.lifecycle-app" });
    const listener = vi.fn();
    Lifecycle.on("app.register", listener);

    AppRegistry.register(manifest);
    const manager = AppManagerController.getManagerForApp("com.example.lifecycle-app");

    expect(AppLifecycle.canTransition("registered", "loading")).toBe(true);
    expect(AppLifecycle.canTransition("registered", "active")).toBe(false);
    expect(manager?.transition("active", "direct jump")).toBe(false);
    expect(manager?.transition("loading", "prepare")).toBe(true);
    expect(manager?.transition("ready", "prepared")).toBe(true);

    const snapshot = RuntimeController.getSnapshot();
    expect(snapshot.lifecycle["com.example.lifecycle-app"]).toBe("ready");
    expect(snapshot.lifecycleEvents.map((event) => `${event.from}->${event.to}`)).toEqual([
      "registered->loading",
      "loading->ready"
    ]);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "app.register" }));
  });

  it("registers trusted bundles, plugins, and invokes lifecycle hooks", async () => {
    const { BundleLoader, PluginRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());
    const manifest = createTestManifest({ bundleIdentifier: "com.example.bundle-app", requiredServices: ["internalContent"] });
    const applicationDidLaunch = vi.fn();
    const register = vi.fn();
    const enable = vi.fn();
    const disable = vi.fn();

    BundleLoader.registerBundle({
      manifest,
      componentKey: "BundleApp",
      services: manifest.requiredServices,
      permissions: ["app.open.public"],
      lifecycleHooks: { applicationDidLaunch }
    });

    await BundleLoader.invokeLifecycleHook("com.example.bundle-app", "applicationDidLaunch", { reason: "test" });
    const plugin = await PluginRegistry.register({ id: "qa-plugin", name: "QA Plugin", version: "1.0.0", register, enable, disable }, {});
    await PluginRegistry.disable("qa-plugin");
    await PluginRegistry.enable("qa-plugin");

    expect(BundleLoader.getBundle("com.example.bundle-app")?.permissions).toEqual(["app.open.public"]);
    expect(applicationDidLaunch).toHaveBeenCalledWith({
      appId: "com.example.bundle-app",
      packageName: manifest.packageName,
      reason: "test"
    });
    expect(plugin).toMatchObject({ status: "enabled" });
    expect(register).toHaveBeenCalledTimes(1);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(disable).toHaveBeenCalledTimes(1);
    expect(PluginRegistry.getPlugin("qa-plugin")?.status).toBe("enabled");
    expect(RuntimeController.getEventHistory().map((event) => event.type)).toEqual(
      expect.arrayContaining(["plugin.register", "plugin.disable", "plugin.enable"])
    );
  });
});
