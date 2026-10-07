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
import * as auth from "../../src/SynCloudOS/Authentication";

it("exports Google provider presentation through the public authentication entry", () => {
  expect(auth).toHaveProperty("googleAuthenticationMethod");
  const method = (auth as unknown as {
    googleAuthenticationMethod: { id: string; iconUrl: string };
  }).googleAuthenticationMethod;
  expect(method.id).toBe("google");
  expect(typeof method.iconUrl).toBe("string");
  expect(method.iconUrl.trim().length).toBeGreaterThan(0);
});
