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

import { expect, test } from "playwright/test";

// Trace snapshot evaluations also grant user activation in Chromium. This
// activation contract needs an untouched browser state before the first probe.
test.use({ trace: "off" });

test("a private engine exports a settled snapshot with searchable PDF geometry and explicit print activation", async ({ page }) => {
  const errors: string[] = [], popups: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("popup", popup => popups.push(popup.url()));
  // Playwright function polling grants user activation. Observe the fixture's
  // completion before evaluating the page so its initial print probe stays native.
  const completed = page.waitForEvent("console", { predicate: message =>
    message.text() === "framework:custom-text-output:passed" || message.text() === "framework:custom-text-output:failed",
  });
  await Promise.all([completed, page.goto("/tests/e2e/fixtures/custom-text-output-browser.html")]);
  await page.waitForFunction(() => {
    const output = (window as typeof window & { customTextOutput?: { state: string } }).customTextOutput;
    return output?.state === "passed" || output?.state === "failed";
  });
  const state = await page.evaluate(() => (window as typeof window & { customTextOutput?: {
    state: string; error?: string; result?: Record<string, unknown>; printCalls: number; printStatus?: string; initialPrintActive?: boolean;
  } }).customTextOutput);
  expect(state?.state, state?.error ?? errors.join("\n")).toBe("passed");
  expect(errors).toEqual([]);
  expect(popups).toEqual([]);
  expect(state?.initialPrintActive).toBe(false);
  expect(state?.printStatus).toBe("prepared");
  expect(state?.printCalls).toBe(0);
  expect(state?.result).toMatchObject({
    revision: 12, readiness: "complete", pages: [{ width: 120, height: 100 }, { width: 72, height: 144, rotation: 90 }],
    pageViews: [[0, 0, 120, 100], [0, 0, 72, 144]], rotations: [0, 90],
    red: [255, 0, 0, 255], green: [0, 255, 0, 255], link: "https://example.test/output", fontReleases: 1, imageReleases: 1,
  });
  expect(state?.result?.extracted).toContain("office café");
  expect(state?.result?.extracted).not.toContain("later canonical edit");
  expect(state?.result?.operatorCount).toBeGreaterThan(20);
  await page.click("#request-print");
  const printing = await page.evaluate(() => (window as typeof window & { customTextOutput?: {
    printCalls: number; printStatus?: string; printActive?: boolean;
  } }).customTextOutput);
  expect(printing).toMatchObject({ printActive: true, printStatus: "dialog-requested", printCalls: 1 });
  expect(popups).toEqual([]);
});
