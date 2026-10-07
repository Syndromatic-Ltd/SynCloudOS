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
import { createTestRuntime, createRuntimeHarness } from "./helpers";
import { createAssetLoadFailedError, createGlobalScriptError, createUnhandledPromiseRejectionError, toTechnicalReport } from "../../src/SynCloudOS/ErrorManager/ErrorManager";

describe("ErrorManager expanded factories", () => {
  it("captures global script errors with browser and source diagnostics", async () => {
    const runtime = createTestRuntime();
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(runtime);

    const captured = createGlobalScriptError(SynCloudOS.ErrorManager, new Error("Global boom"), {
      colno: 9,
      filename: "http://127.0.0.1:5173/src/main.tsx",
      lineno: 12
    }, runtime.environment.browser);

    expect(captured).toMatchObject({
      category: "watchdog",
      code: "GLOBAL_SCRIPT_ERROR",
      recoverable: false,
      severity: "fatal",
      suggestedActions: ["reload"]
    });
    expect(captured.context).toMatchObject({
      eventType: "error",
      filename: "http://127.0.0.1:5173/src/main.tsx",
      watchdog: "SynCloudOS GlobalWatchdog"
    });
    expect(RuntimeController.getSnapshot().errors.at(-1)?.id).toBe(captured.id);
  });

  it("captures unhandled promise rejections and primitive reasons", async () => {
    const runtime = createTestRuntime();
    const { SynCloudOS } = createRuntimeHarness(runtime);

    const captured = createUnhandledPromiseRejectionError(SynCloudOS.ErrorManager, "async primitive failure", {}, runtime.environment.browser);

    expect(captured).toMatchObject({
      category: "watchdog",
      code: "UNHANDLED_PROMISE_REJECTION",
      technicalMessage: "async primitive failure"
    });
    expect(captured.context?.eventType).toBe("unhandledrejection");
  });

  it("captures asset load failures as recoverable resource reports", async () => {
    const runtime = createTestRuntime();
    const { SynCloudOS } = createRuntimeHarness(runtime);

    const captured = createAssetLoadFailedError(SynCloudOS.ErrorManager, {
      currentSrc: "/assets/missing-icon.png",
      tagName: "IMG"
    }, {}, runtime.environment.browser);

    expect(captured).toMatchObject({
      category: "resource",
      code: "ASSET_LOAD_FAILED",
      recoverable: true,
      severity: "warning",
      suggestedActions: ["dismiss"]
    });
    expect(captured.context).toMatchObject({
      resourceTag: "img",
      resourceUrl: "/assets/missing-icon.png"
    });
  });

  it("dedupes repeated global reports with the same fingerprint", async () => {
    const runtime = createTestRuntime();
    const { RuntimeController, SynCloudOS } = createRuntimeHarness(runtime);

    const first = createGlobalScriptError(SynCloudOS.ErrorManager, new Error("Repeated global error"), {
      filename: "same.js",
      lineno: 1,
      colno: 2
    }, runtime.environment.browser);
    const second = createGlobalScriptError(SynCloudOS.ErrorManager, new Error("Repeated global error"), {
      filename: "same.js",
      lineno: 1,
      colno: 2
    }, runtime.environment.browser);

    expect(second.id).toBe(first.id);
    expect(RuntimeController.getSnapshot().errors.filter((error) => error.code === "GLOBAL_SCRIPT_ERROR")).toHaveLength(1);
  });

  it("technical reports include watchdog, event, browser, and source context", async () => {
    const runtime = createTestRuntime();
    const { SynCloudOS } = createRuntimeHarness(runtime);

    const captured = createGlobalScriptError(SynCloudOS.ErrorManager, new Error("Report context"), {
      colno: 4,
      eventType: "error",
      filename: "report.js",
      lineno: 3
    }, runtime.environment.browser);
    const report = toTechnicalReport(captured);

    expect(report).toContain("Watchdog: SynCloudOS GlobalWatchdog");
    expect(report).toContain("Event type: error");
    expect(report).toContain("Browser URL: http://127.0.0.1:5173/");
    expect(report).toContain("Source location: report.js:3:4");
  });
});
