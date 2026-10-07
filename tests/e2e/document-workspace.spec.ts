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

test("two documents save independently and dirty close requires review", async ({ page }) => {
  await page.goto("/__framework-tests/documents/workspace");
  await page.getByRole("button", { name: "New Note" }).click();
  await page.getByRole("textbox", { name: "Document title" }).fill("First");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "New Note" }).click();
  await page.getByRole("textbox", { name: "Document title" }).fill("Second");
  await page.getByRole("button", { name: "Close document" }).click();
  await expect(page.getByRole("dialog", { name: "Save changes to Second?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("textbox", { name: "Document title" })).toHaveValue("Second");
  await page.getByRole("tab", { name: "First" }).click();
  await expect(page.getByRole("textbox", { name: "Document title" })).toHaveValue("First");
});
