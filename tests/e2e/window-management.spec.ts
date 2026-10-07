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

const fixtureUrl = "/__framework-tests/windows/management";

test("close, minimise and zoom remain distinct from return to Webspring", async ({ page }) => {
  await page.goto(`${fixtureUrl}?scenario=desktop`);
  const first = page.getByRole("dialog", { name: "Diagnostics A" });
  const second = page.getByRole("dialog", { name: "Diagnostics B" });

  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first).toHaveAttribute("data-window-id", "diagnostics-a");
  await expect(second).toHaveAttribute("data-window-id", "diagnostics-b");
  const firstBounds = await first.boundingBox();
  const secondBounds = await second.boundingBox();
  expect(firstBounds).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  expect(firstBounds).not.toEqual(secondBounds);

  await first.getByRole("button", { name: "Zoom Diagnostics A" }).click();
  await expect(first).toHaveAttribute("data-window-zoomed", "true");
  await first.getByRole("button", { name: "Minimise Diagnostics A" }).click();
  await expect(first).toBeHidden();
  await page.getByRole("button", { name: "Restore Diagnostics A" }).click();
  await expect(first).toBeVisible();
  await first.getByRole("button", { name: "Close Diagnostics A" }).click();
  await expect(first).toBeHidden();
  await expect(second).toBeVisible();
  expect(await second.boundingBox()).toEqual(secondBounds);
  await expect(page.getByRole("button", { name: "Return to Webspring" })).toBeVisible();
});

test("sheet and nested modal focus stays contained and restores through one inert owner", async ({ page }) => {
  await page.goto(`${fixtureUrl}?scenario=relationships`);
  const parent = page.locator('[data-window-id="memo"]');
  const parentTarget = parent.getByRole("button", { name: "Parent focus target" });
  await parentTarget.focus();
  await page.getByRole("button", { name: "Attach sheet" }).click();

  const sheet = page.getByRole("dialog", { name: "Save changes?" });
  await expect(parent).toHaveAttribute("inert", "");
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await sheet.getByRole("button", { name: "Finish sheet" }).focus();
  await page.keyboard.press("Tab");
  expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(sheet.getByRole("button", { name: "Finish sheet" })).toBeFocused();
  await sheet.getByRole("button", { name: "Finish sheet" }).click();
  await expect(sheet).toBeHidden();
  await expect(parentTarget).toBeFocused();

  await page.getByRole("button", { name: "Open modal" }).click();
  const modal = page.locator('[data-window-id="inspector-modal"]');
  await modal.getByRole("button", { name: "Open nested modal" }).click();
  const nested = page.getByRole("dialog", { name: "Nested inspector" });
  await expect(parent).toHaveAttribute("inert", "");
  await expect(modal).toHaveAttribute("inert", "");
  await nested.getByRole("button", { name: "Close nested modal" }).click();
  await expect(nested).toBeHidden();
  await expect(modal).not.toHaveAttribute("inert", "");
  await modal.getByRole("button", { name: "Close modal" }).click();

  await page.getByRole("button", { name: "Open popover" }).click();
  const popover = page.getByRole("dialog", { name: "Sharing options" });
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: "Copy link" }).focus();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();

  await page.getByRole("button", { name: "Open non-closable modal" }).click();
  const fixedModal = page.getByRole("dialog", { name: "Required decision" });
  await page.keyboard.press("Escape");
  await expect(fixedModal).toBeVisible();
});

test("panel activation separates key and main state", async ({ page }) => {
  await page.goto(`${fixtureUrl}?scenario=relationships`);
  await page.getByRole("button", { name: "Open inspector panel" }).click();
  const parent = page.getByRole("dialog", { name: "Memo" });
  const panel = page.getByRole("dialog", { name: "Inspector" });

  await expect(parent).toHaveAttribute("data-window-key", "false");
  await expect(parent).toHaveAttribute("data-window-main", "true");
  await expect(panel).toHaveAttribute("data-window-key", "true");
  await expect(panel).toHaveAttribute("data-window-main", "false");
});

test("pointer geometry remains reachable and controls do not begin a drag", async ({ page }) => {
  await page.goto(`${fixtureUrl}?scenario=geometry`);
  const dialog = page.getByRole("dialog", { name: "Diagnostics" });
  const host = page.locator('[data-window-host="diagnostics"]');
  const titleBar = dialog.locator("[data-window-titlebar]");
  const before = await host.boundingBox();
  const titleBounds = await titleBar.boundingBox();
  expect(before).not.toBeNull();
  expect(titleBounds).not.toBeNull();
  await page.mouse.move(titleBounds!.x + titleBounds!.width - 30, titleBounds!.y + 15);
  await page.mouse.down();
  await page.mouse.move(titleBounds!.x + titleBounds!.width + 90, titleBounds!.y + 65, { steps: 4 });
  await page.mouse.up();
  const moved = await host.boundingBox();
  expect(moved!.x).toBeGreaterThan(before!.x);
  expect(moved!.y).toBeGreaterThanOrEqual(0);

  const resize = dialog.locator('[data-window-resize-edge="block-end-inline-end"]');
  const resizeBounds = await resize.boundingBox();
  await page.mouse.move(resizeBounds!.x + 4, resizeBounds!.y + 4);
  await page.mouse.down();
  await page.mouse.move(moved!.x + 40, moved!.y + 40, { steps: 4 });
  await page.mouse.up();
  const constrained = await host.boundingBox();
  expect(constrained!.width).toBeGreaterThanOrEqual(280);
  expect(constrained!.height).toBeGreaterThanOrEqual(180);

  const leftBeforeControl = await host.evaluate((element) => (element as HTMLElement).style.left);
  await dialog.getByRole("button", { name: "Zoom Diagnostics" }).click();
  await expect(host).toHaveCSS("left", "0px");
  expect(leftBeforeControl).not.toBe("0px");
});

test("reduced motion and forced colours retain deterministic semantics", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(`${fixtureUrl}?scenario=geometry`);
  const dialog = page.getByRole("dialog", { name: "Diagnostics" });
  const close = dialog.getByRole("button", { name: "Close Diagnostics" });
  await close.focus();
  await expect(close).toBeFocused();
  expect(await close.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("2px");
  expect(await dialog.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
});
