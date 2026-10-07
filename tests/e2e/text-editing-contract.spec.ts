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
test("HTML paste shares canonical content and undo history", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/text-editing-contract.html");
  const first = page.getByRole("textbox", { name: "First text view" });
  const second = page.getByRole("textbox", { name: "Second text view" });
  const before = await page.locator("#canonical").textContent();
  await first.click();
  await first.press("ControlOrMeta+End");
  const paste = await first.evaluate(node => {
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    // Populate the actual event transfer: Firefox does not retain the
    // clipboard contents supplied through the constructor input.
    const clipboardData = event.clipboardData;
    if (!clipboardData) throw new Error("The browser did not create a clipboard transfer.");
    clipboardData.setData("text/html", '<p><strong>Pasted café</strong><img src="invalid-paste-image" onerror="window.__pasteExecuted=true"></p>');
    clipboardData.setData("text/plain", "Pasted café");
    const html = event.clipboardData?.getData("text/html");
    const plain = event.clipboardData?.getData("text/plain");
    node.dispatchEvent(event);
    return { html, plain, prevented: event.defaultPrevented };
  });
  expect(paste.html).toContain("<strong>Pasted café</strong>");
  expect(paste.plain).toBe("Pasted café");
  expect(paste.prevented).toBe(true);
  await expect(page.locator("#canonical")).toContainText("Pasted café");
  await expect(second).toContainText("Pasted café");
  await expect(first.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __pasteExecuted?: boolean }).__pasteExecuted)).toBeUndefined();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#canonical")).toHaveText(before!);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(second).toContainText("Pasted café");
  await expect(page.locator("#error")).toHaveText("");
});

test("native typing, multiline editing and shared canonical history", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/text-editing-contract.html");
  const first = page.getByRole("textbox", { name: "First text view" });
  const second = page.getByRole("textbox", { name: "Second text view" });
  await first.click(); await first.press("ControlOrMeta+End"); await first.press("Enter"); await first.pressSequentially("Typed café");
  await expect(page.locator("#canonical")).toContainText("\nTyped café");
  await expect(second).toContainText("Typed café");
  await page.getByRole("button", { name: "Format first word" }).click();
  await expect(first.locator("span").first()).toHaveCSS("font-weight", "700");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(first.locator("span").first()).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(first.locator("span").first()).toHaveCSS("font-weight", "700");
  await expect(page.locator("#error")).toHaveText("");
});
test("read-only view keeps its semantic projection and refuses native changes", async ({ page }) => {
  await page.goto("/tests/e2e/fixtures/text-editing-contract.html");
  const text = await page.locator("#canonical").textContent();
  await page.getByRole("button", { name: "Toggle read only" }).click();
  const first = page.getByRole("textbox", { name: "First text view" });
  await expect(first).toHaveAttribute("aria-readonly", "true");
  await expect(first).toHaveAttribute("contenteditable", "false");
  await first.click(); await page.keyboard.type("cannot enter");
  await expect(page.locator("#canonical")).toHaveText(text!);
});
