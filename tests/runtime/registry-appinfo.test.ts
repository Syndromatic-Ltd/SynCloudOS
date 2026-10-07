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
import { createTestRuntime, createTestManifest, createRuntimeHarness } from "./helpers";

describe("AppRegistry and AppInfo registration preflight", () => {
  it("rejects fatal route collisions using normalized route keys without capturing runtime errors", async () => {
    const { AppRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());

    AppRegistry.register(createTestManifest({ id: "alpha", route: "/alpha" }));
    const rejected = AppRegistry.register(createTestManifest({
      id: "alpha-copy",
      packageName: "AlphaCopy.app",
      bundleId: "com.syndromatic.tests.alpha-copy",
      route: "/ALPHA/?preview=1#top"
    }));

    const latestHistory = AppRegistry.getRegistrationHistory().at(-1);

    expect(rejected).toBeNull();
    expect(AppRegistry.getAllApps().map((app) => app.id)).toEqual(["alpha"]);
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

    AppRegistry.register(createTestManifest({ id: "primary-component", componentKey: "SharedComponent" }));
    const rejected = AppRegistry.register(createTestManifest({
      id: "alias-component",
      packageName: "AliasComponent.app",
      bundleId: "com.syndromatic.tests.alias-component",
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
      id: "hello-world",
      version: "1.0.0",
      title: "Hello World",
    }, {
      appRoot: "./HelloWorld.app",
      packageName: "HelloWorld.app",
      path: "HelloWorld.app/",
      componentKey: "HelloWorld",
    });

    expect(manifest).toMatchObject({
      id: "hello-world",
      packageName: "HelloWorld.app",
      bundleId: "com.syndromatic.syncloudos.HelloWorld",
      displayName: "Hello World",
      route: "/hello-world",
      path: "HelloWorld.app/",
      componentKey: "HelloWorld",
      presentation: "appView",
      webspring: {
        visible: true,
        order: 1000,
      },
      window: {
        title: "Hello World",
        chrome: "system",
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
      id: "renamed-publisher",
      version: "1.0.0",
      title: "Renamed Publisher",
      routes: [{ path: "/renamed-publisher", primary: true }],
      services: [{ id: "notifications", required: true }],
      runtime: {
        bundleId: "com.syndromatic.app.renamed-publisher",
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
      id: "renamed-publisher",
      bundleId: "com.syndromatic.app.renamed-publisher",
      presentation: "windowedView",
      policy: { requiresLogin: true, requiredCapabilities: ["journal.publisher.open"] },
      notifications: { showsNotifications: true, badgeCount: 2 },
    });
  });

  it("rejects legacy atmo window chrome at the V1 manifest boundary", () => {
    const result = validateSynWareManifest({
      schemaVersion: 1,
      id: "atmo-legacy",
      version: "1.0.0",
      title: "Atmo Legacy",
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
      id: "mixed-route",
      route: "Mixed\\Route///?mode=edit#section"
    }));

    expect(AppRegistry.getApp("mixed-route")?.route).toBe("/mixed/route");
    expect(AppRegistry.getAppForRoute("/MIXED/route/?ignored=true#hash")?.id).toBe("mixed-route");
  });

  it("registers unsafe external routes disabled with warnings instead of ErrorManager noise", async () => {
    const { AppRegistry, RuntimeController } = createRuntimeHarness(createTestRuntime());

    const registered = AppRegistry.register(createTestManifest({
      id: "unsafe-external",
      type: "external",
      route: "javascript:alert(1)",
      packageName: "UnsafeExternal.app",
      bundleId: "com.syndromatic.tests.unsafe-external",
      requiredServices: ["externalLinking"]
    }));

    const latestHistory = AppRegistry.getRegistrationHistory().at(-1);

    expect(registered).toMatchObject({ id: "unsafe-external", isDisabled: true });
    expect(RuntimeController.getSnapshot().lifecycle["unsafe-external"]).toBe("disabled");
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
      id: "identity-source",
      packageName: "Identity.app",
      bundleId: "com.syndromatic.tests.identity"
    }));

    const report = AppRegistry.preflight(createTestManifest({
      id: "identity-copy",
      packageName: "identity.app",
      bundleId: "COM.SYNDROMATIC.TESTS.IDENTITY",
      route: "/identity-copy"
    }));

    expect(report).toMatchObject({
      ok: false,
      fatalIssues: expect.arrayContaining([
        expect.objectContaining({ code: "registry.bundleId.collision" }),
        expect.objectContaining({ code: "registry.packageName.collision" })
      ])
    });
    expect(AppRegistry.getAllApps().map((app) => app.id)).toEqual(["identity-source"]);
  });


  it("normalises app-view frame composition separately from presentation", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    const standard = AppRegistry.register(createTestManifest({ id: "standard-frame" }));
    const appOwned = AppRegistry.register(createTestManifest({
      id: "app-owned-frame",
      frame: {
        layout: "defacto",
        material: "metal",
        topBar: "custom"
      }
    }));

    expect(standard).toMatchObject({
      presentation: "appView",
      frame: {
        layout: "simple",
        material: "standard",
        topBar: "standard",
        rightSlot: "userInfo",
        smoothSurface: {
          radius: 31,
          curve: "squircle",
          smoothing: 0.6,
          physicality: "default",
          overflow: "hidden"
        }
      }
    });
    expect(appOwned).toMatchObject({
      presentation: "appView",
      frame: {
        layout: "defacto",
        material: "metal",
        topBar: "custom",
        rightSlot: "userInfo",
        smoothSurface: {
          radius: 31,
          curve: "squircle",
          smoothing: 0.6,
          physicality: "default",
          overflow: "hidden"
        }
      }
    });
  });

  it("normalises app-view smooth surface defaults, opt-outs, and radius shorthand", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    const defaulted = AppRegistry.register(createTestManifest({ id: "smooth-default" }));
    const disabled = AppRegistry.register(createTestManifest({
      id: "smooth-disabled",
      frame: { smoothSurface: "off" }
    }));
    const custom = AppRegistry.register(createTestManifest({
      id: "smooth-custom",
      frame: { smoothSurface: 68 }
    }));

    expect(defaulted?.frame.smoothSurface).toMatchObject({ radius: 31, curve: "squircle" });
    expect(disabled?.frame.smoothSurface).toBe("off");
    expect(custom?.frame.smoothSurface).toBe(68);
  });

  it("normalises the source-list rail with defaults, clamping, and railLabel passthrough", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    const defaulted = AppRegistry.register(createTestManifest({
      id: "sourcelist-default",
      frame: { layout: "defacto", material: "metal", topBar: "standard", sourceList: {} }
    }));
    const custom = AppRegistry.register(createTestManifest({
      id: "sourcelist-custom",
      frame: {
        layout: "defacto",
        material: "metal",
        topBar: "standard",
        sourceList: { railLabel: "  Software  ", minWidth: 240, maxWidth: 200, defaultWidth: 999 }
      }
    }));

    expect(defaulted?.frame.sourceList).toEqual({ minWidth: 208, maxWidth: 460, defaultWidth: 264 });
    // maxWidth raised to minWidth, defaultWidth clamped into [min, max], railLabel trimmed.
    expect(custom?.frame.sourceList).toEqual({ minWidth: 240, maxWidth: 240, defaultWidth: 240, railLabel: "Software" });
  });

  it("drops the source-list rail unless topBar is standard", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    const appOwned = AppRegistry.register(createTestManifest({
      id: "sourcelist-custom-topbar",
      frame: { layout: "defacto", material: "metal", topBar: "custom", sourceList: { defaultWidth: 300 } }
    }));

    expect(appOwned?.frame.sourceList).toBeUndefined();
    expect(AppRegistry.getRegistrationHistory().at(-1)?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "manifest.frame.sourceList.ignored" })
      ])
    );
  });

  it("keeps invalid frame fields as warnings and falls back to the standard frame", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    const registered = AppRegistry.register(createTestManifest({
      id: "invalid-frame",
      frame: {
        layout: "floaty" as never,
        material: "panel" as never,
        topBar: "toolbar" as never,
        presentationMotion: "automatic" as never
      }
    }));

    expect(registered?.frame).toEqual({
      layout: "simple",
      material: "standard",
      topBar: "standard",
      presentationMotion: "host",
      rightSlot: "userInfo",
      smoothSurface: {
        radius: 31,
        curve: "squircle",
        smoothing: 0.6,
        physicality: "default",
        overflow: "hidden"
      }
    });
    expect(AppRegistry.getRegistrationHistory().at(-1)?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "manifest.frame.layout.defaulted" }),
        expect.objectContaining({ code: "manifest.frame.material.defaulted" }),
        expect.objectContaining({ code: "manifest.frame.topBar.defaulted" }),
        expect.objectContaining({ code: "manifest.frame.presentationMotion.defaulted" })
      ])
    );
  });

  it("reports optional services without disabling the app", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    const registered = AppRegistry.register(createTestManifest({
      id: "optional-service-app",
      optionalServices: ["missing.optional", "windowing"]
    }));

    expect(registered).toMatchObject({
      id: "optional-service-app",
      isDisabled: false,
      optionalServiceStatus: {
        "missing.optional": false,
        windowing: true
      },
      unavailableOptionalServices: ["missing.optional"]
    });
  });
});
