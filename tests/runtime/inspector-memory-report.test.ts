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
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

describe("inspector memory report", () => {
  it("separates framework estimates from host-measured memory", async () => {
    const environment = createTestRuntimeEnvironment();
    Object.defineProperty(environment, "memory", {
      enumerable: true,
      value: { sample: async () => ({ source: "test", jsHeapUsedBytes: 12_345, jsHeapTotalBytes: 20_000, jsHeapLimitBytes: 1 << 30, userAgentSpecificBytes: null, domNodes: 42 }) },
    });
    const runtime = createTestRuntime({ environment });
    const report = await runtime.inspector.getMemoryReport();
    expect(report.host).toMatchObject({ source: "test", jsHeapUsedBytes: 12_345, domNodes: 42 });
    expect(report.framework.totals.estimatedBytes).toBeGreaterThanOrEqual(0);
    expect(report.jobs).toMatchObject({ active: 0 });
    expect(report.caches.length).toBeGreaterThanOrEqual(0);
    expect(report.interpretation).toMatch(/estimate/i);
  });

  it("reports unavailable host memory rather than inventing it", async () => {
    const runtime = createTestRuntime();
    const report = await runtime.inspector.getMemoryReport();
    expect(report.host).toBeNull();
  });
});
