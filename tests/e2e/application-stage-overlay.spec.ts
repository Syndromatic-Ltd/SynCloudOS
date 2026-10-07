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

import { expect, test, type Page } from "playwright/test";
import sharp from "sharp";

const url = "/tests/e2e/fixtures/application-stage-overlay.html";
const destination = ".webspring-app-overlay-destination";
const plane = ".webspring-app-overlay-plane";
const frame = ".webspring-app-view-frame";
const surface = ".webspring-app-view-surface";

async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url + query);
  await page.waitForFunction(() => (window as any).stageOverlayFixture && document.querySelector("#portal-action"));
  expect(errors).toEqual([]);
}

async function comparePoses(page: Page) {
  return page.evaluate(({ destination, plane, frame, surface }) => {
    const pose = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      return { transform: style.transform, opacity: style.opacity, filter: style.filter };
    };
    return { destination: pose(destination), plane: pose(plane), frame: pose(frame), surface: pose(surface) };
  }, { destination, plane, frame, surface });
}

async function topPixel(page: Page) {
  const png = await page.screenshot({ clip: { x: 20, y: 20, width: 1, height: 1 } });
  return Array.from(await sharp(png).ensureAlpha().raw().toBuffer());
}

test("staged portals do not paint or receive clicks, and reveal beyond the frame clip", async ({ page }) => {
  await open(page, "?staged=true");
  await expect(page.locator("#portal-action")).toBeHidden();
  expect(await topPixel(page)).toEqual([11, 13, 17, 255]);
  expect(await page.evaluate(() => !!document.elementFromPoint(20, 20)?.closest("[data-viewport-overlay]"))).toBe(false);
  await page.mouse.click(20, 20);
  expect(await page.evaluate(() => (window as any).stageOverlayFixture.clicks())).toBe(0);
  await page.evaluate(() => (window as any).stageOverlayFixture.setStaged(false));
  await expect(page.locator("#portal-action")).toBeVisible();
  // An empty animation list can precede React's reveal commit. Wait for the
  // actual viewport target so this click still proves escape from frame clipping.
  await expect.poll(() => page.evaluate(() => !!document.elementFromPoint(20, 20)?.closest("#portal-action"))).toBe(true);
  await page.mouse.click(20, 20);
  expect(await page.evaluate(() => (window as any).stageOverlayFixture.clicks())).toBe(1);
});

test("outgoing portals follow both stage planes and cannot override disabled pointer input", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).stageOverlayFixture.setRole("outgoing"));
  await page.waitForFunction(() => document.querySelector('[data-multiswitch-role="outgoing"]'));
  await page.evaluate(() => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 360; } });
  const poses = await comparePoses(page);
  expect(poses.destination).toEqual(poses.frame);
  expect(poses.plane).toEqual(poses.surface);
  // Check input while the outgoing overlay is still visibly on screen;
  // an offscreen endpoint alone could pass through geometry rather than inertness.
  await page.evaluate(() => { for (const animation of document.getAnimations()) animation.currentTime = 0; });
  expect(await topPixel(page)).toEqual([239, 45, 101, 255]);
  expect(await page.evaluate(() => !!document.elementFromPoint(20, 20)?.closest("[data-viewport-overlay]"))).toBe(false);
  await expect(page.locator(destination)).toHaveAttribute("inert", "");
  await page.mouse.click(20, 20);
  expect(await page.evaluate(() => (window as any).stageOverlayFixture.clicks())).toBe(0);
});

test("ordinary exits animate portaled content with its owner and settle once", async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).stageOverlayFixture.setShown(false));
  await page.waitForFunction(() => document.getAnimations().some(animation => animation.effect?.getTiming().fill === "forwards"));
  await page.evaluate(() => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 240; } });
  const poses = await comparePoses(page);
  expect(poses.destination).toEqual(poses.frame);
  expect(poses.plane).toEqual(poses.surface);
  await expect(page.locator(destination)).toHaveAttribute("inert", "");
  expect(await page.evaluate(() => (window as any).stageOverlayFixture.exits())).toBe(0);
  await page.evaluate(() => { for (const animation of document.getAnimations()) animation.finish(); });
  await expect(page.locator(destination)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).stageOverlayFixture.exits())).toBe(1);
});

test("content-owned portals remain fullscreen without host motion and remove once", async ({ page }) => {
  await open(page, "?motion=content");
  const overlay = page.locator("[data-viewport-overlay]");
  expect(await overlay.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
  expect(await page.evaluate(() => !!document.elementFromPoint(20, 20)?.closest("[data-viewport-overlay]"))).toBe(true);
  expect(await page.evaluate(() => document.querySelector("[data-viewport-overlay]")!.closest(".webspring-app-view-frame"))).toBeNull();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.evaluate(() => (window as any).stageOverlayFixture.setShown(false));
  await expect(page.locator(destination)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).stageOverlayFixture.exits())).toBe(1);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
