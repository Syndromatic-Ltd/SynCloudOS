/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from "vitest";
import { createCapturedError } from "../../src/SynCloudOS/ErrorManager/errorReport";

const capture = (error: unknown, code = "APP_CONTENT_FAILED") => createCapturedError(
  { code, title: "Minimak stopped unexpectedly.", message: "An unexpected error has prevented this application from working properly.", error, source: "SynCloudOS.AppWatchdog" },
  { id: "error-test", at: 1, timestamp: "2026-11-05T00:00:00.000Z" },
).technicalDetails ?? "";

const line = (details: string, label: string) => details.split("\n").find((text) => text.startsWith(`${label}: `));

describe("error report hints", () => {
  it("gives a known failure under a generic code its own hint and docs", () => {
    const details = capture(new Error("NSEMenuBar requires an NSEOverlayProvider."));
    expect(line(details, "Code")).toBe("Code: APP_CONTENT_FAILED");
    expect(line(details, "Hint")).toMatch(/needs the NSEOverlayProvider that every SynCloudOS window supplies/u);
    expect(line(details, "Docs")).toBe("Docs: docs/framework/nse/menus-toolbars-and-inspectors.md#responder-provenance-for-toolbars-and-menus");
  });

  it("recognises a known failure in the error's cause", () => {
    const details = capture(new Error("Launch failed", { cause: new TypeError("Failed to fetch dynamically imported module: /src/App.tsx") }), "APP_LAUNCH_FAILED");
    expect(line(details, "Hint")).toMatch(/could not load one of the app's modules/u);
  });

  it("keeps the code's own hint for an unrecognised message", () => {
    const details = capture(new TypeError("Cannot read properties of undefined (reading 'x')"));
    expect(line(details, "Hint")).toMatch(/^Hint: The Message line says what failed\./u);
    expect(line(details, "Docs")).toBe("Docs: docs/framework/synware-sdk.md");
  });
});
