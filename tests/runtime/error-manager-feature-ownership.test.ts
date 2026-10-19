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
import { createRuntimeHarness, createTestRuntime } from "./helpers";

describe("generic unavailable framework features", () => {
  it.each(["sampleFeature", "userInfoContextMenu"])("does not invent a site-specific error for %s", featureId => {
    const { SynCloudOS } = createRuntimeHarness(createTestRuntime());
    const error = SynCloudOS.ErrorManager.createFeatureNotImplementedError(featureId);
    expect(error).toMatchObject({
      code: "FEATURE_NOT_IMPLEMENTED", category: "runtime",
      title: "That feature is not available yet.", context: { featureId, implementationStatus: "notImplemented" },
    });
    expect(error.technicalDetails).toContain(`Detail: SynCloudOS attempted to present "${featureId}", but no implementation is registered.`);
    expect(error).not.toHaveProperty("exception");
    expect(error.context).not.toHaveProperty("stackHint");
    expect(SynCloudOS.ErrorManager.toTechnicalReport(error)).toContain("Code: FEATURE_NOT_IMPLEMENTED\nMessage: SynCloudOS received the system action");
  });
});
