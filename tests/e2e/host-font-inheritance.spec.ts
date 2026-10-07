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

import { test, expect } from "playwright/test";

test("early UI role survives later runtime CSS and reaches root, body and chrome",async({page})=>{
  await page.goto("/tests/e2e/fixtures/host-font-inheritance.html?root-role");
  const elements=[page.locator("html"),page.locator("body"),page.locator(".nse-app-topbar-metal-title"),page.getByRole("button",{name:"Host button",exact:true})];
  for(const element of elements)await expect(element).toHaveCSS("font-family","monospace");
  await page.evaluate(()=>document.documentElement.style.setProperty("--font-ui","serif"));
  for(const element of elements)await expect(element).toHaveCSS("font-family","serif");
  await page.getByRole("button",{name:"Host button",exact:true}).click();
  await expect(page.getByLabel("Clicks")).toHaveText("1");
});

test("framework chrome inherits supplied host typography and remains interactive", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const fontRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\.(woff2?|ttf|otf)(?:\?|$)/.test(request.url())) fontRequests.push(request.url()); });
  await page.goto("/tests/e2e/fixtures/host-font-inheritance.html");
  const title = page.locator(".nse-app-topbar-metal-title");
  const button = page.getByRole("button", { name: "Host button", exact: true });
  await expect(title).toHaveCSS("font-family", "monospace");
  await expect(button).toHaveCSS("font-family", "monospace");
  await button.click();
  await expect(page.getByLabel("Clicks")).toHaveText("1");
  await page.screenshot({ path: testInfo.outputPath("host-monospace.png") });
  await page.getByRole("button", { name: "Change host font", exact: true }).click();
  await expect(title).toHaveCSS("font-family", "serif");
  await expect(button).toHaveCSS("font-family", "serif");
  await button.click();
  await expect(page.getByLabel("Clicks")).toHaveText("2");
  await page.screenshot({ path: testInfo.outputPath("host-serif.png") });
  expect(errors).toEqual([]);
  expect(fontRequests).toEqual([]);
});
