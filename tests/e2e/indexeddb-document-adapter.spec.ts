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
import { randomUUID } from "node:crypto";

test("IndexedDB adapter survives reload and rejects a stale save", async ({ page }, testInfo) => {
  const database = `syncloudos-framework-documents-${testInfo.workerIndex}-${randomUUID()}`;
  const fixtureUrl = `/__framework-tests/documents/indexeddb?database=${encodeURIComponent(database)}`;
  try {
    await page.goto(fixtureUrl);
    await page.getByRole("button", { name: "Create durable note" }).click();
    await expect(page.getByTestId("saved-version")).toHaveText("1");
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Body" })).toHaveValue("Durable");
    await page.getByRole("button", { name: "Attempt stale save" }).click();
    await expect(page.getByRole("status")).toHaveText("A newer version is available");
    await expect(page.getByRole("textbox", { name: "Body" })).toHaveValue("Durable");
  } finally {
    await page.goto(fixtureUrl);
    await page.getByRole("button", { name: "Delete fixture database" }).click();
    await expect(page.getByRole("status")).toHaveText("Deleted");
  }
});
