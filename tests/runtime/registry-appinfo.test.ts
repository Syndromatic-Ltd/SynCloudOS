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
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { projectRuntimeManifest, validateSynWareManifest } from "../../src/SynCloudOS/AppSDK";
import { createTestBundle, createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

describe("AppRegistry and AppInfo registration preflight", () => {
  it("rejects fatal route collisions using normalized route keys without capturing runtime errors", async () => {
    const { AppRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());

    AppRegistry.register(createTestManifest({ bundleIdentifier: "com.example.alpha", route: "/alpha" }));
    const rejected = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.alpha-copy",
      packageName: "AlphaCopy.app",
      route: "/ALPHA/?preview=1#top"
    }));

    const latestHistory = AppRegistry.getRegistrationHistory().at(-1);

    expect(rejected).toBeNull();
    expect(AppRegistry.getAllApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.alpha"]);
    expect(latestHistory).toMatchObject({
      action: "failed",
      result: "rejected",
      fatalIssues: [expect.objectContaining({ code: "registry.route.collision" })]
    });
    expect(AppRegistry.getLastRegistrationReport()).toMatchObject({
      ok: false,
      routeKey: "/alpha",
      fatalIssues: [expect.objectContaining({ field: "route" })]
    });
    expect(RuntimeController.getEventHistory().map((event) => event.type)).toContain("app.register.failed");
    expect(RuntimeController.getSnapshot().errors).toEqual([]);
  });

  it("rejects duplicate component keys instead of preserving compatibility aliases", async () => {
    const { AppRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());

    AppRegistry.register(createTestManifest({ bundleIdentifier: "com.example.primary-component", componentKey: "SharedComponent" }));
    const rejected = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.alias-component",
      packageName: "AliasComponent.app",
      route: "/alias-component",
      componentKey: "SharedComponent"
    }));

    const latestHistory = AppRegistry.getRegistrationHistory().at(-1);

    expect(rejected).toBeNull();
    expect(latestHistory).toMatchObject({
      action: "failed",
      result: "rejected",
      fatalIssues: [expect.objectContaining({ code: "registry.componentKey.collision" })]
    });
    expect(RuntimeController.getEventHistory().map((event) => event.type)).toContain("app.register.failed");
    expect(RuntimeController.getSnapshot().errors).toEqual([]);
  });
  it("projects a minimal V1 manifest into a standard app-view runtime manifest", async () => {
    const manifest = projectRuntimeManifest({
      schemaVersion: 1,
      bundleIdentifier: "com.example.hello-world",
      version: "1.0.0",
      displayName: "Hello World",
    }, {
      appRoot: "./HelloWorld.app",
      packageName: "HelloWorld.app",
      path: "HelloWorld.app/",
      componentKey: "HelloWorld",
    });

    expect(manifest).toMatchObject({ version: "1.0.0",
      bundleIdentifier: "com.example.hello-world",
      packageName: "HelloWorld.app",
      displayName: "Hello World",
      route: "/com.example.hello-world",
      path: "HelloWorld.app/",
      componentKey: "HelloWorld",
      presentation: "appView",
      webspring: {
        visible: true,
        order: 1000,
      },
      window: {
        title: "Hello World",
        resizable: true,
      },
      lifecycle: { preload: false },
      notifications: { showsNotifications: false, badgeCount: 0 },
      seo: {
        title: "Hello World",
        description: "Hello World SynWare.",
      },
    });
    expect(manifest.webspring).not.toHaveProperty("dialPosition");
    expect(manifest.webspring).not.toHaveProperty("selectorAngle");
  });

  it("derives V1 runtime identity and access from declarations after an app is renamed", () => {
    const manifest = projectRuntimeManifest({
      schemaVersion: 1,
      bundleIdentifier: "com.example.renamed-publisher",
      version: "1.0.0",
      displayName: "Renamed Publisher",
      routes: [{ path: "/renamed-publisher", primary: true }],
      services: [{ id: "notifications", required: true }],
      runtime: {
        presentation: "windowedView",
        policy: { requiresLogin: true, requiredCapabilities: ["journal.publisher.open"] },
        notifications: { badgeCount: 2 },
      },
    }, {
      appRoot: "./RenamedPublisher.app",
      packageName: "RenamedPublisher.app",
      path: "RenamedPublisher.app/",
      componentKey: "RenamedPublisher",
    });

    expect(manifest).toMatchObject({
      bundleIdentifier: "com.example.renamed-publisher",
      presentation: "windowedView",
      policy: { requiresLogin: true, requiredCapabilities: ["journal.publisher.open"] },
      notifications: { showsNotifications: true, badgeCount: 2 },
    });
  });

  it("rejects legacy atmo window chrome at the V1 manifest boundary", () => {
    const result = validateSynWareManifest({
      schemaVersion: 1,
      bundleIdentifier: "com.example.atmo-legacy",
      version: "1.0.0",
      displayName: "Atmo Legacy",
      routes: [{ path: "/atmo-legacy", primary: true }],
      windowDefaults: {
        chrome: "atmo",
        smoothSurface: {
          radius: 5,
          curve: "squircle",
          smoothing: 0.6,
          exponent: 2,
          topLeft: 6,
          overflow: "hidden",
          physicality: "off",
        },
      },
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.errors).toContainEqual(expect.objectContaining({
      path: "/windowDefaults/chrome",
    }));
  });

  it("matches AppRegistry routes through the shared normalized route key", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.mixed-route",
      route: "Mixed\\Route///?mode=edit#section"
    }));

    expect(AppRegistry.getApp("com.example.mixed-route")?.route).toBe("/mixed/route");
    expect(AppRegistry.getAppForRoute("/MIXED/route/?ignored=true#hash")?.bundleIdentifier).toBe("com.example.mixed-route");
  });

  it("registers unsafe external routes disabled with warnings instead of ErrorManager noise", async () => {
    const { AppRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());

    const registered = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.unsafe-external",
      type: "external",
      route: "javascript:alert(1)",
      packageName: "UnsafeExternal.app",
      requiredServices: ["externalLinking"]
    }));

    const latestHistory = AppRegistry.getRegistrationHistory().at(-1);

    expect(registered).toMatchObject({ bundleIdentifier: "com.example.unsafe-external", isDisabled: true });
    expect(RuntimeController.getSnapshot().lifecycle["com.example.unsafe-external"]).toBe("disabled");
    expect(latestHistory).toMatchObject({
      action: "register",
      result: "accepted",
      warnings: [expect.objectContaining({ disablesApp: true })]
    });
    expect(AppRegistry.getAppForRoute("javascript:alert(1)")).toBeNull();
    expect(RuntimeController.getEventHistory().map((event) => event.type)).toContain("app.register.warning");
    expect(RuntimeController.getSnapshot().errors).toEqual([]);
  });

  it("preflights package and bundle collisions without mutating the registry", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.Identity",
      packageName: "Identity.app"
    }));

    const report = AppRegistry.preflight(createTestManifest({
      bundleIdentifier: "COM.EXAMPLE.IDENTITY",
      packageName: "identity.app",
      route: "/identity-copy"
    }));

    expect(report).toMatchObject({
      ok: false,
      fatalIssues: expect.arrayContaining([
        expect.objectContaining({ code: "registry.bundleIdentifier.collision", field: "bundleIdentifier" }),
        expect.objectContaining({ code: "registry.packageName.collision" })
      ])
    });
    expect(AppRegistry.getAllApps().map((app) => app.bundleIdentifier)).toEqual(["com.example.Identity"]);
  });

  it("preserves declared identity while differently-cased lookups resolve the same app", () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    const registered = AppRegistry.register(createTestManifest({ bundleIdentifier: "Com.Example.MixedCase", displayName: "Mixed Case" }));
    expect(registered?.bundleIdentifier).toBe("Com.Example.MixedCase");
    expect(AppRegistry.getApp("com.example.mixedcase")).toStrictEqual(registered);
    expect(AppRegistry.getApp("COM.EXAMPLE.MIXEDCASE")).toStrictEqual(registered);
  });


  it("normalises presentation motion independently from the window kind", () => {
    const runtime = createTestRuntime();
    const app = runtime.apps.register(createTestBundle({ bundleIdentifier: "com.example.motion", frame: { presentationMotion: "content" } }));
    expect(app?.frame.presentationMotion).toBe("content");
  });

  it("reports optional services without disabling the app", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    const registered = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.optional-service-app",
      optionalServices: ["missing.optional", "windowing"]
    }));

    expect(registered).toMatchObject({
      bundleIdentifier: "com.example.optional-service-app",
      isDisabled: false,
      optionalServiceStatus: {
        "missing.optional": false,
        windowing: true
      },
      unavailableOptionalServices: ["missing.optional"]
    });
  });
});
