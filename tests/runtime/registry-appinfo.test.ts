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


  it("normalises app-view frame composition separately from presentation", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    const standard = AppRegistry.register(createTestManifest({ bundleIdentifier: "com.example.standard-frame" }));
    const appOwned = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.app-owned-frame",
      frame: {
        material: "metal",
        topBar: "custom"
      }
    }));

    expect(standard).toMatchObject({
      presentation: "appView",
      frame: {
        material: "standard",
        topBar: "standard",
        rightSlot: "auto",
        background: "system",
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
        material: "metal",
        topBar: "custom",
        rightSlot: "auto",
        background: "system",
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

    const defaulted = AppRegistry.register(createTestManifest({ bundleIdentifier: "com.example.smooth-default" }));
    const disabled = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.smooth-disabled",
      frame: { smoothSurface: "off" }
    }));
    const custom = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.smooth-custom",
      frame: { smoothSurface: 68 }
    }));

    expect(defaulted?.frame.smoothSurface).toMatchObject({ radius: 31, curve: "squircle" });
    expect(disabled?.frame.smoothSurface).toBe("off");
    expect(custom?.frame.smoothSurface).toBe(68);
  });

  it("normalises the source-list rail with defaults, clamping, and railLabel passthrough", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());

    const defaulted = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.sourcelist-default",
      frame: { material: "metal", topBar: "standard", sourceList: {} }
    }));
    const custom = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.sourcelist-custom",
      frame: {
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
      bundleIdentifier: "com.example.sourcelist-custom-topbar",
      frame: { material: "metal", topBar: "custom", sourceList: { defaultWidth: 300 } }
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
      bundleIdentifier: "com.example.invalid-frame",
      frame: {
        material: "panel" as never,
        topBar: "toolbar" as never,
        presentationMotion: "automatic" as never,
        rightSlot: "bogus" as never,
        background: 7 as never
      }
    }));

    expect(registered?.frame).toEqual({
      material: "standard",
      topBar: "standard",
      presentationMotion: "host",
      rightSlot: "auto",
      background: "system",
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
        expect.objectContaining({ code: "manifest.frame.material.defaulted" }),
        expect.objectContaining({ code: "manifest.frame.topBar.defaulted" }),
        expect.objectContaining({ code: "manifest.frame.presentationMotion.defaulted" }),
        expect.objectContaining({ code: "manifest.frame.rightSlot.defaulted" }),
        expect.objectContaining({ code: "manifest.frame.background.defaulted" })
      ])
    );
  });

  it("keeps a custom right slot and a background surface, and drops the removed layout field", async () => {
    const { AppRegistry } = createRuntimeHarness(createTestRuntime());
    const rightSlot = { icon: "/assets/help.svg", label: { key: "help.label", fallback: "Help" } };
    const background = { colour: "#223344", texture: "none" as const };
    const registered = AppRegistry.register(createTestManifest({
      bundleIdentifier: "com.example.custom-frame",
      frame: { rightSlot, background, layout: "simple" } as never
    }));

    expect(registered?.frame.rightSlot).toEqual(rightSlot);
    expect(registered?.frame.background).toEqual(background);
    expect(registered?.frame).not.toHaveProperty("layout");
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
