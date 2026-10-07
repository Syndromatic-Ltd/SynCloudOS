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

import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";

let browser: Browser;
let script: string, renderer: string;
beforeAll(async () => {
  // Only transpile the owned module and installed renderer in memory: no server or package build.
  const source = readFileSync("src/NSE/Graphics/snapshotNSEView.ts", "utf8")
    .replace('import("@zumer/snapdom")', "Promise.resolve(window.SnapshotRenderer)");
  script = transformSync(source, { loader: "ts", format: "iife", globalName: "SnapshotView" }).code;
  renderer = transformSync(readFileSync("node_modules/@zumer/snapdom/dist/snapdom.mjs", "utf8"), {
    format: "iife", globalName: "SnapshotRenderer",
  }).code;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); });

async function fixture(styles: { zoom?: number; ancestorZoom?: number; outerScale?: number; rootScale?: number } = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>
    body { margin: 0; }
    #parent { zoom: ${styles.ancestorZoom ?? 1}; transform: scale(${styles.outerScale ?? 1}); transform-origin: top left; }
    #page { position: relative; box-sizing: border-box; width: 808px; height: 1046px;
      zoom: ${styles.zoom ?? 1}; transform: scale(${styles.rootScale ?? 1}); transform-origin: top left; background: white; }
    #right { position: absolute; right: 0; top: 0; width: 24px; height: 100%; background: rgb(255, 0, 0); }
    #inside { position: absolute; top: 100px; left: 100px; width: 20px; height: 20px;
      transform: translateX(20px); background: rgb(0, 0, 255); }
  </style><div id="parent"><div id="page" style="zoom:${styles.zoom ?? 1};transform:scale(${styles.rootScale ?? 1})"><div id="right"></div><div id="inside"></div></div></div>`);
  await page.addScriptTag({ content: renderer }); await page.addScriptTag({ content: script });
  return page;
}

async function capture(page: Page, { half = false, scale = 1, exclude = false } = {}) {
  return page.evaluate(async ({ half, scale, exclude }) => {
    const scope = window as typeof window & { SnapshotView: typeof import("../../src/NSE/Graphics/snapshotNSEView") };
    const source = document.querySelector<HTMLElement>("#page")!;
    const bounds = source.getBoundingClientRect(), before = source.outerHTML;
    const url = await scope.SnapshotView.snapshotNSEView(source, { scale,
      // Caller geometry is measured on screen, including the app's entry transform.
      region: half ? { x: bounds.width / 2, y: 0, width: bounds.width / 2, height: bounds.height / 2 }
        : { x: 0, y: 0, width: bounds.width, height: bounds.height },
      ...(exclude ? { exclude: ["#right"] } : {}),
    });
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const right = [...context.getImageData(image.width - 5, 10, 1, 1).data];
    return { width: image.width, height: image.height, right, unchanged: before === source.outerHTML,
      bounds: { width: bounds.width, height: bounds.height } };
  }, { half, scale, exclude });
}

it.each([1.23267, 0.75])("captures the entire right edge at CSS zoom %s", async zoom => {
  const page = await fixture({ zoom });
  try {
    const result = await capture(page);
    expect(result).toMatchObject({ width: Math.round(808 * zoom), height: Math.round(1046 * zoom), right: [255, 0, 0, 255], unchanged: true });
  } finally { await page.close(); }
});

it.each(["ancestor", "root"] as const)("ignores %s entry scaling without shrinking or clipping the source", async location => {
  const page = await fixture({ zoom: 1.23267, [location === "ancestor" ? "outerScale" : "rootScale"]: 0.05 });
  try {
    const result = await capture(page);
    expect(result.bounds.width).toBeLessThan(50);
    expect(result).toMatchObject({ width: Math.round(808 * 1.23267), height: Math.round(1046 * 1.23267), right: [255, 0, 0, 255], unchanged: true });
  } finally { await page.close(); }
});

it("retains ancestor zoom and maps a cropped screen region through entry scaling at DPR 2", async () => {
  const page = await fixture({ ancestorZoom: 1.25, zoom: 0.8, outerScale: 0.05 });
  try {
    const result = await capture(page, { half: true, scale: 2 });
    expect(result).toMatchObject({ width: 808, height: 1046, right: [255, 0, 0, 255], unchanged: true });
  } finally { await page.close(); }
});

it("preserves descendant transforms and source bounds while excluding requested content", async () => {
  const page = await fixture({ zoom: 1.25 });
  try {
    const result = await capture(page, { exclude: true });
    expect(result).toMatchObject({ width: 1010, height: 1308, right: [255, 255, 255, 255], unchanged: true });
    const blue = await page.evaluate(async () => {
      const scope = window as typeof window & { SnapshotView: typeof import("../../src/NSE/Graphics/snapshotNSEView") };
      const image = new Image(); image.src = await scope.SnapshotView.snapshotNSEView(document.querySelector("#page")!, { scale: 1 });
      await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
      return [...context.getImageData(160, 135, 1, 1).data];
    });
    expect(blue).toEqual([0, 0, 255, 255]);
  } finally { await page.close(); }
});

it("captures a translated reflection card without blank padding while retaining the scaled face", async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>("#page")!;
      card.style.cssText = "position:absolute;left:50%;top:50%;width:400px;height:600px;transform:translate(-50%, -50%);overflow:hidden";
      card.innerHTML = '<div style="width:800px;height:1200px;transform:scale(.5);transform-origin:0 0;background:rgb(0,255,0);position:relative"><div style="position:absolute;right:0;top:0;width:32px;height:100%;background:red"></div></div>';
    });
    const result = await capture(page);
    expect(result).toMatchObject({ width: 400, height: 600, right: [255, 0, 0, 255], unchanged: true });
    const corners = await page.evaluate(async () => {
      const scope = window as typeof window & { SnapshotView: typeof import("../../src/NSE/Graphics/snapshotNSEView") };
      const image = new Image(); image.src = await scope.SnapshotView.snapshotNSEView(document.querySelector("#page")!, { scale: 1 });
      await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
      return [[5, 5], [5, 595], [395, 595]].map(([x, y]) => [...context.getImageData(x!, y!, 1, 1).data]);
    });
    expect(corners).toEqual([[0, 255, 0, 255], [0, 255, 0, 255], [255, 0, 0, 255]]);
  } finally { await page.close(); }
});
