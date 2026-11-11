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

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { appkitCounterpartFor } from "../../scripts/developer-mcp/lookup.mjs";

it("exposes the approved authorisation counterparts to SDK lookup without inventing a public TCC class", () => {
  const map = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  for (const name of [
    "ASAuthorization", "ASAuthorizationController", "ASAuthorizationControllerDelegate", "ASAuthorizationError",
    "ASAuthorizationPlatformPublicKeyCredentialProvider", "ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest",
    "ASAuthorizationPlatformPublicKeyCredentialAssertionRequest", "ASAuthorizationPlatformPublicKeyCredentialRegistration",
    "ASAuthorizationPlatformPublicKeyCredentialAssertion",
  ]) expect(appkitCounterpartFor(name, map)).toBe(name);
  expect(appkitCounterpartFor("SCAuthorization", map)).toBe("Authorization Services");
  expect(appkitCounterpartFor("PrivacyStore", map)).toMatchObject({ none: expect.stringContaining("private") });
  expect(map.members["SCAuthorization.copyRights"]).toBe("AuthorizationCopyRights");
  expect(map.members["LFXLocationManager.getAuthorizationStatus"]).toBe("CLLocationManager.authorizationStatus");
  expect(map.members["AUFXAudioSession.recordPermission"]).toBe("AVAudioSession.recordPermission");
});