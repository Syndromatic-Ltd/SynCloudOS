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
import { defaultPolicyProfile } from "../../src/SynCloudOS/PolicyKit/defaultPolicyProfile";
import { projectRuntimeManifest } from "../../src/SynCloudOS/AppSDK/projectRuntimeManifest";

it("does not grant a site's founder identity authority in a generic host", () => {
  expect(defaultPolicyProfile.resolveRole({ isAuthorised: true, synId: "user@example.test", accessClass: "team" }, "founder")).toBe("authenticated");
  expect(defaultPolicyProfile.roles.authenticated).not.toContain("runtime.configure");
});

it("leaves application legal ownership to the host", () => {
  const manifest = { schemaVersion: 1 as const, bundleIdentifier: "org.example.app", version: "1.0.0", displayName: "Example" };
  const context = { appRoot: "./Example.app", packageName: "Example.app", path: "./Example.app/", componentKey: "Example" };
  expect(projectRuntimeManifest(manifest, context).about.copyright).toBe("");
  expect(projectRuntimeManifest(manifest, { ...context, about: { copyright: "Example Ltd", trademark: "Example" } }).about.copyright).toBe("Example Ltd");
});
