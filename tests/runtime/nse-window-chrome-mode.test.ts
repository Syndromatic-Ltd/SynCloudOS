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
import type { SynCloudOSAppManifest } from "../../src/SynCloudOS/SynCloudOS";
import type { WindowRestorationPersistencePort } from "../../src/SynCloudOS/Windows";
import {
  defaultWindowSmoothSurface,
  InvalidWindowRecordError,
  normaliseWindowSmoothSurface,
} from "../../src/SynCloudOS/Windows";
import { normaliseAppInfo } from "../../src/SynCloudOS/AppInfo/createAppInfo";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import {
  createTestManifest,
  createTestRuntime,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";
import { createWindowTestDependencies, standardWindow } from "../fixtures/windowTestDependencies";

function memoryPersistence(): WindowRestorationPersistencePort & { readonly values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    read: vi.fn((key) => values.get(key) ?? null),
    write: vi.fn((key, value) => { values.set(key, value); }),
  };
}

describe("window smoothSurface normalisation", () => {
  it("resolves undefined to the named default window smooth surface", () => {
    expect(normaliseWindowSmoothSurface(undefined)).toEqual(defaultWindowSmoothSurface);
    expect(defaultWindowSmoothSurface).toMatchObject({ radius: 10, curve: "squircle", smoothing: 0.6, overflow: "hidden", physicality: "off" });
  });

  it("keeps off sentinels, radii, and corner objects", () => {
    expect(normaliseWindowSmoothSurface(null)).toBeNull();
    expect(normaliseWindowSmoothSurface("off")).toBe("off");
    expect(normaliseWindowSmoothSurface(false)).toBe("off");
    expect(normaliseWindowSmoothSurface(24)).toBe(24);
    expect(normaliseWindowSmoothSurface({ radius: 5, topLeft: 2 })).toEqual({ radius: 5, topLeft: 2 });
    expect(() => normaliseWindowSmoothSurface({ curve: "squircle", smoothing: 1.4 })).toThrow(InvalidWindowRecordError);
  });

  it("throws on invalid values in assertion mode and notes fallbacks in manifest mode", () => {
    expect(() => normaliseWindowSmoothSurface({ radius: -5 })).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface({ curve: "blob" })).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface("square")).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface({ radius: 4, invented: true })).toThrow(InvalidWindowRecordError);
    expect(() => normaliseWindowSmoothSurface({
      physicality: { top: { offsetY: 1, color: "#000", opacity: 1, invented: true } },
    })).toThrow(InvalidWindowRecordError);
    const notes: Array<{ field: string; from: unknown }> = [];
    normaliseWindowSmoothSurface({ radius: -5, curve: "blob" }, (field, from) => { notes.push({ field, from }); });
    expect(notes.map(({ field }) => field)).toEqual(["radius", "curve"]);
  });
});

