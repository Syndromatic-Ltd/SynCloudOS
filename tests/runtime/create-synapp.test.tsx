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

import React from "react";
import { expect, it } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK";
import { createTestRuntime } from "./helpers";

const Root = () => null;

it("validates and deeply freezes a declarative app definition", () => {
  const definition = createSynWare({
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.syndromatic.example",
      version: "1.0.0",
      displayName: "Example",
      commands: [{ id: "example.refresh", title: "Refresh" }],
    },
    root: Root,
  });

  expect(Object.isFrozen(definition)).toBe(true);
  expect(Object.isFrozen(definition.manifest)).toBe(true);
  expect(Object.isFrozen(definition.manifest.commands)).toBe(true);
  expect(definition).not.toHaveProperty("runtime");
  expect(definition).not.toHaveProperty("registration");
  expect(() => {
    (definition.manifest as { displayName: string }).displayName = "Changed";
  }).toThrow(TypeError);
});

it("rejects an invalid definition without registering globally", () => {
  expect(() => createSynWare({
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.syndromatic.invalid",
      version: "1.0.0",
      displayName: "Invalid",
      legacyShell: {},
    },
    root: Root,
  } as never)).toThrow(/manifest/i);
  expect(globalThis).not.toHaveProperty("__syncloudosSynWareRegistry");
});

it("creates separate registration bundles for two runtime sessions", () => {
  const definition = createSynWare({
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.syndromatic.two-sessions",
      version: "1.0.0",
      displayName: "Two Sessions",
      routes: [{ path: "/two-sessions", primary: true }],
    },
    root: Root,
  });
  const firstRuntime = createTestRuntime({ id: "runtime:synapp:first" });
  const secondRuntime = createTestRuntime({ id: "runtime:synapp:second" });

  const first = firstRuntime.apps.register(createSynWareBundle(definition));
  const second = secondRuntime.apps.register(createSynWareBundle(definition));

  expect(first?.bundleIdentifier).toBe("com.syndromatic.two-sessions");
  expect(second?.bundleIdentifier).toBe("com.syndromatic.two-sessions");
  expect(firstRuntime.apps.getApp(definition.manifest.bundleIdentifier)).not.toBe(secondRuntime.apps.getApp(definition.manifest.bundleIdentifier));
});

it("rejects accessor-backed definitions before validation can observe a different manifest", () => {
  const definition: Record<string, unknown> = { root: Root };
  let reads = 0;
  Object.defineProperty(definition, "manifest", {
    enumerable: true,
    get() {
      reads += 1;
      return {
        schemaVersion: 1,
        bundleIdentifier: reads === 1 ? "com.syndromatic.accessor-first" : "com.syndromatic.accessor-second",
        version: "1.0.0",
        displayName: "Accessor-backed declaration",
      };
    },
  });

  expect(() => createSynWare(definition as never)).toThrow(/data propert|accessor/i);
  expect(reads).toBe(0);
});

it("does not dereference accessor-backed direct registrations while reporting a boundary failure", () => {
  const runtime = createTestRuntime({ id: "runtime:synapp:unsafe-preflight" });
  const input: Record<string, unknown> = {};
  let reads = 0;
  Object.defineProperty(input, "manifest", {
    enumerable: true,
    get() {
      reads += 1;
      return { schemaVersion: 1, bundleIdentifier: "com.syndromatic.unsafe", version: "1.0.0", displayName: "Unsafe" };
    },
  });

  expect(runtime.apps.register(input as never)).toBeNull();
  expect(runtime.apps.preflight(input as never).ok).toBe(false);
  expect(reads).toBe(0);
});

it("keeps the complete V1 definition and declaration immutable through bundle registration", () => {
  const source = {
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.syndromatic.complete-declaration",
      version: "1.2.3",
      displayName: "Complete declaration",
      routes: [{ path: "/complete", title: "Complete", primary: true }],
      presentations: ["desktop", "tablet", "mobile"],
      minimumViewport: { width: 640, height: 480 },
      windowDefaults: { title: "Complete window", width: 900, height: 640, minimumWidth: 640, minimumHeight: 480, resizable: true, role: "panel" },
      documentTypes: [{ id: "com.syndromatic.complete-document", extensions: ["complete"], displayName: "Complete document" }],
      commands: [{ id: "com.syndromatic.complete.refresh", title: "Refresh", menu: "com.syndromatic.complete.menu", shortcut: "Cmd-R" }],
      menus: [{ id: "com.syndromatic.complete.menu", title: "Complete", commandIds: ["com.syndromatic.complete.refresh"] }],
      services: [{ id: "com.syndromatic.complete.service", required: true, minimumVersion: "1.0.0" }],
      permissions: ["clipboard.read"],
      appearances: [{ id: "com.syndromatic.complete.appearance", variant: "system" }],
      lifecycle: { preload: true, suspend: true, resume: true, terminate: true },
      background: { enabled: true, tasks: ["com.syndromatic.complete.refresh"] },
      migrationVersion: 2,
      webspring: { order: 12, icon: "/complete.png", visible: true, featured: true, defaultSelected: true },
    },
    root: Root,
    migrations: [{ fromVersion: 1, toVersion: 2, migrate: (value: unknown) => value }],
    createBackgroundHandler: () => ({ handle: () => undefined }),
  } as any;
  const definition = createSynWare(source);
  const bundle = createSynWareBundle(definition);
  const runtime = createTestRuntime({ id: "runtime:synapp:complete" });

  source.manifest.displayName = "Mutated author declaration";
  expect(definition).not.toBe(source);
  expect(definition.manifest.displayName).toBe("Complete declaration");
  expect(Object.isFrozen(definition.migrations)).toBe(true);
  expect(bundle.synWareDefinition).toBe(definition);
  expect(bundle.synWareManifest).toBe(definition.manifest);
  expect(runtime.apps.register(bundle)?.bundleIdentifier).toBe(definition.manifest.bundleIdentifier);
  expect(runtime.bundles.getBundle(definition.manifest.bundleIdentifier)?.synWareDefinition).toBe(definition);
  expect(runtime.bundles.getBundle(definition.manifest.bundleIdentifier)?.synWareManifest).toEqual(definition.manifest);
  expect(Object.isFrozen(runtime.bundles.getBundle(definition.manifest.bundleIdentifier)?.synWareManifest)).toBe(true);
});

it("rejects direct V1 registration that does not pass the shared schema", () => {
  const runtime = createTestRuntime({ id: "runtime:synapp:invalid-direct" });
  const malformed = {
    manifest: {
      schemaVersion: 1,
      bundleIdentifier: "com.syndromatic.invalid-direct",
      version: "1.0.0",
      displayName: "Invalid direct registration",
      retiredManifestKey: true,
    },
  };

  expect(() => runtime.apps.register(malformed as never)).not.toThrow();
  expect(runtime.apps.register(malformed as never)).toBeNull();
  expect(runtime.apps.getApp("com.syndromatic.invalid-direct")).toBeNull();
});
