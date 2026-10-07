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

import { describe, expect, it } from "vitest";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createTestRuntimeEnvironment } from "./helpers";

describe("generic runtime composition", () => {
  it("does not invent product bundles, descriptors, grants, seeds, or notifications", async () => {
    const runtime = createSynCloudOS({
      id: "runtime:generic-omission",
      environment: createTestRuntimeEnvironment(),
    });
    try {
      expect(runtime.bundles.getBundles()).toEqual([]);

      const serviceIds = runtime.services.getServices().map((service) => service.id);
      expect(serviceIds).toEqual(expect.arrayContaining(["webspring", "routing", "windowing", "notifications"]));
      expect(serviceIds).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/journal|syncal|leather|portfolio/iu),
      ]));

      const employeeCapabilities = runtime.policy.getRoleCapabilities("employee");
      expect(employeeCapabilities).not.toEqual(expect.arrayContaining([
        expect.stringMatching(/journal|syncal|leather|portfolio/iu),
      ]));

      await runtime.boot({ initialPathname: "/" });
      expect(runtime.notifications.getHistory()).toEqual([]);
      expect(runtime.webspring.getSnapshot()).toMatchObject({
        selectedAppId: null,
        hoveredAppId: null,
      });
    } finally {
      await runtime.dispose("generic runtime omission coverage");
    }
  });
});