describe("window chrome mode records", () => {
  it("defaults created records to system chrome and the default smooth surface", () => {
    const harness = createWindowTestDependencies({ id: "runtime:chrome-defaults" });
    const controller = harness.manager.create(standardWindow("defaults-window"));
    expect(controller.record.chromeMode).toBe("system");
    expect(controller.record.smoothSurface).toEqual(defaultWindowSmoothSurface);
    harness.manager.dispose();
  });

  it("keeps explicit custom chrome and smooth surface overrides on records", () => {
    const harness = createWindowTestDependencies({ id: "runtime:chrome-overrides" });
    const custom = harness.manager.create(standardWindow("custom-window", {
      chromeMode: "custom",
      smoothSurface: { radius: 3 },
    }));
    expect(custom.record.chromeMode).toBe("custom");
    expect(custom.record.smoothSurface).toEqual({ radius: 3 });
    const off = harness.manager.create(standardWindow("off-window", { smoothSurface: "off" }));
    expect(off.record.smoothSurface).toBe("off");
    harness.manager.dispose();
  });

  it("enforces the canonical role/chrome compatibility matrix at creation", () => {
    const harness = createWindowTestDependencies({ id: "runtime:chrome-roles" });
    try {
      for (const role of ["panel", "hud", "sheet", "popover", "modal"] as const) {
        const extras = {
          ...((role === "panel" || role === "hud") ? { level: "floating" as const } : {}),
          ...(role === "popover" ? {
            anchor: {
              id: "coercion-anchor",
              rect: { x: 0, y: 0, width: 8, height: 8 },
              edge: "block-end" as const,
              alignment: "center" as const,
              offset: 0,
            },
          } : {}),
        };
        expect(() => harness.manager.create(standardWindow(`${role}-custom`, { role, chromeMode: "custom", ...extras }))).toThrow(InvalidWindowRecordError);
        expect(() => harness.manager.create(standardWindow(`${role}-frameless`, { role, chromeMode: "frameless", ...extras }))).toThrow(InvalidWindowRecordError);
        expect(harness.manager.create(standardWindow(`${role}-system`, { role, chromeMode: "system", ...extras })).record.chromeMode).toBe("system");
      }
      const standard = harness.manager.create(standardWindow("standard-custom-kept", { chromeMode: "custom" }));
      expect(standard.record.chromeMode).toBe("custom");
      expect(harness.manager.create(standardWindow("borderless-default", { role: "borderless" })).record.chromeMode).toBe("frameless");
      expect(harness.manager.create(standardWindow("borderless-frameless", { role: "borderless", chromeMode: "frameless" })).record.chromeMode).toBe("frameless");
      expect(() => harness.manager.create(standardWindow("borderless-system", { role: "borderless", chromeMode: "system" }))).toThrow(InvalidWindowRecordError);
    } finally {
      harness.manager.dispose();
    }
  });

  it("rejects invalid chrome modes and non-serialisable smooth surfaces", () => {
    const harness = createWindowTestDependencies({ id: "runtime:chrome-invalid" });
    expect(() => harness.manager.create(standardWindow("bad-chrome", {
      chromeMode: "atmo" as unknown as "system",
    }))).toThrow(InvalidWindowRecordError);
    expect(() => harness.manager.create(standardWindow("bad-surface", {
      smoothSurface: { radius: -5 },
    }))).toThrow(InvalidWindowRecordError);
    harness.manager.dispose();
  });

  it("forces system chrome for systemSheet presentation windows at the creation seam", async () => {
    const runtime = createTestRuntime({ id: "runtime:chrome-sheet" });
    registerTestSynWare(runtime, {
      schemaVersion: 1,
      bundleIdentifier: "com.example.sheet-chrome-app",
      version: "1.0.0",
      displayName: "Sheet Chrome App",
      routes: [{ path: "/sheet-chrome-app", primary: true }],
      runtime: { presentation: "systemSheet" },
      windowDefaults: { chrome: "custom" },
    });
    const mounted = mountTestSynWareRuntime(runtime, "com.example.sheet-chrome-app");
    const context = createSynWareContextValue(mounted.runtime);
    const controller = await runtime.windows.openApplicationWindow("com.example.sheet-chrome-app");
    if (!controller) throw new Error("The systemSheet fixture window did not open.");
    expect(controller.record.chromeMode).toBe("system");
    expect(controller.record.smoothSurface).toEqual(defaultWindowSmoothSurface);
    mounted.dispose("test complete");
    await runtime.dispose("test complete");
    void context;
  });

  it("rejects the removed atmo manifest chrome instead of silently migrating it", () => {
    const manifest = createTestManifest({ bundleIdentifier: "com.example.chrome-migrate-app", window: { chrome: "atmo" as unknown as "system" } }) as SynCloudOSAppManifest;
    expect(() => normaliseAppInfo(manifest)).toThrow(/window\.chrome.*system, custom, or frameless/iu);
  });
});

describe("window chrome restoration back-compat", () => {
  it("preserves custom chrome and smooth surface across a schema-1 snapshot round-trip", async () => {
    const persistence = memoryPersistence();
    const first = createWindowTestDependencies({
      id: "runtime:chrome-first",
      namespace: "tests.chrome",
      installationId: "installation-chrome",
      persistence,
    });
    const source = first.manager.create(standardWindow("chrome-window", {
      chromeMode: "custom",
      smoothSurface: { radius: 3 },
    }));
    await first.manager.open(source.id);
    first.manager.saveRestorationSnapshot();
    await first.cleanup();

    const second = createWindowTestDependencies({
      id: "runtime:chrome-second",
      namespace: "tests.chrome",
      persistence,
    });
    const report = await second.manager.restorePersistedWorkspace();
    expect(report.failures).toEqual([]);
    expect(second.manager.select("chrome-window").record.chromeMode).toBe("custom");
    expect(second.manager.select("chrome-window").record.smoothSurface).toEqual({ radius: 3 });
    await second.cleanup();
  });

  it("restores legacy schema-1 snapshots without chrome fields as system chrome", async () => {
    const persistence = memoryPersistence();
    const first = createWindowTestDependencies({
      id: "runtime:chrome-legacy-first",
      namespace: "tests.chrome-legacy",
      installationId: "installation-chrome",
      persistence,
    });
    const source = first.manager.create(standardWindow("legacy-window", {
      chromeMode: "custom",
      smoothSurface: { radius: 3 },
    }));
    await first.manager.open(source.id);
    first.manager.saveRestorationSnapshot();
    await first.cleanup();

    // Simulate a schema-1 snapshot written before the chrome fields existed.
    const stored = persistence.values.get("windows.workspace-v1") as { windows: Array<Record<string, unknown>> };
    const legacy = JSON.parse(JSON.stringify(stored));
    for (const window of legacy.windows) {
      delete window.chromeMode;
      delete window.smoothSurface;
    }
    persistence.values.set("windows.workspace-v1", legacy);

    const second = createWindowTestDependencies({
      id: "runtime:chrome-legacy-second",
      namespace: "tests.chrome-legacy",
      persistence,
    });
    const report = await second.manager.restorePersistedWorkspace();
    expect(report.failures).toEqual([]);
    expect(second.manager.select("legacy-window").record.chromeMode).toBe("system");
    expect(second.manager.select("legacy-window").record.smoothSurface).toEqual(defaultWindowSmoothSurface);
    await second.cleanup();
  });
});
