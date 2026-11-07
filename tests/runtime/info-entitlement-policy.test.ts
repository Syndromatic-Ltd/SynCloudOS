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
import { validateSynWareManifest } from "../../src/SynCloudOS/AppSDK/manifest/validateManifest";

it("accepts named role and launch entitlement requirements independently", () => {
  const manifest = { bundleIdentifier: "com.example.declarations", version: "1.0.0", displayName: "Declarations", entitlements: ["location.read"], runtime: { policy: { requiredRoles: ["operator"], requiredEntitlements: ["location.read"] } } };
  expect(validateSynWareManifest(manifest).ok).toBe(true);
  expect(validateSynWareManifest({ ...manifest, runtime: { policy: { requiredRoles: ["operator", "operator"] } } }).ok).toBe(false);
  expect(validateSynWareManifest({ ...manifest, runtime: { policy: { requiredEntitlements: ["location.read", "location.read"] } } }).ok).toBe(false);
});
