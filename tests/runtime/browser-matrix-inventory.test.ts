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
import { discoverMatrixCases, assertMatrixProjectComplete, isFullMatrixInvocation } from "../../scripts/test-e2e-matrix.mjs";

describe("browser matrix inventory", () => {
  it("keeps ordinary option values inside the complete matrix gate while recognizing file filters", () => {
    expect(isFullMatrixInvocation(["--reporter", "line", "--workers", "1"])).toBe(true);
    expect(isFullMatrixInvocation(["--reporter=line", "--workers=1"])).toBe(true);
    expect(isFullMatrixInvocation(["--reporter", "line", "tests/e2e/example.spec.ts"])).toBe(false);
    expect(isFullMatrixInvocation(["--project", "chromium"])).toBe(false);
  });
  it("counts discovered tests by the selected project, including nested suites", () => {
    const inventory = discoverMatrixCases({ suites: [{ specs: [{ tests: [{ projectName: "chromium" }] }], suites: [{ specs: [{ tests: [{ projectName: "firefox" }, { projectName: "chromium" }, { projectName: "unselected" }] }] }] }] }, ["chromium", "firefox"]);
    expect([...inventory]).toEqual([["chromium", 2], ["firefox", 1]]);
  });
  it("fails closed when a selected engine has no discovered tests", () => {
    expect(() => discoverMatrixCases({ suites: [] }, ["chromium"])).toThrow("chromium");
  });
  it("rejects an incomplete successful-looking project summary", () => {
    expect(() => assertMatrixProjectComplete({ project: "chromium", passed: 1, skipped: 0, failed: 0 }, 2)).toThrow("expected 2");
    expect(() => assertMatrixProjectComplete({ project: "chromium", passed: 1, skipped: 1, failed: 0 }, 2)).not.toThrow();
  });
});
