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
it("accepts Info.ts entitlements as unique named capabilities", () => {
  const info = { bundleIdentifier: "com.example.entitled", version: "1.0.0", displayName: "Entitled", entitlements: ["location.read", "location.request"] };
  expect(validateSynWareManifest(info).ok).toBe(true);
  expect(validateSynWareManifest({ ...info, entitlements: ["location.read", "location.read"] }).ok).toBe(false);
  expect(validateSynWareManifest({ ...info, entitlements: ["invalid capability"] }).ok).toBe(false);
});

it("rejects the removed manifest permissions key", () => {
 expect(validateSynWareManifest({ bundleIdentifier:"com.example.old",displayName:"Old",version:"1.0.0",permissions:["location.read"] }).ok).toBe(false);
});
