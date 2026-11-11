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
import { createTestRuntime } from "./helpers";
import { builtInPreferencePanes } from "../../src/Webspring/builtInPreferencePanes";
it("owns an isolated privacy store and registers Privacy & Security", () => {
 const a=createTestRuntime(), b=createTestRuntime();
 const scope={userId:"public.anonymous",appId:"com.example.app",service:"location"};
 a.privacy.setAuthorization(scope,"denied");
 expect(a.privacy.forApplication(scope).authorizationStatus()).toBe("denied");
 expect(b.privacy.forApplication(scope).authorizationStatus()).toBe("prompt");
 expect(builtInPreferencePanes.some(pane=>pane.id==="privacy-security")).toBe(true);
});
