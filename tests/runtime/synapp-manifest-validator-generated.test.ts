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

import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../src/SynCloudOS/AppSDK/manifest/synapp-manifest.schema.json";
import { validate } from "../../src/SynCloudOS/AppSDK/manifest/synappManifestValidator.generated.mjs";


it("keeps the precompiled manifest validator current with the schema", () => {
  // Throws, with the regeneration command in its output, when stale.
  execFileSync(process.execPath, ["scripts/synware/gen-manifest-validator.mjs", "--check"], { stdio: "pipe" });
});

it("validates exactly as a runtime compile of the schema with the same options", () => {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: false, strict: true, validateFormats: true });
  addFormats(ajv);
  const compiled = ajv.compile(schema);
  const base = { schemaVersion: 1, bundleIdentifier: "com.syndromatic.example", version: "1.0.0", displayName: "Example" };
  const cases: unknown[] = [
    { schemaVersion: 1, bundleIdentifier: "com.example.fixture.window", version: "2.0.0", displayName: "Window fixture", runtime: { presentation: "windowedView" }, permissions: ["diagnostics.view"] },
    { schemaVersion: 1, bundleIdentifier: "com.example.fixture.routes", version: "1.2.3", displayName: "Routes fixture", routes: [{ path: "/fixture", primary: true }], services: [{ id: "catalogue", required: true }] },
    base,
    { ...base, bundleIdentifier: "Com.Example.Mixed-Case42" },
    { ...base, bundleIdentifier: "example.notes" },
    { ...base, bundleIdentifier: "com.example.bad_name" },
    { ...base, bundleIdentifier: undefined },
    { ...base, displayName: undefined },
    { ...base, version: undefined },
    {},
    { ...base, version: "one" },
    { ...base, unknownKey: true },
    { ...base, presentations: ["desktop", "desktop"] },
    { ...base, routes: [{ path: "relative" }, { title: 3 }] },
    { ...base, frame: { layout: "nope", material: 1 } },
    { ...base, webspring: { order: -1, icon: 7 } },
    { ...base, localeResources: { base: "", bundles: [{ locale: "x", path: 1 }] } },
    { ...base, displayName: "" },
  ];
  for (const value of cases) {
    const copy = structuredClone(value);
    const expected = compiled(copy);
    expect(validate(structuredClone(value))).toBe(expected);
    expect(validate.errors ?? null).toEqual(compiled.errors ?? null);
  }
});
