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

import { expect, it } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { projectRuntimeManifest } from "../../src/SynCloudOS/AppSDK/projectRuntimeManifest";
import { createTestManifest, createTestRuntime } from "./helpers";

it("captures a frozen copy of explicit legacy bundle entitlements and adds no implicit access grant", () => {
  const runtime = createTestRuntime();
  const entitlements = ["location.read"];
  const captured = runtime.bundles.createBundle({ manifest: createTestManifest(), entitlements });
  entitlements.push("camera");
  expect(captured.entitlements).toEqual(["location.read"]);
  expect(Object.isFrozen(captured.entitlements)).toBe(true);
  expect(runtime.bundles.createBundle(createTestManifest()).entitlements).toEqual([]);
});
it("takes canonical Info entitlements rather than additional host bundle declarations", () => {
  const runtime = createTestRuntime();
  const definition = createSynWare({ manifest: { bundleIdentifier: "com.example.entitlements", version: "1.0.0", displayName: "Entitlements", entitlements: ["location.read"] }, root: () => null });
  const captured = runtime.bundles.createBundle({ ...createSynWareBundle(definition), entitlements: ["video.capture.camera"] });
  expect(captured.entitlements).toEqual(["location.read"]);
  expect(Object.isFrozen(captured.entitlements)).toBe(true);
});
it("projects site access and app type only from explicit runtime declarations", () => {
  const context = { appRoot: "./Entitled.app", packageName: "Entitled.app", path: "./Entitled.app", componentKey: "Entitled" };
  const manifest = { schemaVersion: 1 as const, bundleIdentifier: "com.example.entitled", version: "1.0.0", displayName: "Entitled", entitlements: ["app.open.public", "diagnostics.view"] };
  expect(projectRuntimeManifest(manifest, context)).toMatchObject({ type: "internal" });
  expect(projectRuntimeManifest(manifest, context).policy).toBeUndefined();
  const explicit = { ...manifest, runtime: { type: "system" as const, policy: { public: true, requiredRoles: ["operator"], requiredEntitlements: ["diagnostics.view"] } } };
  expect(projectRuntimeManifest(explicit, context)).toMatchObject({ type: "system", policy: { public: true, requiredRoles: ["operator"], requiredEntitlements: ["diagnostics.view"] } });
});
