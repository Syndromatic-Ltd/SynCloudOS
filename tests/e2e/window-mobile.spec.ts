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

const fixtureUrl = "/__framework-tests/windows/management?scenario=compact-bounds";

test("compact presentation respects safe areas and preserves desktop bounds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixtureUrl);
  const window = page.getByRole("dialog", { name: "Diagnostics" });
  await expect(window).toHaveAttribute("data-window-presentation", "mobile-fullscreen");
  await expect(window).toHaveCSS("inset-inline-start", "0px");
  const stored = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("framework-test:desktop-window-bounds") ?? "null"),
  );
  expect(stored).toEqual({ x: 80, y: 60, width: 720, height: 520 });
});

test("window geometry remains in CSS pixels across device pixel ratios", async ({ browser, baseURL }) => {
  const measure = async (deviceScaleFactor: number) => {
    const context = await browser.newContext({
      baseURL,
      deviceScaleFactor,
      viewport: { width: 1000, height: 760 },
    });
    try {
      const page = await context.newPage();
      await page.goto("/__framework-tests/windows/management?scenario=geometry");
      await expect(page.getByRole("dialog", { name: "Diagnostics" })).toBeVisible();
      return await page.locator('[data-window-host="diagnostics"]').boundingBox();
    } finally {
      await context.close();
    }
  };

  expect(await measure(2)).toEqual(await measure(1));
});
